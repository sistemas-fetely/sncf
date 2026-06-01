import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ForcaSenhaIndicator,
  senhaEhForte,
} from "@/components/auth/ForcaSenhaIndicator";

interface Props {
  userId: string;
  nome: string;
}

export function DefinirSenhaButton({ userId, nome }: Props) {
  const [open, setOpen] = useState(false);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [loading, setLoading] = useState(false);

  const invalid = !senhaEhForte(p1) || p1 !== p2;

  const reset = () => {
    setP1("");
    setP2("");
    setLoading(false);
  };

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (invalid) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { action: "definir_senha", user_id: userId, password: p1 },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Senha definida. Informe a senha ao usuário.");
      setOpen(false);
      reset();
    } catch (err: any) {
      const msg = err?.message || "Erro ao definir senha";
      if (msg.toLowerCase().includes("weak") || msg.toLowerCase().includes("known")) {
        toast.error("Senha muito comum/fraca. Escolha outra que atenda todos os critérios.");
      } else {
        toast.error(msg);
      }
      setLoading(false);
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-gold hover:bg-gold/10"
            onClick={() => setOpen(true)}
          >
            <KeyRound className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Definir senha</TooltipContent>
      </Tooltip>

      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Definir senha para {nome}</AlertDialogTitle>
            <AlertDialogDescription>
              Defina uma senha temporária forte e informe ao usuário pessoalmente. Nenhum email será enviado.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="novaSenha">Nova senha</Label>
              <Input
                id="novaSenha"
                type="password"
                value={p1}
                onChange={(e) => setP1(e.target.value)}
                autoComplete="new-password"
              />
              <ForcaSenhaIndicator senha={p1} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmaSenha">Confirmar senha</Label>
              <Input
                id="confirmaSenha"
                type="password"
                value={p2}
                onChange={(e) => setP2(e.target.value)}
                autoComplete="new-password"
              />
              {p2.length > 0 && p1 !== p2 && (
                <p className="text-xs text-destructive">As senhas não coincidem.</p>
              )}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={invalid || loading} onClick={handleConfirm}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Definir senha"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
