import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportarPedidosComercial } from "@/lib/exportPedidosComercial";
import { gerarRelatorioAuditoria } from "@/lib/exports/relatorioAuditoria";
import { useNivel } from "@/hooks/useNivel";
import { hojeISO } from "@/lib/data";

/** Data pura N dias a partir de hoje em Brasília (aritmética UTC, sem drift). */
function isoMaisDias(dias: number): string {
  const [a, m, d] = hojeISO().split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

type Modo = "comercial" | "auditoria";

export function ExportarPedidosButton() {
  const { temNivel } = useNivel();
  const [modo, setModo] = useState<Modo | null>(null);
  const [de, setDe] = useState(isoMaisDias(-90));
  const [ate, setAte] = useState(hojeISO());
  const [loading, setLoading] = useState(false);

  const invalido = !de || !ate || de > ate;

  const handleComercial = async () => {
    setLoading(true);
    try {
      const linhas = await exportarPedidosComercial({ de, ate });
      toast.success(`Exportação concluída — ${linhas} linha(s).`);
      setModo(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleAuditoria = async () => {
    setLoading(true);
    const tid = toast.loading("Gerando Rel. Auditoria...");
    try {
      const r = await gerarRelatorioAuditoria({ de, ate });
      if (r.pedidos === 0) {
        toast.error("Nenhum pedido no período", { id: tid });
        return;
      }
      toast.success(
        `Rel. Auditoria gerado — ${r.pedidos} pedido(s), ${r.itens} linha(s) de item.`,
        { id: tid },
      );
      setModo(null);
    } catch (e) {
      console.error("Falha ao gerar Rel. Auditoria", e);
      toast.error(e instanceof Error ? e.message : "Falha ao gerar Rel. Auditoria", { id: tid });
    } finally {
      setLoading(false);
    }
  };

  // Exportação leva a base para fora: nível 3 (Coordenador) para cima.
  if (!temNivel(3)) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={loading}>
            <Download className="h-4 w-4 mr-2" />
            {loading ? "Gerando..." : "Exportar Excel"}
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setModo("comercial")}>Rel. Comercial</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setModo("auditoria")}>Rel. Auditoria</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={modo !== null} onOpenChange={(o) => !o && setModo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Exportar pedidos — {modo === "auditoria" ? "Rel. Auditoria" : "Rel. Comercial"}
            </DialogTitle>
            <DialogDescription>
              {modo === "auditoria"
                ? "Todos os pedidos do período, em qualquer estágio (inclui cancelados e entregues)."
                : "Escolha o período pela data do pedido."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="export-de">De</Label>
              <Input id="export-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-ate">Até</Label>
              <Input id="export-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            </div>
          </div>
          {invalido && (
            <p className="text-xs text-destructive">A data inicial não pode ser maior que a final.</p>
          )}
          <DialogFooter>
            <Button
              onClick={() => void (modo === "auditoria" ? handleAuditoria() : handleComercial())}
              disabled={loading || invalido}
            >
              {loading ? "Gerando..." : "Exportar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


export default ExportarPedidosButton;
