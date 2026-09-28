import { useEffect, useRef, useState } from "react";

const EVENTOS_INTERACAO = ["mousemove", "pointerdown", "keydown", "scroll", "touchstart"] as const;

/**
 * Diz se o operador está ocioso: sem interação nos últimos `msLimite` ms E com a
 * aba visível. Serve para a tela decidir se pode se atualizar sozinha sem
 * "puxar o tapete" de quem está no meio de um gesto.
 *
 * Por que ref + intervalo de 1s: mousemove/scroll disparam dezenas de vezes por
 * segundo; gravar em state a cada evento re-renderizaria a tela inteira. O
 * evento só carimba um timestamp no ref, e o intervalo leve reavalia uma vez
 * por segundo — o state só muda quando o boolean de fato vira.
 */
export function useOciosidade(msLimite = 5000): boolean {
  const ultimaInteracao = useRef(Date.now());
  const [ocioso, setOcioso] = useState(false);

  useEffect(() => {
    const carimbar = () => {
      ultimaInteracao.current = Date.now();
    };
    // capture: true porque scroll não borbulha — rolagem dentro de um contêiner
    // interno (tabela, lista) só chega até ele na fase de captura.
    // passive: só carimbamos; nunca bloqueia o scroll do navegador.
    EVENTOS_INTERACAO.forEach((ev) =>
      window.addEventListener(ev, carimbar, { passive: true, capture: true })
    );

    const avaliar = () => {
      const visivel = document.visibilityState === "visible";
      const parado = Date.now() - ultimaInteracao.current >= msLimite;
      const agora = visivel && parado;
      // setState com o mesmo valor não re-renderiza; a função só troca quando vira.
      setOcioso((antes) => (antes === agora ? antes : agora));
    };
    // Aba voltando ao primeiro plano conta como interação: quem acabou de voltar
    // ainda está olhando a tela, não é hora de atualizar debaixo dele.
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible") carimbar();
      avaliar();
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    const id = window.setInterval(avaliar, 1000);

    return () => {
      EVENTOS_INTERACAO.forEach((ev) => window.removeEventListener(ev, carimbar));
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      window.clearInterval(id);
    };
  }, [msLimite]);

  return ocioso;
}
