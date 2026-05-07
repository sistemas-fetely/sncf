import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, Settings2, Upload, CreditCard, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ImportadorNFs } from "@/components/financeiro/ImportadorNFs";
import { ImportadorOFX } from "@/components/financeiro/ImportadorOFX";
import { ImportadorItauPagamentos } from "@/components/financeiro/ImportadorItauPagamentos";
import { ImportarFaturaCartaoDialog } from "@/components/financeiro/ImportarFaturaCartaoDialog";

export default function ImportarDados() {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [importarFaturaOpen, setImportarFaturaOpen] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  

  const { data: config, refetch } = useQuery({
    queryKey: ["integracao-bling-status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("integracoes_config")
        .select("ativo, ultima_sync_at, ultima_sync_status, access_token")
        .eq("sistema", "bling")
        .maybeSingle();
      return data;
    },
  });

  const integracaoAtiva = !!(config?.ativo && config?.access_token);

  function cancelSync() {
    if (abortController) {
      abortController.abort();
      toast.info("Sincronização cancelada");
    }
  }

  async function sync() {
    if (syncing) return; // proteção contra duplo clique
    const controller = new AbortController();
    setAbortController(controller);
    setSyncing(true);
    setSyncResult(null);
    try {
      const tipos = ["contas_receber", "pedidos", "produtos"] as const;
      const totals = { criados: 0, atualizados: 0, duracao_ms: 0 };
      for (const tipo of tipos) {
        if (controller.signal.aborted) throw new Error("Cancelado pelo usuário");
        const { data, error } = await supabase.functions.invoke(
          "sync-bling-financeiro",
          { body: { tipo } }
        );
        if (controller.signal.aborted) throw new Error("Cancelado pelo usuário");
        if (error) throw new Error(error.message);
        if (data?.sucesso === false) throw new Error(data.erro || `Erro em ${tipo}`);
        totals.criados += data?.criados || 0;
        totals.atualizados += data?.atualizados || 0;
        totals.duracao_ms += data?.duracao_ms || 0;
      }
      setSyncResult(totals);
      toast.success("Sincronização concluída");
      refetch();
    } catch (e: any) {
      if (controller.signal.aborted) {
        // já notificado no cancelSync
      } else {
        toast.error("Falha: " + (e.message || e));
      }
    } finally {
      setSyncing(false);
      setAbortController(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Upload className="h-6 w-6 text-admin" />
          Importar Dados
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sincronize com o Bling ou importe NFs por CSV (Qive), XML ou PDF.
        </p>
      </div>

      {/* Card destaque integração Bling */}
      <Card className="border-admin/40 bg-admin/5">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1 min-w-[280px]">
              <CardTitle className="flex items-center gap-2 text-admin">
                <RefreshCw className="h-5 w-5" />
                Sincronizar com Bling
              </CardTitle>
              <CardDescription className="mt-1">
                Importa contas a receber, pedidos de venda e produtos do Bling.
                {config?.ultima_sync_at && (
                  <span className="block mt-1">
                    Última sync:{" "}
                    {formatDistanceToNow(new Date(config.ultima_sync_at), {
                      locale: ptBR,
                      addSuffix: true,
                    })}
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant={integracaoAtiva ? "default" : "outline"}
                  className={
                    integracaoAtiva ? "bg-success hover:bg-success text-success-foreground" : ""
                  }
                >
                  {integracaoAtiva ? "Conectado" : "Desconectado"}
                </Badge>
                <Button
                  onClick={sync}
                  disabled={syncing || !integracaoAtiva}
                  className="bg-admin hover:bg-admin/90 text-admin-foreground"
                >
                  {syncing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {syncing ? "Sincronizando..." : "Sincronizar agora"}
                </Button>
                {syncing && (
                  <Button
                    onClick={cancelSync}
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                )}
              </div>
              <Link
                to="/administrativo/configuracao-integracao"
                className="inline-flex items-center gap-1.5 text-xs text-admin hover:underline"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Configuração da integração
              </Link>
            </div>
          </div>

          {syncResult && (
            <div className="mt-3 p-3 rounded-md bg-success/10 text-sm text-success">
              ✅ {syncResult.criados} novos | 🔄 {syncResult.atualizados} atualizados | ⏱{" "}
              {syncResult.duracao_ms}ms
            </div>
          )}
        </CardContent>
      </Card>

      {/* Importadores de NF */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Importar NFs</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Selecione XMLs ou PDFs. NFs vão para o stage onde poderão ser processadas,
          classificadas e vinculadas a Contas a Pagar.
        </p>
        <ImportadorNFs />
      </div>

      {/* Extratos & Faturas */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Extratos & Faturas</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Importe arquivos OFX dos bancos, relatório de pagamentos Itaú e faturas de cartão.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <ImportadorOFX />
          <ImportadorItauPagamentos />
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-6 w-6 text-admin" />
                  <div>
                    <div className="font-medium">Faturas de Cartão</div>
                    <div className="text-xs text-muted-foreground">
                      Selecione cartão, fatura e período
                    </div>
                  </div>
                </div>
                <Button onClick={() => setImportarFaturaOpen(true)} className="gap-2">
                  <Upload className="h-4 w-4" />
                  Importar Fatura
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ImportarFaturaCartaoDialog
        open={importarFaturaOpen}
        onOpenChange={setImportarFaturaOpen}
      />
    </div>
  );
}
