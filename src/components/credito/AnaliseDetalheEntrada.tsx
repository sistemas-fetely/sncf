import { useAnaliseDetalhe } from "@/hooks/credito/useAnaliseDetalhe";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { BadgesContextuais } from "./BadgesContextuais";
import { EncaminharDialog } from "./dialogs/EncaminharDialog";
import { CancelarAnaliseDialog } from "./dialogs/CancelarAnaliseDialog";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("pt-BR") : "—";
const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("pt-BR") : "—";

interface Props {
  analiseId: string;
}

export function AnaliseDetalheEntrada({ analiseId }: Props) {
  const { data, isLoading } = useAnaliseDetalhe(analiseId);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!data) {
    return <p className="text-muted-foreground">Análise não encontrada.</p>;
  }

  const { analise, pedido, parceiro, socios, kpisFinanceiros, kpisGrupo, analisesAnteriores } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="gap-2 -ml-2" onClick={() => navigate("/credito")}>
          <ArrowLeft className="h-4 w-4" />
          Fila de Entrada
        </Button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {parceiro?.razao_social || "Cliente sem razão"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Análise {analise.id.slice(0, 8)}... · Pedido {pedido?.id_externo} · Criada em {fmtDateTime(analise.criado_em)}
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

      {/* 3 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pedido */}
        <Card>
          <CardHeader><CardTitle className="text-base">Pedido</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Linha label="ID Externo" value={pedido?.id_externo} />
            <Linha label="Data" value={fmtDate(pedido?.data_pedido)} />
            <Separator className="my-2" />
            <Linha label="Valor bruto" value={fmtBRL.format(Number(pedido?.valor_bruto || 0))} />
            <Linha label="Desconto" value={pedido?.desconto_pct ? `${pedido.desconto_pct}%` : "—"} />
            <Linha label="Valor líquido" value={fmtBRL.format(Number(pedido?.valor_liquido || 0))} destaque />
            <Separator className="my-2" />
            <Linha label="Condição" value={pedido?.condicao_solicitada} />
            <Linha label="Forma" value={pedido?.forma_solicitada} />
            <Separator className="my-2" />
            <Linha label="Vendedor" value={pedido?.vendedor} />
            <Linha label="Origem" value={pedido?.origem} />
            <Linha label="Recebido via" value={pedido?.recebido_via} />
          </CardContent>
        </Card>

        {/* Parceiro */}
        <Card>
          <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Linha label="Razão social" value={parceiro?.razao_social} />
            <Linha label="Nome fantasia" value={parceiro?.nome_fantasia} />
            <Linha label="CNPJ" value={parceiro?.cnpj} />
            <Separator className="my-2" />
            <Linha label="Cidade" value={parceiro?.cidade} />
            <Linha label="UF" value={parceiro?.uf} />
            <Linha label="Situação" value={parceiro?.situacao_cadastral} />
            <Separator className="my-2" />
            <Linha label="Nível Programa" value={parceiro?.nivel_programa} />
            {parceiro?.categoria_ka && <Linha label="Categoria KA" value={parceiro.categoria_ka} />}
            <Separator className="my-2" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Sócios ({socios.length})
              </p>
              {socios.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum cadastrado</p>
              )}
              {socios.map((s) => (
                <p key={s.id} className="text-sm">
                  {s.nome}
                  {s.participacao_pct && ` · ${s.participacao_pct}%`}
                  {s.qualificacao && ` · ${s.qualificacao}`}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Histórico */}
        <Card>
          <CardHeader><CardTitle className="text-base">Histórico Fetely</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Linha label="Análises anteriores" value={analisesAnteriores.length} />
            {analisesAnteriores[0] && (
              <Linha label="Última análise" value={fmtDate(analisesAnteriores[0].decidido_em)} />
            )}
            <Separator className="my-2" />
            {kpisFinanceiros && (
              <>
                <Linha label="Em aberto" value={fmtBRL.format(kpisFinanceiros.em_aberto)} />
                <Linha
                  label="Vencidos"
                  value={fmtBRL.format(kpisFinanceiros.vencidos)}
                  destaque={kpisFinanceiros.vencidos > 0}
                />
                <Linha label="A vencer" value={fmtBRL.format(kpisFinanceiros.a_vencer)} />
                <Linha label="Pago histórico" value={fmtBRL.format(kpisFinanceiros.pago)} />
                <Linha label="Maior compra" value={fmtBRL.format(kpisFinanceiros.maior_compra)} />
                <Linha label="Última compra" value={fmtDate(kpisFinanceiros.ultima_compra_em)} />
                <Linha label="Atraso médio (d)" value={kpisFinanceiros.atraso_medio_dias} />
              </>
            )}
            {!kpisFinanceiros && (
              <p className="text-sm text-muted-foreground">
                Cliente novo na Fetely. Sem histórico financeiro.
              </p>
            )}
            {kpisGrupo && (
              <>
                <Separator className="my-2" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Grupo: {kpisGrupo.grupo_nome}
                </p>
                <Linha label="Em aberto (grupo)" value={fmtBRL.format(kpisGrupo.em_aberto)} />
                <Linha
                  label="Vencidos (grupo)"
                  value={fmtBRL.format(kpisGrupo.vencidos)}
                  destaque={kpisGrupo.vencidos > 0}
                />
                <Linha label="Parceiros no grupo" value={kpisGrupo.qtd_parceiros} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ações */}
      <Card>
        <CardContent className="pt-6 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-muted-foreground max-w-2xl">
            Confira os dados acima. Se estiver tudo OK, encaminhe pra Análise.
            Se houver erro no payload, cancele com motivo (será reenviado pelo Thomer).
          </p>
          <div className="flex gap-2">
            <CancelarAnaliseDialog analise_id={analise.id} />
            <EncaminharDialog analise_id={analise.id} />
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
