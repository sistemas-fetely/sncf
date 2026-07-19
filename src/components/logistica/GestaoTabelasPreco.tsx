import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Table2 } from "lucide-react";
import { useTabelasPreco } from "@/hooks/logistica/useTabelasPreco";
import { ImportarTabelaPrecoDialog } from "./ImportarTabelaPrecoDialog";

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v + (v.length === 10 ? "T00:00:00" : ""));
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export function GestaoTabelasPreco({ transportadoraId }: { transportadoraId: string }) {
  const [open, setOpen] = useState(false);
  const { data: versoes, isLoading } = useTabelasPreco(transportadoraId);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Versões da tabela de preço</h3>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova versão
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : !versoes || versoes.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center">
          Nenhuma tabela cadastrada. Clique em "Nova versão" para importar a primeira.
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-left px-3 py-2">Nome</th>
                <th className="text-left px-3 py-2">Modal</th>
                <th className="text-left px-3 py-2">Vigência</th>
                <th className="text-left px-3 py-2">Descrição</th>
                <th className="text-right px-3 py-2">Zonas</th>
                <th className="text-center px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {versoes.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="px-3 py-2">{v.nome}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{v.modal ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {fmtDate(v.vigencia_inicio)}
                    {v.vigencia_fim ? ` → ${fmtDate(v.vigencia_fim)}` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {v.vigencia_descricao ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{v.total_zonas}</td>
                  <td className="px-3 py-2 text-center">
                    {v.ativo ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600">Ativa</Badge>
                    ) : (
                      <Badge variant="secondary">Inativa</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ImportarTabelaPrecoDialog
        open={open}
        onOpenChange={setOpen}
        transportadoraId={transportadoraId}
      />
    </div>
  );
}
