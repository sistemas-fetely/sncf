// Envio da NF de devolução à XPM (a XPM só emite o termo depois de receber a NF). Edge devolucao-enviar-nf-xpm.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { KEY_ANDAMENTO } from "@/hooks/processos/useAndamentoCaso";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
type Envio = { status: string; erro: string | null; criado_em: string; enviado_por_nome: string | null };
const fmt = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function EnviarNfXpm({ devolucaoId, onMudou }: { devolucaoId: string; onMudou?: () => void }) {
  const qc = useQueryClient();
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const enviosQ = useQuery({
    queryKey: ["devolucao", "nf-email-xpm", devolucaoId],
    queryFn: async () => {
      const { data, error } = await sb.from("devolucao_nf_email_xpm").select("status,erro,criado_em,enviado_por_nome").eq("devolucao_id", devolucaoId).order("criado_em", { ascending: false }).limit(20);
      if (error) throw error;
      return (data ?? []) as Envio[];
    },
  });
  const destQ = useQuery({
    queryKey: ["devolucao_email_xpm_destinatario"], enabled: confirmar,
    queryFn: async () => {
      const { data, error } = await sb.from("devolucao_email_xpm_destinatario").select("email,papel").eq("ativo", true).order("ordem");
      if (error) throw error;
      return (data ?? []) as { email: string; papel: string }[];
    },
  });

  const envios = enviosQ.data ?? [];
  const ultimoOk = envios.find((e) => e.status === "enviado");
  const ultimo = envios[0];
  const ultimoErro = ultimo?.status === "erro" ? ultimo : null;

  async function enviar() {
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("devolucao-enviar-nf-xpm", { body: { devolucao_id: devolucaoId } });
      if (error) {
        let m = error.message;
        if (error instanceof FunctionsHttpError) { const t = await error.context.text(); try { m = JSON.parse(t)?.erro ?? t; } catch { m = t; } }
        throw new Error(m);
      }
      if (!data?.ok) throw new Error(data?.erro ?? "Falha no envio.");
      toast.success(`NF enviada à XPM (${(data.para ?? []).join(", ")})`);
      setConfirmar(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["devolucao", "nf-email-xpm", devolucaoId] }),
        qc.invalidateQueries({ queryKey: KEY_ANDAMENTO }),
        qc.invalidateQueries({ queryKey: ["processos"] }),
      ]);
      onMudou?.();
    }
  }

  if (enviosQ.isLoading) return <div className="text-sm text-muted-foreground">Carregando envio à XPM…</div>;
  if (enviosQ.isError) return <div className="text-sm text-destructive">Erro ao ler envios à XPM: {String((enviosQ.error as Error).message)}</div>;
  const para = (destQ.data ?? []).filter((d) => d.papel === "para").map((d) => d.email);
  const copia = (destQ.data ?? []).filter((d) => d.papel === "copia").map((d) => d.email);

  return (
    <div className="space-y-1 text-sm">
      {ultimoOk && <div className="text-muted-foreground">Enviada à XPM em {fmt(ultimoOk.criado_em)} por {ultimoOk.enviado_por_nome ?? "—"}</div>}
      {ultimoErro && <div className="text-destructive">Falha no último envio: {ultimoErro.erro}</div>}
      {!ultimoOk && !ultimoErro && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Envio automático à XPM em até 5 min</span>
          <Button size="sm" variant="outline" onClick={() => setConfirmar(true)}><Mail className="mr-2 h-4 w-4" />Enviar agora</Button>
        </div>
      )}
      {ultimoErro && <Button size="sm" variant="outline" onClick={() => setConfirmar(true)}><Mail className="mr-2 h-4 w-4" />Tentar de novo</Button>}
      {ultimoOk && !ultimoErro && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setConfirmar(true)}>Reenviar</Button>}
      <AlertDialog open={confirmar} onOpenChange={(o) => { if (!enviando) setConfirmar(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ultimoOk ? "Reenviar NF de devolução à XPM?" : "Enviar NF de devolução à XPM?"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <div>Vai o XML e o PDF da NF de devolução, pedindo o termo de devolução.</div>
                {destQ.isLoading ? <div>Carregando destinatários…</div> : destQ.isError ? <div className="text-destructive">Erro ao ler destinatários: {String((destQ.error as Error).message)}</div> : <>
                  <div>Para: {para.join(", ") || "nenhum destinatário ativo"}</div>
                  {copia.length > 0 && <div>Cópia: {copia.join(", ")}</div>}
                </>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
            <Button disabled={enviando || !para.length} onClick={() => void enviar()}>{enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{ultimoOk ? "Reenviar" : "Enviar"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
