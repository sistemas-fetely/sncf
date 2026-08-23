import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Radar, ClipboardCheck, FileSignature, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardData } from "@/hooks/useDashboardData";

interface IndicadorRadar {
  label: string;
  valor: number;
  icone: React.ElementType;
  rota: string;
  cor: string;
  alertivo?: boolean;
}

export function RadarOperacional() {
  const navigate = useNavigate();
  const { roles: authRoles } = useAuth();
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const isAdminRH = (authRoles ?? []).includes("admin_rh") || (authRoles ?? []).includes("rh" as never);
  const data = useDashboardData();

  // Radar só aparece pra quem tem ação operacional (RH, admin, super)
  if (!isSuperAdmin && !isAdminRH) return null;

  const indicadores: IndicadorRadar[] = [];


  if (data.pj?.vencendo > 0) {
    indicadores.push({
      label: "Contratos PJ vencendo (30d)",
      valor: data.pj.vencendo,
      icone: FileSignature,
      rota: "/contratos-pj",
      cor: "text-warning",
      alertivo: true,
    });
  }

  if (data.contratosPendentes?.length > 0) {
    indicadores.push({
      label: "Contratos PJ aguardando assinatura",
      valor: data.contratosPendentes.length,
      icone: ClipboardCheck,
      rota: "/contratos-pj",
      cor: "text-primary",
    });
  }

  if (data.docsVencendo?.length > 0) {
    indicadores.push({
      label: "Documentos vencendo",
      valor: data.docsVencendo.length,
      icone: AlertCircle,
      rota: "/colaboradores",
      cor: "text-destructive",
      alertivo: true,
    });
  }

  if (indicadores.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-primary/60">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Radar className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium tracking-wide">
            Radar do seu time
          </h3>
          <Badge variant="outline" className="ml-auto text-[10px]">
            Ações pendentes
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {indicadores.map((ind, i) => {
            const Icon = ind.icone;
            return (
              <button
                key={i}
                onClick={() => navigate(ind.rota)}
                className="rounded-lg border bg-card p-3 text-left hover:border-primary/40 hover:shadow-sm transition group"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <Icon className={`h-4 w-4 ${ind.cor}`} />
                  {ind.alertivo && (
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                  )}
                </div>
                <p className="text-2xl font-medium">{ind.valor}</p>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {ind.label}
                </p>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
