import { ComponentType, lazy } from "react";

const CHAVE_RETRY = "sncf:chunk-retry";

/**
 * React.lazy com recuperação de chunk órfão.
 *
 * Deploy novo troca os hashes dos arquivos de chunk. Uma aba que carregou o
 * index.html antigo conhece só os hashes antigos, então o import dinâmico
 * falha e a tela nunca monta — o usuário clica e não abre nada.
 *
 * Aqui: na primeira falha, recarrega a página uma vez (o index.html novo traz
 * os hashes novos). Falha na segunda tentativa é erro de verdade e sobe —
 * FAIL-LOUD, sem loop de reload.
 */
export function lazyComRetry<T extends ComponentType<any>>(
  importar: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const mod = await importar();
      // Carregou: limpa a flag para a próxima falha ter direito a retry.
      sessionStorage.removeItem(CHAVE_RETRY);
      return mod;
    } catch (erro) {
      const jaTentou = sessionStorage.getItem(CHAVE_RETRY);
      if (jaTentou) {
        // Segunda falha na mesma sessão: não é deploy, é erro real.
        sessionStorage.removeItem(CHAVE_RETRY);
        throw erro;
      }
      sessionStorage.setItem(CHAVE_RETRY, "1");
      window.location.reload();
      // reload é assíncrono: segura a Promise pendente para o React não
      // renderizar estado de erro no meio do caminho.
      return new Promise<{ default: T }>(() => {});
    }
  });
}
