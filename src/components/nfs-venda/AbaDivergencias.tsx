import { useMemo } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterInput } from "@/components/ui/filter-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEstadoTela, useFocoAoVoltar, useRestaurarScroll } from "@/lib/navegacao";
import { usePreferenciaTela } from "@/hooks/usePreferenciaTela";
import { cn } from "@/lib/utils";
import { escolherFilaDivergencia, filtrarPedidosFiscais, ordenarPedidosFiscais, resumirDivergencias, type ColunaFiscal } from "./pedidosFiscais";
import { usePedidosFiscais } from "./usePedidosFiscais";
import { TabelaPedidosFiscais } from "./TabelaPedidosFiscais";

const PREFERENCIA = "nfs-venda.divergencias";
const COLUNAS: ColunaFiscal[] = ["numero", "numero_loja", "data_pedido", "dias_pedido", "cliente_nome", "valor_total", "situacao_label", "nf_numero", "pedido_sncf_ref"];
const moeda = (valor: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

export function AbaDivergencias() {
  const { data: pedidos = [], isLoading, error } = usePedidosFiscais();
  const [nav, setNav] = useEstadoTela({ fila: "", busca: "", mes: "todos", ordem: "dias_pedido:desc", pagina: 1 }, { prefixo: "dv" });
  const { preferencias, salvar } = usePreferenciaTela(PREFERENCIA, { tamanho_pagina: 20 });
  const tamanhoPagina = preferencias.tamanho_pagina;
  const fila = escolherFilaDivergencia(pedidos, nav.fila);
  const resumos = useMemo(() => resumirDivergencias(pedidos), [pedidos]);
  const meses = useMemo(() => Array.from(new Set(pedidos.map((p) => p.data_pedido?.slice(0, 7)).filter((v): v is string => Boolean(v)))).sort().reverse(), [pedidos]);
  const [col, dir] = nav.ordem.split(":");
  const coluna = COLUNAS.includes(col as ColunaFiscal) ? col as ColunaFiscal : "dias_pedido";
  const direcao = dir === "asc" ? "asc" : "desc";
  const filtrados = useMemo(() => ordenarPedidosFiscais(filtrarPedidosFiscais(pedidos.filter((p) => p.divergencia === fila), { busca: nav.busca, mes: nav.mes, nf: "todas", situacao: "todas" }), coluna, direcao), [pedidos, fila, nav.busca, nav.mes, coluna, direcao]);
  const pagina = Math.min(nav.pagina, Math.max(1, Math.ceil(filtrados.length / tamanhoPagina)));
  const itens = filtrados.slice((pagina - 1) * tamanhoPagina, pagina * tamanhoPagina);
  useFocoAoVoltar({ pronto: !isLoading, idsVisiveis: itens.map((p) => String(p.id)), focoParam: "dv_foco" });
  useRestaurarScroll(null, !isLoading);
  const ordenar = (nova: ColunaFiscal) => {
    const inicial = ["dias_pedido", "data_pedido", "valor_total", "numero"].includes(nova) ? "desc" : "asc";
    setNav({ ordem: `${nova}:${nova === coluna ? (direcao === "asc" ? "desc" : "asc") : inicial}`, pagina: 1 });
  };

  return <>
    <div className="mb-4 grid gap-4 sm:grid-cols-3">
      {resumos.map((r) => <Button key={r.codigo} type="button" variant="outline" aria-pressed={fila === r.codigo}
        onClick={() => setNav({ fila: r.codigo, pagina: 1 })}
        className={cn("h-full min-w-0 flex-col items-start justify-start whitespace-normal bg-card p-4 text-left", fila === r.codigo && "border-primary bg-primary/5 ring-1 ring-primary")}>
        <span className="text-sm font-medium">{r.titulo}</span>
        <span className="mt-1 text-xs font-normal text-muted-foreground">{r.descricao}</span>
        <span className="mt-3 text-2xl font-medium tabular-nums">{r.quantidade}</span>
        <span className="mt-1 text-sm font-normal tabular-nums text-muted-foreground">{moeda(r.valor)}</span>
      </Button>)}
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative min-w-0 flex-1 sm:min-w-[240px] max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <FilterInput value={nav.busca} onChange={(e) => setNav({ busca: e.target.value, pagina: 1 })} placeholder="Buscar por nº, pedido da loja ou cliente" className="pl-9" />
      </div>
      <Select value={nav.mes} onValueChange={(mes) => setNav({ mes, pagina: 1 })}>
        <SelectTrigger className="h-8 w-[170px]" aria-label="Mês"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="todos">Todos os meses</SelectItem>{meses.map((m) => <SelectItem key={m} value={m}>{new Date(m + "-01T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(" de ", "/")}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <TabelaPedidosFiscais comDias focoParam="dv_foco" vazio="Nenhuma divergência nesta fila." itens={itens} isLoading={isLoading} error={error} total={filtrados.length} pagina={pagina} tamanhoPagina={tamanhoPagina} coluna={coluna} direcao={direcao} ordenar={ordenar} chavePreferencia={PREFERENCIA} onPagina={(pagina) => setNav({ pagina })} onTamanhoPagina={(tamanho_pagina) => { salvar({ tamanho_pagina }); setNav({ pagina: 1 }); }} />
  </>;
}