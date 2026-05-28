import { useParams, useNavigate } from "react-router-dom";
import { useParceiroDetalhe } from "@/hooks/parceiros/useParceiroDetalhe";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ShieldAlert, AlertCircle, MapPin, FileText } from "lucide-react";
import { EditarProgramaInline } from "@/components/credito/EditarProgramaInline";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function Linha({
  label, value,
}: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value ?? "—"}</span>
    </div>
  );
}

export default function ParceiroDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useParceiroDetalhe(id);

  const handleVoltar = () => {
    if (window.history.length > 2) navigate(-1);
    else navigate("/pedidos");
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-sm text-muted-foreground">Parceiro não encontrado.</p>
      </div>
    );
  }

  const { parceiro, total_pedidos, valor_total, pedidos_em_aberto } = data;

  const enderecoCompleto = [
    parceiro.logradouro,
    parceiro.numero,
    parceiro.complemento,
    parceiro.bairro,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Button variant="ghost" size="sm" className="gap-2" onClick={handleVoltar}>
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Button>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{parceiro.razao_social}</h1>
        {parceiro.nome_fantasia && (
          <p className="text-sm text-muted-foreground">{parceiro.nome_fantasia}</p>
        )}
        <p className="text-xs text-muted-foreground">CNPJ {parceiro.cnpj}</p>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2">
        {parceiro.bandeira_vermelha && (
          <Badge variant="destructive" className="gap-1">
            <ShieldAlert className="h-3 w-3" />
            Bandeira Vermelha
          </Badge>
        )}
        {parceiro.cadastro_incompleto && (
          <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700">
            <AlertCircle className="h-3 w-3" />
            Cadastro incompleto
          </Badge>
        )}
        {parceiro.nivel_programa && (
          <Badge variant="secondary" className="capitalize">
            {String(parceiro.nivel_programa).replace("_", " ")}
          </Badge>
        )}
        {parceiro.categoria_ka && (
          <Badge variant="outline">KA {parceiro.categoria_ka}</Badge>
        )}
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Pedidos totais</p>
            <p className="text-2xl font-bold mt-1">{total_pedidos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Em aberto</p>
            <p className="text-2xl font-bold mt-1">{pedidos_em_aberto}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor total</p>
            <p className="text-2xl font-bold mt-1">{fmtBRL.format(valor_total)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Grid 2 cards: Cadastro + Classificação */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Cadastro
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Linha label="Razão social" value={parceiro.razao_social} />
            <Linha label="Nome fantasia" value={parceiro.nome_fantasia} />
            <Linha label="CNPJ" value={parceiro.cnpj} />
            {parceiro.inscricao_estadual && (
              <Linha label="Inscrição estadual" value={parceiro.inscricao_estadual} />
            )}
            {parceiro.situacao_receita && (
              <Linha label="Situação Receita" value={parceiro.situacao_receita} />
            )}
            <Separator className="my-2" />
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="space-y-0.5 flex-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Endereço</p>
                {enderecoCompleto ? (
                  <>
                    <p className="text-sm">{enderecoCompleto}</p>
                    <p className="text-xs text-muted-foreground">
                      {parceiro.cidade && parceiro.uf ? `${parceiro.cidade}/${parceiro.uf}` : ""}
                      {parceiro.cep && ` · CEP ${parceiro.cep}`}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Endereço não cadastrado</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Classificação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <EditarProgramaInline
              parceiro_id={parceiro.id}
              nivel_atual={parceiro.nivel_programa || "convive"}
              categoria_ka_atual={parceiro.categoria_ka ?? null}
            />
            {parceiro.perfil_credito && (
              <>
                <Separator className="my-2" />
                <Linha label="Perfil de crédito" value={String(parceiro.perfil_credito).replace("_", " ")} />
              </>
            )}
            {parceiro.bandeira_vermelha && (
              <>
                <Separator className="my-2" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">🚩 Bandeira Vermelha</p>
                  {parceiro.bandeira_vermelha_motivo && (
                    <p className="text-xs text-muted-foreground">{parceiro.bandeira_vermelha_motivo}</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Mais info do parceiro (sócios, atividade comercial detalhada, histórico) virão em próximas fases.
      </p>
    </div>
  );
}
