import { NavLink, Outlet } from "react-router-dom";
import { Warehouse, HeartPulse, GitCompare, Undo2, Share2, Tags, PackagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const TABS = [
  { to: "/vendas/produto/estoque/virtual", label: "Estoque Geral", icon: Warehouse },
  { to: "/vendas/produto/estoque/saude", label: "Saúde do Estoque", icon: HeartPulse },
  { to: "/vendas/produto/estoque/entradas", label: "Entradas", icon: PackagePlus },
  { to: "/vendas/produto/estoque/devolucoes", label: "Retorno de devolução", icon: Undo2 },

  { to: "/vendas/produto/estoque/conciliacao", label: "Conciliação", icon: GitCompare },
  { to: "/vendas/produto/estoque/nomes-bling", label: "Nomes no Bling", icon: Tags, superAdmin: true },
  { to: "/acervo/destinos-cadastro", label: "Destinos de cadastro", icon: Share2 },
];


export default function ProdutoEstoqueLayout() {
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const tabs = TABS.filter((t) => !t.superAdmin || isSuperAdmin);
  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-card">
        <nav className="flex gap-1 px-4 pt-2">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors -mb-px whitespace-nowrap",
                  isActive
                    ? "font-medium text-foreground border-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
