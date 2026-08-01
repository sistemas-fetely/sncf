import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { ArrowDownToLine, Inbox, ArrowUpDown, ArrowUp, ArrowDown, Download } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import * as XLSX from "xlsx";

type StatusGestao = "pago" | "atrasado" | "em_aberto" | "cancelado";

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
  status_gestao: StatusGestao;
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
  data_recebimento_efetiva: string | null;
  fonte_data_recebimento: "banco" | "humano" | "sem_recebimento" | null;
  data_pagamento_banco: string | null;
  data_divergente: boolean | null;
  mes_caixa_efetivo: string | null;
};


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

type DataBase = "vencimento" | "emissao" | "liquidacao";
type BaseMensal = "competencia" | "caixa_previsto" | "caixa_efetivo";

const SITUACOES: { key: StatusGestao; label: string }[] = [
  { key: "pago", label: "Recebido" },
  { key: "em_aberto", label: "Em aberto" },
  { key: "atrasado", label: "Atrasado" },
  { key: "cancelado", label: "Cancelado" },
];

const SEM_CAIXA = ["haver", "bonificacao", "devolucao", "sem_pagamento"];

const capitalize = (s: string) =>
  s
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");

const formatMeio = (m: string | null) => (m ? capitalize(m.replace(/_/g, " ")) : "—");

const rotuloStatus = (s: StatusGestao) =>
  s === "pago" ? "Recebido" : s === "atrasado" ? "Atrasado" : s === "cancelado" ? "Cancelado" : "Em aberto";

const efetivoDe = (t: RecebivelB2B) => Number(t.valor_efetivo ?? t.valor ?? 0);

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

function AtalhosPeriodo({ onPick }: { onPick: (de: string, ate: string) => void }) {
  const itens: { key: "atual" | "anterior" | "tres" | "todo"; label: string }[] = [
    { key: "atual", label: "Mês atual" },
    { key: "anterior", label: "Mês anterior" },
    { key: "tres", label: "Últimos 3 meses" },
    { key: "todo", label: "Todo o período" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {itens.map((i) => (
        <Button
          key={i.key}
          size="sm"
          variant="outline"
          onClick={() => {
            const [de, ate] = atalhoPeriodo(i.key);
            onPick(de, ate);
          }}
        >
          {i.label}
        </Button>
      ))}
    </div>
  );
}

export default function ContasReceber() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <ArrowDownToLine className="h-7 w-7 text-admin" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Recebíveis</h1>
          <p className="text-sm text-muted-foreground">
            Recebíveis B2B por parcela (títulos com NF) e B2C por pedido. Valor efetivo inclui juros
            e desconto. Somente leitura.
          </p>
        </div>
      </div>

      <Tabs defaultValue="b2b">
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
    </div>
  );
}

/* ============================ B2B ============================ */

function AbaB2B() {
  const [busca, setBusca] = useState("");
  const [dataBase, setDataBase] = useState<DataBase>("emissao");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [filtroBanco, setFiltroBanco] = useState<string>("todos");
  const [filtroMeio, setFiltroMeio] = useState<string>("todos");
  const [soRenegociados, setSoRenegociados] = useState(false);
  const [soSemProva, setSoSemProva] = useState(false);
  const [soDivergentes, setSoDivergentes] = useState(false);
  const [baseMensal, setBaseMensal] = useState<BaseMensal>("competencia");
  const [situacoes, setSituacoes] = useState<Set<StatusGestao>>(
    new Set<StatusGestao>(["pago", "em_aberto", "atrasado"])
  );
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>({
    key: "data_compra",
    dir: "desc",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["recebivel-b2b"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_recebivel_b2b")
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

  const em30 = useMemo(() => new Date(hoje.getTime() + 30 * 86400000), [hoje]);

  const bancosOpcoes = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((t) => t.banco_nome && set.add(t.banco_nome));
    return Array.from(set).sort();
  }, [data]);

  const meiosOpcoes = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((t) => t.meio_pagamento && set.add(t.meio_pagamento));
    return Array.from(set).sort();
  }, [data]);

  const qtdRenegociados = useMemo(
    () => (data ?? []).filter((t) => t.venc_renegociado === true).length,
    [data]
  );

  const qtdSemProva = useMemo(
    () => (data ?? []).filter((t) => t.fonte_data_recebimento === "humano").length,
    [data]
  );

  const qtdDivergentes = useMemo(
    () => (data ?? []).filter((t) => t.data_divergente === true).length,
    [data]
  );


  /** Conjunto filtrado por tudo EXCETO situação — base dos KPIs e das contagens. */
  const base = useMemo(() => {
    const titulos = data ?? [];
    const buscaLc = busca.trim().toLowerCase();
    const dDe = dataDe ? new Date(dataDe + "T00:00:00") : null;
    const dAte = dataAte ? new Date(dataAte + "T23:59:59") : null;

    return titulos.filter((t) => {
      if (filtroBanco !== "todos" && t.banco_nome !== filtroBanco) return false;
      if (filtroMeio !== "todos" && t.meio_pagamento !== filtroMeio) return false;
      if (soRenegociados && t.venc_renegociado !== true) return false;
      if (soSemProva && t.fonte_data_recebimento !== "humano") return false;
      if (soDivergentes && t.data_divergente !== true) return false;

      if (buscaLc) {
        const num = (t.numero_titulo ?? "").toLowerCase();
        const cli = (t.cliente ?? "").toLowerCase();
        const nf = (t.nf_numero ?? "").toLowerCase();
        if (!num.includes(buscaLc) && !cli.includes(buscaLc) && !nf.includes(buscaLc)) return false;
      }

      if (dDe || dAte) {
        const ref =
          dataBase === "vencimento"
            ? t.data_vencimento
            : dataBase === "emissao"
            ? t.data_compra
            : t.data_liquidacao;
        if (!ref) return false;
        const d = new Date(ref + "T12:00:00");
        if (dDe && d < dDe) return false;
        if (dAte && d > dAte) return false;
      }
      return true;
    });
  }, [data, busca, dataBase, dataDe, dataAte, filtroBanco, filtroMeio, soRenegociados, soSemProva, soDivergentes]);

  const contagens = useMemo(() => {
    const c: Record<StatusGestao, number> = { pago: 0, em_aberto: 0, atrasado: 0, cancelado: 0 };
    for (const t of base) c[t.status_gestao] = (c[t.status_gestao] ?? 0) + 1;
    return c;
  }, [base]);

  const kpis = useMemo(() => {
    let recebido = 0;
    let recebidoQtd = 0;
    let aberto = 0;
    let abertoQtd = 0;
    let vencido = 0;
    let vence30 = 0;
    let semProva = 0;
    let semProvaQtd = 0;
    for (const t of base) {
      const v = efetivoDe(t);
      if (t.fonte_data_recebimento === "humano") {
        semProva += v;
        semProvaQtd += 1;
      }
      if (t.status_gestao === "cancelado") continue;
      if (t.status_gestao === "pago") {
        recebido += v;
        recebidoQtd += 1;
        continue;
      }
      aberto += v;
      abertoQtd += 1;
      if (t.status_gestao === "atrasado") vencido += v;
      if (t.status_gestao === "em_aberto") {
        const ref = t.data_liquidacao ?? t.data_vencimento;
        if (ref) {
          const d = new Date(ref + "T12:00:00");
          if (d >= hoje && d <= em30) vence30 += v;
        }
      }
    }
    const inadimplencia = aberto > 0 ? (vencido / aberto) * 100 : 0;
    return {
      recebido,
      recebidoQtd,
      aberto,
      abertoQtd,
      vencido,
      vence30,
      inadimplencia,
      semProva,
      semProvaQtd,
      semProvaPct: recebido > 0 ? (semProva / recebido) * 100 : 0,
      total: recebido + aberto,
      totalQtd: recebidoQtd + abertoQtd,
    };
  }, [base, hoje, em30]);


  /** Comparação com o mês anterior quando o período selecionado é um mês fechado. */
  const comparativo = useMemo(() => {
    if (!dataDe || !dataAte || !data) return null;
    const de = new Date(dataDe + "T00:00:00");
    const ate = new Date(dataAte + "T00:00:00");
    const fimMes = new Date(de.getFullYear(), de.getMonth() + 1, 0);
    const ehMesFechado =
      de.getDate() === 1 &&
      ate.getFullYear() === fimMes.getFullYear() &&
      ate.getMonth() === fimMes.getMonth() &&
      ate.getDate() === fimMes.getDate();
    if (!ehMesFechado) return null;

    const antDe = new Date(de.getFullYear(), de.getMonth() - 1, 1);
    const antAte = new Date(de.getFullYear(), de.getMonth(), 0);

    const somaRecebido = (ini: Date, fim: Date) => {
      let s = 0;
      let houve = false;
      for (const t of data) {
        const ref =
          dataBase === "vencimento"
            ? t.data_vencimento
            : dataBase === "emissao"
            ? t.data_compra
            : t.data_liquidacao;
        if (!ref) continue;
        const d = new Date(ref + "T12:00:00");
        if (d < ini || d > fim) continue;
        houve = true;
        if (t.status_gestao === "pago") s += efetivoDe(t);
      }
      return houve ? s : null;
    };

    const atual = somaRecebido(de, new Date(ate.getTime() + 86399000)) ?? 0;
    const anterior = somaRecebido(antDe, new Date(antAte.getTime() + 86399000));
    if (anterior == null) return null;
    const variacao = anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;
    return { atual, anterior, variacao };
  }, [data, dataDe, dataAte, dataBase]);

  const aging = useMemo(() => {
    const faixas = { f1_7: 0, f8_30: 0, f31_60: 0, f60: 0 };
    for (const t of base) {
      if (t.status_gestao !== "em_aberto" && t.status_gestao !== "atrasado") continue;
      if (!t.data_vencimento) continue;
      const venc = new Date(t.data_vencimento + "T12:00:00");
      const dias = Math.floor((hoje.getTime() - venc.getTime()) / 86400000);
      const valor = efetivoDe(t);
      if (dias <= 0) continue;
      else if (dias <= 7) faixas.f1_7 += valor;
      else if (dias <= 30) faixas.f8_30 += valor;
      else if (dias <= 60) faixas.f31_60 += valor;
      else faixas.f60 += valor;
    }
    return faixas;
  }, [base, hoje]);

  const breakdownMeio = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const t of base) {
      if (t.status_gestao === "cancelado" || t.status_gestao === "pago") continue;
      if (SEM_CAIXA.includes(t.meio_pagamento ?? "")) continue;
      const meio = t.meio_pagamento ?? "—";
      mapa.set(meio, (mapa.get(meio) ?? 0) + efetivoDe(t));
    }
    return Array.from(mapa.entries())
      .map(([meio, total]) => ({ meio, total }))
      .filter((i) => i.total >= 1)
      .sort((a, b) => b.total - a.total);
  }, [base]);

  /** Mês a mês, sobre TODOS os títulos (não depende dos filtros de data). */
  const mensal = useMemo(() => {
    const mapa = new Map<
      string,
      { mes: string; titulos: number; recebido: number; aberto: number; atrasado: number; total: number }
    >();
    for (const t of data ?? []) {
      if (t.status_gestao === "cancelado") continue;
      let key: string | null = null;
      if (baseMensal === "competencia") key = mesKeyDe(t.mes_competencia ?? t.data_compra);
      else if (baseMensal === "caixa_previsto") {
        if (t.liquidacao_realizada === true) key = mesKeyDe(t.data_liquidacao);
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
      if (t.status_gestao === "pago") linha.recebido += v;
      else if (t.status_gestao === "atrasado") linha.atrasado += v;
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
    setDataBase(baseMensal === "competencia" ? "emissao" : "liquidacao");
    setDataDe(iso(de));
    setDataAte(iso(ate));
    setPage(1);
  };

  const filtrados = useMemo(() => {
    let arr = base.filter((t) => situacoes.has(t.status_gestao));
    if (sort) {
      arr = [...arr].sort((a, b) => {
        const va = (a as any)[sort.key] ?? "";
        const vb = (b as any)[sort.key] ?? "";
        if (typeof va === "string" && typeof vb === "string") {
          return sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        if (typeof va === "number" && typeof vb === "number") {
          return sort.dir === "asc" ? va - vb : vb - va;
        }
        return sort.dir === "asc" ? (va > vb ? 1 : -1) : va < vb ? 1 : -1;
      });
    }
    return arr;
  }, [base, situacoes, sort]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginados = filtrados.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const toggleSituacao = (k: StatusGestao) => {
    setSituacoes((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setPage(1);
  };

  const renderStatusBadge = (s: StatusGestao) => {
    if (s === "pago")
      return <Badge className="bg-emerald-100 text-emerald-800 border-0">Recebido</Badge>;
    if (s === "atrasado") return <Badge variant="destructive">Atrasado</Badge>;
    if (s === "cancelado")
      return <Badge className="bg-muted text-muted-foreground border-0">Cancelado</Badge>;
    return <Badge variant="outline">Em aberto</Badge>;
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
      Meio: formatMeio(t.meio_pagamento),
      "Data compra": formatDateBR(t.data_compra),
      "Mês competência": mesKeyDe(t.mes_competencia) ?? "",
      Vencimento: formatDateBR(t.data_vencimento),
      "Vencimento original": formatDateBR(t.data_vencimento_original),
      Renegociado: t.venc_renegociado ? "Sim" : "Não",
      "Dias prorrogado": t.dias_prorrogado ?? 0,
      Liquidação: formatDateBR(t.data_liquidacao),
      "Recebido em": t.liquidacao_realizada ? formatDateBR(t.data_liquidacao) : "",
      "Pago em": formatDateBR(t.data_pagamento),
      "Valor face": t.valor ?? 0,
      Juros: t.valor_juros ?? 0,
      Desconto: t.valor_desconto ?? 0,
      "Valor efetivo": efetivoDe(t),
      "Gera caixa": t.gera_caixa ? "Sim" : "Não",
      "Prova bancária": t.tem_prova_bancaria ? "Sim" : "Não",
      Status: rotuloStatus(t.status_gestao),
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Recebíveis B2B");
    XLSX.writeFile(wb, `recebiveis-b2b-${periodoLabel}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={handleExportXLSX}
          disabled={filtrados.length === 0}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Exportar XLSX
        </Button>
      </div>

      {/* KPIs */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-green-700">Recebido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-green-700">
                {formatBRL(kpis.recebido)}
              </div>
              <p className="text-xs text-muted-foreground">{kpis.recebidoQtd} títulos</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-blue-700">Total a receber</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-blue-700">
                {formatBRL(kpis.aberto)}
              </div>
              <p className="text-xs text-muted-foreground">{kpis.abertoQtd} títulos</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-cyan-700">A vencer em 30 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-cyan-700">
                {formatBRL(kpis.vence30)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Total no período</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">{formatBRL(kpis.total)}</div>
              <p className="text-xs text-muted-foreground">
                {kpis.totalQtd} títulos · cancelados fora
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-700">Vencido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-red-700">
                {formatBRL(kpis.vencido)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-rose-700">Inadimplência</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-rose-700">
                {kpis.inadimplencia.toFixed(1)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-amber-600">1–7 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-amber-600">
                {formatBRL(aging.f1_7)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-orange-600">8–30 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-orange-600">
                {formatBRL(aging.f8_30)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-600">31–60 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-red-600">
                {formatBRL(aging.f31_60)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-800">+60 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-red-800">
                {formatBRL(aging.f60)}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mês a mês */}
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
                  variant={baseMensal === "caixa" ? "default" : "outline"}
                  onClick={() => setBaseMensal("caixa")}
                >
                  Caixa (liquidação)
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
                      <TableHead className="text-right font-semibold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(
                      [
                        { rotulo: "Títulos", campo: "titulos", moeda: false, cor: "" },
                        { rotulo: "Recebido", campo: "recebido", moeda: true, cor: "text-green-700" },
                        { rotulo: "Em aberto", campo: "aberto", moeda: true, cor: "" },
                        { rotulo: "Atrasado", campo: "atrasado", moeda: true, cor: "text-destructive" },
                        { rotulo: "Total", campo: "total", moeda: true, cor: "" },
                      ] as const
                    ).map((linha) => {
                      const isTotal = linha.campo === "total";
                      return (
                        <TableRow
                          key={linha.campo}
                          className={isTotal ? "font-semibold bg-muted/40" : undefined}
                        >
                          <TableCell
                            className={`sticky left-0 bg-background z-10 font-medium ${
                              isTotal ? "font-semibold" : ""
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
                                {linha.moeda
                                  ? v > 0
                                    ? formatBRL(v)
                                    : "—"
                                  : v}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-right tabular-nums font-semibold">
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
          Competência é a data da NF. Caixa é a data em que o dinheiro liquidou. As duas não batem
          por definição.
        </p>
      </div>

      {/* Breakdown por meio */}
      {breakdownMeio.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {breakdownMeio.map((i) => (
            <Card key={i.meio} className="flex-1 min-w-[160px]">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground">
                  A receber — {formatMeio(i.meio)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold tabular-nums">{formatBRL(i.total)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <AtalhosPeriodo
              onPick={(de, ate) => {
                setDataDe(de);
                setDataAte(ate);
                setPage(1);
              }}
            />
            {comparativo && (
              <div className="text-sm">
                Recebido: <span className="tabular-nums">{formatBRL(comparativo.atual)}</span>{" "}
                <span className="text-muted-foreground">
                  (mês anterior <span className="tabular-nums">{formatBRL(comparativo.anterior)}</span>
                  {comparativo.variacao != null && (
                    <>
                      {" · "}
                      <span
                        className={
                          comparativo.variacao >= 0 ? "text-green-700" : "text-destructive"
                        }
                      >
                        {comparativo.variacao >= 0 ? "+" : ""}
                        {comparativo.variacao.toFixed(1)}%
                      </span>
                    </>
                  )}
                  )
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Situação</Label>
            <div className="flex flex-wrap gap-2">
              {SITUACOES.map((s) => (
                <Button
                  key={s.key}
                  size="sm"
                  variant={situacoes.has(s.key) ? "default" : "outline"}
                  onClick={() => toggleSituacao(s.key)}
                >
                  {s.label} ({contagens[s.key] ?? 0})
                </Button>
              ))}
              <Button
                size="sm"
                variant={soRenegociados ? "default" : "outline"}
                onClick={() => {
                  setSoRenegociados((v) => !v);
                  setPage(1);
                }}
              >
                Só renegociados ({qtdRenegociados})
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="space-y-1">
              <Label className="text-xs">Busca</Label>
              <Input
                placeholder="Título, NF ou cliente"
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
              <Label className="text-xs">Meio de pagamento</Label>
              <Select
                value={filtroMeio}
                onValueChange={(v) => {
                  setFiltroMeio(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {meiosOpcoes.map((m) => (
                    <SelectItem key={m} value={m}>
                      {formatMeio(m)}
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
                  <SelectItem value="liquidacao">Liquidação</SelectItem>
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

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : paginados.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <p>Nenhum recebível encontrado.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortTh label="NF" sortKey="nf_numero" sort={sort} setSort={setSort} />
                  <SortTh label="Cliente" sortKey="cliente" sort={sort} setSort={setSort} />
                  <SortTh label="Título / Parcela" sortKey="numero_titulo" sort={sort} setSort={setSort} />
                  <SortTh label="Banco" sortKey="banco_nome" sort={sort} setSort={setSort} />
                  <SortTh label="Meio" sortKey="meio_pagamento" sort={sort} setSort={setSort} />
                  <SortTh label="Data compra" sortKey="data_compra" sort={sort} setSort={setSort} />
                  <SortTh label="Vencimento" sortKey="data_vencimento" sort={sort} setSort={setSort} />
                  <SortTh label="Liquidação" sortKey="data_liquidacao" sort={sort} setSort={setSort} />
                  <SortTh label="Recebido em" sortKey="liquidacao_realizada" sort={sort} setSort={setSort} />
                  <SortTh label="Valor" sortKey="valor_efetivo" sort={sort} setSort={setSort} align="right" />
                  <SortTh label="Status" sortKey="status_gestao" sort={sort} setSort={setSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginados.map((t) => {
                  const atrasado = t.status_gestao === "atrasado";
                  const juros = Number(t.valor_juros ?? 0);
                  const desconto = Number(t.valor_desconto ?? 0);
                  return (
                    <TableRow key={t.id} className={atrasado ? "bg-red-50/40" : undefined}>
                      <TableCell className="font-mono text-xs">{t.nf_numero ?? "—"}</TableCell>
                      <TableCell className="max-w-[180px] truncate" title={t.cliente ?? ""}>
                        {t.cliente ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="font-mono">{t.numero_titulo ?? "—"}</span>
                        {t.numero_parcela != null && t.total_parcelas != null && (
                          <span className="text-muted-foreground">
                            {" "}
                            {t.numero_parcela}/{t.total_parcelas}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{t.banco_nome ?? "—"}</TableCell>
                      <TableCell>{formatMeio(t.meio_pagamento)}</TableCell>
                      <TableCell>{formatDateBR(t.data_compra)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{formatDateBR(t.data_vencimento)}</span>
                          {t.venc_renegociado === true && (
                            <Badge variant="outline" className="text-[10px]">
                              Renegociado
                            </Badge>
                          )}
                        </div>
                        {t.venc_renegociado === true && (
                          <div className="text-xs text-muted-foreground">
                            orig. {formatDateBR(t.data_vencimento_original)} ·{" "}
                            {(t.dias_prorrogado ?? 0) >= 0 ? "+" : ""}
                            {t.dias_prorrogado ?? 0}d
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.data_liquidacao ? (
                          t.liquidacao_realizada === true ? (
                            <span className="inline-flex items-center gap-2">
                              {formatDateBR(t.data_liquidacao)}
                              <Badge className="bg-green-100 text-green-700 border-0">REAL</Badge>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              {formatDateBR(t.data_liquidacao)}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge className="bg-amber-100 text-amber-700 border-0 cursor-help">
                                    PREVISTO
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Previsão de liquidação pelo adquirente</p>
                                </TooltipContent>
                              </Tooltip>
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.liquidacao_realizada === true ? (
                          formatDateBR(t.data_liquidacao)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div>{formatBRL(efetivoDe(t))}</div>
                        {(juros > 0 || desconto > 0) && (
                          <div className="text-xs text-muted-foreground">
                            face {formatBRL(t.valor ?? 0)}
                            {juros > 0 && (
                              <span className="text-emerald-700"> · juros +{formatBRL(juros)}</span>
                            )}
                            {desconto > 0 && (
                              <span className="text-destructive"> · desc −{formatBRL(desconto)}</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{renderStatusBadge(t.status_gestao)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {filtrados.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Página {pageSafe} de {totalPages} · {filtrados.length} registros
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
    const dDe = dataDe ? new Date(dataDe + "T00:00:00") : null;
    const dAte = dataAte ? new Date(dataAte + "T23:59:59") : null;
    return (data ?? []).filter((r) => {
      if (!dDe && !dAte) return true;
      if (!r.data_transacao) return false;
      const d = new Date(String(r.data_transacao).slice(0, 10) + "T12:00:00");
      if (dDe && d < dDe) return false;
      if (dAte && d > dAte) return false;
      return true;
    });
  }, [data, dataDe, dataAte]);

  const fvrBase = useMemo(() => {
    const dDe = dataDe ? new Date(dataDe + "T00:00:00") : null;
    const dAte = dataAte ? new Date(dataAte + "T23:59:59") : null;
    return (fvrData ?? []).filter((r) => {
      if (!dDe && !dAte) return true;
      if (!r.data_emissao) return false;
      const d = new Date(String(r.data_emissao).slice(0, 10) + "T12:00:00");
      if (dDe && d < dDe) return false;
      if (dAte && d > dAte) return false;
      return true;
    });
  }, [fvrData, dataDe, dataAte]);

  const semRecebimento = useMemo(
    () =>
      fvrBase
        .filter((r) => r.situacao === "faturado_sem_recebimento")
        .sort((a, b) => (diasDesde(b.data_emissao) ?? 0) - (diasDesde(a.data_emissao) ?? 0)),
    [fvrBase]
  );
  const recebidoSemNf = useMemo(
    () => (fvrData ?? []).filter((r) => r.situacao === "recebido_sem_nf"),
    [fvrData]
  );
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
        <Button
          variant="outline"
          onClick={handleExportXLSX}
          disabled={ordenados.length === 0}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Exportar XLSX
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Bruto Shopify</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{formatBRL(kpis.bruto)}</div>
            <p className="text-xs text-muted-foreground">{base.length} pedidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-700">Líquido recebido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums text-green-700">
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
              <div className="text-2xl font-semibold tabular-nums">{formatBRL(kpis.taxa)}</div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {kpis.pct.toFixed(2)}%
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Faturado sem recebimento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums text-amber-700">
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
                    <TableHead className="text-right font-semibold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(
                    [
                      { rotulo: "Pedidos", moeda: false, cor: "" },
                      { rotulo: "Bruto", moeda: true, cor: "" },
                      { rotulo: "Líquido", moeda: true, cor: "text-green-700" },
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
                        <TableCell className="text-right tabular-nums font-semibold">
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
        <Card className="border-amber-500/50">
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
                          ? "text-amber-700"
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
                    <TableRow className="font-semibold">
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
                      <TableCell className="text-right tabular-nums text-green-700">
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
                        <TableCell className="text-right tabular-nums text-green-700">
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
                    <TableRow className="font-semibold">
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
        <CardContent className="space-y-4 p-4">
          <AtalhosPeriodo
            onPick={(de, ate) => {
              setDataDe(de);
              setDataAte(ate);
              setPage(1);
            }}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : paginados.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <p>Nenhum recebível B2C no período.</p>
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
                      <TableCell className="text-right tabular-nums text-green-700">
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
