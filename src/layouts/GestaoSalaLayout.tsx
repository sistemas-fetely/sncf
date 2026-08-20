import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { FolderKanban, Gavel, ShieldAlert, Users } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";

/** Abas do módulo Sala de Gestão — mesma linguagem de navegação do módulo Tarefas. */
const ITENS = [
  { title: "Salas", url: "/gestao", icon: Users, exato: true },
  { title: "Projetos", url: "/gestao/projetos", icon: FolderKanban },
  { title: "Decisões", url: "/gestao/decisoes", icon: Gavel },
  { title: "Riscos", url: "/gestao/riscos", icon: ShieldAlert },
];

export default function GestaoSalaLayout() {
  const location = useLocation();

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-card/80 px-3 backdrop-blur-sm">
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap">
          {ITENS.map((item) => {
            const active = item.exato
              ? location.pathname === "/gestao" || location.pathname.startsWith("/gestao/sala")
              : location.pathname.startsWith(item.url);
            return (
              <NavLink
                key={item.url}
                to={item.url}
                className={cn(
                  "flex h-12 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm transition-colors",
                  active
                    ? "border-b-2 border-gold text-gold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.title}</span>
              </NavLink>
            );
          })}
        </nav>
      </header>

      <main className="relative flex-1 overflow-auto">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center p-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <CommandPaletteProvider />
    </div>
  );
}
