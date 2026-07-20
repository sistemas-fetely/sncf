import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useClienteDetalhe } from "@/hooks/credito/useClienteDetalhe";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, ExternalLink, Plus, Receipt } from "lucide-react";
import { SmartBackButton } from "@/components/SmartBackButton";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { TimelineClienteVisual } from "@/components/credito/TimelineClienteVisual";
import { ErguerBandeiraVermelhaDialog } from "@/components/credito/dialogs/ErguerBandeiraVermelhaDialog";
import { BaixarBandeiraVermelhaDialog } from "@/components/credito/dialogs/BaixarBandeiraVermelhaDialog";
import { GerenciarHaverDialog } from "@/components/credito/GerenciarHaverDialog";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("pt-BR") : "—";

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useClienteDetalhe(id);
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const [criarHaverOpen, setCriarHaverOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!data) return <p className="text-muted-foreground">Cliente não encontrado.</p>;

  const { parceiro, socios, kpisFinanceiros, kpisGrupo, analises, marcos, haveres, titulos } = data;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "SOPs", to: "/pedidos" },
          { label: "Crédito do cliente", to: "/credito/clientes" },
          { label: parceiro?.razao_social ?? "Cliente" },
        ]}
        title={parceiro?.razao_social || "Cliente sem razão"}
        subtitle={[
          parceiro?.cnpj && `CNPJ ${parceiro.cnpj}`,
          parceiro?.nome_fantasia,
          parceiro?.cidade && parceiro?.uf && `${parceiro.cidade}/${parceiro.uf}`,
        ].filter(Boolean).join(" · ")}
        actions={
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Button size="sm" className="gap-2" onClick={() => setCriarHaverOpen(true)}>
                <Plus className="h-4 w-4" />
                Gerenciar crédito
              </Button>
            )}
            <SmartBackButton fallback="/credito/clientes" fallbackLabel="Voltar" />
            {parceiro?.bandeira_vermelha ? (
              <BaixarBandeiraVermelhaDialog parceiro_id={parceiro.id} />
            ) : (
              <ErguerBandeiraVermelhaDialog parceiro_id={parceiro?.id} />
            )}
          </div>
        }
      />

      <GerenciarHaverDialog
        open={criarHaverOpen}
        onOpenChange={setCriarHaverOpen}
        parceiroId={parceiro?.id ?? null}
      />

      <div className="space-y-3">


        <div className="flex flex-wrap gap-2">
          {parceiro?.bandeira_vermelha && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Bandeira Vermelha
            </Badge>
          )}
          {parceiro?.cadastro_incompleto && (
            <Badge variant="outline" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Cadastro incompleto
            </Badge>
          )}
          {parceiro?.perfil_credito && (
            <Badge variant="secondary">Perfil: {parceiro.perfil_credito}</Badge>
          )}
          {parceiro?.nivel_programa && (
            <Badge variant="secondary">Programa: {parceiro.nivel_programa}</Badge>
          )}
          {parceiro?.categoria_ka && (
            <Badge variant="outline">KA {parceiro.categoria_ka}</Badge>
          )}
        </div>
      </div>

      {parceiro?.bandeira_vermelha && parceiro?.bandeira_vermelha_motivo && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm font-semibold text-destructive">
              Motivo da bandeira vermelha
            </p>
            <p className="text-sm">{parceiro.bandeira_vermelha_motivo}</p>
            <p className="text-xs text-muted-foreground">
              Erguida em {fmtDate(parceiro.bandeira_vermelha_em)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Perfil + KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perfil do cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Linha label="CNPJ" value={parceiro?.cnpj} />
            <Linha label="Razão social" value={parceiro?.razao_social} />
            <Linha label="Nome fantasia" value={parceiro?.nome_fantasia} />
            <Linha label="Cidade/UF" value={parceiro?.cidade && parceiro?.uf ? `${parceiro.cidade}/${parceiro.uf}` : null} />
            <Linha label="Telefone" value={parceiro?.telefone} />
            <Linha label="E-mail" value={parceiro?.email} />
            <Linha label="Perfil de crédito" value={parceiro?.perfil_credito} />
            <Linha label="Nível programa" value={parceiro?.nivel_programa} />
            <Linha label="Categoria KA" value={parceiro?.categoria_ka} />
            <Separator className="my-3" />
            <div className="space-y-1.5">
              <p className="font-medium">Sócios ({socios.length})</p>
              {socios.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum cadastrado</p>
              )}
              {socios.map((s) => (
                <p key={s.id} className="text-xs">
                  <span className="font-medium">{s.nome}</span>
                  {s.participacao_pct ? ` · ${s.participacao_pct}%` : ""}
                  {s.qualificacao ? ` · ${s.qualificacao}` : ""}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo Financeiro Fetely</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {kpisFinanceiros ? (
              <>
                <Linha label="Em aberto" value={fmtBRL.format(kpisFinanceiros.em_aberto)} />
                <Linha label="Vencidos" value={fmtBRL.format(kpisFinanceiros.vencidos)} destaque={kpisFinanceiros.vencidos > 0} />
                <Linha label="A vencer" value={fmtBRL.format(kpisFinanceiros.a_vencer)} />
                <Linha label="Pago acumulado" value={fmtBRL.format(kpisFinanceiros.pago)} />
                <Linha label="Maior compra" value={fmtBRL.format(kpisFinanceiros.maior_compra)} />
                <Linha label="Última compra" value={fmtDate(kpisFinanceiros.ultima_compra_em)} />
                <Linha label="Atraso médio" value={`${kpisFinanceiros.atraso_medio_dias || 0} dias`} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Cliente novo. Sem histórico financeiro ainda.</p>
            )}
            {kpisGrupo && (
              <>
                <Separator className="my-3" />
                <p className="text-xs font-medium text-muted-foreground">
                  Grupo: {kpisGrupo.grupo_nome} ({kpisGrupo.qtd_parceiros} parceiros)
                </p>
                <Linha label="Grupo · em aberto" value={fmtBRL.format(kpisGrupo.em_aberto)} />
                <Linha label="Grupo · vencidos" value={fmtBRL.format(kpisGrupo.vencidos)} destaque={kpisGrupo.vencidos > 0} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crédito do cliente (haveres)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {haveres.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum haver disponível.</p>
            ) : (
              <>
                <p className="text-sm font-medium">
                  Disponível: {fmtBRL.format(haveres.reduce((acc, h) => acc + (h.saldo || 0), 0))}
                </p>
                <div className="space-y-2">
                  {haveres.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-start justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium">
                          {fmtBRL.format(h.saldo || 0)}
                          {h.saldo !== h.valor && (
                            <span className="text-xs text-muted-foreground ml-1">
                              de {fmtBRL.format(h.valor || 0)}
                            </span>
                          )}
                        </p>
                        {h.origem_descricao && (
                          <p className="text-xs text-muted-foreground truncate">{h.origem_descricao}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {h.data_expiracao
                            ? `Expira em ${fmtDate(h.data_expiracao)}`
                            : "Sem expiração"}
                        </p>
                      </div>
                      <Badge variant="outline" className="capitalize shrink-0">
                        {h.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Títulos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            Títulos
            <span className="text-xs font-normal text-muted-foreground ml-1">
              ({titulos.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {titulos.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-4">Nenhum título encontrado.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {titulos.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-6 py-3 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">
                      {t.numero_titulo}
                      {t.total_parcelas && t.total_parcelas > 1
                        ? ` (${t.numero_parcela}/${t.total_parcelas})`
                        : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.meio_pagamento ?? "—"}
                      {t.nf_numero ? ` · NF ${t.nf_numero}` : ""}
                      {t.banco_nome ? ` · ${t.banco_nome}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {t.status_gestao === "pago"
                          ? `Pago em ${t.data_liquidacao ? fmtDate(t.data_liquidacao) : "—"}`
                          : `Vence ${fmtDate(t.data_vencimento)}`}
                      </p>
                    </div>
                    <div className="min-w-[90px]">
                      <span
                        className={
                          t.status_gestao === "pago"
                            ? "text-muted-foreground"
                            : t.status_gestao === "atrasado"
                            ? "text-destructive font-medium"
                            : "text-foreground font-medium"
                        }
                      >
                        {fmtBRL.format(t.valor)}
                      </span>
                    </div>
                    <Badge
                      variant="secondary"
                      className={
                        t.status_gestao === "pago"
                          ? "bg-muted text-muted-foreground"
                          : t.status_gestao === "atrasado"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-primary/10 text-primary"
                      }
                    >
                      {t.status_gestao === "pago"
                        ? "Pago"
                        : t.status_gestao === "atrasado"
                        ? "Atrasado"
                        : "Em aberto"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Análises */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Análises ({analises.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {analises.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma análise ainda.</p>
          ) : (
            <div className="space-y-2">
              {analises.map((a) => (
                <button
                  key={a.id}
                  onClick={() => navigate(`/credito/analises/${a.id}`)}
                  className="w-full flex items-center justify-between gap-4 rounded-md border p-3 text-left hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant={a.status_final ? "secondary" : "outline"}>
                      {a.status_final || a.estagio_atual}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.pedido_id_externo}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtBRL.format(a.pedido_valor_liquido)} · {a.pedido_condicao} · {fmtDate(a.decidido_em || a.criado_em)}
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      <TimelineClienteVisual marcos={marcos} />
    </div>
  );
}

function Linha({
  label, value, destaque,
}: { label: string; value: string | number | null | undefined; destaque?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={destaque ? "font-semibold text-destructive" : "font-medium"}>
        {value ?? "—"}
      </span>
    </div>
  );
}
