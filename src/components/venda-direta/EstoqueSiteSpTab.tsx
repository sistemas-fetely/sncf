import { useMemo } from "react";
import { MultiSelectFilter } from "@/components/shared/MultiSelectFilter";
import { KpiPill } from "@/components/shared/KpiPill";
import { ordenarPor, SortableTableHead, type SortState } from "@/components/shared/SortableTableHead";
import { FilterInput } from "@/components/ui/filter-input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { LINHA_CABECALHO_COLADO } from "@/components/tabela/CabecalhoOrdenavel";
import { DEFAULT_PAGE_SIZE, RodapePaginacao } from "@/components/tabela/RodapePaginacao";
import { useState } from "react";
import { useEstadoTela, lerLista, escreverLista, lerOrdemKD, escreverOrdemKD } from "@/lib/navegacao";
import { formatError } from "@/lib/format-error";
import { filtrarEstoqueSiteSp } from "./estoqueSiteSp";
import { juntarColecoesSiteSp, useColecoesSiteSp, useSaldoSiteSp } from "./useEstoqueSiteSp";

type Coluna = "sku" | "nome_comercial" | "colecao" | "disponivel" | "reservado";
export function EstoqueSiteSpTab() {
  const saldo = useSaldoSiteSp();
  const catalogo = useColecoesSiteSp();
  const [nav, setNav] = useEstadoTela({ busca: "", colecoes: "", ordem: "", pagina: 1 }, { prefixo: "esp" });
  const [tamanho, setTamanho] = useState<number>(DEFAULT_PAGE_SIZE);
  const selecionadas = useMemo(() => lerLista(nav.colecoes), [nav.colecoes]);
  const linhas = useMemo(() => juntarColecoesSiteSp(saldo.data ?? [], catalogo.data?.produtos ?? [], catalogo.data?.colecoes ?? []), [saldo.data, catalogo.data]);
  const filtradas = useMemo(() => filtrarEstoqueSiteSp(linhas, nav.busca, selecionadas), [linhas, nav.busca, selecionadas]);
  const opcoes = useMemo(() => {
    const contagens = new Map<string, Set<string>>();
    for (const linha of filtrarEstoqueSiteSp(linhas, nav.busca, [])) {
      if (!linha.colecao) continue;
      const skus = contagens.get(linha.colecao) ?? new Set<string>();
      skus.add(linha.sku); contagens.set(linha.colecao, skus);
    }
    return [...new Set(filtrarEstoqueSiteSp(linhas, "", []).map((l) => l.colecao).filter((c): c is string => c !== null))]
      .sort((a, b) => a.localeCompare(b, "pt-BR")).map((rotulo) => ({ valor: rotulo, rotulo, contagem: contagens.get(rotulo)?.size ?? 0 }));
  }, [linhas, nav.busca]);
  const ordem = lerOrdemKD(nav.ordem);
  const sort: SortState<Coluna> = ordem ? { column: ordem.key as Coluna, direction: ordem.dir } : { column: "nome_comercial", direction: "asc" };
  const ordenadas = ordenarPor(filtradas, sort, { sku: (l) => l.sku, nome_comercial: (l) => l.nome_comercial, colecao: (l) => l.colecao, disponivel: (l) => l.disponivel, reservado: (l) => l.reservado });
  const pagina = Math.min(nav.pagina, Math.max(1, Math.ceil(ordenadas.length / tamanho)));
  const erro = saldo.error ?? catalogo.error;
  const cabecalho = (coluna: Coluna, rotulo: string, largura: string, direita = false) => <SortableTableHead column={coluna} sort={sort} className={largura} align={direita ? "right" : "left"} onSort={(nova) => setNav({ ordem: escreverOrdemKD(nova ? { key: nova.column, dir: nova.direction } : null), pagina: 1 })}>{rotulo}</SortableTableHead>;
  return (
    <section className="space-y-4" aria-label="Estoque Site SP">
      <div className="flex flex-wrap gap-3">
        <KpiPill label="SKUs com saldo" count={new Set(filtradas.map((l) => l.sku)).size} color="admin" active={false} />
        <KpiPill label="Unidades disponíveis" count={filtradas.reduce((s, l) => s + (l.disponivel ?? 0), 0)} color="emerald" active={false} />
      </div>
      <div className="flex flex-wrap gap-3">
        <FilterInput className="max-w-md" placeholder="Buscar SKU ou nome" value={nav.busca} onChange={(e) => setNav({ busca: e.target.value, pagina: 1 })} />
        <MultiSelectFilter label="Todas as coleções" plural="coleções" className="w-[180px]" opcoes={opcoes} selecionados={selecionadas} onChange={(valores) => setNav({ colecoes: escreverLista(valores), pagina: 1 })} />
      </div>
      {erro ? <p role="alert" className="text-sm text-destructive">Falha ao carregar estoque Site SP: {formatError(erro)}</p>
        : saldo.isPending || catalogo.isPending ? <p className="text-sm text-muted-foreground">Carregando estoque…</p>
        : !ordenadas.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum produto com saldo neste recorte.</p>
        : <>
          <Table className="table-fixed">
            <TableHeader><TableRow className={LINHA_CABECALHO_COLADO}>
              {cabecalho("sku", "SKU", "w-[22%]")}
              {cabecalho("nome_comercial", "Nome comercial", "w-[30%]")}
              {cabecalho("colecao", "Coleção", "w-[20%]")}
              {cabecalho("disponivel", "Disponível", "w-[14%]", true)}
              {cabecalho("reservado", "Reservado", "w-[14%]", true)}
            </TableRow></TableHeader>
            <TableBody>{ordenadas.slice((pagina - 1) * tamanho, pagina * tamanho).map((linha) => <TableRow key={linha.sku}>
              <TableCell className="break-words font-mono text-xs">{linha.sku}</TableCell><TableCell className="break-words">{linha.nome_comercial ?? "—"}</TableCell>
              <TableCell className="break-words">{linha.colecao ?? "—"}</TableCell><TableCell className="text-right font-medium tabular-nums">{(linha.disponivel ?? 0).toLocaleString("pt-BR")}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{(linha.reservado ?? 0).toLocaleString("pt-BR")}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
          <RodapePaginacao pagina={pagina} total={ordenadas.length} tamanhoPagina={tamanho} onPagina={(p) => setNav({ pagina: p })} onTamanhoPagina={setTamanho} />
        </>}
    </section>
  );
}