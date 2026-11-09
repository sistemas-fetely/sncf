/** Decide qual correção a Conciliação de Estoque oferece para uma linha centro × SKU. */
export type LinhaCorrecao = {
  fonte_real: "armazem" | "contagem" | "sem_contagem" | null;
  contagem_vencida: boolean | null;
  real: number | null;
  fiscal: number | null;
  correcao: string | null;
};

export type TipoCorrecao =
  | "aplicar_contagem" | "aplicar_contagem_sem_permissao" | "notas_sem_baixa"
  | "ajustar_armazem" | "ajustar_armazem_sem_permissao" | "contar_inventario" | "canais" | "nenhuma";

const n0 = (v: number | null | undefined) => Number(v ?? 0);

/** Contagem válida (não vencida) cujo real difere do fiscal. */
export function contagemValidaComDiferenca(c: LinhaCorrecao): boolean {
  return c.fonte_real === "contagem" && !c.contagem_vencida && c.real !== null && n0(c.real) !== n0(c.fiscal);
}

export function decidirCorrecao(c: LinhaCorrecao, isSuperAdmin: boolean): TipoCorrecao {
  if (contagemValidaComDiferenca(c)) return isSuperAdmin ? "aplicar_contagem" : "aplicar_contagem_sem_permissao";
  if (c.correcao === "notas_sem_baixa") return "notas_sem_baixa";
  if (c.correcao === "ajustar_armazem") return isSuperAdmin ? "ajustar_armazem" : "ajustar_armazem_sem_permissao";
  if (c.correcao === "contagem" && (c.fonte_real === "sem_contagem" || (c.fonte_real === "contagem" && !!c.contagem_vencida)))
    return "contar_inventario";
  if (c.correcao === "canais") return "canais";
  return "nenhuma";
}
