import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CardIndicador } from "@/components/ui/card-indicador";
import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { TabelaFetely } from "@/components/ui/tabela-fetely";
import {
  RodapePaginacao,
  DEFAULT_PAGE_SIZE,
  type PageSizeOption,
} from "@/components/tabela/RodapePaginacao";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ParaQueServe } from "@/components/compras/ParaQueServe";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SELECT_PENDENCIAS,
  TIPOS_PENDENCIA,
  totalPendencia,
  type PendenciaPedido,
  type TipoPendencia,
} from "@/lib/compras/pendencias";

interface XpmCadItem {
  codigo_material: string | null;
  descricao: string | null;
  numero_pedido: string | null;
  ncm: string | null;
  peso_liquido: number | null;
  codigo_barras: string | null;
  qtd_pedida: number | null;
  declarado_incompleto: boolean | null;
}

/** Célula que fica em tom de atenção quando o dado que falta declarar está vazio ou zerado. */
function CelulaFalta({ valor }: { valor: string | number | null | undefined }) {
  const vazio =
    valor === null ||
    valor === undefined ||
    valor === "" ||
    (typeof valor === "number" && valor === 0) ||
    (typeof valor === "string" && Number(valor) === 0 && valor.trim() !== "");
  if (vazio) return <span className="text-warning">falta declarar</span>;
  return <span>{valor}</span>;
}

interface NfSemEntrada {
  pedido_id: number | null;
  numero_pedido: string | null;
  pedido_ref_xpm: string | null;
  nf_numero: string | null;
  nf_serie: string | null;
  data_emissao: string | null;
  fornecedor: string | null;
  valor: number | null;
  centro_sugerido: string | null;
  centro_pela_nf: boolean | null;
  embarque_ref: string | null;
  data_chegada: string | null;
  dias_parada: number | null;
  rota_recebimento: string | null;
}

const fmtD = (d: string | null) => {
  if (!d) return "—";
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${dd}/${m}/${y}`;
};

function NfsSemEntrada({
  pedidoFiltro,
  seletorPedido,
}: {
  pedidoFiltro: string;
  seletorPedido: JSX.Element;
}) {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);
  const q = useQuery({
    queryKey: ["vw_compras_nf_sem_entrada"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_compras_nf_sem_entrada")
        .select("*")
        .order("dias_parada", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as NfSemEntrada[];
    },
  });
  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (q.data ?? [])
      .filter((r) => pedidoFiltro === "todos" || String(r.pedido_id) === pedidoFiltro)
      .filter(
        (r) =>
          !termo ||
          (r.numero_pedido ?? "").toLowerCase().includes(termo) ||
          (r.nf_numero ?? "").toLowerCase().includes(termo),
      )
      .sort((a, b) => Number(b.dias_parada ?? 0) - Number(a.dias_parada ?? 0));
  }, [q.data, pedidoFiltro, busca]);

  useEffect(() => {
    setPagina(1);
  }, [busca, pedidoFiltro, tamanho]);

  const totalPaginas = Math.max(1, Math.ceil(linhas.length / tamanho));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const naPagina = linhas.slice((paginaAtual - 1) * tamanho, paginaAtual * tamanho);

  const receber = (r: NfSemEntrada) => {
    if (r.rota_recebimento) {
      navigate(`${r.rota_recebimento}&pedido_ref=${encodeURIComponent(r.pedido_ref_xpm ?? "")}`);
    } else {
      navigate(`/vendas/produto/chegada-mercadoria/${r.pedido_id}`);
    }
  };

  return (
    <TabelaFetely
      busca={{ valor: busca, aoMudar: setBusca, placeholder: "Buscar pedido ou NF…" }}
      filtros={seletorPedido}
      carregando={q.isLoading}
      erro={q.error ? (q.error as Error).message : null}
      aoTentarNovamente={() => void q.refetch()}
      vazio={{ mensagem: "Nenhuma NF parada. Toda NF de compra lançada já teve entrada no estoque." }}
      semResultado="Nenhuma NF para esse filtro."
      total={q.data?.length ?? 0}
      exibidos={linhas.length}
      rotulo="NFs"
    >
      <>
        <div className="overflow-auto max-h-[calc(100vh-18rem)] rounded-md border">
          <Table containerClassName="overflow-visible">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>NF</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Centro</TableHead>
              <TableHead>Embarque</TableHead>
              <TableHead>Chegada</TableHead>
              <TableHead>Parada</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {naPagina.map((r, i) => (
              <TableRow key={`${r.pedido_id}-${r.nf_numero}-${r.nf_serie}-${i}`}>
                <TableCell className="font-medium">{r.numero_pedido ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.nf_numero ?? "—"}
                  {r.nf_serie ? `/${r.nf_serie}` : ""}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{fmtD(r.data_emissao)}</TableCell>
                <TableCell className="max-w-[200px] truncate">{r.fornecedor ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {r.valor == null
                    ? "—"
                    : Number(r.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </TableCell>
                <TableCell>
                  <div>{r.centro_sugerido ?? "—"}</div>
                  {r.centro_sugerido && (
                    <div className="text-[11px] text-muted-foreground">
                      {r.centro_pela_nf ? "pela NF" : "do pedido"}
                    </div>
                  )}
                </TableCell>
                <TableCell>{r.embarque_ref ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{fmtD(r.data_chegada)}</TableCell>
                <TableCell
                  className={cn("whitespace-nowrap tabular-nums", Number(r.dias_parada ?? 0) > 7 && "text-warning-strong")}
                >
                  {r.dias_parada ?? 0} dias
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => receber(r)}>
                    Receber
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <RodapePaginacao
        total={linhas.length}
        pagina={paginaAtual}
        tamanhoPagina={tamanho}
        tela="pendencias_nfs_sem_entrada"
        onPagina={setPagina}
        onTamanhoPagina={(n) => setTamanho(n as PageSizeOption)}
      />
      </>
    </TabelaFetely>
  );
}

export default function PendenciasTab() {
  const [params, setParams] = useSearchParams();

  const tipoUrl = params.get("tipo") as TipoPendencia | null;
  const tipo: TipoPendencia = TIPOS_PENDENCIA.some((t) => t.tipo === tipoUrl)
    ? (tipoUrl as TipoPendencia)
    : "codigos_sem_sku";
  const pedidoFiltro = params.get("pedido") ?? "todos";
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);

  const setTipo = (t: TipoPendencia) => {
    const next = new URLSearchParams(params);
    next.set("aba", "pendencias");
    next.set("tipo", t);
    setParams(next, { replace: true });
  };

  const setPedido = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("aba", "pendencias");
    if (v === "todos") next.delete("pedido");
    else next.set("pedido", v);
    setParams(next, { replace: true });
  };

  const irParaRateio = (numeroPedido: string | null) => {
    const next = new URLSearchParams(params);
    next.set("aba", "rateio-nf");
    if (numeroPedido) next.set("pedido_numero", numeroPedido);
    setParams(next);
  };

  const pendenciasQ = useQuery({
    queryKey: ["compras-pendencias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_compras_pendencias" as never)
        .select(SELECT_PENDENCIAS);
      if (error) throw error;
      return (data ?? []) as unknown as PendenciaPedido[];
    },
  });

  const pendencias = useMemo(() => pendenciasQ.data ?? [], [pendenciasQ.data]);

  const totais = useMemo(() => {
    const acc: Record<TipoPendencia, number> = {
      codigos_sem_sku: 0,
      nf_linhas_sem_custo: 0,
      ficha_xpm_incompleta: 0,
      nfs_sem_entrada: 0,
    };
    pendencias.forEach((p) => {
      TIPOS_PENDENCIA.forEach((t) => {
        acc[t.tipo] += totalPendencia(p, t.tipo);
      });
    });
    return acc;
  }, [pendencias]);

  // Pedidos que aparecem no seletor: os que têm alguma pendência do tipo escolhido.
  const pedidosDoTipo = useMemo(
    () =>
      pendencias
        .filter((p) => totalPendencia(p, tipo) > 0)
        .sort((a, b) => (b.numero_pedido ?? "").localeCompare(a.numero_pedido ?? "")),
    [pendencias, tipo],
  );

  const numeroPedidoFiltro = useMemo(() => {
    if (pedidoFiltro === "todos") return null;
    return (
      pendencias.find((p) => String(p.pedido_id) === pedidoFiltro)?.numero_pedido ?? null
    );
  }, [pendencias, pedidoFiltro]);

  const filaPedidos = useMemo(() => {
    const alvo = pedidoFiltro === "todos" ? pedidosDoTipo : pedidosDoTipo.filter((p) => String(p.pedido_id) === pedidoFiltro);
    const termo = busca.trim().toLowerCase();
    if (!termo) return alvo;
    return alvo.filter((p) => (p.numero_pedido ?? "").toLowerCase().includes(termo));
  }, [pedidosDoTipo, pedidoFiltro, busca]);

  const xpmQ = useQuery({
    enabled: tipo === "ficha_xpm_incompleta",
    queryKey: ["compras-pendencias-xpm", numeroPedidoFiltro],
    queryFn: async () => {
      let q = supabase
        .from("vw_xpm_cad_item" as never)
        .select(
          "codigo_material, descricao, numero_pedido, ncm, peso_liquido, codigo_barras, qtd_pedida, declarado_incompleto",
        )
        .eq("declarado_incompleto", true)
        .limit(1000);
      if (numeroPedidoFiltro) q = q.eq("numero_pedido", numeroPedidoFiltro);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as XpmCadItem[];
    },
  });

  const itensXpm = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = xpmQ.data ?? [];
    if (!termo) return base;
    return base.filter(
      (i) =>
        (i.codigo_material ?? "").toLowerCase().includes(termo) ||
        (i.descricao ?? "").toLowerCase().includes(termo) ||
        (i.numero_pedido ?? "").toLowerCase().includes(termo),
    );
  }, [xpmQ.data, busca]);

  
  useEffect(() => {
    setPagina(1);
  }, [tipo, pedidoFiltro, busca, tamanho]);

  const totalDoTipo = totais[tipo];

  const totalPaginasXpm = Math.max(1, Math.ceil(itensXpm.length / tamanho));
  const paginaAtualXpm = Math.min(pagina, totalPaginasXpm);
  const naPaginaXpm = itensXpm.slice((paginaAtualXpm - 1) * tamanho, paginaAtualXpm * tamanho);

  const totalPaginasPedidos = Math.max(1, Math.ceil(filaPedidos.length / tamanho));
  const paginaAtualPedidos = Math.min(pagina, totalPaginasPedidos);
  const naPaginaPedidos = filaPedidos.slice(
    (paginaAtualPedidos - 1) * tamanho,
    paginaAtualPedidos * tamanho,
  );

  const seletorPedido = (
    <Select value={pedidoFiltro} onValueChange={setPedido}>
      <SelectTrigger className="w-[240px]">
        <SelectValue placeholder="Todos os pedidos" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todos">Todos os pedidos</SelectItem>
        {pedidosDoTipo.map((p) => (
          <SelectItem key={p.pedido_id} value={String(p.pedido_id)}>
            {p.numero_pedido ?? `#${p.pedido_id}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <ParaQueServe>
        O que falta para a mercadoria entrar certo no estoque. Escolha o tipo de trabalho e resolva.
      </ParaQueServe>
      {/* Tipo de trabalho é a dimensão principal. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TIPOS_PENDENCIA.map((t) => {
          const ativo = t.tipo === tipo;
          const n = totais[t.tipo];
          return (
            <button
              key={t.tipo}
              type="button"
              onClick={() => setTipo(t.tipo)}
              className="text-left"
              aria-label={`Ver pendências de ${t.rotulo}`}
              aria-pressed={ativo}
            >
              <CardIndicador
                rotulo={t.rotulo}
                valor={pendenciasQ.isLoading ? "—" : n}
                nota={t.descricao}
                tom={n > 0 ? "atencao" : "neutro"}
                ativo={ativo}
                adorno={ativo ? <Selo estado="info">Selecionado</Selo> : undefined}
                className={cn(!ativo && "hover:bg-muted/50 transition-colors")}
              />
            </button>
          );
        })}
      </div>


      {tipo === "nfs_sem_entrada" ? (
        <NfsSemEntrada pedidoFiltro={pedidoFiltro} seletorPedido={seletorPedido} />
      ) : tipo === "ficha_xpm_incompleta" ? (
        <TabelaFetely
          busca={{ valor: busca, aoMudar: setBusca, placeholder: "Buscar código, descrição, pedido…" }}
          filtros={seletorPedido}
          carregando={xpmQ.isLoading || pendenciasQ.isLoading}
          erro={xpmQ.error ? (xpmQ.error as Error).message : null}
          aoTentarNovamente={() => void xpmQ.refetch()}
          vazio={{
            mensagem:
              "Nenhuma ficha XPM incompleta. Quando faltar NCM, peso líquido, código de barras ou quantidade, o item cai aqui para você declarar.",
          }}

          semResultado="Nenhum item para esse filtro."
          total={xpmQ.data?.length ?? 0}
          exibidos={itensXpm.length}
          rotulo="itens"
        >
          <>
            <div className="overflow-auto max-h-[calc(100vh-18rem)] rounded-md border">
              <Table containerClassName="overflow-visible">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>NCM</TableHead>
                  <TableHead className="text-right">Peso líquido</TableHead>
                  <TableHead>Código de barras</TableHead>
                  <TableHead className="text-right">Qtd. pedida</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {naPaginaXpm.map((i, idx) => (
                  <TableRow key={`${i.codigo_material}-${i.numero_pedido}-${idx}`}>
                    <TableCell className="font-medium">{i.codigo_material ?? "—"}</TableCell>
                    <TableCell className="max-w-[280px] truncate">{i.descricao ?? "—"}</TableCell>
                    <TableCell>{i.numero_pedido ?? "—"}</TableCell>
                    <TableCell>
                      <CelulaFalta valor={i.ncm} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <CelulaFalta valor={i.peso_liquido} />
                    </TableCell>
                    <TableCell>
                      <CelulaFalta valor={i.codigo_barras} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <CelulaFalta valor={i.qtd_pedida} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
            <RodapePaginacao
              total={itensXpm.length}
              pagina={paginaAtualXpm}
              tamanhoPagina={tamanho}
              tela="pendencias_ficha_xpm_incompleta"
              onPagina={setPagina}
              onTamanhoPagina={(n) => setTamanho(n as PageSizeOption)}
            />
          </>
        </TabelaFetely>
      ) : (
        <TabelaFetely
          busca={{ valor: busca, aoMudar: setBusca, placeholder: "Buscar pedido…" }}
          filtros={seletorPedido}
          carregando={pendenciasQ.isLoading}
          erro={pendenciasQ.error ? (pendenciasQ.error as Error).message : null}
          aoTentarNovamente={() => void pendenciasQ.refetch()}
          vazio={{
            mensagem:
              tipo === "codigos_sem_sku"
                ? "Nenhum código de fornecedor sem SKU. Quando uma NF trouxer código novo, resolva o de-para na aba “Rateio de NF”."
                : "Nenhuma linha de NF sem custo. Se alguma nota chegar sem valor de item, vincule o custo na aba “Rateio de NF”.",
          }}

          semResultado="Nenhum pedido para esse filtro."
          total={totalDoTipo > 0 ? pedidosDoTipo.length : 0}
          exibidos={filaPedidos.length}
          rotulo="pedidos"
        >
          <>
            <div className="overflow-auto max-h-[calc(100vh-18rem)] rounded-md border">
              <Table containerClassName="overflow-visible">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead className="text-right">Pendentes</TableHead>
                    <TableHead className="w-32" />
                  </TableRow>
                </TableHeader>
              <TableBody>
                {naPaginaPedidos.map((p) => (
                  <TableRow key={p.pedido_id}>
                    <TableCell className="font-medium">
                      {p.numero_pedido ?? `#${p.pedido_id}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-warning">
                      {totalPendencia(p, tipo)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => irParaRateio(p.numero_pedido)}
                      >
                        Resolver
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
            <RodapePaginacao
              total={filaPedidos.length}
              pagina={paginaAtualPedidos}
              tamanhoPagina={tamanho}
              tela={`pendencias_${tipo}`}
              onPagina={setPagina}
              onTamanhoPagina={(n) => setTamanho(n as PageSizeOption)}
            />
          </>
        </TabelaFetely>
      )}
    </div>
  );
}
