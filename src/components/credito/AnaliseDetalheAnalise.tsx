import { useAnaliseDetalhe } from "@/hooks/credito/useAnaliseDetalhe";
import { useConfirmarPreAprovacao } from "@/hooks/credito/useConfirmarPreAprovacao";
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
import { BoxDevolucaoRecente } from "./BoxDevolucaoRecente";
import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnaliseIaJson, PreAprovacaoPayload } from "@/types/credito";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("pt-BR") : "—";

interface Props {
  analiseId: string;
}

export function AnaliseDetalheAnalise({ analiseId }: Props) {
  const { data, isLoading } = useAnaliseDetalhe(analiseId);
  const navigate = useNavigate();
  const confirmarPre = useConfirmarPreAprovacao();

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
    transicoes,
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
          onClick={() => navigate("/credito?tab=analise")}
        >
          <ArrowLeft className="h-4 w-4" />
          Fila (Análise)
        </Button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              <button
                type="button"
                onClick={() => parceiro?.id && navigate(`/credito/clientes/${parceiro.id}`)}
                className="hover:underline text-left"
              >
                {parceiro?.razao_social || "Cliente sem razão"}
              </button>
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

      {/* Card de pré-aprovação (Joseph confirma 1-clique) */}
      {analise.pre_aprovado_regra_id && !analise.status_final && (
        <PreAprovacaoCard
          payload={analise.pre_aprovacao_payload as PreAprovacaoPayload | null}
          loading={confirmarPre.isPending}
          onConfirmar={() =>
            confirmarPre.mutate(analise.id, {
              onSuccess: () => navigate("/credito?tab=analise"),
            })
          }
        />
      )}

      {/* Box devolução, se aplicável */}
      <BoxDevolucaoRecente transicoes={transicoes} estagioAtual="analise" />

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
          <ScoresAnexados scores={scores} analiseId={analiseId} />
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

function resumirCondicao(c: unknown): string {
  if (!c || typeof c !== "object") return "—";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cond = c as any;
  if (typeof cond.resumo === "string") return cond.resumo;
  const partes: string[] = [];
  if (cond.condicao) partes.push(String(cond.condicao));
  if (cond.forma) partes.push(String(cond.forma).toUpperCase());
  if (typeof cond.limite_concedido === "number")
    partes.push(fmtBRL.format(cond.limite_concedido));
  if (typeof cond.prazo_max_dias === "number") partes.push(`até ${cond.prazo_max_dias}d`);
  return partes.length ? partes.join(" · ") : JSON.stringify(cond);
}

function PreAprovacaoCard({
  payload,
  loading,
  onConfirmar,
}: {
  payload: PreAprovacaoPayload | null;
  loading: boolean;
  onConfirmar: () => void;
}) {
  return (
    <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
          <Sparkles className="h-4 w-4" />
          Pré-aprovado pela regra "{payload?.regra_nome ?? "regra desconhecida"}"
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm">
          <div>
            <p className="text-xs font-medium text-emerald-900/70 dark:text-emerald-200/70 uppercase tracking-wide">
              Parecer sugerido
            </p>
            <p className="text-emerald-900 dark:text-emerald-100 whitespace-pre-wrap">
              {payload?.parecer_sugerido || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-emerald-900/70 dark:text-emerald-200/70 uppercase tracking-wide">
              Condição sugerida
            </p>
            <p className="text-emerald-900 dark:text-emerald-100">
              {resumirCondicao(payload?.condicao_sugerida)}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start gap-1.5">
          <Button
            onClick={onConfirmar}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Confirmando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Confirmar pré-aprovação
              </>
            )}
          </Button>
          <p className="text-xs text-emerald-900/70 dark:text-emerald-200/70">
            Você ainda pode decidir manualmente nos botões abaixo se preferir.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
