import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export const ABAS = [
  { rotulo: "Mesa", to: "/vendas/produto/mesa", busca: "busca" },
  { rotulo: "Conciliação", to: "/vendas/produto/conciliacao", busca: "q" },
  { rotulo: "Destinos", to: "/vendas/produto/estoque/destinos", busca: "q" },
  { rotulo: "Fotos", to: "/vendas/produto/fotos", busca: "busca" },
  { rotulo: "Preço", to: "/vendas/produto/precos", busca: "busca" },
];

export function destinoProduto(to: string, pathname: string, search: string) {
  const origem = ABAS.find(aba => aba.to === pathname);
  const destino = ABAS.find(aba => aba.to === to);
  const termo = origem ? new URLSearchParams(search).get(origem.busca) : null;
  if (!termo || !destino) return to;
  const query = new URLSearchParams({ [destino.busca]: termo });
  return `${to}?${query}`;
}

export function ProdutoAbas() {
  const { pathname, search } = useLocation();
  return (
    <nav aria-label="Produto" className="flex flex-wrap gap-1 border-b">
      {ABAS.map(aba => (
        <Link key={aba.to} to={destinoProduto(aba.to, pathname, search)}
          aria-current={pathname === aba.to ? "page" : undefined}
          className={cn("px-3 py-1.5 text-sm border-b-2 -mb-px", pathname === aba.to ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {aba.rotulo}
        </Link>
      ))}
    </nav>
  );
}