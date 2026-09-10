import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { chamarPortal, fmtBRL, fmtData, fmtPct } from "@/lib/portal/api";

interface Props {
  sessao: string;
  comissoes: any[];
  onMudou: () => void;
}

function emAtraso(situacao: string | null | undefined) {
  return !!situacao && situacao.toLowerCase().includes("atraso");
}

export function PortalComissoes({ sessao, comissoes, onMudou }: Props) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [contestando, setContestando] = useState<any | null>(null);
  const [motivo, setMotivo] = useState("");
  const [valorEsperado, setValorEsperado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroDialog, setErroDialog] = useState<string | null>(null);

  function abrirContestacao(c: any) {
    setContestando(c);
    setMotivo("");
    setValorEsperado("");
    setErroDialog(null);
  }

  async function enviarContestacao() {
    setErroDialog(null);
    if (motivo.trim().length < 10) {
      setErroDialog("Descreva o motivo com pelo menos 10 caracteres.");
      return;
    }
    setEnviando(true);
    try {
      await chamarPortal("contestar", {
        sessao,
        apuracao_id: contestando?.apuracao_id ?? contestando?.id,
        motivo: motivo.trim(),
        valor_esperado: valorEsperado.trim() === "" ? null : Number(valorEsperado.replace(",", ".")),
      });
      toast.success("Contestação registrada. A Fetély vai responder por aqui.");
      setContestando(null);
      onMudou();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErroDialog(msg);
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  }

  if (!comissoes || comissoes.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Comissões</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nenhuma comissão apurada até agora.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Comissões</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {comissoes.map((c: any, i: number) => {
            const id = String(c.apuracao_id ?? c.id ?? i);
            const expandida = aberta === id;
            const atraso = emAtraso(c.situacao_cliente);
            return (
              <div
                key={id}
                className={`rounded-md border p-3 ${atraso ? "border-destructive/60 bg-destructive/5" : "border-border/60"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">NF {c.nf ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      Pedido {c.pedido ?? "—"}
                    </p>
                    {c.situacao_cliente && (
                      <Badge
                        variant={atraso ? "destructive" : "secondary"}
                        className="mt-1 gap-1"
                      >
                        {atraso && <AlertTriangle className="h-3 w-3" />}
                        {c.situacao_cliente}
                      </Badge>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Valor devido</p>
                    <p className="text-lg font-medium">{fmtBRL(c.valor_devido)}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div>
                    <p className="text-muted-foreground">Base</p>
                    <p className="font-medium">{fmtBRL(c.base)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Desconto</p>
                    <p className="font-medium">{fmtPct(c.desconto)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Liberado</p>
                    <p className="font-medium text-success">{fmtBRL(c.liberado)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Pendente</p>
                    <p className="font-medium text-warning">{fmtBRL(c.pendente)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Parcelas pagas</p>
                    <p className="font-medium">
                      {c.parcelas_pagas ?? 0}/{c.parcelas_total ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Próximo vencimento</p>
                    <p className="font-medium">{fmtData(c.proximo_vencimento)}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => setAberta(expandida ? null : id)}
                  >
                    {expandida ? (
                      <ChevronDown className="mr-1 h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="mr-1 h-3.5 w-3.5" />
                    )}
                    Itens da NF
                  </Button>

                  {c.contestacao ? (
                    <div className="text-xs">
                      <span className="font-medium">Contestação: </span>
                      {c.contestacao.status ?? "registrada"}
                      {c.contestacao.resposta ? ` — ${c.contestacao.resposta}` : ""}
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => abrirContestacao(c)}
                    >
                      Contestar
                    </Button>
                  )}
                </div>

                {expandida && (
                  <div className="mt-3 space-y-1 border-t border-border/60 pt-2">
                    {(c.linhas ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Sem detalhamento por linha nesta NF.
                      </p>
                    ) : (
                      (c.linhas ?? []).map((l: any, j: number) => (
                        <div
                          key={j}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <span className="font-medium">{l.linha ?? "—"}</span>
                          <span className="text-muted-foreground">
                            base {fmtBRL(l.base)} · {fmtPct(l.pct_efetivo)} efetivo
                          </span>
                          <span className="font-medium">{fmtBRL(l.valor)}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!contestando} onOpenChange={(o) => !o && setContestando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Contestar comissão</DialogTitle>
            <DialogDescription>
              NF {contestando?.nf ?? "—"} · valor apurado {fmtBRL(contestando?.valor_devido)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="motivo" className="text-xs">
                Motivo (mínimo 10 caracteres)
              </Label>
              <Textarea
                id="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={4}
                placeholder="Explique o que parece divergente."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="valor-esperado" className="text-xs">
                Valor esperado (opcional)
              </Label>
              <Input
                id="valor-esperado"
                inputMode="decimal"
                value={valorEsperado}
                onChange={(e) => setValorEsperado(e.target.value)}
                placeholder="0,00"
              />
            </div>
            {erroDialog && <p className="text-xs text-destructive">{erroDialog}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setContestando(null)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={enviarContestacao} disabled={enviando}>
              {enviando ? "Enviando…" : "Enviar contestação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
