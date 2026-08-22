import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <PageShell>
      <PageHeader titulo={title} estado={description} />
      <Card className="card-shadow">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Construction className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium">Módulo em Desenvolvimento</p>
            <p className="text-sm text-muted-foreground mt-1">Este módulo será implementado em breve.</p>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
