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
import { ArrowUpDown } from "lucide-react";

type Row = Record<string, any>;

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
  pre_faturado: "bg-blue-100 text-blue-800",
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

type SortDir = "asc" | "desc";

export default function GestaoPedidos() {
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
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Gestão de Pedidos</h1>
        <Badge variant="secondary">{filtradas.length} linhas</Badge>
      </div>

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

      <div className="border rounded-md overflow-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr>
              <Th k="id_externo">ID</Th>
              <Th k="parceiro_razao">Cliente</Th>
              <Th k="estagio">Estágio</Th>
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
              <Th>Rastreio</Th>
              <Th k="splits_qtd">Split</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={18} className="px-2 py-4 text-center text-muted-foreground">Carregando…</td></tr>
            )}
            {!isLoading && filtradas.length === 0 && (
              <tr><td colSpan={18} className="px-2 py-4 text-center text-muted-foreground">Nenhum pedido encontrado.</td></tr>
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
