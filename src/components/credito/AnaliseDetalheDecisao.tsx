import { useState, useEffect } from "react";
import { useAnaliseDetalhe } from "@/hooks/credito/useAnaliseDetalhe";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BadgesContextuais } from "./BadgesContextuais";
import { PainelIaConsolidado } from "./PainelIaConsolidado";
import { FormDecisaoCredito, type CamposDecisao } from "./FormDecisaoCredito";
import { HistoricoClienteAccordion } from "./HistoricoClienteAccordion";
import { ScoresAnexados } from "./ScoresAnexados";
import { AprovarDialog } from "./dialogs/AprovarDialog";
import { ReprovarDialog } from "./dialogs/ReprovarDialog";
import { DevolverParaAnaliseDialog } from "./dialogs/DevolverParaAnaliseDialog";
import { DevolverParaEntradaDialog } from "./dialogs/DevolverParaEntradaDialog";
import { CancelarAnaliseDialog } from "./dialogs/CancelarAnaliseDialog";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { AnaliseIaJson, PerfilCredito, FormaPagamento } from "@/types/credito";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("pt-BR") : "—";

interface Props {
  analiseId: string;
}

export function AnaliseDetalheDecisao({ analiseId }: Props) {
  const { data, isLoading } = useAnaliseDetalhe(analiseId);
  const navigate = useNavigate();

  const iaJson = (data?.analise.analise_ia_json as AnaliseIaJson | null) ?? null;
  const sugestaoIA = iaJson?.sugestao || null;

  const [campos, setCampos] = useState<CamposDecisao>({
    perfil_aplicado: "novo_entrada",
    limite_concedido: 5000,
    prazo_max_dias: 30,
    formas_aceitas: ["boleto", "pix", "cartao"],
    parecer_final: "",
    ressalva: "",
    validade_ate: "",
    contexto_anotacao: "",
  });

  useEffect(() => {
    if (sugestaoIA) {
      setCampos({
        perfil_aplicado: (sugestaoIA.perfil_aplicado as PerfilCredito) || "novo_entrada",
        limite_concedido: sugestaoIA.limite_concedido || 5000,
        prazo_max_dias: sugestaoIA.prazo_max_dias || 30,
        formas_aceitas: (sugestaoIA.formas_aceitas as FormaPagamento[]) || [
          "boleto",
          "pix",
          "cartao",
        ],
        parecer_final: sugestaoIA.parecer_final || "",
        ressalva: sugestaoIA.ressalva || "",
        validade_ate: sugestaoIA.validade_ate || "",
        contexto_anotacao: "",
      });
    }
  }, [sugestaoIA]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
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
    marcos,
  } = data;

  return (
    <div className="space-y-6 pb-32">
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
              CNPJ {parceiro?.cnpj} · Pedido {pedido?.id_externo} ·{" "}
              <Badge variant="secondary">Decisão</Badge>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Valor líquido
            </p>
            <p className="text-2xl font-bold">
              {fmtBRL.format(Number(pedido?.valor_liquido || 0))}
            </p>
            <p className="text-xs text-muted-foreground">
              {pedido?.condicao_solicitada} · {pedido?.forma_solicitada}
            </p>
          </div>
        </div>
        <BadgesContextuais
          parceiro={parceiro || {}}
          analisesAnteriores={analisesAnteriores}
          kpisGrupo={kpisGrupo}
          valorPedido={pedido?.valor_liquido}
        />
      </div>

      {/* PAINEL IA CENTRAL */}
      <PainelIaConsolidado
        iaJson={iaJson}
        iaResumo={analise.analise_ia_resumo ?? null}
        iaConfianca={analise.analise_ia_confianca ?? null}
        iaProcessadaEm={analise.analise_ia_processada_em ?? null}
      />

      {/* FORMULÁRIO */}
      <FormDecisaoCredito
        valores={campos}
        sugestaoIA={sugestaoIA}
        onChange={setCampos}
      />

      {/* 3 painéis menores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financeiro do cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {kpisFinanceiros ? (
              <>
                <Linha label="Em aberto" value={fmtBRL.format(kpisFinanceiros.em_aberto)} />
                <Linha
                  label="Vencidos"
                  value={fmtBRL.format(kpisFinanceiros.vencidos)}
                  destaque={kpisFinanceiros.vencidos > 0}
                />
                <Linha label="A vencer" value={fmtBRL.format(kpisFinanceiros.a_vencer)} />
                <Linha label="Pago total" value={fmtBRL.format(kpisFinanceiros.pago)} />
                <Linha
                  label="Maior compra"
                  value={fmtBRL.format(kpisFinanceiros.maior_compra)}
                />
                <Linha
                  label="Última compra"
                  value={fmtDate(kpisFinanceiros.ultima_compra_em)}
                />
                <Linha
                  label="Atraso médio"
                  value={`${kpisFinanceiros.atraso_medio_dias || 0}d`}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Cliente novo. Sem histórico.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Grupo econômico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {kpisGrupo ? (
              <>
                <p className="text-sm font-medium">{kpisGrupo.grupo_nome}</p>
                <Linha label="Parceiros" value={kpisGrupo.qtd_parceiros} />
                <Separator className="my-1" />
                <Linha label="Em aberto" value={fmtBRL.format(kpisGrupo.em_aberto)} />
                <Linha
                  label="Vencidos"
                  value={fmtBRL.format(kpisGrupo.vencidos)}
                  destaque={kpisGrupo.vencidos > 0}
                />
                <Linha label="A vencer" value={fmtBRL.format(kpisGrupo.a_vencer)} />
                <Linha label="Pago total" value={fmtBRL.format(kpisGrupo.pago)} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Sem grupo econômico detectado.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cliente · Sócios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Linha label="CNPJ" value={parceiro?.cnpj} />
            <Linha
              label="Cidade/UF"
              value={`${parceiro?.cidade || "—"} / ${parceiro?.uf || "—"}`}
            />
            <Linha label="Situação" value={parceiro?.situacao_cadastral} />
            <Linha label="Nível" value={parceiro?.nivel_programa} />
            {parceiro?.categoria_ka && (
              <Linha label="Categoria KA" value={parceiro.categoria_ka} />
            )}
            <Separator className="my-2" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Sócios ({socios.length})
            </p>
            {socios.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum cadastrado</p>
            )}
            {socios.map((s) => (
              <p key={s.id} className="text-sm">
                {s.nome}
                {s.participacao_pct ? ` · ${s.participacao_pct}%` : ""}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Bureaus */}
      <ScoresAnexados scores={scores} />

      {/* Histórico */}
      <HistoricoClienteAccordion
        analisesAnteriores={analisesAnteriores}
        marcos={marcos}
      />

      {/* AÇÕES — barra fixa no rodapé */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-40">
        <div className="container max-w-screen-2xl mx-auto py-3 px-4 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-muted-foreground max-w-md">
            Confira o formulário. Aprovar usa os valores acima. Outras ações apenas registram o motivo.
          </p>
          <div className="flex gap-2 flex-wrap">
            <CancelarAnaliseDialog analise_id={analise.id} />
            <DevolverParaEntradaDialog analise_id={analise.id} />
            <DevolverParaAnaliseDialog analise_id={analise.id} />
            <ReprovarDialog analise_id={analise.id} campos={campos} />
            <AprovarDialog
              analise_id={analise.id}
              campos={campos}
              sugestaoIA={sugestaoIA}
              comRessalva
            />
            <AprovarDialog
              analise_id={analise.id}
              campos={campos}
              sugestaoIA={sugestaoIA}
            />
          </div>
        </div>
      </div>
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
