import { NavLink } from "react-router-dom";
import { Home, Users, Wallet, BookOpen, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCasaApp } from "@/hooks/useCasaApp";

const ITEMS: Array<{ id: string; to: string; label: string; icon: typeof Home; end?: boolean }> = [
  { id: "casa", to: "/", label: "Casa", icon: Home, end: true },
  { id: "pessoas", to: "/pessoas", label: "Pessoas", icon: Users },
  { id: "financas", to: "/administrativo", label: "Finanças", icon: Wallet },
  { id: "marca", to: "/administrativo-fetely", label: "Marca", icon: Sparkles },
  { id: "acervo", to: "/documentacao", label: "Acervo", icon: BookOpen },
];

export function CasaBottomNav() {
  const activeApp = useCasaApp();
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-md"
      aria-label="Navegação inferior"
    >
      <div className="grid grid-cols-5 h-14">
        {ITEMS.map((item) => {
          const isActive = activeApp.id === item.id;
          const Icon = item.icon;
          return (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.end}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] uppercase tracking-wider transition-colors",
                isActive ? "text-gold" : "text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
