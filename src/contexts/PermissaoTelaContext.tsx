import { createContext, useContext, type ReactNode } from "react";
import { usePermissoesTela, type VerbosTela } from "@/hooks/usePermissoesTela";

// MODO-LEITURA-NAO-ESCONDE-DADO: a tela mostra tudo; o que desaparece e o poder
// de mudar. Quem nao deve ver resolve em permissao de tela e RLS.

const PermissaoTelaContext = createContext<VerbosTela | null>(null);

export function PermissaoTelaProvider({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const verbos = usePermissoesTela(slug);
  return (
    <PermissaoTelaContext.Provider value={verbos}>
      {children}
    </PermissaoTelaContext.Provider>
  );
}

export function usePermissaoTelaContext(): VerbosTela {
  const ctx = useContext(PermissaoTelaContext);
  if (!ctx) {
    throw new Error(
      "usePermissaoTelaContext precisa estar dentro de <PermissaoTelaProvider>",
    );
  }
  return ctx;
}

/** Renderiza os filhos apenas quando a pessoa pode editar. */
export function SomenteLeitura({ children }: { children: ReactNode }) {
  const { podeEditar } = usePermissaoTelaContext();
  if (!podeEditar) return null;
  return <>{children}</>;
}

/** Faixa discreta e informativa — sem ícone de erro, sem toast. */
export function AvisoSomenteLeitura() {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      Você está vendo esta tela em modo leitura.
    </div>
  );
}
