import type { QueryClient } from "@tanstack/react-query";

export const QK_VD_GESTAO = ["venda-direta-gestao"] as const;
export const QK_VD_GAVETA = ["venda-direta-gaveta"] as const;

export async function invalidarVendaDireta(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: QK_VD_GESTAO }),
    queryClient.invalidateQueries({ queryKey: QK_VD_GAVETA }),
  ]);
}