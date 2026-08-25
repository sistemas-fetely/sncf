import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * useAbaUrl — aba da tela vive na URL, em `?aba=`.
 *
 * ABA-VIA-URL (23/08/2026). Antes cada tela inventava a sua: `?tab=`,
 * `?aba=`, `?modulo=`, ou `useState` sem URL nenhuma (a aba se perdia no F5 e
 * não dava pra mandar link). Cinco convenções para a mesma coisa — a mesma
 * dívida de "regra em código, não em lugar único" que o projeto já matou
 * várias vezes.
 *
 * Uso: troca direta de useState.
 *   const [aba, setAba] = useState("mesa")   ->   useAbaUrl("mesa")
 *
 * A aba padrão não suja a URL: selecionar a primeira aba REMOVE o parâmetro,
 * em vez de escrever `?aba=padrao`. URL limpa é a que se compartilha.
 *
 * `replace: true` por padrão: trocar de aba não empilha histórico, então o
 * botão Voltar do navegador sai da tela em vez de percorrer as abas uma a uma.
 *
 * PARAMETRO PROPRIO PARA TELA EMBUTIDA: tela que roda DENTRO de outra que também
 * usa useAbaUrl precisa de um param diferente, senão o filho sobrescreve o ?aba= do
 * pai e o pai deixa de reconhecer a própria aba — resultado: tela em branco.
 * Foi o que aconteceu com CreditoClientesIndex dentro de CobrancaFila (25/08/2026).
 *
 * @param abaPadrao  aba mostrada quando não há `?aba=` na URL
 * @param legado     nome antigo do parâmetro, se a tela já usava outro
 *                   (ex: "tab", "modulo") — lido como fallback para não
 *                   quebrar link salvo. Nunca é escrito.
 * @param param      nome do parâmetro de URL (padrão: "aba")
 */
export function useAbaUrl(
  abaPadrao: string,
  legado?: string,
  param: string = "aba"
): [string, (nova: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const atual =
    searchParams.get(param) ??
    (legado ? searchParams.get(legado) : null) ??
    abaPadrao;

  const definir = useCallback(
    (nova: string) => {
      const next = new URLSearchParams(searchParams);
      // O parâmetro legado morre no primeiro clique — some da URL.
      if (legado) next.delete(legado);
      if (nova === abaPadrao) next.delete(param);
      else next.set(param, nova);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, abaPadrao, legado, param]
  );

  return [atual, definir];
}
