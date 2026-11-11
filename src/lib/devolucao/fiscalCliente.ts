export function estadoFiscalCliente(sugeridoId: string | null | undefined, confirmado: boolean, grau: string | null | undefined) {
  return {
    confirmar: !!sugeridoId && !confirmado,
    ocultarGerar: !!sugeridoId || confirmado,
    grau: grau === "parcial" ? "parcial" as const : "total" as const,
  };
}