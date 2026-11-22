import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Previa = { projeto: string; tarefas: number; abertas: number; secoes: number; itens_gestao: number; pode_excluir: boolean };
type Resultado = { projeto: string; tarefas_excluidas: number; secoes_excluidas: number; excluido: boolean };

/** Menu "⋯" com "Excluir projeto" — a permissão e a exclusão são do banco (fn_excluir_projeto). */
export function ExcluirProjetoMenu({
  projeto, voltarParaLista = false,
}: {
  projeto: { id: string; nome: string; responsavel_id: string | null; criado_por: string | null };
  voltarParaLista?: boolean;
}) {
  const { user, hasAnyRole } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [texto, setTexto] = useState("");

  const podeVer = hasAnyRole(["super_admin"]) || (!!user?.id && (projeto.responsavel_id === user.id || projeto.criado_por === user.id));

  const excluir = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("fn_excluir_projeto", { _projeto_id: projeto.id, _confirmar: true });
      if (error) throw error;
      return data as unknown as Resultado;
    },
    onSuccess: async (r) => {
      toast.success(`Projeto ${r?.projeto ?? projeto.nome} excluído (${r?.tarefas_excluidas ?? 0} tarefas)`);
      setPrevia(null);
      // Lista de projetos, minhas tarefas, hoje, dash e calendário vivem sob ["tarefas"].
      if (voltarParaLista) navigate("/tarefas/projetos", { replace: true });
      await qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e) => toast.error(formatError(e)),
  });

  if (!podeVer) return null;

  const abrir = async () => {
    setCarregando(true);
    try {
      const { data, error } = await supabase.rpc("fn_excluir_projeto", { _projeto_id: projeto.id, _confirmar: false });
      if (error) throw error;
      setTexto("");
      setPrevia(data as unknown as Previa);
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setCarregando(false);
    }
  };

  const nome = previa?.projeto ?? projeto.nome;
  const confere = texto === nome;

  return (
    <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais ações do projeto">
            {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void abrir()}>
            <Trash2 className="mr-2 h-4 w-4" /> Excluir projeto
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!previa} onOpenChange={(v) => { if (!v && !excluir.isPending) setPrevia(null); }}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Vai apagar {previa?.tarefas ?? 0} tarefas ({previa?.abertas ?? 0} ainda abertas) e {previa?.secoes ?? 0} seções. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {previa && !previa.pode_excluir && (
            <p className="text-sm text-destructive">
              Este projeto tem {previa.itens_gestao} itens de gestão (decisão, risco ou pauta de reunião) vinculados. Desvincule antes de excluir.
            </p>
          )}
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">Digite o nome do projeto para confirmar:</p>
            <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={nome} disabled={!previa?.pode_excluir || excluir.isPending} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluir.isPending}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={!previa?.pode_excluir || !confere || excluir.isPending} onClick={() => excluir.mutate()}>
              {excluir.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Excluir projeto
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  );
}
