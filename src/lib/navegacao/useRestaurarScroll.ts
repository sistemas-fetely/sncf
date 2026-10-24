import { useEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router-dom";

const PREFIXO = "scroll:";

/** Chave = pathname + search sem `foco`. */
export function chaveScroll(pathname: string, search: string): string {
  const p = new URLSearchParams(search);
  p.delete("foco");
  p.delete("mc_foco");
  const s = p.toString();
  return PREFIXO + pathname + (s ? `?${s}` : "");
}

/**
 * Salva a rolagem da lista (throttle 100 ms + unmount) e restaura uma vez
 * quando `pronto` vira true. Com `?foco`, não restaura: o foco manda.
 * ref null → usa a janela.
 */
export function useRestaurarScroll(ref: RefObject<HTMLElement> | null, pronto: boolean) {
  const { pathname, search } = useLocation();
  const chave = chaveScroll(pathname, search);
  const temFoco = (() => {
    const q = new URLSearchParams(search);
    return q.has("foco") || q.has("mc_foco");
  })();
  const restaurou = useRef(false);

  useEffect(() => {
    const alvo: HTMLElement | Window = ref?.current ?? window;
    const ler = () => (alvo === window ? window.scrollY : (alvo as HTMLElement).scrollTop);
    const salvar = () => sessionStorage.setItem(chave, String(ler()));
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        salvar();
      }, 100);
    };
    alvo.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      alvo.removeEventListener("scroll", onScroll);
      if (t) clearTimeout(t);
      salvar();
    };
  }, [chave, ref]);

  useEffect(() => {
    if (!pronto || restaurou.current) return;
    restaurou.current = true;
    if (temFoco) return;
    const salvo = sessionStorage.getItem(chave);
    if (salvo === null) return;
    const y = Number(salvo);
    const el = ref?.current;
    if (el) el.scrollTop = y;
    else window.scrollTo(0, y);
  }, [pronto]); // eslint-disable-line react-hooks/exhaustive-deps
}
