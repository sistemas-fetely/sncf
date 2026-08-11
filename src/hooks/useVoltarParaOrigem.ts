import { useLocation } from "react-router-dom";

/**
 * Devolve a rota de origem passada via navigate(..., { state: { from } }).
 *
 * Mesma semantica do SmartBackButton, para uso em mutation hooks: depois de
 * gravar, o operador volta para onde ele estava, nao para um destino cravado.
 * Quem abre cobranca pela Casa dos Pedidos passa from="/pedidos"; quem abre
 * pela Fila de Cobranca passa from="/recebimento/cobranca".
 *
 * Cai no fallback so quando a tela foi aberta por URL digitada.
 */
export function useVoltarParaOrigem(fallback: string): string {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return from || fallback;
}
