import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterInput } from "@/components/ui/filter-input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, Search, Undo2, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import {
  CabecalhoOrdenavel,
  LINHA_CABECALHO_COLADO,
  type DirecaoOrdenacao,
} from "@/components/tabela/CabecalhoOrdenavel";
import {
  RodapePaginacao,
  lerTamanhoPaginaSalvo,
  type PageSizeOption,
} from "@/components/tabela/RodapePaginacao";
import {
  useDevolucoesRetornoPendente,
  type RetornoPendenteDevolucao,
} from "@/hooks/estoque/useDevolucoesRetornoPendente";

type ColunaDevolucao =
  | "devolucao" | "nf" | "motivo" | "devolvido_em" | "esperando" | "unidades" | "custo";

type OrdenacaoDevolucao = { coluna: ColunaDevolucao; dir: DirecaoOrdenacao } | null;

/** Espera, unidade e dinheiro descem: o que mais doi vem primeiro. */
const DIR_INICIAL_DEVOLUCAO: Record<ColunaDevolucao, DirecaoOrdenacao> = {
  devolucao: "asc", nf: "asc", motivo: "asc", devolvido_em: "desc",
  esperando: "desc", unidades: "desc", custo: "desc",
};

/** CasaHeader = 4rem. Mesmo numero que ancora o `top-16` do bloco de KPIs. */
const ALTURA_CASA_HEADER = 64;

const CHAVE_PAGINA_DEVOLUCAO = "fetely:estoque:retorno-devolucao:page-size";

function formatNum(v: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(Number(v ?? 0));
}

export default function RetornoDevolucao() {
  const { data: devolucoes = [], isLoading, isFetching, refetch } = useDevolucoesRetornoPendente();
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<RetornoPendenteDevolucao | null>(null);

  const [ordenacao, setOrdenacao] = useState<OrdenacaoDevolucao>(null);
  const [pagina, setPagina] = useState(1);
  const [tamanhoPagina, setTamanhoPagina] = useState(() =>
    lerTamanhoPaginaSalvo(CHAVE_PAGINA_DEVOLUCAO),
  );

  const ordenarPor = (coluna: ColunaDevolucao) => {
    setOrdenacao((atual) => {
      if (!atual || atual.coluna !== coluna) return { coluna, dir: DIR_INICIAL_DEVOLUCAO[coluna] };
      const invertida: DirecaoOrdenacao = atual.dir === "asc" ? "desc" : "asc";
      // Fechou o ciclo: volta a ordem que a view entrega.
      return invertida === DIR_INICIAL_DEVOLUCAO[coluna] ? null : { coluna, dir: invertida };
    });
  };

  useEffect(() => {
    setPagina(1);
  }, [busca, ordenacao]);

  // TOPO-COLADO-SE-MEDE: o cabecalho da tabela cola logo abaixo dos KPIs, e a
  // altura deles muda (os cards quebram linha em tela menor). Mede, nao chuta.
  const kpisRef = useRef<HTMLDivElement>(null);
  const [alturaKpis, setAlturaKpis] = useState(0);

  useEffect(() => {
    const el = kpisRef.current;
    if (!el) return;
    const medir = () => setAlturaKpis(el.offsetHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return devolucoes;
    return devolucoes.filter(
      (p) =>
        p.devolucao_numero?.toLowerCase().includes(q) ||
        p.id_externo?.toLowerCase().includes(q) ||
        p.nf?.toLowerCase().includes(q) ||
        p.itens.some(
          (i) =>
            i.sku.toLowerCase().includes(q) ||
            i.nome_comercial?.toLowerCase().includes(q),
        ),
    );
  }, [devolucoes, busca]);

  // VAZIO-VAI-PRO-FIM: celula sem dado nunca ganha primeiro lugar, nos dois sentidos.
  const ordenados = useMemo(() => {
    if (!ordenacao) return filtrados;
    const dir = ordenacao.dir === "asc" ? 1 : -1;
    const valorDe = (p: RetornoPendenteDevolucao): string | number | null => {
      switch (ordenacao.coluna) {
        case "devolucao": return p.devolucao_numero ?? null;
        case "nf": return p.nf ?? null;
        case "motivo": return p.motivo ?? null;
        case "devolvido_em": {
          const t = p.devolvido_em ? Date.parse(p.devolvido_em) : NaN;
          return Number.isNaN(t) ? null : t;
        }
        case "esperando": return p.dias_esperando ?? null;
        case "unidades": return Number(p.unidades_pendentes ?? 0);
        case "custo": return Number(p.valor_custo_pendente ?? 0);
        default: return null;
      }
    };
    return [...filtrados].sort((a, b) => {
      const va = valorDe(a);
      const vb = valorDe(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * dir;
      }
      return (Number(va) - Number(vb)) * dir;
    });
  }, [filtrados, ordenacao]);

  const totalPaginasDevolucao = Math.max(1, Math.ceil(ordenados.length / tamanhoPagina));
  const paginaAtual = Math.min(pagina, totalPaginasDevolucao);
  const paginaItens = ordenados.slice(
    (paginaAtual - 1) * tamanhoPagina,
    paginaAtual * tamanhoPagina,
  );

  const totalUnidades = devolucoes.reduce((s, p) => s + p.unidades_pendentes, 0);
  const totalValor = devolucoes.reduce((s, p) => s + p.valor_custo_pendente, 0);

  // mantém a devolução aberta sincronizada com o refetch da view
  const devolucaoAberta = selecionado
    ? devolucoes.find((d) => d.devolucao_id === selecionado.devolucao_id) ?? null
    : null;

  return (
    <PageShell variant="dados" className="animate-casa-fade-in">
      <div style={{ "--fila-topo-colado": `${ALTURA_CASA_HEADER + alturaKpis}px` } as CSSProperties}>
        <CasaPageHeader
          breadcrumb={[
            { label: "Casa", to: "/" },
            { label: "SOPs" },
            { label: "Produto" },
            { label: "Estoque" },
            { label: "Retorno de devolução" },
          ]}
          title="Conferência de retorno de devolução"
          subtitle="Mercadoria devolvida só volta ao estoque depois da conferência física. Retorno parcial é normal."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              Atualizar
            </Button>
          }
        />

        <div
          ref={kpisRef}
          className="sticky top-16 z-20 -mx-6 grid grid-cols-1 gap-3 bg-background px-6 py-2 sm:grid-cols-3"
        >
          <div className="rounded-md border bg-card p-4">
            <div className="text-xs text-muted-foreground">Devoluções aguardando conferência</div>
            <div className="text-2xl font-medium tabular-nums">{formatNum(devolucoes.length)}</div>
          </div>
          <div className="rounded-md border bg-card p-4">
            <div className="text-xs text-muted-foreground">Unidades pendentes</div>
            <div className="text-2xl font-medium tabular-nums">{formatNum(totalUnidades)}</div>
          </div>
          <div className="rounded-md border bg-card p-4">
            <div className="text-xs text-muted-foreground">Custo parado</div>
            <div className="text-2xl font-medium tabular-nums">{formatBRL(totalValor)}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <FilterInput
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por devolução, pedido, NF, SKU ou produto"
              className="pl-9"
            />
          </div>
          <span className="text-xs text-muted-foreground ml-auto">
            {filtrados.length} {filtrados.length === 1 ? "devolução" : "devoluções"}
          </span>
        </div>

        <div className="rounded-md border bg-card">
          <Table containerClassName="overflow-visible">
            <TableHeader>
              <TableRow className={LINHA_CABECALHO_COLADO}>
                <CabecalhoOrdenavel
                  rotulo="Devolução"
                  className="w-[210px]"
                  dir={ordenacao?.coluna === "devolucao" ? ordenacao.dir : null}
                  onOrdenar={() => ordenarPor("devolucao")}
                />
                <CabecalhoOrdenavel
                  rotulo="NF de saída"
                  className="w-[130px]"
                  dir={ordenacao?.coluna === "nf" ? ordenacao.dir : null}
                  onOrdenar={() => ordenarPor("nf")}
                />
                <CabecalhoOrdenavel
                  rotulo="Motivo"
                  dir={ordenacao?.coluna === "motivo" ? ordenacao.dir : null}
                  onOrdenar={() => ordenarPor("motivo")}
                />
                <CabecalhoOrdenavel
                  rotulo="Devolvido em"
                  className="w-[130px]"
                  dir={ordenacao?.coluna === "devolvido_em" ? ordenacao.dir : null}
                  onOrdenar={() => ordenarPor("devolvido_em")}
                />
                <CabecalhoOrdenavel
                  rotulo="Esperando"
                  className="w-[110px] text-right"
                  alinharDireita
                  dir={ordenacao?.coluna === "esperando" ? ordenacao.dir : null}
                  onOrdenar={() => ordenarPor("esperando")}
                />
                <CabecalhoOrdenavel
                  rotulo="Unidades"
                  className="w-[110px] text-right"
                  alinharDireita
                  dir={ordenacao?.coluna === "unidades" ? ordenacao.dir : null}
                  onOrdenar={() => ordenarPor("unidades")}
                />
                <CabecalhoOrdenavel
                  rotulo="Custo pendente"
                  className="w-[130px] text-right"
                  alinharDireita
                  dir={ordenacao?.coluna === "custo" ? ordenacao.dir : null}
                  onOrdenar={() => ordenarPor("custo")}
                />
                <TableHead className="w-[130px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : filtrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <PackageCheck className="h-5 w-5 mx-auto mb-2 opacity-60" />
                    Nenhuma devolução aguardando conferência.
                  </TableCell>
                </TableRow>
              ) : (
                paginaItens.map((p) => (
                  <TableRow key={p.devolucao_id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{p.devolucao_numero ?? "—"}</span>
                        {p.canal === "b2c" && (
                          <Badge variant="outline" className="font-normal">B2C</Badge>
                        )}
                        {p.tipo === "parcial" && (
                          <Badge variant="outline" className="font-normal">Parcial</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Pedido {p.id_externo ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.nf ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">
                      {p.motivo ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{formatDateBR(p.devolvido_em)}</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-normal tabular-nums",
                          (p.dias_esperando ?? 0) >= 30
                            ? "bg-destructive/10 text-destructive border-destructive/20"
                            : (p.dias_esperando ?? 0) >= 7
                              ? "bg-warning/10 text-warning border-warning/20"
                              : "bg-muted text-muted-foreground border-border",
                        )}
                      >
                        {formatNum(p.dias_esperando)} d
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatNum(p.unidades_pendentes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBRL(p.valor_custo_pendente)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" className="gap-2" onClick={() => setSelecionado(p)}>
                        <Undo2 className="h-4 w-4" />
                        Conferir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <RodapePaginacao
          total={ordenados.length}
          pagina={paginaAtual}
          tamanhoPagina={tamanhoPagina}
          chavePreferencia={CHAVE_PAGINA_DEVOLUCAO}
          onPagina={setPagina}
          onTamanhoPagina={(n) => setTamanhoPagina(n as PageSizeOption)}
        />
      </div>
    </PageShell>
  );
}
