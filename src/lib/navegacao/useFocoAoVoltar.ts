import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Ao voltar do detalhe, rola até a linha `[data-foco-id]` do item aberto,
 * destaca por 2 s e limpa `?foco` da URL (replace).
 */
export function useFocoAoVoltar({
  pronto,
  idsVisiveis,
  aoNaoEncontrar,
  focoParam = "foco",
}: {
  /** Parâmetro do foco na URL (tela embutida usa um próprio, ex.: "mc_foco"). */
  focoParam?: string;
  pronto: boolean;
  idsVisiveis: string[];
  aoNaoEncontrar?: (id: string) => void;
}) {
  const [params, setParams] = useSearchParams();
  const foco = params.get(focoParam);
  const cbRef = useRef(aoNaoEncontrar);
  cbRef.current = aoNaoEncontrar;
  const chaveIds = idsVisiveis.join("|");

  useEffect(() => {
    if (!pronto || !foco) return;
    const limpar = () =>
      setParams(
        (a) => {
          const p = new URLSearchParams(a);
          p.delete(focoParam);
          return p;
        },
        { replace: true },
      );
    if (idsVisiveis.includes(foco)) {
      const el = document.querySelector<HTMLElement>(
        `[data-foco-id="${CSS.escape(foco)}"]`,
      );
      if (el) {
        el.scrollIntoView({ block: "center" });
        el.classList.add("foco-navegacao");
        setTimeout(() => el.classList.remove("foco-navegacao"), 2000);
      }
    } else {
      cbRef.current?.(foco);
    }
    limpar();
  }, [pronto, foco, chaveIds]); // eslint-disable-line react-hooks/exhaustive-deps
}
