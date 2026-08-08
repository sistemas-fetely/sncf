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

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

interface Props {
  /** Ids dos pedidos exatamente como filtrados na fila (para o Rel. Auditoria). */
  pedidoIdsFiltrados?: string[];
}

export function ExportarPedidosButton({ pedidoIdsFiltrados = [] }: Props) {
  const hoje = new Date();
  const noventa = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [open, setOpen] = useState(false);
  const [de, setDe] = useState(iso(noventa));
  const [ate, setAte] = useState(iso(hoje));
  const [loading, setLoading] = useState(false);
  const [loadingAuditoria, setLoadingAuditoria] = useState(false);

  const invalido = !de || !ate || de > ate;
  const ocupado = loading || loadingAuditoria;

  const handleExportar = async () => {
    setLoading(true);
    try {
      const linhas = await exportarPedidosComercial({ de, ate });
      toast.success(`Exportação concluída — ${linhas} linha(s).`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleAuditoria = async () => {
    if (pedidoIdsFiltrados.length === 0) {
      toast.error("Nenhum pedido no filtro atual");
      return;
    }
    setLoadingAuditoria(true);
    try {
      const linhas = await gerarRelatorioAuditoria(pedidoIdsFiltrados);
      toast.success(`Rel. Auditoria gerado — ${linhas} pedido(s).`);
    } catch (e) {
      console.error("Falha ao gerar Rel. Auditoria", e);
      toast.error("Falha ao gerar Rel. Auditoria");
    } finally {
      setLoadingAuditoria(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={ocupado}>
            <Download className="h-4 w-4 mr-2" />
            {ocupado ? "Gerando..." : "Exportar Excel"}
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen(true)}>Rel. Comercial</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void handleAuditoria();
            }}
          >
            Rel. Auditoria
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar pedidos</DialogTitle>
            <DialogDescription>Escolha o período pela data do pedido.</DialogDescription>
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
            <Button onClick={handleExportar} disabled={loading || invalido}>
              {loading ? "Gerando..." : "Exportar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ExportarPedidosButton;
