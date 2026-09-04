import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Selo } from "@/components/ui/selo";
import { Loader2, Warehouse, AlertTriangle, ShieldAlert, ExternalLink } from "lucide-react";
import { useEmpurrarXpm } from "@/hooks/pedidos/useEmpurrarXpm";
import { usePreviaEmpurrarXpm } from "@/hooks/pedidos/usePreviaEmpurrarXpm";
import { usePreviaEstoqueXpm } from "@/hooks/pedidos/usePreviaEstoqueXpm";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { ForcarXpmDialog } from "@/components/pedidos/dialogs/ForcarXpmDialog";
import { BlocoFaltaEstoqueXpm } from "@/components/pedidos/BlocoFaltaEstoqueXpm";
import {
  PREFIXO_PRE_VOO, placeholderMotivoEstoque, rotuloAlcadaNivel,
  rotuloBotaoOverrideEstoque,
} from "@/lib/pedidos/xpm";

const MIN_MOTIVO = 15;

interface Props {
  pedido_id: string;
  id_externo: string;
  xpm_envio_erro?: string | null;
  /** "resgate" (default) = pedido já está no Bling e ficou sem expedição.
   *  "normal" = fluxo padrão: XPM primeiro, Bling depois do pré-faturamento. */
  modo?: "resgate" | "normal";
}

/**
 * Resgate da fila (21/08/2026): pedido que já foi pro Bling e ficou sem
 * expedição na XPM. Só empurra pra XPM — o Bling já tem o pedido.
 * O override de estoque entra INLINE aqui: este componente já é um dialog,
 * aninhar outro empilharia camadas do Radix.
 */
export function EmpurrarXpmLinhaDialog({ pedido_id, id_externo, xpm_envio_erro, modo = "resgate" }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const navigate = useNavigate();
  const empurrarXpm = useEmpurrarXpm();
  const { data: previa, isLoading: checkingPrevia } = usePreviaEmpurrarXpm(pedido_id, open);
  const { data: previaEstoque } = usePreviaEstoqueXpm(pedido_id, open);
  // OVERRIDE-TEM-NOME + VEREDITO-CRUZADO: o código e a alçada do override vêm
  // do veredito devolvido pelo banco, nunca de mapa hardcoded aqui.
  const { permitido: podeForcarEstoque } = usePermissaoAcaoOuSuperAdmin(
    previaEstoque?.permissao_slug ?? "",
  );

  const bloqueios = previa?.bloqueios ?? [];
  const avisos = previa?.avisos ?? [];
  const jaExisteNaXpm = !!xpm_envio_erro && String(xpm_envio_erro).includes("Expedicao ja existe na XPM");

  const itensFalta = previaEstoque?.itens ?? [];
  const temFaltaEstoque = itensFalta.length > 0;
  const soEstoqueBloqueia = bloqueios.length === 1;
  const vereditoEstoque = previaEstoque?.veredito ?? null;
  const overrideCodigo = previaEstoque?.override_codigo ?? null;
  const motivoAlcada = rotuloAlcadaNivel(previaEstoque?.nivel_ref);
  const overrideEstoque = temFaltaEstoque && soEstoqueBloqueia && !!overrideCodigo;
  const outrosBloqueios = temFaltaEstoque && bloqueios.length > 1;
  const motivoValido = motivo.trim().length >= MIN_MOTIVO;

  const handleConfirmar = async () => {
    try {
      await empurrarXpm.mutateAsync({ pedido_id });
      setOpen(false);
    } catch {
      // FAIL-LOUD: o toast de erro já sai de dentro do hook.
    }
  };

  const handleForcarEstoque = async () => {
    try {
      await empurrarXpm.mutateAsync({
        pedido_id,
        forcar: [overrideCodigo!],
        motivo: motivo.trim(),
      });
      setOpen(false);
      setMotivo("");
    } catch {
      // FAIL-LOUD: o toast de erro já sai de dentro do hook.
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (empurrarXpm.isPending) return;
        setOpen(v);
        if (!v) setMotivo("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Empurrar pra XPM"
          aria-label="Empurrar pra XPM"
        >
          <Warehouse className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Empurrar pra XPM</DialogTitle>
          <DialogDescription>
            Pedido <strong>#{id_externo}</strong> · {modo === "normal"
              ? "Empurrar pra XPM. O Bling recebe depois que a expedição for conferida — no pré-faturamento."
              : "Este pedido já está no Bling, mas não tem expedição na XPM."}
          </DialogDescription>
        </DialogHeader>

        {checkingPrevia ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando pedido...
          </div>
        ) : (
          <div className="space-y-3">
            {/* A prévia é a fonte viva; o erro gravado é o eco da última tentativa. */}
            {xpm_envio_erro && bloqueios.length === 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {String(xpm_envio_erro).startsWith(PREFIXO_PRE_VOO)
                    ? <>Bloqueado antes do envio: {String(xpm_envio_erro).slice(PREFIXO_PRE_VOO.length)}</>
                    : <>XPM recusou: {xpm_envio_erro}</>}
                </AlertDescription>
              </Alert>
            )}

            {/* A tabela de falta diz o que falta com mais precisão que o card genérico. */}
            {temFaltaEstoque && (
              <BlocoFaltaEstoqueXpm itens={itensFalta} fotoEm={previaEstoque?.foto_em ?? null} />
            )}

            {bloqueios.length > 0 && !overrideEstoque && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-1">
                  {bloqueios.map((b) => (
                    <p key={b}>{b}</p>
                  ))}
                  {outrosBloqueios && (
                    <p className="font-medium">
                      Resolva os outros bloqueios primeiro — forçar só o estoque
                      falharia de novo.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {avisos.length > 0 && (
              <Alert variant="default" className="bg-warning/10 border-warning/40">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning text-xs space-y-1">
                  {avisos.map((a) => (
                    <p key={a} className="tabular-nums">{a}</p>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            {overrideEstoque && (
              <div className="space-y-2">
                {/* Dividir vem primeiro: forçar é a exceção. */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full gap-1.5 whitespace-normal h-auto text-xs leading-tight py-2"
                  onClick={() => {
                    setOpen(false);
                    navigate(`/pedidos/${pedido_id}`, {
                      state: { from: "/pedidos", fromLabel: "Fila de Pedidos" },
                    });
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  Abrir o pedido para dividir
                </Button>

                <p className="text-xs text-muted-foreground">
                  {vereditoEstoque === "falta_real"
                    ? "Divida quando o item realmente falta; force quando a foto está velha ou a mercadoria chega antes do separador."
                    : "A peça existe — a decisão aqui é de prioridade, não de saldo."}
                </p>

                {!podeForcarEstoque && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    {motivoAlcada}.
                  </p>
                )}

                <Selo estado="warning">Ação de exceção</Selo>
                <Label htmlFor="motivo-forcar-estoque-fila" className="text-xs">
                  {vereditoEstoque === "fila_disputada"
                    ? "Motivo da prioridade (fica registrado no histórico dos pedidos)"
                    : "Motivo (fica registrado no histórico do pedido)"}
                </Label>
                <Textarea
                  id="motivo-forcar-estoque-fila"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={3}
                  placeholder={placeholderMotivoEstoque(vereditoEstoque)}
                />
                <p className="text-xs text-muted-foreground">
                  {motivo.trim().length}/{MIN_MOTIVO} caracteres mínimos
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={empurrarXpm.isPending}
          >
            Cancelar
          </Button>
          {jaExisteNaXpm ? (
            <ForcarXpmDialog pedidoId={pedido_id} />
          ) : overrideEstoque ? (
            <Button
              variant="secondary"
              onClick={handleForcarEstoque}
              disabled={!podeForcarEstoque || !motivoValido || empurrarXpm.isPending}
              title={podeForcarEstoque ? undefined : motivoAlcada}
              className="gap-1.5"
            >
              {empurrarXpm.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Enviando…</>
              ) : (
                <><ShieldAlert className="h-4 w-4" />{rotuloBotaoOverrideEstoque(vereditoEstoque)}</>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleConfirmar}
              disabled={empurrarXpm.isPending || checkingPrevia || bloqueios.length > 0}
              className="gap-1.5"
            >
              {empurrarXpm.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Empurrando…</>
              ) : (
                <><Warehouse className="h-4 w-4" />Confirmar envio</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
