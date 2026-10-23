import { MutationCache, type Query, type QueryClient } from "@tanstack/react-query";

/**
 * Queries com meta.pesada ficam fora da rede de segurança e dependem de
 * invalidarPedido / invalidações do próprio hook. Lista mantida pela frente
 * VELOCIDADE (Registro de Frentes).
 */
export const entraNaRedeDeSeguranca = (q: Query) => q.meta?.pesada !== true;

/** MutationCache da rede de segurança: toda mutation bem-sucedida invalida as queries leves. */
export function criarMutationCacheRedeSeguranca(getClient: () => QueryClient) {
  return new MutationCache({
    onSuccess: () => {
      void getClient().invalidateQueries({ predicate: entraNaRedeDeSeguranca });
    },
  });
}
