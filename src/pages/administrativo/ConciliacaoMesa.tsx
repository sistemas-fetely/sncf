// Doutrina MESA-DE-CONCILIACAO (03/09/2026): o sistema propõe candidatos com
// grau de certeza (fechamento exato, identidade direta, quase-fecha, mesmo
// cliente), o humano decide, e NENHUMA conciliação acontece sem nota que
// prove o vínculo. A tela é de leitura sobre `vw_conciliacao_mesa`; a única
// escrita é a RPC `conciliar_credito_familia` — nunca UPDATE direto.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Link2,
  CheckCircle2,
  Fingerprint,
  CircleHelp,
  UserSearch,
  Loader2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Confianca =
  | "fecha_no_centavo"
  | "identidade_direta"
  | "quase_fecha"
  | "mesmo_cliente"
  | "sem_candidato";

type ConciliacaoItem = {
  movimentacao_id: string;
  conta: string | null;
  banco: string | null;
  data_transacao: string | null;
  valor: number;
  descricao: string | null;
  pagador: string | null;
  pagador_doc: string | null;
  referencia_pedido: string | null;
  origem: string | null;
  id_transacao_banco: string | null;
  dias_parado: number | null;
  pedido: string | null;
  cliente: string | null;
  titulos: string | null;
  titulo_ids: string[] | null;
  titulos_na_familia: number | null;
  soma_familia: number | null;
  haver_do_filho: number | null;
  diff_familia: number | null;
  diff_com_haver: number | null;
  diff_efetiva: number | null;
  fecha_com_haver: boolean | null;
  cliente_fantasia: string | null;
  haver_filhos_quais: string | null;
  nota_sugerida: string | null;
  score: number | null;
  nivel: number | null;
  confianca: Confianca;
};

// PROVA-DE-CARTAO-NAO-VIVE-NO-EXTRATO: a adquirente credita em lote agregado,
// entao a segunda fonte da Mesa e `safrapay_liquidacao` via vw_conciliacao_mesa_cartao.
type ConfiancaCartao = "fecha_no_centavo" | "quase_fecha" | "pago_parcial";

type CartaoItem = {
  nsu: string;
  data_venda: string | null;
  bandeira: string | null;
  parcelas_venda: number | null;
  parcelas_pagas: number | null;
  bruto_pago: number | null;
  liquido_pago: number | null;
  mdr: number | null;
  ultimo_pgto: string | null;
  cliente: string | null;
  pedidos: string | null;
  titulos_nomes: string | null;
  titulo_ids: string[] | null;
  titulos: number | null;
  soma_titulos: number | null;
  adiantamentos: number | null;
  diff: number | null;
  dias_parado: number | null;
  confianca: ConfiancaCartao;
};


const ORDEM_CONFIANCA: Exclude<Confianca, "sem_candidato">[] = [
  "fecha_no_centavo",
  "identidade_direta",
  "quase_fecha",
  "mesmo_cliente",
];

const META_CONFIANCA: Record<
  Exclude<Confianca, "sem_candidato">,
  { rotulo: string; tom: "success" | "warning" }
> = {
  fecha_no_centavo: { rotulo: "Fecha no centavo", tom: "success" },
  identidade_direta: { rotulo: "Identidade direta", tom: "success" },
  quase_fecha: { rotulo: "Quase fecha", tom: "warning" },
  mesmo_cliente: { rotulo: "Mesmo cliente", tom: "warning" },
};

export default function ConciliacaoMesa() {
  const qc = useQueryClient();
  const [filtroConfianca, setFiltroConfianca] = useState<
    Exclude<Confianca, "sem_candidato"> | null
  >(null);
  const [selecionado, setSelecionado] = useState<ConciliacaoItem | null>(null);
  const [nota, setNota] = useState("");
  const [ajuste, setAjuste] = useState("0");
  const [tituloAjuste, setTituloAjuste] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aba, setAba] = useAbaUrl("extrato");
  const [filtroCartao, setFiltroCartao] = useState<
    "fecha_no_centavo" | "quase_fecha" | null
  >(null);
  // Quando preenchido, a conciliação em curso é de cartão (RPC diferente).
  const [nsuSelecionado, setNsuSelecionado] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["conciliacao-mesa"],
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_conciliacao_mesa")
        .select("*");
      if (error) throw error;
      return (data || []) as ConciliacaoItem[];
    },
  });

  const cartaoQuery = useQuery({
    queryKey: ["conciliacao-mesa-cartao"],
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_conciliacao_mesa_cartao")
        .select("*");
      if (error) throw error;
      return (data || []) as CartaoItem[];
    },
  });

  const resumoCartao = useMemo(() => {
    const base = {
      fecha_no_centavo: { qtd: 0, soma: 0 },
      quase_fecha: { qtd: 0, soma: 0 },
      pago_parcial: { qtd: 0, soma: 0 },
    };
    for (const item of cartaoQuery.data || []) {
      const bucket = base[item.confianca];
      if (bucket) {
        bucket.qtd += 1;
        bucket.soma += Number(item.bruto_pago || 0);
      }
    }
    return base;
  }, [cartaoQuery.data]);

  const listaCartao = useMemo(() => {
    const prontos = (cartaoQuery.data || []).filter(
      (i) => i.confianca === "fecha_no_centavo" || i.confianca === "quase_fecha",
    );
    const filtrada = filtroCartao
      ? prontos.filter((i) => i.confianca === filtroCartao)
      : prontos;
    return [...filtrada].sort(
      (a, b) => Number(b.bruto_pago || 0) - Number(a.bruto_pago || 0),
    );
  }, [cartaoQuery.data, filtroCartao]);

  const totalExtrato = (data || []).filter(
    (i) => i.confianca !== "sem_candidato",
  ).length;
  const totalCartao = (cartaoQuery.data || []).filter(
    (i) => i.confianca !== "pago_parcial",
  ).length;


  const resumo = useMemo(() => {
    const vazio = {
      fecha_no_centavo: { qtd: 0, soma: 0 },
      identidade_direta: { qtd: 0, soma: 0 },
      quase_fecha: { qtd: 0, soma: 0 },
      mesmo_cliente: { qtd: 0, soma: 0 },
      sem_candidato: 0,
    };
    for (const item of data || []) {
      if (item.confianca === "sem_candidato") {
        vazio.sem_candidato += 1;
        continue;
      }
      const bucket = vazio[item.confianca];
      if (bucket) {
        bucket.qtd += 1;
        bucket.soma += Number(item.valor || 0);
      }
    }
    return vazio;
  }, [data]);

  const lista = useMemo(() => {
    const comCandidato = (data || []).filter(
      (i) => i.confianca !== "sem_candidato",
    );
    const filtrada = filtroConfianca
      ? comCandidato.filter((i) => i.confianca === filtroConfianca)
      : comCandidato;
    return filtrada.sort((a, b) => {
      const oa = ORDEM_CONFIANCA.indexOf(
        a.confianca as Exclude<Confianca, "sem_candidato">,
      );
      const ob = ORDEM_CONFIANCA.indexOf(
        b.confianca as Exclude<Confianca, "sem_candidato">,
      );
      if (oa !== ob) return oa - ob;
      return Number(b.valor || 0) - Number(a.valor || 0);
    });
  }, [data, filtroConfianca]);

  function abrirDialog(item: ConciliacaoItem) {
    setNsuSelecionado(null);
    setSelecionado(item);
    // NOTA-PRE-ESCRITA-PELA-PROVA: em fechamento exato com identidade forte a
    // view devolve a nota com os fatos. O operador confirma ou edita — nao
    // precisa transcrever a mao o que o sistema ja sabe.
    setNota(item.nota_sugerida ?? "");
    const diff = Number(item.diff_efetiva ?? item.diff_familia ?? 0);
    setAjuste(Math.abs(diff) > 0.05 ? String(diff) : "0");
    setTituloAjuste(item.titulo_ids?.[0] ?? null);
  }

  function abrirDialogCartao(item: CartaoItem) {
    const notaSugerida =
      `Liquidacao SafraPay: venda NSU ${item.nsu} de ${formatDateBR(item.data_venda)} ` +
      `(${item.bandeira ?? "—"}, ${item.parcelas_venda ?? 0}x) com todas as parcelas pagas, ` +
      `bruto ${formatBRL(item.bruto_pago)}, contra ${item.titulos_nomes ?? "—"} do ${item.pedidos ?? "—"} ` +
      `(${formatBRL(item.soma_titulos)}).`;
    const compat: ConciliacaoItem = {
      movimentacao_id: null as unknown as string,
      conta: null,
      banco: null,
      data_transacao: item.ultimo_pgto,
      valor: Number(item.bruto_pago || 0),
      descricao: null,
      pagador: null,
      pagador_doc: null,
      referencia_pedido: null,
      origem: "safrapay",
      id_transacao_banco: item.nsu,
      dias_parado: item.dias_parado,
      pedido: item.pedidos,
      cliente: item.cliente,
      titulos: item.titulos_nomes,
      titulo_ids: item.titulo_ids,
      titulos_na_familia: item.titulos,
      soma_familia: item.soma_titulos,
      haver_do_filho: null,
      diff_familia: item.diff,
      diff_com_haver: null,
      diff_efetiva: item.diff,
      fecha_com_haver: null,
      cliente_fantasia: null,
      haver_filhos_quais: null,
      nota_sugerida: notaSugerida,
      score: null,
      nivel: null,
      confianca: item.confianca as Confianca,
    };
    setNsuSelecionado(item.nsu);
    setSelecionado(compat);
    setNota(notaSugerida);
    const diff = Number(item.diff ?? 0);
    setAjuste(Math.abs(diff) > 0.05 ? String(diff) : "0");
    setTituloAjuste(item.titulo_ids?.[0] ?? null);
  }

  function fecharDialog() {
    setSelecionado(null);
    setNota("");
    setAjuste("0");
    setTituloAjuste(null);
    setNsuSelecionado(null);
  }

  async function confirmarConciliacao() {
    if (!selecionado) return;
    if (nota.trim().length < 5) return;
    setEnviando(true);
    try {
      const diff = Number(
        selecionado.diff_efetiva ?? selecionado.diff_familia ?? 0,
      );
      const { data: r, error } = nsuSelecionado
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).rpc("conciliar_cartao_liquidacao_familia", {
            p_nsu: nsuSelecionado,
            p_titulo_ids: selecionado.titulo_ids ?? [],
            p_nota: nota.trim(),
          })
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).rpc("conciliar_credito_familia", {
            p_movimentacao_id: selecionado.movimentacao_id,
            p_titulo_ids: selecionado.titulo_ids ?? [],
            p_nota: nota.trim(),
            p_ajuste_desconto: Math.abs(diff) > 0.05 ? Number(ajuste) || 0 : 0,
            p_titulo_ajuste: Math.abs(diff) > 0.05 ? tituloAjuste : null,
          });
      if (error) throw error;
      const resultado = Array.isArray(r) ? r[0] : r;
      if (!resultado?.ok) {
        throw new Error(resultado?.error || "Falha desconhecida ao conciliar");
      }
      toast.success("Crédito conciliado com sucesso");
      qc.invalidateQueries({ queryKey: ["conciliacao-mesa"] });
      qc.invalidateQueries({ queryKey: ["conciliacao-mesa-cartao"] });
      fecharDialog();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao conciliar: " + msg);
      // Diálogo permanece aberto para o operador corrigir ou cancelar.
    } finally {
      setEnviando(false);
    }
  }


  const diffSelecionado = Number(
    selecionado?.diff_efetiva ?? selecionado?.diff_familia ?? 0,
  );
  const titulosOpcoes = useMemo(() => {
    if (!selecionado?.titulo_ids) return [];
    const nomes = (selecionado.titulos || "").split(" + ");
    return selecionado.titulo_ids.map((id, i) => ({
      id,
      rotulo: nomes[i] || id,
    }));
  }, [selecionado]);

  return (
    <PageShell>
      <PageHeader
        titulo="Conciliação"
        icone={Link2}
        estado="O dinheiro de um lado, o título do outro — o sistema propõe, você decide."
      />

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="extrato">Extrato · {totalExtrato}</TabsTrigger>
          <TabsTrigger value="cartao">Cartão · {totalCartao}</TabsTrigger>
        </TabsList>

        <TabsContent value="extrato" className="mt-4 space-y-4">


      {/* Resumo por grau de certeza */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {ORDEM_CONFIANCA.map((c) => {
          const meta = META_CONFIANCA[c];
          const r = resumo[c];
          const ativo = filtroConfianca === c;
          const desabilitado = r.qtd === 0;
          return (
            <Card
              key={c}
              role="button"
              tabIndex={desabilitado ? -1 : 0}
              aria-disabled={desabilitado}
              onClick={() => {
                if (desabilitado) return;
                setFiltroConfianca((prev) => (prev === c ? null : c));
              }}
              onKeyDown={(e) => {
                if (desabilitado) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setFiltroConfianca((prev) => (prev === c ? null : c));
                }
              }}
              className={cn(
                "border transition-colors",
                desabilitado
                  ? "opacity-50 cursor-default"
                  : "cursor-pointer hover:bg-muted/40",
                ativo &&
                  (meta.tom === "success"
                    ? "border-success/60 bg-success/10"
                    : "border-warning/60 bg-warning/10"),
              )}
            >
              <CardContent className="p-4 space-y-1">
                <p
                  className={cn(
                    "text-xs",
                    meta.tom === "success" ? "text-success" : "text-warning",
                  )}
                >
                  {meta.rotulo}
                </p>
                <p className="text-xl font-medium tracking-tight">{r.qtd}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {formatBRL(r.soma)}
                </p>
              </CardContent>
            </Card>
          );
        })}
        {/* Quinto card: neutro, não clicável */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="border opacity-90 cursor-default">
              <CardContent className="p-4 space-y-1">
                <p className="text-xs text-muted-foreground">Sem candidato</p>
                <p className="text-xl font-medium tracking-tight">
                  {resumo.sem_candidato}
                </p>
                <p className="text-xs text-muted-foreground">
                  investigação manual
                </p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            Crédito sem título correspondente — precisa de investigação manual
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Lista de créditos com candidato */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : lista.length === 0 ? (
        <Card className="border">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhum crédito com candidato. Todo dinheiro identificado já foi
            conciliado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {lista.map((item) => {
            const meta = META_CONFIANCA[
              item.confianca as Exclude<Confianca, "sem_candidato">
            ];
            // HAVER-ABATE-ANTES-DE-COMPARAR: diff_efetiva ja e a menor entre
            // comparar so o titulo e comparar titulo + haver do filho.
            const diff = Number(item.diff_efetiva ?? item.diff_familia ?? 0);
            const fechaExato = Math.abs(diff) <= 0.05;
            const viaHaver = item.fecha_com_haver === true;
            const diasParado = Number(item.dias_parado || 0);
            return (
              <Card key={item.movimentacao_id} className="border">
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
                    {/* O DINHEIRO */}
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-medium font-mono tracking-tight">
                          {formatBRL(item.valor)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateBR(item.data_transacao)}
                        </span>
                        {diasParado > 30 && (
                          <Badge variant="outline" className="text-[10px]">
                            {diasParado} dias parado
                          </Badge>
                        )}
                      </div>
                      {/* RAZAO-SOCIAL-SEMPRE: o nome do banco costuma ser
                          fantasia ("LOLLIPOP"). Mostramos a razao social do
                          cliente identificado e o nome do extrato abaixo, como
                          referencia de quem apareceu no banco. */}
                      <p className="text-sm font-medium truncate">
                        {item.cliente || item.pagador || "Pagador não identificado"}
                      </p>
                      {item.cliente && item.pagador && (
                        <p className="text-xs text-muted-foreground truncate">
                          no extrato: {item.pagador}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {item.descricao}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[item.conta, item.banco].filter(Boolean).join(" · ")}
                      </p>
                    </div>

                    {/* CERTEZA AO CENTRO */}
                    <div className="flex md:flex-col items-center justify-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          meta.tom === "success"
                            ? "border-success/40 text-success"
                            : "border-warning/40 text-warning",
                        )}
                      >
                        {meta.tom === "success" ? (
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                        ) : item.confianca === "quase_fecha" ? (
                          <CircleHelp className="mr-1 h-3 w-3" />
                        ) : (
                          <UserSearch className="mr-1 h-3 w-3" />
                        )}
                        {meta.rotulo}
                      </Badge>
                      {fechaExato ? (
                        <span className="text-[11px] font-medium text-success">
                          fecha exato
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-warning">
                          {diff > 0 ? "faltam" : "sobram"}{" "}
                          {formatBRL(Math.abs(diff))}
                        </span>
                      )}
                      {viaHaver && (
                        <span className="text-[10px] text-muted-foreground text-center">
                          inclui {formatBRL(Number(item.haver_do_filho ?? 0))} de
                          haver da remessa filha
                        </span>
                      )}
                    </div>

                    {/* O TÍTULO */}
                    <div className="min-w-0 space-y-1 md:text-right">
                      <p className="text-sm font-medium truncate">
                        {item.cliente || "Cliente não identificado"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.pedido}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.titulos}
                      </p>
                      <p className="text-sm font-mono">
                        {formatBRL(item.soma_familia ?? 0)}
                      </p>
                      {(item.titulos_na_familia ?? 0) > 1 && (
                        <p className="text-[11px] text-muted-foreground">
                          {item.titulos_na_familia} parcelas somadas
                        </p>
                      )}
                      {viaHaver && (
                        <p className="text-[11px] text-muted-foreground">
                          + {formatBRL(Number(item.haver_do_filho ?? 0))} de haver
                          ={" "}
                          {formatBRL(
                            Number(item.soma_familia ?? 0) +
                              Number(item.haver_do_filho ?? 0),
                          )}
                        </p>
                      )}
                      <div className="md:justify-end flex pt-1">
                        <Button
                          size="sm"
                          onClick={() => abrirDialog(item)}
                          className="gap-1.5"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          {item.nota_sugerida ? "Conciliar" : "Analisar"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
        </TabsContent>

        <TabsContent value="cartao" className="mt-4 space-y-4">
          {/* Resumo do cartão */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {(["fecha_no_centavo", "quase_fecha"] as const).map((c) => {
              const r = resumoCartao[c];
              const ativo = filtroCartao === c;
              const desabilitado = r.qtd === 0;
              const sucesso = c === "fecha_no_centavo";
              return (
                <Card
                  key={c}
                  role="button"
                  tabIndex={desabilitado ? -1 : 0}
                  aria-disabled={desabilitado}
                  onClick={() => {
                    if (desabilitado) return;
                    setFiltroCartao((prev) => (prev === c ? null : c));
                  }}
                  onKeyDown={(e) => {
                    if (desabilitado) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setFiltroCartao((prev) => (prev === c ? null : c));
                    }
                  }}
                  className={cn(
                    "border transition-colors",
                    desabilitado
                      ? "opacity-50 cursor-default"
                      : "cursor-pointer hover:bg-muted/40",
                    ativo &&
                      (sucesso
                        ? "border-success/60 bg-success/10"
                        : "border-warning/60 bg-warning/10"),
                  )}
                >
                  <CardContent className="p-4 space-y-1">
                    <p
                      className={cn(
                        "text-xs",
                        sucesso ? "text-success" : "text-warning",
                      )}
                    >
                      {sucesso ? "Fecha no centavo" : "Quase fecha"}
                    </p>
                    <p className="text-xl font-medium tracking-tight">
                      {r.qtd}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {formatBRL(r.soma)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
            <Tooltip>
              <TooltipTrigger asChild>
                <Card className="border opacity-90 cursor-default">
                  <CardContent className="p-4 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Aguardando parcelas
                    </p>
                    <p className="text-xl font-medium tracking-tight">
                      {resumoCartao.pago_parcial.qtd}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {formatBRL(resumoCartao.pago_parcial.soma)}
                    </p>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                A adquirente ainda não pagou todas as parcelas da venda — é
                calendário, não conciliação
              </TooltipContent>
            </Tooltip>
          </div>

          {cartaoQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : listaCartao.length === 0 ? (
            <Card className="border">
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                Nenhuma venda de cartão pronta para conciliar.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {listaCartao.map((item) => {
                const diff = Number(item.diff ?? 0);
                const fechaExato = Math.abs(diff) <= 0.05;
                const sucesso = item.confianca === "fecha_no_centavo";
                const diasParado = Number(item.dias_parado || 0);
                return (
                  <Card key={item.nsu} className="border">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
                        {/* O DINHEIRO */}
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-lg font-medium font-mono tracking-tight">
                              {formatBRL(item.bruto_pago)}
                            </span>
                            {diasParado > 30 && (
                              <Badge variant="outline" className="text-[10px]">
                                {diasParado} dias parado
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm">
                            {item.parcelas_pagas ?? 0} de{" "}
                            {item.parcelas_venda ?? 0} parcelas pagas
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.bandeira} · NSU {item.nsu}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            venda em {formatDateBR(item.data_venda)} · último
                            pagamento {formatDateBR(item.ultimo_pgto)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            MDR {formatBRL(item.mdr)}
                          </p>
                        </div>

                        {/* CERTEZA AO CENTRO */}
                        <div className="flex md:flex-col items-center justify-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              sucesso
                                ? "border-success/40 text-success"
                                : "border-warning/40 text-warning",
                            )}
                          >
                            {sucesso ? (
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                            ) : (
                              <CircleHelp className="mr-1 h-3 w-3" />
                            )}
                            {sucesso ? "Fecha no centavo" : "Quase fecha"}
                          </Badge>
                          {fechaExato ? (
                            <span className="text-[11px] font-medium text-success">
                              fecha exato
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-warning">
                              {diff > 0 ? "faltam" : "sobram"}{" "}
                              {formatBRL(Math.abs(diff))}
                            </span>
                          )}
                        </div>

                        {/* O TÍTULO */}
                        <div className="min-w-0 space-y-1 md:text-right">
                          <p className="text-sm font-medium truncate">
                            {item.cliente || "Cliente não identificado"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.pedidos}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.titulos_nomes}
                          </p>
                          <p className="text-sm font-mono">
                            {formatBRL(item.soma_titulos ?? 0)}
                          </p>
                          {Number(item.adiantamentos ?? 0) > 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              + {formatBRL(item.adiantamentos)} de adiantamento
                            </p>
                          )}
                          {(item.titulos ?? 0) > 1 && (
                            <p className="text-[11px] text-muted-foreground">
                              {item.titulos} títulos somados
                            </p>
                          )}
                          <div className="md:justify-end flex pt-1">
                            <Button
                              size="sm"
                              onClick={() => abrirDialogCartao(item)}
                              className="gap-1.5"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              Conciliar
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>


      {/* Diálogo de confirmação */}
      <Dialog
        open={!!selecionado}
        onOpenChange={(o) => !o && !enviando && fecharDialog()}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5" />
              Confirmar conciliação
            </DialogTitle>
            <DialogDescription>
              O vínculo abaixo será gravado com a sua nota como prova.
            </DialogDescription>
          </DialogHeader>

          {selecionado && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">
                    {selecionado.cliente ||
                      selecionado.pagador ||
                      "Pagador não identificado"}
                  </span>
                  <span className="font-mono text-sm font-medium">
                    {formatBRL(selecionado.valor)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDateBR(selecionado.data_transacao)} →{" "}
                  {selecionado.cliente} · {selecionado.pedido} ·{" "}
                  {selecionado.titulos} (
                  {formatBRL(selecionado.soma_familia ?? 0)})
                </p>
              </div>

              {Math.abs(diffSelecionado) > 0.05 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">
                      Ajuste (desconto/tarifa)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={ajuste}
                      onChange={(e) => setAjuste(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">
                      Lançar ajuste no título
                    </label>
                    <Select
                      value={tituloAjuste ?? undefined}
                      onValueChange={setTituloAjuste}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Escolher título" />
                      </SelectTrigger>
                      <SelectContent>
                        {titulosOpcoes.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.rotulo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  {selecionado.nota_sugerida
                    ? "Nota (escrita pelo sistema — confira e edite se quiser)"
                    : "Nota (obrigatória, mínimo 5 caracteres)"}
                </label>
                <Textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Explique o que prova este vínculo"
                  rows={selecionado.nota_sugerida ? 4 : 3}
                />
                {selecionado.nota_sugerida && (
                  <p className="text-[11px] text-muted-foreground">
                    O sistema tem prova suficiente neste caso. Basta confirmar.
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={fecharDialog}
              disabled={enviando}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmarConciliacao}
              disabled={enviando || nota.trim().length < 5}
              className="gap-2"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
