import { Outlet, useLocation } from "react-router-dom";
import { FolderKanban, Gavel, ShieldAlert, Users } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";

/**
 * GESTAO-E-ABA-DE-TAREFAS (21/08/2026): a Sala de Gestão não é mais um app de topo.
 * Este layout virou a SUB-NAVEGAÇÃO da aba "Gestão" dentro do TarefasLayout —
 * barra secundária discreta, subordinada às abas principais (padrão ProdutoEstoqueLayout).
 * Header, sino e CommandPalette vêm do TarefasLayout pai.
 */
const ITENS = [
  { title: "Salas", url: "/tarefas/gestao", icon: Users, exato: true },
  { title: "Projetos", url: "/tarefas/gestao/projetos", icon: FolderKanban },
  { title: "Decisões", url: "/tarefas/gestao/decisoes", icon: Gavel },
  { title: "Riscos", url: "/tarefas/gestao/riscos", icon: ShieldAlert },
];

export default function GestaoLayout() {
  const location = useLocation();

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b bg-card/60">
        <nav className="flex gap-1 overflow-x-auto whitespace-nowrap px-4">
          {ITENS.map((item) => {
            const active = item.exato
              ? location.pathname === "/tarefas/gestao" ||
                location.pathname.startsWith("/tarefas/gestao/sala") ||
                location.pathname.startsWith("/tarefas/gestao/ata")
              : location.pathname.startsWith(item.url);
            return (
              <NavLink
                key={item.url}
                to={item.url}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-xs transition-colors -mb-px",
                  active
                    ? "border-gold font-medium text-gold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                <span>{item.title}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
