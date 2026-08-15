import { useState } from "react";
import { nomeExibicao } from "@/lib/parceiros/nome";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Building2, Truck, Cloud, CloudAlert, CloudOff, Loader2 } from "lucide-react";
import { FretesEntregas } from "./FretesEntregas";
import { FretesEntregasB2C } from "./FretesEntregasB2C";
import { FaturasConciliacao } from "./FaturasConciliacao";
import { TabelaPreco } from "./TabelaPreco";
import { GestaoTabelasPreco } from "./GestaoTabelasPreco";
import { ConteudoTabelaPreco } from "./ConteudoTabelaPreco";
import { ImportarRastreioDialog } from "./ImportarRastreioDialog";
import { OcorrenciasDepara } from "./OcorrenciasDepara";
import { PainelLogistica } from "./PainelLogistica";
import { useUltimaSincronizacao } from "@/hooks/logistica/useUltimaSincronizacao";
import type { TransportadoraLogistica } from "@/hooks/logistica/useTransportadorasLogistica";

function fmtCnpj(cnpj: string | null): string {
  if (!cnpj) return "";
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function formatarDataHora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function horasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
}

function IndicadorSincronizacao({ transportadoraId }: { transportadoraId: string }) {
  const { data, isLoading } = useUltimaSincronizacao(transportadoraId);
  const h = horasDesde(data?.atualizado_em ?? null);
  const atrasado = h !== null && h > 6;
  const semRegistro = !isLoading && !data?.atualizado_em;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md px-3 py-2 bg-muted/30 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Carregando sincronização…</span>
      </div>
    );
  }

  if (semRegistro) {
    return (
      <div className="flex items-center gap-2 rounded-md px-3 py-2 bg-warning/10 text-sm text-warning">
        <CloudOff className="h-4 w-4" />
        <div className="leading-tight">
          <div className="font-medium">Sem sincronização registrada</div>
          <div className="text-xs opacity-90">atualiza automaticamente a cada 2 horas</div>
        </div>
      </div>
    );
  }

  const linhaPrincipal = atrasado
    ? `Sincronização atrasada · última leitura ${formatarDataHora(data.atualizado_em)}`
    : `Sincronizado pela API · última leitura ${formatarDataHora(data.atualizado_em)}`;

  const origemApi = data?.origem_dado === "api";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
        atrasado ? "bg-warning/10 text-warning" : "bg-muted/30 text-success"
      )}
    >
      {atrasado ? <CloudAlert className="h-4 w-4" /> : <CloudCheck className="h-4 w-4" />}
      <div className="leading-tight">
        <div className="font-medium">{linhaPrincipal}</div>
        <div className="text-xs opacity-90">
          {origemApi ? "sincronizado pela API · " : ""}atualiza automaticamente a cada 2 horas
        </div>
      </div>
    </div>
  );
}

export function AbaTransportadora({ transportadora }: { transportadora: TransportadoraLogistica }) {
  const nome = nomeExibicao(transportadora.razao_social, transportadora.nome_fantasia);
  const nomeUpper =
    (transportadora.razao_social || "").toUpperCase() + " " + (transportadora.nome_fantasia || "").toUpperCase();
  const ehBraspress = nomeUpper.includes("BRASPRESS");
  const ehCorreios = nomeUpper.includes("CORREIOS") || nomeUpper.includes("EMPRESA BRASILEIRA DE CORREIOS");
  const ehFrenet = nomeUpper.includes("FRENET");
  const carrierB2C: "Correios" | "Frenet" | null = ehCorreios ? "Correios" : ehFrenet ? "Frenet" : null;
  const [abrirRastreio, setAbrirRastreio] = useState(false);

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
            <IndicadorSincronizacao transportadoraId={transportadora.id} />
          ) : (
            <Button variant="outline" onClick={() => setAbrirRastreio(true)} className="gap-2">
              <Truck className="h-4 w-4" /> Importar rastreio (NF)
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="visao" className="w-full">
        <TabsList>
          <TabsTrigger value="visao">Visão Geral</TabsTrigger>
          <TabsTrigger value="fretes">Fretes &amp; entregas</TabsTrigger>
          <TabsTrigger value="faturas">Faturas</TabsTrigger>
          <TabsTrigger value="tabela">Tabela de preço</TabsTrigger>
          <TabsTrigger value="ocorrencias">Ocorrências</TabsTrigger>
        </TabsList>
        <TabsContent value="visao" className="mt-4">
          <PainelLogistica escopo={{ tipo: "transportadora", transportadoraId: transportadora.id, transportadoraNome: nome }} />
        </TabsContent>
        <TabsContent value="fretes" className="mt-4">
          {carrierB2C ? (
            <FretesEntregasB2C transportadoraId={transportadora.id} transportadoraNome={nome} />
          ) : (
            <FretesEntregas
              transportadoraId={transportadora.id}
              transportadoraNome={nome}
              hideImport={ehBraspress}
            />
          )}
        </TabsContent>
        <TabsContent value="faturas" className="mt-4">
          <FaturasConciliacao
            transportadoraId={transportadora.id}
            transportadoraNome={nome}
            carrierB2C={carrierB2C}
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
    </div>
  );
}
