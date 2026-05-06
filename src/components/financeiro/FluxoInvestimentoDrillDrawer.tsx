import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { ExternalLink } from "lucide-react";

export type EventoFluxo = {
  evento_id: string;
  origem: "cpr" | "linha_com_data" | "linha_sem_data";
  evento_descricao: string;
  valor: number;
  data_evento: string | null;
  status_cpr: string | null;
  linha_id: string;
  linha_descricao: string;
  tema_id: string;
  tema_nome: string;
  frente_id: string;
  frente_codigo: string;
  frente_nome: string;
  frente_ordem: number;
};

export type DrillFiltro = {
  frente_id?: string;
  frente_nome?: string;
  bucket?: string; // 'yyyy-MM' | 'sem_data' | 'vencido'
  bucketLabel?: string;
  tipo?: "vencido" | "sem_data" | "celula";
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filtro: DrillFiltro | null;
  eventos: EventoFluxo[];
}

function badgeOrigem(origem: EventoFluxo["origem"]) {
  if (origem === "cpr")
    return <Badge variant="outline" className="border-blue-300 text-blue-700">CPR</Badge>;
  if (origem === "linha_com_data")
    return <Badge variant="outline" className="border-emerald-300 text-emerald-700">Planejado c/ data</Badge>;
  return <Badge variant="outline" className="border-amber-300 text-amber-700">Planejado s/ data</Badge>;
}

export function FluxoInvestimentoDrillDrawer({ open, onOpenChange, filtro, eventos }: Props) {
  const navigate = useNavigate();

  const titulo = useMemo(() => {
    if (!filtro) return "Detalhes";
    if (filtro.tipo === "vencido") return "Linhas vencidas";
    if (filtro.tipo === "sem_data") return "Linhas sem data prevista";
    if (filtro.frente_nome && filtro.bucketLabel)
      return `${filtro.frente_nome} — ${filtro.bucketLabel}`;
    return "Detalhes";
  }, [filtro]);

  const total = useMemo(
    () => eventos.reduce((acc, e) => acc + Number(e.valor || 0), 0),
    [eventos],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{titulo}</SheetTitle>
          <SheetDescription>
            {eventos.length} {eventos.length === 1 ? "evento" : "eventos"} • Total{" "}
            <strong className="text-foreground">{formatBRL(total)}</strong>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {eventos.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Nenhum evento.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-[11px] text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">Linha</th>
                    <th className="text-left px-3 py-2 font-medium">Origem</th>
                    <th className="text-right px-3 py-2 font-medium">Valor</th>
                    <th className="text-left px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {eventos.map((e) => (
                    <tr key={`${e.origem}-${e.evento_id}`} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{e.linha_descricao}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {e.frente_nome} • {e.tema_nome}
                        </div>
                        {e.evento_descricao && e.evento_descricao !== e.linha_descricao && (
                          <div className="text-[11px] text-muted-foreground italic mt-0.5">
                            {e.evento_descricao}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">{badgeOrigem(e.origem)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatBRL(e.valor)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatDateBR(e.data_evento)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            onOpenChange(false);
                            navigate(`/administrativo/investimento-lancamento?linha=${e.linha_id}`);
                          }}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Linha
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
