import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarClock, SplitSquareHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useCapturasPedido,
  useProvisoesCaptura,
  rotuloCaptura,
  type CapturaCartao,
} from "@/hooks/pedidos/useCapturasPedido";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { DividirCartoesDialog } from "@/components/pedidos/dialogs/DividirCartoesDialog";

interface ProvisaoCaixa {
  provisao_id: string;
  numero_parcela: number;
  total_parcelas: number | null;
  valor_provisao: number | null;
  data_prevista: string | null;
  tipo_pagamento: string | null;
  eh_entrada: boolean | null;
  adiantado_no_pedido: number | null;
  coberta_por_adiantamento: boolean | null;
  valor_a_receber: number | null;
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d?: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—";

function BadgeStatusProvisao({ coberta }: { coberta?: boolean | null }) {
  if (coberta) {
    return (
      <Badge variant="outline" className="border-success/40 text-success">
        Paga por adiantamento
      </Badge>
    );
  }
  return <Badge variant="outline" className="border-info/40 text-info">Prevista</Badge>;
}

export function usePlanoRecebimento(pedidoId: string) {
  return useQuery({
    queryKey: ["provisao-caixa", pedidoId],
    queryFn: async (): Promise<ProvisaoCaixa[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_provisao_caixa")
        .select(
          "provisao_id, numero_parcela, total_parcelas, valor_provisao, data_prevista, tipo_pagamento, eh_entrada, adiantado_no_pedido, coberta_por_adiantamento, valor_a_receber",
        )
        .eq("pedido_id", pedidoId)
        .order("numero_parcela");
      if (error) throw error;
      return (data ?? []) as ProvisaoCaixa[];
    },
    enabled: !!pedidoId,
  });
}

export function PlanoRecebimentoCard({
  pedidoId,
  compacto = false,
}: { pedidoId: string; compacto?: boolean }) {
  const { data, isLoading, isError, error } = usePlanoRecebimento(pedidoId);
  // CAPTURA-DE-CARTAO (22/09/2026): um pedido pode ter N capturas (cliente paga
  // com mais de um cartão). As parcelas de cada captura são REPASSES daquela
  // captura — por isso a lista mostra a qual cartão cada parcela pertence.
  const capturasQ = useCapturasPedido(pedidoId);
  const provisoesQ = useProvisoesCaptura(pedidoId);
  const permDinheiro = usePermissaoAcaoOuSuperAdmin("acao.pedido_dinheiro");
  const permCobranca = usePermissaoAcaoOuSuperAdmin("acao.cobranca_receber");
  const [dividirAberto, setDividirAberto] = useState(false);

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (isError) {
    return (
      <p className="text-xs text-destructive">
        Erro ao carregar plano de recebimento: {(error as any)?.message ?? "falha desconhecida"}
      </p>
    );
  }
  if (!data || data.length === 0) return null;

  const capturas = capturasQ.data ?? [];
  const provisoes = provisoesQ.data ?? [];
  const capturaPorId = new Map<string, CapturaCartao>(capturas.map((c) => [c.id, c]));
  const capturaDaProvisao = new Map<string, CapturaCartao | undefined>(
    provisoes.map((pr) => [pr.id, pr.captura_id ? capturaPorId.get(pr.captura_id) : undefined]),
  );
  const linhasCartao = provisoes.filter(
    (pr) => (pr.tipo_pagamento ?? "").toLowerCase() === "cartao",
  );
  const algumCartaoPago = linhasCartao.some((pr) => !!pr.pago_em);
  const totalCartao = linhasCartao.reduce((acc, pr) => acc + pr.valor, 0);
  const podeExecutar = permDinheiro.permitido || permCobranca.permitido;
  const carregandoPerm = permDinheiro.carregando && permCobranca.carregando;
  const podeDividir = linhasCartao.length > 0 && !algumCartaoPago;

  const selo = (c?: CapturaCartao) =>
    c ? (
      <Badge variant="outline" className="text-[9px] h-4 px-1">
        Cartão {c.ordem ?? "—"}
      </Badge>
    ) : null;

  const jaRecebido = data
    .filter((p) => p.coberta_por_adiantamento)
    .reduce((acc, p) => acc + Number(p.valor_provisao ?? 0), 0);
  const aReceber = data.reduce((acc, p) => acc + Number(p.valor_a_receber ?? 0), 0);
  const temAdiantamento = jaRecebido > 0.005;

  const valorClasse = (coberta?: boolean | null) =>
    cn("font-medium", coberta && "line-through text-muted-foreground font-normal");

  const linhas = (
    <div className="space-y-2">
      {compacto ? (
        <div className="space-y-2">
          {data.map((p) => (
            <div key={p.provisao_id} className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 last:border-0 last:pb-0">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs">{p.numero_parcela}/{p.total_parcelas ?? data.length}</span>
                  {p.eh_entrada && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-success/40 text-success">entrada</Badge>
                  )}
                  {selo(capturaDaProvisao.get(p.provisao_id))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.tipo_pagamento ?? "—"} · {fmtDate(p.data_prevista)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={cn("text-sm", valorClasse(p.coberta_por_adiantamento))}>
                  {fmtBRL.format(Number(p.valor_provisao ?? 0))}
                </p>
                <BadgeStatusProvisao coberta={p.coberta_por_adiantamento} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parcela</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento previsto</TableHead>
                <TableHead>Tipo de pagamento</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p, i) => {
                const captura = capturaDaProvisao.get(p.provisao_id);
                const anterior = i > 0 ? capturaDaProvisao.get(data[i - 1].provisao_id) : undefined;
                const abreGrupo = !!captura && anterior?.id !== captura.id;
                return (
                <Fragment key={p.provisao_id}>
                {abreGrupo && captura && (
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell colSpan={5} className="py-1.5 text-xs font-medium">
                      {rotuloCaptura(captura)}
                      {captura.nsu && (
                        <span className="ml-2 font-normal text-muted-foreground">NSU {captura.nsu}</span>
                      )}
                    </TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell className="font-mono text-xs">
                    {p.numero_parcela}/{p.total_parcelas ?? data.length}
                    {p.eh_entrada && (
                      <Badge variant="outline" className="ml-2 border-success/40 text-success">Entrada</Badge>
                    )}
                    <span className="ml-2 inline-flex">{selo(captura)}</span>
                  </TableCell>
                  <TableCell className={valorClasse(p.coberta_por_adiantamento)}>
                    {fmtBRL.format(Number(p.valor_provisao ?? 0))}
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(p.data_prevista)}</TableCell>
                  <TableCell className="text-sm">{p.tipo_pagamento ?? "—"}</TableCell>
                  <TableCell><BadgeStatusProvisao coberta={p.coberta_por_adiantamento} /></TableCell>
                </TableRow>
                </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {temAdiantamento && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Já recebido (adiantamento)</span>
          <span className="font-medium text-success">
            {fmtBRL.format(jaRecebido)}
          </span>
        </div>
      )}
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Ainda a receber</span>
        <span className="font-medium">{fmtBRL.format(aReceber)}</span>
      </div>

      {podeDividir && (
        <div className="pt-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={carregandoPerm || !podeExecutar}
                  onClick={() => setDividirAberto(true)}
                >
                  <SplitSquareHorizontal className="h-3.5 w-3.5" />
                  Dividir entre cartões
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {podeExecutar
                ? "Reescreve o plano de cartão em N capturas, cada uma com seu NSU."
                : "Requer a ação acao.pedido_dinheiro ou acao.cobranca_receber."}
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {dividirAberto && (
        <DividirCartoesDialog
          pedidoId={pedidoId}
          totalCartao={totalCartao}
          aberto
          aoFechar={() => setDividirAberto(false)}
        />
      )}
    </div>
  );

  if (compacto) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" />
          Plano de Recebimento (provisões)
        </p>
        {linhas}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          Plano de Recebimento (provisões)
        </CardTitle>
      </CardHeader>
      <CardContent>{linhas}</CardContent>
    </Card>
  );
}
