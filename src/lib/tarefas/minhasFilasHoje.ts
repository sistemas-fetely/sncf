import type { Database } from "@/integrations/supabase/types";

export type MinhaFilaHoje = Database["public"]["Views"]["vw_minhas_filas_hoje"]["Row"];

const PRIORIDADE: Record<string, number> = { critica: 0, alta: 1, normal: 2, baixa: 3 };

export function ordenarMinhasFilasHoje(filas: readonly MinhaFilaHoje[], mostrarVazias = false): MinhaFilaHoje[] {
  return filas.filter((fila) => mostrarVazias || (fila.itens_total ?? 0) > 0).sort((a, b) => {
    const vaziaA = (a.itens_total ?? 0) === 0;
    const vaziaB = (b.itens_total ?? 0) === 0;
    if (vaziaA !== vaziaB) return vaziaA ? 1 : -1;
    return (b.itens_vencidos ?? 0) - (a.itens_vencidos ?? 0)
      || (PRIORIDADE[a.severidade ?? "normal"] ?? 2) - (PRIORIDADE[b.severidade ?? "normal"] ?? 2)
      || (b.itens_total ?? 0) - (a.itens_total ?? 0);
  });
}

export function resumirMinhasFilasHoje(filas: readonly MinhaFilaHoje[]) {
  return filas.reduce((resumo, fila) => ({
    filas: resumo.filas + 1,
    vencidos: resumo.vencidos + (fila.itens_vencidos ?? 0),
    divida: resumo.divida + (fila.itens_divida ?? 0),
  }), { filas: 0, vencidos: 0, divida: 0 });
}