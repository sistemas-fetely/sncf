import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { UserPlus, Loader2, CheckCircle2, MoreHorizontal, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errorMessages";
import { ReenviarLinkAcessoButton } from "@/components/auth/ReenviarLinkAcessoButton";

interface CriarUsuarioAcessoButtonProps {
  colaboradorId: string;
  colaboradorTipo: "clt" | "pj";
  email: string;
  nome: string;
  status: string;
  userId: string | null;
  onChange?: () => void;
}

const STATUS_PERMITIDOS = ["ativo", "experiencia", "rascunho"];

export function CriarUsuarioAcessoButton({
  colaboradorId,
  colaboradorTipo,
  email,
  nome,
  status,
  userId,
  onChange,
}: CriarUsuarioAcessoButtonProps) {
  const { roles: authRoles } = useAuth();
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const isAdminRH = (authRoles ?? []).includes("admin_rh") || (authRoles ?? []).includes("rh" as never);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [banConfirmOpen, setBanConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const isAdmin = isSuperAdmin || isAdminRH;
  if (!isAdmin) return null;

  // Já tem usuário vinculado → mostra badge + menu
  if (userId) {
    return (
      <>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-success" />
            Acesso ativo
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
                <ReenviarLinkAcessoButton userId={userId} nome={nome} variant="inline" />
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setBanConfirmOpen(true)}
              >
                <ShieldOff className="mr-2 h-4 w-4" /> Inativar acesso
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <AlertDialog open={banConfirmOpen} onOpenChange={setBanConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Inativar acesso de {nome}?</AlertDialogTitle>
              <AlertDialogDescription>
                O usuário não conseguirá mais acessar o sistema. O cadastro do colaborador
                será mantido. Você pode reativar o acesso a qualquer momento em
                Gerenciar Usuários.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={loading}
                onClick={async (e) => {
                  e.preventDefault();
                  setLoading(true);
                  try {
                    const { error } = await supabase.functions.invoke("manage-user", {
                      body: { action: "toggle_ban", user_id: userId, ban: true },
                    });
                    if (error) throw error;
                    toast.success("Acesso inativado");
                    setBanConfirmOpen(false);
                    onChange?.();
                  } catch (err: any) {
                    toast.error("Erro ao inativar acesso: " + humanizeError(err?.message));
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Inativar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Sem usuário e status válido → mostra botão criar
  if (!STATUS_PERMITIDOS.includes(status)) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        className="gap-2"
      >
        <UserPlus className="h-4 w-4" /> Criar Usuário de Acesso
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Criar usuário de acesso para {nome}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Será criado um usuário de acesso ao sistema para este colaborador.</p>
                <p>
                  Um e-mail será enviado para <strong>{email}</strong> com instruções para
                  definir senha.
                </p>
                <p className="text-sm">
                  Perfil que será atribuído: <strong>Colaborador</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  Você pode ajustar o perfil depois em Gerenciar Usuários.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={async (e) => {
                e.preventDefault();
                if (!email) {
                  toast.error("Colaborador sem e-mail. Cadastre um e-mail antes de criar acesso.");
                  return;
                }
                setLoading(true);
                try {
                  const { data, error } = await supabase.functions.invoke("manage-user", {
                    body: {
                      action: "create_user_standalone",
                      email,
                      full_name: nome,
                      roles: ["colaborador"],
                      colaborador_id: colaboradorId,
                      colaborador_tipo: colaboradorTipo,
                    },
                  });
                  if (error) throw error;
                  if ((data as any)?.error) throw new Error((data as any).error);
                  toast.success(`Usuário criado e e-mail enviado para ${email}`);
                  setConfirmOpen(false);
                  onChange?.();
                } catch (err: any) {
                  toast.error("Erro ao criar usuário: " + humanizeError(err?.message));
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Usuário"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
