import { toast } from "sonner";
import { RodapePaginacao } from "@/components/tabela/RodapePaginacao";
import { PageShell } from "@/components/layout/PageShell";
import { formatError } from "@/lib/format-error";
import { PageHeader } from "@/components/layout/PageHeader";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { abrirDetalhe } from "@/lib/navegacao/abrirDetalhe";
import { useEstadoTela } from "@/lib/navegacao/useEstadoTela";
import { useFocoAoVoltar } from "@/lib/navegacao/useFocoAoVoltar";
import { useRestaurarScroll } from "@/lib/navegacao/useRestaurarScroll";
import { resolverAcao, lerOrdemKD, escreverOrdemKD, lerConjunto, escreverConjunto, type OrdemKD } from "@/lib/navegacao/codecUrl";
import { supabase } from "@/integrations/supabase/client";
import { BotaoFilaSemPedido, GavetaFilaSemPedido } from "@/components/financeiro/FilaRecebivelSemPedido";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDownToLine, Inbox, ArrowUpDown, ArrowUp, ArrowDown, Download, ChevronDown, ChevronRight, Info, X, SearchX } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RecebiveisPorClienteTab } from "@/components/clientes/RecebiveisPorClienteTab";
import { RecebiveisMarketplaceTab } from "@/components/financeiro/RecebiveisMarketplaceTab";
import { AbaPermitida, ConteudoAba } from "@/components/AbaGate";

import { formatBRL, formatDateBR } from "@/lib/format-currency";
import * as XLSX from "xlsx";
import { useNivel } from "@/hooks/useNivel";
import { useListaPaginada, exportarLista, numeroAgregado, gruposAgregado, type ParamsLista, type FiltroLista, type AgregadoLista } from "@/lib/lista/useListaPaginada";
import { useTituloEstadoKpisFiltro } from "@/hooks/financeiro/useTituloEstadoKpis";
import type { TituloSaldo } from "@/hooks/financeiro/useTituloSaldo";
import {
  ValorSaldo,
  BadgeParcelasAcerto,
  BadgeAcerto,
  LinhaTituloPai,
} from "@/components/financeiro/SaldoTitulo";

type RecebivelB2B = {
  grupo_chave: string;
  vencido_contabil: boolean | null;
  cobravel_hoje: boolean | null;
  em_carencia_bancaria: boolean | null;
  faixa_aging: string | null;

  id: string;
  numero_titulo: string | null;
  numero_parcela: number | null;
  total_parcelas: number | null;
  cliente: string | null;
  meio_pagamento: string | null;
  banco_nome: string | null;
  nf_numero: string | null;
  data_compra: string | null;
  data_vencimento: string | null;
  valor: number | null;
  data_liquidacao: string | null;
  liquidacao_realizada: boolean | null;
  pago: boolean | null;
  liquidado: boolean | null;
  conciliado: boolean | null;
  liquidacao_confirmada_banco: boolean | null;
  /* colunas novas */
  valor_efetivo: number | null;
  valor_juros: number | null;
  valor_desconto: number | null;
  valor_bruto: number | null;
  data_vencimento_original: string | null;
  venc_renegociado: boolean | null;
  dias_prorrogado: number | null;
  data_pagamento: string | null;
  pedido_id: string | null;
  pedido_ref: string | null;
  mes_competencia: string | null;
  gera_caixa: boolean | null;
  tem_prova_bancaria: boolean | null;
  /* hierarquia da verdade da data de recebimento */
  data_recebimento: string | null;
  data_recebimento_efetiva: string | null;
  fonte_data_recebimento: "banco" | "marcado_humano" | "sem_recebimento" | null;
  data_pagamento_banco: string | null;
  data_divergente: boolean | null;
  /* meio do pedido (intenção comercial) vs meio do título */
  meio_pedido: string | null;
  meio_pedido_nome: string | null;
  meio_divergente: boolean | null;
  mes_caixa_efetivo: string | null;
  /* data de fluxo de caixa: banco quando existe, régua enquanto não existe */
  data_caixa_projetada: string | null;
  mes_caixa_projetado: string | null;
  /* eixo faturamento removido: a view só traz título faturado (com NF) */
  data_liquidacao_prevista: string | null;
  desvio_previsao_dias: number | null;
  /* eixos legados mantidos no tipo (a view continua entregando) */
  eixo_prova: string | null;
  eixo_status: string | null;

  compensado_por: "banco" | "manual" | null;
  eh_inadimplencia: boolean | null;
  condicao_parcelamento: string | null;
  /* envelope de gestão (vw_recebivel_gestao) */
  eixo_recebimento: EixoRecebimento | null;
  eixo_instrumento: string | null;
  eh_inadimplente: boolean | null;
  estado_rotulo: string | null;
  estado_cor: string | null;
  estado_ordem: number | null;
  estado_em_aberto: boolean | null;
  carteira_codigo: string | null;
  carteira_nome: string | null;
  carteira_ordem: number | null;
  carteira_rotulo_data: string | null;
  carteira_previsao_confiavel: boolean | null;
  carteira_gera_caixa: boolean | null;
  data_vencimento_nf: string | null;
  data_vencimento_instrumento: string | null;
  data_vencimento_vigente: string | null;
  desvio_registro_dias: number | null;
  sobreposicao_instrumento: boolean | null;
  renegociacao_humana: boolean | null;
  qualidade: "firme" | "em_registro" | "promessa" | "sem_prova" | null;
  /* ESTADO x PROVAS — envelope de eixos vindo do banco */
  dinheiro_no_banco: boolean | null;
  recebimento_rotulo: string | null;
  recebimento_ordem: number | null;
  recebimento_classe: string | null;
  recebimento_tooltip: string | null;
  prazo_rotulo: string | null;
  prazo_ordem: number | null;
  prazo_classe: string | null;
  prazo_classe_texto: string | null;
  instrumento_rotulo: string | null;
  instrumento_ordem: number | null;
  instrumento_classe: string | null;
  instrumento_tooltip: string | null;
  data_liquidacao_real: string | null;
  aguardando_credito: boolean | null;
  relogio_pontualidade: "cliente" | "adquirente" | null;
  dias_atraso_adquirente: number | null;
  eixo_prazo: string | null;
};


/** O dinheiro chegou? Eixo único de recebimento da view de gestão. */
type EixoRecebimento = "em_aberto" | "quitado" | "compensado" | "devolvido" | "cancelado";

const RECEBIMENTO_LABEL: Record<EixoRecebimento, string> = {
  em_aberto: "Em aberto",
  quitado: "Quitado",
  compensado: "Compensado",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
};

const RECEBIMENTO_ORDEM: EixoRecebimento[] = [
  "em_aberto",
  "quitado",
  "compensado",
  "devolvido",
  "cancelado",
];

/** Achados de qualidade de dado, com denominador explícito. */
type Achado =
  | "sobreposicao"
  | "renegociacao"
  | "sem_prova"
  | "data_divergente"
  | "meio_divergente"
  | "inadimplente";

/** Instrumento que prova a cobrança registrada no banco. */
const INSTRUMENTO_GARANTIDO = ["registrado", "conciliado", "liquidado_banco", "venda_autorizada"];

/** Cor semântica do estado, como a view a declara. */
const CLASSE_ESTADO: Record<string, string> = {
  destructive: "bg-destructive/10 text-destructive border-0",
  amber: "bg-warning/10 text-warning border-0",
  emerald: "bg-success/10 text-success border-0",
  muted: "bg-muted text-muted-foreground border-0",
};

function BadgeEstado({ rotulo, cor }: { rotulo: string | null; cor: string | null }) {
  if (!rotulo) return <span className="text-muted-foreground">—</span>;
  const classe = cor ? CLASSE_ESTADO[cor] : undefined;
  if (!classe)
    return (
      <Badge variant="outline" className="text-xs">
        {rotulo}
      </Badge>
    );
  return <Badge className={`text-xs ${classe}`}>{rotulo}</Badge>;
}

type RecebivelB2C = {
  movimentacao_id: string;
  data_transacao: string | null;
  valor_liquido_mp: number | null;
  tipo_meio: string | null;
  mp_payment_id: string | null;
  shopify_id: string | null;
  order_name: string | null;
  pedido_total_bruto: number | null;
  financial_status: string | null;
  shipping_city: string | null;
  shipping_province: string | null;
  created_at_shopify: string | null;
  status_atribuicao: string | null;
  via_chave: string | null;
};

const PAGE_SIZE = 25;

/** Tabela "Mês a mês" oculta temporariamente (decisão do Flavio, 03/08/2026).
 *  Toda a lógica continua ativa — trocar para true devolve a renderização. */
const MOSTRAR_MES_A_MES = false;

type DataBase = "vencimento" | "emissao" | "recebimento";
type BaseMensal = "competencia" | "caixa_projetado" | "caixa_confirmado";

const SEM_CAIXA = ["haver", "bonificacao", "devolucao", "sem_pagamento"];

const capitalize = (s: string) =>
  s
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");

const formatMeio = (m: string | null) => (m ? capitalize(m.replace(/_/g, " ")) : "—");


const efetivoDe = (t: RecebivelB2B) => Number(t.valor_efetivo ?? t.valor ?? 0);

/** Faixa de KPI é densa: valor sem centavos. Centavos só na tabela. */
const formatBRLCurto = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(v || 0));

/* As chaves são as MESMAS de `vw_titulo_estado.faixa_aging` — nada de faixa própria. */
type ChaveFaixa = "1-7" | "8-30" | "31-60" | "60+";

const FAIXAS_ATRASO: readonly [ChaveFaixa, string][] = [
  ["1-7", "1–7 dias de atraso"],
  ["8-30", "8–30 dias de atraso"],
  ["31-60", "31–60 dias de atraso"],
  ["60+", "+60 dias de atraso"],
];


/** Coluna da faixa de KPI: densa, clicável, ~90px de altura. */
function ColunaKpi({
  rotulo,
  valor,
  sublinha,
  corValor,
  ativo,
  onClick,
  extraRotulo,
  corpo,
}: {
  rotulo: string;
  valor: string;
  sublinha?: string;
  corValor?: string;
  ativo: boolean;
  onClick: () => void;
  extraRotulo?: React.ReactNode;
  corpo?: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={
        "cursor-pointer px-4 py-3.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring " +
        (ativo ? "bg-muted" : "hover:bg-muted/40")
      }
    >
      <div className="flex items-center gap-1.5">
        <span
          className={
            "text-xs text-muted-foreground " + (ativo ? "font-medium" : "")
          }
        >
          {rotulo}
        </span>
        {extraRotulo}
      </div>
      <div className={"text-[22px] font-medium leading-tight tabular-nums " + (corValor ?? "")}>
        {valor}
      </div>
      {sublinha && (
        <p className="text-xs text-muted-foreground tabular-nums">{sublinha}</p>
      )}
      {corpo}
    </div>
  );
}

const fmtDesvio = (d: number | null | undefined) => {
  if (d == null || d === 0) return "";
  return `${d > 0 ? "+" : "−"}${Math.abs(d)}d`;
};

const iso = (d: Date) => {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dia = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dia}`;
};

const mesKeyDe = (v: string | null | undefined) => (v ? String(v).slice(0, 7) : null);

const rotuloMes = (key: string) => {
  const [y, m] = key.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(m) - 1] ?? m}/${y}`;
};

/** Rótulo curto de mês: "jun/26". */
const rotuloMesCurto = (key: string) => {
  const [y, m] = key.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(m) - 1] ?? m}/${y.slice(2)}`;
};


/** Atalhos de período: retornam [de, ate] em ISO. */
function atalhoPeriodo(tipo: "atual" | "anterior" | "tres" | "todo"): [string, string] {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (tipo === "todo") return ["", ""];
  if (tipo === "atual") {
    const de = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ate = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return [iso(de), iso(ate)];
  }
  if (tipo === "anterior") {
    const de = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const ate = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return [iso(de), iso(ate)];
  }
  const de = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
  const ate = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  return [iso(de), iso(ate)];
}

function AtalhosPeriodo({
  onPick,
  de,
  ate,
}: {
  onPick: (de: string, ate: string) => void;
  de?: string;
  ate?: string;
}) {
  const itens: { key: "atual" | "anterior" | "tres" | "todo"; label: string }[] = [
    { key: "atual", label: "Mês atual" },
    { key: "anterior", label: "Mês anterior" },
    { key: "tres", label: "Últimos 3 meses" },
    { key: "todo", label: "Todo o período" },
  ];
  const ativo = de !== undefined && ate !== undefined;
  return (
    <div className="flex flex-wrap gap-2">
      {itens.map((i) => {
        const [deAtalho, ateAtalho] = atalhoPeriodo(i.key);
        const selecionado = ativo && de === deAtalho && ate === ateAtalho;
        return (
          <Button
            key={i.key}
            size="sm"
            variant={selecionado ? "default" : "outline"}
            onClick={() => {
              const [de, ate] = atalhoPeriodo(i.key);
              onPick(de, ate);
            }}
          >
            {i.label}
          </Button>
        );
      })}
    </div>
  );
}

export default function ContasReceber() {
  const [aba, setAba] = useAbaUrl("b2b");
  const [exportador, setExportador] = useState<{ fn: () => void; ativo: boolean } | null>(null);
  const { temNivel } = useNivel();

  return (
    <PageShell>
      <PageHeader
        titulo="Recebíveis"
        icone={ArrowDownToLine}
        estado="Recebíveis B2B por parcela — somente títulos faturados, com NF emitida. Para todos os títulos, ver Cobrança em Controladoria. Valor efetivo inclui juros e desconto. Somente leitura."
      />

      <Tabs value={aba} onValueChange={setAba}>
        <div className="flex items-center justify-between gap-4">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="b2b">B2B</TabsTrigger>
            <TabsTrigger value="b2c">B2C</TabsTrigger>
            <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
            <AbaPermitida slug="tela.cliente_recebiveis">
              <TabsTrigger value="por-cliente">Por cliente</TabsTrigger>
            </AbaPermitida>
          </TabsList>
          {/* Exportação leva a base para fora: nível 3 (Coordenador) para cima. */}
          {temNivel(3) && (
            <Button
              variant="outline"
              onClick={() => exportador?.fn()}
              disabled={!exportador?.ativo}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Exportar XLSX
            </Button>
          )}
        </div>
        <TabsContent value="b2b" className="mt-4">
          <AbaB2B onRegistrarExport={setExportador} />
        </TabsContent>
        <TabsContent value="b2c" className="mt-4">
          <AbaB2C onRegistrarExport={setExportador} />
        </TabsContent>
        <TabsContent value="marketplace" className="mt-4">
          <RecebiveisMarketplaceTab onRegistrarExport={setExportador} />
        </TabsContent>
        <TabsContent value="por-cliente" className="mt-4">
          <ConteudoAba slug="tela.cliente_recebiveis">
            <RecebiveisPorClienteTab />
          </ConteudoAba>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}


/* ============================ B2B ============================ */

function AbaB2B({ onRegistrarExport }: { onRegistrarExport: (e: { fn: () => void; ativo: boolean }) => void }) {
  const navigate = useNavigate();
  const location = useLocation();

  /* TELA-LEMBRA-ONDE-EU-ESTAVA: filtros da aba B2B na URL (prefixo "b2b"). */
  const [est, setEst] = useEstadoTela(
    {
      busca: "", dataBase: "emissao", dataDe: "", dataAte: "", banco: "todos", carteira: "",
      instr: "", prazo: "todos", baseMensal: "competencia", receb: "em_aberto",
      page: 1, sort: "data_compra:desc", agrupado: true,
    },
    { prefixo: "b2b", replaceKeys: ["busca"] },
  );
  const busca = est.busca;
  const setBusca = (v: string) => setEst({ busca: v });
  const dataBase = est.dataBase as DataBase;
  const setDataBase = (v: DataBase) => setEst({ dataBase: v });
  const dataDe = est.dataDe;
  const setDataDe = (v: string) => setEst({ dataDe: v });
  const dataAte = est.dataAte;
  const setDataAte = (v: string) => setEst({ dataAte: v });
  const filtroBanco = est.banco;
  const setFiltroBanco = (v: string) => setEst({ banco: v });
  const carteiraAtiva = est.carteira || null;
  const setCarteiraAtiva = (v: string | null) => setEst({ carteira: v ?? "" });
  const [achado, setAchado] = useState<Achado | null>(null);
  /** Par mutuamente exclusivo da faixa de KPI. Ambos forçam "em aberto". */
  type FiltroInstr = "garantido" | "sem_instrumento" | null;
  const filtroInstrumento = (est.instr || null) as FiltroInstr;
  const setFiltroInstrumento = (v: React.SetStateAction<FiltroInstr>) =>
    setEst({ instr: resolverAcao(v, filtroInstrumento) ?? "" });
  /**
   * PRAZO-TRI-STATE (03/09/2026): "vencido" não é um valor do eixo
   * `eixo_recebimento` — é um subconjunto de "Em aberto". Um sexto chip
   * faria os totais deixarem de somar. O controle de prazo fica fora da fila.
   */
  type FiltroPrazo = "todos" | "a_vencer" | "vencidos" | "cobravel" | "carencia";
  const filtroPrazo = est.prazo as FiltroPrazo;
  const setFiltroPrazo = (v: React.SetStateAction<FiltroPrazo>) =>
    setEst({ prazo: resolverAcao(v, filtroPrazo) });

  const [qualidadeAberta, setQualidadeAberta] = useState(false);
  const baseMensal = est.baseMensal as BaseMensal;
  const setBaseMensal = (v: BaseMensal) => setEst({ baseMensal: v });
  const recebimentosAtivos = useMemo(() => lerConjunto<EixoRecebimento>(est.receb), [est.receb]);
  const setRecebimentosAtivos = (v: React.SetStateAction<Set<EixoRecebimento>>) =>
    setEst({ receb: escreverConjunto(resolverAcao(v, recebimentosAtivos)) });

  const page = est.page;
  const setPage = (v: React.SetStateAction<number>) => setEst({ page: resolverAcao(v, page) });
  const sort = lerOrdemKD(est.sort);
  const setSort = (v: React.SetStateAction<OrdemKD>) => setEst({ sort: escreverOrdemKD(resolverAcao(v, sort)) });

  const agrupado = est.agrupado;
  const setAgrupado = (v: boolean) => setEst({ agrupado: v });
  const relacao = "vw_recebivel_gestao_lista";
  const eq = (c: string, v: unknown): FiltroLista => ({ c, op: "eq", v });
  const sim = (c: string): FiltroLista => ({ c, op: "is_true" });
  const naoRecebidoFiltros: FiltroLista[] = [sim("nao_recebido")];
  const naoRecebido = (t: RecebivelB2B) => t.dinheiro_no_banco === false && t.carteira_gera_caixa !== false;
  const estaVencido = (t: RecebivelB2B) => t.vencido_contabil === true;
  const achadoFiltro = (a: Achado): FiltroLista => a === "sem_prova"
    ? eq("fonte_data_recebimento", "marcado_humano")
    : sim(({ sobreposicao: "sobreposicao_instrumento", renegociacao: "renegociacao_humana", data_divergente: "data_divergente", meio_divergente: "meio_divergente", inadimplente: "vencido_contabil" } as Record<string, string>)[a]);
  const colunaData = dataBase === "vencimento" ? "data_ref_vencimento" : dataBase === "emissao" ? "data_compra" : "data_recebimento";
  const filtrosBase: FiltroLista[] = [
    ...(filtroBanco !== "todos" ? [eq("banco_nome", filtroBanco)] : []),
    ...(dataDe ? [{ c: colunaData, op: "gte" as const, v: dataDe }] : []),
    ...(dataAte ? [{ c: colunaData, op: "lte" as const, v: dataAte }] : []),
  ];
  const filtrosInstrumento: FiltroLista[] = !filtroInstrumento ? [] : [
    ...naoRecebidoFiltros,
    filtroInstrumento === "garantido" ? { c: "eixo_instrumento", op: "in", v: INSTRUMENTO_GARANTIDO } : eq("eixo_instrumento", "sem_instrumento"),
  ];
  const filtrosPrazo: FiltroLista[] = filtroPrazo === "todos" ? [] : filtroPrazo === "a_vencer"
    ? [...naoRecebidoFiltros, { c: "vencido_contabil", op: "not_true" }]
    : [sim(filtroPrazo === "vencidos" ? "vencido_contabil" : filtroPrazo === "cobravel" ? "cobravel_hoje" : "em_carencia_bancaria")];
  const filtrosCarteira: FiltroLista[] = [
    ...(carteiraAtiva ? [eq("carteira_codigo", carteiraAtiva)] : []),
    ...(achado ? [achadoFiltro(achado)] : []),
  ];
  const filtrosFinais = [...filtrosBase, ...filtrosInstrumento, ...filtrosPrazo, ...filtrosCarteira,
    { c: "eixo_recebimento", op: "in" as const, v: [...recebimentosAtivos] }];
  const ordem: NonNullable<ParamsLista["ordem"]> = sort ? [{ c: sort.key, dir: sort.dir }] : [{ c: "data_vencimento", dir: "asc" }];
  const listaParams: ParamsLista & { agrupar?: string } = { relacao, busca, filtros: filtrosFinais, ordem, pagina: page, tamanho: PAGE_SIZE,
    ...(agrupado ? { agrupar: "grupo_chave" } : {}) };
  const listaQ = useListaPaginada<RecebivelB2B>(listaParams, { debounceMs: 0 });
  const paginaLinhas = listaQ.data?.linhas ?? [];
  const chavesPagina = [...new Set(paginaLinhas.map(t => t.grupo_chave))];
  const filtrados = paginaLinhas;
  const count = (id: string, onde: FiltroLista[] = [], por?: string[]): AgregadoLista => ({ id, fn: "count", onde, por });
  const sum = (id: string, c: string, onde: FiltroLista[] = [], por?: string[]): AgregadoLista => ({ id, fn: "sum", c, onde, por });
  const instrGarantido: FiltroLista[] = [...naoRecebidoFiltros, { c: "eixo_instrumento", op: "in", v: INSTRUMENTO_GARANTIDO }];
  const instrSem = [...naoRecebidoFiltros, eq("eixo_instrumento", "sem_instrumento")];
  const baseAgregados: AgregadoLista[] = [count("n"), count("carteirasBusca", [], ["carteira_nome"]),
    sum("aReceber", "efetivo", naoRecebidoFiltros), count("aReceberQtd", naoRecebidoFiltros),
    sum("aReceberSemData", "efetivo", [...naoRecebidoFiltros, { c: "data_vencimento_vigente", op: "is_null" }]),
    sum("garantido", "efetivo", instrGarantido), count("garantidoQtd", instrGarantido),
    sum("semInstrumento", "efetivo", instrSem), count("semInstrumentoQtd", instrSem),
    count("carteiras", [{ op: "or", v: [{ c: "carteira_gera_caixa", op: "eq", v: true }, { c: "carteira_gera_caixa", op: "is_null" }] }], ["carteira_codigo", "carteira_nome", "carteira_ordem", "carteira_previsao_confiavel", "carteira_rotulo_data"]),
    sum("carteirasAberto", "efetivo", naoRecebidoFiltros, ["carteira_codigo"]), count("carteirasQtd", naoRecebidoFiltros, ["carteira_codigo"]),
    sum("aging", "efetivo", [sim("vencido_contabil")], ["faixa_aging"]),
    ...["vencido_contabil", "cobravel_hoje", "em_carencia_bancaria"].flatMap(c => [sum(c, "efetivo", [sim(c)]), count(c + "Qtd", [sim(c)])]),
  ];
  const resumoQ = useListaPaginada({ relacao, busca, filtros: filtrosBase, tamanho: 1, colunas: ["id"], agregados: baseAgregados }, { debounceMs: 0 });
  const chipsQ = useListaPaginada({ relacao, busca, filtros: [...filtrosBase, ...filtrosInstrumento, ...filtrosPrazo, ...filtrosCarteira], tamanho: 1, colunas: ["id"], agregados: [count("chips", [], ["eixo_recebimento"]), count("n")] }, { debounceMs: 0 });
  const chipsSemKpiQ = useListaPaginada({ relacao, busca, filtros: [...filtrosBase, ...filtrosCarteira], tamanho: 1, colunas: ["id"], agregados: [count("chips", [], ["eixo_recebimento"])] }, { debounceMs: 0 });
  const prazoQ = useListaPaginada({ relacao, busca, filtros: [...filtrosBase, ...filtrosInstrumento, ...filtrosCarteira], tamanho: 1, colunas: ["id"], agregados: [count("vencidos", [sim("vencido_contabil")]), count("aVencer", [...naoRecebidoFiltros, { c: "vencido_contabil", op: "not_true" }])] }, { debounceMs: 0 });
  const achadoChaves: Achado[] = ["sobreposicao", "renegociacao", "sem_prova", "data_divergente", "meio_divergente", "inadimplente"];
  const mesColuna = baseMensal === "competencia" ? "mes_competencia" : baseMensal === "caixa_projetado" ? "mes_caixa_projetado" : "mes_caixa_efetivo";
  const mensalOnde: FiltroLista[] = [{ op: "or", v: [{ c: "eixo_recebimento", op: "nin", v: ["cancelado", "devolvido"] }, { c: "eixo_recebimento", op: "is_null" }] }, { c: mesColuna, op: "not_null" }, ...(baseMensal === "caixa_confirmado" ? [{ c: "data_recebimento_efetiva", op: "not_null" as const }] : [])];
  const mensalEstado = (k: string): FiltroLista[] => k === "recebido" ? [{ c: "eixo_recebimento", op: "in", v: ["compensado", "quitado"] }]
    : [{ op: "or", v: [{ c: "eixo_recebimento", op: "nin", v: ["compensado", "quitado"] }, { c: "eixo_recebimento", op: "is_null" }] }, { c: "vencido_contabil", op: k === "atrasado" ? "is_true" : "not_true" }];
  const globalQ = useListaPaginada({ relacao, tamanho: 1, colunas: ["id"], agregados: [count("n"), count("bancos", [], ["banco_nome"]), count("recebMeta", [], ["eixo_recebimento", "recebimento_rotulo", "recebimento_ordem"]), ...achadoChaves.map(a => count(a, [achadoFiltro(a)])),
    count("mensalFooterN", mensalOnde), sum("mensalFooterTotal", "efetivo", mensalOnde),
    ...["recebido", "aberto", "atrasado"].map(k => sum("mensalFooter_" + k, "efetivo", [...mensalOnde, ...mensalEstado(k)])),
    count("mensalN", mensalOnde, [mesColuna]), sum("mensalTotal", "efetivo", mensalOnde, [mesColuna]),
    ...["recebido", "aberto", "atrasado"].map(k => sum("mensal_" + k, "efetivo", [...mensalOnde, ...mensalEstado(k)], [mesColuna])),
  ] });
  const universoQ = useListaPaginada({ relacao, tamanho: 1, colunas: ["id"], agregados: [
    { ...count("n", [{ c: "grupo_chave", op: "in", v: chavesPagina }], ["grupo_chave"]), ignorar: ["*"] },
    { ...sum("total", "efetivo", [{ c: "grupo_chave", op: "in", v: chavesPagina }], ["grupo_chave"]), ignorar: ["*"] },
  ] }, { enabled: agrupado && chavesPagina.length > 0 && !listaQ.isPlaceholderData });
  const a = resumoQ.data?.agregados;
  const n = (id: string) => numeroAgregado(a, id);
  const estadoCarteira = { aReceber: n("aReceber"), aReceberQtd: n("aReceberQtd"), aReceberSemData: n("aReceberSemData"), garantido: n("garantido"), garantidoQtd: n("garantidoQtd"), semInstrumento: n("semInstrumento"), semInstrumentoQtd: n("semInstrumentoQtd"), outros: n("aReceber") - n("garantido") - n("semInstrumento"), outrosQtd: n("aReceberQtd") - n("garantidoQtd") - n("semInstrumentoQtd") };
  const { kpis: estadoTitulos } = useTituloEstadoKpisFiltro({ relacao, busca, filtros: filtrosBase });
  const bloco = (c: string) => ({ qtd: n(c + "Qtd"), valor: n(c) });
  const vencidoContabil = estadoTitulos?.vencidoContabil ?? bloco("vencido_contabil");
  const cobravelHoje = estadoTitulos?.cobravelHoje ?? bloco("cobravel_hoje");
  const emCarenciaBancaria = estadoTitulos?.emCarenciaBancaria ?? bloco("em_carencia_bancaria");
  const faixasAging = estadoTitulos?.faixas ?? Object.fromEntries(FAIXAS_ATRASO.map(([f]) => [f, gruposAgregado(a, "aging").find(g => g.faixa_aging === f)?.valor ?? 0])) as Record<ChaveFaixa, number>;
  const bancosOpcoes = gruposAgregado(globalQ.data?.agregados, "bancos").map(g => g.banco_nome).filter((v): v is string => typeof v === "string" && !!v).sort();
  const carenciaIds = new Set(filtrados.filter(t => t.em_carencia_bancaria).map(t => t.id));
  const hojeIso = iso(new Date());
  const semFiltroKpi = !filtroInstrumento && filtroPrazo === "todos";

  const limparFiltrosKpi = () => {
    setFiltroInstrumento(null);
    setFiltroPrazo("todos");
    setPage(1);
  };

  const clicarInstrumento = (k: "garantido" | "sem_instrumento") => {
    setFiltroInstrumento((prev) => (prev === k ? null : k));
    setPage(1);
  };

  const clicarPrazo = (k: "a_vencer" | "vencidos" | "cobravel" | "carencia") => {
    setFiltroPrazo((prev) => (prev === k ? "todos" : k));
    setPage(1);
  };


  /* ---------- Linha 2 — Carteiras ---------- */
  const carteiras = gruposAgregado(a, "carteiras").map(g => ({
    codigo: String(g.carteira_codigo), nome: String(g.carteira_nome ?? g.carteira_codigo), ordem: Number(g.carteira_ordem ?? 99),
    previsaoConfiavel: (g as unknown as { carteira_previsao_confiavel: boolean | null }).carteira_previsao_confiavel !== false,
    rotuloData: g.carteira_rotulo_data as string | null,
    aberto: gruposAgregado(a, "carteirasAberto").find(x => x.carteira_codigo === g.carteira_codigo)?.valor ?? 0,
    qtd: gruposAgregado(a, "carteirasQtd").find(x => x.carteira_codigo === g.carteira_codigo)?.valor ?? 0,
  })).sort((x, y) => x.ordem - y.ordem);
  const chipCounts = (ag: typeof a) => Object.fromEntries(RECEBIMENTO_ORDEM.map(r => [r, gruposAgregado(ag, "chips").find(g => g.eixo_recebimento === r)?.valor ?? 0])) as Record<EixoRecebimento, number>;
  const contagensRecebimento = chipCounts(chipsQ.data?.agregados);
  const contagensSemKpi = chipCounts(chipsSemKpiQ.data?.agregados);
  const metaRecebimento = RECEBIMENTO_ORDEM.map(r => {
    const g = gruposAgregado(globalQ.data?.agregados, "recebMeta").find(g => g.eixo_recebimento === r);
    return { chave: r, rotulo: String(g?.recebimento_rotulo ?? RECEBIMENTO_LABEL[r]), ordem: Number(g?.recebimento_ordem ?? RECEBIMENTO_ORDEM.indexOf(r) + 1) };
  }).sort((x, y) => x.ordem - y.ordem);
  const contagensPrazo = { aVencer: numeroAgregado(prazoQ.data?.agregados, "aVencer"), vencidos: numeroAgregado(prazoQ.data?.agregados, "vencidos") };

  const rotuloFiltroKpi =
    filtroInstrumento === "garantido"
      ? "Garantido em banco"
      : filtroInstrumento === "sem_instrumento"
      ? "Sem instrumento"
      : filtroPrazo === "vencidos"
      ? "Prazo: Vencidos"
      : filtroPrazo === "cobravel"
      ? "Prazo: Cobrável hoje"
      : filtroPrazo === "carencia"
      ? "Prazo: Em carência bancária"
      : filtroPrazo === "a_vencer"
      ? "Prazo: A vencer"
      : null;

  const totalAtraso =
    faixasAging["1-7"] + faixasAging["8-30"] + faixasAging["31-60"] + faixasAging["60+"];

  const pctGarantido =
    estadoCarteira.aReceber > 0
      ? Math.round((estadoCarteira.garantido / estadoCarteira.aReceber) * 100)
      : 0;

  /** Uma frase honesta sobre o topo do aging, sem tabelinha. */
  const resumoAtraso = useMemo(() => {
    if (totalAtraso === 0) return "sem atraso";
    if (faixasAging["60+"] > 0) return `+60d: ${formatBRLCurto(faixasAging["60+"])}`;
    if (faixasAging["31-60"] > 0) return `31–60d: ${formatBRLCurto(faixasAging["31-60"])}`;
    if (faixasAging["8-30"] > 0) return `8–30d: ${formatBRLCurto(faixasAging["8-30"])}`;
    return "nada acima de 7d";
  }, [faixasAging, totalAtraso]);


  const ACHADO_LABEL: Record<Achado, string> = {
    sobreposicao: "Sobreposição do instrumento",
    renegociacao: "Renegociação humana",
    sem_prova: "Sem prova bancária",
    data_divergente: "Data divergente",
    meio_divergente: "Meio ≠ pedido",
    inadimplente: "Inadimplentes",
  };

  const ddMM = (v: string) => {
    const [, m, d] = v.split("-");
    return `${d}/${m}`;
  };

  const limparTudo = () => {
    setCarteiraAtiva(null);
    setFiltroInstrumento(null);
    setFiltroPrazo("todos");
    setBusca("");
    setFiltroBanco("todos");
    setDataDe("");
    setDataAte("");
    setAchado(null);
    setRecebimentosAtivos(new Set<EixoRecebimento>(["em_aberto"]));
    setPage(1);
  };

  /** Barra de estado: cada filtro ligado aparece e sai por conta própria. */
  const filtrosAtivos = useMemo(() => {
    const lista: { chave: string; rotulo: string; limpar: () => void }[] = [];
    if (carteiraAtiva) {
      const nome = carteiras.find((c) => c.codigo === carteiraAtiva)?.nome ?? carteiraAtiva;
      lista.push({
        chave: "carteira",
        rotulo: `Carteira: ${nome}`,
        limpar: () => {
          setCarteiraAtiva(null);
          setPage(1);
        },
      });
    }
    if (filtroInstrumento) {
      lista.push({
        chave: "instrumento",
        rotulo: filtroInstrumento === "garantido" ? "Garantido em banco" : "Sem instrumento",
        limpar: () => {
          setFiltroInstrumento(null);
          setPage(1);
        },
      });
    }
    if (filtroPrazo !== "todos") {
      const rotuloPrazo: Record<string, string> = {
        vencidos: "Prazo: Vencidos",
        a_vencer: "Prazo: A vencer",
        cobravel: "Prazo: Cobrável hoje",
        carencia: "Prazo: Em carência bancária",
      };
      lista.push({
        chave: "prazo",
        rotulo: rotuloPrazo[filtroPrazo] ?? "Prazo",
        limpar: () => {
          setFiltroPrazo("todos");
          setPage(1);
        },
      });
    }
    if (busca.trim()) {
      lista.push({
        chave: "busca",
        rotulo: `Busca: "${busca.trim()}"`,
        limpar: () => {
          setBusca("");
          setPage(1);
        },
      });
    }
    if (filtroBanco !== "todos") {
      lista.push({
        chave: "banco",
        rotulo: `Banco: ${filtroBanco}`,
        limpar: () => {
          setFiltroBanco("todos");
          setPage(1);
        },
      });
    }
    if (dataDe || dataAte) {
      lista.push({
        chave: "periodo",
        rotulo: `Período: ${dataDe ? ddMM(dataDe) : "…"}–${dataAte ? ddMM(dataAte) : "…"}`,
        limpar: () => {
          setDataDe("");
          setDataAte("");
          setPage(1);
        },
      });
    }
    for (const r of RECEBIMENTO_ORDEM) {
      if (!recebimentosAtivos.has(r)) continue;
      /* Chip padrão não aparece: o estado inicial já é "Em aberto". */
      if (recebimentosAtivos.size === 1 && r === "em_aberto") continue;
      lista.push({
        chave: `receb:${r}`,
        rotulo: `Recebimento: ${RECEBIMENTO_LABEL[r]}`,
        limpar: () => toggleRecebimento(r),
      });
    }
    if (achado) {
      lista.push({
        chave: "achado",
        rotulo: `Achado: ${ACHADO_LABEL[achado]}`,
        limpar: () => {
          setAchado(null);
          setPage(1);
        },
      });
    }
    return lista;
  }, [
    carteiraAtiva,
    carteiras,
    filtroInstrumento,
    filtroPrazo,
    busca,
    filtroBanco,
    dataDe,
    dataAte,
    recebimentosAtivos,
    achado,
  ]);

  /**
   * A tela mentiu por omissão uma vez: busca com resultado fora da carteira
   * selecionada voltava vazia. Aqui ela conta onde o registro está.
   */
  const carteirasBusca = gruposAgregado(a, "carteirasBusca");
  const buscaForaDoRecorte = busca.trim() && n("n") > 0 ? { n: n("n"), carteira: carteirasBusca.length === 1 ? String(carteirasBusca[0].carteira_nome) : null } : null;

  const toggleRecebimento = (k: EixoRecebimento) => {
    setRecebimentosAtivos((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setPage(1);
  };

  /* ---------- Painel de qualidade de dado (denominador explícito) ---------- */
  const totalCarregado = numeroAgregado(globalQ.data?.agregados, "n");
  const achados = achadoChaves.map(chave => ({ chave, rotulo: ACHADO_LABEL[chave], n: numeroAgregado(globalQ.data?.agregados, chave) }));
  const mensal = gruposAgregado(globalQ.data?.agregados, "mensalN").map(g => {
    const valor = (id: string) => gruposAgregado(globalQ.data?.agregados, id).find(x => x[mesColuna] === g[mesColuna])?.valor ?? 0;
    return { mes: String(g[mesColuna]).slice(0, 7), titulos: g.valor ?? 0, recebido: valor("mensal_recebido"), aberto: valor("mensal_aberto"), atrasado: valor("mensal_atrasado"), total: valor("mensalTotal") };
  }).sort((x, y) => y.mes.localeCompare(x.mes));

  const totalMensal = {
    titulos: numeroAgregado(globalQ.data?.agregados, "mensalFooterN"),
    recebido: numeroAgregado(globalQ.data?.agregados, "mensalFooter_recebido"),
    aberto: numeroAgregado(globalQ.data?.agregados, "mensalFooter_aberto"),
    atrasado: numeroAgregado(globalQ.data?.agregados, "mensalFooter_atrasado"),
    total: numeroAgregado(globalQ.data?.agregados, "mensalFooterTotal"),
  };

  /** Mesmos dados, ordem crescente (mais antigo à esquerda). */
  const mensalAsc = useMemo(() => [...mensal].reverse(), [mensal]);

  const aplicarMes = (mesKey: string) => {
    const [y, m] = mesKey.split("-").map(Number);
    const de = new Date(y, m - 1, 1);
    const ate = new Date(y, m, 0);
    setDataBase(baseMensal === "competencia" ? "emissao" : "recebimento");
    setDataDe(iso(de));
    setDataAte(iso(ate));
    setPage(1);
  };

  /* ---------- Lista final ---------- */
  const semChip = recebimentosAtivos.size === 0;

  /* Agrupamento por pedido. */
  const grupos = useMemo(() => {
    const universo = new Map(gruposAgregado(universoQ.data?.agregados, "n").map(g => [String(g.grupo_chave), { n: g.valor ?? 0, total: gruposAgregado(universoQ.data?.agregados, "total").find(x => x.grupo_chave === g.grupo_chave)?.valor ?? 0 }]));
    const mapa = new Map<string, RecebivelB2B[]>();
    for (const t of filtrados) {
      const chave = t.grupo_chave;
      const arr = mapa.get(chave);
      if (arr) arr.push(t);
      else mapa.set(chave, [t]);
    }
    return Array.from(mapa.entries()).map(([chave, titulos]) => {
      const primeiro = titulos[0];
      const vencimentos = titulos
        .filter((t) => naoRecebido(t) && t.data_vencimento_vigente)
        .map((t) => t.data_vencimento_vigente as string)
        .sort();

      // PIOR-ESTADO-VENCE: o grupo vale pelo membro mais grave, nunca pela moda.
      const estadosDistintos = new Set(titulos.map((t) => t.estado_rotulo));
      const misto = estadosDistintos.size > 1;
      const inadimplente = titulos.find((t) => estaVencido(t));
      const aberto = titulos.find((t) => naoRecebido(t));
      const fechados = titulos.filter((t) => !naoRecebido(t));

      const recenteFechado =
        fechados.length > 0
          ? [...fechados].sort((a, b) => {
              const da =
                a.data_recebimento_efetiva ||
                a.data_pagamento_banco ||
                a.data_pagamento ||
                a.data_vencimento_vigente ||
                "";
              const db =
                b.data_recebimento_efetiva ||
                b.data_pagamento_banco ||
                b.data_pagamento ||
                b.data_vencimento_vigente ||
                "";
              return db.localeCompare(da);
            })[0]
          : null;
      const escolhido = inadimplente || aberto || recenteFechado || primeiro;
      const escolhidoEmCarencia = carenciaIds.has(escolhido.id);
      const estadoRotulo = escolhidoEmCarencia
        ? "Em carência"
        : (escolhido.estado_rotulo ?? null);
      const estadoCor = escolhidoEmCarencia ? "amber" : (escolhido.estado_cor ?? null);

      const desvios = titulos
        .map((t) => t.desvio_registro_dias)
        .filter((d): d is number => d != null);
      const desvioAlerta = desvios.some((d) => Math.abs(d) > 15);
      const signedDesvio = (d: number) =>
        `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}d`;
      const desvioTexto = (() => {
        if (desvios.length === 0) return null;
        const unicos = Array.from(new Set(desvios));
        if (unicos.length === 1 && unicos[0] === 0) return null;
        if (unicos.length === 1) return fmtDesvio(unicos[0]);
        const min = Math.min(...desvios);
        const max = Math.max(...desvios);
        return `${signedDesvio(min)} a ${signedDesvio(max)}`;
      })();

      return {
        chave,
        titulos,
        cliente: primeiro.cliente,
        pedidoRef: primeiro.pedido_ref,
        pedidoId: primeiro.pedido_id,
        nfs: Array.from(
          new Set(titulos.map((t) => t.nf_numero).filter((n): n is string => !!n))
        ),
        carteiras: Array.from(
          new Set(titulos.map((t) => t.carteira_nome).filter((c): c is string => !!c))
        ),
        rotuloData: primeiro.carteira_rotulo_data,
        proximoVencimento: vencimentos[0] ?? null,
        desvioTexto,
        desvioAlerta,
        total: titulos.reduce((s, t) => s + efetivoDe(t), 0),
        estadoRotulo,
        estadoCor,
        misto,
        ocultos: Math.max(0, (universo.get(chave)?.n ?? titulos.length) - titulos.length),
        totalUniverso:
          universo.get(chave)?.total ?? titulos.reduce((s, t) => s + efetivoDe(t), 0),
      };
    });
  }, [filtrados, universoQ.data, hojeIso]);

  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const toggleGrupo = (chave: string) =>
    setAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });

  const totalItens = listaQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItens / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  useEffect(() => { if (listaQ.data && !listaQ.isPlaceholderData && page !== pageSafe) setPage(pageSafe); }, [listaQ.data, listaQ.isPlaceholderData, page, pageSafe]);
  const idsFocaveis = filtrados.map(t => t.id);
  const saldoQ = useQuery({
    queryKey: ["recebiveis-saldos-pagina", idsFocaveis], enabled: idsFocaveis.length > 0,
    queryFn: async () => {
      const linhas: TituloSaldo[] = [];
      // Both chunk the IN and paginate its result: complete groups can exceed 1,000 rows.
      for (let i = 0; i < idsFocaveis.length; i += 100) {
        const { data, error } = await supabase.from("vw_titulo_saldo" as never).select("titulo_id,titulo_pai_id,valor_documento,alocado_conta,filhos_abertos,n_filhos_abertos,saldo_a_receber,tem_abatimento,tipo_filho,n_remessas_abertas").in("titulo_id", idsFocaveis.slice(i, i + 100));
        if (error) throw error;
        linhas.push(...(data ?? []) as unknown as TituloSaldo[]);
      }
      return linhas;
    },
  });
  const saldosPorTitulo = new Map((saldoQ.data ?? []).map(t => [t.titulo_id, t]));
  const consultas = [listaQ, resumoQ, chipsQ, chipsSemKpiQ, prazoQ, globalQ,
    ...(agrupado && chavesPagina.length ? [universoQ] : []), ...(idsFocaveis.length ? [saldoQ] : [])];
  const erro = consultas.find(q => q.isError)?.error;
  const isLoading = consultas.some(q => q.isPending) || listaQ.isPlaceholderData;
  useFocoAoVoltar({ pronto: !isLoading && !erro, idsVisiveis: idsFocaveis, focoParam: "b2b_foco" });
  useRestaurarScroll(null, !isLoading && !erro);

  const numerosPorId = new Map(
    filtrados.map((t) => [t.id, t.numero_titulo ?? null] as const),
  );

  const linhaTitulo = (t: RecebivelB2B, aninhada: boolean) => {
    const atrasado = estaVencido(t);
    const desvio = t.desvio_registro_dias;
    const saldo = saldosPorTitulo.get(t.id);
    return (
      <TableRow
        key={t.id}
        data-foco-id={t.id}
        className={atrasado ? "bg-destructive/10" : aninhada ? "bg-muted/10" : undefined}
      >
        <TableCell className={aninhada ? "pl-10" : undefined}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{t.numero_titulo ?? "—"}</span>
            <BadgeParcelasAcerto saldo={saldo} />
            <BadgeAcerto saldo={saldo} />
          </div>
          {t.numero_parcela != null && t.total_parcelas != null && (
            <div className="text-xs text-muted-foreground">
              parcela {t.numero_parcela}/{t.total_parcelas}
            </div>
          )}
          <LinhaTituloPai
            saldo={saldo}
            numeroPai={saldo?.titulo_pai_id ? numerosPorId.get(saldo.titulo_pai_id) ?? null : null}
          />
          {!aninhada && t.condicao_parcelamento && (
            <div className="text-xs text-muted-foreground">{t.condicao_parcelamento}</div>
          )}
        </TableCell>
        <TableCell className="text-sm">{aninhada ? "" : t.cliente ?? "—"}</TableCell>
        <TableCell>
          {!aninhada && t.pedido_ref && (
            <button
              type="button"
              className="font-mono text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                if (t.pedido_id) abrirDetalhe(navigate, location, `/pedidos/${t.pedido_id}`, { label: "Contas a Receber", foco: t.id, focoParam: "b2b_foco" });
              }}
            >
              {t.pedido_ref}
            </button>
          )}
        </TableCell>
        <TableCell className="font-mono text-xs">{t.nf_numero ?? "—"}</TableCell>
        <TableCell>
          <Badge variant="outline" className="text-xs">
            {t.carteira_nome ?? "—"}
          </Badge>
        </TableCell>
        <TableCell className={atrasado ? "text-destructive font-medium text-sm" : "text-sm"}>
          {(() => {
            const rec = t.eixo_recebimento;
            if (rec === "quitado" || rec === "compensado") {
              if (t.data_recebimento) {
                const porBanco = t.fonte_data_recebimento === "banco";
                return (
                  <>
                    {formatDateBR(t.data_recebimento)}
                    <div
                      className={
                        "text-[10px] " + (porBanco ? "text-muted-foreground" : "text-warning")
                      }
                    >
                      {porBanco ? "Recebido em (banco)" : "Recebido em (informado)"}
                    </div>
                  </>
                );
              }
              return (
                <>
                  <span className="text-muted-foreground">—</span>
                  <div className="text-[10px] text-warning">Recebido, data não registrada</div>
                </>
              );
            }
            if (rec === "devolvido") {
              return (
                <>
                  {t.data_vencimento_vigente ? formatDateBR(t.data_vencimento_vigente) : <span className="text-muted-foreground">—</span>}
                  <div className="text-[10px] text-muted-foreground">Devolvido</div>
                </>
              );
            }
            if (rec === "cancelado") {
              return (
                <>
                  {t.data_vencimento_vigente ? formatDateBR(t.data_vencimento_vigente) : <span className="text-muted-foreground">—</span>}
                  <div className="text-[10px] text-muted-foreground">Cancelado</div>
                </>
              );
            }
            return (
              <>
                {t.data_vencimento_vigente ? (
                  formatDateBR(t.data_vencimento_vigente)
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                {t.carteira_rotulo_data && (
                  <div className="text-[10px] text-muted-foreground">{t.carteira_rotulo_data}</div>
                )}
              </>
            );
          })()}
        </TableCell>
        <TableCell className="text-sm">
          {t.data_liquidacao_real ? (
            formatDateBR(t.data_liquidacao_real)
          ) : t.data_liquidacao_prevista ? (
            <span className="text-[10px] text-muted-foreground">
              prev. {formatDateBR(t.data_liquidacao_prevista)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>

        <TableCell
          className={
            desvio != null && Math.abs(desvio) > 15
              ? "text-sm tabular-nums text-warning"
              : "text-sm tabular-nums"
          }
        >
          {fmtDesvio(desvio)}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          <ValorSaldo saldo={saldo} valorFace={efetivoDe(t)} />
        </TableCell>
        <TableCell>
          {/* Em carência bancária não é atraso: badge de aviso, não destrutivo. */}
          {carenciaIds.has(t.id) ? (
            <BadgeEstado rotulo="Em carência" cor="amber" />
          ) : (
            <BadgeEstado rotulo={t.estado_rotulo} cor={t.estado_cor} />
          )}
        </TableCell>
      </TableRow>
    );
  };

  const periodoLabel = dataDe || dataAte ? `${dataDe || "inicio"}_${dataAte || "hoje"}` : "todo";

  const handleExportXLSX = async () => {
    const todos = await exportarLista<RecebivelB2B>({ ...listaParams, agrupar: undefined } as ParamsLista);
    const linhas = todos.map((t) => ({
      NF: t.nf_numero ?? "",
      Pedido: t.pedido_ref ?? "",
      Cliente: t.cliente ?? "",
      "Título / Parcela":
        (t.numero_titulo ?? "") +
        (t.numero_parcela != null && t.total_parcelas != null
          ? ` ${t.numero_parcela}/${t.total_parcelas}`
          : ""),
      Banco: t.banco_nome ?? "",
      Carteira: t.carteira_nome ?? "",
      Meio: formatMeio(t.meio_pagamento),
      "Meio (pedido)": t.meio_pedido_nome ?? "",
      "Meio divergente": t.meio_divergente ? "Sim" : "Não",
      "Data compra": formatDateBR(t.data_compra),
      "Mês competência": mesKeyDe(t.mes_competencia) ?? "",
      "Vencimento (NF)": formatDateBR(t.data_vencimento_nf),
      "Vencimento (instrumento)": formatDateBR(t.data_vencimento_instrumento),
      "Vencimento vigente": formatDateBR(t.data_vencimento_vigente),
      "Rótulo da data": t.carteira_rotulo_data ?? "",
      "Desvio de registro (dias)": t.desvio_registro_dias ?? "",
      "Sobreposição do instrumento": t.sobreposicao_instrumento ? "Sim" : "Não",
      "Renegociação humana": t.renegociacao_humana ? "Sim" : "Não",
      Renegociado: t.venc_renegociado ? "Sim" : "Não",
      "Dias prorrogado": t.dias_prorrogado ?? 0,
      "Recebido em": t.data_recebimento_efetiva ? formatDateBR(t.data_recebimento_efetiva) : "",
      Fonte: t.fonte_data_recebimento ?? "",
      "Caixa projetado": t.data_caixa_projetada ? formatDateBR(t.data_caixa_projetada) : "",
      Caixa: t.data_liquidacao_real ? formatDateBR(t.data_liquidacao_real) : "",
      "Data banco": formatDateBR(t.data_pagamento_banco),
      "Data humano": formatDateBR(t.data_pagamento),
      Divergente: t.data_divergente ? "Sim" : "Não",
      Valor: efetivoDe(t),
      "Valor bruto": t.valor_bruto ?? 0,
      Juros: t.valor_juros ?? 0,
      Desconto: t.valor_desconto ?? 0,
      "Gera caixa": t.gera_caixa ? "Sim" : "Não",
      "Prova bancária": t.tem_prova_bancaria ? "Sim" : "Não",
      Recebimento:
        t.recebimento_rotulo ??
        (t.eixo_recebimento ? RECEBIMENTO_LABEL[t.eixo_recebimento] : ""),
      Instrumento: t.instrumento_rotulo ?? t.eixo_instrumento ?? "",

      Qualidade: t.qualidade ?? "",
      Estado: t.estado_rotulo ?? "",
      Inadimplente: estaVencido(t) ? "Sim" : "Não",
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Recebíveis B2B");
    XLSX.writeFile(wb, `recebiveis-b2b-${periodoLabel}.xlsx`);
  };

  useEffect(() => {
    onRegistrarExport({ fn: () => { void handleExportXLSX().catch(e => window.alert(`Falha ao exportar: ${formatError(e)}`)); }, ativo: totalItens > 0 && !isLoading && !erro });
  }, [JSON.stringify(listaParams), totalItens, isLoading, erro]);

  return (
    <div className="space-y-4">
      {/* Faixa 1 — Estado da carteira. Recorte fixo: período, busca e banco.
          Colunas são filtro: "A receber" é o universo (limpa), garantido ×
          sem instrumento são par exclusivo, vencido é transversal. */}
      <div className="grid grid-cols-2 divide-x divide-border rounded-xl border border-border bg-card md:grid-cols-5">
        <ColunaKpi
          rotulo="A receber"
          valor={formatBRLCurto(estadoCarteira.aReceber)}
          corValor="text-info"
          sublinha={`${estadoCarteira.aReceberQtd} títulos`}
          ativo={semFiltroKpi}
          onClick={limparFiltrosKpi}
        />
        <ColunaKpi
          rotulo="Garantido em banco"
          valor={formatBRLCurto(estadoCarteira.garantido)}
          sublinha={`${estadoCarteira.garantidoQtd} · ${pctGarantido}% da carteira`}
          ativo={filtroInstrumento === "garantido"}
          onClick={() => clicarInstrumento("garantido")}
        />
        <ColunaKpi
          rotulo="Sem instrumento"
          valor={formatBRLCurto(estadoCarteira.semInstrumento)}
          corValor="text-warning"
          sublinha={
            estadoCarteira.outrosQtd > 0
              ? `${estadoCarteira.semInstrumentoQtd} · +${estadoCarteira.outrosQtd} em trânsito`
              : `${estadoCarteira.semInstrumentoQtd} títulos`
          }
          ativo={filtroInstrumento === "sem_instrumento"}
          onClick={() => clicarInstrumento("sem_instrumento")}
        />
        {/* UM-VENCIDO-SO: card e botão "Vencidos" são o mesmo número e a mesma
            lista — o valor vem do vencido total (contábil). Cobrável e carência
            bancária viram detalhe informativo na sublinha. A barra de faixas
            continua contábil (faixa_aging). */}
        <ColunaKpi
          rotulo="Vencido"
          valor={formatBRLCurto(vencidoContabil.valor)}
          corValor="text-destructive"
          sublinha={`${formatBRLCurto(cobravelHoje.valor)} cobrável · ${formatBRLCurto(emCarenciaBancaria.valor)} em carência`}
          ativo={filtroPrazo === "vencidos"}
          onClick={() => clicarPrazo("vencidos")}
          extraRotulo={
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Detalhar faixas de atraso"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-[13px] w-[13px]" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 space-y-0.5 p-3">
                {FAIXAS_ATRASO.map(([chave, rotulo]) => (
                  <div
                    key={chave}
                    className="flex justify-between gap-2 text-xs text-muted-foreground"
                  >
                    <span>{rotulo}</span>
                    <span className="tabular-nums">
                      {formatBRL(faixasAging[chave])}
                    </span>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          }
          corpo={
            <>
              <div className="mt-1 flex h-1 w-full overflow-hidden rounded-full bg-muted">
                {FAIXAS_ATRASO.map(([chave], i) => {
                  const valor = faixasAging[chave];
                  const pct = totalAtraso > 0 ? (valor / totalAtraso) * 100 : 0;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={chave}
                      style={{ width: `${pct}%` }}
                      className={
                        ["bg-destructive/30", "bg-destructive/50", "bg-destructive/70", "bg-destructive"][i]
                      }
                    />
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {vencidoContabil.qtd} títulos · {resumoAtraso}
              </p>
            </>
          }
        />
        <ColunaKpi
          rotulo="Em carência bancária"
          valor={formatBRLCurto(emCarenciaBancaria.valor)}
          corValor="text-warning"
          sublinha={`${emCarenciaBancaria.qtd} ${
            emCarenciaBancaria.qtd === 1 ? "título" : "títulos"
          }`}
          ativo={filtroPrazo === "carencia"}
          onClick={() => clicarPrazo("carencia")}
          extraRotulo={
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="O que é carência bancária"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-[13px] w-[13px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-72">
                Venceu em fim de semana ou feriado — pelo padrão bancário o
                pagamento é devido no próximo dia útil. Não é atraso.
              </TooltipContent>
            </Tooltip>
          }
        />
      </div>

      {/* Barra de filtros ativos — a tela não pode filtrar em silêncio. */}
      {filtrosAtivos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filtrosAtivos.map((f) => (
            <Badge key={f.chave} variant="secondary" className="gap-1 py-1 pl-2 pr-1 font-normal">
              {f.rotulo}
              <button
                type="button"
                aria-label={`Remover filtro ${f.rotulo}`}
                className="rounded-sm p-0.5 hover:bg-background/60"
                onClick={f.limpar}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <button
            type="button"
            className="text-xs text-muted-foreground underline hover:text-foreground"
            onClick={limparTudo}
          >
            Limpar tudo
          </button>
        </div>
      )}


      {/* Linha 2 — Carteiras */}
      {carteiras.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-wrap gap-3">
              {carteiras.map((c) => {
                const ativa = carteiraAtiva === c.codigo;
                const vazia = c.aberto === 0;
                return (
                  <button
                    key={c.codigo}
                    type="button"
                    onClick={() => {
                      setCarteiraAtiva(ativa ? null : c.codigo);
                      setPage(1);
                    }}
                    className={
                      "min-w-[170px] flex-1 rounded-lg border p-2.5 text-left transition-colors " +
                      (ativa
                        ? "border-foreground bg-muted"
                        : "border-border hover:border-foreground/40") +
                      (vazia && !ativa ? " opacity-50" : "")
                    }
                  >
                    <div className="text-xs text-muted-foreground">{c.nome}</div>
                    <div className="text-lg font-medium tabular-nums">{formatBRL(c.aberto)}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {c.qtd} título{c.qtd === 1 ? "" : "s"} em aberto
                    </div>
                    {!c.previsaoConfiavel && (
                      <div className="text-xs text-warning">sem previsão de caixa</div>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground underline"
              onClick={() => navigate("/administrativo/previsao-recebimentos")}
            >
              Para ver quando o dinheiro cai, dia a dia e por conta: Fluxo de Recebimentos
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <AtalhosPeriodo
              de={dataDe}
              ate={dataAte}
              onPick={(de, ate) => {
                setDataDe(de);
                setDataAte(ate);
                setPage(1);
              }}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Recebimento — o dinheiro chegou?</Label>
            <div className="flex flex-wrap gap-2">
              {metaRecebimento.map(({ chave: r, rotulo }) => {
                const n = contagensRecebimento[r] ?? 0;
                /* Chip zerado POR CAUSA do filtro de KPI é impossível, não vazio. */
                const impossivel =
                  n === 0 && !!rotuloFiltroKpi && (contagensSemKpi[r] ?? 0) > 0;
                const botao = (
                  <Button
                    key={r}
                    size="sm"
                    variant={recebimentosAtivos.has(r) ? "default" : "outline"}
                    onClick={() => toggleRecebimento(r)}
                    className={impossivel ? "opacity-50 pointer-events-none" : undefined}
                  >
                    {rotulo} ({n})
                  </Button>
                );

                if (!impossivel) return botao;
                return (
                  <Tooltip key={r}>
                    <TooltipTrigger asChild>
                      <span>{botao}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Incompatível com o filtro "{rotuloFiltroKpi}"
                    </TooltipContent>
                  </Tooltip>
                );
              })}

              <div className="ml-auto flex items-center gap-2 border-l border-border pl-3">
                <span className="text-xs text-muted-foreground">Prazo</span>
                <Button
                  size="sm"
                  variant={filtroPrazo === "todos" ? "default" : "outline"}
                  onClick={() => {
                    setFiltroPrazo("todos");
                    setPage(1);
                  }}
                >
                  Todos
                </Button>
                <Button
                  size="sm"
                  variant={filtroPrazo === "a_vencer" ? "default" : "outline"}
                  onClick={() => clicarPrazo("a_vencer")}
                >
                  A vencer ({contagensPrazo.aVencer})
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant={filtroPrazo === "vencidos" ? "default" : "outline"}
                      onClick={() => clicarPrazo("vencidos")}
                    >
                      Vencidos ({contagensPrazo.vencidos})
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {cobravelHoje.qtd}{" "}
                    {cobravelHoje.qtd === 1 ? "cobrável" : "cobráveis"} ·{" "}
                    {emCarenciaBancaria.qtd} em carência
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-xs">Busca</Label>
              <Input
                placeholder="Título, pedido, NF ou cliente"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Banco</Label>
              <Select
                value={filtroBanco}
                onValueChange={(v) => {
                  setFiltroBanco(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {bancosOpcoes.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data base</Label>
              <Select
                value={dataBase}
                onValueChange={(v) => {
                  setDataBase(v as DataBase);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vencimento">Vencimento</SelectItem>
                  <SelectItem value="emissao">Emissão (NF)</SelectItem>
                  <SelectItem value="recebimento">Recebimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input
                type="date"
                value={dataDe}
                onChange={(e) => {
                  setDataDe(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input
                type="date"
                value={dataAte}
                onChange={(e) => {
                  setDataAte(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Oculta temporariamente por decisão do Flavio em 03/08/2026.
          Basta trocar MOSTRAR_MES_A_MES para true para voltar. */}
      {MOSTRAR_MES_A_MES && (
        <div className="space-y-1">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base">Mês a mês</CardTitle>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={baseMensal === "competencia" ? "default" : "outline"}
                    onClick={() => setBaseMensal("competencia")}
                  >
                    Competência (NF)
                  </Button>
                  <Button
                    size="sm"
                    variant={baseMensal === "caixa_projetado" ? "default" : "outline"}
                    onClick={() => setBaseMensal("caixa_projetado")}
                  >
                    Caixa projetado
                  </Button>
                  <Button
                    size="sm"
                    variant={baseMensal === "caixa_confirmado" ? "default" : "outline"}
                    onClick={() => setBaseMensal("caixa_confirmado")}
                  >
                    Caixa confirmado
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {mensal.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">Sem dados nesta base.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background z-10">Métrica</TableHead>
                        {mensalAsc.map((l) => (
                          <TableHead
                            key={l.mes}
                            className="text-right cursor-pointer hover:text-foreground"
                            onClick={() => aplicarMes(l.mes)}
                          >
                            {rotuloMesCurto(l.mes)}
                          </TableHead>
                        ))}
                        <TableHead className="text-right font-medium">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(
                        [
                          { rotulo: "Títulos", campo: "titulos", moeda: false, cor: "" },
                          { rotulo: "Recebido", campo: "recebido", moeda: true, cor: "text-success" },
                          { rotulo: "Em aberto", campo: "aberto", moeda: true, cor: "" },
                          { rotulo: "Atrasado", campo: "atrasado", moeda: true, cor: "text-destructive" },
                          { rotulo: "Total", campo: "total", moeda: true, cor: "" },
                        ] as const
                      ).map((linha) => {
                        const isTotal = linha.campo === "total";
                        return (
                          <TableRow
                            key={linha.campo}
                            className={isTotal ? "font-medium bg-muted/40" : undefined}
                          >
                            <TableCell
                              className={`sticky left-0 bg-background z-10 font-medium ${
                                isTotal ? "font-medium" : ""
                              }`}
                            >
                              {linha.rotulo}
                            </TableCell>
                            {mensalAsc.map((l) => {
                              const v = l[linha.campo] as number;
                              return (
                                <TableCell
                                  key={l.mes}
                                  className={`text-right tabular-nums ${
                                    v > 0 ? linha.cor : "text-muted-foreground"
                                  }`}
                                >
                                  {linha.moeda ? (v > 0 ? formatBRL(v) : "—") : v}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-right tabular-nums font-medium">
                              {linha.moeda
                                ? (totalMensal[linha.campo] as number) > 0
                                  ? formatBRL(totalMensal[linha.campo] as number)
                                  : "—"
                                : totalMensal[linha.campo]}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Competência é a data da NF. Caixa projetado usa a régua por banco e forma enquanto não há
            prova bancária. Caixa confirmado é só o que o banco confirmou.
          </p>
        </div>
      )}

      {/* Painel recolhido — Qualidade de dado + modo de visualização */}
      <div className="flex items-start gap-4">
        <Card className="flex-1">
          <CardHeader className="pb-2">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left"
              onClick={() => setQualidadeAberta((v) => !v)}
            >
              <CardTitle className="text-sm">Qualidade de dado</CardTitle>
              {qualidadeAberta ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CardHeader>
          {qualidadeAberta && (
            <CardContent className="space-y-1 pt-0">
              {achados.map((a) => {
                const ativo = achado === a.chave;
                return (
                  <button
                    key={a.chave}
                    type="button"
                    onClick={() => {
                      setAchado(ativo ? null : a.chave);
                      setPage(1);
                    }}
                    className={
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors " +
                      (ativo ? "bg-muted text-foreground" : "hover:bg-muted/50")
                    }
                  >
                    <span>{a.rotulo}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {a.n} de {totalCarregado}
                    </span>
                  </button>
                );
              })}
            </CardContent>
          )}
        </Card>

        <div className="flex items-center gap-1 pt-2">
          {([true, false] as const).map((modo) => (
            <button
              key={String(modo)}
              type="button"
              onClick={() => {
                setAgrupado(modo);
                setPage(1);
              }}
              className={
                "text-xs px-3 py-1.5 rounded-full border transition-colors " +
                (agrupado === modo
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/40")
              }
            >
              {modo ? "Agrupado por pedido" : "Lista plana"}
            </button>
          ))}
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          {erro ? <div role="alert" className="p-4 text-destructive">Falha ao carregar recebíveis: {erro.message}</div> : isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : totalItens === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
              {semChip ? (
                <>
                  <Inbox className="h-8 w-8" />
                  <p>Nenhum chip de Recebimento selecionado.</p>
                  <p className="text-xs">
                    {numeroAgregado(chipsQ.data?.agregados, "n")} título{numeroAgregado(chipsQ.data?.agregados, "n") !== 1 ? "s" : ""} escondido
                    {numeroAgregado(chipsQ.data?.agregados, "n") !== 1 ? "s" : ""} — clique num chip acima.
                  </p>
                </>
              ) : buscaForaDoRecorte ? (
                <>
                  <SearchX className="h-8 w-8" />
                  <p>
                    Nenhum título aqui, mas "{busca.trim()}" aparece em{" "}
                    {buscaForaDoRecorte.n} título{buscaForaDoRecorte.n !== 1 ? "s" : ""}
                    {buscaForaDoRecorte.carteira
                      ? ` em ${buscaForaDoRecorte.carteira}.`
                      : " em outras carteiras."}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCarteiraAtiva(null);
                      setFiltroInstrumento(null);
                      setFiltroPrazo("todos");
                      setPage(1);
                    }}
                  >
                    Ver todos
                  </Button>
                </>
              ) : (
                <>
                  <Inbox className="h-8 w-8" />
                  <p>Nenhum título encontrado para os filtros atuais.</p>
                  <Button size="sm" variant="outline" onClick={limparTudo}>
                    Limpar tudo
                  </Button>
                </>
              )}
            </div>

          ) : (
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <TableHeader className="sticky top-0 z-20 bg-card">
                  <TableRow>
                  <SortTh label="Título" sortKey="numero_titulo" sort={sort} setSort={setSort} />
                  <SortTh label="Cliente" sortKey="cliente" sort={sort} setSort={setSort} />
                  <SortTh label="Pedido" sortKey="pedido_ref" sort={sort} setSort={setSort} />
                  <SortTh label="NF" sortKey="nf_numero" sort={sort} setSort={setSort} />
                  <SortTh label="Carteira" sortKey="carteira_ordem" sort={sort} setSort={setSort} />
                  <SortTh
                    label="Cliente pagou"
                    sortKey="data_vencimento_vigente"
                    sort={sort}
                    setSort={setSort}
                  />
                  <SortTh
                    label="Caixa"
                    sortKey="data_liquidacao_real"
                    sort={sort}
                    setSort={setSort}
                  />

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SortTh label="Banco moveu" sortKey="desvio_registro_dias" sort={sort} setSort={setSort} />
                    </TooltipTrigger>
                    <TooltipContent>
                      Dias que o boleto registrado no banco deslocou o vencimento definido pela NF.
                    </TooltipContent>
                  </Tooltip>
                  <SortTh
                    label="Valor"
                    sortKey="valor_efetivo"
                    sort={sort}
                    setSort={setSort}
                    align="right"
                  />
                  <SortTh label="Estado" sortKey="estado_ordem" sort={sort} setSort={setSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {agrupado
                  ? grupos
                      .map((g) => {
                        const aberto = abertos.has(g.chave);
                        if (g.titulos.length === 1 && g.ocultos === 0)
                          return linhaTitulo(g.titulos[0], false);
                        return (
                          <Fragment key={g.chave}>
                            <TableRow
                              data-foco-id={g.titulos[0]?.id}
                              className="cursor-pointer bg-muted/40 hover:bg-muted/60"
                              onClick={() => toggleGrupo(g.chave)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-1 text-xs font-medium">
                                  {aberto ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                  {g.titulos.length} parcela(s) de{" "}
                                  {g.titulos[0].total_parcelas ?? g.titulos.length}
                                </div>
                                {g.ocultos > 0 && (
                                  <div className="text-[10px] text-warning pl-5">
                                    +{g.ocultos} fora do filtro
                                  </div>
                                )}
                                {g.titulos[0]?.condicao_parcelamento && (
                                  <div className="text-[10px] text-muted-foreground pl-5">
                                    {g.titulos[0].condicao_parcelamento}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                {g.cliente ?? "—"}
                              </TableCell>
                              <TableCell>
                                {g.pedidoRef && (
                                  <button
                                    type="button"
                                    className="font-mono text-xs text-primary hover:underline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (g.pedidoId) abrirDetalhe(navigate, location, `/pedidos/${g.pedidoId}`, { label: "Contas a Receber", foco: g.titulos[0]?.id, focoParam: "b2b_foco" });
                                    }}
                                  >
                                    {g.pedidoRef}
                                  </button>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {g.nfs.length > 0 ? g.nfs.join(", ") : "—"}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {g.carteiras.map((c) => (
                                    <Badge key={c} variant="outline" className="text-xs">
                                      {c}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {g.proximoVencimento ? formatDateBR(g.proximoVencimento) : "—"}
                                {g.rotuloData && (
                                  <div className="text-[10px] text-muted-foreground">
                                    {g.rotuloData}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">—</TableCell>

                              <TableCell
                                className={
                                  g.desvioAlerta
                                    ? "text-sm tabular-nums text-warning"
                                    : "text-sm tabular-nums"
                                }
                              >
                                {g.desvioTexto ?? ""}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {formatBRL(g.total)}
                                <div className="text-[10px] text-muted-foreground">
                                  {g.ocultos > 0
                                    ? `pedido ${formatBRL(g.totalUniverso)}`
                                    : "visível"}
                                </div>
                              </TableCell>
                              <TableCell>
                                <BadgeEstado rotulo={g.estadoRotulo} cor={g.estadoCor} />
                                {g.misto && (
                                  <div className="text-[10px] text-muted-foreground">misto</div>
                                )}
                              </TableCell>
                            </TableRow>
                            {aberto && g.titulos.map((t) => linhaTitulo(t, true))}
                          </Fragment>
                        );
                      })
                  : filtrados
                      .map((t) => linhaTitulo(t, false))}
              </TableBody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {totalItens > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Página {pageSafe} de {totalPages} · {totalItens} {agrupado ? "pedidos" : "títulos"}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pageSafe <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pageSafe >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ B2C ============================ */

type FatVsReceb = {
  pedido_ref: string | null;
  nfs: number | null;
  nf_refs: string | null;
  data_emissao: string | null;
  mes_competencia: string | null;
  cliente: string | null;
  receita_produto: number | null;
  receita_frete: number | null;
  faturado: number | null;
  data_recebimento: string | null;
  mes_caixa: string | null;
  bruto_shopify: number | null;
  liquido_mp: number | null;
  taxa_mp: number | null;
  tipo_meio: string | null;
  financial_status: string | null;
  cidade: string | null;
  uf: string | null;
  movimentacoes: number | null;
  tem_recebimento: boolean | null;
  tem_nf: boolean | null;
  situacao: string | null;
  delta_bruto_vs_faturado: number | null;
};

function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function AbaB2C({ onRegistrarExport }: { onRegistrarExport: (e: { fn: () => void; ativo: boolean }) => void }) {
  /* TELA-LEMBRA-ONDE-EU-ESTAVA: filtros da aba B2C na URL (prefixo "b2c"). */
  const [est, setEst] = useEstadoTela(
    { busca: "", dataDe: "", dataAte: "", page: 1, lista: "faturado_sem_recebimento", sort: "data_transacao:desc" },
    { prefixo: "b2c", replaceKeys: ["busca"] },
  );
  const busca = est.busca;
  const setBusca = (v: string) => setEst({ busca: v });
  const dataDe = est.dataDe;
  const setDataDe = (v: string) => setEst({ dataDe: v });
  const dataAte = est.dataAte;
  const setDataAte = (v: string) => setEst({ dataAte: v });
  const page = est.page;
  const setPage = (v: React.SetStateAction<number>) => setEst({ page: resolverAcao(v, page) });
  type ListaFvr = "faturado_sem_recebimento" | "recebido_sem_nf" | "conciliado";
  const listaFvr = est.lista as ListaFvr;
  const setListaFvr = (v: React.SetStateAction<ListaFvr>) => setEst({ lista: resolverAcao(v, listaFvr) });
  const sort = lerOrdemKD(est.sort);
  const setSort = (v: React.SetStateAction<OrdemKD>) => setEst({ sort: escreverOrdemKD(resolverAcao(v, sort)) });

  const filtrosData = (coluna: string): FiltroLista[] => [
    ...(dataDe ? [{ c: coluna, op: "gte" as const, v: dataDe }] : []),
    ...(dataAte ? [{ c: coluna, op: "lte" as const, v: dataAte }] : []),
  ];
  const paramsB2c: ParamsLista = {
    relacao: "vw_recebivel_b2c_pedido", busca, filtros: filtrosData("data_transacao"),
    pagina: page, tamanho: PAGE_SIZE,
    ordem: [{ c: sort?.key ?? "data_transacao", dir: sort?.dir ?? "desc" }],
    agregados: [
      { id: "bruto", fn: "sum", c: "pedido_total_bruto" },
      { id: "liquido", fn: "sum", c: "valor_liquido_mp" },
      ...(["count", "sum", "sum"] as const).map((fn, i): AgregadoLista => ({
        id: ["mensal_n", "mensal_bruto", "mensal_liquido"][i], fn,
        ...(i ? { c: i === 1 ? "pedido_total_bruto" : "valor_liquido_mp" } : {}),
        por: [{ c: "data_transacao", trunc: "month" }], onde: [{ c: "data_transacao", op: "not_null" }],
      })),
    ],
  };
  const b2cQ = useListaPaginada<RecebivelB2C>(paramsB2c);
  const [fvrEst, setFvrEst] = useEstadoTela({ pagina: 1 }, { prefixo: "b2cfvr" });
  const [tamanhoFvr, setTamanhoFvr] = useState(20);
  const filtrosFvrData = filtrosData("data_emissao");
  const ondeSituacao = (situacao: string): FiltroLista[] => [{ c: "situacao", op: "eq", v: situacao }];
  const paramsFvr: ParamsLista = {
    relacao: "vw_b2c_faturado_vs_recebido", busca,
    filtros: [...(listaFvr === "recebido_sem_nf" ? [] : filtrosFvrData), ...ondeSituacao(listaFvr)],
    pagina: fvrEst.pagina, tamanho: tamanhoFvr,
    ordem: listaFvr === "conciliado" ? [{ c: "delta_bruto_vs_faturado", dir: "desc", abs: true }]
      : listaFvr === "faturado_sem_recebimento" ? [{ c: "data_emissao", dir: "asc" }] : undefined,
    agregados: [
      ...["faturado_sem_recebimento", "recebido_sem_nf", "conciliado"].map((situacao): AgregadoLista => ({
        id: situacao, fn: "count", ignorar: ["situacao", "data_emissao"],
        onde: [...ondeSituacao(situacao), ...(situacao === "recebido_sem_nf" ? [] : filtrosFvrData)],
      })),
      { id: "furo_valor", fn: "sum", c: "faturado", ignorar: ["situacao", "data_emissao"], onde: [...ondeSituacao("faturado_sem_recebimento"), ...filtrosFvrData] },
      { id: "furo_antigo", fn: "min", c: "data_emissao", ignorar: ["situacao", "data_emissao"], onde: [...ondeSituacao("faturado_sem_recebimento"), ...filtrosFvrData] },
      { id: "achados", fn: "count", ignorar: ["situacao", "data_emissao"], onde: filtrosFvrData },
      { id: "delta", fn: "sum", c: "delta_bruto_vs_faturado" },
    ],
  };
  const fvrQ = useListaPaginada<FatVsReceb>(paramsFvr);
  const isLoading = b2cQ.isLoading;
  const base = b2cQ.data?.linhas ?? [];
  const totalB2c = b2cQ.data?.total ?? 0;
  const semRecebimento = listaFvr === "faturado_sem_recebimento" ? fvrQ.data?.linhas ?? [] : [];
  const recebidoSemNf = listaFvr === "recebido_sem_nf" ? fvrQ.data?.linhas ?? [] : [];
  const conciliados = listaFvr === "conciliado" ? fvrQ.data?.linhas ?? [] : [];
  const contagemFvr = (situacao: string) => numeroAgregado(fvrQ.data?.agregados, situacao);
  const achadosFvr = busca.trim() ? numeroAgregado(fvrQ.data?.agregados, "achados") + contagemFvr("recebido_sem_nf") : 0;
  const dataAntiga = fvrQ.data?.agregados.furo_antigo;
  const kpiFuro = { total: numeroAgregado(fvrQ.data?.agregados, "furo_valor"), n: contagemFvr("faturado_sem_recebimento"), maisAntigo: typeof dataAntiga === "string" ? diasDesde(dataAntiga) : null };
  const bruto = numeroAgregado(b2cQ.data?.agregados, "bruto");
  const liquido = numeroAgregado(b2cQ.data?.agregados, "liquido");
  const kpis = { bruto, liquido, taxa: bruto - liquido, pct: bruto > 0 ? (bruto - liquido) / bruto * 100 : 0 };
  const mensal = gruposAgregado(b2cQ.data?.agregados, "mensal_n").filter((g) => g.data_transacao).map((g) => {
    const mes = String(g.data_transacao).slice(0, 7);
    const valor = (id: string) => Number(gruposAgregado(b2cQ.data?.agregados, id).find((r) => String(r.data_transacao).slice(0, 7) === mes)?.valor ?? 0);
    return { mes, pedidos: Number(g.valor ?? 0), bruto: valor("mensal_bruto"), liquido: valor("mensal_liquido") };
  }).sort((a, b) => b.mes.localeCompare(a.mes));
  const mensalAsc = [...mensal].reverse();
  const totalMensalB2c = { pedidos: totalB2c, bruto, liquido };
  const totalPages = Math.max(1, Math.ceil(totalB2c / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginados = base;

  const periodoLabel = dataDe || dataAte ? `${dataDe || "inicio"}_${dataAte || "hoje"}` : "todo";

  const handleExportXLSX = async () => {
    const [exportB2c, exportFvr] = await Promise.all([exportarLista<RecebivelB2C>(paramsB2c), exportarLista<FatVsReceb>(paramsFvr)]);
    const linhas = exportB2c.map((r) => ({
      Pedido: r.order_name ?? "",
      "Data recebimento": formatDateBR(String(r.data_transacao ?? "").slice(0, 10)),
      "Data pedido": formatDateBR(String(r.created_at_shopify ?? "").slice(0, 10)),
      Cidade: r.shipping_city ?? "",
      UF: r.shipping_province ?? "",
      Meio: r.tipo_meio ?? "",
      "Status Shopify": r.financial_status ?? "",
      "MP payment id": r.mp_payment_id ?? "",
      "Shopify id": r.shopify_id ?? "",
      Atribuição: r.status_atribuicao ?? "",
      "Via chave": r.via_chave ?? "",
      Bruto: Number(r.pedido_total_bruto ?? 0),
      Líquido: Number(r.valor_liquido_mp ?? 0),
      Taxa: Number(r.pedido_total_bruto ?? 0) - Number(r.valor_liquido_mp ?? 0),
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Recebíveis B2C");

    const listaSel = exportFvr;
    const linhasFvr = listaSel.map((r) => ({
      Situação: r.situacao ?? "",
      Pedido: r.pedido_ref ?? "",
      Cliente: r.cliente ?? "",
      NF: r.nf_refs ?? "",
      Emissão: formatDateBR(String(r.data_emissao ?? "").slice(0, 10)),
      Recebimento: formatDateBR(String(r.data_recebimento ?? "").slice(0, 10)),
      Dias: diasDesde(r.data_emissao) ?? "",
      Meio: r.tipo_meio ?? "",
      Cidade: r.cidade ?? "",
      UF: r.uf ?? "",
      Faturado: Number(r.faturado ?? 0),
      "Bruto Shopify": Number(r.bruto_shopify ?? 0),
      Δ: Number(r.delta_bruto_vs_faturado ?? 0),
      Líquido: Number(r.liquido_mp ?? 0),
      Taxa: Number(r.taxa_mp ?? 0),
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(linhasFvr),
      "Faturado x Recebido"
    );
    XLSX.writeFile(wb, `recebiveis-b2c-${periodoLabel}.xlsx`);
  };

  useEffect(() => {
    onRegistrarExport({ fn: () => { void handleExportXLSX().catch((e) => toast.error(formatError(e))); }, ativo: totalB2c > 0 });
  }, [busca, dataDe, dataAte, est.sort, listaFvr, totalB2c]);
  useEffect(() => { setFvrEst({ pagina: 1 }); }, [busca, dataDe, dataAte, listaFvr]);

  return (
    <div className="space-y-6">
      {(b2cQ.error || fvrQ.error) && <p className="text-sm text-destructive">{formatError(b2cQ.error ?? fvrQ.error)}</p>}
      <GavetaFilaSemPedido />
      <div className="flex justify-end"><BotaoFilaSemPedido /></div>

      <p className="max-w-3xl text-xs text-muted-foreground">
        B2C não usa título — o recebível nasce liquidado, por pedido. Não existe aberto nem futuro
        aqui, e estes valores não somam com os do B2B. Mercado Pago liquida em D+14: venda recente
        ainda não caiu.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Bruto Shopify</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium tabular-nums">{formatBRL(kpis.bruto)}</div>
            <p className="text-xs text-muted-foreground">{totalB2c} pedidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-success">Líquido recebido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium tabular-nums text-success">
              {formatBRL(kpis.liquido)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Taxa Mercado Pago</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-medium tabular-nums">{formatBRL(kpis.taxa)}</div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {kpis.pct.toFixed(2)}%
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-warning/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Faturado sem recebimento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium tabular-nums text-warning">
              {formatBRL(kpiFuro.total)}
            </div>
            <p className="text-xs text-muted-foreground">
              {kpiFuro.n} pedidos
              {kpiFuro.maisAntigo !== null ? ` · mais antigo há ${kpiFuro.maisAntigo} dias` : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <AtalhosPeriodo
            de={dataDe}
            ate={dataAte}
            onPick={(de, ate) => {
              setDataDe(de);
              setDataAte(ate);
              setPage(1);
            }}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Busca</Label>
              <Input
                placeholder="Pedido (#1101), NF, cliente, cidade, ID MP/Shopify"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">De (recebimento)</Label>
              <Input
                type="date"
                value={dataDe}
                onChange={(e) => {
                  setDataDe(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até (recebimento)</Label>
              <Input
                type="date"
                value={dataAte}
                onChange={(e) => {
                  setDataAte(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Mês a mês (recebimento)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {mensal.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">Sem dados no período.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10">Métrica</TableHead>
                    {mensalAsc.map((l) => (
                      <TableHead key={l.mes} className="text-right">
                        {rotuloMesCurto(l.mes)}
                      </TableHead>
                    ))}
                    <TableHead className="text-right font-medium">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(
                    [
                      { rotulo: "Pedidos", moeda: false, cor: "" },
                      { rotulo: "Bruto", moeda: true, cor: "" },
                      { rotulo: "Líquido", moeda: true, cor: "text-success" },
                      { rotulo: "Taxa", moeda: true, cor: "" },
                    ] as const
                  ).map((linha) => {
                    const valorDe = (l: { pedidos: number; bruto: number; liquido: number }) =>
                      linha.rotulo === "Pedidos"
                        ? l.pedidos
                        : linha.rotulo === "Bruto"
                          ? l.bruto
                          : linha.rotulo === "Líquido"
                            ? l.liquido
                            : l.bruto - l.liquido;
                    return (
                      <TableRow key={linha.rotulo}>
                        <TableCell className="sticky left-0 bg-background z-10 font-medium">
                          {linha.rotulo}
                        </TableCell>
                        {mensalAsc.map((l) => {
                          const v = valorDe(l);
                          return (
                            <TableCell
                              key={l.mes}
                              className={`text-right tabular-nums ${
                                v > 0 ? linha.cor : "text-muted-foreground"
                              }`}
                            >
                              {linha.moeda ? (v > 0 ? formatBRL(v) : "—") : v}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right tabular-nums font-medium">
                          {linha.moeda
                            ? valorDe(totalMensalB2c) > 0
                              ? formatBRL(valorDe(totalMensalB2c))
                              : "—"
                            : valorDe(totalMensalB2c)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

        </CardContent>
      </Card>

      <div className="space-y-1">
        <Card className="border-warning/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Faturado × Recebido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={listaFvr === "faturado_sem_recebimento" ? "default" : "outline"}
                onClick={() => setListaFvr("faturado_sem_recebimento")}
              >
                Faturado sem recebimento ({contagemFvr("faturado_sem_recebimento")})
              </Button>
              <Button
                size="sm"
                variant={listaFvr === "recebido_sem_nf" ? "default" : "outline"}
                onClick={() => setListaFvr("recebido_sem_nf")}
              >
                Recebido sem NF ({contagemFvr("recebido_sem_nf")})
              </Button>
              <Button
                size="sm"
                variant={listaFvr === "conciliado" ? "default" : "outline"}
                onClick={() => setListaFvr("conciliado")}
              >
                Conciliados ({contagemFvr("conciliado")})
              </Button>
            </div>

            {listaFvr === "faturado_sem_recebimento" && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>NF</TableHead>
                    <TableHead>Emissão</TableHead>
                    <TableHead className="text-right">Dias</TableHead>
                    <TableHead className="text-right">Faturado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {semRecebimento.map((r) => {
                    const d = diasDesde(r.data_emissao);
                    const cor =
                      d !== null && d > 20
                        ? "text-destructive"
                        : d !== null && d >= 14
                          ? "text-warning"
                          : "";
                    return (
                      <TableRow key={r.pedido_ref ?? Math.random()}>
                        <TableCell className="font-mono text-xs">{r.pedido_ref ?? "—"}</TableCell>
                        <TableCell className="max-w-[220px] truncate">{r.cliente ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.nf_refs ?? "—"}</TableCell>
                        <TableCell>{formatDateBR(String(r.data_emissao ?? "").slice(0, 10))}</TableCell>
                        <TableCell className={`text-right tabular-nums ${cor}`}>{d ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL(Number(r.faturado ?? 0))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {semRecebimento.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="p-6 text-center text-muted-foreground">
                        Nada faturado sem recebimento no período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow className="font-medium">
                      <TableCell colSpan={5}>Total</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL(kpiFuro.total)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}

            {listaFvr === "recebido_sem_nf" && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Recebimento</TableHead>
                    <TableHead>Meio</TableHead>
                    <TableHead>Cidade/UF</TableHead>
                    <TableHead className="text-right">Bruto</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recebidoSemNf.map((r) => (
                    <TableRow key={r.pedido_ref ?? Math.random()}>
                      <TableCell className="font-mono text-xs">{r.pedido_ref ?? "—"}</TableCell>
                      <TableCell>
                        {formatDateBR(String(r.data_recebimento ?? "").slice(0, 10))}
                      </TableCell>
                      <TableCell>{formatMeio(r.tipo_meio)}</TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        {r.cidade ?? "—"}
                        {r.uf ? `/${r.uf}` : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL(Number(r.bruto_shopify ?? 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-success">
                        {formatBRL(Number(r.liquido_mp ?? 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                  {recebidoSemNf.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="p-6 text-center text-muted-foreground">
                        Nada recebido sem NF.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}

            {listaFvr === "conciliado" && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Emissão</TableHead>
                    <TableHead>Recebimento</TableHead>
                    <TableHead className="text-right">Faturado</TableHead>
                    <TableHead className="text-right">Bruto Shopify</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                    <TableHead className="text-right">Taxa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conciliados.map((r) => {
                    const delta = Number(r.delta_bruto_vs_faturado ?? 0);
                    return (
                      <TableRow key={r.pedido_ref ?? Math.random()}>
                        <TableCell className="font-mono text-xs">{r.pedido_ref ?? "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{r.cliente ?? "—"}</TableCell>
                        <TableCell>{formatDateBR(String(r.data_emissao ?? "").slice(0, 10))}</TableCell>
                        <TableCell>
                          {formatDateBR(String(r.data_recebimento ?? "").slice(0, 10))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL(Number(r.faturado ?? 0))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL(Number(r.bruto_shopify ?? 0))}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${delta < 0 ? "text-destructive" : ""}`}
                        >
                          {formatBRL(delta)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-success">
                          {formatBRL(Number(r.liquido_mp ?? 0))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL(Number(r.taxa_mp ?? 0))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {conciliados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="p-6 text-center text-muted-foreground">
                        Sem conciliados no período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow className="font-medium">
                      <TableCell colSpan={6}>Total</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL(
                          numeroAgregado(fvrQ.data?.agregados, "delta")
                        )}
                      </TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
            <RodapePaginacao total={fvrQ.data?.total ?? 0} pagina={fvrEst.pagina} tamanhoPagina={tamanhoFvr} onPagina={(pagina) => setFvrEst({ pagina })} onTamanhoPagina={setTamanhoFvr} />
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Acima de 20 dias sem liquidação não é mais atraso de D+14 — é furo. Δ é o bruto do Shopify
          menos o faturado na NF: a diferença costuma ser frete cobrado e não destacado.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : paginados.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
              {busca.trim() ? (
                <>
                  <SearchX className="h-8 w-8" />
                  <p>Nenhuma movimentação para "{busca.trim()}".</p>
                  <p className="text-xs">
                    {achadosFvr > 0
                      ? `Mas aparece em ${achadosFvr} pedido${achadosFvr !== 1 ? "s" : ""} em Faturado × Recebido, acima.`
                      : "Esta tabela não guarda nome de cliente — busque por nº do pedido (#1101), ID Shopify, pagamento MP ou cidade."}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBusca("");
                      setPage(1);
                    }}
                  >
                    Limpar busca
                  </Button>
                </>
              ) : (
                <>
                  <Inbox className="h-8 w-8" />
                  <p>Nenhum recebível B2C no período.</p>
                </>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortTh label="Pedido" sortKey="order_name" sort={sort} setSort={setSort} />
                  <SortTh label="Data recebimento" sortKey="data_transacao" sort={sort} setSort={setSort} />
                  <SortTh label="Data pedido" sortKey="created_at_shopify" sort={sort} setSort={setSort} />
                  <SortTh label="Cidade/UF" sortKey="shipping_city" sort={sort} setSort={setSort} />
                  <SortTh label="Meio" sortKey="tipo_meio" sort={sort} setSort={setSort} />
                  <SortTh label="Status Shopify" sortKey="financial_status" sort={sort} setSort={setSort} />
                  <SortTh label="Bruto" sortKey="pedido_total_bruto" sort={sort} setSort={setSort} align="right" />
                  <SortTh label="Líquido" sortKey="valor_liquido_mp" sort={sort} setSort={setSort} align="right" />
                  <TableHead className="text-right">Taxa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginados.map((r) => {
                  const bruto = Number(r.pedido_total_bruto ?? 0);
                  const liq = Number(r.valor_liquido_mp ?? 0);
                  return (
                    <TableRow key={r.movimentacao_id} data-foco-id={r.movimentacao_id}>
                      <TableCell className="font-mono text-xs">{r.order_name ?? "—"}</TableCell>
                      <TableCell>
                        {formatDateBR(String(r.data_transacao ?? "").slice(0, 10))}
                      </TableCell>
                      <TableCell>
                        {formatDateBR(String(r.created_at_shopify ?? "").slice(0, 10))}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        {r.shipping_city ?? "—"}
                        {r.shipping_province ? `/${r.shipping_province}` : ""}
                      </TableCell>
                      <TableCell>{formatMeio(r.tipo_meio)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.financial_status ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(bruto)}</TableCell>
                      <TableCell className="text-right tabular-nums text-success">
                        {formatBRL(liq)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL(bruto - liq)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalB2c > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Página {pageSafe} de {totalPages} · {totalB2c} pedidos
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pageSafe <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pageSafe >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SortTh({
  label,
  sortKey,
  sort,
  setSort,
  align = "left",
}: {
  label: string;
  sortKey: string;
  sort: { key: string; dir: "asc" | "desc" } | null;
  setSort: React.Dispatch<React.SetStateAction<{ key: string; dir: "asc" | "desc" } | null>>;
  align?: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground transition-colors ${
        align === "right" ? "text-right" : ""
      }`}
      onClick={() =>
        setSort((prev) =>
          prev?.key === sortKey
            ? { key: sortKey, dir: prev.dir === "asc" ? "desc" : "asc" }
            : { key: sortKey, dir: "desc" }
        )
      }
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className="h-3 w-3 opacity-60" />
      </span>
    </TableHead>
  );
}
