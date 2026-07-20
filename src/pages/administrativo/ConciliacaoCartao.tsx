import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreditCard, Loader2, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Status = "exato" | "ajuste_provavel" | "divergente" | "sem_candidato";

type Sugestao = {
  ofx_id: string;
  ofx_data: string;
  ofx_valor: number;
  natureza: "CRED" | "DEB";
  bandeira: string;
  soma_grupo: number;
  n_parcelas: number;
  parcela_ids: string[];
  delta: number;
  status: Status;
};

type Parcela = {
  id: string;
  data_transacao: string;
  descricao: string;
  valor: number;
};

const STATUS_LABEL: Record<Status, string> = {
  exato: "Exato",
  ajuste_provavel: "Ajuste provável",
  divergente: "Divergente",
  sem_candidato: "Sem candidato",
};

const STATUS_CLASS: Record<Status, string> = {
  exato: "bg-emerald-100 text-emerald-800 border-emerald-300",
  ajuste_provavel: "bg-amber-100 text-amber-800 border-amber-300",
  divergente: "bg-red-100 text-red-800 border-red-300",
  sem_candidato: "bg-muted text-muted-foreground border-border",
};

const DISABLED_REASON: Partial<Record<Status, string>> = {
  divergente: "Soma das parcelas diverge do crédito — verifique os relatórios SafraPay do dia.",
  sem_candidato: "Nenhuma liquidação SafraPay deste dia bate com o crédito — importe o SafraPay Tipo 2 do período.",
};

export default function ConciliacaoCartao() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [processando, setProcessando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<Sugestao | null>(null);

  const { data: sugestoes = [], isLoading } = useQuery({
    queryKey: ["conciliacao-cartao-sugestoes"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("vw_conciliacao_cartao_sugestoes")
        .select("*");
      if (error) throw error;
      return (data || []) as Sugestao[];
    },
  });

  const kpi = useMemo(() => {
    const c = { exato: 0, ajuste_provavel: 0, divergente: 0, sem_candidato: 0 };
    for (const s of sugestoes) c[s.status]++;
    return c;
  }, [sugestoes]);

  async function executarRPC(s: Sugestao) {
    setProcessando(s.ofx_id);
    try {
      const { data, error } = await sb.rpc("conciliar_lote_cartao", {
        p_ofx_id: s.ofx_id,
        p_parcela_ids: s.parcela_ids,
      });
      if (error) throw error;

      const resp = (data ?? {}) as { ok?: boolean; error?: string; aviso?: string };
      if (resp.ok === true) {
        const base = `Conciliado: ${s.n_parcelas} parcela${s.n_parcelas > 1 ? "s" : ""} · ${formatBRL(s.ofx_valor)}`;
        toast.success(base, resp.aviso ? { description: resp.aviso } : undefined);
        qc.invalidateQueries({ queryKey: ["conciliacao-cartao-sugestoes"] });
        qc.invalidateQueries({ queryKey: ["extrato-inbox"] });
      } else {
        toast.error(resp.error || "Falha ao conciliar lote");
      }
    } catch (e) {
      toast.error("Erro ao conciliar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setProcessando(null);
      setConfirmar(null);
    }
  }

  async function onConciliar(s: Sugestao) {
    if (s.status === "ajuste_provavel") {
      setConfirmar(s);
      return;
    }
    await executarRPC(s);
  }

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6 max-w-[1400px]">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-admin" />
            Conciliação de Cartão
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Créditos de cartão no OFX vs. lotes de parcelas SafraPay. Confirme para conciliar o crédito com as parcelas correspondentes.
          </p>
        </div>

        {/* KPIs */}
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline" className={cn(STATUS_CLASS.exato, "font-medium")}>
            {kpi.exato} exato{kpi.exato === 1 ? "" : "s"}
          </Badge>
          <Badge variant="outline" className={cn(STATUS_CLASS.ajuste_provavel, "font-medium")}>
            {kpi.ajuste_provavel} com ajuste
          </Badge>
          <Badge variant="outline" className={cn(STATUS_CLASS.divergente, "font-medium")}>
            {kpi.divergente} divergente{kpi.divergente === 1 ? "" : "s"}
          </Badge>
          <Badge variant="outline" className={cn(STATUS_CLASS.sem_candidato, "font-medium")}>
            {kpi.sem_candidato} sem candidato
          </Badge>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Data</TableHead>
                  <TableHead>Valor OFX</TableHead>
                  <TableHead>Bandeira</TableHead>
                  <TableHead>Natureza</TableHead>
                  <TableHead>Parcelas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="h-4 w-4 animate-spin inline" />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && sugestoes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum crédito de cartão a conciliar — os créditos do OFX e as liquidações SafraPay do período já estão batidos.
                    </TableCell>
                  </TableRow>
                )}
                {sugestoes.map((s) => {
                  const isOpen = !!expanded[s.ofx_id];
                  const podeConciliar = s.status === "exato" || s.status === "ajuste_provavel";
                  const disabledReason = DISABLED_REASON[s.status];
                  const btn = (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!podeConciliar || processando === s.ofx_id}
                      onClick={() => onConciliar(s)}
                      className="gap-1"
                    >
                      {processando === s.ofx_id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Conciliar
                    </Button>
                  );
                  return (
                    <Fragment key={s.ofx_id}>
                      <TableRow className="cursor-pointer" onClick={() => setExpanded((e) => ({ ...e, [s.ofx_id]: !e[s.ofx_id] }))}>
                        <TableCell>
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{formatDateBR(s.ofx_data)}</TableCell>
                        <TableCell className="font-mono font-semibold whitespace-nowrap">{formatBRL(s.ofx_valor)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{s.bandeira || "—"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {s.natureza === "CRED" ? "Crédito" : "Débito"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {s.n_parcelas} parcela{s.n_parcelas === 1 ? "" : "s"} · soma {formatBRL(s.soma_grupo)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn(STATUS_CLASS[s.status], "text-xs font-medium")}>
                              {STATUS_LABEL[s.status]}
                            </Badge>
                            {Number(s.delta) !== 0 && (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                diferença {formatBRL(Math.abs(Number(s.delta)))}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {disabledReason ? (
                            <Tooltip>
                              <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
                              <TooltipContent><p className="max-w-xs">{disabledReason}</p></TooltipContent>
                            </Tooltip>
                          ) : btn}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <ParcelasRow ofxId={s.ofx_id} parcelaIds={s.parcela_ids} />
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <AlertDialog open={!!confirmar} onOpenChange={(v) => !v && setConfirmar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar conciliação com ajuste</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmar && (
                  <>
                    Este lote tem diferença de {formatBRL(Math.abs(Number(confirmar.delta)))} — provável mensalidade SafraPay PRO abatida do crédito. Conciliar mesmo assim?
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={!!processando}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={!!processando}
                onClick={(e) => {
                  e.preventDefault();
                  if (confirmar) void executarRPC(confirmar);
                }}
              >
                {processando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Conciliar mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

function ParcelasRow({ ofxId, parcelaIds }: { ofxId: string; parcelaIds: string[] }) {
  const { data: parcelas = [], isLoading } = useQuery({
    queryKey: ["conciliacao-cartao-parcelas", ofxId],
    queryFn: async () => {
      if (!parcelaIds?.length) return [] as Parcela[];
      const { data, error } = await sb
        .from("movimentacoes_bancarias")
        .select("id, data_transacao, descricao, valor")
        .in("id", parcelaIds)
        .order("valor", { ascending: true });
      if (error) throw error;
      return (data || []) as Parcela[];
    },
  });

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell />
      <TableCell colSpan={7} className="py-2">
        {isLoading ? (
          <div className="text-xs text-muted-foreground py-2"><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-2" />Carregando parcelas…</div>
        ) : parcelas.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">Nenhuma parcela encontrada.</div>
        ) : (
          <div className="space-y-1">
            {parcelas.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs gap-4 py-1 border-b border-border/40 last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-muted-foreground whitespace-nowrap">{formatDateBR(p.data_transacao)}</span>
                  <span className="truncate">{p.descricao}</span>
                </div>
                <span className="font-mono whitespace-nowrap">{formatBRL(Number(p.valor))}</span>
              </div>
            ))}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
