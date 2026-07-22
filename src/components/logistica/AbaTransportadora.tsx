import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Building2, Upload, Truck } from "lucide-react";
import { FretesEntregas } from "./FretesEntregas";
import { TabelaPreco } from "./TabelaPreco";
import { GestaoTabelasPreco } from "./GestaoTabelasPreco";
import { ConteudoTabelaPreco } from "./ConteudoTabelaPreco";
import { ImportarRastreioDialog } from "./ImportarRastreioDialog";
import { ImportarBraspressDialog } from "./ImportarBraspressDialog";
import { OcorrenciasDepara } from "./OcorrenciasDepara";
import type { TransportadoraLogistica } from "@/hooks/logistica/useTransportadorasLogistica";

function fmtCnpj(cnpj: string | null): string {
  if (!cnpj) return "";
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function AbaTransportadora({ transportadora }: { transportadora: TransportadoraLogistica }) {
  const nome = transportadora.nome_fantasia ?? transportadora.razao_social;
  const ehBraspress = (transportadora.razao_social || "").toUpperCase().includes("BRASPRESS");
  const [abrirRastreio, setAbrirRastreio] = useState(false);
  const [abrirBraspress, setAbrirBraspress] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
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
        <div className="flex items-center gap-2 flex-wrap">
          {ehBraspress ? (
            <Button onClick={() => setAbrirBraspress(true)} className="gap-2">
              <Upload className="h-4 w-4" /> Importar encomendas (frete + rastreio)
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setAbrirRastreio(true)} className="gap-2">
              <Truck className="h-4 w-4" /> Importar rastreio (NF)
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="fretes" className="w-full">
        <TabsList>
          <TabsTrigger value="fretes">Fretes &amp; entregas</TabsTrigger>
          <TabsTrigger value="tabela">Tabela de preço</TabsTrigger>
          <TabsTrigger value="ocorrencias">Ocorrências</TabsTrigger>
        </TabsList>
        <TabsContent value="fretes" className="mt-4">
          <FretesEntregas
            transportadoraId={transportadora.id}
            transportadoraNome={nome}
            hideImport={ehBraspress}
          />
        </TabsContent>
        <TabsContent value="tabela" className="mt-4 space-y-4">
          <GestaoTabelasPreco transportadoraId={transportadora.id} />
          <ConteudoTabelaPreco transportadoraId={transportadora.id} />
          <TabelaPreco transportadoraId={transportadora.id} />
        </TabsContent>
        <TabsContent value="ocorrencias" className="mt-4">
          <OcorrenciasDepara transportadoraId={transportadora.id} />
        </TabsContent>
      </Tabs>

      {abrirRastreio && (
        <ImportarRastreioDialog
          open={abrirRastreio}
          onOpenChange={setAbrirRastreio}
          transportadoraId={transportadora.id}
          transportadoraNome={nome}
        />
      )}
      {abrirBraspress && (
        <ImportarBraspressDialog
          open={abrirBraspress}
          onOpenChange={setAbrirBraspress}
          transportadoraId={transportadora.id}
          transportadoraNome={nome}
        />
      )}
    </div>
  );
}
