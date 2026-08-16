import { Briefcase, DollarSign, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MeuContratoPJ } from "@/hooks/useMinhasNotas";
import { nomeCanonico, apelidoParceiro } from "@/lib/parceiros/nome";

export function CardContratoAtivo({ contrato }: { contrato: MeuContratoPJ | null }) {
  if (!contrato) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Nenhum contrato PJ ativo encontrado.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {nomeCanonico(contrato.razao_social, "—")}
                </p>
                {apelidoParceiro(contrato.razao_social, contrato.nome_fantasia) && (
                  <p className="text-xs text-muted-foreground truncate">
                    {apelidoParceiro(contrato.razao_social, contrato.nome_fantasia)}
                  </p>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">CNPJ: {contrato.cnpj}</p>
          </div>
          <Badge variant="outline" className="shrink-0">
            {contrato.categoria_pj === "colaborador" ? "Colaborador PJ" : "Prestador"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Valor mensal</p>
              <p className="text-sm font-medium">
                R$ {Number(contrato.valor_mensal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Desde</p>
              <p className="text-sm font-medium">
                {new Date(contrato.data_inicio + "T00:00:00").toLocaleDateString("pt-BR")}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
