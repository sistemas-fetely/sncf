/**
 * TELA 2 — Contabilidade > Pacote do Contador.
 *
 * Backend pronto: vw_contabil_competencias, fn_contabil_posicao,
 * vw_contabil_vendas_periodo, vw_contabil_nfs_periodo, vw_contabil_remessas
 * e a edge function gerar-pacote-contabil. Esta tela apenas CONSOME.
 *
 * REGRA DURA: só competência fechada gera pacote.
 * FAIL-LOUD: upload e chamada de função com await; erro real vai pro toast.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileSpreadsheet, Download, Package, AlertTriangle } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageTitle } from "@/components/layout/PageTitle";
import { TabelaFetely } from "@/components/ui/tabela-fetely";
import { Selo, type EstadoSelo } from "@/components/ui/selo";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { rawMessage } from "@/lib/format-error";
import { useNivel } from "@/hooks/useNivel";

/* ────────────────────────────── tipos ────────────────────────────── */

type StatusComp = "aberto" | "fechado" | "reaberto";

interface Competencia {
  competencia: string;
  rotulo: string;
  status: StatusComp;
  unidades: number;
  valor_custo: number;
  skus: number;
}

interface LinhaPosicao {
  sku: string;
  produto: string | null;
  centro: string | null;
  quantidade: number;
  custo_unitario: number;
  valor_total: number;
}

interface LinhaVenda {
  competencia: string;
  pedido: string | null;
  data: string | null;
  cliente: string | null;
  cnpj: string | null;
  canal: string | null;
  nfs: number | null;
  numeros_nf: string | null;
  unidades: number;
  receita_produto: number;
  receita_frete: number;
  receita_total: number;
  cmv: number;
  margem_bruta: number;
}

interface LinhaNf {
  competencia: string;
  data: string | null;
  numero: string | null;
  serie: string | null;
  cliente: string | null;
  cnpj: string | null;
  uf: string | null;
  cidade: string | null;
  canal: string | null;
  cfops: string | null;
  pedido: string | null;
  unidades: number;
  receita_produto: number;
  receita_frete: number;
  receita_total: number;
  icms: number;
  cmv: number;
}

interface ParteRemessa {
  indice: number;
  path: string;
  bytes: number;
  arquivos: number;
  link?: string | null;
  link_expira_em?: string | null;
}

interface Remessa {
  id: string;
  competencia: string | null;
  rotulo: string | null;
  enviada_em: string | null;
  destinatarios: string[] | null;
  unidades: number | null;
  valor_custo: number | null;
  link_signed: string | null;
  link_expira_em: string | null;
  link_expirado: boolean | null;
  observacao: string | null;
  versao: number | null;
  status: "gerando" | "pronto" | "erro" | null;
  progresso: ProgressoRemessa | null;
  erro_mensagem: string | null;
  partes: ParteRemessa[] | null;
  manifesto: { faltantes?: unknown[]; total_arquivos?: number } | null;
  gerado_em: string | null;
  gerado_por_nome: string | null;
}

const fmtMB = (b: number) => `${(b / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

/* ───────────────────────────── formato ───────────────────────────── */

const fmtDinheiro = (v: number | null | undefined) =>
  `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtUn = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const fmtData = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

const fmtDataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const SELO_STATUS: Record<StatusComp, { estado: EstadoSelo; texto: string }> = {
  fechado: { estado: "success", texto: "Fechado" },
  aberto: { estado: "info", texto: "Aberto" },
  reaberto: { estado: "warning", texto: "Reaberto" },
};

const num = (v: unknown) => Number(v || 0);
const soma = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((a, x) => a + num(f(x)), 0);
const dataXlsx = (iso: string | null | undefined) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

/* ────────────────────────────── tela ─────────────────────────────── */

export default function PacoteContador() {
  const qc = useQueryClient();
  const { temNivel } = useNivel();
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [destinatarios, setDestinatarios] = useState("");
  const [observacao, setObservacao] = useState("");
  const [buscaHist, setBuscaHist] = useState("");

  const competencias = useQuery({
    queryKey: ["contabil-competencias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_contabil_competencias")
        .select("*")
        .order("competencia", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Competencia[];
    },
  });

  // Seleção inicial: a competência fechada mais recente (fallback: a mais recente).
  useEffect(() => {
    if (selecionada || !competencias.data?.length) return;
    const fechada = competencias.data.find((c) => c.status === "fechado");
    setSelecionada((fechada ?? competencias.data[0]).competencia);
  }, [competencias.data, selecionada]);

  const comp = competencias.data?.find((c) => c.competencia === selecionada) ?? null;
  const fechada = comp?.status === "fechado";

  const posicao = useQuery({
    queryKey: ["contabil-posicao", selecionada],
    enabled: !!selecionada,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_contabil_posicao", { p_competencia: selecionada! });
      if (error) throw error;
      return (data ?? []) as unknown as LinhaPosicao[];
    },
  });

  const vendas = useQuery({
    queryKey: ["contabil-vendas", selecionada],
    enabled: !!selecionada,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_contabil_vendas_periodo")
        .select("*")
        .eq("competencia", selecionada!)
        .order("data", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LinhaVenda[];
    },
  });

  const nfs = useQuery({
    queryKey: ["contabil-nfs", selecionada],
    enabled: !!selecionada,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_contabil_nfs_periodo")
        .select("*")
        .eq("competencia", selecionada!)
        .order("data", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LinhaNf[];
    },
  });

  const remessas = useQuery({
    queryKey: ["contabil-remessas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_contabil_remessas")
        .select("*")
        .eq("tipo", "fechamento_estoque")
        .order("enviada_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Remessa[];
    },
  });

  const linhasPosicao = posicao.data ?? [];
  const linhasVendas = vendas.data ?? [];
  const linhasNfs = nfs.data ?? [];

  const resumo = useMemo(() => {
    const receitaVendas = soma(linhasVendas, (v) => v.receita_total);
    const receitaNfs = soma(linhasNfs, (n) => n.receita_total);
    return {
      skus: linhasPosicao.length,
      unidades: soma(linhasPosicao, (l) => l.quantidade),
      custo: soma(linhasPosicao, (l) => l.valor_total),
      pedidos: linhasVendas.length,
      receitaVendas,
      cmvVendas: soma(linhasVendas, (v) => v.cmv),
      qtdNfs: linhasNfs.length,
      receitaNfs,
      diferenca: receitaVendas - receitaNfs,
    };
  }, [linhasPosicao, linhasVendas, linhasNfs]);

  const divergente = Math.abs(resumo.diferenca) > 0.005;

  /* ── geração do .xlsx ── */

  const montarPlanilha = () => {
    const wb = XLSX.utils.book_new();

    const abaPosicao = [
      ["SKU", "Produto", "Centro", "Quantidade", "Custo Unitário", "Valor Total"],
      ...linhasPosicao.map((l) => [
        l.sku,
        l.produto ?? "",
        l.centro ?? "",
        num(l.quantidade),
        num(l.custo_unitario),
        num(l.valor_total),
      ]),
      ["TOTAL", "", "", resumo.unidades, null, resumo.custo],
    ];
    const wsPosicao = XLSX.utils.aoa_to_sheet(abaPosicao);
    wsPosicao["!cols"] = [{ wch: 18 }, { wch: 46 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];

    const abaVendas = [
      [
        "Pedido", "Data", "Cliente", "CNPJ", "Canal", "NFs", "Unidades",
        "Receita Produto", "Receita Frete", "Receita Total", "CMV", "Margem Bruta",
      ],
      ...linhasVendas.map((v) => [
        v.pedido ?? "",
        dataXlsx(v.data),
        v.cliente ?? "",
        v.cnpj ?? "",
        v.canal ?? "",
        v.numeros_nf ?? num(v.nfs),
        num(v.unidades),
        num(v.receita_produto),
        num(v.receita_frete),
        num(v.receita_total),
        num(v.cmv),
        num(v.margem_bruta),
      ]),
    ];
    const wsVendas = XLSX.utils.aoa_to_sheet(abaVendas, { cellDates: true });
    wsVendas["!cols"] = [
      { wch: 14 }, { wch: 12 }, { wch: 40 }, { wch: 20 }, { wch: 16 }, { wch: 18 },
      { wch: 11 }, { wch: 16 }, { wch: 15 }, { wch: 15 }, { wch: 14 }, { wch: 15 },
    ];

    const abaNfs = [
      [
        "Data", "Número", "Série", "Cliente", "CNPJ", "UF", "Cidade", "Canal", "CFOPs",
        "Pedido", "Unidades", "Receita Produto", "Receita Frete", "Receita Total", "ICMS", "CMV",
      ],
      ...linhasNfs.map((n) => [
        dataXlsx(n.data),
        n.numero ?? "",
        n.serie ?? "",
        n.cliente ?? "",
        n.cnpj ?? "",
        n.uf ?? "",
        n.cidade ?? "",
        n.canal ?? "",
        n.cfops ?? "",
        n.pedido ?? "",
        num(n.unidades),
        num(n.receita_produto),
        num(n.receita_frete),
        num(n.receita_total),
        num(n.icms),
        num(n.cmv),
      ]),
    ];
    const wsNfs = XLSX.utils.aoa_to_sheet(abaNfs, { cellDates: true });
    wsNfs["!cols"] = [
      { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 40 }, { wch: 20 }, { wch: 6 }, { wch: 22 },
      { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 11 }, { wch: 16 }, { wch: 15 }, { wch: 15 },
      { wch: 13 }, { wch: 14 },
    ];

    // cabeçalho em negrito nas três abas
    for (const [ws, largura] of [[wsPosicao, 6], [wsVendas, 12], [wsNfs, 16]] as const) {
      for (let c = 0; c < largura; c++) {
        const ref = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[ref]) ws[ref].s = { font: { bold: true } };
      }
    }
    const totalRef = (c: number) => XLSX.utils.encode_cell({ r: abaPosicao.length - 1, c });
    for (let c = 0; c < 6; c++) {
      if (wsPosicao[totalRef(c)]) wsPosicao[totalRef(c)].s = { font: { bold: true } };
    }

    XLSX.utils.book_append_sheet(wb, wsPosicao, "Posição de Estoque");
    XLSX.utils.book_append_sheet(wb, wsVendas, "Vendas do Período");
    XLSX.utils.book_append_sheet(wb, wsNfs, "NFs do Período");

    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    return new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  };

  // v2 (03/11/2026): a remessa nasce pela RPC; a planilha sobe para o bucket contabil e o ZIP
  // é montado em segundo plano pela rotina gerar-pacote-contador-v2 (a antiga não é mais chamada).
  const gerar = useMutation({
    mutationFn: async () => {
      if (!selecionada || !comp) throw new Error("Selecione uma competência");
      if (comp.status !== "fechado") throw new Error("Feche a competência antes de gerar o pacote");
      const emails = destinatarios.split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e.includes("@"));
      const { data: ini, error: errIni } = await supabase.rpc("fn_remessa_contador_iniciar", {
        p_competencia: selecionada,
        p_destinatarios: emails,
        p_observacao: observacao.trim() || null,
      });
      if (errIni) throw errIni;
      const r = ini as { remessa_id: string; versao: number };
      const planilhaPath = `pacotes/${selecionada.slice(0, 7)}/v${r.versao}/planilha.xlsx`;
      const { error: errUp } = await supabase.storage.from("contabil").upload(planilhaPath, montarPlanilha(), {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
      // Sem planilha o pacote segue e o manifesto a lista como faltante — mas o erro aparece.
      if (errUp) toast.error(`Planilha não foi guardada: ${errUp.message}`, { duration: Infinity, closeButton: true });
      await chamarGeracao(r.remessa_id, errUp ? null : planilhaPath);
      return r;
    },
    onError: (e) => toast.error(rawMessage(e), { duration: Infinity, closeButton: true }),
    onSuccess: (r) => {
      toast.success(`Pacote de ${comp?.rotulo} v${r.versao} em geração.`);
      qc.invalidateQueries({ queryKey: ["contabil-remessas"] });
    },
  });

  /* ── cópia dos XML/PDF das NFs de saída para o arquivo contábil ── */
  const [progressoNfs, setProgressoNfs] = useState("");
  const buscarNfs = useMutation({
    mutationFn: async () => {
      if (!selecionada) throw new Error("Selecione uma competência");
      const mes = selecionada.slice(0, 7);
      let guardadas = 0;
      const erros: string[] = [];
      for (let volta = 0; volta < 60; volta++) {
        const { data, error } = await supabase.functions.invoke("nf-arquivos-retrofit", {
          body: { competencia: mes },
        });
        if (error) {
          const ctx = (error as { context?: Response }).context;
          throw new Error(ctx ? await ctx.text() : error.message);
        }
        const r = data as { ok: boolean; erro?: string; processadas: number; guardadas: number;
          erros: { numero: string | null; erro: string }[]; restantes: number };
        if (!r.ok) throw new Error(r.erro || "Falha ao buscar arquivos das NFs");
        guardadas += r.guardadas;
        erros.push(...r.erros.map((e) => `NF ${e.numero ?? "?"}: ${e.erro}`));
        setProgressoNfs(`${guardadas} guardadas · faltam ${r.restantes}`);
        if (r.processadas === 0 || r.restantes === 0) break;
      }
      return { guardadas, erros };
    },
    onSuccess: ({ guardadas, erros }) => {
      setProgressoNfs("");
      if (erros.length) {
        toast.error(`${guardadas} NFs guardadas; ${erros.length} com erro`, {
          description: erros.slice(0, 5).join("\n"),
          duration: Infinity,
        });
      } else {
        toast.success(`${guardadas} NFs com XML e PDF guardados`);
      }
    },
    onError: (e) => {
      setProgressoNfs("");
      toast.error(rawMessage(e));
    },
  });

  /* ── histórico ── */

  const historico = remessas.data ?? [];
  const historicoFiltrado = useMemo(() => {
    const t = buscaHist.trim().toLowerCase();
    if (!t) return historico;
    return historico.filter(
      (r) =>
        (r.rotulo ?? "").toLowerCase().includes(t) ||
        (r.destinatarios ?? []).join(" ").toLowerCase().includes(t)
    );
  }, [historico, buscaHist]);

  const carregandoPrevia = posicao.isLoading || vendas.isLoading || nfs.isLoading;
  const erroPrevia = posicao.error || vendas.error || nfs.error;

  const Bloco = ({
    titulo,
    destaque,
    itens,
    principal,
  }: {
    titulo: string;
    destaque: string;
    itens: { rotulo: string; valor: string }[];
    principal?: boolean;
  }) => (
    <div className={cn("flex-1 rounded-lg border p-4", principal && "border-primary/40 bg-primary/5")}>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-xl tabular-nums">{destaque}</p>
      <dl className="mt-2 space-y-0.5">
        {itens.map((i) => (
          <div key={i.rotulo} className="flex items-center justify-between gap-3 text-xs">
            <dt className="text-muted-foreground">{i.rotulo}</dt>
            <dd className="tabular-nums">{i.valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  return (
    <PageShell>
      {/* ZONA 1 */}
      <PageTitle
        titulo="Pacote do Contador"
        estado="Planilha mensal de posição de estoque, vendas e notas fiscais"
        icone={FileSpreadsheet}
      />

      {/* ZONA 2 — competências */}
      {competencias.isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[104px] w-[240px] shrink-0 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : competencias.error ? (
        <p className="text-sm text-destructive">{rawMessage(competencias.error)}</p>
      ) : !competencias.data?.length ? (
        <EstadoVazio mensagem="Nenhuma competência gerada ainda. Registre movimentações de estoque para abrir a primeira." />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {competencias.data.map((c) => {
            const ativo = c.competencia === selecionada;
            const s = SELO_STATUS[c.status] ?? SELO_STATUS.aberto;
            return (
              <button
                key={c.competencia}
                type="button"
                onClick={() => setSelecionada(c.competencia)}
                className={cn(
                  "w-[240px] shrink-0 rounded-lg border p-3 text-left transition-colors",
                  ativo ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/50"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{c.rotulo}</span>
                  <Selo estado={s.estado}>{s.texto}</Selo>
                </div>
                <p className="mt-1 text-base tabular-nums">{fmtDinheiro(c.valor_custo)}</p>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {fmtUn(c.unidades)} un · {fmtUn(c.skus)} SKUs
                </p>
              </button>
            );
          })}
        </div>
      )}

      {comp && !fechada && (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Feche a competência antes de gerar o pacote.
        </div>
      )}

      {/* ZONA 3 — prévia */}
      {comp && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium">Prévia de {comp.rotulo}</h2>
            {divergente && (
              <Selo estado="warning">Divergência de {fmtDinheiro(Math.abs(resumo.diferenca))}</Selo>
            )}
          </div>

          {carregandoPrevia ? (
            <div className="flex gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-[132px] flex-1 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : erroPrevia ? (
            <p className="text-sm text-destructive">{rawMessage(erroPrevia)}</p>
          ) : (
            <div className="flex flex-col gap-3 md:flex-row">
              <Bloco
                titulo="Posição de Estoque"
                destaque={fmtDinheiro(resumo.custo)}
                principal
                itens={[
                  { rotulo: "SKUs", valor: fmtUn(resumo.skus) },
                  { rotulo: "Unidades", valor: fmtUn(resumo.unidades) },
                ]}
              />
              <Bloco
                titulo="Vendas do período"
                destaque={fmtDinheiro(resumo.receitaVendas)}
                itens={[
                  { rotulo: "Pedidos", valor: fmtUn(resumo.pedidos) },
                  { rotulo: "CMV", valor: fmtDinheiro(resumo.cmvVendas) },
                ]}
              />
              <Bloco
                titulo="NFs do período"
                destaque={fmtDinheiro(resumo.receitaNfs)}
                itens={[
                  { rotulo: "Notas fiscais", valor: fmtUn(resumo.qtdNfs) },
                  { rotulo: "Diferença vs. vendas", valor: fmtDinheiro(resumo.diferenca) },
                ]}
              />
            </div>
          )}
        </section>
      )}

      {/* ZONA 4 — geração */}
      {comp && (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Geração</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="destinatarios" className="text-xs">
                Destinatários (opcional, separados por vírgula)
              </Label>
              <Input
                id="destinatarios"
                value={destinatarios}
                onChange={(e) => setDestinatarios(e.target.value)}
                placeholder="contador@escritorio.com.br"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="observacao" className="text-xs">
                Observação para o contador (opcional)
              </Label>
              <Textarea
                id="observacao"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          {/* Exportação leva a base para fora: nível 3 (Coordenador) para cima. */}
          {temNivel(3) && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={!fechada || carregandoPrevia || gerar.isPending}
                onClick={() => gerar.mutate()}
              >
                <Package className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {gerar.isPending ? "Gerando…" : "Gerar pacote"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={buscarNfs.isPending}
                onClick={() => buscarNfs.mutate()}
              >
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {buscarNfs.isPending ? progressoNfs || "Buscando…" : "Buscar arquivos das NFs do mês"}
              </Button>
            </div>
          )}
        </section>
      )}

      {/* ZONA 5 — histórico */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Remessas enviadas</h2>
        <TabelaFetely
          busca={{ valor: buscaHist, aoMudar: setBuscaHist, placeholder: "Buscar por competência ou destinatário…" }}
          carregando={remessas.isLoading}
          erro={remessas.error ? rawMessage(remessas.error) : null}
          aoTentarNovamente={() => remessas.refetch()}
          vazio={{ mensagem: "Nenhum pacote enviado ainda. Feche uma competência e gere o primeiro." }}
          semResultado="Nenhuma remessa corresponde a essa busca."
          total={historico.length}
          exibidos={historicoFiltrado.length}
          rotulo="remessas"
        >
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-normal text-muted-foreground">Competência</th>
                  <th className="px-3 py-2 text-left text-[11px] font-normal text-muted-foreground">Enviado em</th>
                  <th className="px-3 py-2 text-left text-[11px] font-normal text-muted-foreground">Destinatários</th>
                  <th className="px-3 py-2 text-right text-[11px] font-normal text-muted-foreground">Unidades</th>
                  <th className="px-3 py-2 text-right text-[11px] font-normal text-muted-foreground">Valor</th>
                  <th className="px-3 py-2 text-right text-[11px] font-normal text-muted-foreground">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {historicoFiltrado.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{r.rotulo ?? fmtData(r.competencia)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                      {fmtDataHora(r.enviada_em)}
                    </td>
                    <td className="max-w-[320px] truncate px-3 py-2 text-muted-foreground">
                      {(r.destinatarios ?? []).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtUn(r.unidades)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtDinheiro(r.valor_custo)}</td>
                    <td className="px-3 py-2 text-right">
                      {r.link_expirado || !r.link_signed ? (
                        <Selo estado="warning">Link expirado</Selo>
                      ) : (
                        <Button variant="outline" size="sm" asChild>
                          <a href={r.link_signed} target="_blank" rel="noreferrer">
                            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            Baixar
                          </a>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabelaFetely>
      </section>
    </PageShell>
  );
}
