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
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { CabecalhoOrdenavel, LINHA_CABECALHO_COLADO } from "@/components/tabela/CabecalhoOrdenavel";
import { RodapePaginacao } from "@/components/tabela/RodapePaginacao";
import { fmtData, hojeISO } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import { useNfsEntrada } from "./useNfsEntrada";
import { destinoVendaEntrada, filtrarNfsEntrada, ordenarNfsEntrada, resumirNfsEntrada, type ColunaEntrada } from "./nfsEntrada";

const PREFERENCIA = "notas-fiscais.entradas";
const moeda = (valor: number | null) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor ?? 0));
const percentual = (valor: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(valor);
const nf = (serie: string | null, numero: string | null) => numero ? (serie ? `${serie}-${numero}` : numero) : "—";
const COLUNAS: { coluna: ColunaEntrada; rotulo: string; classe: string }[] = [
  { coluna: "numero", rotulo: "NF", classe: "w-[8%]" },
  { coluna: "data_emissao", rotulo: "Data", classe: "w-[10%]" },
  { coluna: "emitida_por", rotulo: "Emitida por", classe: "w-[11%]" },
  { coluna: "contraparte", rotulo: "Cliente", classe: "w-[19%]" },
  { coluna: "tipo_rotulo", rotulo: "Tipo", classe: "w-[18%]" },
  { coluna: "valor", rotulo: "Valor", classe: "w-[12%] text-right" },
  { coluna: "nf_venda_numero", rotulo: "NF de venda", classe: "w-[13%]" },
  { coluna: "pedido_ref", rotulo: "Pedido", classe: "w-[9%]" },
];

export function AbaEntradas() {
  const navigate = useNavigate();
  const location = useLocation();
  const { temNivel } = useNivel();
  const [nav, setNav] = useEstadoTela({ busca: "", emitida: "todas", tipo: "todos", mes: "todos", ordem: "data_emissao:desc", pagina: 1 }, { prefixo: "en" });
  const { preferencias, salvar } = usePreferenciaTela(PREFERENCIA, { tamanho_pagina: 20 });
  const { data: notas = [], isLoading, error } = useNfsEntrada();
  const tipos = useMemo(() => Array.from(new Set(notas.map((n) => n.tipo_rotulo || n.tipo_codigo).filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b, "pt-BR")), [notas]);
  const meses = useMemo(() => Array.from(new Set(notas.map((n) => n.data_emissao?.slice(0, 7)).filter((v): v is string => Boolean(v)))).sort().reverse(), [notas]);
  const [col, dir] = nav.ordem.split(":");
  const coluna = COLUNAS.some((c) => c.coluna === col) ? col as ColunaEntrada : "data_emissao";
  const direcao = dir === "asc" ? "asc" : "desc";
  const filtrados = useMemo(() => ordenarNfsEntrada(filtrarNfsEntrada(notas, nav), coluna, direcao), [notas, nav, coluna, direcao]);
  const resumo = resumirNfsEntrada(filtrados);
  const tamanhoPagina = preferencias.tamanho_pagina;
  const pagina = Math.min(nav.pagina, Math.max(1, Math.ceil(filtrados.length / tamanhoPagina)));
  const itens = filtrados.slice((pagina - 1) * tamanhoPagina, pagina * tamanhoPagina);
  useFocoAoVoltar({ pronto: !isLoading, idsVisiveis: itens.map((n) => n.id), focoParam: "en_foco" });
  useRestaurarScroll(null, !isLoading);

  const ordenar = (nova: ColunaEntrada) => {
    const inicial = ["numero", "data_emissao", "valor", "nf_venda_numero"].includes(nova) ? "desc" : "asc";
    setNav({ ordem: `${nova}:${nova === coluna ? (direcao === "asc" ? "desc" : "asc") : inicial}`, pagina: 1 });
  };
  const exportar = () => {
    const linhas = filtrados.map((n) => ({
      NF: nf(n.serie, n.numero), Data: fmtData(n.data_emissao, ""), "Emitida por": n.emitida_por === "fetely" ? "Fetely" : "Cliente",
      Cliente: n.contraparte ?? "", Documento: n.contraparte_documento ?? "", Tipo: n.tipo_rotulo || n.tipo_codigo || "", Natureza: n.natureza_operacao ?? "",
      Valor: Number(n.valor ?? 0), "NF de venda": n.nf_venda_numero ? nf(n.nf_venda_serie, n.nf_venda_numero) : "", "% devolvido": n.pct_devolvido ?? "", Pedido: n.pedido_ref ?? "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Devoluções e Entradas");
    XLSX.writeFile(wb, `notas-devolucao-entrada-${nav.mes === "todos" ? hojeISO() : nav.mes}.xlsx`);
  };

  return <>
    <div className="grid gap-4 sm:grid-cols-3 mb-4">
      {[{ label: "Notas", valor: String(resumo.quantidade) }, { label: "Valor total", valor: moeda(resumo.valor) }, { label: "Devolução de venda", valor: moeda(resumo.devolucao) }].map((k) => <Card key={k.label}>
        <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">{k.label}</CardTitle></CardHeader>
        <CardContent><div className="text-2xl font-medium tabular-nums">{k.valor}</div></CardContent>
      </Card>)}
    </div>
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="relative flex-1 min-w-0 sm:min-w-[240px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <FilterInput value={nav.busca} onChange={(e) => setNav({ busca: e.target.value, pagina: 1 })} placeholder="Buscar por nº da nota, cliente ou NF de venda" className="pl-9" />
      </div>
      <div className="flex items-center gap-1.5">
        {[{ codigo: "todas", nome: "Todas" }, { codigo: "fetely", nome: "Fetely" }, { codigo: "cliente", nome: "Cliente" }].map((e) => <Button key={e.codigo} variant={nav.emitida === e.codigo ? "default" : "outline"} size="sm" className="h-8" onClick={() => setNav({ emitida: e.codigo, pagina: 1 })}>{e.nome}</Button>)}
      </div>
      <Select value={nav.tipo} onValueChange={(tipo) => setNav({ tipo, pagina: 1 })}>
        <SelectTrigger className="h-8 w-[180px]" aria-label="Tipo"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="todos">Todos os tipos</SelectItem>{tipos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={nav.mes} onValueChange={(mes) => setNav({ mes, pagina: 1 })}>
        <SelectTrigger className="h-8 w-[170px]" aria-label="Mês"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="todos">Todos os meses</SelectItem>{meses.map((m) => <SelectItem key={m} value={m}>{new Date(m + "-01T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(" de ", "/")}</SelectItem>)}</SelectContent>
      </Select>
      {temNivel(3) && <Button variant="outline" size="sm" className="h-8 ml-auto" disabled={isLoading || Boolean(error) || !filtrados.length} onClick={exportar}><Download className="h-4 w-4 mr-1.5" />Exportar XLSX</Button>}
    </div>
    <div className="rounded-md border bg-card min-w-0">
      <Table className="table-fixed w-full [&_td]:px-2 [&_th]:px-2" containerClassName="overflow-visible">
        <TableHeader><TableRow className={LINHA_CABECALHO_COLADO}>{COLUNAS.map((c) => <CabecalhoOrdenavel key={c.coluna} rotulo={c.rotulo} className={c.classe} alinharDireita={c.coluna === "valor"} dir={coluna === c.coluna ? direcao : null} onOrdenar={() => ordenar(c.coluna)} />)}</TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={8} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            : error ? <TableRow><TableCell colSpan={8} className="py-12 text-center text-destructive">Não foi possível carregar as notas — {formatError(error)}</TableCell></TableRow>
              : !itens.length ? <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">Nenhuma nota de devolução ou entrada encontrada.</TableCell></TableRow>
                : itens.map((n) => <TableRow key={n.id} data-foco-id={n.id}>
                  <TableCell className="font-mono text-xs truncate" title={nf(n.serie, n.numero)}>{nf(n.serie, n.numero)}</TableCell>
                  <TableCell className="text-xs">{fmtData(n.data_emissao)}</TableCell>
                  <TableCell><Badge variant="outline" className="font-normal text-xs">{n.emitida_por === "fetely" ? "Fetely" : "Cliente"}</Badge></TableCell>
                  <TableCell className="text-sm truncate" title={n.contraparte ?? undefined}>{n.contraparte || "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="font-normal text-xs max-w-full gap-1" title={n.tipo_rotulo || n.tipo_codigo || undefined}><span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" style={n.tipo_cor ? { backgroundColor: n.tipo_cor } : undefined} /><span className="truncate">{n.tipo_rotulo || n.tipo_codigo || "—"}</span></Badge>{n.natureza_operacao && <p className="text-xs text-muted-foreground truncate mt-1" title={n.natureza_operacao}>{n.natureza_operacao}</p>}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{moeda(n.valor)}</TableCell>
                  <TableCell>{n.nf_venda_numero ? <><Button variant="link" size="sm" className="h-auto p-0 max-w-full font-mono text-xs" title={nf(n.nf_venda_serie, n.nf_venda_numero)} onClick={() => { if (n.nf_venda_numero) navigate(destinoVendaEntrada(n.nf_venda_numero)); }}><span className="truncate">{nf(n.nf_venda_serie, n.nf_venda_numero)}</span></Button>{n.pct_devolvido != null && <p className="text-xs text-muted-foreground mt-1">{percentual(n.pct_devolvido)}% devolvido</p>}</> : "—"}</TableCell>
                  <TableCell>{n.pedido_id && n.pedido_ref ? <Button variant="link" size="sm" className="h-auto p-0 max-w-full font-mono text-xs" title={n.pedido_ref} onClick={() => abrirDetalhe(navigate, location, `/pedidos/${n.pedido_id}`, { foco: n.id, label: "Notas fiscais", focoParam: "en_foco" })}><span className="truncate">{n.pedido_ref}</span></Button> : "—"}</TableCell>
                </TableRow>)}
        </TableBody>
      </Table>
    </div>
    <RodapePaginacao total={filtrados.length} pagina={pagina} tamanhoPagina={tamanhoPagina} chavePreferencia={PREFERENCIA} onPagina={(pagina) => setNav({ pagina })} onTamanhoPagina={(tamanho_pagina) => { salvar({ tamanho_pagina }); setNav({ pagina: 1 }); }} />
    <div className="mt-4 text-sm text-muted-foreground">{filtrados.length} notas · <span className="text-foreground font-medium tabular-nums">Total {moeda(resumo.valor)}</span></div>
  </>;
}