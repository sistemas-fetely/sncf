import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { OcultasContagem } from "@/hooks/tarefas/useFiltroNatureza";

interface Props {
  incluirTodas: boolean;
  onChange: (v: boolean) => void;
  /** quantas tarefas estão sendo deixadas de fora agora, por motivo */
  ocultas: OcultasContagem;
}

/**
 * Controle visível do filtro das listas de trabalho. Um único interruptor
 * inclui tudo; a contagem do que ficou de fora aparece ao lado, separada
 * por motivo — natureza (épico/backlog) e passo de outra tarefa.
 */
export function ControleNatureza({ incluirTodas, onChange, ocultas }: Props) {
  const partes: string[] = [];
  if (ocultas.porNatureza > 0) partes.push(`${ocultas.porNatureza} épicos/backlog`);
  if (ocultas.porSerPasso > 0) partes.push(`${ocultas.porSerPasso} passos de outra tarefa`);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        <Switch id="incluir-naturezas" checked={incluirTodas} onCheckedChange={onChange} />
        <Label htmlFor="incluir-naturezas" className="cursor-pointer text-xs font-normal">
          Incluir épicos, backlog e passos de outras tarefas
        </Label>
      </div>

      <span className="text-xs text-muted-foreground">
        {partes.length > 0 ? `Fora da lista: ${partes.join(" · ")}` : "nada fora da lista de trabalho"}
      </span>
    </div>
  );
}
