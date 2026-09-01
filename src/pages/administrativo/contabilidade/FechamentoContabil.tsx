/**
 * TELA 1 — Contabilidade > Fechamento Mensal.
 *
 * Backend pronto e testado: vw_contabil_competencias, fn_contabil_gates,
 * fn_contabil_posicao, fn_contabil_fechar, fn_contabil_reabrir.
 * Esta tela apenas CONSOME. Nada de escrita direta em tabela.
 *
 * FAIL-LOUD: toda RPC de escrita e aguardada, erro do banco vai pro toast
 * com a mensagem real em portugues e o estado local volta ao que era.
 */
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Lock, LockOpen, CheckCircle2, ArrowUpDown, BookLock, Download, FileSpreadsheet } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageTitle } from "@/components/layout/PageTitle";
import { TabelaFetely } from "@/components/ui/tabela-fetely";
import { Selo, type EstadoSelo } from "@/components/ui/selo";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { rawMessage } from "@/lib/format-error";
import { useAbaUrl } from "@/hooks/useAbaUrl";


/* ────────────────────────────── tipos ────────────────────────────── */

type StatusComp = "aberto" | "fechado" | "reaberto";

interface Competencia {
  competencia: string;
  rotulo: string;
  status: StatusComp;
  unidades: number;
  valor_custo: number;
  valor_custo_nf: number | null;
  icms_excluido: number | null;
  skus: number;
  fechado_em: string | null;
  obs: string | null;
  politica: Record<string, unknown> | null;
  gates_bloqueantes: number;
}

type Severidade = "bloqueante" | "atencao" | "informativo";

interface Gate {
  gate: string;
  severidade: Severidade;
  quantidade: number;
  detalhe: string | null;
}

interface LinhaPosicao {
  sku: string;
  produto: string | null;
  centro: string | null;
  quantidade: number;
  custo_unitario: number;
  valor_total: number;
  custo_nf_unitario: number | null;
  valor_nf_total: number | null;
  icms_aliq: number | null;
  ipi_aliq: number | null;
  valor_unit_nf: number | null;
  delta_icms: number | null;
  fonte: "snapshot" | "calculado";
}

/* ───────────────────────────── formato ───────────────────────────── */

const fmtDinheiro = (v: number | null | undefined) =>
  `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtUn = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const fmtUnit = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

/** Alíquota vem como fração (0.0675) — exibida como 6,75%. */
const fmtAliq = (v: number | null | undefined) =>
  v == null ? "—" : `${(Number(v) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const num = (v: unknown) => Number(v || 0);


const SELO_STATUS: Record<StatusComp, { estado: EstadoSelo; texto: string }> = {
  fechado: { estado: "success", texto: "Fechado" },
  aberto: { estado: "info", texto: "Aberto" },
  reaberto: { estado: "warning", texto: "Reaberto" },
};

const SELO_SEVERIDADE: Record<Severidade, { estado: EstadoSelo; texto: string }> = {
  bloqueante: { estado: "destructive", texto: "Bloqueante" },
  atencao: { estado: "warning", texto: "Atenção" },
  informativo: { estado: "info", texto: "Informativo" },
};

const ROTULO_GATE: Record<string, string> = {
  sku_sem_custo: "SKUs sem custo de aterrissagem",
  entrada_sem_nf: "Entradas sem NF vinculada",
  nf_autorizada_sem_baixa: "NFs autorizadas sem baixa de estoque",
  mov_retroativo_mes_fechado: "Movimentos retroativos em mês fechado",
  nf_sem_serie: "NFs sem série preenchida",
};

const POR_PAGINA = 100;

/* ────────────────────────────── tela ─────────────────────────────── */

export default function FechamentoContabil() {
  const qc = useQueryClient();
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ campo: keyof LinhaPosicao; asc: boolean }>({ campo: "valor_total", asc: false });
  const [pagina, setPagina] = useState(0);
  const [dialogFechar, setDialogFechar] = useState<"normal" | "forcar" | null>(null);
  const [dialogReabrir, setDialogReabrir] = useState(false);
  const [obs, setObs] = useState("");
  const [motivo, setMotivo] = useState("");
  // Aba da tabela de posição vive na URL, em ?base= (padrão: aterrissagem).
  const [base, setBase] = useAbaUrl("aterrissagem", undefined, "base");


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

  // Seleção inicial: competência aberta mais recente (fallback: a mais recente).
  useEffect(() => {
    if (selecionada || !competencias.data?.length) return;
    const aberta = competencias.data.find((c) => c.status === "aberto");
    setSelecionada((aberta ?? competencias.data[0]).competencia);
  }, [competencias.data, selecionada]);

  const comp = competencias.data?.find((c) => c.competencia === selecionada) ?? null;

  const gates = useQuery({
    queryKey: ["contabil-gates", selecionada],
    enabled: !!selecionada,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_contabil_gates", { p_competencia: selecionada! });
      if (error) throw error;
      return (data ?? []) as unknown as Gate[];
    },
  });

  const posicao = useQuery({
    queryKey: ["contabil-posicao", selecionada],
    enabled: !!selecionada,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_contabil_posicao", { p_competencia: selecionada! });
      if (error) throw error;
      return (data ?? []) as unknown as LinhaPosicao[];
    },
  });

  useEffect(() => { setPagina(0); }, [selecionada, busca, ordem]);

  const linhas = posicao.data ?? [];

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const base = t
      ? linhas.filter(
          (l) => l.sku?.toLowerCase().includes(t) || (l.produto ?? "").toLowerCase().includes(t)
        )
      : linhas;
    const { campo, asc } = ordem;
    return [...base].sort((a, b) => {
      const va = a[campo], vb = b[campo];
      if (typeof va === "number" && typeof vb === "number") return asc ? va - vb : vb - va;
      return asc
        ? String(va ?? "").localeCompare(String(vb ?? ""), "pt-BR")
        : String(vb ?? "").localeCompare(String(va ?? ""), "pt-BR");
    });
  }, [linhas, busca, ordem]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = filtradas.slice(paginaAtual * POR_PAGINA, paginaAtual * POR_PAGINA + POR_PAGINA);

  const totais = useMemo(
    () =>
      filtradas.reduce(
        (acc, l) => ({
          un: acc.un + num(l.quantidade),
          rs: acc.rs + num(l.valor_total),
          // Linha sem custo NF entra como 0 na soma — a própria linha sinaliza o furo.
          rsNf: acc.rsNf + num(l.valor_nf_total),
          delta: acc.delta + num(l.delta_icms),
        }),
        { un: 0, rs: 0, rsNf: 0, delta: 0 }
      ),
    [filtradas]
  );

  const fonte = linhas[0]?.fonte;
  const gatesBloqueantes = (gates.data ?? []).filter((g) => g.severidade === "bloqueante" && g.quantidade > 0);
  const todosLimpos = (gates.data ?? []).length > 0 && (gates.data ?? []).every((g) => g.quantidade === 0);

  /* ── exportações .xlsx (padrão PacoteContador: monta no cliente, baixa Blob) ── */

  const sufixoArquivo = selecionada ? `${selecionada.slice(5, 7)}-${selecionada.slice(0, 4)}` : "";

  const negritarLinha = (ws: XLSX.WorkSheet, linha: number, colunas: number) => {
    for (let c = 0; c < colunas; c++) {
      const ref = XLSX.utils.encode_cell({ r: linha, c });
      if (ws[ref]) ws[ref].s = { font: { bold: true } };
    }
  };

  const baixar = (wb: XLSX.WorkBook, nome: string) => {
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarAterrissagem = () => {
    try {
      const aoa = [
        ["SKU", "Produto", "Centro", "Quantidade", "Custo Unitário", "Valor Total"],
        ...filtradas.map((l) => [
          l.sku,
          l.produto ?? "",
          l.centro ?? "",
          num(l.quantidade),
          num(l.custo_unitario),
          num(l.valor_total),
        ]),
        ["TOTAL", "", "", totais.un, null, totais.rs],
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 18 }, { wch: 46 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
      negritarLinha(ws, 0, 6);
      negritarLinha(ws, aoa.length - 1, 6);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Posição de Estoque");
      baixar(wb, `Fetely_Estoque_Aterrissagem_${sufixoArquivo}.xlsx`);
    } catch (e) {
      toast.error(rawMessage(e));
    }
  };

  const exportarCustoNf = () => {
    try {
      const aoa = [
        ["SKU", "Produto", "Centro", "Quantidade", "Valor Unit. NF", "IPI %", "Custo NF Unitário", "Valor Total NF"],
        ...filtradas.map((l) => [
          l.sku,
          l.produto ?? "",
          l.centro ?? "",
          num(l.quantidade),
          l.valor_unit_nf == null ? null : num(l.valor_unit_nf),
          l.ipi_aliq == null ? null : num(l.ipi_aliq) * 100,
          l.custo_nf_unitario == null ? null : num(l.custo_nf_unitario),
          l.valor_nf_total == null ? null : num(l.valor_nf_total),
        ]),
        ["TOTAL", "", "", totais.un, null, null, null, totais.rsNf],
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [
        { wch: 18 }, { wch: 46 }, { wch: 16 }, { wch: 12 },
        { wch: 15 }, { wch: 9 }, { wch: 18 }, { wch: 17 },
      ];
      negritarLinha(ws, 0, 8);
      negritarLinha(ws, aoa.length - 1, 8);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Posição de Estoque");
      baixar(wb, `Fetely_Estoque_CustoNF_${sufixoArquivo}.xlsx`);
    } catch (e) {
      toast.error(rawMessage(e));
    }
  };

  const exportarComparativo = () => {
    try {
      const aoa = [
        [
          "SKU", "Produto", "Centro", "Quantidade",
          "Custo Aterrissagem Unit.", "Valor Aterrissagem",
          "Custo NF Unit.", "Valor NF", "ICMS %", "IPI %", "Diferença",
        ],
        ...filtradas.map((l) => [
          l.sku,
          l.produto ?? "",
          l.centro ?? "",
          num(l.quantidade),
          num(l.custo_unitario),
          num(l.valor_total),
          l.custo_nf_unitario == null ? null : num(l.custo_nf_unitario),
          l.valor_nf_total == null ? null : num(l.valor_nf_total),
          l.icms_aliq == null ? null : num(l.icms_aliq) * 100,
          l.ipi_aliq == null ? null : num(l.ipi_aliq) * 100,
          l.delta_icms == null ? null : num(l.delta_icms),
        ]),
        ["TOTAL", "", "", totais.un, null, totais.rs, null, totais.rsNf, null, null, totais.delta],
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [
        { wch: 18 }, { wch: 46 }, { wch: 16 }, { wch: 12 }, { wch: 22 }, { wch: 18 },
        { wch: 16 }, { wch: 16 }, { wch: 9 }, { wch: 9 }, { wch: 16 },
      ];
      negritarLinha(ws, 0, 11);
      negritarLinha(ws, aoa.length - 1, 11);

      const criterio: (string | null)[][] = [
        ["Competência", comp?.rotulo ?? ""],
        ["Status", comp?.status ?? ""],
        ["Fechado em", comp?.fechado_em ? new Date(comp.fechado_em).toLocaleString("pt-BR") : "—"],
        ["Fonte da posição", fonte === "snapshot" ? "Snapshot congelado" : "Cálculo ao vivo"],
        [null, null],
        ["Critério", "Valor"],
        ...Object.entries(comp?.politica ?? {}).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.join(", ") : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v),
        ]),
      ];
      const wsCriterio = XLSX.utils.aoa_to_sheet(criterio);
      wsCriterio["!cols"] = [{ wch: 34 }, { wch: 60 }];
      negritarLinha(wsCriterio, 5, 2);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Comparativo");
      XLSX.utils.book_append_sheet(wb, wsCriterio, "Critério");
      baixar(wb, `Fetely_Estoque_Comparativo_${sufixoArquivo}.xlsx`);
    } catch (e) {
      toast.error(rawMessage(e));
    }
  };

  /* ── exportação primária: Evolução Mensal de Estoque (CFO) ── */

  const [gerandoCfo, setGerandoCfo] = useState(false);

  const Z_RS = '#,##0.00';
  const Z_UNIT = '#,##0.000000';
  const Z_PCT = '0.00"%"';
  const Z_UN = "#,##0";

  /** Aplica formato numérico em colunas (índice → formato) para todas as linhas de dados. */
  const formatarColunas = (
    ws: XLSX.WorkSheet,
    primeiraLinha: number,
    ultimaLinha: number,
    formatos: Record<number, string>,
  ) => {
    for (let r = primeiraLinha; r <= ultimaLinha; r++) {
      for (const [c, z] of Object.entries(formatos)) {
        const ref = XLSX.utils.encode_cell({ r, c: Number(c) });
        if (ws[ref] && typeof ws[ref].v === "number") ws[ref].z = z;
      }
    }
  };

  const exportarEvolucaoMensal = async () => {
    setGerandoCfo(true);
    try {
      const { data, error } = await supabase.rpc("fn_contabil_evolucao_mensal");
      if (error) throw error;
      const dados = (data ?? []) as unknown as EvolucaoLinha[];
      if (!dados.length) {
        toast.info("Nenhuma competência fechada para exportar");
        return;
      }

      // Competências em ordem cronológica — derivadas do dado, nunca hardcodadas.
      const compsMap = new Map<string, string>();
      dados.forEach((l) => compsMap.set(l.competencia, l.rotulo));
      const comps = [...compsMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([competencia, rotulo]) => ({ competencia, rotulo }));
      const ultima = comps[comps.length - 1];

      const chave = (competencia: string, sku: string) => `${competencia}|${sku}`;
      const porCompSku = new Map<string, EvolucaoLinha>();
      dados.forEach((l) => porCompSku.set(chave(l.competencia, l.sku), l));

      /* ── Aba 1 — Resumo Mensal ── */
      const resumo = comps.map(({ competencia, rotulo }) => {
        const ls = dados.filter((l) => l.competencia === competencia);
        const entradas = ls.reduce((a, l) => a + num(l.entrada), 0);
        const saidas = ls.reduce((a, l) => a + num(l.saida), 0);
        const estoque = ls.reduce((a, l) => a + num(l.estoque), 0);
        const vNf = ls.reduce((a, l) => a + num(l.valor_nf), 0);
        const vAt = ls.reduce((a, l) => a + num(l.valor_aterrissagem), 0);
        const cmv = ls.reduce((a, l) => a + num(l.cmv), 0);
        return {
          rotulo,
          skus: ls.length,
          entradas,
          saidas,
          estoque,
          vNf,
          vAt,
          icms: vNf - vAt,
          icmsPct: vAt ? ((vNf - vAt) / vAt) * 100 : 0,
          medioNf: estoque ? vNf / estoque : 0,
          medioAt: estoque ? vAt / estoque : 0,
          cmv,
        };
      });
      const ultimoResumo = resumo[resumo.length - 1];
      const aoaResumo: (string | number | null)[][] = [
        [
          "Competência", "SKUs", "Entradas (un)", "Saídas (un)", "Estoque final (un)",
          "Estoque a Custo NF (R$)", "Estoque a Custo Aterrissagem (R$)",
          "ICMS creditável (R$)", "ICMS %", "Custo médio NF (R$/un)",
          "Custo médio Aterr. (R$/un)", "CMV do mês (R$)",
        ],
        ...resumo.map((r) => [
          r.rotulo, r.skus, r.entradas, r.saidas, r.estoque,
          r.vNf, r.vAt, r.icms, r.icmsPct, r.medioNf, r.medioAt, r.cmv,
        ]),
        [
          "TOTAL",
          null,
          resumo.reduce((a, r) => a + r.entradas, 0),
          resumo.reduce((a, r) => a + r.saidas, 0),
          // Estoque e valores são SALDO: repetem o último mês, não somam.
          ultimoResumo.estoque,
          ultimoResumo.vNf,
          ultimoResumo.vAt,
          ultimoResumo.icms,
          null, null, null,
          resumo.reduce((a, r) => a + r.cmv, 0),
        ],
      ];
      const wsResumo = XLSX.utils.aoa_to_sheet(aoaResumo);
      wsResumo["!cols"] = [
        { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 13 }, { wch: 18 },
        { wch: 22 }, { wch: 28 }, { wch: 18 }, { wch: 9 }, { wch: 20 }, { wch: 22 }, { wch: 16 },
      ];
      negritarLinha(wsResumo, 0, 12);
      negritarLinha(wsResumo, aoaResumo.length - 1, 12);
      formatarColunas(wsResumo, 1, aoaResumo.length - 1, {
        1: Z_UN, 2: Z_UN, 3: Z_UN, 4: Z_UN, 5: Z_RS, 6: Z_RS, 7: Z_RS,
        8: Z_PCT, 9: Z_RS, 10: Z_RS, 11: Z_RS,
      });

      /* ── Aba 2 — Por Grupo ── */
      const grupos = [...new Set(dados.map((l) => l.grupo ?? "—"))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      );
      const cabGrupo: (string | number | null)[] = ["Grupo"];
      comps.forEach(({ rotulo }) => cabGrupo.push(`${rotulo} un`, `${rotulo} Custo NF`, `${rotulo} Aterrissagem`));
      const linhasGrupo = grupos.map((g) => {
        const linha: (string | number | null)[] = [g];
        comps.forEach(({ competencia }) => {
          const ls = dados.filter((l) => l.competencia === competencia && (l.grupo ?? "—") === g);
          linha.push(
            ls.reduce((a, l) => a + num(l.estoque), 0),
            ls.reduce((a, l) => a + num(l.valor_nf), 0),
            ls.reduce((a, l) => a + num(l.valor_aterrissagem), 0),
          );
        });
        return linha;
      });
      const totalGrupo: (string | number | null)[] = ["TOTAL"];
      for (let c = 1; c < cabGrupo.length; c++) {
        totalGrupo.push(linhasGrupo.reduce((a, l) => a + num(l[c]), 0));
      }
      const aoaGrupo = [cabGrupo, ...linhasGrupo, totalGrupo];
      const wsGrupo = XLSX.utils.aoa_to_sheet(aoaGrupo);
      wsGrupo["!cols"] = [{ wch: 32 }, ...cabGrupo.slice(1).map(() => ({ wch: 16 }))];
      negritarLinha(wsGrupo, 0, cabGrupo.length);
      negritarLinha(wsGrupo, aoaGrupo.length - 1, cabGrupo.length);
      const fmtGrupo: Record<number, string> = {};
      comps.forEach((_, i) => {
        fmtGrupo[1 + i * 3] = Z_UN;
        fmtGrupo[2 + i * 3] = Z_RS;
        fmtGrupo[3 + i * 3] = Z_RS;
      });
      formatarColunas(wsGrupo, 1, aoaGrupo.length - 1, fmtGrupo);

      /* ── Aba 3 — Evolução por SKU ── */
      const skus = [...new Set(dados.map((l) => l.sku))].sort((a, b) => a.localeCompare(b, "pt-BR"));
      const ID_COLS = 9;
      // Faixa de cabeçalho: um rótulo de mês mesclado acima de cada bloco de 6 colunas.
      const faixa: (string | null)[] = Array(ID_COLS).fill(null);
      comps.forEach(({ rotulo }) => {
        faixa.push(rotulo, null, null, null, null, null);
      });
      const cabSku: (string | number | null)[] = [
        "SKU", "Produto", "Grupo", "NCM", "NF de entrada",
        "Custo NF unit.", "Custo Aterr. unit.", "ICMS %", "IPI %",
      ];
      comps.forEach(() =>
        cabSku.push("Entrada", "Saída", "CMV (R$)", "Estoque", "Valor NF (R$)", "Valor Aterr. (R$)"),
      );
      const linhasSku = skus.map((sku) => {
        const ref = porCompSku.get(chave(ultima.competencia, sku)) ?? dados.find((l) => l.sku === sku)!;
        const linha: (string | number | null)[] = [
          sku,
          ref.produto ?? "",
          ref.grupo ?? "",
          ref.ncm ?? "",
          ref.nf_entrada ?? "",
          ref.custo_nf_unitario == null ? null : num(ref.custo_nf_unitario),
          ref.custo_aterrissagem_unitario == null ? null : num(ref.custo_aterrissagem_unitario),
          ref.icms_aliq == null ? null : num(ref.icms_aliq) * 100,
          ref.ipi_aliq == null ? null : num(ref.ipi_aliq) * 100,
        ];
        comps.forEach(({ competencia }) => {
          const l = porCompSku.get(chave(competencia, sku));
          linha.push(
            num(l?.entrada), num(l?.saida), num(l?.cmv),
            num(l?.estoque), num(l?.valor_nf), num(l?.valor_aterrissagem),
          );
        });
        return linha;
      });
      const totalSku: (string | number | null)[] = ["TOTAL", null, null, null, null, null, null, null, null];
      for (let c = ID_COLS; c < cabSku.length; c++) {
        totalSku.push(linhasSku.reduce((a, l) => a + num(l[c]), 0));
      }
      const aoaSku = [faixa, cabSku, ...linhasSku, totalSku];
      const wsSku = XLSX.utils.aoa_to_sheet(aoaSku);
      wsSku["!cols"] = [
        { wch: 18 }, { wch: 46 }, { wch: 24 }, { wch: 12 }, { wch: 16 },
        { wch: 16 }, { wch: 18 }, { wch: 9 }, { wch: 9 },
        ...comps.flatMap(() => [{ wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 11 }, { wch: 16 }, { wch: 18 }]),
      ];
      wsSku["!merges"] = comps.map((_, i) => ({
        s: { r: 0, c: ID_COLS + i * 6 },
        e: { r: 0, c: ID_COLS + i * 6 + 5 },
      }));
      wsSku["!freeze"] = { xSplit: 3, ySplit: 2 };
      wsSku["!autofilter"] = {
        ref: XLSX.utils.encode_range(
          { r: 1, c: 0 },
          { r: aoaSku.length - 1, c: cabSku.length - 1 },
        ),
      };
      negritarLinha(wsSku, 0, cabSku.length);
      negritarLinha(wsSku, 1, cabSku.length);
      negritarLinha(wsSku, aoaSku.length - 1, cabSku.length);
      const fmtSku: Record<number, string> = { 5: Z_UNIT, 6: Z_UNIT, 7: Z_PCT, 8: Z_PCT };
      comps.forEach((_, i) => {
        const b = ID_COLS + i * 6;
        fmtSku[b] = Z_UN;
        fmtSku[b + 1] = Z_UN;
        fmtSku[b + 2] = Z_RS;
        fmtSku[b + 3] = Z_UN;
        fmtSku[b + 4] = Z_RS;
        fmtSku[b + 5] = Z_RS;
      });
      formatarColunas(wsSku, 2, aoaSku.length - 1, fmtSku);

      /* ── Aba 4 — Critério e Premissas ── */
      const fechamentoRecente = (competencias.data ?? [])
        .filter((c) => c.status === "fechado")
        .sort((a, b) => b.competencia.localeCompare(a.competencia))[0];
      const aoaCriterio: (string | null)[][] = [
        ["Custo NF", "=  valor do produto na NF  +  IPI"],
        ["Custo aterrissagem", "=  valor do produto na NF  −  ICMS  +  IPI"],
        [null, null],
        ["Item", "Tratamento"],
        ["Base contábil", "Custo de aterrissagem (ICMS creditável excluído do custo)"],
        ["Base gerencial", "Custo NF (produto + IPI, sem excluir ICMS)"],
        ["Fonte dos números", "Snapshots congelados de cada fechamento contábil"],
        ["Competências incluídas", comps.map((c) => c.rotulo).join(", ")],
        ...Object.entries(fechamentoRecente?.politica ?? {}).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.join(", ") : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v),
        ]),
      ];
      const wsCriterio = XLSX.utils.aoa_to_sheet(aoaCriterio);
      wsCriterio["!cols"] = [{ wch: 34 }, { wch: 70 }];
      negritarLinha(wsCriterio, 0, 2);
      negritarLinha(wsCriterio, 1, 2);
      negritarLinha(wsCriterio, 3, 2);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo Mensal");
      XLSX.utils.book_append_sheet(wb, wsGrupo, "Por Grupo");
      XLSX.utils.book_append_sheet(wb, wsSku, "Evolução por SKU");
      XLSX.utils.book_append_sheet(wb, wsCriterio, "Critério e Premissas");
      baixar(wb, `Fetely_Estoque_Mensal_CFO_${ultima.competencia.slice(0, 4)}.xlsx`);
      toast.success(`Evolução mensal exportada — ${comps.length} competência(s), ${skus.length} SKU(s).`);
    } catch (e) {
      toast.error(rawMessage(e));
    } finally {
      setGerandoCfo(false);
    }
  };



  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["contabil-competencias"] });
    qc.invalidateQueries({ queryKey: ["contabil-gates", selecionada] });
    qc.invalidateQueries({ queryKey: ["contabil-posicao", selecionada] });
  };

  const fechar = useMutation({
    mutationFn: async ({ forcar, observacao }: { forcar: boolean; observacao: string }) => {
      const { error } = await supabase.rpc("fn_contabil_fechar", {
        p_competencia: selecionada!,
        p_forcar: forcar,
        p_obs: observacao || null,
      });
      if (error) throw error;
    },
    onMutate: () => {
      // rollback otimista: guarda o cache atual antes de mexer
      const anterior = qc.getQueryData(["contabil-competencias"]);
      qc.setQueryData<Competencia[]>(["contabil-competencias"], (old) =>
        (old ?? []).map((c) => (c.competencia === selecionada ? { ...c, status: "fechado" } : c))
      );
      return { anterior };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(["contabil-competencias"], ctx.anterior);
      toast.error(rawMessage(e));
    },
    onSuccess: () => {
      toast.success(`Competência ${comp?.rotulo} fechada.`);
      setDialogFechar(null);
      setObs("");
      invalidar();
    },
  });

  const reabrir = useMutation({
    mutationFn: async (m: string) => {
      const { error } = await supabase.rpc("fn_contabil_reabrir", {
        p_competencia: selecionada!,
        p_motivo: m,
      });
      if (error) throw error;
    },
    onMutate: () => {
      const anterior = qc.getQueryData(["contabil-competencias"]);
      qc.setQueryData<Competencia[]>(["contabil-competencias"], (old) =>
        (old ?? []).map((c) => (c.competencia === selecionada ? { ...c, status: "reaberto" } : c))
      );
      return { anterior };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(["contabil-competencias"], ctx.anterior);
      toast.error(rawMessage(e));
    },
    onSuccess: () => {
      toast.success(`Competência ${comp?.rotulo} reaberta.`);
      setDialogReabrir(false);
      setMotivo("");
      invalidar();
    },
  });

  const Cabecalho = ({ campo, children, num }: { campo: keyof LinhaPosicao; children: React.ReactNode; num?: boolean }) => (
    <th className={cn("px-3 py-2 text-[11px] font-normal text-muted-foreground", num ? "text-right" : "text-left")}>
      <button
        type="button"
        onClick={() => setOrdem((o) => ({ campo, asc: o.campo === campo ? !o.asc : false }))}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", num && "flex-row-reverse")}
      >
        {children}
        <ArrowUpDown className={cn("h-3 w-3", ordem.campo === campo ? "opacity-100" : "opacity-30")} aria-hidden="true" />
      </button>
    </th>
  );

  return (
    <PageShell>
      {/* ZONA 1 */}
      <PageTitle
        titulo="Fechamento Mensal"
        estado="Posição contábil de estoque por competência"
        icone={BookLock}
        acoes={
          comp && (
            <div className="flex items-center gap-3">
              {(comp.status === "aberto" || comp.status === "reaberto") && (
                <>
                  <Button
                    size="sm"
                    disabled={comp.gates_bloqueantes > 0 || fechar.isPending}
                    onClick={() => setDialogFechar("normal")}
                  >
                    <Lock className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Fechar competência
                  </Button>
                  {comp.gates_bloqueantes > 0 && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      onClick={() => setDialogFechar("forcar")}
                    >
                      Fechar mesmo assim
                    </button>
                  )}
                </>
              )}
              {comp.status === "fechado" && (
                <Button size="sm" variant="outline" onClick={() => setDialogReabrir(true)}>
                  <LockOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Reabrir
                </Button>
              )}
            </div>
          )
        }
      />

      {/* ZONA 2 — faixa de competências */}
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
                {c.gates_bloqueantes > 0 && (
                  <div className="mt-1.5">
                    <Selo estado="warning">{c.gates_bloqueantes} pendências</Selo>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ZONA 3 — gates */}
      {comp && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Checagens de {comp.rotulo}</h2>
          {gates.isLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          ) : gates.error ? (
            <p className="text-sm text-destructive">{rawMessage(gates.error)}</p>
          ) : !gates.data?.length ? (
            <EstadoVazio mensagem="Nenhuma checagem configurada para esta competência." />
          ) : (
            <div className="space-y-2">
              {todosLimpos && (
                <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Nenhuma pendência. Competência pronta para fechar.
                </div>
              )}
              <ul className="divide-y rounded-lg border">
                {gates.data.map((g) => {
                  const sev = SELO_SEVERIDADE[g.severidade] ?? SELO_SEVERIDADE.informativo;
                  const zero = g.quantidade === 0;
                  return (
                    <li key={g.gate} className={cn("flex items-start gap-3 px-3 py-2.5", zero && "opacity-45")}>
                      <Selo estado={zero ? "muted" : sev.estado}>{sev.texto}</Selo>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{ROTULO_GATE[g.gate] ?? g.gate}</p>
                        {g.detalhe && <p className="text-xs text-muted-foreground">{g.detalhe}</p>}
                      </div>
                      <span className="shrink-0 text-sm tabular-nums">{fmtUn(g.quantidade)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ZONA 4 — duas bases de valorização */}
      {comp && (
        <section className="space-y-3">
          {/* Faixa comparativa — os dois números sempre juntos, em qualquer aba. */}
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[220px] flex-1 rounded-lg border border-primary/40 bg-primary/5 p-4">
              <p className="text-xs text-muted-foreground">Custo de aterrissagem</p>
              <p className="mt-1 text-xl tabular-nums">{fmtDinheiro(comp.valor_custo)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Base contábil · ICMS excluído</p>
            </div>
            <div className="min-w-[220px] flex-1 rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Custo NF</p>
              <p className="mt-1 text-xl tabular-nums">{fmtDinheiro(comp.valor_custo_nf)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Base gerencial · produto + IPI</p>
            </div>
            <div className="min-w-[220px] flex-1 rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">ICMS creditável excluído</p>
              <p className="mt-1 text-xl tabular-nums">{fmtDinheiro(comp.icms_excluido)}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {num(comp.valor_custo) > 0
                  ? `+${((num(comp.icms_excluido) / num(comp.valor_custo)) * 100).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}%`
                  : "—"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">Diferença entre as duas bases</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium">Posição por SKU</h2>
            {fonte && (
              <Selo estado={fonte === "snapshot" ? "success" : "info"}>
                {fonte === "snapshot" ? "Snapshot congelado" : "Cálculo ao vivo"}
              </Selo>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportarAterrissagem} disabled={!filtradas.length}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Exportar Aterrissagem
              </Button>
              <Button variant="outline" size="sm" onClick={exportarCustoNf} disabled={!filtradas.length}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Exportar Custo NF
              </Button>
              <Button variant="outline" size="sm" onClick={exportarComparativo} disabled={!filtradas.length}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Exportar Comparativo
              </Button>
            </div>
          </div>

          <Tabs value={base} onValueChange={setBase}>
            <TabsList>
              <TabsTrigger value="aterrissagem">Custo de Aterrissagem</TabsTrigger>
              <TabsTrigger value="nf">Custo NF</TabsTrigger>
            </TabsList>
          </Tabs>

          <TabelaFetely
            busca={{ valor: busca, aoMudar: setBusca, placeholder: "Buscar por SKU ou produto…" }}
            carregando={posicao.isLoading}
            erro={posicao.error ? rawMessage(posicao.error) : null}
            aoTentarNovamente={() => posicao.refetch()}
            vazio={{ mensagem: "Nenhuma posição de estoque nesta competência. Registre entradas para começar." }}
            semResultado="Nenhum SKU corresponde a essa busca."
            total={linhas.length}
            exibidos={filtradas.length}
            rotulo="SKUs"
            rodapeDireita={
              totalPaginas > 1 ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={paginaAtual === 0} onClick={() => setPagina(paginaAtual - 1)}>
                    Anterior
                  </Button>
                  <span className="tabular-nums">
                    {paginaAtual + 1} / {totalPaginas}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={paginaAtual >= totalPaginas - 1}
                    onClick={() => setPagina(paginaAtual + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              ) : undefined
            }
          >
            <div className="overflow-x-auto rounded-md border">
              {base === "nf" ? (
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <Cabecalho campo="sku">SKU</Cabecalho>
                      <Cabecalho campo="produto">Produto</Cabecalho>
                      <Cabecalho campo="centro">Centro</Cabecalho>
                      <Cabecalho campo="quantidade" num>Quantidade</Cabecalho>
                      <Cabecalho campo="valor_unit_nf" num>Valor unit. NF</Cabecalho>
                      <Cabecalho campo="ipi_aliq" num>IPI %</Cabecalho>
                      <Cabecalho campo="custo_nf_unitario" num>Custo NF unitário</Cabecalho>
                      <Cabecalho campo="valor_nf_total" num>Valor total NF</Cabecalho>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visiveis.map((l, i) => {
                      const semNf = l.custo_nf_unitario == null || l.valor_nf_total == null;
                      return (
                        <tr key={`${l.sku}-${l.centro}-${i}`} className="hover:bg-muted/30">
                          <td className="whitespace-nowrap px-3 py-2 font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              {l.sku}
                              {semNf && <Selo estado="warning">Sem custo NF</Selo>}
                            </span>
                          </td>
                          <td className="max-w-[380px] truncate px-3 py-2 text-muted-foreground">{l.produto ?? "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{l.centro ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtUn(l.quantidade)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {l.valor_unit_nf == null ? "—" : fmtUnit(l.valor_unit_nf)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtAliq(l.ipi_aliq)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {l.custo_nf_unitario == null ? "—" : fmtUnit(l.custo_nf_unitario)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {l.valor_nf_total == null ? "—" : fmtDinheiro(l.valor_nf_total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 border-t bg-background">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-xs text-muted-foreground">
                        Total da competência
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtUn(totais.un)}</td>
                      <td />
                      <td />
                      <td />
                      <td className="px-3 py-2 text-right tabular-nums">{fmtDinheiro(totais.rsNf)}</td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <Cabecalho campo="sku">SKU</Cabecalho>
                      <Cabecalho campo="produto">Produto</Cabecalho>
                      <Cabecalho campo="centro">Centro</Cabecalho>
                      <Cabecalho campo="quantidade" num>Quantidade</Cabecalho>
                      <Cabecalho campo="custo_unitario" num>Custo unitário</Cabecalho>
                      <Cabecalho campo="valor_total" num>Valor total</Cabecalho>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visiveis.map((l, i) => (
                      <tr key={`${l.sku}-${l.centro}-${i}`} className="hover:bg-muted/30">
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{l.sku}</td>
                        <td className="max-w-[420px] truncate px-3 py-2 text-muted-foreground">{l.produto ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{l.centro ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtUn(l.quantidade)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtUnit(l.custo_unitario)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtDinheiro(l.valor_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 border-t bg-background">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-xs text-muted-foreground">
                        Total da competência
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtUn(totais.un)}</td>
                      <td />
                      <td className="px-3 py-2 text-right tabular-nums">{fmtDinheiro(totais.rs)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </TabelaFetely>
        </section>
      )}


      {/* ZONA 6 — política aplicada */}
      {comp?.status === "fechado" && comp.politica && (
        <Collapsible>
          <div className="rounded-lg border">
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm">
              <span>Política contábil aplicada neste fechamento</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground group-data-[state=open]:hidden" aria-hidden="true" />
              <ChevronUp className="hidden h-4 w-4 text-muted-foreground group-data-[state=open]:block" aria-hidden="true" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <dl className="divide-y border-t">
                {Object.entries(comp.politica).map(([k, v]) => (
                  <div key={k} className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2">
                    <dt className="w-[220px] shrink-0 text-xs text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 flex-1 text-sm">
                      {Array.isArray(v) ? v.join(", ") : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
              {comp.obs && (
                <p className="border-t px-3 py-2 text-xs text-muted-foreground">{comp.obs}</p>
              )}
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* Dialog — fechar */}
      <Dialog open={dialogFechar !== null} onOpenChange={(o) => { if (!o) { setDialogFechar(null); setObs(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogFechar === "forcar" ? "Fechar ignorando pendências" : `Fechar ${comp?.rotulo ?? "competência"}`}
            </DialogTitle>
            <DialogDescription>
              {dialogFechar === "forcar"
                ? "As pendências bloqueantes abaixo serão ignoradas. Explique por quê — este texto fica registrado no fechamento."
                : "A posição desta competência será congelada em snapshot."}
            </DialogDescription>
          </DialogHeader>

          {dialogFechar === "forcar" && (
            <ul className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              {gatesBloqueantes.map((g) => (
                <li key={g.gate} className="flex items-center justify-between gap-3 text-sm">
                  <span>{ROTULO_GATE[g.gate] ?? g.gate}</span>
                  <span className="tabular-nums text-destructive">{fmtUn(g.quantidade)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="obs-fechamento">
              {dialogFechar === "forcar" ? "Justificativa (mínimo 20 caracteres)" : "Observação (opcional)"}
            </Label>
            <Textarea
              id="obs-fechamento"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={4}
              placeholder={dialogFechar === "forcar" ? "Por que estamos fechando com pendências…" : "Contexto do fechamento…"}
            />
            {dialogFechar === "forcar" && (
              <p className="text-[11px] tabular-nums text-muted-foreground">{obs.trim().length} / 20</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogFechar(null); setObs(""); }}>
              Cancelar
            </Button>
            <Button
              disabled={fechar.isPending || (dialogFechar === "forcar" && obs.trim().length < 20)}
              onClick={() => fechar.mutate({ forcar: dialogFechar === "forcar", observacao: obs.trim() })}
            >
              {fechar.isPending ? "Fechando…" : dialogFechar === "forcar" ? "Fechar mesmo assim" : "Fechar competência"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — reabrir */}
      <Dialog open={dialogReabrir} onOpenChange={(o) => { if (!o) { setDialogReabrir(false); setMotivo(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir {comp?.rotulo ?? "competência"}</DialogTitle>
            <DialogDescription>
              O snapshot congelado deixa de valer enquanto a competência estiver reaberta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-reabertura">Motivo (obrigatório)</Label>
            <Textarea
              id="motivo-reabertura"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              placeholder="O que precisa ser corrigido nesta competência…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogReabrir(false); setMotivo(""); }}>
              Cancelar
            </Button>
            <Button
              disabled={reabrir.isPending || motivo.trim().length === 0}
              onClick={() => reabrir.mutate(motivo.trim())}
            >
              {reabrir.isPending ? "Reabrindo…" : "Reabrir competência"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
