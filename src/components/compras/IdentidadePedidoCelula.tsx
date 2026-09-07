// Identidade humana do pedido de mercadoria.
// Fonte única: vw_compra_pedido_identidade (uma linha por pedido, chave pedido_id).
// Nada é recalculado aqui — a view já entrega rótulo, competência, categorias e busca.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, Layers } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface IdentidadePedido {
  pedido_id: number;
  identificacao: string | null;
  competencia: string | null;
  base_da_competencia: string | null;
  data_chegada_precisao: string | null;
  numero_pedido: string | null;
  categorias: string | null;
  categoria_principal: string | null;
  categoria_mista: boolean | null;
  status: string | null;
  numero_proforma: string | null;
  numero_invoice: string | null;
  numero_packing_list: string | null;
  processo_ref: string | null;
  busca: string | null;
}

const CAMPOS =
  "pedido_id, identificacao, competencia, base_da_competencia, data_chegada_precisao, numero_pedido, categorias, categoria_principal, categoria_mista, status, numero_proforma, numero_invoice, numero_packing_list, processo_ref, busca";

/** Mapa pedido_id → identidade. */
export function useIdentidadePedidos() {
  const q = useQuery({
    queryKey: ["compra-pedido-identidade"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_compra_pedido_identidade")
        .select(CAMPOS);
      if (error) throw error;
      return (data ?? []) as IdentidadePedido[];
    },
  });

  const porPedido = useMemo(() => {
    const m = new Map<number, IdentidadePedido>();
    (q.data ?? []).forEach((r) => m.set(Number(r.pedido_id), r));
    return m;
  }, [q.data]);

  return { ...q, porPedido };
}

const EXPLICACAO_BASE: Record<string, string> = {
  chegada: "Competência pela data de chegada da mercadoria",
  termo: "Competência pela data do termo de conferência (chegada não informada)",
  eta: "Competência pela ETA prevista",
  pedido: "Competência pela data do pedido (ainda não chegou)",
};

export function explicacaoCompetencia(id: IdentidadePedido | undefined): string {
  if (!id) return "Competência não disponível";
  const base = EXPLICACAO_BASE[id.base_da_competencia ?? ""] ?? "Origem da competência não informada";
  return id.data_chegada_precisao === "mes" ? `${base} · mês aproximado` : base;
}

/** Coluna "Número": competência discreta, número em destaque, categoria e status secundários. */
export function CelulaIdentidade({
  identidade,
  numeroCru,
}: {
  identidade: IdentidadePedido | undefined;
  numeroCru: string;
}) {
  if (!identidade) return <span className="font-medium">{numeroCru}</span>;

  const numero = identidade.numero_pedido ?? numeroCru;
  const mista = !!identidade.categoria_mista;

  return (
    <div className="min-w-[10rem] space-y-0.5">
      {identidade.competencia && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{identidade.competencia}</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex cursor-help"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={explicacaoCompetencia(identidade)}
                >
                  <Info className="h-3 w-3" aria-hidden="true" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{explicacaoCompetencia(identidade)}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      <div className="font-medium leading-tight">{numero}</div>

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {mista && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex cursor-help"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Pedido com mais de uma categoria"
                >
                  <Layers className="h-3 w-3 text-warning" aria-hidden="true" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Pedido com mais de uma categoria</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <span className={mista ? "font-medium" : undefined}>{identidade.categorias ?? "—"}</span>
        {identidade.status && <span aria-hidden="true">·</span>}
        {identidade.status && <span>{identidade.status}</span>}
      </div>
    </div>
  );
}

/** Coluna "Referências": números alternativos do pedido, só os preenchidos. */
export function CelulaReferencias({ identidade }: { identidade: IdentidadePedido | undefined }) {
  const itens: { rotulo: string; valor: string | null | undefined }[] = [
    { rotulo: "Proforma", valor: identidade?.numero_proforma },
    { rotulo: "Invoice", valor: identidade?.numero_invoice },
    { rotulo: "PL", valor: identidade?.numero_packing_list },
    { rotulo: "Processo", valor: identidade?.processo_ref },
  ];
  const preenchidos = itens.filter((i) => !!i.valor);

  if (preenchidos.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="space-y-0.5">
      {preenchidos.map((i) => (
        <div key={i.rotulo} className="text-xs leading-tight">
          <span className="text-muted-foreground">{i.rotulo}: </span>
          <span>{i.valor}</span>
        </div>
      ))}
    </div>
  );
}
