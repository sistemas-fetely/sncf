import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidarTabelas } from "@/lib/cacheKeys";

/**
 * Escrita que invalida sozinha.
 *
 * `db.from("vinculos").update(...).eq(...)` funciona exatamente como o client
 * normal — mesmo encadeamento, mesmo formato de retorno, mesma semântica de
 * erro. A única diferença: quando a promessa resolve SEM erro, as chaves de
 * cache que dependem da tabela são invalidadas (ver src/lib/cacheKeys.ts).
 *
 * Adoção é opt-in, arquivo por arquivo. O client global segue intacto.
 */

const ESCRITAS = ["insert", "update", "delete", "upsert"] as const;

/**
 * O builder do PostgREST é "thenable" e devolve a si mesmo nos filtros
 * (.eq, .select, .single…). Envolvemos num Proxy que só troca o `then`:
 * os filtros continuam intactos e a invalidação acontece uma vez, na resolução.
 */
function envolverBuilder(builder: any, aoConcluir: () => void): any {
  return new Proxy(builder, {
    get(alvo, prop, receiver) {
      const valor = Reflect.get(alvo, prop, alvo);

      if (prop === "then") {
        return (onOk?: any, onErr?: any) =>
          alvo.then((resultado: any) => {
            // Erro não invalida e não é engolido — vai ao chamador como sempre.
            if (!resultado?.error) aoConcluir();
            return onOk ? onOk(resultado) : resultado;
          }, onErr);
      }

      if (typeof valor === "function") {
        return (...args: any[]) => {
          const retorno = valor.apply(alvo, args);
          // Filtros devolvem builder (às vezes o próprio) — seguem embrulhados.
          if (retorno && (typeof retorno === "object" || typeof retorno === "function") && typeof retorno.then === "function") {
            return retorno === alvo ? receiver : envolverBuilder(retorno, aoConcluir);
          }
          return retorno;
        };
      }

      return valor;
    },
  });
}

export function useDb() {
  const qc = useQueryClient();

  return useMemo(
    () => ({
      from(tabela: string) {
        const base = (supabase as any).from(tabela);
        const aoConcluir = () => {
          void invalidarTabelas(qc, [tabela]);
        };

        return new Proxy(base, {
          get(alvo, prop, receiver) {
            const valor = Reflect.get(alvo, prop, alvo);
            if (typeof valor === "function" && (ESCRITAS as readonly string[]).includes(prop as string)) {
              return (...args: any[]) => envolverBuilder(valor.apply(alvo, args), aoConcluir);
            }
            if (typeof valor === "function") return valor.bind(alvo);
            return valor;
          },
        }) as any;
      },
    }),
    [qc],
  );
}
