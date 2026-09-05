import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { OcultasContagem } from "@/hooks/tarefas/useFiltroNatureza";

interface Props {
  incluirTodas: boolean;
  onChange: (v: boolean) => void;
  incluirPassos?: boolean;
  onChangePassos?: (v: boolean) => void;
  /** quantas tarefas estão sendo deixadas de fora agora, por motivo */
  ocultas: OcultasContagem;
}

/**
 * Controle visível dos dois filtros. O filtro nunca é silencioso:
 * a contagem do que ficou de fora aparece ao lado, separada por motivo.
 */
export function ControleNatureza({
  incluirTodas,
  onChange,
  incluirPassos,
  onChangePassos,
  ocultas,
}: Props) {
  const partes: string[] = [];
  if (ocultas.natureza > 0) partes.push(`${ocultas.natureza} por natureza (épico/backlog)`);
  if (ocultas.passo > 0) partes.push(`${ocultas.passo} por serem passo de outra tarefa`);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        <Switch id="incluir-naturezas" checked={incluirTodas} onCheckedChange={onChange} />
        <Label htmlFor="incluir-naturezas" className="cursor-pointer text-xs font-normal">
          Incluir épicos e backlog
        </Label>
      </div>

      {onChangePassos && (
        <div className="flex items-center gap-2">
          <Switch
            id="incluir-passos"
            checked={!!incluirPassos}
            onCheckedChange={onChangePassos}
          />
          <Label htmlFor="incluir-passos" className="cursor-pointer text-xs font-normal">
            Incluir subtarefas de checklist
          </Label>
        </div>
      )}

      <span className="text-xs text-muted-foreground">
        {partes.length > 0 ? `Fora da lista: ${partes.join(" · ")}` : "nada fora da lista de trabalho"}
      </span>
    </div>
  );
}
