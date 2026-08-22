import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface AdminPlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  status?: "fase1" | "fase2" | "fase3" | "futuro";
  detalhes?: string;
}

const statusLabel: Record<NonNullable<AdminPlaceholderProps["status"]>, string> = {
  fase1: "Fase 1 — Esqueleto",
  fase2: "Fase 2 — Próxima entrega",
  fase3: "Fase 3 — Em planejamento",
  futuro: "Próximo sprint",
};

export default function AdminPlaceholder({
  title, description, icon: Icon, status = "fase2", detalhes,
}: AdminPlaceholderProps) {
  return (
    <PageShell>
      <PageHeader titulo={title} estado={description} />
      <Card className="border-admin/20">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-admin-muted">
            <Icon className="h-8 w-8 text-admin" />
          </div>
          <div className="text-center max-w-md">
            <p className="text-lg font-medium">🏗️ Módulo em construção</p>
            <p className="text-sm text-muted-foreground mt-2">
              {detalhes || "Esta tela faz parte do esqueleto do Pilar Administrativo. A funcionalidade será implementada nas próximas fases."}
            </p>
            <p className="text-xs text-admin mt-4 font-medium uppercase tracking-wide">
              {statusLabel[status]}
            </p>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
