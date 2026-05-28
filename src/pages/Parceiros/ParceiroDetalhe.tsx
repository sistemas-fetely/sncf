import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useParceiroDetalhe } from "@/hooks/parceiros/useParceiroDetalhe";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ShieldAlert, AlertCircle, MapPin, FileText, Sparkles, Loader2, Building2, Users, Phone, Mail, CheckCircle2, XCircle } from "lucide-react";
import { EditarProgramaInline } from "@/components/credito/EditarProgramaInline";
import { useEnriquecerParceiro } from "@/hooks/credito/useEnriquecerParceiro";
import { validateCNPJ } from "@/lib/cnpj";

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
  const location = useLocation();
  const { data, isLoading } = useParceiroDetalhe(id);
  const enriquecer = useEnriquecerParceiro();

  const handleVoltar = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const from = (location.state as any)?.from as string | undefined;
    if (from) {
      navigate(from);
    } else {
      navigate("/administrativo/parceiros");
    }
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

  const { parceiro, socios, total_pedidos, valor_total, pedidos_em_aberto } = data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rf = (parceiro.contexto_bureau as any)?.brasilapi as Record<string, any> | undefined;

  const fmtDateBR = (s: string | null | undefined) => {
    if (!s) return "—";
    try { return new Date(s).toLocaleDateString("pt-BR"); } catch { return s; }
  };

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

      {/* Box enriquecer — quando cadastro incompleto */}
      {parceiro.cadastro_incompleto && parceiro.cnpj && parceiro.cnpj.length === 14 && (() => {
        const cnpjValido = validateCNPJ(parceiro.cnpj);
        return (
          <Card className={`border-l-4 ${cnpjValido ? "border-l-amber-500 bg-amber-50/40" : "border-l-destructive bg-destructive/5"}`}>
            <CardContent className="py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <AlertCircle className={`h-4 w-4 shrink-0 mt-0.5 ${cnpjValido ? "text-amber-600" : "text-destructive"}`} />
                <div className="min-w-0">
                  {cnpjValido ? (
                    <>
                      <p className="text-sm font-medium text-amber-900">Cadastro incompleto</p>
                      <p className="text-xs text-amber-800">
                        Faltam dados de razão social, endereço, e/ou sócios. Enriqueça via BrasilAPI pra completar automaticamente.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-destructive">CNPJ com dígito verificador inválido</p>
                      <p className="text-xs text-destructive/80">
                        Esse CNPJ não passa na validação. Corrija manualmente pela edição rápida (lápis na listagem).
                      </p>
                    </>
                  )}
                </div>
              </div>
              {cnpjValido && (
                <Button
                  size="sm"
                  className="gap-2 shrink-0"
                  onClick={() => parceiro.id && enriquecer.mutate(parceiro.id)}
                  disabled={enriquecer.isPending}
                >
                  {enriquecer.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enriquecendo...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Enriquecer agora
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })()}

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
