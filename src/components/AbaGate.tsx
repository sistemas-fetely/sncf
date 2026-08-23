import { type ReactNode } from "react";
import { usePermissoesTela } from "@/hooks/usePermissoesTela";

// PERMISSÃO-SEGUE-O-DADO (23/08/2026)
// O slug representa o CONJUNTO DE DADOS, não a tela nem a aba.
// Abas que são só filtro/apresentação do mesmo dado compartilham o slug da tela.
// Aba que traz outra tabela usa o mesmo slug da tela avulsa que mostra aquele dado.
// Se a pessoa não pode ver num lugar, não pode ver no outro.

export function usePodeVerAba(slug: string): { podeVer: boolean; carregando: boolean } {
  // Super admin e telas públicas já são resolvidos dentro de usePermissoesTela;
  // este hook não repete essa lógica, apenas expõe o verbo "ver" em formato de aba.
  const v = usePermissoesTela(slug);
  return { podeVer: v.podeVer, carregando: v.carregando };
}

export function AbaPermitida({ slug, children }: { slug: string; children: ReactNode }) {
  const { podeVer, carregando } = usePodeVerAba(slug);

  // Fail-closed: enquanto carrega, não renderiza nada.
  // Melhor a aba aparecer meio segundo depois do que piscar para quem não pode ver.
  if (carregando) return null;
  if (!podeVer) return null;
  return <>{children}</>;
}

export function ConteudoAba({ slug, children }: { slug: string; children: ReactNode }) {
  const { podeVer, carregando } = usePodeVerAba(slug);

  if (carregando) return null;
  if (!podeVer) {
    return (
      <div className="rounded-md border border-border bg-muted/40 px-3 py-6 text-sm text-muted-foreground text-center">
        Você não tem permissão para ver estes dados.
      </div>
    );
  }
  return <>{children}</>;
}
