import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { abrirDetalhe, useEstadoTela, useFocoAoVoltar, useRestaurarScroll } from "@/lib/navegacao";
import { usePreferenciaTela } from "@/hooks/usePreferenciaTela";
import { CabecalhoOrdenavel, LINHA_CABECALHO_COLADO } from "@/components/tabela/CabecalhoOrdenavel";
import { RodapePaginacao } from "@/components/tabela/RodapePaginacao";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterInput } from "@/components/ui/filter-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtData } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import { carregarPedidosFiscais, filtrarPedidosFiscais, ordenarPedidosFiscais, type ColunaFiscal, type PedidoFiscal } from "./pedidosFiscais";
import { SITUACAO_CLASS, SITUACAO_LABELS } from "./situacaoNf";

const PREFERENCIA = "nfs-venda.pedidos-fiscais";
const moeda = (valor: number | null) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor ?? 0));
const COLUNAS: { coluna: ColunaFiscal; rotulo: string; classe: string }[] = [
  { coluna: "numero", rotulo: "Nº", classe: "w-[7%]" },
  { coluna: "numero_loja", rotulo: "Pedido da loja", classe: "w-[15%]" },
  { coluna: "data_pedido", rotulo: "Data", classe: "w-[10%]" },
  { coluna: "cliente_nome", rotulo: "Cliente", classe: "w-[22%]" },
  { coluna: "valor_total", rotulo: "Valor", classe: "w-[12%] text-right" },
  { coluna: "situacao_label", rotulo: "Situação", classe: "w-[12%]" },
  { coluna: "nf_numero", rotulo: "NF", classe: "w-[13%]" },
  { coluna: "pedido_sncf_ref", rotulo: "Pedido", classe: "w-[9%]" },
];

export function AbaPedidosFiscais() {
  const navigate = useNavigate();
  const location = useLocation();
  const [nav, setNav] = useEstadoTela({ busca: "", situacao: "todas", mes: "todos", nf: "todas", ordem: "data_pedido:desc", pagina: 1 }, { prefixo: "pf" });
  const { preferencias, salvar } = usePreferenciaTela(PREFERENCIA, { tamanho_pagina: 20 });
  const tamanhoPagina = preferencias.tamanho_pagina;
  const { data: pedidos = [], isLoading, error } = useQuery({
    queryKey: ["pedidos-fiscais"],
    queryFn: () => carregarPedidosFiscais(async (de, ate) => {
      // View already deployed; generated client types will catch up separately.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("vw_pedidos_fiscais").select("*").order("data_pedido", { ascending: false }).order("id").range(de, ate);
      if (error) throw error;
      return (data ?? []) as PedidoFiscal[];
    }),
  });
  const situacoes = useMemo(() => Array.from(new Set(pedidos.map((p) => p.situacao_label).filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b, "pt-BR")), [pedidos]);
  const meses = useMemo(() => Array.from(new Set(pedidos.map((p) => p.data_pedido?.slice(0, 7)).filter((v): v is string => Boolean(v)))).sort().reverse(), [pedidos]);
  const [col, dir] = nav.ordem.split(":");
  const coluna = COLUNAS.some((c) => c.coluna === col) ? col as ColunaFiscal : "data_pedido";
  const direcao = dir === "asc" ? "asc" : "desc";
  const filtrados = useMemo(() => ordenarPedidosFiscais(filtrarPedidosFiscais(pedidos, nav), coluna, direcao), [pedidos, nav, coluna, direcao]);
  const total = filtrados.reduce((s, p) => s + Number(p.valor_total ?? 0), 0);
  const pagina = Math.min(nav.pagina, Math.max(1, Math.ceil(filtrados.length / tamanhoPagina)));
  const itens = filtrados.slice((pagina - 1) * tamanhoPagina, pagina * tamanhoPagina);
  useFocoAoVoltar({ pronto: !isLoading, idsVisiveis: itens.map((p) => String(p.id)), focoParam: "pf_foco" });
  useRestaurarScroll(null, !isLoading);
  const ordenar = (nova: ColunaFiscal) => {
    const inicial = ["data_pedido", "valor_total", "numero"].includes(nova) ? "desc" : "asc";
    setNav({ ordem: `${nova}:${nova === coluna ? (direcao === "asc" ? "desc" : "asc") : inicial}`, pagina: 1 });
  };

  return <>
    <div className="grid gap-4 sm:grid-cols-3 mb-4">
      {[{ label: "Total de pedidos", valor: String(filtrados.length) }, { label: "Valor total", valor: moeda(total) }, { label: "Ticket médio", valor: moeda(filtrados.length ? total / filtrados.length : 0) }].map((k) => <Card key={k.label}>
        <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">{k.label}</CardTitle></CardHeader>
        <CardContent><div className="text-2xl font-medium tabular-nums">{k.valor}</div></CardContent>
      </Card>)}
    </div>
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="relative flex-1 min-w-0 sm:min-w-[240px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <FilterInput value={nav.busca} onChange={(e) => setNav({ busca: e.target.value, pagina: 1 })} placeholder="Buscar por nº, pedido da loja ou cliente" className="pl-9" />
      </div>
      <Select value={nav.situacao} onValueChange={(situacao) => setNav({ situacao, pagina: 1 })}>
        <SelectTrigger className="h-8 w-[170px]" aria-label="Situação"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="todas">Todas as situações</SelectItem>{situacoes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={nav.mes} onValueChange={(mes) => setNav({ mes, pagina: 1 })}>
        <SelectTrigger className="h-8 w-[170px]" aria-label="Mês"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="todos">Todos os meses</SelectItem>{meses.map((m) => <SelectItem key={m} value={m}>{new Date(m + "-01T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(" de ", "/")}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={nav.nf} onValueChange={(nf) => setNav({ nf, pagina: 1 })}>
        <SelectTrigger className="h-8 w-[130px]" aria-label="NF"><SelectValue placeholder="NF" /></SelectTrigger>
        <SelectContent><SelectItem value="todas">Todas</SelectItem><SelectItem value="com">Com NF</SelectItem><SelectItem value="sem">Sem NF</SelectItem></SelectContent>
      </Select>
    </div>
    <div className="rounded-md border bg-card min-w-0">
      <Table className="table-fixed w-full" containerClassName="overflow-visible">
        <TableHeader><TableRow className={LINHA_CABECALHO_COLADO}>{COLUNAS.map((c) => <CabecalhoOrdenavel key={c.coluna} rotulo={c.rotulo} className={c.classe} alinharDireita={c.coluna === "valor_total"} dir={coluna === c.coluna ? direcao : null} onOrdenar={() => ordenar(c.coluna)} />)}</TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={8} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            : error ? <TableRow><TableCell colSpan={8} className="py-12 text-center text-destructive">Não foi possível carregar os pedidos fiscais — {formatError(error)}</TableCell></TableRow>
              : !itens.length ? <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">Nenhum pedido fiscal encontrado.</TableCell></TableRow>
                : itens.map((p) => <TableRow key={p.id} data-foco-id={p.id}>
                  <TableCell className="font-mono text-xs truncate" title={String(p.numero ?? "")}>{p.numero ?? "—"}</TableCell>
                  <TableCell className="text-xs"><div className="flex items-center gap-1"><span className="truncate font-mono" title={p.numero_loja ?? undefined}>{p.numero_loja || "—"}</span>{p.numero_loja_repetido && <span title="Nº da loja repetido em mais de um pedido fiscal"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" /></span>}</div></TableCell>
                  <TableCell className="text-xs">{fmtData(p.data_pedido)}</TableCell>
                  <TableCell className="text-sm truncate" title={p.cliente_nome ?? undefined}>{p.cliente_nome || "—"}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{moeda(p.valor_total)}</TableCell>
                  <TableCell><span className="flex items-center gap-1.5 text-xs"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground" style={p.situacao_cor ? { backgroundColor: p.situacao_cor } : undefined} /><span className="truncate" title={p.situacao_label ?? undefined}>{p.situacao_label || "—"}</span></span></TableCell>
                  <TableCell>{p.nf_numero ? <div className="space-y-1"><div className="flex items-center gap-1 text-xs font-mono"><span className="truncate" title={`${p.nf_serie ?? ""}-${p.nf_numero}`}>{p.nf_serie ? `${p.nf_serie}-${p.nf_numero}` : p.nf_numero}</span>{Number(p.nf_qtd) > 1 && <span className="text-muted-foreground" title={`${p.nf_qtd} notas para este pedido`}>+{Number(p.nf_qtd) - 1}</span>}</div>{p.nf_situacao && <Badge variant="outline" className={`font-normal text-xs max-w-full ${SITUACAO_CLASS[p.nf_situacao] ?? "bg-muted text-muted-foreground"}`}>{SITUACAO_LABELS[p.nf_situacao] ?? p.nf_situacao}</Badge>}</div> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{p.pedido_sncf_id && p.pedido_sncf_ref ? <Button variant="link" size="sm" className="h-auto p-0 max-w-full font-mono text-xs" title={p.pedido_sncf_ref} onClick={() => abrirDetalhe(navigate, location, `/pedidos/${p.pedido_sncf_id}`, { foco: String(p.id), focoParam: "pf_foco", label: "NFs de venda" })}><span className="truncate">{p.pedido_sncf_ref}</span></Button> : <span className="text-muted-foreground">—</span>}</TableCell>
                </TableRow>)}
        </TableBody>
      </Table>
      <RodapePaginacao total={filtrados.length} pagina={pagina} tamanhoPagina={tamanhoPagina} chavePreferencia={PREFERENCIA} onPagina={(pagina) => setNav({ pagina })} onTamanhoPagina={(tamanho_pagina) => { salvar({ tamanho_pagina }); setNav({ pagina: 1 }); }} />
    </div>
  </>;
}