import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

type Valor = string | number | boolean | null;

/** Converte o texto da URL no tipo do default. */
export function lerValor(bruto: string | null, padrao: Valor): Valor {
  if (bruto === null) return padrao;
  if (typeof padrao === "number") {
    const n = Number(bruto);
    return Number.isFinite(n) ? n : padrao;
  }
  if (typeof padrao === "boolean") return bruto === "1";
  return bruto;
}

/** Valor -> texto da URL; null quando deve sair da URL (igual ao default, null ou ""). */
export function escreverValor(v: Valor, padrao: Valor): string | null {
  if (v === null || v === "" || v === padrao) return null;
  if (typeof v === "boolean") return v ? "1" : "0";
  return String(v);
}

/** Literais do default viram o tipo largo (false → boolean, 1 → number). */
export type Ampliar<T> = {
  [K in keyof T]: T[K] extends boolean ? boolean : T[K] extends number ? number : T[K] extends string ? string : T[K];
};

/**
 * TELA-LEMBRA-ONDE-EU-ESTAVA: estado de navegação (busca, filtros, ordem,
 * página) vive na URL. Default não vai para a URL; chaves fora de `defaults`
 * (aba, estagio, foco) são preservadas.
 */
export function useEstadoTela<T extends Record<string, Valor>>(
  defaults: T,
  opts?: { replaceKeys?: (keyof T)[] },
): [Ampliar<T>, (patch: Partial<Ampliar<T>>) => void] {
  const [params, setParams] = useSearchParams();
  const chaveDefaults = JSON.stringify(defaults);

  const estado = useMemo(() => {
    const out = {} as Record<string, Valor>;
    for (const k of Object.keys(defaults)) out[k] = lerValor(params.get(k), defaults[k]);
    return out as Ampliar<T>;
  }, [params, chaveDefaults]); // eslint-disable-line react-hooks/exhaustive-deps

  const replaceKeys = opts?.replaceKeys;
  const setEstado = useCallback(
    (patch: Partial<Ampliar<T>>) => {
      const chaves = Object.keys(patch);
      const soReplace =
        chaves.length > 0 && chaves.every((k) => replaceKeys?.includes(k as keyof T));
      setParams(
        (atual) => {
          const prox = new URLSearchParams(atual);
          for (const k of chaves) {
            const txt = escreverValor((patch as Record<string, Valor>)[k], defaults[k]);
            if (txt === null) prox.delete(k);
            else prox.set(k, txt);
          }
          return prox;
        },
        { replace: soReplace },
      );
    },
    [setParams, chaveDefaults, replaceKeys], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return [estado, setEstado];
}
