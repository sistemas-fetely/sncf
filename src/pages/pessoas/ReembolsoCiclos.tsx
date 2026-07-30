import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, CalendarRange, ChevronDown, ChevronRight, Loader2, RefreshCw, AlertTriangle, Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import SolicitacaoDrawer from "@/components/pessoas/reembolso/SolicitacaoDrawer";
import {
  useCiclos, useLotes, useSolicitacoes, useSolicitacoesDoLote, useFecharCiclo,
  useRegistrarPagamento, formatarBRL, formatarData, mascararPix,
  type ResultadoFechamento,
} from "@/hooks/useReembolso";

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function BlocoErro({ mensagem, onRetry }: { mensagem: string; onRetry: () => void }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive space-y-2">
      <p className="break-words">{mensagem}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
      </Button>
    </div>
  );
}

export default function ReembolsoCiclos() {
  const ciclosQ = useCiclos();
  const aprovadasQ = useSolicitacoes("aprovado");
  const fecharCiclo = useFecharCiclo();
  const [expandido, setExpandido] = useState<string | null>(null);
  const [avisoAdiados, setAvisoAdiados] = useState<ResultadoFechamento | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [solicitacaoAberta, setSolicitacaoAberta] = useState<string | null>(null);

  const aprovadas = aprovadasQ.data ?? [];
  const totalAprovado = aprovadas.reduce((s, a) => s + Number(a.valor_aprovado ?? 0), 0);

  async function aoFechar(referencia: string) {
    try {
      const r = await fecharCiclo.mutateAsync({ referencia });
      toast.success(
        `Ciclo ${r.ciclo ?? referencia} fechado. ${r.lotes ?? 0} lote(s), ${formatarBRL(r.total)}.`,
      );
      setConfirmando(false);
      if ((r.adiados_sem_pix ?? 0) > 0) setAvisoAdiados(r);
    } catch {
      // erro já exibido pelo hook
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarRange className="h-6 w-6" />
            Ciclos e pagamentos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Feche o ciclo, gere os lotes por pessoa e registre o pagamento feito.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/pessoas/reembolsos">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      {avisoAdiados && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-4 text-sm text-warning space-y-2">
          <p className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {avisoAdiados.adiados_sem_pix} pessoa(s) ficaram fora por não ter chave PIX:{" "}
              {Array.isArray(avisoAdiados.adiados_nomes)
                ? avisoAdiados.adiados_nomes.join(", ")
                : avisoAdiados.adiados_nomes ?? "—"}
              . Foram movidas para o ciclo {avisoAdiados.ciclo_destino_adiados ?? "seguinte"}.
              Resolve o PIX na fila que elas entram lá.
            </span>
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/pessoas/reembolsos/saneamento">Sanear cadastro</Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAvisoAdiados(null)}>
              Entendi
            </Button>
          </div>
        </div>
      )}

      {ciclosQ.isError ? (
        <BlocoErro
          mensagem={`Não foi possível carregar os ciclos. ${(ciclosQ.error as Error)?.message ?? ""}`}
          onRetry={() => ciclosQ.refetch()}
        />
      ) : ciclosQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando ciclos…
        </div>
      ) : (ciclosQ.data ?? []).length === 0 ? (
        <Card className="card-shadow">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum ciclo criado ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(ciclosQ.data ?? []).map((c) => (
            <Card
              key={c.id}
              className={cn("card-shadow", c.estado === "aberto" && "border-primary/50")}
            >
              <CardContent className="py-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left"
                    onClick={() => setExpandido(expandido === c.id ? null : c.id)}
                  >
                    {expandido === c.id ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="text-base font-semibold">{c.referencia}</span>
                    <Badge
                      className={cn(
                        c.estado === "aberto"
                          ? "bg-warning/10 text-warning hover:bg-warning/10"
                          : c.estado === "pago"
                            ? "bg-success/10 text-success hover:bg-success/10"
                            : "bg-muted text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {c.estado === "aberto" ? "Aberto" : c.estado === "pago" ? "Pago" : "Fechado"}
                    </Badge>
                  </button>

                  <div className="flex flex-wrap items-center gap-6 text-sm">
                    <span className="text-muted-foreground">
                      Corte {formatarData(c.data_corte)}
                    </span>
                    <span className="text-muted-foreground">
                      Pagamento previsto {formatarData(c.data_pagamento_prevista)}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatarBRL(c.total_aprovado)}
                    </span>
                    <span className="text-muted-foreground">
                      {c.lotes} lote{c.lotes === 1 ? "" : "s"}
                    </span>

                    {c.estado === "aberto" && (
                      <Dialog open={confirmando} onOpenChange={setConfirmando}>
                        <DialogTrigger asChild>
                          <Button size="sm">Fechar ciclo e gerar lotes</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Fechar o ciclo {c.referencia}</DialogTitle>
                            <DialogDescription>
                              Entram {aprovadas.length} solicitação(ões) aprovada(s), somando{" "}
                              {formatarBRL(totalAprovado)}. Quem estiver sem chave PIX fica de fora
                              e vai para o próximo ciclo.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setConfirmando(false)}>
                              Cancelar
                            </Button>
                            <Button
                              onClick={() => aoFechar(c.referencia)}
                              disabled={fecharCiclo.isPending}
                            >
                              {fecharCiclo.isPending && (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              )}
                              Fechar ciclo
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>

                {expandido === c.id && (
                  <LotesDoCiclo cicloId={c.id} onAbrirSolicitacao={setSolicitacaoAberta} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SolicitacaoDrawer
        solicitacaoId={solicitacaoAberta}
        onOpenChange={(v) => !v && setSolicitacaoAberta(null)}
      />
    </div>
  );
}

function LotesDoCiclo({
  cicloId,
  onAbrirSolicitacao,
}: {
  cicloId: string;
  onAbrirSolicitacao: (id: string) => void;
}) {
  const lotesQ = useLotes(cicloId);
  const [loteExpandido, setLoteExpandido] = useState<string | null>(null);

  if (lotesQ.isError) {
    return (
      <BlocoErro
        mensagem={`Não foi possível carregar os lotes. ${(lotesQ.error as Error)?.message ?? ""}`}
        onRetry={() => lotesQ.refetch()}
      />
    );
  }
  if (lotesQ.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando lotes…
      </p>
    );
  }
  if ((lotesQ.data ?? []).length === 0) {
    return <p className="text-sm text-muted-foreground">Este ciclo ainda não tem lotes.</p>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Pessoa</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Chave PIX</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead className="w-44" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(lotesQ.data ?? []).map((l) => (
            <>
              <TableRow key={l.id}>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setLoteExpandido(loteExpandido === l.id ? null : l.id)}
                  >
                    {loteExpandido === l.id ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TableCell>
                <TableCell>{l.nome_completo ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatarBRL(l.valor_total)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {mascararPix(l.chave_pix_snapshot)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{l.estado}</Badge>
                </TableCell>
                <TableCell>{formatarData(l.data_pagamento)}</TableCell>
                <TableCell>
                  {l.estado !== "pago" && <DialogPagamento loteId={l.id} />}
                </TableCell>
              </TableRow>
              {loteExpandido === l.id && (
                <TableRow key={`${l.id}-detalhe`}>
                  <TableCell colSpan={7} className="bg-muted/30">
                    <SolicitacoesDoLote loteId={l.id} onAbrir={onAbrirSolicitacao} />
                  </TableCell>
                </TableRow>
              )}
            </>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SolicitacoesDoLote({
  loteId,
  onAbrir,
}: {
  loteId: string;
  onAbrir: (id: string) => void;
}) {
  const q = useSolicitacoesDoLote(loteId);
  if (q.isError) {
    return (
      <BlocoErro
        mensagem={`Não foi possível carregar as solicitações do lote. ${(q.error as Error)?.message ?? ""}`}
        onRetry={() => q.refetch()}
      />
    );
  }
  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando solicitações…</p>;
  }
  return (
    <div className="space-y-1 py-2">
      {(q.data ?? []).map((s) => (
        <div key={s.id} className="flex items-center gap-4 text-sm">
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => onAbrir(s.id)}
          >
            {s.numero ?? s.id}
          </button>
          <span>{s.nome_completo ?? "—"}</span>
          <span className="tabular-nums">{formatarBRL(s.valor_aprovado)}</span>
        </div>
      ))}
    </div>
  );
}

function DialogPagamento({ loteId }: { loteId: string }) {
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(hoje());
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const registrar = useRegistrarPagamento();

  async function confirmar() {
    setEnviando(true);
    try {
      let path: string | null = null;
      if (arquivo) {
        const destino = `lotes/${loteId}/${arquivo.name}`;
        const { error } = await supabase.storage
          .from("comprovantes-reembolso")
          .upload(destino, arquivo, { upsert: true });
        if (error) throw error;
        path = destino;
      }
      const r = await registrar.mutateAsync({
        loteId,
        dataPagamento: data,
        comprovantePath: path,
      });
      toast.success(
        `Pagamento registrado: ${formatarBRL(r.valor)} em ${r.reembolsos ?? 0} reembolso(s).`,
      );
      setAberto(false);
      setArquivo(null);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      toast.error(e?.message ?? String(err), {
        description: e?.details || e?.hint || undefined,
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Registrar pagamento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pagamento do lote</DialogTitle>
          <DialogDescription>
            O sistema não executa o PIX. Aqui você registra que o PIX já foi feito no banco.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Data do pagamento</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Comprovante (opcional)</Label>
            <Input
              type="file"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
            {arquivo && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Upload className="h-3 w-3" /> {arquivo.name}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={enviando || registrar.isPending}>
            {(enviando || registrar.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
