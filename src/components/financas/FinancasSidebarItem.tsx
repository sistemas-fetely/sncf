import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface FinancasSidebarItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  end?: boolean;
}

export function FinancasSidebarItem({ to, icon: Icon, label, end = false }: FinancasSidebarItemProps) {
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
                  ? "bg-green-50 text-green-700 font-medium [&_svg]:text-green-700 border-l-green-600"
                  : "text-foreground/70 hover:bg-muted/40 hover:text-foreground [&_svg]:opacity-70 hover:[&_svg]:opacity-100"
              )
            }
        >
          <Icon className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">{label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
