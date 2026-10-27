import { useState } from "react";
import { nomeExibicao } from "@/lib/parceiros/nome";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Building2, Truck, Cloud, AlertTriangle, CloudOff, Loader2, Upload, FileCode } from "lucide-react";
import { EntregasRemessas } from "./EntregasRemessas";
import { ImportarRastreioDialog } from "./ImportarRastreioDialog";
import { ImportarFretesDialog } from "./ImportarFretesDialog";
import { ImportarCteXmlDialog } from "./ImportarCteXmlDialog";
import { PainelRemessas } from "./PainelRemessas";
import { CustosFaturasTransportadora, TabelasCotacaoTransportadora } from "./ConteudoPorPerfil";
import { useUltimaSincronizacao } from "@/hooks/logistica/useUltimaSincronizacao";
import { useTransportadoraPerfis, PERFIL_SEM_CADASTRO } from "@/hooks/logistica/useTransportadoraPerfil";
import { ROTULO_MODO_CUSTO, ROTULO_MODO_RASTREIO } from "@/lib/logistica/perfilRotulos";
import { Badge } from "@/components/ui/badge";
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

function horaSaoPaulo(): number {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")?.value;
  return h ? parseInt(h, 10) : 0;
}

function deveSinalizarAtraso(atualizadoEm: string | null): boolean {
  // O cron de sincronização por API roda apenas entre 9h e 22h59.
  // Fora dessa janela (especialmente a madrugada) o intervalo maior é normal,
  // então não devemos pintar o indicador de alerta.
  const horaLocal = horaSaoPaulo();
  if (horaLocal < 9 || horaLocal > 22) return false;
  const h = horasDesde(atualizadoEm);
  return h !== null && h > 3;
}

function IndicadorSincronizacao({ transportadoraId }: { transportadoraId: string }) {
  const { data, isLoading } = useUltimaSincronizacao(transportadoraId);
  const atrasado = deveSinalizarAtraso(data?.atualizado_em ?? null);
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
      {atrasado ? <AlertTriangle className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}
      <div className="leading-tight">
        <div className="font-medium">{linhaPrincipal}</div>
        <div className="text-xs opacity-90">
          {origemApi ? "sincronizado pela API · " : ""}atualiza automaticamente a cada 2 horas
        </div>
      </div>
    </div>
  );
}

export const ABAS_LOGISTICA = [
  { value: "painel", label: "Painel" },
  { value: "entregas", label: "Entregas" },
  { value: "custos", label: "Custos & Faturas" },
  { value: "tabelas", label: "Tabelas & Cotação" },
] as const;

// PERFIL-É-DIMENSÃO: tudo que muda entre transportadoras vem de transportadora_perfil.
export function AbaTransportadora({ transportadora, aba }: { transportadora: TransportadoraLogistica; aba: string }) {
  const nome = nomeExibicao(transportadora.razao_social, transportadora.nome_fantasia);
  const { data: perfis, isLoading: carregandoPerfil } = useTransportadoraPerfis();
  const cadastrado = perfis?.[transportadora.id] ?? null;
  const perfil = cadastrado ?? { transportadora_id: transportadora.id, ...PERFIL_SEM_CADASTRO };
  const [abrirRastreio, setAbrirRastreio] = useState(false);
  const [abrirFatura, setAbrirFatura] = useState(false);
  const [abrirCte, setAbrirCte] = useState(false);

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
            {cadastrado && (
              <div className="text-xs text-muted-foreground">
                Custo por {ROTULO_MODO_CUSTO[perfil.modo_custo]} · Rastreio por {ROTULO_MODO_RASTREIO[perfil.modo_rastreio]}
                {perfil.canais.length ? ` · Canais ${perfil.canais.join(", ").toUpperCase()}` : ""}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {carregandoPerfil ? null : !cadastrado ? (
            <Badge variant="outline" className="border-warning/50 text-warning">transportadora sem perfil cadastrado</Badge>
          ) : (
            <>
              {perfil.modo_rastreio === "api" && <IndicadorSincronizacao transportadoraId={transportadora.id} />}
              {perfil.importa_rastreio && (
                <Button variant="outline" onClick={() => setAbrirRastreio(true)} className="gap-2">
                  <Truck className="h-4 w-4" /> Importar rastreio (NF)
                </Button>
              )}
              {perfil.importa_fatura && (
                <>
                  <Button variant="outline" onClick={() => setAbrirCte(true)} className="gap-2">
                    <FileCode className="h-4 w-4" /> Importar XML de CT-e
                  </Button>
                  <Button onClick={() => setAbrirFatura(true)} className="gap-2">
                    <Upload className="h-4 w-4" /> Importar fatura
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {aba === "painel" && <PainelRemessas escopo={{ canal: "total", transportadoraId: transportadora.id }} mostrarPorTransportadora={false} />}
      {aba === "entregas" && <EntregasRemessas transportadoraId={transportadora.id} />}
      {aba === "custos" && <CustosFaturasTransportadora id={transportadora.id} nome={nome} />}
      {aba === "tabelas" && <TabelasCotacaoTransportadora id={transportadora.id} />}

      {abrirRastreio && (
        <ImportarRastreioDialog open={abrirRastreio} onOpenChange={setAbrirRastreio}
          transportadoraId={transportadora.id} transportadoraNome={nome} />
      )}
      {abrirFatura && (
        <ImportarFretesDialog open={abrirFatura} onOpenChange={setAbrirFatura}
          transportadoraId={transportadora.id} transportadoraNome={nome} />
      )}
      {abrirCte && <ImportarCteXmlDialog open={abrirCte} onOpenChange={setAbrirCte} />}
    </div>
  );
}
