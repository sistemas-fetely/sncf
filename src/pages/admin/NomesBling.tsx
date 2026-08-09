// Mesa/Sistema — dispara a edge `atualizar-nomes-bling`.
// O nome do cadastro no Bling e o texto que sai na linha do pedido e na NF.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, PlayCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Item = {
  sku: string;
  bling_id: string | null;
  nome_atual: string | null;
  nome_novo: string | null;
  status: string;
};

type Resultado = {
  ok: boolean;
  dry_run: boolean;
  candidatos: number;
  processados: number;
  sucesso: number;
  falhas: number;
  pulados: number;
  itens: Item[];
};

type LogRow = {
  id?: string;
  sku: string | null;
  bling_id: string | null;
  nome_antes: string | null;
  nome_depois: string | null;
  dry_run: boolean | null;
  sucesso: boolean | null;
  erro_msg: string | null;
  tentativa_em: string | null;
};

const fmtQuando = (v: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function NomesBling() {
  const [limite, setLimite] = useState(50);
  const [limiteHistorico, setLimiteHistorico] = useState(50);
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [simulado, setSimulado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  // ---- Bloco 1: situação (view instantânea) ----
  const situacao = useQuery({
    queryKey: ["nomes-bling-situacao"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_nomes_bling_situacao")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as {
        produtos_ativos: number;
        empurrados: number;
        faltam_empurrar: number;
        confirmados_pelo_bling: number;
        aguardando_confirmacao: number;
      } | null;
    },
  });

  // ---- Bloco 4: histórico ----
  const historico = useQuery({
    queryKey: ["nomes-bling-log", limiteHistorico],
    queryFn: async (): Promise<LogRow[]> => {
      const { data, error } = await supabase
        .from("bling_nome_log")
        .select("sku, bling_id, nome_antes, nome_depois, dry_run, sucesso, erro_msg, tentativa_em")
        .order("tentativa_em", { ascending: false })
        .limit(limiteHistorico);
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const historicoTotal = useQuery({
    queryKey: ["nomes-bling-log-total"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("bling_nome_log")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  async function executar(dryRun: boolean) {
    setRodando(true);
    try {
      const { data, error } = await supabase.functions.invoke("atualizar-nomes-bling", {
        body: { limite, dry_run: dryRun },
      });

      if (error) {
        toast.error("Falha ao chamar a função", { description: error.message });
        return;
      }
      const r = data as Resultado & { erro?: string };
      if (!r || r.ok === false) {
        toast.error("A função devolveu erro", {
          description: r?.erro ?? "Resposta sem detalhe do erro.",
        });
        return;
      }

      setResultado(r);
      if (dryRun) {
        setSimulado(true);
        toast.success(`Simulação concluída — ${r.candidatos} candidato(s)`, {
          description: `processados ${r.processados} · pulados ${r.pulados}`,
        });
      } else {
        setSimulado(false); // exige nova simulação
        if ((r.falhas ?? 0) > 0) {
          toast.warning(`${r.falhas} produto(s) falharam`, {
            description: `sucesso ${r.sucesso} · pulados ${r.pulados}`,
          });
        } else {
          toast.success(`${r.sucesso} produto(s) atualizados no Bling`);
        }
        situacao.refetch();
        historico.refetch();
      }
    } catch (e: any) {
      toast.error("Erro inesperado", { description: e?.message ?? String(e) });
    } finally {
      setRodando(false);
    }
  }

  const statusClass = (s: string) => {
    const v = (s ?? "").toLowerCase();
    if (v.includes("erro") || v.includes("falha")) return "text-destructive font-medium";
    if (v.includes("pul")) return "text-muted-foreground";
    if (v.includes("atualiz") || v.includes("ok") || v.includes("sucesso")) return "text-emerald-600 font-medium";
    return "";
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nomes no Bling</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Atualiza o nome do cadastro de produto no Bling a partir do nome operacional do SNCF.
          Afeta o texto que sai no pedido e na NF. Não altera NF já emitida.
        </p>
      </div>

      {/* Bloco 1 — Situação */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Situação</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => situacao.refetch()}
            disabled={situacao.isFetching}
          >
            {situacao.isFetching
              ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
            Atualizar contagem
          </Button>
        </CardHeader>
        <CardContent>
          {situacao.isError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Falha ao ler a contagem: {(situacao.error as any)?.message}</span>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <div className="text-3xl font-semibold tabular-nums">
                  {situacao.isLoading ? "—" : situacao.data?.ativosComFicha}
                </div>
                <div className="text-sm text-muted-foreground">Produtos ativos</div>
              </div>
              <div>
                <div className="text-3xl font-semibold tabular-nums text-amber-600">
                  {situacao.isLoading ? "—" : situacao.data?.divergentes}
                </div>
                <div className="text-sm text-muted-foreground">Com nome divergente</div>
              </div>
              <div>
                <div className="text-3xl font-semibold tabular-nums text-emerald-600">
                  {situacao.isLoading ? "—" : situacao.data?.iguais}
                </div>
                <div className="text-sm text-muted-foreground">Já atualizados</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bloco 2 — Executar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Executar</CardTitle>
          <CardDescription>
            Simule sempre antes de aplicar. O nome novo só passa a valer para pedidos e notas futuras.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="limite">Tamanho do lote</Label>
            <Input
              id="limite"
              type="number"
              min={1}
              max={100}
              value={limite}
              disabled={rodando}
              onChange={(e) => {
                const n = Number(e.target.value);
                setLimite(Number.isFinite(n) ? Math.min(100, Math.max(1, Math.floor(n))) : 1);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Lotes acima de 100 podem estourar o tempo limite. Rode várias vezes até zerar.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => executar(true)} disabled={rodando}>
              {rodando
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <PlayCircle className="mr-2 h-4 w-4" />}
              Simular (dry run)
            </Button>
            <Button
              variant="destructive"
              disabled={rodando || !simulado || !resultado}
              onClick={() => setConfirmar(true)}
            >
              Aplicar no Bling
            </Button>
          </div>

          {rodando && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Isso pode levar alguns minutos. Não feche a página.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bloco 3 — Resultado */}
      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Resultado {resultado.dry_run ? "(simulação)" : "(aplicado)"}
            </CardTitle>
            <CardDescription>
              candidatos {resultado.candidatos} · processados {resultado.processados} · sucesso{" "}
              {resultado.sucesso} · falhas {resultado.falhas} · pulados {resultado.pulados}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Nome atual no Bling</TableHead>
                  <TableHead>Nome novo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(resultado.itens ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      Nenhum item nesta rodada.
                    </TableCell>
                  </TableRow>
                ) : (
                  resultado.itens.map((it, i) => (
                    <TableRow key={`${it.sku}-${i}`}>
                      <TableCell className="font-mono text-xs">{it.sku}</TableCell>
                      <TableCell className="text-sm">{it.nome_atual ?? "—"}</TableCell>
                      <TableCell className="text-sm">{it.nome_novo ?? "—"}</TableCell>
                      <TableCell className={`text-sm ${statusClass(it.status)}`}>
                        {it.status}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Bloco 4 — Histórico */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Histórico</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => historico.refetch()}
            disabled={historico.isFetching}
          >
            {historico.isFetching
              ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
            Recarregar
          </Button>
        </CardHeader>
        <CardContent>
          {historico.isError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Falha ao ler o histórico: {(historico.error as any)?.message}</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Nome antes</TableHead>
                  <TableHead>Nome depois</TableHead>
                  <TableHead>Dry run</TableHead>
                  <TableHead>Sucesso</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(historico.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      {historico.isLoading ? "Carregando…" : "Sem registros."}
                    </TableCell>
                  </TableRow>
                ) : (
                  historico.data!.map((l, i) => (
                    <TableRow key={`${l.sku}-${l.tentativa_em}-${i}`}>
                      <TableCell className="whitespace-nowrap text-xs">{fmtQuando(l.tentativa_em)}</TableCell>
                      <TableCell className="font-mono text-xs">{l.sku ?? "—"}</TableCell>
                      <TableCell className="text-sm">{l.nome_antes ?? "—"}</TableCell>
                      <TableCell className="text-sm">{l.nome_depois ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={l.dry_run ? "secondary" : "outline"}>
                          {l.dry_run ? "simulação" : "real"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={l.sucesso ? "default" : "destructive"}>
                          {l.sucesso ? "sim" : "não"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-destructive">{l.erro_msg ?? ""}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar no Bling?</AlertDialogTitle>
            <AlertDialogDescription>
              Isto altera o cadastro de {resultado?.candidatos ?? 0} produtos no Bling. O nome novo
              passa a sair nos próximos pedidos e nas próximas notas fiscais. Notas já emitidas não
              mudam. Confirmar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmar(false);
                executar(false);
              }}
            >
              Sim, aplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
