import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { TabelaFetely } from "@/components/ui/tabela-fetely";
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

export default function PendenciasTab() {
  const [params, setParams] = useSearchParams();

  const tipoUrl = params.get("tipo") as TipoPendencia | null;
  const tipo: TipoPendencia = TIPOS_PENDENCIA.some((t) => t.tipo === tipoUrl)
    ? (tipoUrl as TipoPendencia)
    : "codigos_sem_sku";
  const pedidoFiltro = params.get("pedido") ?? "todos";
  const [busca, setBusca] = useState("");

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

  const metaTipo = TIPOS_PENDENCIA.find((t) => t.tipo === tipo)!;
  const totalDoTipo = totais[tipo];

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
      {/* Tipo de trabalho é a dimensão principal. */}
      <div className="grid gap-3 sm:grid-cols-3">
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


      {tipo === "ficha_xpm_incompleta" ? (
        <TabelaFetely
          busca={{ valor: busca, aoMudar: setBusca, placeholder: "Buscar código, descrição, pedido…" }}
          filtros={seletorPedido}
          carregando={xpmQ.isLoading || pendenciasQ.isLoading}
          erro={xpmQ.error ? (xpmQ.error as Error).message : null}
          aoTentarNovamente={() => void xpmQ.refetch()}
          vazio={{ mensagem: "Nenhuma ficha XPM incompleta. Tudo declarado por aqui." }}
          semResultado="Nenhum item para esse filtro."
          total={xpmQ.data?.length ?? 0}
          exibidos={itensXpm.length}
          rotulo="itens"
        >
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
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
                {itensXpm.map((i, idx) => (
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
        </TabelaFetely>
      ) : (
        <TabelaFetely
          busca={{ valor: busca, aoMudar: setBusca, placeholder: "Buscar pedido…" }}
          filtros={seletorPedido}
          carregando={pendenciasQ.isLoading}
          erro={pendenciasQ.error ? (pendenciasQ.error as Error).message : null}
          aoTentarNovamente={() => void pendenciasQ.refetch()}
          vazio={{ mensagem: `Nenhuma pendência de ${metaTipo.rotulo.toLowerCase()}. Fila limpa.` }}
          semResultado="Nenhum pedido para esse filtro."
          total={totalDoTipo > 0 ? pedidosDoTipo.length : 0}
          exibidos={filaPedidos.length}
          rotulo="pedidos"
        >
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead className="text-right">Pendentes</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filaPedidos.map((p) => (
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
        </TabelaFetely>
      )}
    </div>
  );
}
