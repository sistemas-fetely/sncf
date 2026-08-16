import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

type VinculoAcesso = {
  id: string;
  status: string;
  tipo_vinculo: string;
  email_corporativo: string | null;
  usuario_id: string | null;
  data_inicio: string;
};

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

export default function CriarAcessoCard({ pessoaId }: { pessoaId: string }) {
  const qc = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const vinculosQ = useQuery({
    queryKey: ["pessoa-vinculos-acesso", pessoaId],
    queryFn: async (): Promise<VinculoAcesso[]> => {
      const { data, error } = await supabase
        .from("vinculos")
        .select("id, status, tipo_vinculo, email_corporativo, usuario_id, data_inicio")
        .eq("pessoa_id", pessoaId)
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VinculoAcesso[];
    },
  });

  const todos = vinculosQ.data ?? [];
  const ativos = todos.filter((v) => v.status === "ativo");
  // Mais de um vínculo ativo: usamos o mais recente por data_inicio e avisamos na tela.
  const vinculo = ativos[0] ?? todos[0] ?? null;
  const inativo = !!vinculo && vinculo.status !== "ativo";
  const email = vinculo?.email_corporativo?.trim() || "";

  const criar = useMutation({
    mutationFn: async () => {
      if (!vinculo) throw new Error("Vínculo não encontrado.");
      const { data, error } = await supabase.functions.invoke<RespostaAcesso>("manage-user", {
        body: { action: "create_user_from_vinculo", vinculo_id: vinculo.id, enviar_email: true },
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
      void qc.invalidateQueries({ queryKey: ["pessoa-vinculos-acesso", pessoaId] });
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

  const jaTem = !!vinculo?.usuario_id;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Acesso ao sistema</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {vinculosQ.isLoading && (
          <p className="text-sm text-muted-foreground">Carregando vínculo…</p>
        )}

        {!vinculosQ.isLoading && !vinculo && (
          <p className="text-sm text-muted-foreground">
            Esta pessoa ainda não tem vínculo. Salve o vínculo para poder criar o acesso.
          </p>
        )}

        {vinculo && jaTem && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Acesso ativo</Badge>
            <span className="text-sm text-muted-foreground">{email || "sem e-mail registrado"}</span>
          </div>
        )}

        {vinculo && !jaTem && (
          <div className="space-y-2">
            <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
              <Button
                onClick={() => setConfirmando(true)}
                disabled={inativo || !email || criar.isPending}
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
            ) : !email ? (
              <p className="text-sm text-muted-foreground">
                Informe o e-mail corporativo para criar o acesso.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{email}</p>
            )}
          </div>
        )}

        {ativos.length > 1 && (
          <p className="text-sm text-muted-foreground">
            Esta pessoa tem {ativos.length} vínculos ativos. O acesso usa o mais recente
            ({vinculo?.tipo_vinculo}, início {vinculo?.data_inicio}).
          </p>
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
