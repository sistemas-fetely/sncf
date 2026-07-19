import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Building2 } from "lucide-react";
import { FretesEntregas } from "./FretesEntregas";
import { TabelaPreco } from "./TabelaPreco";
import { GestaoTabelasPreco } from "./GestaoTabelasPreco";
import type { TransportadoraLogistica } from "@/hooks/logistica/useTransportadorasLogistica";

function fmtCnpj(cnpj: string | null): string {
  if (!cnpj) return "";
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function AbaTransportadora({ transportadora }: { transportadora: TransportadoraLogistica }) {
  const nome = transportadora.nome_fantasia ?? transportadora.razao_social;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
        <Building2 className="h-5 w-5 text-muted-foreground" />
        <div className="text-sm">
          <div className="font-medium">{nome}</div>
          <div className="text-xs text-muted-foreground">
            {fmtCnpj(transportadora.cnpj)}
            {transportadora.cidade ? ` · ${transportadora.cidade}` : ""}
            {transportadora.uf ? `/${transportadora.uf}` : ""}
          </div>
        </div>
      </div>

      <Tabs defaultValue="fretes" className="w-full">
        <TabsList>
          <TabsTrigger value="fretes">Fretes &amp; entregas</TabsTrigger>
          <TabsTrigger value="tabela">Tabela de preço</TabsTrigger>
        </TabsList>
        <TabsContent value="fretes" className="mt-4">
          <FretesEntregas transportadoraId={transportadora.id} transportadoraNome={nome} />
        </TabsContent>
        <TabsContent value="tabela" className="mt-4 space-y-4">
          <GestaoTabelasPreco transportadoraId={transportadora.id} />
          <TabelaPreco transportadoraId={transportadora.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
