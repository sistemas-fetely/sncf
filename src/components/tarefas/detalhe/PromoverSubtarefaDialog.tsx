import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjetos, useSecoes } from "@/hooks/tarefas/useTarefasCatalogos";
import { usePromoverTarefa } from "@/hooks/tarefas/useTarefaHierarquia";
import { Campo, SEM_VALOR } from "./comuns";

interface Props {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  subtarefa: { id: string; titulo: string; projeto_id: string | null; secao_id: string | null } | null;
}

/**
 * Promover subtarefa a tarefa principal. Projeto/seção vêm pré-preenchidos com
 * o endereço herdado da mãe; nulos, a RPC mantém o que já existia.
 */
export function PromoverSubtarefaDialog({ aberto, onOpenChange, subtarefa }: Props) {
  const { data: projetos } = useProjetos();
  const promover = usePromoverTarefa();
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [secaoId, setSecaoId] = useState<string | null>(null);
  const [manterVinculo, setManterVinculo] = useState(true);
  const { data: secoes } = useSecoes(projetoId);

  useEffect(() => {
    if (!aberto) return;
    setProjetoId(subtarefa?.projeto_id ?? null);
    setSecaoId(subtarefa?.secao_id ?? null);
    setManterVinculo(true);
  }, [aberto, subtarefa?.projeto_id, subtarefa?.secao_id]);

  if (!subtarefa) return null;

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promover “{subtarefa.titulo}” a tarefa principal</DialogTitle>
          <DialogDescription>
            Ela deixa de ser passo desta tarefa e passa a valer sozinha no board.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Projeto">
            <Select
              value={projetoId ?? SEM_VALOR}
              onValueChange={(v) => {
                // seção pertence a um projeto: trocar de projeto invalida a antiga
                setProjetoId(v === SEM_VALOR ? null : v);
                setSecaoId(null);
              }}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sem projeto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>— sem projeto —</SelectItem>
                {(projetos ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>

          <Campo rotulo="Seção">
            <Select
              value={secaoId ?? SEM_VALOR}
              disabled={!projetoId}
              onValueChange={(v) => setSecaoId(v === SEM_VALOR ? null : v)}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sem seção" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>— sem seção —</SelectItem>
                {(secoes ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        </div>

        {!projetoId && (
          <p className="text-[11px] text-muted-foreground">
            Sem projeto ela vira tarefa pessoal: aparece só em Minhas Tarefas, em
            nenhum board.
          </p>
        )}

        <label className="flex items-start gap-2">
          <Checkbox
            className="mt-0.5"
            checked={manterVinculo}
            onCheckedChange={(v) => setManterVinculo(v === true)}
          />
          <span className="space-y-0.5">
            <Label className="cursor-pointer">Manter vínculo com a tarefa mãe</Label>
            <p className="text-[11px] text-muted-foreground">
              A tarefa mãe fica bloqueada até esta ser concluída.
            </p>
          </span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={promover.isPending}
            onClick={async () => {
              try {
                await promover.mutateAsync({
                  tarefaId: subtarefa.id,
                  projetoId,
                  secaoId,
                  manterVinculo,
                });
                onOpenChange(false);
              } catch {
                // toast já exibido pelo hook; o diálogo fica aberto para corrigir
              }
            }}
          >
            Promover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
