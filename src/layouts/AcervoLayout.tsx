import { NavLink, Outlet } from "react-router-dom";
import { FileText, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const ACERVO_COLOR = "#1A4A3A";

const TABS = [
  { to: "/processos", label: "Processos", icon: FileText },
  { to: "/documentacao", label: "Documentação", icon: BookOpen },
];

export default function AcervoLayout() {
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
                    ? "font-medium border-b-2"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )
              }
              style={({ isActive }) =>
                isActive
                  ? { color: ACERVO_COLOR, borderColor: ACERVO_COLOR }
                  : {}
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
