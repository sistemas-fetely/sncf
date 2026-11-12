import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { VariacaoCatalogo } from "@/lib/chamados/catalogoVariacoes";

export function SelecionarVariacao({ variacoes, selecionada, onSelecionar }: {
  variacoes: VariacaoCatalogo[];
  selecionada: VariacaoCatalogo | null;
  onSelecionar: (variacao: VariacaoCatalogo) => void;
}) {
  if (!variacoes.length) return null;
  return (
    <div className="space-y-2">
      <Label>O que está errado? *</Label>
      <div className="grid grid-cols-2 gap-2">
        {variacoes.map((v) => (
          <Button key={v.codigo} type="button" variant="outline" aria-pressed={selecionada?.codigo === v.codigo}
            onClick={() => onSelecionar(v)}
            className={cn("h-full min-w-0 flex-col items-start whitespace-normal p-3 text-left hover:border-primary/50",
              selecionada?.codigo === v.codigo && "border-primary bg-primary/5")}>
            <span className="text-sm font-medium">{v.nome}</span>
            {v.descricao && <span className="mt-1 text-xs font-normal text-muted-foreground">{v.descricao}</span>}
          </Button>
        ))}
      </div>
    </div>
  );
}