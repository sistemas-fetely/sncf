/**
 * Aba "Extrato mensal" de Comissões — somente consulta dos extratos congelados.
 * O bloco "Pagamento de MM/AAAA" (base liberação, `vw_comissao_extrato_mensal`) foi aposentado:
 * "o que pagar a quem e quando" vive só em Representantes · Ciclo mensal (base extrato).
 */
import { ExtratosFechados } from "./AcoesPagamento";

export function AbaExtrato() {
  return <ExtratosFechados />;
}
