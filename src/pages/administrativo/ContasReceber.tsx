import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Fragment, useMemo, useState } from "react";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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

import { formatBRL, formatDateBR } from "@/lib/format-currency";
import * as XLSX from "xlsx";
import { useNivel } from "@/hooks/useNivel";






type RecebivelB2B = {
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
const INSTRUMENTO_GARANTIDO = ["registrado", "conciliado", "liquidado_banco"];

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

type ChaveFaixa = "f1_7" | "f8_30" | "f31_60" | "f60";

const FAIXAS_ATRASO: readonly [ChaveFaixa, string][] = [
  ["f1_7", "1–7 dias de atraso"],
  ["f8_30", "8–30 dias de atraso"],
  ["f31_60", "31–60 dias de atraso"],
  ["f60", "+60 dias de atraso"],
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

  return (
    <PageShell>
      <PageHeader
        titulo="Recebíveis"
        icone={ArrowDownToLine}
        estado="Recebíveis B2B por parcela — somente títulos faturados, com NF emitida. Para todos os títulos, ver Cobrança em Controladoria. Valor efetivo inclui juros e desconto. Somente leitura."
      />

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="b2b">B2B</TabsTrigger>
          <TabsTrigger value="b2c">B2C</TabsTrigger>
        </TabsList>
        <TabsContent value="b2b" className="mt-4">
          <AbaB2B />
        </TabsContent>
        <TabsContent value="b2c" className="mt-4">
          <AbaB2C />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

/* ============================ B2B ============================ */

function AbaB2B() {
  const navigate = useNavigate();
  const { temNivel } = useNivel();
  const [busca, setBusca] = useState("");
  const [dataBase, setDataBase] = useState<DataBase>("emissao");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [filtroBanco, setFiltroBanco] = useState<string>("todos");
  const [carteiraAtiva, setCarteiraAtiva] = useState<string | null>(null);
  const [achado, setAchado] = useState<Achado | null>(null);
  /** Par mutuamente exclusivo da faixa de KPI. Ambos forçam "em aberto". */
  const [filtroInstrumento, setFiltroInstrumento] = useState<
    "garantido" | "sem_instrumento" | null
  >(null);
  /**
   * PRAZO-TRI-STATE (03/09/2026): "vencido" não é um valor do eixo
   * `eixo_recebimento` — é um subconjunto de "Em aberto". Um sexto chip
   * faria os totais deixarem de somar. O controle de prazo fica fora da fila.
   */
  const [filtroPrazo, setFiltroPrazo] = useState<"todos" | "a_vencer" | "vencidos">(
    "todos"
  );

  const [qualidadeAberta, setQualidadeAberta] = useState(false);
  const [baseMensal, setBaseMensal] = useState<BaseMensal>("competencia");
  const [recebimentosAtivos, setRecebimentosAtivos] = useState<Set<EixoRecebimento>>(
    new Set<EixoRecebimento>(["em_aberto"])
  );

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>({
    key: "data_compra",
    dir: "desc",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["recebivel-gestao"],
    queryFn: async () => {
      /* View de gestão ainda não tipada no client gerado. */
      const cliente = supabase as unknown as {
        from: (tabela: string) => {
          select: (cols: string) => {
            order: (
              col: string,
              opts: { ascending: boolean }
            ) => Promise<{ data: unknown; error: { message: string } | null }>;
          };
        };
      };
      const { data, error } = await cliente
        .from("vw_recebivel_gestao")
        .select("*")
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RecebivelB2B[];
    },
  });

  const hoje = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const hojeIso = useMemo(() => iso(hoje), [hoje]);

  const bancosOpcoes = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((t) => t.banco_nome && set.add(t.banco_nome));
    return Array.from(set).sort();
  }, [data]);

  /** Um filtro, uma verdade: período + busca + banco. Base de tudo que a tela mostra. */
  const baseFiltros = useMemo(() => {
    const titulos = data ?? [];
    const buscaLc = busca.trim().toLowerCase();
    const dDe = dataDe ? new Date(dataDe + "T00:00:00") : null;
    const dAte = dataAte ? new Date(dataAte + "T23:59:59") : null;

    return titulos.filter((t) => {
      if (filtroBanco !== "todos" && t.banco_nome !== filtroBanco) return false;

      if (buscaLc) {
        const num = (t.numero_titulo ?? "").toLowerCase();
        const cli = (t.cliente ?? "").toLowerCase();
        const nf = (t.nf_numero ?? "").toLowerCase();
        const ped = (t.pedido_ref ?? "").toLowerCase();
        if (
          !num.includes(buscaLc) &&
          !cli.includes(buscaLc) &&
          !nf.includes(buscaLc) &&
          !ped.includes(buscaLc)
        )
          return false;
      }

      if (dDe || dAte) {
        const ref =
          dataBase === "vencimento"
            ? t.data_vencimento_vigente ?? t.data_vencimento
            : dataBase === "emissao"
            ? t.data_compra
            : t.data_recebimento;
        if (!ref) return false;
        const d = new Date(ref + "T12:00:00");
        if (dDe && d < dDe) return false;
        if (dAte && d > dAte) return false;
      }
      return true;
    });
  }, [data, busca, dataBase, dataDe, dataAte, filtroBanco]);

  /* DINHEIRO-NO-BANCO: "ainda não recebi" é o que o banco declara, não o estado. */
  const naoRecebido = (t: RecebivelB2B) => t.dinheiro_no_banco === false;

  /* Vencido mede contra a data de caixa projetada — é ela que diz quando o
     dinheiro deveria estar disponível. */
  const venceuNoCaixa = (t: RecebivelB2B) =>
    naoRecebido(t) && !!t.data_caixa_projetada && t.data_caixa_projetada < hojeIso;

  const casaAchado = (t: RecebivelB2B, a: Achado) => {
    if (a === "sobreposicao") return t.sobreposicao_instrumento === true;
    if (a === "renegociacao") return t.renegociacao_humana === true;
    if (a === "sem_prova") return t.fonte_data_recebimento === "marcado_humano";
    if (a === "data_divergente") return t.data_divergente === true;
    if (a === "meio_divergente") return t.meio_divergente === true;
    return t.eh_inadimplente === true;
  };


  /**
   * Camada nova entre `baseFiltros` e `baseCarteira`: filtros da faixa de KPI.
   * Os totais das colunas continuam vindo de `baseFiltros` — senão a coluna
   * ativa zeraria a si mesma e as irmãs sumiriam.
   */
  const baseKpi = useMemo(() => {
    if (!filtroInstrumento && filtroPrazo === "todos") return baseFiltros;
    return baseFiltros.filter((t) => {
      if (filtroInstrumento) {
        if (!naoRecebido(t)) return false;
        const inst = t.eixo_instrumento ?? "";
        if (filtroInstrumento === "garantido" && !INSTRUMENTO_GARANTIDO.includes(inst))
          return false;
        if (filtroInstrumento === "sem_instrumento" && inst !== "sem_instrumento") return false;
      }
      if (filtroPrazo === "vencidos" && !venceuNoCaixa(t)) return false;
      if (filtroPrazo === "a_vencer" && (!naoRecebido(t) || venceuNoCaixa(t)))
        return false;

      return true;
    });
  }, [baseFiltros, filtroInstrumento, filtroPrazo]);

  /**
   * Base dos chips de recebimento: já com carteira, achado e instrumento
   * aplicados, mas SEM o filtro de prazo — senão o botão ativo zeraria a si
   * mesmo. Segue o mesmo padrão de `contagensSemKpi`.
   */
  const baseCarteiraSemPrazo = useMemo(() => {
    let arr = baseFiltros;
    if (filtroInstrumento) {
      arr = arr.filter((t) => {
        if (!naoRecebido(t)) return false;
        const inst = t.eixo_instrumento ?? "";
        if (filtroInstrumento === "garantido" && !INSTRUMENTO_GARANTIDO.includes(inst))
          return false;
        if (filtroInstrumento === "sem_instrumento" && inst !== "sem_instrumento") return false;
        return true;
      });
    }
    return arr.filter((t) => {
      if (carteiraAtiva && t.carteira_codigo !== carteiraAtiva) return false;
      if (achado && !casaAchado(t, achado)) return false;
      return true;
    });
  }, [baseFiltros, filtroInstrumento, carteiraAtiva, achado]);

  /** Base dos chips de recebimento: já com carteira e achado aplicados. */
  const baseCarteira = useMemo(() => {
    return baseKpi.filter((t) => {
      if (carteiraAtiva && t.carteira_codigo !== carteiraAtiva) return false;
      if (achado && !casaAchado(t, achado)) return false;
      return true;
    });
  }, [baseKpi, carteiraAtiva, achado]);

  /** Mesma base, ignorando os filtros de KPI — usada para apagar chips impossíveis. */
  const baseCarteiraSemKpi = useMemo(() => {
    return baseFiltros.filter((t) => {
      if (carteiraAtiva && t.carteira_codigo !== carteiraAtiva) return false;
      if (achado && !casaAchado(t, achado)) return false;
      return true;
    });
  }, [baseFiltros, carteiraAtiva, achado]);

  /* ---------- Linha 1 — Estado da carteira (só período, busca e banco) ---------- */
  const estadoCarteira = useMemo(() => {
    let aReceber = 0;
    let aReceberQtd = 0;
    let aReceberSemData = 0;
    let garantido = 0;
    let garantidoQtd = 0;
    let semInstrumento = 0;
    let semInstrumentoQtd = 0;
    let outros = 0;
    let outrosQtd = 0;
    let vencido = 0;
    let vencidoQtd = 0;
    const faixas = { f1_7: 0, f8_30: 0, f31_60: 0, f60: 0 };

    for (const t of baseFiltros) {
      const v = efetivoDe(t);
      /* VENCIDO-MEDE-CAIXA: a régua é `data_caixa_projetada` — o dia em que o
         dinheiro deveria estar disponível. `eh_inadimplente` continua
         separando atraso do cliente de atraso da adquirente. */
      if (venceuNoCaixa(t)) {
        vencido += v;
        vencidoQtd += 1;
        const venc = t.data_caixa_projetada;
        if (venc) {
          const dias = Math.floor(
            (hoje.getTime() - new Date(venc + "T12:00:00").getTime()) / 86400000
          );
          if (dias <= 7) faixas.f1_7 += v;
          else if (dias <= 30) faixas.f8_30 += v;
          else if (dias <= 60) faixas.f31_60 += v;
          else faixas.f60 += v;
        }
      }
      if (!naoRecebido(t)) continue;

      aReceber += v;
      aReceberQtd += 1;
      if (t.data_vencimento_vigente == null) aReceberSemData += v;

      const inst = t.eixo_instrumento ?? "";
      if (INSTRUMENTO_GARANTIDO.includes(inst)) {
        garantido += v;
        garantidoQtd += 1;
      } else if (inst === "sem_instrumento") {
        semInstrumento += v;
        semInstrumentoQtd += 1;
      } else {
        outros += v;
        outrosQtd += 1;
      }
    }
    return {
      aReceber,
      aReceberQtd,
      aReceberSemData,
      garantido,
      garantidoQtd,
      semInstrumento,
      semInstrumentoQtd,
      outros,
      outrosQtd,
      vencido,
      vencidoQtd,
      faixas,
    };
  }, [baseFiltros, hoje]);

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

  const clicarPrazo = (k: "a_vencer" | "vencidos") => {
    setFiltroPrazo((prev) => (prev === k ? "todos" : k));
    setPage(1);
  };


  /* ---------- Linha 2 — Carteiras ---------- */
  const carteiras = useMemo(() => {
    const mapa = new Map<
      string,
      {
        codigo: string;
        nome: string;
        ordem: number;
        previsaoConfiavel: boolean;
        rotuloData: string | null;
        aberto: number;
        qtd: number;
      }
    >();
    for (const t of baseFiltros) {
      const codigo = t.carteira_codigo ?? "—";
      const atual =
        mapa.get(codigo) ??
        {
          codigo,
          nome: t.carteira_nome ?? codigo,
          ordem: t.carteira_ordem ?? 99,
          previsaoConfiavel: t.carteira_previsao_confiavel !== false,
          rotuloData: t.carteira_rotulo_data,
          aberto: 0,
          qtd: 0,
        };
      if (t.estado_em_aberto === true) {
        atual.aberto += efetivoDe(t);
        atual.qtd += 1;
      }
      mapa.set(codigo, atual);
    }
    return Array.from(mapa.values()).sort((a, b) => a.ordem - b.ordem);
  }, [baseFiltros]);

  /* ---------- Chips de recebimento ---------- */
  const contagensRecebimento = useMemo(() => {
    const c = {} as Record<EixoRecebimento, number>;
    for (const r of RECEBIMENTO_ORDEM) c[r] = 0;
    for (const t of baseCarteira) {
      const r = t.eixo_recebimento;
      if (r && r in c) c[r] += 1;
    }
    return c;
  }, [baseCarteira]);

  /** Contagem ignorando os filtros de KPI: revela chip impossível vs. chip vazio. */
  const contagensSemKpi = useMemo(() => {
    const c = {} as Record<EixoRecebimento, number>;
    for (const r of RECEBIMENTO_ORDEM) c[r] = 0;
    for (const t of baseCarteiraSemKpi) {
      const r = t.eixo_recebimento;
      if (r && r in c) c[r] += 1;
    }
    return c;
  }, [baseCarteiraSemKpi]);

  /** Contagens do controle segmentado de prazo: sem o próprio filtro de prazo
   *  aplicado, para o botão ativo não zerar a si mesmo. */
  const contagensPrazo = useMemo(() => {
    let aVencer = 0;
    let vencidos = 0;
    for (const t of baseCarteiraSemPrazo) {
      if (t.eh_inadimplente === true) vencidos += 1;
      else if (t.estado_em_aberto === true) aVencer += 1;
    }
    return { aVencer, vencidos };
  }, [baseCarteiraSemPrazo]);

  const rotuloFiltroKpi =
    filtroInstrumento === "garantido"
      ? "Garantido em banco"
      : filtroInstrumento === "sem_instrumento"
      ? "Sem instrumento"
      : filtroPrazo === "vencidos"
      ? "Prazo: Vencidos"
      : filtroPrazo === "a_vencer"
      ? "Prazo: A vencer"
      : null;

  const totalAtraso =
    estadoCarteira.faixas.f1_7 +
    estadoCarteira.faixas.f8_30 +
    estadoCarteira.faixas.f31_60 +
    estadoCarteira.faixas.f60;

  const pctGarantido =
    estadoCarteira.aReceber > 0
      ? Math.round((estadoCarteira.garantido / estadoCarteira.aReceber) * 100)
      : 0;

  /** Uma frase honesta sobre o topo do aging, sem tabelinha. */
  const resumoAtraso = useMemo(() => {
    const f = estadoCarteira.faixas;
    if (totalAtraso === 0) return "sem atraso";
    if (f.f60 > 0) return `+60d: ${formatBRLCurto(f.f60)}`;
    if (f.f31_60 > 0) return `31–60d: ${formatBRLCurto(f.f31_60)}`;
    if (f.f8_30 > 0) return `8–30d: ${formatBRLCurto(f.f8_30)}`;
    return "nada acima de 7d";
  }, [estadoCarteira.faixas, totalAtraso]);

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
      lista.push({
        chave: "prazo",
        rotulo: filtroPrazo === "vencidos" ? "Prazo: Vencidos" : "Prazo: A vencer",
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
  const buscaForaDoRecorte = useMemo(() => {
    if (!busca.trim()) return null;
    if (baseFiltros.length === 0) return null;
    const nomes = new Set(
      baseFiltros.map((t) => t.carteira_nome ?? t.carteira_codigo ?? "—")
    );
    return {
      n: baseFiltros.length,
      carteira: nomes.size === 1 ? Array.from(nomes)[0] : null,
    };
  }, [busca, baseFiltros]);


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
  const totalCarregado = (data ?? []).length;
  const achados = useMemo(() => {
    const lista: { chave: Achado; rotulo: string; n: number }[] = [
      { chave: "sobreposicao", rotulo: "Sobreposição do instrumento", n: 0 },
      { chave: "renegociacao", rotulo: "Renegociação humana", n: 0 },
      { chave: "sem_prova", rotulo: "Sem prova bancária", n: 0 },
      { chave: "data_divergente", rotulo: "Data divergente", n: 0 },
      { chave: "meio_divergente", rotulo: "Meio ≠ pedido", n: 0 },
      { chave: "inadimplente", rotulo: "Inadimplentes", n: 0 },
    ];
    for (const t of data ?? []) {
      for (const item of lista) if (casaAchado(t, item.chave)) item.n += 1;
    }
    return lista;
  }, [data]);

  /* ---------- Tabela mensal (mantida como está) ---------- */
  const mensal = useMemo(() => {
    const mapa = new Map<
      string,
      { mes: string; titulos: number; recebido: number; aberto: number; atrasado: number; total: number }
    >();
    for (const t of data ?? []) {
      if (t.eixo_recebimento === "cancelado" || t.eixo_recebimento === "devolvido") continue;
      let key: string | null = null;
      if (baseMensal === "competencia") key = mesKeyDe(t.mes_competencia ?? t.data_compra);
      else if (baseMensal === "caixa_projetado") {
        key = mesKeyDe(t.mes_caixa_projetado ?? t.data_caixa_projetada);
      } else if (t.data_recebimento_efetiva) {
        key = mesKeyDe(t.mes_caixa_efetivo ?? t.data_recebimento_efetiva);
      }
      if (!key) continue;
      const linha =
        mapa.get(key) ??
        { mes: key, titulos: 0, recebido: 0, aberto: 0, atrasado: 0, total: 0 };
      const v = efetivoDe(t);
      linha.titulos += 1;
      linha.total += v;
      if (t.eixo_recebimento === "compensado" || t.eixo_recebimento === "quitado")
        linha.recebido += v;
      else if (t.eh_inadimplente === true) linha.atrasado += v;
      else linha.aberto += v;

      mapa.set(key, linha);
    }
    return Array.from(mapa.values()).sort((a, b) => (a.mes < b.mes ? 1 : -1));
  }, [data, baseMensal]);

  const totalMensal = useMemo(
    () =>
      mensal.reduce(
        (acc, l) => ({
          titulos: acc.titulos + l.titulos,
          recebido: acc.recebido + l.recebido,
          aberto: acc.aberto + l.aberto,
          atrasado: acc.atrasado + l.atrasado,
          total: acc.total + l.total,
        }),
        { titulos: 0, recebido: 0, aberto: 0, atrasado: 0, total: 0 }
      ),
    [mensal]
  );

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
  const filtrados = useMemo(() => {
    let arr = baseCarteira.filter(
      (t) => t.eixo_recebimento != null && recebimentosAtivos.has(t.eixo_recebimento)
    );
    if (sort) {
      arr = [...arr].sort((a, b) => {
        if (sort.key === "data_vencimento_vigente") {
          const va = a.data_vencimento_vigente ?? null;
          const vb = b.data_vencimento_vigente ?? null;
          if (va === vb) return 0;
          if (va == null) return 1; // nulls last
          if (vb == null) return -1;
          return sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        const campo = (t: RecebivelB2B) =>
          (t as unknown as Record<string, string | number | boolean | null>)[sort.key] ?? "";
        const va = campo(a);
        const vb = campo(b);
        if (typeof va === "string" && typeof vb === "string") {
          return sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        if (typeof va === "number" && typeof vb === "number") {
          return sort.dir === "asc" ? va - vb : vb - va;
        }
        const sa = String(va);
        const sb = String(vb);
        return sort.dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
    }
    return arr;
  }, [baseCarteira, recebimentosAtivos, sort]);

  const semChip = recebimentosAtivos.size === 0;

  /* Agrupamento por pedido. */
  const grupos = useMemo(() => {
    const universo = new Map<string, { n: number; total: number }>();
    for (const t of data ?? []) {
      const chave = t.pedido_ref ? `p:${t.pedido_ref}` : `t:${t.id}`;
      const cur = universo.get(chave) ?? { n: 0, total: 0 };
      cur.n += 1;
      cur.total += efetivoDe(t);
      universo.set(chave, cur);
    }
    const mapa = new Map<string, RecebivelB2B[]>();
    for (const t of filtrados) {
      const chave = t.pedido_ref ? `p:${t.pedido_ref}` : `t:${t.id}`;
      const arr = mapa.get(chave);
      if (arr) arr.push(t);
      else mapa.set(chave, [t]);
    }
    return Array.from(mapa.entries()).map(([chave, titulos]) => {
      const primeiro = titulos[0];
      const vencimentos = titulos
        .filter((t) => t.estado_em_aberto === true && t.data_vencimento_vigente)
        .map((t) => t.data_vencimento_vigente as string)
        .sort();

      // PIOR-ESTADO-VENCE: o grupo vale pelo membro mais grave, nunca pela moda.
      const estadosDistintos = new Set(titulos.map((t) => t.estado_rotulo));
      const misto = estadosDistintos.size > 1;
      const inadimplente = titulos.find((t) => t.eh_inadimplente === true);
      const vencido = titulos.find(
        (t) =>
          t.estado_em_aberto === true &&
          t.data_vencimento_vigente != null &&
          t.data_vencimento_vigente < hojeIso
      );
      const aberto = titulos.find((t) => t.estado_em_aberto === true);
      const fechados = titulos.filter((t) => t.estado_em_aberto !== true);
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
      const escolhido = inadimplente || vencido || aberto || recenteFechado || primeiro;
      const estadoRotulo = escolhido.estado_rotulo ?? null;
      const estadoCor = escolhido.estado_cor ?? null;

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
  }, [filtrados, data, hojeIso]);

  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const toggleGrupo = (chave: string) =>
    setAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });

  const [agrupado, setAgrupado] = useState(true);

  const totalItens = agrupado ? grupos.length : filtrados.length;
  const totalPages = Math.max(1, Math.ceil(totalItens / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);

  const linhaTitulo = (t: RecebivelB2B, aninhada: boolean) => {
    const atrasado = t.eh_inadimplente === true;
    const desvio = t.desvio_registro_dias;
    return (
      <TableRow
        key={t.id}
        className={atrasado ? "bg-destructive/10" : aninhada ? "bg-muted/10" : undefined}
      >
        <TableCell className={aninhada ? "pl-10" : undefined}>
          <div className="font-mono text-xs">{t.numero_titulo ?? "—"}</div>
          {t.numero_parcela != null && t.total_parcelas != null && (
            <div className="text-xs text-muted-foreground">
              parcela {t.numero_parcela}/{t.total_parcelas}
            </div>
          )}
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
                if (t.pedido_id) navigate(`/pedidos/${t.pedido_id}`);
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
        <TableCell
          className={
            desvio != null && Math.abs(desvio) > 15
              ? "text-sm tabular-nums text-warning"
              : "text-sm tabular-nums"
          }
        >
          {fmtDesvio(desvio)}
        </TableCell>
        <TableCell className="text-right tabular-nums">{formatBRL(efetivoDe(t))}</TableCell>
        <TableCell>
          <BadgeEstado rotulo={t.estado_rotulo} cor={t.estado_cor} />
        </TableCell>
      </TableRow>
    );
  };

  const periodoLabel = dataDe || dataAte ? `${dataDe || "inicio"}_${dataAte || "hoje"}` : "todo";

  const handleExportXLSX = () => {
    const linhas = filtrados.map((t) => ({
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
      "Data banco": formatDateBR(t.data_pagamento_banco),
      "Data humano": formatDateBR(t.data_pagamento),
      Divergente: t.data_divergente ? "Sim" : "Não",
      Valor: efetivoDe(t),
      "Valor bruto": t.valor_bruto ?? 0,
      Juros: t.valor_juros ?? 0,
      Desconto: t.valor_desconto ?? 0,
      "Gera caixa": t.gera_caixa ? "Sim" : "Não",
      "Prova bancária": t.tem_prova_bancaria ? "Sim" : "Não",
      Recebimento: t.eixo_recebimento ? RECEBIMENTO_LABEL[t.eixo_recebimento] : "",
      Instrumento: t.eixo_instrumento ?? "",
      Qualidade: t.qualidade ?? "",
      Estado: t.estado_rotulo ?? "",
      Inadimplente: t.eh_inadimplente ? "Sim" : "Não",
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Recebíveis B2B");
    XLSX.writeFile(wb, `recebiveis-b2b-${periodoLabel}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {/* Exportação leva a base para fora: nível 3 (Coordenador) para cima. */}
        {temNivel(3) && (
          <Button
            variant="outline"
            onClick={handleExportXLSX}
            disabled={filtrados.length === 0}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Exportar XLSX
          </Button>
        )}
      </div>

      {/* Faixa 1 — Estado da carteira. Recorte fixo: período, busca e banco.
          Colunas são filtro: "A receber" é o universo (limpa), garantido ×
          sem instrumento são par exclusivo, vencido é transversal. */}
      <div className="grid grid-cols-2 divide-x divide-border rounded-xl border border-border bg-card md:grid-cols-4">
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
        <ColunaKpi
          rotulo="Vencido"
          valor={formatBRLCurto(estadoCarteira.vencido)}
          corValor="text-destructive"
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
                      {formatBRL(estadoCarteira.faixas[chave])}
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
                  const valor = estadoCarteira.faixas[chave];
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
                {estadoCarteira.vencidoQtd} títulos · {resumoAtraso}
              </p>
            </>
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
                    "min-w-[170px] flex-1 rounded-lg border p-3 text-left transition-colors " +
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
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => navigate("/administrativo/previsao-recebimentos")}
          >
            Para ver quando o dinheiro cai, dia a dia e por conta: Fluxo de Recebimentos
          </button>
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
              {RECEBIMENTO_ORDEM.map((r) => {
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
                    {RECEBIMENTO_LABEL[r]} ({n})
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
                <Button
                  size="sm"
                  variant={filtroPrazo === "vencidos" ? "default" : "outline"}
                  onClick={() => clicarPrazo("vencidos")}
                >
                  Vencidos ({contagensPrazo.vencidos})
                </Button>
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

      {/* Painel recolhido — Qualidade de dado */}
      <Card>
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

      {/* Tabela */}
      <div className="flex items-center justify-end gap-1">
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
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
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
                    {baseCarteira.length} título{baseCarteira.length !== 1 ? "s" : ""} escondido
                    {baseCarteira.length !== 1 ? "s" : ""} — clique num chip acima.
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
            <Table>
              <TableHeader>
                <TableRow>
                  <SortTh label="Título" sortKey="numero_titulo" sort={sort} setSort={setSort} />
                  <SortTh label="Cliente" sortKey="cliente" sort={sort} setSort={setSort} />
                  <SortTh label="Pedido" sortKey="pedido_ref" sort={sort} setSort={setSort} />
                  <SortTh label="NF" sortKey="nf_numero" sort={sort} setSort={setSort} />
                  <SortTh label="Carteira" sortKey="carteira_ordem" sort={sort} setSort={setSort} />
                  <SortTh
                    label="Data"
                    sortKey="data_vencimento_vigente"
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
                      .slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)
                      .map((g) => {
                        const aberto = abertos.has(g.chave);
                        if (g.titulos.length === 1 && g.ocultos === 0)
                          return linhaTitulo(g.titulos[0], false);
                        return (
                          <Fragment key={g.chave}>
                            <TableRow
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
                                      if (g.pedidoId) navigate(`/pedidos/${g.pedidoId}`);
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
                      .slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)
                      .map((t) => linhaTitulo(t, false))}
              </TableBody>
            </Table>
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

function AbaB2C() {
  const { temNivel } = useNivel();
  const [busca, setBusca] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [page, setPage] = useState(1);
  const [listaFvr, setListaFvr] = useState<
    "faturado_sem_recebimento" | "recebido_sem_nf" | "conciliado"
  >("faturado_sem_recebimento");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>({
    key: "data_transacao",
    dir: "desc",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["recebivel-b2c-pedido"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_recebivel_b2c_pedido")
        .select("*")
        .order("data_transacao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RecebivelB2C[];
    },
  });

  const { data: fvrData } = useQuery({
    queryKey: ["b2c-faturado-vs-recebido"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_b2c_faturado_vs_recebido")
        .select("*");
      if (error) throw error;
      return (data ?? []) as FatVsReceb[];
    },
  });

  const base = useMemo(() => {
    const buscaLc = busca.trim().toLowerCase();
    const dDe = dataDe ? new Date(dataDe + "T00:00:00") : null;
    const dAte = dataAte ? new Date(dataAte + "T23:59:59") : null;
    return (data ?? []).filter((r) => {
      if (buscaLc) {
        const alvo = `${r.order_name ?? ""} ${r.shopify_id ?? ""} ${r.mp_payment_id ?? ""} ${r.shipping_city ?? ""}`.toLowerCase();
        if (!alvo.includes(buscaLc)) return false;
      }
      if (!dDe && !dAte) return true;
      if (!r.data_transacao) return false;
      const d = new Date(String(r.data_transacao).slice(0, 10) + "T12:00:00");
      if (dDe && d < dDe) return false;
      if (dAte && d > dAte) return false;
      return true;
    });
  }, [data, busca, dataDe, dataAte]);

  const fvrBase = useMemo(() => {
    const buscaLc = busca.trim().toLowerCase();
    const dDe = dataDe ? new Date(dataDe + "T00:00:00") : null;
    const dAte = dataAte ? new Date(dataAte + "T23:59:59") : null;
    return (fvrData ?? []).filter((r) => {
      if (buscaLc) {
        const alvo = `${r.pedido_ref ?? ""} ${r.cliente ?? ""} ${r.nf_refs ?? ""} ${r.cidade ?? ""}`.toLowerCase();
        if (!alvo.includes(buscaLc)) return false;
      }
      if (!dDe && !dAte) return true;
      if (!r.data_emissao) return false;
      const d = new Date(String(r.data_emissao).slice(0, 10) + "T12:00:00");
      if (dDe && d < dDe) return false;
      if (dAte && d > dAte) return false;
      return true;
    });
  }, [fvrData, busca, dataDe, dataAte]);

  const semRecebimento = useMemo(
    () =>
      fvrBase
        .filter((r) => r.situacao === "faturado_sem_recebimento")
        .sort((a, b) => (diasDesde(b.data_emissao) ?? 0) - (diasDesde(a.data_emissao) ?? 0)),
    [fvrBase]
  );
  const recebidoSemNf = useMemo(() => {
    const buscaLc = busca.trim().toLowerCase();
    return (fvrData ?? []).filter((r) => {
      if (r.situacao !== "recebido_sem_nf") return false;
      if (!buscaLc) return true;
      const alvo = `${r.pedido_ref ?? ""} ${r.cliente ?? ""} ${r.nf_refs ?? ""} ${r.cidade ?? ""}`.toLowerCase();
      return alvo.includes(buscaLc);
    });
  }, [fvrData, busca]);
  const conciliados = useMemo(
    () =>
      fvrBase
        .filter((r) => r.situacao === "conciliado")
        .sort(
          (a, b) =>
            Math.abs(Number(b.delta_bruto_vs_faturado ?? 0)) -
            Math.abs(Number(a.delta_bruto_vs_faturado ?? 0))
        ),
    [fvrBase]
  );

  /**
   * `vw_recebivel_b2c_pedido` não tem nome de cliente. Busca por cliente acha
   * em Faturado x Recebido e volta vazia aqui. Sem este contador a tela
   * mentiria por omissao, como a aba B2B ja mentiu uma vez.
   */
  const achadosFvr = useMemo(() => {
    if (!busca.trim()) return 0;
    return fvrBase.length + recebidoSemNf.length;
  }, [busca, fvrBase, recebidoSemNf]);

  const kpiFuro = useMemo(() => {
    const total = semRecebimento.reduce((s, r) => s + Number(r.faturado ?? 0), 0);
    const dias = semRecebimento
      .map((r) => diasDesde(r.data_emissao))
      .filter((d): d is number => d !== null);
    return { total, n: semRecebimento.length, maisAntigo: dias.length ? Math.max(...dias) : null };
  }, [semRecebimento]);

  const kpis = useMemo(() => {
    let bruto = 0;
    let liquido = 0;
    for (const r of base) {
      bruto += Number(r.pedido_total_bruto ?? 0);
      liquido += Number(r.valor_liquido_mp ?? 0);
    }
    const taxa = bruto - liquido;
    return { bruto, liquido, taxa, pct: bruto > 0 ? (taxa / bruto) * 100 : 0 };
  }, [base]);

  const mensal = useMemo(() => {
    const mapa = new Map<
      string,
      { mes: string; pedidos: number; bruto: number; liquido: number }
    >();
    for (const r of base) {
      const key = mesKeyDe(r.data_transacao);
      if (!key) continue;
      const l = mapa.get(key) ?? { mes: key, pedidos: 0, bruto: 0, liquido: 0 };
      l.pedidos += 1;
      l.bruto += Number(r.pedido_total_bruto ?? 0);
      l.liquido += Number(r.valor_liquido_mp ?? 0);
      mapa.set(key, l);
    }
    return Array.from(mapa.values()).sort((a, b) => (a.mes < b.mes ? 1 : -1));
  }, [base]);

  /** Mesmos dados, ordem crescente (mais antigo à esquerda). */
  const mensalAsc = useMemo(() => [...mensal].reverse(), [mensal]);

  const totalMensalB2c = useMemo(
    () =>
      mensal.reduce(
        (acc, l) => ({
          pedidos: acc.pedidos + l.pedidos,
          bruto: acc.bruto + l.bruto,
          liquido: acc.liquido + l.liquido,
        }),
        { pedidos: 0, bruto: 0, liquido: 0 }
      ),
    [mensal]
  );

  const ordenados = useMemo(() => {
    if (!sort) return base;
    return [...base].sort((a, b) => {
      const va = (a as any)[sort.key] ?? "";
      const vb = (b as any)[sort.key] ?? "";
      if (typeof va === "number" && typeof vb === "number") {
        return sort.dir === "asc" ? va - vb : vb - va;
      }
      const sa = String(va);
      const sb = String(vb);
      return sort.dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  }, [base, sort]);

  const totalPages = Math.max(1, Math.ceil(ordenados.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginados = ordenados.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const periodoLabel = dataDe || dataAte ? `${dataDe || "inicio"}_${dataAte || "hoje"}` : "todo";

  const handleExportXLSX = () => {
    const linhas = ordenados.map((r) => ({
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

    const listaSel =
      listaFvr === "faturado_sem_recebimento"
        ? semRecebimento
        : listaFvr === "recebido_sem_nf"
          ? recebidoSemNf
          : conciliados;
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


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-xs text-muted-foreground">
          B2C não usa título — o recebível nasce liquidado, por pedido. Não existe aberto nem futuro
          aqui, e estes valores não somam com os do B2B. Mercado Pago liquida em D+14: venda recente
          ainda não caiu.
        </p>
        {/* Exportação leva a base para fora: nível 3 (Coordenador) para cima. */}
        {temNivel(3) && (
          <Button
            variant="outline"
            onClick={handleExportXLSX}
            disabled={ordenados.length === 0}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Exportar XLSX
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Bruto Shopify</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium tabular-nums">{formatBRL(kpis.bruto)}</div>
            <p className="text-xs text-muted-foreground">{base.length} pedidos</p>
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
                Faturado sem recebimento ({semRecebimento.length})
              </Button>
              <Button
                size="sm"
                variant={listaFvr === "recebido_sem_nf" ? "default" : "outline"}
                onClick={() => setListaFvr("recebido_sem_nf")}
              >
                Recebido sem NF ({recebidoSemNf.length})
              </Button>
              <Button
                size="sm"
                variant={listaFvr === "conciliado" ? "default" : "outline"}
                onClick={() => setListaFvr("conciliado")}
              >
                Conciliados ({conciliados.length})
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
                          conciliados.reduce(
                            (s, r) => s + Number(r.delta_bruto_vs_faturado ?? 0),
                            0
                          )
                        )}
                      </TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
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
                    <TableRow key={r.movimentacao_id}>
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

      {ordenados.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Página {pageSafe} de {totalPages} · {ordenados.length} pedidos
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
