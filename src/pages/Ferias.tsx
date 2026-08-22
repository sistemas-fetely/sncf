import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Briefcase } from "lucide-react";
import { FeriasCLTView } from "@/components/ferias/FeriasCLTView";
import { FeriasPJView } from "@/components/ferias/FeriasPJView";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

export default function Ferias() {
  const { hasAnyRole, roles } = useAuth();
  const canManage = hasAnyRole(["super_admin", "gestor_rh", "financeiro"]);
  const isAdmin = hasAnyRole(["super_admin"]);

  const showCLT = true;
  const showPJ = true;

  const defaultTab = showCLT ? "clt" : "pj";

  return (
    <PageShell>
      <PageHeader
        titulo="Gestão de Férias"
        estado="Controle de períodos aquisitivos, programação e recessos"
      />

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList>
          {showCLT && (
            <TabsTrigger value="clt" className="gap-1.5">
              <Users className="h-4 w-4" /> CLT
            </TabsTrigger>
          )}
          {showPJ && (
            <TabsTrigger value="pj" className="gap-1.5">
              <Briefcase className="h-4 w-4" /> PJ
            </TabsTrigger>
          )}
        </TabsList>

        {showCLT && (
          <TabsContent value="clt">
            <FeriasCLTView canManage={canManage} isAdmin={isAdmin} />
          </TabsContent>
        )}

        {showPJ && (
          <TabsContent value="pj">
            <FeriasPJView canManage={canManage} isAdmin={isAdmin} />
          </TabsContent>
        )}
      </Tabs>
    </PageShell>
  );
}
