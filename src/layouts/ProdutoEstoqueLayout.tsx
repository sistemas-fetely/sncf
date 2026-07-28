import { NavLink, Outlet } from "react-router-dom";
import { Warehouse, HeartPulse, GitCompare } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/vendas/produto/estoque/virtual", label: "Estoque Virtual", icon: Warehouse },
  { to: "/vendas/produto/estoque/saude", label: "Saúde do Estoque", icon: HeartPulse },
  { to: "/vendas/produto/estoque/conciliacao", label: "Conciliação", icon: GitCompare },
];

export default function ProdutoEstoqueLayout() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-card">
        <nav className="flex gap-1 px-4 pt-2">
          {TABS.map(({ to, label, icon: Icon }) => (
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
