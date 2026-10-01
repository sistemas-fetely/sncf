import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Minus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export const CHAVE_REGUA = (pedidoId: number) => ["vw_importacao_pedido_regua", pedidoId] as const;

type EstadoEtapa = "ok" | "pendente" | "aguardando" | "na";

export interface PedidoReguaRow {
  etapa_embarque: EstadoEtapa;
  etapa_nf: EstadoEtapa;
  etapa_traducao: EstadoEtapa;
  etapa_entrada: EstadoEtapa;
  embarques: number | null;
  embarques_chegados: number | null;
  nfs_ligadas: number | null;
  codigos_sem_sku: number | null;
  nf_linhas_sem_custo: number | null;
  ficha_xpm_incompleta: number | null;
  nfs_sem_entrada: number | null;
  alerta_embarque: "eta_vencida" | "entregue_sem_data" | null;
  exige_embarque: boolean | null;
}

export function usePedidoRegua(pedidoId: number) {
  return useQuery({
    queryKey: CHAVE_REGUA(pedidoId),
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_importacao_pedido_regua")
        .select(
          "etapa_embarque,etapa_nf,etapa_traducao,etapa_entrada,embarques,embarques_chegados,nfs_ligadas,codigos_sem_sku,nf_linhas_sem_custo,ficha_xpm_incompleta,nfs_sem_entrada,alerta_embarque,exige_embarque",
        )
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PedidoReguaRow | null;
    },
  });
}

interface Props {
  pedidoId: number;
  onIrSubAba: (sub: string) => void;
}

interface EtapaProps {
  rotulo: string;
  detalhe: string;
  estado: EstadoEtapa;
  onClick?: () => void;
}

function Etapa({ rotulo, detalhe, estado, onClick }: EtapaProps) {
  const Icon = estado === "ok"
    ? CheckCircle2
    : estado === "pendente"
      ? AlertTriangle
      : estado === "aguardando"
        ? Clock
        : Minus;
  const conteudo = (
    <>
      <Icon
        className={cn(
          "h-5 w-5 shrink-0",
          estado === "ok" && "text-success",
          estado === "pendente" && "text-warning",
          (estado === "aguardando" || estado === "na") && "text-muted-foreground",
        )}
      />
      <span className="min-w-0 text-left">
        <span className="block text-sm font-medium text-foreground">{rotulo}</span>
        <span className="block text-xs text-muted-foreground">{detalhe}</span>
      </span>
    </>
  );

  if (estado === "pendente" && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-14 w-full items-start gap-2 rounded-md p-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {conteudo}
      </button>
    );
  }
  return <div className="flex min-h-14 items-start gap-2 p-2">{conteudo}</div>;
}

export default function ReguaPedido({ pedidoId, onIrSubAba }: Props) {
  const navigate = useNavigate();
  const reguaQ = usePedidoRegua(pedidoId);

  if (reguaQ.isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }
  if (reguaQ.isError || !reguaQ.data) {
    return <p className="text-xs text-destructive">Não foi possível montar a régua</p>;
  }

  const r = reguaQ.data;
  const embarques = Number(r.embarques ?? 0);
  const embarquesChegados = Number(r.embarques_chegados ?? 0);
  const nfs = Number(r.nfs_ligadas ?? 0);
  const semSku = Number(r.codigos_sem_sku ?? 0);
  const semCusto = Number(r.nf_linhas_sem_custo ?? 0);
  const fichaXpm = Number(r.ficha_xpm_incompleta ?? 0);
  const semEntrada = Number(r.nfs_sem_entrada ?? 0);

  const detalheEmbarque = r.etapa_embarque === "na"
    ? "Pedido nacional"
    : r.etapa_embarque === "pendente"
      ? r.alerta_embarque === "eta_vencida"
        ? "ETA vencida — atualize o embarque"
        : r.alerta_embarque === "entregue_sem_data"
          ? "Entregue sem data de chegada"
          : embarques === 0
            ? "Sem embarque vinculado"
            : "Embarque requer atenção"
      : r.etapa_embarque === "aguardando"
        ? `${embarquesChegados} de ${embarques} chegou`
        : "Chegou";
  const detalheNf = r.etapa_nf === "ok"
    ? `${nfs} NF(s)`
    : r.etapa_nf === "pendente"
      ? "Nenhuma NF lançada"
      : r.etapa_nf === "na"
        ? "Não se aplica"
        : "Aguarda a chegada";
  const pendenciasTraducao = [
    semSku > 0 ? `${semSku} sem SKU` : null,
    semCusto > 0 ? `${semCusto} sem custo` : null,
    fichaXpm > 0 ? `${fichaXpm} ficha XPM` : null,
  ].filter(Boolean).join(" · ");
  const detalheTraducao = r.etapa_traducao === "ok"
    ? "Completa"
    : r.etapa_traducao === "pendente"
      ? pendenciasTraducao
      : r.etapa_traducao === "na"
        ? "Não se aplica"
        : "Aguarda NF";
  const detalheEntrada = r.etapa_entrada === "ok"
    ? "Tudo entrou"
    : r.etapa_entrada === "pendente"
      ? `${semEntrada} de ${nfs} NF(s) sem entrada`
      : r.etapa_entrada === "na"
        ? "Não se aplica"
        : "Aguarda NF";
  const primeiroTipo = semSku > 0
    ? "codigos_sem_sku"
    : semCusto > 0
      ? "nf_linhas_sem_custo"
      : "ficha_xpm_incompleta";

  const etapas: EtapaProps[] = [
    { rotulo: "Pedido", detalhe: "Cadastrado", estado: "ok" },
    {
      rotulo: "Embarque",
      detalhe: detalheEmbarque,
      estado: r.etapa_embarque,
      onClick: () => navigate("/vendas/produto/chegada-mercadoria?aba=painel&visao=embarque&furada=1"),
    },
    {
      rotulo: "NF",
      detalhe: detalheNf,
      estado: r.etapa_nf,
      onClick: () => onIrSubAba("documentos"),
    },
    {
      rotulo: "Tradução",
      detalhe: detalheTraducao,
      estado: r.etapa_traducao,
      onClick: () => navigate(`/vendas/produto/chegada-mercadoria?aba=pendencias&tipo=${primeiroTipo}&pedido=${pedidoId}`),
    },
    {
      rotulo: "Entrada no estoque",
      detalhe: detalheEntrada,
      estado: r.etapa_entrada,
      onClick: () => navigate(`/vendas/produto/chegada-mercadoria?aba=pendencias&tipo=nfs_sem_entrada&pedido=${pedidoId}`),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 rounded-md border bg-card p-2 md:grid-cols-5">
      {etapas.map((etapa, index) => (
        <div key={etapa.rotulo} className="relative min-w-0">
          {index > 0 && (
            <span aria-hidden className="absolute -left-2 top-7 hidden h-px w-2 bg-border md:block" />
          )}
          <Etapa {...etapa} />
        </div>
      ))}
    </div>
  );
}
