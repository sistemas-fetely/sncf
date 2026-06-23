import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ESTAGIO_LABELS, type EstagioPedido } from "@/types/pedido";
import { ArrowUpDown, Copy, ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Row = Record<string, any>;

// ─── helpers compartilhados ────────────────────────────────────────────────
const brl = (v: any) =>
  v == null || isNaN(Number(v))
    ? "-"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (d: any) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("pt-BR");
};

const fmtPct = (v: any) => {
  if (v == null || isNaN(Number(v))) return null;
  return `${Number(v).toFixed(1).replace(".", ",")}%`;
};

const ESTAGIO_COR: Record<string, string> = {
  recebido: "bg-slate-100 text-slate-700",
  em_analise_credito: "bg-amber-100 text-amber-800",
  cobranca: "bg-orange-100 text-orange-800",
  aguardando_pagamento: "bg-yellow-100 text-yellow-800",
  pre_separacao: "bg-blue-100 text-blue-800",
  pre_faturamento: "bg-amber-100 text-amber-800",
  aguardando_estoque: "bg-purple-100 text-purple-800",
  em_separacao: "bg-indigo-100 text-indigo-800",
  faturado: "bg-emerald-100 text-emerald-800",
  em_transporte: "bg-cyan-100 text-cyan-800",
  entregue: "bg-green-100 text-green-800",
  cancelado: "bg-red-100 text-red-800",
  recuperacao_venda: "bg-pink-100 text-pink-800",
};

const ENTRADA_COR: Record<string, string> = {
  nao_exige: "bg-slate-100 text-slate-700",
  exige_pendente: "bg-red-100 text-red-800",
  definida: "bg-yellow-100 text-yellow-800",
  paga: "bg-green-100 text-green-800",
};

const ENTRADA_LABEL: Record<string, string> = {
  nao_exige: "Não exige",
  exige_pendente: "Pendente",
  definida: "Definida",
  paga: "Paga",
};

type EstagioB2C = "recebido" | "pago" | "em_separacao" | "expedido" | "em_transito" | "entregue" | "cancelado";

const B2C_ESTAGIO_COR: Record<EstagioB2C, string> = {
  recebido:     "bg-slate-100 text-slate-700",
  pago:         "bg-amber-100 text-amber-800",
  em_separacao: "bg-indigo-100 text-indigo-800",
  expedido:     "bg-purple-100 text-purple-800",
  em_transito:  "bg-cyan-100 text-cyan-800",
  entregue:     "bg-green-100 text-green-800",
  cancelado:    "bg-red-100 text-red-800",
};

const B2C_ESTAGIO_LABEL: Record<EstagioB2C, string> = {
  recebido:     "Recebido",
  pago:         "Pago",
  em_separacao: "Em separação",
  expedido:     "Expedido",
  em_transito:  "Em trânsito",
  entregue:     "Entregue",
  cancelado:    "Cancelado",
};

const ESTAGIOS_B2C: EstagioB2C[] = ["recebido", "pago", "em_separacao", "expedido", "em_transito", "entregue", "cancelado"];

interface B2CRow {
  shopify_id: string;
  order_name: string;
  created_at_shopify: string;
  estagio_derivado: string;
  financial_status: string;
  fulfillment_status: string | null;
  payment_method: string | null;
  subtotal: number;
  discount_amount: number;
  shipping_cost: number;
  total: number;
  refunded_amount: number;
  paid_at: string | null;
  cancelled_at: string | null;
  fulfilled_at: string | null;
  shipping_method: string | null;
  shipping_province: string | null;
  shipping_city: string | null;
  shipping_zip: string | null;
  wns_pedidowns: number | null;
  wns_sequencia: number | null;
  wns_fase_descricao: string | null;
  rastreio_cte: string | null;
  rastreio_codigo: string | null;
  rastreio_data: string | null;
  rastreio_texto: string | null;
  rastreio_classe: string | null;
  rastreio_label: string | null;
  rastreio_prazo: string | null;
  tracking_number: string | null;
  rastreio_status: string | null;
  rastreio_entregue: boolean | null;
  frete_realizado: number | null;
  alerta: string | null;
}



type SortDir = "asc" | "desc";

// ════════════════════════════════════════════════════════════════════════════
// ABA B2B (código original, intacto)
// ════════════════════════════════════════════════════════════════════════════
function AbaB2B() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["gestao-pedidos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_gestao_pedidos")
        .select("*");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const pedidoIds = useMemo(() => data.map((r: Row) => r.id).filter(Boolean), [data]);

  const { data: emailLogs = [] } = useQuery({
    queryKey: ["gestao-email-logs", pedidoIds],
    queryFn: async () => {
      if (pedidoIds.length === 0) return [];
      const { data: logs, error } = await (supabase as any)
        .from("pedido_email_log")
        .select("pedido_id, tipo_email, enviado_em")
        .in("pedido_id", pedidoIds);
      if (error) throw error;
      return (logs ?? []) as { pedido_id: string; tipo_email: string; enviado_em: string }[];
    },
    enabled: pedidoIds.length > 0,
  });

  const emailLogMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const log of emailLogs) {
      if (!map.has(log.pedido_id)) map.set(log.pedido_id, new Set());
      map.get(log.pedido_id)!.add(log.tipo_email);
    }
    return map;
  }, [emailLogs]);

  function getSaudeChecks(r: Row, tiposEnviados: Set<string>) {
    const estagio = r.estagio ?? "";
    const ESTAGIOS_OPERACIONAIS = new Set([
      "cobranca", "aguardando_pagamento", "pre_separacao", "pre_faturamento",
      "em_separacao", "faturado", "em_transporte", "entregue",
    ]);
    if (!ESTAGIOS_OPERACIONAIS.has(estagio)) return [];

    const checks: { key: string; label: string; ok: boolean; tooltip: string }[] = [];

    const estagiosTitulo = new Set(["cobranca","aguardando_pagamento","pre_separacao","pre_faturamento","em_separacao","faturado","em_transporte","entregue"]);
    if (estagiosTitulo.has(estagio)) {
      checks.push({
        key: "titulos",
        label: "T",
        ok: !!r.titulos_criados,
        tooltip: r.titulos_criados
          ? `Títulos gerados (${r.titulos_qtd ?? 0} título${(r.titulos_qtd ?? 0) !== 1 ? "s" : ""})`
          : "Títulos não gerados",
      });
    }

    const estagiosCobranca = new Set(["cobranca","aguardando_pagamento","pre_separacao","pre_faturamento","em_separacao"]);
    if (estagiosCobranca.has(estagio)) {
      const ok = tiposEnviados.has("cobranca") || tiposEnviados.has("portao_boleto");
      checks.push({ key: "email_cobranca", label: "C", ok,
        tooltip: ok ? "Email de cobrança enviado" : "Email de cobrança não enviado" });
    }

    const estagiosNf = new Set(["pre_faturamento","em_separacao","faturado","em_transporte","entregue"]);
    if (estagiosNf.has(estagio)) {
      checks.push({ key: "nf", label: "N", ok: !!r.nf_tem,
        tooltip: r.nf_tem ? `NF emitida${r.nf_numero ? ` — ${r.nf_numero}` : ""}` : "NF não emitida" });
    }

    const estagiosEmailNf = new Set(["faturado","em_transporte","entregue"]);
    if (estagiosEmailNf.has(estagio)) {
      const ok = tiposEnviados.has("nf") || tiposEnviados.has("nf_boletos");
      checks.push({ key: "email_nf", label: "E", ok,
        tooltip: ok ? "Email de NF enviado ao cliente" : "Email de NF não enviado" });
    }

    const estagiosRastreio = new Set(["em_transporte","entregue"]);
    if (estagiosRastreio.has(estagio)) {
      checks.push({ key: "rastreio", label: "R", ok: !!r.rastreio_codigo,
        tooltip: r.rastreio_codigo ? `Rastreio: ${r.rastreio_codigo}` : "Sem código de rastreio" });
    }

    return checks;
  }

  const [busca, setBusca] = useState("");
  const [estagio, setEstagio] = useState<string>("__todos");
  const [entrada, setEntrada] = useState<string>("__todos");
  const [nfFiltro, setNfFiltro] = useState<string>("__todos");
  const [splitFiltro, setSplitFiltro] = useState<string>("__todos");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const estagiosDistintos = useMemo(() => {
    const s = new Set<string>();
    for (const r of data) if (r.estagio) s.add(r.estagio);
    return Array.from(s).sort();
  }, [data]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let arr = data.filter((r) => {
      if (q) {
        const hit =
          String(r.parceiro_razao ?? "").toLowerCase().includes(q) ||
          String(r.parceiro_cnpj ?? "").toLowerCase().includes(q) ||
          String(r.id_externo ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (estagio !== "__todos" && r.estagio !== estagio) return false;
      if (entrada !== "__todos" && r.entrada_status !== entrada) return false;
      if (nfFiltro === "com" && !r.nf_tem) return false;
      if (nfFiltro === "sem" && r.nf_tem) return false;
      if (splitFiltro === "com" && !r.tem_split) return false;
      if (splitFiltro === "sem" && r.tem_split) return false;
      return true;
    });
    if (sortKey) {
      arr = [...arr].sort((a, b) => {
        const va = a[sortKey];
        const vb = b[sortKey];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === "number" && typeof vb === "number") {
          return sortDir === "asc" ? va - vb : vb - va;
        }
        return sortDir === "asc"
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      });
    }
    return arr;
  }, [data, busca, estagio, entrada, nfFiltro, splitFiltro, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const Th = ({ k, children, className = "" }: { k?: string; children: React.ReactNode; className?: string }) => (
    <th
      className={`px-2 py-1.5 text-left font-medium text-muted-foreground border-b bg-muted/50 ${k ? "cursor-pointer select-none" : ""} ${className}`}
      onClick={k ? () => toggleSort(k) : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {k && sortKey === k && <ArrowUpDown className="h-3 w-3" />}
      </span>
    </th>
  );

  const openPedido = (id: string) => {
    if (id) window.open(`/pedidos/${id}`, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Buscar por parceiro, CNPJ ou ID…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-72 h-8 text-xs"
        />
        <Select value={estagio} onValueChange={setEstagio}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Estágio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__todos">Todos os estágios</SelectItem>
            {estagiosDistintos.map((e) => (
              <SelectItem key={e} value={e}>
                {ESTAGIO_LABELS[e as EstagioPedido] ?? e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={entrada} onValueChange={setEntrada}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Entrada" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__todos">Toda entrada</SelectItem>
            <SelectItem value="nao_exige">Não exige</SelectItem>
            <SelectItem value="exige_pendente">Exige pendente</SelectItem>
            <SelectItem value="definida">Definida</SelectItem>
            <SelectItem value="paga">Paga</SelectItem>
          </SelectContent>
        </Select>
        <Select value={nfFiltro} onValueChange={setNfFiltro}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="NF" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__todos">Todos</SelectItem>
            <SelectItem value="com">Com NF</SelectItem>
            <SelectItem value="sem">Sem NF</SelectItem>
          </SelectContent>
        </Select>
        <Select value={splitFiltro} onValueChange={setSplitFiltro}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Split" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__todos">Todos</SelectItem>
            <SelectItem value="com">Com split</SelectItem>
            <SelectItem value="sem">Sem split</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md overflow-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr>
              <Th k="id_externo">ID</Th>
              <Th k="parceiro_razao">Cliente</Th>
              <Th k="estagio">Estágio</Th>
              <Th>Saúde</Th>
              <Th>Forma PG</Th>
              <Th k="entrada_status">Entrada</Th>
              <Th>Títulos</Th>
              <Th k="proposta_real_liquido">Proposta</Th>
              <Th k="faturado_valor">Faturado</Th>
              <Th k="a_receber_valor">A Receber</Th>
              <Th k="nf_numero">NF</Th>
              <Th k="frete_cobrado">Frete Cobrado</Th>
              <Th k="frete_cotacao">Frete Cotação</Th>
              <Th k="frete_realizado">Frete Realizado</Th>
              <Th>Transportadora</Th>
              <Th k="remessa_qtd">Remessas</Th>
              <Th k="previsao_entrega">Prev. Entrega</Th>
              <Th k="data_entrega_real">Entrega Real</Th>
              <Th>Rastreio</Th>
              <Th k="splits_qtd">Split</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={19} className="px-2 py-4 text-center text-muted-foreground">Carregando…</td></tr>
            )}
            {!isLoading && filtradas.length === 0 && (
              <tr><td colSpan={19} className="px-2 py-4 text-center text-muted-foreground">Nenhum pedido encontrado.</td></tr>
            )}
            {filtradas.map((r) => {
              const formaPg = r.forma_pagamento ?? r.forma_solicitada ?? "-";
              const propostaDif = r.proposta_original_liquido != null
                && Number(r.proposta_original_liquido) !== Number(r.proposta_real_liquido);
              const nfPendente = !r.nf_tem && r.estagio === "faturado";
              const transp = r.transportadora_nf ?? r.transportadora_definida ?? "-";
              const cotPct = fmtPct(r.frete_cotacao_pct);
              const realPct = fmtPct(r.frete_realizado_pct);
              return (
                <tr
                  key={r.id ?? r.id_externo}
                  className="border-b hover:bg-muted/30 cursor-pointer"
                  onClick={() => openPedido(r.id ?? r.id_externo)}
                >
                  <td className="px-2 py-1.5 align-top">
                    <a
                      href={`/pedidos/${r.id ?? r.id_externo}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.id_externo ?? "-"}
                    </a>
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <div className="font-medium">{r.parceiro_razao ?? "-"}</div>
                    <div className="text-muted-foreground">{r.parceiro_cnpj ?? ""}</div>
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${ESTAGIO_COR[r.estagio] ?? "bg-slate-100"}`}>
                      {ESTAGIO_LABELS[r.estagio as EstagioPedido] ?? r.estagio ?? "-"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <div>{formaPg}</div>
                    {r.condicao_solicitada && (
                      <div className="text-muted-foreground">{r.condicao_solicitada}</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    {r.entrada_status ? (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${ENTRADA_COR[r.entrada_status] ?? "bg-slate-100"}`}>
                        {ENTRADA_LABEL[r.entrada_status] ?? r.entrada_status}
                      </span>
                    ) : "-"}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    {r.titulos_criados ? (
                      <>
                        <div>{r.titulos_abertos ?? 0} abertos / {r.titulos_total ?? 0} total</div>
                        <div className="text-muted-foreground">{brl(r.titulos_parcela ?? r.titulo_parcela)}</div>
                      </>
                    ) : "-"}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <div>{brl(r.proposta_real_liquido)}</div>
                    {propostaDif && (
                      <div className="text-muted-foreground line-through">{brl(r.proposta_original_liquido)}</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-top">{brl(r.faturado_valor)}</td>
                  <td className="px-2 py-1.5 align-top">{brl(r.a_receber_valor)}</td>
                  <td className="px-2 py-1.5 align-top">
                    {r.nf_tem ? (r.nf_numero ?? "-") : "-"}
                    {nfPendente && (
                      <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-800">Pendente</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <div>{brl(r.frete_cobrado)}</div>
                    {r.frete_tipo && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700">{r.frete_tipo}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    {r.frete_cotacao != null ? (
                      <>
                        <div>{brl(r.frete_cotacao)}</div>
                        {cotPct && <div className="text-muted-foreground">{cotPct}</div>}
                      </>
                    ) : "-"}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    {r.frete_realizado != null ? (
                      <>
                        <div>{brl(r.frete_realizado)}</div>
                        {realPct && <div className="text-muted-foreground">{realPct}</div>}
                        {r.frete_desvio != null && Number(r.frete_desvio) > 0 && (
                          <div className="text-red-600">+{brl(r.frete_desvio)}</div>
                        )}
                      </>
                    ) : "-"}
                  </td>
                  <td className="px-2 py-1.5 align-top">{transp}</td>
                  <td className="px-2 py-1.5 align-top">
                    {r.remessa_qtd ? (
                      <>
                        <div>{r.remessa_qtd}</div>
                        {r.status_remessas && (
                          <div className="text-muted-foreground">{r.status_remessas}</div>
                        )}
                      </>
                    ) : "-"}
                  </td>
                  <td className="px-2 py-1.5 align-top">{fmtData(r.previsao_entrega)}</td>
                  <td className="px-2 py-1.5 align-top">
                    {r.data_entrega_real ? (
                      <span className="text-green-600">{fmtData(r.data_entrega_real)}</span>
                    ) : "-"}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    {r.rastreio_codigo ? (
                      <>
                        <div className="font-mono text-[10px]">{r.rastreio_codigo}</div>
                        {r.rastreio_entregue && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-800">Entregue</span>
                        )}
                      </>
                    ) : "-"}
                  </td>
                  <td className="px-2 py-1.5 align-top">{r.tem_split ? (r.splits_qtd ?? "-") : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ABA B2C
// ════════════════════════════════════════════════════════════════════════════
function AbaB2C() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["vw-gestao-b2c"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_gestao_b2c" as any)
        .select("*")
        .order("created_at_shopify", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as B2CRow[];
    },
  });

  const [busca, setBusca] = useState("");
  const [estagioFiltro, setEstagioFiltro] = useState<EstagioB2C | "todos">("todos");
  const [ufFiltro, setUfFiltro] = useState<string>("todos");
  const [pagFiltro, setPagFiltro] = useState<string>("todos");
  const [sortKey, setSortKey] = useState<"order_name" | "total" | "created_at_shopify">("created_at_shopify");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const ufsDisponiveis = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.shipping_province) set.add(r.shipping_province); });
    return Array.from(set).sort();
  }, [rows]);

  const pagamentosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.payment_method) set.add(r.payment_method); });
    return Array.from(set).sort();
  }, [rows]);

  const contagemEstagios = useMemo(() => {
    const map: Record<EstagioB2C, number> = {
      recebido: 0, pago: 0, em_separacao: 0, expedido: 0,
      em_transito: 0, entregue: 0, cancelado: 0,
    };
    rows.forEach((r) => {
      const e = r.estagio_derivado as EstagioB2C;
      if (e in map) map[e]++;
    });
    return map;
  }, [rows]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let arr = rows.filter((r) => {
      if (q && !(r.order_name ?? "").toLowerCase().includes(q)) return false;
      if (estagioFiltro !== "todos" && r.estagio_derivado !== estagioFiltro) return false;
      if (ufFiltro !== "todos" && r.shipping_province !== ufFiltro) return false;
      if (pagFiltro !== "todos" && r.payment_method !== pagFiltro) return false;
      return true;
    });

    arr = [...arr].sort((a, b) => {
      let va: any = a[sortKey];
      let vb: any = b[sortKey];
      if (sortKey === "total") { va = Number(va) || 0; vb = Number(vb) || 0; }
      else if (sortKey === "created_at_shopify") {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      } else {
        va = (va ?? "").toString();
        vb = (vb ?? "").toString();
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return arr;
  }, [rows, busca, estagioFiltro, ufFiltro, pagFiltro, sortKey, sortDir]);

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const corRastreio = (classe: string | null) => {
    switch (classe) {
      case "entregue": return "bg-green-100 text-green-800";
      case "em_transito": return "bg-cyan-100 text-cyan-800";
      case "coletado": return "bg-blue-100 text-blue-800";
      case "atencao": return "bg-red-100 text-red-800";
      default: return "bg-slate-100 text-slate-700";
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtros topo */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar pedido (order_name)…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-64"
        />
        <Select value={ufFiltro} onValueChange={setUfFiltro}>
          <SelectTrigger className="w-32"><SelectValue placeholder="UF" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas UFs</SelectItem>
            {ufsDisponiveis.map((uf) => (
              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pagFiltro} onValueChange={setPagFiltro}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Pagamento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos pagamentos</SelectItem>
            {pagamentosDisponiveis.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">
          {filtradas.length} de {rows.length}
        </div>
      </div>

      {/* Pipeline clicável */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setEstagioFiltro("todos")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            estagioFiltro === "todos" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
          }`}
        >
          Todos ({rows.length})
        </button>
        {ESTAGIOS_B2C.map((e) => (
          <button
            key={e}
            onClick={() => setEstagioFiltro(e)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              estagioFiltro === e
                ? "bg-primary text-primary-foreground"
                : `${B2C_ESTAGIO_COR[e]} hover:opacity-80`
            }`}
          >
            {B2C_ESTAGIO_LABEL[e]} ({contagemEstagios[e]})
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="border rounded-md overflow-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background border-b z-10">
            <tr className="text-left">
              <th className="px-3 py-2 cursor-pointer select-none" onClick={() => toggleSort("order_name")}>
                <span className="inline-flex items-center gap-1">Pedido <ArrowUpDown className="h-3 w-3" /></span>
              </th>
              <th className="px-3 py-2">Estágio</th>
              <th className="px-3 py-2">Alerta</th>
              <th className="px-3 py-2 cursor-pointer select-none" onClick={() => toggleSort("total")}>
                <span className="inline-flex items-center gap-1">Total <ArrowUpDown className="h-3 w-3" /></span>
              </th>
              <th className="px-3 py-2">Pagamento</th>
              <th className="px-3 py-2 cursor-pointer select-none" onClick={() => toggleSort("created_at_shopify")}>
                <span className="inline-flex items-center gap-1">Data <ArrowUpDown className="h-3 w-3" /></span>
              </th>
              <th className="px-3 py-2">UF</th>
              <th className="px-3 py-2">Modal</th>
              <th className="px-3 py-2">WNS</th>
              <th className="px-3 py-2">WNS Fase</th>
              <th className="px-3 py-2">Rastreio</th>
              <th className="px-3 py-2">Rastreio Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">Carregando…</td></tr>
            ) : filtradas.length === 0 ? (
              <tr><td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">Nenhum pedido encontrado.</td></tr>
            ) : (
              filtradas.map((r) => {
                const estagio = r.estagio_derivado as EstagioB2C;
                const corEstagio = B2C_ESTAGIO_COR[estagio] ?? "bg-slate-100 text-slate-700";
                const labelEstagio = B2C_ESTAGIO_LABEL[estagio] ?? r.estagio_derivado;
                return (
                  <tr key={r.shopify_id} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{r.order_name}</td>
                    <td className="px-3 py-2">
                      <Badge className={`${corEstagio} border-0`}>{labelEstagio}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {r.alerta === "pago_sem_wns" ? (
                        <span title="Pago sem WNS" className="text-yellow-600">⚠</span>
                      ) : r.alerta === "expedido_sem_rastreio" ? (
                        <span title="Expedido sem rastreio" className="text-orange-600">📦</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{brl(r.total)}</td>
                    <td className="px-3 py-2">{r.payment_method ?? "-"}</td>
                    <td className="px-3 py-2">{fmtData(r.created_at_shopify)}</td>
                    <td className="px-3 py-2">{r.shipping_province ?? "-"}</td>
                    <td className="px-3 py-2">{r.shipping_method ?? "-"}</td>
                    <td className="px-3 py-2">{r.wns_pedidowns != null ? `#${r.wns_pedidowns}` : "-"}</td>
                    <td className="px-3 py-2">{r.wns_fase_descricao ?? "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.tracking_number ? (
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[10px]">{r.tracking_number}</span>
                          <button
                            title="Copiar código"
                            onClick={() => navigator.clipboard.writeText(r.tracking_number!)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <a
                            href="https://rastreamento.correios.com.br/app/index.php"
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir Correios"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.rastreio_entregue ? (
                        <Badge className="bg-green-600 hover:bg-green-600 text-white border-0">Entregue</Badge>
                      ) : r.rastreio_status ? (
                        <span className="text-xs">{r.rastreio_status}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// COMPONENTE RAIZ — tabs B2B / B2C
// ════════════════════════════════════════════════════════════════════════════
export default function GestaoPedidos() {
  const [aba, setAba] = useState<"b2b" | "b2c">("b2b");

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Gestão de Pedidos</h1>
      </div>

      {/* tab switcher */}
      <div className="flex gap-1 border-b">
        {(["b2b", "b2c"] as const).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              aba === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setAba(t)}
          >
            {t === "b2b" ? "B2B" : "B2C"}
          </button>
        ))}
      </div>

      {aba === "b2b" ? <AbaB2B /> : <AbaB2C />}
    </div>
  );
}
