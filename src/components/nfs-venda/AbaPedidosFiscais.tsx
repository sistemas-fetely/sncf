import { TabelaPedidosFiscais } from "./TabelaPedidosFiscais";
import { usePedidosFiscais } from "./usePedidosFiscais";
import { useMemo } from "react";
import { Search } from "lucide-react";
import { useEstadoTela, useFocoAoVoltar, useRestaurarScroll } from "@/lib/navegacao";
import { usePreferenciaTela } from "@/hooks/usePreferenciaTela";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FilterInput } from "@/components/ui/filter-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filtrarPedidosFiscais, ordenarPedidosFiscais, type ColunaFiscal } from "./pedidosFiscais";

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
  const [nav, setNav] = useEstadoTela({ busca: "", situacao: "todas", mes: "todos", nf: "todas", ordem: "data_pedido:desc", pagina: 1 }, { prefixo: "pf" });
  const { preferencias, salvar } = usePreferenciaTela(PREFERENCIA, { tamanho_pagina: 20 });
  const tamanhoPagina = preferencias.tamanho_pagina;
  const { data: pedidos = [], isLoading, error } = usePedidosFiscais();
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
    <TabelaPedidosFiscais itens={itens} isLoading={isLoading} error={error} total={filtrados.length} pagina={pagina} tamanhoPagina={tamanhoPagina} coluna={coluna} direcao={direcao} ordenar={ordenar} chavePreferencia={PREFERENCIA} onPagina={(pagina) => setNav({ pagina })} onTamanhoPagina={(tamanho_pagina) => { salvar({ tamanho_pagina }); setNav({ pagina: 1 }); }} />
  </>;
}
