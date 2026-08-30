import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { PapelNivel } from "@/hooks/useConsoleAcesso";

/**
 * CÉLULA DA GRADE (linha × grupo) do Console de Acesso.
 *
 * CONCEITO: nível não é um segundo eixo de permissão. É a alçada DENTRO da
 * concessão que o grupo já deu. A célula responde uma pergunta só: "este grupo
 * pode, e a partir de qual nível". `nivel_minimo` nulo = a concessão do grupo
 * basta (qualquer pessoa do grupo executa).
 *
 * DIMENSÃO-VIA-TABELA: rótulos e números de nível vêm sempre de `papel_nivel`.
 */
interface Props {
  concedido: boolean;
  nivelMinimo: number | null;
  niveis: PapelNivel[];
  desabilitado?: boolean;
  rotuloAria: string;
  onToggle: (valor: boolean) => void;
  onNivel: (nivel: number | null) => void;
}

export default function CelulaConcessao({
  concedido,
  nivelMinimo,
  niveis,
  desabilitado,
  rotuloAria,
  onToggle,
  onNivel,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const nivelAtual = niveis.find((n) => n.nivel === nivelMinimo) ?? null;

  return (
    <div className="flex flex-col items-center gap-1">
      <Checkbox
        checked={concedido}
        disabled={desabilitado}
        onCheckedChange={(v) => onToggle(v === true)}
        aria-label={rotuloAria}
      />
      {concedido && (
        <Popover open={aberto} onOpenChange={setAberto}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={desabilitado}
              className={cn(
                "rounded-full border px-1.5 py-0 text-[10px] leading-4 transition-colors hover:bg-accent",
                nivelAtual
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground",
              )}
              title={
                nivelAtual
                  ? `Executa a partir de ${nivelAtual.rotulo}`
                  : "Qualquer pessoa do grupo executa"
              }
            >
              {nivelAtual ? `${nivelAtual.rotulo}+` : "Todos"}
            </button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-52 p-1">
            <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Alçada mínima
            </p>
            <button
              type="button"
              onClick={() => {
                onNivel(null);
                setAberto(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
            >
              <Check
                className={cn("h-3 w-3", nivelMinimo === null ? "opacity-100" : "opacity-0")}
              />
              Sem exigência de nível
            </button>
            {niveis.map((n) => (
              <button
                key={n.nivel}
                type="button"
                onClick={() => {
                  onNivel(n.nivel);
                  setAberto(false);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
              >
                <Check
                  className={cn(
                    "h-3 w-3",
                    nivelMinimo === n.nivel ? "opacity-100" : "opacity-0",
                  )}
                />
                {n.rotulo}+
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
