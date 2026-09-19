/**
 * FONTE ÚNICA da prioridade de tarefa — rótulo, selo e o ponto de urgente.
 *
 * Prioridade é DADO CADASTRAL, não estado: descreve a tarefa, não o ponto do
 * fluxo em que ela está. `media` é o default da coluna `tarefas.prioridade` e
 * responde por 76% das tarefas — selo em quase tudo é ruído, não sinal. Por isso
 * `media` NÃO tem classe aqui: AUSÊNCIA DE SELO SIGNIFICA MÉDIA.
 *
 * Este módulo existe porque a regra estava copiada em cada tela: mudar o board não
 * mudava o resto. Quem pinta prioridade importa daqui — não declara mapa próprio.
 * Só tokens (`destructive`, `warning`, `muted`); `media` não recebe cor nem `info`.
 *
 * O arquivo é `.tsx` (e não `.ts`) porque o `PontoUrgente` mora aqui: a regra e o
 * sinal visual dela na mesma porta de entrada.
 */
import { cn } from "@/lib/utils";

export const PRIORIDADE_ROTULO: Record<string, string> = {
  urgente: "Urgente",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

/** Sem a chave `media` de propósito: ausência de classe = ausência de selo. */
export const PRIORIDADE_CLASSE: Record<string, string> = {
  urgente: "border-destructive/40 bg-destructive/10 text-destructive",
  alta: "border-warning/40 bg-warning/10 text-warning",
  baixa: "border-border bg-muted text-muted-foreground",
};

/** Média é o default do cadastro: mostrar selo nela seria pintar o silêncio. */
export function mostrarSeloPrioridade(p: string): boolean {
  return p !== "media";
}

/**
 * Ponto de 6px que carrega o sinal de URGENTE sem pintar o texto — na lista de
 * passos e dentro do chip fechado, para o sinal atravessar o card colapsado.
 *
 * O default `mt-1` põe o ponto no eixo da PRIMEIRA linha do título (texto de
 * 11px), mesmo eixo do `Checkbox` irmão em container `items-start`. Em container
 * já centrado (o chip `0/2`) quem chama passa `className="mt-0"`.
 */
export function PontoUrgente({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive", className)}
      title={label}
      aria-label={label}
    />
  );
}
