import type { NavigateFunction } from "react-router-dom";

/** Monta a URL de volta (com a query atual) e, se pedido, o `foco` do item aberto. */
export function montarFrom(pathname: string, search: string, foco?: string): string {
  const p = new URLSearchParams(search);
  p.delete("foco");
  if (foco) p.set("foco", foco);
  const s = p.toString();
  return pathname + (s ? `?${s}` : "");
}

/** Abre um detalhe levando de onde veio, para o SmartBackButton voltar certo. */
export function abrirDetalhe(
  navigate: NavigateFunction,
  location: { pathname: string; search: string },
  to: string,
  opts: { foco?: string; label?: string } = {},
) {
  navigate(to, {
    state: { from: montarFrom(location.pathname, location.search, opts.foco), fromLabel: opts.label },
  });
}
