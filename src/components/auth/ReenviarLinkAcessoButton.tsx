import { forwardRef, useState } from "react";
import { Copy, Key, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  userId: string;
  nome?: string;
  /** "button" = standalone outline button; "inline" = compact item to nest in a DropdownMenuItem; "icon" = icon-only ghost button (luxury) */
  variant?: "button" | "inline" | "icon";
  onSuccess?: () => void;
}

/**
 * Botão de RH para reenviar link de acesso (primeiro acesso ou reset de senha).
 * Gera o link e mostra para o admin copiar (envio por email é best-effort).
 */
export function ReenviarLinkAcessoButton({ userId, nome, variant = "button", onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [linkGerado, setLinkGerado] = useState<string | null>(null);

  function resetState() {
    setLinkGerado(null);
    setMotivo("");
  }

  async function handleConfirmar() {
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: {
          action: "reenviar_link_acesso",
          user_id: userId,
          motivo: motivo.trim() || null,
        },
      });
      if (error || (data as any)?.error) {
        throw new Error(error?.message || (data as any)?.error);
      }
      const link = (data as any)?.link_primeiro_acesso || null;
      setLinkGerado(link);
      if (!link) {
        toast.warning("Link não retornado pelo servidor.");
      }
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || "Erro ao reenviar link");
    } finally {
      setEnviando(false);
    }
  }

  async function handleCopiar() {
    if (!linkGerado) return;
    try {
      await navigator.clipboard.writeText(linkGerado);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar. Selecione manualmente.");
    }
  }

  return (
    <>
      {variant === "button" ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
          <Key className="h-4 w-4" /> Link
        </Button>
      ) : variant === "icon" ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          className="h-8 w-8 text-muted-foreground hover:text-gold hover:bg-gold/10"
        >
          <Key className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted rounded-sm flex items-center gap-2"
        >
          <Send className="h-3.5 w-3.5" /> Reenviar link de acesso
        </button>
      )}

      <AlertDialog
        open={open}
        onOpenChange={(v) => {
          if (!v) resetState();
          setOpen(v);
        }}
      >
        <AlertDialogContent>
          {linkGerado === null ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Reenviar link de acesso</AlertDialogTitle>
                <AlertDialogDescription>
                  {nome ? (
                    <>
                      Será gerado um novo link para <strong>{nome}</strong>.{" "}
                    </>
                  ) : null}
                  O sistema identifica automaticamente se é primeiro acesso ou redefinição de senha.
                  Link anterior (se houver) deixa de ser válido.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="space-y-2">
                <Label htmlFor="motivo-reenvio" className="text-xs">
                  Motivo (opcional — fica no log de auditoria)
                </Label>
                <Textarea
                  id="motivo-reenvio"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  className="text-sm"
                  placeholder="Ex: link expirou, colaborador presencial pediu reenvio…"
                />
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    handleConfirmar();
                  }}
                  disabled={enviando}
                >
                  {enviando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Reenviar link
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Link gerado</AlertDialogTitle>
                <AlertDialogDescription>
                  Copie e envie para a pessoa via WhatsApp. O link expira — use logo.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="space-y-2">
                <Input
                  readOnly
                  value={linkGerado}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="text-xs font-mono"
                />
                <Button onClick={handleCopiar} className="w-full gap-2">
                  <Copy className="h-4 w-4" /> Copiar link
                </Button>
                <p className="text-xs text-muted-foreground">
                  Se o e-mail estiver configurado, a pessoa também recebe por e-mail.
                </p>
              </div>

              <AlertDialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    resetState();
                    setOpen(false);
                  }}
                >
                  Fechar
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
