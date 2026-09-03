import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Send, Loader2, AlertTriangle, RefreshCw, Package } from "lucide-react";
import { useEnviarBling } from "@/hooks/pedidos/useEnviarBling";
import { useSyncContato } from "@/hooks/parceiros/useSyncContato";
import { useProvaPagamento } from "@/hooks/pedidos/useProvaPagamento";
import { ProvaPagamentoAlerta } from "@/components/pedidos/ProvaPagamentoAlerta";
import { usePermissaoAcao } from "@/hooks/usePermissaoAcao";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  pedido_id: string;
  parceiro_id: string;
  id_externo: string;
  valor_liquido: number;
  forma_solicitada: string;
  /** "padrao" = botão com rótulo (default, preserva todos os consumidores atuais).
   *  "discreta" = ícone ghost com tooltip, para uso em linha de tabela. */
  variante?: "padrao" | "discreta";
  estagio?: string;
  xpm_expedicao_codigo?: string | null;
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function EnviarBlingDialog({
  pedido_id, parceiro_id, id_externo, valor_liquido, forma_solicitada,
  variante = "padrao", estagio, xpm_expedicao_codigo,
}: Props) {

  const [open, setOpen] = useState(false);
  const enviar = useEnviarBling();
  const sync = useSyncContato();
  const navigate = useNavigate();

  // FATURAMENTO-NASCE-NO-SNCF: este diálogo só fala com o Bling. A XPM tem
  // porta própria (EmpurrarXpmLinhaDialog) e vem antes, no pré-faturamento.

  const { data: prova, isLoading: checkingProva } = useProvaPagamento(pedido_id, open);
  const { permitido: podeLiberarSemProva } = usePermissaoAcao("acao.liberar_sem_prova");
  const travadoSemProva = !!prova && !prova.libera_despacho && !podeLiberarSemProva;

  const { data: parceiroStatus, isLoading: checkingBling, refetch: recheckBling } = useQuery({
    queryKey: ["parceiro-bling-check", parceiro_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("bling_id")
        .eq("id", parceiro_id)
        .maybeSingle();
      return data;
    },
    enabled: open && !!parceiro_id,
  });

  const { data: remessasAtivas, isLoading: checkingRemessas } = useQuery({
    queryKey: ["remessas-ativas-check", pedido_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pedido_remessa")
        .select("id, sequencia, status")
        .eq("pedido_id", pedido_id)
        .eq("status", "pronta_para_envio")
        .is("bling_pedido_id", null);
      return data ?? [];
    },
    enabled: open,
  });

  const temBlingId = !!parceiroStatus?.bling_id;
  const temRemessaAtiva = Array.isArray(remessasAtivas) && remessasAtivas.length > 0;
  const carregando = checkingBling || checkingRemessas || checkingProva;
  const enviando = enviar.isPending;

  const IconeGatilho = Send;

  const handleSincronizar = async () => {
    try {
      await sync.mutateAsync(parceiro_id);
      recheckBling();
    } catch {
      // erro tratado no hook
    }
  };

  const handleEnviar = async () => {
    // Despacho sem lastro bancário fica registrado — o humano decide, o sistema anota.
    if (prova && !prova.libera_despacho) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc("fn_registrar_despacho_sem_prova", { p_pedido_id: pedido_id });
      } catch (e) {
        console.error("Falha ao registrar despacho sem prova:", e);
      }
    }
    try {
      await enviar.mutateAsync({ pedido_id });
      setOpen(false);
    } catch {
      // erro tratado no hook
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (enviando) return;
        setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        {variante === "discreta" ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Enviar pro Bling"
            aria-label="Enviar pro Bling"
          >
            <IconeGatilho className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" className="gap-1.5">
            <IconeGatilho className="h-4 w-4" />
            Enviar pro Bling
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar pedido pro Bling</DialogTitle>
          <DialogDescription>
            Pedido <strong>#{id_externo}</strong> · {fmtBRL.format(valor_liquido)} · {forma_solicitada}
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando pedido...
          </div>
        ) : temRemessaAtiva ? (
          <div className="space-y-3">
            <Alert>
              <Package className="h-4 w-4" />
              <AlertDescription>
                Este pedido já tem {remessasAtivas!.length === 1 ? "1 tentativa de envio" : `${remessasAtivas!.length} tentativas de envio`} aguardando envio.
                Use a seção <strong>Envios ao Bling</strong> no detalhe do pedido para enviar ao Bling.
              </AlertDescription>
            </Alert>
            <Button
              className="w-full gap-1.5"
              onClick={() => {
                setOpen(false);
                navigate(`/pedidos/${pedido_id}`);
              }}
            >
              <Package className="h-4 w-4" />
              Abrir pedido
            </Button>
          </div>
        ) : !temBlingId ? (
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Parceiro ainda não sincronizado no Bling. Sincronize antes de enviar o pedido.
              </AlertDescription>
            </Alert>
            <Button
              onClick={handleSincronizar}
              disabled={sync.isPending}
              className="w-full gap-1.5"
            >
              {sync.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Sincronizando...</>
              ) : (
                <><RefreshCw className="h-4 w-4" />Sincronizar parceiro no Bling</>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {prova && <ProvaPagamentoAlerta prova={prova} />}
            {prova && !prova.libera_despacho && (
              podeLiberarSemProva ? (
                <p className="text-xs text-muted-foreground leading-snug">
                  Você tem permissão para liberar sem confirmação bancária. A liberação
                  fica registrada com seu nome.
                </p>
              ) : (
                <p className="text-xs text-destructive leading-snug">
                  Este pedido não tem confirmação bancária do pagamento. Peça a liberação
                  a quem tem a permissão.
                </p>
              )
            )}
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Ao confirmar, o pedido será criado no Bling com seus títulos a receber.
                Esta ação é irreversível dentro do sistema (depois precisa cancelar lá direto).
              </p>
              <p className="text-xs">
                Se faltar alguma informação (forma sem id Bling parametrizado),
                o envio falha com mensagem clara e nada é alterado no pedido.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={enviando || sync.isPending}
          >
            Cancelar
          </Button>
          {temBlingId && !temRemessaAtiva && (
            <Button
              onClick={handleEnviar}
              disabled={enviando || travadoSemProva}
              className="gap-1.5"
            >
              {enviando ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Enviando…</>
              ) : (
                <><IconeGatilho className="h-4 w-4" />Confirmar envio</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
