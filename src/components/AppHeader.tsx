import { Moon, Sun, Home } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTrackPageVisit } from "@/hooks/useTrackPageVisit";
import { RecentesEFavoritos } from "@/components/navegacao/RecentesEFavoritos";
import { ReportarErroBotao } from "@/components/shared/ReportarErroBotao";
import { SinoNotificacoes } from "@/components/shared/SinoNotificacoes";

const routeNames: Record<string, string> = {
  "/": "Dashboard",
  "/colaboradores": "Colaboradores",
  "/organograma": "Organograma",
  "/folha-pagamento": "Folha de Pagamento",
  "/ferias": "Férias",
  "/ponto": "Controle de Ponto",
  "/beneficios": "Benefícios",
  "/contratos-pj": "Contratos PJ",
  "/notas-fiscais": "Notas Fiscais",
  "/recrutamento": "Recrutamento",
  "/avaliacoes": "Avaliações",
  "/treinamentos": "Treinamentos",
  "/relatorios": "Relatórios",
  "/configuracoes": "Configurações",
  "/autoatendimento": "Autoatendimento",
};

export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const pageName = routeNames[location.pathname] || "Página";
  const [darkMode, setDarkMode] = useState(false);
  useTrackPageVisit();

  const toggleDark = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/80 backdrop-blur-sm px-4 card-shadow">
      <SidebarTrigger className="-ml-1" />
      {/* Sprint 2 (29/04/2026): Voltar ao Portal — antes ausente, era bug visual reportado. */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/sncf")}
        className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Home className="h-3.5 w-3.5" />
        Voltar ao Portal
      </Button>
      <span className="text-muted-foreground/40">|</span>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>People Fetély</span>
        <span className="text-border">/</span>
        <span className="font-medium text-primary">{pageName}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl hover:bg-accent" onClick={toggleDark}>
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <RecentesEFavoritos />
        <ReportarErroBotao />

        <SinoNotificacoes />
      </div>
    </header>
  );
}
