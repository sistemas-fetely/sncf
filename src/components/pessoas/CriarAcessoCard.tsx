import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

type RespostaAcesso = {
  success: boolean;
  user_id?: string;
  vinculo_id?: string;
  email?: string;
  tipo_vinculo?: string;
  link_primeiro_acesso?: string | null;
  avisos?: string[];
  error?: string;
};

// FONTE-ÚNICA-NA-TELA: este card não consulta `vinculos`. Tudo vem do PessoaForm,
// que já tem o vínculo em estado. Duas fontes para o mesmo fato geravam e-mail velho.
type Props = {
  pessoaId: string;
  vinculoId: string | null;
  emailCorporativo: string;
  usuarioId: string | null;
  tipoVinculo: string | null;
  statusVinculo: string | null;
  /** true quando o e-mail corporativo na tela difere do que veio do banco */
  emailAlterado?: boolean;
  onAcessoCriado?: (usuarioId: string) => void;
};

export default function CriarAcessoCard({
  pessoaId,
  vinculoId,
  emailCorporativo,
  usuarioId,
  tipoVinculo,
  statusVinculo,
  emailAlterado = false,
  onAcessoCriado,
}: Props) {
  const qc = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const inativo = !!vinculoId && statusVinculo !== "ativo";
  const email = (emailCorporativo || "").trim();

  const criar = useMutation({
    mutationFn: async () => {
      if (!vinculoId) throw new Error("Vínculo não encontrado.");
      const { data, error } = await supabase.functions.invoke<RespostaAcesso>("manage-user", {
        body: { action: "create_user_from_vinculo", vinculo_id: vinculoId, enviar_email: true },
      });
      if (error) {
        let msg = error.message;
        const ctx = (error as { context?: { json?: () => Promise<RespostaAcesso> } }).context;
        if (ctx?.json) {
          try {
            const corpo = await ctx.json();
            if (corpo?.error) msg = corpo.error;
          } catch { /* mantém a mensagem original */ }
        }
        throw new Error(msg);
      }
      if (!data?.success) throw new Error(data?.error || "Não foi possível criar o acesso.");
      return data;
    },
    onSuccess: (data) => {
      const lista = data.avisos ?? [];
      setAvisos(lista);
      setLink(data.link_primeiro_acesso ?? null);
      if (lista.length === 0) toast.success("Acesso criado e e-mail de boas-vindas enviado.");
      else toast.success("Acesso criado — há pendências de configuração.");
      if (data.user_id) onAcessoCriado?.(data.user_id);
      void qc.invalidateQueries({ queryKey: ["pessoa", pessoaId] });
      void qc.invalidateQueries({ queryKey: ["pessoas"] });
      void qc.invalidateQueries({ queryKey: ["vinculos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function copiarLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopiado(true);
    toast.success("Link copiado.");
    setTimeout(() => setCopiado(false), 2000);
  }

  const jaTem = !!usuarioId;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Acesso ao sistema</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!vinculoId && (
          <p className="text-sm text-muted-foreground">
            Esta pessoa ainda não tem vínculo. Salve o vínculo para poder criar o acesso.
          </p>
        )}

        {vinculoId && jaTem && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Acesso ativo</Badge>
            <span className="text-sm text-muted-foreground">{email || "sem e-mail registrado"}</span>
          </div>
        )}

        {vinculoId && !jaTem && (
          <div className="space-y-2">
            <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
              <Button
                onClick={() => setConfirmando(true)}
                disabled={inativo || !email || emailAlterado || criar.isPending}
              >
                {criar.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <KeyRound className="mr-2 h-4 w-4" />}
                Criar acesso
              </Button>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Criar acesso ao sistema?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Será criado o acesso para <strong>{email}</strong>, com envio de e-mail de
                    boas-vindas contendo o link de primeiro acesso, e os perfis serão aplicados
                    conforme o cargo e o departamento do vínculo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={criar.isPending}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => { e.preventDefault(); setConfirmando(false); criar.mutate(); }}
                    disabled={criar.isPending}
                  >
                    Criar acesso
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {inativo ? (
              <p className="text-sm text-muted-foreground">Vínculo inativo.</p>
            ) : emailAlterado ? (
              <p className="text-sm text-muted-foreground">Salve a ficha antes de criar o acesso.</p>
            ) : !email ? (
              <p className="text-sm text-muted-foreground">
                Informe o e-mail corporativo para criar o acesso.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {email}{tipoVinculo ? ` · ${tipoVinculo}` : ""}
              </p>
            )}
          </div>
        )}

        {avisos.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
            <div className="flex items-center gap-2 text-sm text-warning">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">Acesso criado com pendências</span>
            </div>
            <ul className="mt-2 list-disc pl-5 text-sm text-foreground">
              {avisos.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}

        {link && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm text-muted-foreground">
              Link de primeiro acesso (use caso o e-mail não chegue):
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-xs">{link}</code>
              <Button type="button" variant="outline" size="sm" onClick={() => void copiarLink()}>
                {copiado ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                Copiar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
