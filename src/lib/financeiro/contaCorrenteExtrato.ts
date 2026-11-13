import type { Tables } from "@/integrations/supabase/types";

export type MovimentoContaCorrente = Tables<"vw_conta_corrente_extrato">;

export function resumirExtratoFornecedor(movimentos: MovimentoContaCorrente[]) {
  let saldo = 0;
  let documentos = 0;
  let pagamentos = 0;
  const linhas = movimentos.map((movimento) => {
    saldo += Number(movimento.valor ?? 0);
    if (movimento.tipo === "documento") documentos += 1;
    if (movimento.tipo === "abatimento") pagamentos += 1;
    return { movimento, saldo };
  });
  return { linhas, saldo, documentos, pagamentos };
}