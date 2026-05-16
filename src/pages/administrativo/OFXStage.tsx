import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, X, Loader2, ArrowLeftRight, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ContaBancaria = { id: string; nome_exibicao: string };

type TransacaoOFX = {
  id: string;
  data_transacao: string;
  valor: number;
  descricao: string;
  tipo: string | null;
  conta_bancaria_id: string;
  status: string;
};

export default function OFXStage() {
  const qc = useQueryClient();
  const [contaBancariaId, setContaBancariaId] = useState<string>("");
  const [acaoEmCurso, setAcaoEmCurso] = useState<string | null>(null);
  const [ofxIgnorar, setOfxIgnorar] = useState<TransacaoOFX | null>(null);

  const { data: contas } = useQuery({
    queryKey: ["contas-bancarias-ofx-stage"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("contas_bancarias")
        .select("id, nome_exibicao, tipo")
        .eq("ativo", true)
        .eq("tipo", "corrente")
        .order("nome_exibicao");
      return (data || []) as ContaBancaria[];
    },
  });

  const { data: transacoesOFX = [], isLoading: loadingOFX } = useQuery({
    queryKey: ["ofx-transacoes-pendentes", contaBancariaId],
    enabled: !!contaBancariaId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("ofx_transacoes_stage")
        .select("id, data_transacao, valor, descricao, tipo, conta_bancaria_id, status")
        .eq("conta_bancaria_id", contaBancariaId)
        .eq("status", "pendente")
        .order("data_transacao", { ascending: false });
      return (data || []) as TransacaoOFX[];
    },
  });

  async function handleIgnorar(ofx: TransacaoOFX) {
    setAcaoEmCurso("ignorar:" + ofx.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("ignorar_ofx", {
        p_ofx_id: ofx.id,
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.erro || "Erro");
        return;
      }
      toast.success("Ignorada");
      qc.invalidateQueries({ queryKey: ["ofx-transacoes-pendentes"] });
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      const msg = err?.message || err?.details || err?.hint ||
        (e instanceof Error ? e.message : null) || JSON.stringify(e);
      console.error("[OFXStage] erro:", e);
      toast.error("Erro: " + msg);
    } finally {
      setAcaoEmCurso(null);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-admin" />
          OFX em Stage
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Transações OFX importadas e ainda não conciliadas.
        </p>
      </div>

      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 flex items-center justify-between gap-3">
        <div className="text-xs text-blue-900">
          <strong>Conciliação migrou.</strong> Para vincular essas transações às CPRs, acesse o fluxo de
          {" "}<strong>Stage 2</strong> em Conciliação.
        </div>
        <Button asChild size="sm" variant="outline" className="border-blue-300 text-blue-800 hover:bg-blue-100">
          <Link to="/administrativo/conciliacao/stage-2" className="flex items-center gap-1">
            Ir para Stage 2 <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs text-muted-foreground font-medium">Conta bancária:</span>
        <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
          <SelectTrigger className="h-8 text-xs w-auto min-w-[200px]">
            <SelectValue placeholder="Selecione a conta" />
          </SelectTrigger>
          <SelectContent>
            {(contas || []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nome_exibicao}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!contaBancariaId ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Layers className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Selecione uma conta bancária para ver as transações pendentes.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-blue-600" />
              Extrato OFX
              <Badge variant="outline" className="ml-1">{transacoesOFX.length}</Badge>
            </h2>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-[600px] overflow-y-auto">
            {loadingOFX ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : transacoesOFX.length === 0 ? (
              <div className="text-center py-12 text-xs text-muted-foreground">
                Nenhuma transação pendente. Importe um OFX em /administrativo/importar.
              </div>
            ) : (
              transacoesOFX.map((ofx) => {
                const eh_debito = ofx.valor < 0;
                const acao = acaoEmCurso === "ignorar:" + ofx.id;
                return (
                  <div
                    key={ofx.id}
                    className="p-2 border rounded text-xs border-zinc-200 hover:border-zinc-300"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{ofx.descricao}</div>
                        <div className="text-muted-foreground text-[10px]">{formatDateBR(ofx.data_transacao)}</div>
                      </div>
                      <div className={`font-mono font-semibold ${eh_debito ? "text-red-700" : "text-emerald-700"}`}>
                        {formatBRL(ofx.valor)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] gap-1 text-zinc-600"
                        onClick={() => setOfxIgnorar(ofx)}
                        disabled={acao}
                      >
                        {acao ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                        Ignorar
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!ofxIgnorar} onOpenChange={(open) => !open && setOfxIgnorar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ignorar transação?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {ofxIgnorar ? (
                <div>
                  <span className="font-medium block mt-2">{ofxIgnorar.descricao}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatBRL(ofxIgnorar.valor)} · {formatDateBR(ofxIgnorar.data_transacao)}
                  </span>
                </div>
              ) : <span />}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (ofxIgnorar) handleIgnorar(ofxIgnorar);
                setOfxIgnorar(null);
              }}
              className="bg-zinc-700 hover:bg-zinc-800 text-white"
            >
              Ignorar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
