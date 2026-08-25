import { useState } from "react";
import { Download } from "lucide-react";
import ExcelJS from "exceljs";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { useNivel } from "@/hooks/useNivel";
import type { PedidoB2cRow } from "@/hooks/vendas/useB2c";
import { hojeISO, parseDataPura } from "@/lib/data";

/**
 * Exporta exatamente as linhas que a Fila está mostrando — nada de segunda query.
 */
export function ExportarB2cButton({ linhas }: { linhas: PedidoB2cRow[] }) {
  const { temNivel } = useNivel();
  const [loading, setLoading] = useState(false);

  const exportar = async () => {
    if (linhas.length === 0) {
      toast.error("Nenhum pedido na fila para exportar.");
      return;
    }
    setLoading(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Loja B2C");
      ws.columns = [
        { header: "Pedido", key: "order_name", width: 12 },
        { header: "Data", key: "data_pedido", width: 12 },
        { header: "Cliente", key: "cliente", width: 32 },
        { header: "Cidade", key: "shipping_city", width: 20 },
        { header: "UF", key: "shipping_province", width: 6 },
        { header: "Total", key: "total", width: 14, style: { numFmt: '"R$" #,##0.00' } },
        { header: "Estágio", key: "estagio_rotulo", width: 18 },
        { header: "Dono", key: "area_responsavel", width: 14 },
        { header: "Próxima ação", key: "proxima_acao", width: 34 },
        { header: "Alerta", key: "alerta", width: 22 },
        { header: "NF", key: "nf_refs", width: 16 },
        { header: "Rastreio", key: "tracking_number", width: 24 },
      ];
      ws.getRow(1).font = { bold: true };
      linhas.forEach((p) => {
        ws.addRow({
          order_name: p.order_name ?? "",
          data_pedido: parseDataPura(p.data_pedido),
          cliente: p.cliente ?? "",
          shipping_city: p.shipping_city ?? "",
          shipping_province: p.shipping_province ?? "",
          total: Number(p.total ?? 0),
          estagio_rotulo: p.estagio_rotulo ?? "",
          area_responsavel: p.area_responsavel ?? "",
          proxima_acao: p.proxima_acao ?? "",
          alerta: p.alerta ?? "",
          nf_refs: p.nf_refs ?? "",
          tracking_number: p.tracking_number ?? "",
        });
      });

      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `loja-b2c_${hojeISO()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportação concluída — ${linhas.length} linha(s).`);
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setLoading(false);
    }
  };

  // Exportação leva a base para fora: nível 3 (Coordenador) para cima.
  if (!temNivel(3)) return null;

  return (
    <Button variant="outline" size="sm" onClick={() => void exportar()} disabled={loading}>
      <Download className="mr-2 h-4 w-4" />
      {loading ? "Gerando..." : "Exportar Excel"}
    </Button>
  );
}
