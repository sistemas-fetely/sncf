import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtBRL, fmtCompetencia, fmtData, fmtPct } from "@/lib/portal/api";
import { PortalCartilha } from "./PortalCartilha";
import { PortalComissoes } from "./PortalComissoes";
import { PortalSimulador } from "./PortalSimulador";

interface Props {
  sessao: string;
  painel: any;
  onRecarregar: () => void;
  onSair: () => void;
}

export function PortalPainel({ sessao, painel, onRecarregar, onSair }: Props) {
  const resumo = painel?.resumo ?? {};
  const cartilha = painel?.cartilha ?? null;
  const extrato: any[] = Array.isArray(painel?.extrato) ? painel.extrato : [];
  const regras = painel?.regras ?? {};

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Portal do Representante · Fetély
          </p>
          <h1 className="text-xl font-medium tracking-tight">
            {painel?.representante?.nome ?? painel?.nome ?? "Representante"}
          </h1>
        </div>
        <Button variant="outline" size="sm" onClick={onSair}>
          Sair
        </Button>
      </header>

      {cartilha && !cartilha.aceita_em && (
        <PortalCartilha sessao={sessao} cartilha={cartilha} onAceito={onRecarregar} />
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sua comissão</CardTitle>
          <CardDescription>
            Sua comissão é liberada conforme o cliente paga cada parcela.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-success/60 bg-success/10 p-3">
            <p className="text-xs font-medium text-success">Liberado — já pode ser pago</p>
            <p className="text-2xl font-medium">{fmtBRL(resumo.liberado)}</p>
          </div>
          <div className="rounded-md border border-warning/60 bg-warning/10 p-3">
            <p className="text-xs font-medium text-warning">
              Pendente — depende do cliente pagar
            </p>
            <p className="text-2xl font-medium">{fmtBRL(resumo.pendente)}</p>
          </div>
          <div className="rounded-md border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">Apurado no total</p>
            <p className="text-2xl font-medium">{fmtBRL(resumo.apurado)}</p>
          </div>
        </CardContent>
      </Card>

      <PortalComissoes
        sessao={sessao}
        comissoes={Array.isArray(painel?.comissoes) ? painel.comissoes : []}
        onMudou={onRecarregar}
      />

      <PortalSimulador sessao={sessao} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Extrato por competência</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {extrato.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma competência fechada ainda.</p>
          ) : (
            extrato.map((e: any, i: number) => (
              <div
                key={i}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border/60 p-3"
              >
                <div>
                  <p className="text-sm font-medium">{fmtCompetencia(e.competencia)}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.nfs ?? 0} NF(s) · pagamento até {fmtData(e.data_limite_pagamento ?? e.data_limite)}
                  </p>
                </div>
                <p className="text-lg font-medium">{fmtBRL(e.valor_a_pagar)}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Como sua comissão é calculada</CardTitle>
          {regras.base && <CardDescription>{regras.base}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Percentual por linha
            </p>
            {(Array.isArray(regras.linhas) ? regras.linhas : []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem percentuais publicados.</p>
            ) : (
              (regras.linhas as any[]).map((l: any, i: number) => (
                <div key={i} className="flex items-baseline justify-between text-sm">
                  <span>{l.linha ?? "—"}</span>
                  <span className="font-medium">{fmtPct(l.pct)}</span>
                </div>
              ))
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Régua de desconto
            </p>
            {(Array.isArray(regras.desconto) ? regras.desconto : []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem régua publicada.</p>
            ) : (
              (regras.desconto as any[]).map((d: any, i: number) => (
                <div key={i} className="flex items-baseline justify-between text-sm">
                  <span>
                    Desconto {fmtPct(d.desconto_de ?? d.de)}
                    {d.desconto_ate ?? d.ate ? ` a ${fmtPct(d.desconto_ate ?? d.ate)}` : ""}
                  </span>
                  <span className="font-medium">
                    {d.fator !== undefined && d.fator !== null
                      ? `fator ${d.fator}`
                      : fmtPct(d.pct ?? d.pct_efetivo)}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <p className="pb-8 text-center text-xs text-muted-foreground">
        Fetély · gesto não se delega.
      </p>
    </div>
  );
}
