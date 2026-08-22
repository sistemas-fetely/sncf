import { NavLink } from "react-router-dom";
import { Home, Users, Wallet, HandCoins, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCasaApp } from "@/hooks/useCasaApp";

/**
 * Menu inferior do mobile — os 5 pilares fixos.
 *
 * Corrigido em 22/08/2026 para os 5 decididos em 29/07 e já gravados na
 * sncf_navegacao (apps com superficie 'bottom'): Casa, SOPs, Finanças,
 * Pessoas, Meu Espaço.
 *
 * Antes trazia Marca e Acervo no lugar de SOPs e Meu Espaço — ou seja, o app
 * de maior tráfego da operação não tinha atalho no celular, e "Marca" ocupava
 * um dos 5 lugares mesmo tendo sido renomeada pra Patrimônio há quase um mês.
 *
 * Continua hardcoded de propósito: tornar top/bottom nav table-driven exige o
 * padrão "5 fixos + Mais", que ainda não existe (fatia própria).
 */
const ITEMS: Array<{ id: string; to: string; label: string; icon: typeof Home; end?: boolean }> = [
  { id: "casa", to: "/", label: "Casa", icon: Home, end: true },
  { id: "recebimento", to: "/pedidos", label: "SOPs", icon: HandCoins },
  { id: "financas", to: "/administrativo", label: "Finanças", icon: Wallet },
  { id: "pessoas", to: "/pessoas", label: "Pessoas", icon: Users },
  { id: "meu_espaco", to: "/tarefas/hoje", label: "Meu Espaço", icon: User },
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
