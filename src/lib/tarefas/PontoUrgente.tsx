/**
 * Ponto de 6px que carrega o sinal de URGENTE sem pintar o texto — usado na lista
 * de passos e dentro do chip fechado, para o sinal atravessar o card colapsado.
 *
 * Alinhamento: `mt-1` põe o ponto no eixo da PRIMEIRA linha do título (texto de
 * 11px), o mesmo eixo do `Checkbox` irmão em containers `items-start`. Dentro de
 * containers `items-center` (o chip) a margem é neutra.
 */
export function PontoUrgente({ label }: { label: string }) {
  return (
    <span
      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
      title={label}
      aria-label={label}
    />
  );
}
