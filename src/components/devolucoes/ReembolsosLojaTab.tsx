import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Download, Loader2, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { abrirDetalhe, useEstadoTela, useFocoAoVoltar, useRestaurarScroll } from "@/lib/navegacao";
import { usePreferenciaTela } from "@/hooks/usePreferenciaTela";
import { useNivel } from "@/hooks/useNivel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterInput } from "@/components/ui/filter-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CabecalhoOrdenavel, LINHA_CABECALHO_COLADO } from "@/components/tabela/CabecalhoOrdenavel";
import { RodapePaginacao } from "@/components/tabela/RodapePaginacao";
import { fmtData, hojeISO } from "@/lib/data";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { useReembolsosLoja } from "./useReembolsosLoja";
import { destinoDevolucaoLoja, filtrarReembolsosLoja, ordenarReembolsosLoja, resumirReembolsosLoja, type ColunaReembolso } from "./reembolsosLoja";

const PREFERENCIA = "devolucoes.reembolsos-loja";
const ESTORNOS = { pago: "Pago", pendente: "Pendente" };
const SITUACOES = { com_devolucao: "Com devolução", cancelamento: "Cancelado antes do envio", sem_devolucao: "Sem devolução" };
const COLUNAS: { coluna: ColunaReembolso | "motivo"; rotulo: string; classe: string }[] = [
  { coluna: "pedido_ref", rotulo: "Pedido", classe: "w-[10%]" },
  { coluna: "data_reembolso", rotulo: "Data", classe: "w-[9%]" },
  { coluna: "cliente", rotulo: "Cliente", classe: "w-[16%]" },
  { coluna: "valor", rotulo: "Valor", classe: "w-[13%] text-right" },
  { coluna: "meio", rotulo: "Meio", classe: "w-[12%]" },
  { coluna: "estorno", rotulo: "Estorno", classe: "w-[10%]" },
  { coluna: "motivo", rotulo: "Motivo", classe: "w-[14%]" },
  { coluna: "situacao", rotulo: "Devolução", classe: "w-[16%]" },
];

export default function ReembolsosLojaTab() {
  const navigate = useNavigate();
  const location = useLocation();
  const { temNivel } = useNivel();
  const [nav, setNav] = useEstadoTela({ busca: "", situacao: "todas", estorno: "todos", mes: "todos", ordem: "data_reembolso:desc", pagina: 1 }, { prefixo: "rl" });
  const { preferencias, salvar } = usePreferenciaTela(PREFERENCIA, { tamanho_pagina: 20 });
  const { data: linhas = [], isLoading, error } = useReembolsosLoja();
  const meses = useMemo(() => Array.from(new Set(linhas.map((r) => r.data_reembolso?.slice(0, 7)).filter((v): v is string => Boolean(v)))).sort().reverse(), [linhas]);
  const [col, dir] = nav.ordem.split(":");
  const coluna = COLUNAS.some((c) => c.coluna === col && col !== "motivo") ? col as ColunaReembolso : "data_reembolso";
  const direcao = dir === "asc" ? "asc" : "desc";
  const filtrados = useMemo(() => ordenarReembolsosLoja(filtrarReembolsosLoja(linhas, nav), coluna, direcao), [linhas, nav, coluna, direcao]);
  const resumo = resumirReembolsosLoja(filtrados);
  const tamanhoPagina = preferencias.tamanho_pagina;
  const pagina = Math.min(nav.pagina, Math.max(1, Math.ceil(filtrados.length / tamanhoPagina)));
  const itens = filtrados.slice((pagina - 1) * tamanhoPagina, pagina * tamanhoPagina);
  useFocoAoVoltar({ pronto: !isLoading, idsVisiveis: itens.map((r) => r.id), focoParam: "rl_foco" });
  useRestaurarScroll(null, !isLoading);

  const ordenar = (nova: ColunaReembolso) => setNav({ ordem: `${nova}:${nova === coluna ? (direcao === "asc" ? "desc" : "asc") : ["data_reembolso", "valor"].includes(nova) ? "desc" : "asc"}`, pagina: 1 });
  const exportar = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filtrados.map((r) => ({
      Pedido: r.pedido_ref || r.pedido_loja || "", Data: fmtData(r.data_reembolso, ""), Cliente: r.cliente ?? "", Valor: Number(r.valor ?? 0), "Valor do pedido": r.valor_pedido ?? "", Meio: r.meio ?? "", Estorno: ESTORNOS[r.estorno], Motivo: r.motivo ?? "", "Voltou ao estoque": r.voltou_estoque ? "Sim" : "Não", Situação: SITUACOES[r.situacao], Devolução: r.devolucao_numero ?? "", "NF de devolução": r.nf_dev_numero ?? "",
    }))), "Reembolsos da loja");
    XLSX.writeFile(wb, `reembolsos-loja-${nav.mes === "todos" ? hojeISO() : nav.mes}.xlsx`);
  };

  return <>
    <div className="grid gap-4 sm:grid-cols-3 mb-4">
      {[{ label: "Reembolsado", valor: formatBRL(resumo.valorPago), detalhe: `${resumo.pagos} reembolsos`, alerta: false }, { label: "Estorno pendente", valor: formatBRL(resumo.valorPendente), detalhe: `${resumo.pendentes} reembolsos`, alerta: resumo.pendentes > 0 }, { label: "Sem devolução", valor: String(resumo.semDevolucao), detalhe: "", alerta: resumo.semDevolucao > 0 }].map((k) => <Card key={k.label} className={cn(k.alerta && "border-warning/30 bg-warning/10")}>
        <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">{k.label}</CardTitle></CardHeader>
        <CardContent><div className={cn("text-2xl font-medium tabular-nums", k.alerta && "text-warning")}>{k.valor}</div>{k.detalhe && <p className="text-xs text-muted-foreground mt-1">{k.detalhe}</p>}</CardContent>
      </Card>)}
    </div>
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="relative flex-1 min-w-0 sm:min-w-[220px] max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" /><FilterInput value={nav.busca} onChange={(e) => setNav({ busca: e.target.value, pagina: 1 })} placeholder="Buscar por pedido, cliente ou motivo" className="pl-9" /></div>
      <Select value={nav.situacao} onValueChange={(situacao) => setNav({ situacao, pagina: 1 })}><SelectTrigger className="h-8 w-[210px]" aria-label="Situação"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todas</SelectItem>{Object.entries(SITUACOES).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent></Select>
      <Select value={nav.estorno} onValueChange={(estorno) => setNav({ estorno, pagina: 1 })}><SelectTrigger className="h-8 w-[140px]" aria-label="Estorno"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{Object.entries(ESTORNOS).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent></Select>
      <Select value={nav.mes} onValueChange={(mes) => setNav({ mes, pagina: 1 })}><SelectTrigger className="h-8 w-[170px]" aria-label="Mês"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os meses</SelectItem>{meses.map((m) => <SelectItem key={m} value={m}>{new Date(m + "-01T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(" de ", "/")}</SelectItem>)}</SelectContent></Select>
      {temNivel(3) && <Button variant="outline" size="sm" className="h-8 ml-auto" disabled={isLoading || Boolean(error) || !filtrados.length} onClick={exportar}><Download className="h-4 w-4 mr-1.5" />Exportar XLSX</Button>}
    </div>
    <div className="rounded-md border bg-card min-w-0">
      <Table className="table-fixed w-full [&_td]:px-2 [&_th]:px-2" containerClassName="overflow-visible">
        <TableHeader><TableRow className={LINHA_CABECALHO_COLADO}>{COLUNAS.map((c) => c.coluna === "motivo" ? <TableHead key={c.coluna} className={c.classe}>{c.rotulo}</TableHead> : <CabecalhoOrdenavel key={c.coluna} rotulo={c.rotulo} className={c.classe} alinharDireita={c.coluna === "valor"} dir={coluna === c.coluna ? direcao : null} onOrdenar={() => { if (c.coluna !== "motivo") ordenar(c.coluna); }} />)}</TableRow></TableHeader>
        <TableBody>{isLoading ? <TableRow><TableCell colSpan={8} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow> : error ? <TableRow><TableCell colSpan={8} className="py-12 text-center text-destructive">Não foi possível carregar os reembolsos — {formatError(error)}</TableCell></TableRow> : !itens.length ? <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">Nenhum reembolso encontrado.</TableCell></TableRow> : itens.map((r) => <TableRow key={r.id} data-foco-id={r.id}>
          <TableCell>{r.pedido_id ? <Button variant="link" size="sm" className="h-auto p-0 max-w-full font-mono text-xs" title={r.pedido_ref || r.pedido_loja || undefined} onClick={() => abrirDetalhe(navigate, location, `/pedidos/${r.pedido_id}`, { foco: r.id, label: "Devoluções", focoParam: "rl_foco" })}><span className="truncate">{r.pedido_ref || r.pedido_loja || "—"}</span></Button> : <span className="block truncate font-mono text-xs">{r.pedido_loja || "—"}</span>}</TableCell>
          <TableCell className="text-xs">{fmtData(r.data_reembolso)}</TableCell>
          <TableCell className="text-sm truncate" title={r.cliente ?? undefined}>{r.cliente || "—"}</TableCell>
          <TableCell className="text-right font-mono text-xs">{formatBRL(Number(r.valor ?? 0))}{r.valor_pedido != null && Number(r.valor_pedido) !== Number(r.valor) && <p className="text-xs text-muted-foreground mt-1">de {formatBRL(Number(r.valor_pedido))}</p>}</TableCell>
          <TableCell className="text-xs truncate" title={r.meio ?? undefined}>{r.meio || "—"}</TableCell>
          <TableCell><Badge variant="outline" className={cn("font-normal text-xs max-w-full", r.estorno === "pago" ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20")}><span className="break-words">{ESTORNOS[r.estorno]}</span></Badge></TableCell>
          <TableCell><p className="truncate text-xs" title={r.motivo ?? undefined}>{r.motivo || "—"}</p>{r.voltou_estoque && <p className="text-xs text-muted-foreground mt-1">Voltou ao estoque</p>}</TableCell>
          <TableCell>{r.situacao === "com_devolucao" ? <>{r.devolucao_numero ? <Button variant="link" size="sm" className="h-auto p-0 max-w-full font-mono text-xs" title={r.devolucao_numero} onClick={() => { if (r.devolucao_numero) navigate(destinoDevolucaoLoja(r.devolucao_numero)); }}><span className="truncate">{r.devolucao_numero}</span></Button> : "—"}{r.nf_dev_numero && <p className="text-xs text-muted-foreground mt-1">NF {r.nf_dev_numero}</p>}</> : <Badge variant="outline" className={cn("font-normal text-xs max-w-full", r.situacao === "sem_devolucao" ? "bg-warning/10 text-warning border-warning/20" : "bg-muted text-muted-foreground")}><span className="break-words">{SITUACOES[r.situacao]}</span></Badge>}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>
    <RodapePaginacao total={filtrados.length} pagina={pagina} tamanhoPagina={tamanhoPagina} chavePreferencia={PREFERENCIA} onPagina={(pagina) => setNav({ pagina })} onTamanhoPagina={(tamanho_pagina) => { salvar({ tamanho_pagina }); setNav({ pagina: 1 }); }} />
    <div className="mt-4 text-sm text-muted-foreground">{filtrados.length} reembolsos · <span className="text-foreground font-medium tabular-nums">Total {formatBRL(resumo.total)}</span></div>
  </>;
}