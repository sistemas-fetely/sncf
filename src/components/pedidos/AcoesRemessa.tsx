import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Send, AlertTriangle, RefreshCw, Warehouse } from "lucide-react";
import { DividirRemessaDialog } from "@/components/pedidos/dialogs/DividirRemessaDialog";
import { supabase } from "@/integrations/supabase/client";
import { useRemessas } from "@/hooks/pedidos/useRemessas";
import { useEnviarBling } from "@/hooks/pedidos/useEnviarBling";
import { useEmpurrarXpm } from "@/hooks/pedidos/useEmpurrarXpm";
import { usePreviaEmpurrarXpm } from "@/hooks/pedidos/usePreviaEmpurrarXpm";
import { useSyncContato } from "@/hooks/parceiros/useSyncContato";
import { useAuth } from "@/contexts/AuthContext";
import { useNivel } from "@/hooks/useNivel";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { ReenviarBlingDialog } from "@/components/pedidos/dialogs/ReenviarBlingDialog";
import { ForcarXpmDialog } from "@/components/pedidos/dialogs/ForcarXpmDialog";
import { DeclararCancelamentoXpmDialog } from "@/components/pedidos/dialogs/DeclararCancelamentoXpmDialog";

interface Props {
  pedido_id: string;
  parceiro_id: string;
  id_externo: string;
  estagio: string;
  bling_id_destino: number | null;
}

/**
 * Ações de remessa no topo da coluna AÇÕES.
 * A ENTIDADE remessa mora no rodapé (Vínculos); aqui vivem só as ações.
 * Elegibilidade idêntica à que o antigo card "Remessas" usava.
 */
export function AcoesRemessa({ pedido_id, parceiro_id, id_externo, estagio, bling_id_destino }: Props) {
  const { data: remessas, isLoading } = useRemessas(pedido_id);
  const enviar = useEnviarBling();
  const empurrarXpm = useEmpurrarXpm();
  const sync = useSyncContato();
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { temNivel } = useNivel();
  // Permissão nominal de AÇÃO (DIMENSAO-VIA-TABELA). Quem não tem vê o botão
  // DESABILITADO com o motivo — nunca escondido.
  const { permitido: podeEnviarBling } = usePermissaoAcaoOuSuperAdmin("acao.enviar_bling");
  const { permitido: podeEmpurrarXpmAcao } = usePermissaoAcaoOuSuperAdmin("acao.empurrar_xpm");
  const MOTIVO_SEM_ACAO = "Ação do time de Operações";

  const { data: parceiroBling, refetch: recheckBling } = useQuery({
    queryKey: ["parceiro-bling-check", parceiro_id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("bling_id")
        .eq("id", parceiro_id)
        .maybeSingle();
      return data;
    },
    enabled: !!parceiro_id,
  });

  const { data: pedidoXpm } = useQuery({
    queryKey: ["pedido-xpm", pedido_id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("pedidos")
        .select("xpm_expedicao_codigo, xpm_envio_erro")
        .eq("id", pedido_id)
        .maybeSingle();
      return data;
    },
    enabled: !!pedido_id,
  });

  const { data: previa } = usePreviaEmpurrarXpm(
    pedido_id,
    estagio === "pre_separacao" || estagio === "em_separacao",
  );

  if (isLoading || estagio === "cancelado") return null;

  const semRemessa = !remessas || remessas.length === 0;
  const podeEnviarInicial = estagio === "pre_faturamento" && !bling_id_destino;
  const estagioDeEnvio = estagio === "pre_separacao" || estagio === "em_separacao";
  const temBlingId = !!parceiroBling?.bling_id;
  const precisaSincronizar = estagioDeEnvio && !bling_id_destino && !temBlingId;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elegiveis = (remessas ?? []).filter((rem: any) => {
    const itens: any[] = Array.isArray(rem.itens_json) ? rem.itens_json : [];
    const totalUnidades = itens.reduce((s: number, it: any) => s + (Number(it.quantidade) || 0), 0);
    const podeEnviar = rem.status === "pronta_para_envio" && !rem.bling_pedido_id && !precisaSincronizar;
    const podeDividir = !rem.bling_pedido_id && totalUnidades >= 2;
    return podeEnviar || podeDividir;
  });

  // A expedicao XPM e do PEDIDO. `pedido_remessa` e tentativa de envio ao Bling;
  // derivar /NN dali colidiria com id_externo de pedidos-filho (split) reais.
  // Ver `decisao-remessa-e-tentativa-envio`.
  const jaEmpurrado = !!pedidoXpm?.xpm_expedicao_codigo;
  const podeEmpurrarXpm = estagioDeEnvio && !jaEmpurrado;
  const ocupado = enviar.isPending || empurrarXpm.isPending;

  const mostrarAlerta = precisaSincronizar;
  const mostrarInicial = !precisaSincronizar && semRemessa && podeEnviarInicial;

  // Reenvio: só super_admin, só em (pré-)separação, e só se existe uma tentativa VIVA
  // carregando exatamente o id que o pedido aponta hoje (a "vigente").
  // REENVIO-SEGUE-O-ENVIO (28/08/2026): pre_separacao entrou porque pedido devolvido
  // para Cobranca e corrigido volta nesse estagio com bling_id_destino preenchido —
  // sem isso ele nao tem botao nenhum para corrigir o Bling.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const temTentativaVigente = (remessas ?? []).some((r: any) =>
    r.status !== "cancelada" && !!r.bling_pedido_id &&
    String(r.bling_pedido_id) === String(bling_id_destino)
  );
  const podeReenviar =
    isSuperAdmin && (estagio === "pre_separacao" || estagio === "em_separacao")
    && !!bling_id_destino && temTentativaVigente;

  if (!mostrarAlerta && !mostrarInicial && elegiveis.length === 0 && !podeReenviar
      && !podeEmpurrarXpm && !jaEmpurrado && !pedidoXpm?.xpm_envio_erro) return null;


  return (
    <div className="space-y-2">
      {mostrarAlerta && (
        <Alert variant="default" className="bg-warning/10 border-warning/40">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning text-xs">
            Parceiro ainda não cadastrado no Bling. Sincronize antes de enviar.
          </AlertDescription>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 gap-1 w-full whitespace-normal h-auto text-xs leading-tight py-2"
            disabled={sync.isPending}
            onClick={async () => { await sync.mutateAsync(parceiro_id); recheckBling(); }}
          >
            {sync.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sincronizando…</>
            ) : (
              <><RefreshCw className="h-3.5 w-3.5" />Sincronizar parceiro no Bling</>
            )}
          </Button>
        </Alert>
      )}

      {/* Motivo visível do bloqueio por permissão — mesmo padrão de card do
          "XPM recusou: …". O botão fica DESABILITADO, nunca escondido. */}
      {((mostrarInicial && !podeEnviarBling) ||
        (!precisaSincronizar && podeEmpurrarXpm && !podeEmpurrarXpmAcao)) && (
        <Alert variant="default" className="bg-muted/60 border-border">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <AlertDescription className="text-muted-foreground text-xs">
            {MOTIVO_SEM_ACAO}
          </AlertDescription>
        </Alert>
      )}

      {mostrarInicial && (
        <Button
          size="sm"
          className="w-full gap-1.5 whitespace-normal h-auto text-xs leading-tight py-2"
          title={podeEnviarBling ? `Enviar ${id_externo} pro Bling` : MOTIVO_SEM_ACAO}
          disabled={ocupado || !podeEnviarBling}
          onClick={() => enviar.mutate({ pedido_id })}
        >
          {enviar.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Enviando…</>
          ) : (
            <><Send className="h-4 w-4 shrink-0" />Enviar pro Bling</>

          )}
        </Button>
      )}

      {!precisaSincronizar && podeEmpurrarXpm && (previa?.avisos?.length ?? 0) > 0 && (
        <Alert variant="default" className="bg-warning/10 border-warning/40">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning text-xs space-y-1">
            {previa!.avisos.map((a) => (
              <p key={a} className="tabular-nums">{a}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {/* Bloqueios aparecem ANTES do clique — o operador não descobre por toast. */}
      {!precisaSincronizar && podeEmpurrarXpm && temBloqueio && (
        <Alert variant="default" className="bg-destructive/10 border-destructive/40">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-destructive text-xs space-y-1">
            <p className="font-medium">Bloqueado antes do envio</p>
            {previa!.bloqueios.map((b) => (
              <p key={b} className="tabular-nums">{b}</p>
            ))}
            {temFaltaEstoque && !soEstoqueBloqueia && (
              <p className="text-muted-foreground">
                Resolva os outros bloqueios primeiro — forçar só o estoque falharia de novo.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {!precisaSincronizar && podeEmpurrarXpm && (
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 whitespace-normal h-auto text-xs leading-tight py-2"
          title={
            temBloqueio
              ? "Existem bloqueios antes do envio — resolva ou use o caminho de exceção"
              : podeEmpurrarXpmAcao ? `Empurrar ${id_externo} pra XPM` : MOTIVO_SEM_ACAO
          }
          disabled={ocupado || !podeEmpurrarXpmAcao || temBloqueio}
          onClick={() => empurrarXpm.mutate({ pedido_id })}
        >
          {empurrarXpm.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Empurrando…</>
          ) : (
            <><Warehouse className="h-4 w-4 shrink-0" />Empurrar pra XPM</>
          )}
        </Button>
      )}

      {!precisaSincronizar && podeEmpurrarXpm && temFaltaEstoque && soEstoqueBloqueia && (
        <ForcarXpmEstoqueDialog
          pedidoId={pedido_id}
          idExterno={id_externo}
          itens={previaEstoque!.itens}
          fotoEm={previaEstoque!.foto_em}
          split={remessaSplit}
          podeForcar={podeForcarEstoque}
        />
      )}

      {pedidoXpm?.xpm_envio_erro && !jaEmpurrado && (
        <>
          <Alert variant="default" className="bg-destructive/10 border-destructive/40">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-destructive text-xs">
              {/* Recusa NOSSA (pré-voo) não é recusa da XPM: ela nem foi chamada. */}
              {String(pedidoXpm.xpm_envio_erro).startsWith(PREFIXO_PRE_VOO)
                ? <>Bloqueado antes do envio: {String(pedidoXpm.xpm_envio_erro).slice(PREFIXO_PRE_VOO.length)}</>
                : <>XPM recusou: {pedidoXpm.xpm_envio_erro}</>}
            </AlertDescription>
          </Alert>
          {String(pedidoXpm.xpm_envio_erro).includes("Expedicao ja existe na XPM") && (
            <ForcarXpmDialog pedidoId={pedido_id} />
          )}
        </>
      )}

      {jaEmpurrado && (
        <>
          <p className="text-xs text-muted-foreground px-1 tabular-nums">
            XPM: expedição {pedidoXpm!.xpm_expedicao_codigo}
          </p>
          {/* CONTRATO DE NÍVEL: cancelar/declarar cancelamento é APAGAR — nível 4 (Gerente). */}
          {temNivel(4) && (
            <DeclararCancelamentoXpmDialog
              pedidoId={pedido_id}
              expedicaoCodigo={String(pedidoXpm!.xpm_expedicao_codigo)}
            />
          )}
        </>
      )}


      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {elegiveis.map((rem: any) => {
        // Vocabulario de UI: linha de `pedido_remessa` e TENTATIVA de envio, nunca /NN.
        // /NN pertence so ao split. Ver sncf_documentacao `decisao-remessa-e-tentativa-envio`.
        const tentativa = `tentativa ${Number(rem.sequencia)}`;
        const codigo = `${id_externo} · ${tentativa}`;

        const itens: any[] = Array.isArray(rem.itens_json) ? rem.itens_json : [];
        const totalUnidades = itens.reduce((s: number, it: any) => s + (Number(it.quantidade) || 0), 0);
        const podeEnviar = rem.status === "pronta_para_envio" && !rem.bling_pedido_id && !precisaSincronizar;
        const podeDividir = !rem.bling_pedido_id && totalUnidades >= 2;

        return (
          <div key={rem.id} className="space-y-2">
            {podeEnviar && (
              <>
                {!podeEnviarBling && (
                  <Alert variant="default" className="bg-muted/60 border-border">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <AlertDescription className="text-muted-foreground text-xs">
                      {MOTIVO_SEM_ACAO}
                    </AlertDescription>
                  </Alert>
                )}
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  title={podeEnviarBling ? `Enviar ${codigo} pro Bling` : MOTIVO_SEM_ACAO}
                  disabled={enviar.isPending || !podeEnviarBling}
                  onClick={() => enviar.mutate({ pedido_id, remessa_id: rem.id })}
                >
                  {enviar.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Enviando…</>
                  ) : (
                    <><Send className="h-4 w-4 shrink-0" />Enviar pro Bling ({tentativa})</>
                  )}
                </Button>
              </>
            )}


            {podeDividir && (
              <DividirRemessaDialog
                remessaId={rem.id}
                pedidoId={pedido_id}
                codigo={codigo}
                itens={itens}
                triggerLabel={`Dividir ${tentativa}`}
                triggerTitle={`Dividir ${codigo} em duas`}
                triggerFullWidth
              />
            )}
          </div>
        );
      })}

      {podeReenviar && (
        <ReenviarBlingDialog
          pedidoId={pedido_id}
          idExterno={id_externo}
          blingIdAtual={String(bling_id_destino)}
        />
      )}
    </div>
  );
}
