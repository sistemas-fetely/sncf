import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { abrirDetalhe } from "@/lib/navegacao";
import { CabecalhoOrdenavel, LINHA_CABECALHO_COLADO } from "@/components/tabela/CabecalhoOrdenavel";
import { RodapePaginacao } from "@/components/tabela/RodapePaginacao";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { fmtData } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import type { ColunaFiscal, PedidoFiscal } from "./pedidosFiscais";
import { SITUACAO_CLASS, SITUACAO_LABELS } from "./situacaoNf";
const moeda = (valor: number | null) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor ?? 0));
const COLUNAS_BASE: { coluna: ColunaFiscal; rotulo: string; classe: string }[] = [
  { coluna: "numero", rotulo: "Nº", classe: "w-[7%]" },
  { coluna: "numero_loja", rotulo: "Pedido da loja", classe: "w-[15%]" },
  { coluna: "data_pedido", rotulo: "Data", classe: "w-[10%]" },
  { coluna: "cliente_nome", rotulo: "Cliente", classe: "w-[22%]" },
  { coluna: "valor_total", rotulo: "Valor", classe: "w-[12%] text-right" },
  { coluna: "situacao_label", rotulo: "Situação", classe: "w-[12%]" },
  { coluna: "nf_numero", rotulo: "NF", classe: "w-[13%]" },
  { coluna: "pedido_sncf_ref", rotulo: "Pedido", classe: "w-[9%]" },
];

export function TabelaPedidosFiscais({ itens, isLoading, error, total, pagina, tamanhoPagina, coluna, direcao, ordenar, chavePreferencia, onPagina, onTamanhoPagina, comDias = false, focoParam = "pf_foco", vazio = "Nenhum pedido fiscal encontrado." }: {
  itens: PedidoFiscal[]; isLoading: boolean; error: unknown; total: number; pagina: number; tamanhoPagina: number;
  coluna: ColunaFiscal; direcao: "asc" | "desc"; ordenar: (coluna: ColunaFiscal) => void;
  chavePreferencia: string; onPagina: (pagina: number) => void; onTamanhoPagina: (tamanho: number) => void;
  comDias?: boolean; focoParam?: string; vazio?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const larguras = ["w-[6%]", "w-[13%]", "w-[12%]", "w-[17%]", "w-[12%] text-right", "w-[12%]", "w-[12%]", "w-[10%]"];
  const COLUNAS = comDias ? COLUNAS_BASE.flatMap((c, index) => [
    { ...c, classe: larguras[index] },
    ...(c.coluna === "data_pedido" ? [{ coluna: "dias_pedido" as ColunaFiscal, rotulo: "Dias", classe: "w-[6%] text-right" }] : []),
  ]) : COLUNAS_BASE;
  return (
    <div className="rounded-md border bg-card min-w-0">
      <Table className={comDias ? "table-fixed w-full [&_td]:px-2 [&_th]:px-2" : "table-fixed w-full"} containerClassName="overflow-visible">
        <TableHeader><TableRow className={LINHA_CABECALHO_COLADO}>{COLUNAS.map((c) => <CabecalhoOrdenavel key={c.coluna} rotulo={c.rotulo} className={c.classe} alinharDireita={c.coluna === "valor_total" || c.coluna === "dias_pedido"} dir={coluna === c.coluna ? direcao : null} onOrdenar={() => ordenar(c.coluna)} />)}</TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={COLUNAS.length} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            : error ? <TableRow><TableCell colSpan={COLUNAS.length} className="py-12 text-center text-destructive">Não foi possível carregar os pedidos fiscais — {formatError(error)}</TableCell></TableRow>
              : !itens.length ? <TableRow><TableCell colSpan={COLUNAS.length} className="py-12 text-center text-muted-foreground">{vazio}</TableCell></TableRow>
                : itens.map((p) => <TableRow key={p.id} data-foco-id={p.id}>
                  <TableCell className="font-mono text-xs truncate" title={String(p.numero ?? "")}>{p.numero ?? "—"}</TableCell>
                  <TableCell className="text-xs"><div className="flex items-center gap-1"><span className="truncate font-mono" title={p.numero_loja ?? undefined}>{p.numero_loja || "—"}</span>{p.numero_loja_repetido && <span title="Nº da loja repetido em mais de um pedido fiscal"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" /></span>}</div></TableCell>
                  <TableCell className="text-xs">{fmtData(p.data_pedido)}</TableCell>
                  {comDias && <TableCell className="text-right text-xs font-mono">{p.dias_pedido ?? "—"}</TableCell>}
                  <TableCell className="text-sm truncate" title={p.cliente_nome ?? undefined}>{p.cliente_nome || "—"}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{moeda(p.valor_total)}</TableCell>
                  <TableCell><span className="flex items-center gap-1.5 text-xs"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground" style={p.situacao_cor ? { backgroundColor: p.situacao_cor } : undefined} /><span className="truncate" title={p.situacao_label ?? undefined}>{p.situacao_label || "—"}</span></span></TableCell>
                  <TableCell>{p.nf_numero ? <div className="space-y-1"><div className="flex items-center gap-1 text-xs font-mono"><span className="truncate" title={`${p.nf_serie ?? ""}-${p.nf_numero}`}>{p.nf_serie ? `${p.nf_serie}-${p.nf_numero}` : p.nf_numero}</span>{Number(p.nf_qtd) > 1 && <span className="text-muted-foreground" title={`${p.nf_qtd} notas para este pedido`}>+{Number(p.nf_qtd) - 1}</span>}</div>{p.nf_situacao && <Badge variant="outline" className={`font-normal text-xs max-w-full ${SITUACAO_CLASS[p.nf_situacao] ?? "bg-muted text-muted-foreground"}`}>{SITUACAO_LABELS[p.nf_situacao] ?? p.nf_situacao}</Badge>}</div> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{p.pedido_sncf_id && p.pedido_sncf_ref ? <Button variant="link" size="sm" className="h-auto p-0 max-w-full font-mono text-xs" title={p.pedido_sncf_ref} onClick={() => abrirDetalhe(navigate, location, `/pedidos/${p.pedido_sncf_id}`, { foco: String(p.id), focoParam, label: "NFs de venda" })}><span className="truncate">{p.pedido_sncf_ref}</span></Button> : <span className="text-muted-foreground">—</span>}</TableCell>
                </TableRow>)}
        </TableBody>
      </Table>
      <RodapePaginacao total={total} pagina={pagina} tamanhoPagina={tamanhoPagina} chavePreferencia={chavePreferencia} onPagina={onPagina} onTamanhoPagina={onTamanhoPagina} />
    </div>
  );
}
