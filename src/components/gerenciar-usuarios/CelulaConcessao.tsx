import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, SlidersHorizontal } from "lucide-react";
import type { PapelNivel } from "@/hooks/useConsoleAcesso";

/**
 * CÉLULA DA GRADE (linha × grupo) do Console de Acesso.
 *
 * CONCEITO: nível não é um segundo eixo de permissão. É a alçada DENTRO da
 * concessão que o grupo já deu. A célula responde uma pergunta só: "este grupo
 * pode, e a partir de qual nível". `nivel_minimo` nulo = a concessão do grupo
 * basta (qualquer pessoa do grupo executa).
 *
 * APRESENTAÇÃO: alçada nula é o caso comum, então não ganha chip — só o
 * checkbox. Alçada definida é exceção e aparece como chip "{rótulo}+". Para
 * definir a alçada numa célula sem chip existe um botão discreto que aparece no
 * hover E no foco (caminho de teclado garantido: o botão está na ordem de tab).
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
    <div className="group/celula flex flex-col items-center gap-0.5">
      <Checkbox
        checked={concedido}
        disabled={desabilitado}
        onCheckedChange={(v) => onToggle(v === true)}
        aria-label={rotuloAria}
      />
      {concedido && (
        <Popover open={aberto} onOpenChange={setAberto}>
          <PopoverTrigger asChild>
            {nivelAtual ? (
              <button
                type="button"
                disabled={desabilitado}
                className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0 text-[10px] leading-4 text-primary transition-colors hover:bg-primary/20"
                title={`Executa a partir de ${nivelAtual.rotulo}. Clique para alterar a alçada.`}
                aria-label={`Alçada mínima de ${rotuloAria}: ${nivelAtual.rotulo}`}
              >
                {nivelAtual.rotulo}+
              </button>
            ) : (
              <button
                type="button"
                disabled={desabilitado}
                className={cn(
                  "rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent",
                  "group-hover/celula:opacity-100 focus-visible:opacity-100 focus:opacity-100",
                  aberto && "opacity-100",
                )}
                title="Definir alçada mínima (hoje qualquer pessoa do grupo executa)"
                aria-label={`Definir alçada mínima de ${rotuloAria}`}
              >
                <SlidersHorizontal className="h-3 w-3" />
              </button>
            )}
          </PopoverTrigger>
          <PopoverContent align="center" className="z-50 w-52 p-1">
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
