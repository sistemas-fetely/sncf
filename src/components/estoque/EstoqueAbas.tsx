import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const ABAS = [
  { rotulo: "Central", to: "/vendas/produto/estoque/central" },
  { rotulo: "Cockpit", to: "/vendas/produto/estoque/virtual" },
  { rotulo: "Conciliação", to: "/vendas/produto/estoque/conciliacao" },
];

export function destinoEstoque(to: string, search: string) {
  const origem = new URLSearchParams(search);
  const destino = new URLSearchParams();
  const q = origem.get("q");
  if (q !== null) destino.set("q", q);
  const query = destino.toString();
  return query ? `${to}?${query}` : to;
}

export function EstoqueAbas() {
  const { pathname, search } = useLocation();
  return (
    <nav aria-label="Estoque" className="flex gap-1 border-b">
      {ABAS.map((aba) => (
        <Link
          key={aba.to}
          to={destinoEstoque(aba.to, search)}
          aria-current={pathname === aba.to ? "page" : undefined}
          className={cn("px-3 py-1.5 text-sm border-b-2 -mb-px", pathname === aba.to ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          {aba.rotulo}
        </Link>
      ))}
    </nav>
  );
}