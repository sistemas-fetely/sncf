import type { ReactNode } from "react";

/** Linha "Para que serve" — primeiro elemento de toda aba da Chegada de Mercadoria. */
export function ParaQueServe({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground max-w-3xl">{children}</p>;
}
