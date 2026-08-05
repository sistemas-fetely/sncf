import { useState } from "react";
import { Download } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { exportarPedidosComercial } from "@/lib/exportPedidosComercial";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function ExportarPedidosButton() {
  const hoje = new Date();
  const noventa = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [open, setOpen] = useState(false);
  const [de, setDe] = useState(iso(noventa));
  const [ate, setAte] = useState(iso(hoje));
  const [loading, setLoading] = useState(false);

  const invalido = !de || !ate || de > ate;

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Exportar Excel
        </Button>
      </DialogTrigger>
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
  );
}

export default ExportarPedidosButton;
