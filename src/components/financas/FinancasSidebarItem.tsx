import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useTelasVisiveis } from "@/hooks/useTelasVisiveis";

interface FinancasSidebarItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  end?: boolean;
  activeClassName?: string;
  badge?: ReactNode;
}

export function FinancasSidebarItem({ to, icon: Icon, label, end = false, activeClassName, badge }: FinancasSidebarItemProps) {
  // Auto-ocultação por permissão, com a mesma precedência do RotaGate
  // (banco vence, código é fallback). super_admin vê tudo.
  const visiveis = useTelasVisiveis([to]);
  if (!visiveis.has(to)) return null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={label}>
        <NavLink
          to={to}
          end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 text-[13px] transition-colors border-l-2 border-transparent",
                isActive
                  ? activeClassName || "bg-sidebar-accent text-sidebar-accent-foreground font-medium [&_svg]:text-sidebar-accent-foreground"
                  : "text-foreground/70 hover:bg-muted/40 hover:text-foreground [&_svg]:opacity-70 hover:[&_svg]:opacity-100"
              )
            }
        >
          <Icon className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">{label}</span>
          {badge && (
            <span className="ml-auto flex items-center group-data-[collapsible=icon]:hidden">{badge}</span>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
