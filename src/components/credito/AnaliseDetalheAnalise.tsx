import { useAnaliseDetalhe } from "@/hooks/credito/useAnaliseDetalhe";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { BadgesContextuais } from "./BadgesContextuais";
import { UploadBureauZone } from "./UploadBureauZone";
import { ScoresAnexados } from "./ScoresAnexados";
import { AnaliseIaCard } from "./AnaliseIaCard";
import { EncaminharParaDecisaoDialog } from "./dialogs/EncaminharParaDecisaoDialog";
import { DevolverParaEntradaDialog } from "./dialogs/DevolverParaEntradaDialog";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnaliseIaJson } from "@/types/credito";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("pt-BR") : "—";

interface Props {
  analiseId: string;
}

export function AnaliseDetalheAnalise({ analiseId }: Props) {
  const { data, isLoading } = useAnaliseDetalhe(analiseId);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-96" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (!data) return <p className="text-muted-foreground">Análise não encontrada.</p>;

  const {
    analise,
    pedido,
    parceiro,
    socios,
    scores,
    kpisFinanceiros,
    kpisGrupo,
    analisesAnteriores,
  } = data;

  const iaJson = (analise.analise_ia_json as AnaliseIaJson | null) ?? null;
  const iaProcessada = !!analise.analise_ia_processada_em;
  const podeEncaminhar = scores.length > 0 && iaProcessada;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 -ml-2"
          onClick={() => navigate("/credito")}
        >
          <ArrowLeft className="h-4 w-4" />
          Fila
        </Button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {parceiro?.razao_social || "Cliente sem razão"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Análise {analise.id.slice(0, 8)}... · Estágio:{" "}
              <Badge variant="secondary">Análise</Badge> · Pedido {pedido?.id_externo}
            </p>
          </div>
          <BadgesContextuais
            parceiro={parceiro || {}}
            analisesAnteriores={analisesAnteriores}
            kpisGrupo={kpisGrupo}
            valorPedido={pedido?.valor_liquido}
          />
        </div>
      </div>

      {/* 2 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Coluna esquerda — info compacta */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Linha label="ID Externo" value={pedido?.id_externo} />
              <Linha label="Data" value={fmtDate(pedido?.data_pedido)} />
              <Separator className="my-2" />
              <Linha
                label="Valor líquido"
                value={fmtBRL.format(Number(pedido?.valor_liquido || 0))}
                destaque
              />
              <Linha label="Condição" value={pedido?.condicao_solicitada} />
              <Linha label="Forma" value={pedido?.forma_solicitada} />
              <Linha label="Vendedor" value={pedido?.vendedor} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Linha label="CNPJ" value={parceiro?.cnpj} />
              <Linha label="Cidade/UF" value={`${parceiro?.cidade || "—"} / ${parceiro?.uf || "—"}`} />
              <Linha label="Situação" value={parceiro?.situacao_cadastral} />
              <Linha label="Nível Programa" value={parceiro?.nivel_programa} />
              {socios.length > 0 && (
                <>
                  <Separator className="my-2" />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Sócios ({socios.length})
                  </p>
                  {socios.map((s) => (
                    <p key={s.id} className="text-sm">
                      {s.nome}
                      {s.participacao_pct ? ` · ${s.participacao_pct}%` : ""}
                    </p>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          {kpisFinanceiros && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Histórico Fetely</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Linha label="Em aberto" value={fmtBRL.format(kpisFinanceiros.em_aberto)} />
                <Linha
                  label="Vencidos"
                  value={fmtBRL.format(kpisFinanceiros.vencidos)}
                  destaque={kpisFinanceiros.vencidos > 0}
                />
                <Linha label="A vencer" value={fmtBRL.format(kpisFinanceiros.a_vencer)} />
                <Linha label="Maior compra" value={fmtBRL.format(kpisFinanceiros.maior_compra)} />
                <Linha label="Última compra" value={fmtDate(kpisFinanceiros.ultima_compra_em)} />
                <Linha label="Atraso médio (d)" value={kpisFinanceiros.atraso_medio_dias} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Coluna direita — área de operação */}
        <div className="lg:col-span-2 space-y-4">
          <UploadBureauZone analise_id={analise.id} />
          <ScoresAnexados scores={scores} />
          <AnaliseIaCard
            analise_id={analise.id}
            scoresCount={scores.length}
            iaJson={iaJson}
            iaResumo={analise.analise_ia_resumo ?? null}
            iaConfianca={analise.analise_ia_confianca ?? null}
            iaProcessadaEm={analise.analise_ia_processada_em ?? null}
          />
        </div>
      </div>

      {/* Ações */}
      <Card>
        <CardContent className="pt-6 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-muted-foreground max-w-2xl">
            {iaProcessada
              ? "Análise IA pronta. Encaminhe pra Joseph decidir."
              : "Anexe ao menos um bureau e gere a análise IA antes de encaminhar."}
          </p>
          <div className="flex gap-2">
            <DevolverParaEntradaDialog analise_id={analise.id} />
            <EncaminharParaDecisaoDialog
              analise_id={analise.id}
              disabled={!podeEncaminhar}
              disabledReason={
                !podeEncaminhar
                  ? "Anexe bureau e gere análise IA antes de encaminhar"
                  : undefined
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Linha({
  label,
  value,
  destaque,
}: {
  label: string;
  value: string | number | null | undefined;
  destaque?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium text-right", destaque && "text-destructive")}>
        {value ?? "—"}
      </span>
    </div>
  );
}
