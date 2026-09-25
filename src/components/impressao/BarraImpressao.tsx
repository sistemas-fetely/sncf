import { useNavigate } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Barra de controles das telas de impressão. Some no papel (@media print). */
export function BarraImpressao() {
  const navigate = useNavigate();
  return (
    <div className="barra-impressao sticky top-0 z-10 mx-auto mb-4 flex w-[210mm] max-w-full items-center justify-between gap-2 rounded-md border border-border bg-card p-2 shadow-sm">
      <style>{`@media print { .barra-impressao { display: none !important; } }`}</style>
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" />
        Voltar
      </Button>
      <Button size="sm" onClick={() => window.print()}>
        <Printer className="mr-1 h-4 w-4" />
        Imprimir / Salvar PDF
      </Button>
    </div>
  );
}
