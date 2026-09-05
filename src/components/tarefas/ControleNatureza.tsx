import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Props {
  incluirTodas: boolean;
  onChange: (v: boolean) => void;
  /** quantas tarefas estão sendo deixadas de fora agora */
  ocultas: number;
}

/**
 * Controle visível do filtro de natureza. O filtro nunca é silencioso:
 * a contagem do que ficou de fora aparece ao lado.
 */
export function ControleNatureza({ incluirTodas, onChange, ocultas }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Switch id="incluir-naturezas" checked={incluirTodas} onCheckedChange={onChange} />
      <Label htmlFor="incluir-naturezas" className="cursor-pointer text-xs font-normal">
        Incluir épicos e backlog
      </Label>
      <span className="text-xs text-muted-foreground">
        {incluirTodas
          ? "mostrando tudo"
          : ocultas > 0
            ? `${ocultas} fora da lista de trabalho`
            : "nada fora da lista de trabalho"}
      </span>
    </div>
  );
}
