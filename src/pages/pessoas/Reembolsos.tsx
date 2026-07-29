import { Receipt, Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function Reembolsos() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Receipt className="h-6 w-6" />
          Reembolsos
        </h1>
      </div>

      <Card className="card-shadow">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Construction className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-semibold">Submódulo em reconstrução</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              O fluxo de reembolsos está sendo reconstruído sobre o novo processo
              F-POP-001. Volta em breve.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
