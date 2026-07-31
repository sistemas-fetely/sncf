import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, AlertTriangle, ShoppingCart, RefreshCw, Undo2, CheckCircle2, Scissors,
  Paperclip, Eye, Trash2, ExternalLink,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import ResolverCadastroInline from "./ResolverCadastroInline";
import {
  useSolicitacao, useApontamentos, useCategorias, useGlosarItem, useAprovar,
  useDevolver, useReabrir, useComprovantes, useAnexarComprovante, useRemoverComprovante,
  useUrlAssinada, formatarBRL, formatarData, formatarTamanho, ROTULO_ESTADO,
  MIMES_COMPROVANTE, LIMITE_COMPROVANTE_BYTES,
  type ApontamentoComRegra, type ItemSolicitacao, type Comprovante, type TipoAnexo,
} from "@/hooks/useReembolso";

interface DadosConferencia {
  titulo: string;
  data: string | null;
  valor: number | null;
  cnpj: string | null;
  estabelecimento: string | null;
}


function BadgeEstado({ estado }: { estado: string }) {
  const tom =
    estado === "aprovado" || estado === "pago"
      ? "bg-success/10 text-success"
      : estado === "devolvido" || estado === "cancelado"
        ? "bg-destructive/10 text-destructive"
        : estado === "em_lote"
          ? "bg-primary/10 text-primary"
          : "bg-warning/10 text-warning";
  return <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", tom)}>{ROTULO_ESTADO[estado] ?? estado}</span>;
}

function BlocoErro({ mensagem, onRetry }: { mensagem: string; onRetry: () => void }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive space-y-2">
      <p className="break-words">{mensagem}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
      </Button>
    </div>
  );
}

interface Props {
  solicitacaoId: string | null;
  onOpenChange: (v: boolean) => void;
}

export default function SolicitacaoDrawer({ solicitacaoId, onOpenChange }: Props) {
  const detalheQ = useSolicitacao(solicitacaoId);
  const apontamentosQ = useApontamentos(solicitacaoId);
  const categoriasQ = useCategorias();
  const glosar = useGlosarItem();
  const aprovar = useAprovar();
  const devolver = useDevolver();
  const reabrir = useReabrir();

  const [justificativa, setJustificativa] = useState("");
  const [motivoDevolucao, setMotivoDevolucao] = useState("");

  const solicitacao = detalheQ.data?.solicitacao ?? null;
  const itens = detalheQ.data?.itens ?? [];
  const vinculo = detalheQ.data?.vinculo ?? null;
  const apontamentos = apontamentosQ.data ?? [];

  const grupos = useMemo(() => {
    const precisa = apontamentos.filter((a) => a.severidade === "bloqueante" && !a.superavel);
    const superaveis = apontamentos.filter((a) => a.severidade === "bloqueante" && a.superavel);
    const avisos = apontamentos.filter((a) => a.severidade === "aviso");
    return { precisa, superaveis, avisos };
  }, [apontamentos]);

  const seqPorItem = useMemo(() => {
    const m = new Map<string, number>();
    itens.forEach((i, idx) => m.set(i.id, i.seq ?? idx + 1));
    return m;
  }, [itens]);

  const nomeCategoria = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categoriasQ.data ?? []) m.set(c.id, `${c.codigo} · ${c.nome}`);
    return m;
  }, [categoriasQ.data]);

  async function aoAprovar() {
    if (!solicitacaoId) return;
    if (grupos.superaveis.length > 0 && !justificativa.trim()) {
      toast.error("Escreva a justificativa da exceção para aprovar com pendência superável.");
      return;
    }
    try {
      const r = await aprovar.mutateAsync({
        solicitacaoId,
        justificativa: justificativa.trim() || null,
      });
      toast.success(
        `${r.numero ?? "Reembolso"} aprovado em ${formatarBRL(r.valor_aprovado)}${r.ciclo ? ` — ciclo ${r.ciclo}` : ""}.`,
      );
      setJustificativa("");
    } catch {
      // erro já exibido pelo hook
    }
  }

  async function aoDevolver() {
    if (!solicitacaoId) return;
    if (!motivoDevolucao.trim()) {
      toast.error("O motivo da devolução é obrigatório.");
      return;
    }
    try {
      await devolver.mutateAsync({ solicitacaoId, motivo: motivoDevolucao.trim() });
      toast.success("Reembolso devolvido para a pessoa.");
      setMotivoDevolucao("");
    } catch {
      // erro já exibido pelo hook
    }
  }

  async function aoReabrir() {
    if (!solicitacaoId) return;
    try {
      await reabrir.mutateAsync({ solicitacaoId });
      toast.success("Reembolso reaberto para validação.");
    } catch {
      // erro já exibido pelo hook
    }
  }

  async function aoGlosar(itemId: string, valor: number, motivo: string) {
    if (!solicitacaoId) return;
    if (!motivo.trim()) {
      toast.error("O motivo da glosa é obrigatório.");
      return;
    }
    try {
      await glosar.mutateAsync({ solicitacaoId, itemId, valorAprovado: valor, motivo: motivo.trim() });
      toast.success("Item glosado.");
    } catch {
      // erro já exibido pelo hook
    }
  }

  const estado = solicitacao?.estado;
  const somenteLeitura = estado === "aprovado" || estado === "em_lote" || estado === "pago" || estado === "fechado";

  return (
    <Sheet open={!!solicitacaoId} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{solicitacao?.numero ?? "Reembolso"}</SheetTitle>
          <SheetDescription>
            {vinculo?.nome_completo ?? "—"} · recebido em {formatarData(solicitacao?.data_recebimento)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {detalheQ.isError && (
            <BlocoErro
              mensagem={(detalheQ.error as Error)?.message ?? "Falha ao carregar o reembolso."}
              onRetry={() => detalheQ.refetch()}
            />
          )}
          {detalheQ.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          )}

          {solicitacao && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <BadgeEstado estado={solicitacao.estado} />
                <span className="text-muted-foreground">Solicitado</span>
                <span className="font-semibold tabular-nums">
                  {formatarBRL(solicitacao.valor_solicitado)}
                </span>
                <span className="text-muted-foreground">Aprovado</span>
                <span className="font-semibold tabular-nums">
                  {formatarBRL(solicitacao.valor_aprovado)}
                </span>
                {solicitacao.encaminhado_para_compras && (
                  <Badge variant="destructive" className="gap-1">
                    <ShoppingCart className="h-3 w-3" />
                    Tem item que deveria ir por Pedido de Compras
                  </Badge>
                )}
              </div>

              {/* Pendências */}
              <Card className="card-shadow">
                <CardContent className="space-y-4 py-4">
                  <h3 className="text-sm font-semibold">Pendências</h3>

                  {apontamentosQ.isError && (
                    <BlocoErro
                      mensagem={
                        (apontamentosQ.error as Error)?.message ?? "Falha ao carregar pendências."
                      }
                      onRetry={() => apontamentosQ.refetch()}
                    />
                  )}
                  {apontamentosQ.isLoading && (
                    <p className="text-sm text-muted-foreground">Carregando pendências…</p>
                  )}
                  {!apontamentosQ.isLoading && !apontamentosQ.isError && apontamentos.length === 0 && (
                    <p className="flex items-center gap-2 text-sm text-success">
                      <CheckCircle2 className="h-4 w-4" /> Sem apontamento em aberto.
                    </p>
                  )}

                  <SecaoApontamentos
                    titulo="Precisa resolver"
                    lista={grupos.precisa}
                    tom="text-destructive"
                    solicitacaoId={solicitacao.id}
                    vinculoId={solicitacao.vinculo_id}
                    seqPorItem={seqPorItem}
                    onGlosar={aoGlosar}
                  />
                  <SecaoApontamentos
                    titulo="Dá para aprovar com justificativa"
                    lista={grupos.superaveis}
                    tom="text-warning"
                    solicitacaoId={solicitacao.id}
                    vinculoId={solicitacao.vinculo_id}
                    seqPorItem={seqPorItem}
                    onGlosar={aoGlosar}
                  />
                  <SecaoApontamentos
                    titulo="Avisos"
                    lista={grupos.avisos}
                    tom="text-muted-foreground"
                    solicitacaoId={solicitacao.id}
                    vinculoId={solicitacao.vinculo_id}
                    seqPorItem={seqPorItem}
                    onGlosar={aoGlosar}
                  />
                </CardContent>
              </Card>

              {/* Comprovantes */}
              <BlocoComprovantes
                solicitacaoId={solicitacao.id}
                itens={itens}
                apontamentos={apontamentos}
                somenteLeitura={somenteLeitura}
                nomeCategoria={nomeCategoria}
              />


              {/* Itens */}
              <Card className="card-shadow">
                <CardContent className="py-4 space-y-3">
                  <h3 className="text-sm font-semibold">Itens</h3>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Solicitado</TableHead>
                          <TableHead className="text-right">Aprovado</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-20" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itens.map((i, idx) => (
                          <TableRow key={i.id}>
                            <TableCell className="tabular-nums">{i.seq ?? idx + 1}</TableCell>
                            <TableCell className="text-xs">
                              {i.categoria_id ? nomeCategoria.get(i.categoria_id) ?? "—" : "—"}
                            </TableCell>
                            <TableCell>{formatarData(i.data_despesa)}</TableCell>
                            <TableCell className="max-w-[220px] truncate">
                              {i.descricao ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatarBRL(i.valor_solicitado)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatarBRL(i.valor_aprovado)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{i.status_item ?? "—"}</Badge>
                            </TableCell>
                            <TableCell>
                              {!somenteLeitura && (
                                <PopoverGlosa item={i} onConfirmar={aoGlosar} />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Ações */}
              {estado === "em_validacao" && (
                <Card className="card-shadow">
                  <CardContent className="space-y-4 py-4">
                    {grupos.superaveis.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Justificativa da exceção (obrigatória — cobre{" "}
                          {grupos.superaveis.length} pendência
                          {grupos.superaveis.length === 1 ? "" : "s"} superável
                          {grupos.superaveis.length === 1 ? "" : "is"})
                        </Label>
                        <Textarea
                          rows={2}
                          value={justificativa}
                          onChange={(e) => setJustificativa(e.target.value)}
                        />
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs">Motivo da devolução</Label>
                      <Textarea
                        rows={2}
                        value={motivoDevolucao}
                        onChange={(e) => setMotivoDevolucao(e.target.value)}
                        placeholder="Obrigatório para devolver"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button onClick={aoAprovar} disabled={aprovar.isPending}>
                        {aprovar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Aprovar
                      </Button>
                      <Button
                        variant="outline"
                        onClick={aoDevolver}
                        disabled={devolver.isPending}
                      >
                        {devolver.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Devolver
                      </Button>
                      {grupos.precisa.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {grupos.precisa.length} pendência(s) sem saída por justificativa
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {estado === "devolvido" && (
                <Card className="card-shadow">
                  <CardContent className="py-4 space-y-2">
                    {solicitacao.motivo_devolucao && (
                      <p className="text-sm text-muted-foreground">
                        Motivo: {solicitacao.motivo_devolucao}
                      </p>
                    )}
                    <Button variant="outline" onClick={aoReabrir} disabled={reabrir.isPending}>
                      {reabrir.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Undo2 className="h-4 w-4" />
                      )}
                      Reabrir
                    </Button>
                  </CardContent>
                </Card>
              )}

              {somenteLeitura && (
                <p className="text-xs text-muted-foreground">
                  Reembolso {ROTULO_ESTADO[solicitacao.estado]?.toLowerCase()} — somente leitura.
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SecaoApontamentos({
  titulo,
  lista,
  tom,
  solicitacaoId,
  vinculoId,
  seqPorItem,
  onGlosar,
}: {
  titulo: string;
  lista: ApontamentoComRegra[];
  tom: string;
  solicitacaoId: string;
  vinculoId: string;
  seqPorItem: Map<string, number>;
  onGlosar: (itemId: string, valor: number, motivo: string) => Promise<void>;
}) {
  if (lista.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className={cn("text-xs font-semibold uppercase tracking-wide", tom)}>
        {titulo} ({lista.length})
      </p>
      {lista.map((a) => (
        <div key={a.id} className="rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{a.regra_codigo}</span>
            <span className="text-sm font-semibold">{a.rotulo ?? a.regra_codigo}</span>
            {a.item_id && (
              <Badge variant="outline" className="text-xs">
                Item {seqPorItem.get(a.item_id) ?? "?"}
              </Badge>
            )}
          </div>
          {a.mensagem && <p className="mt-1 text-sm text-muted-foreground">{a.mensagem}</p>}

          {a.valor_sugerido != null && a.item_id && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() =>
                onGlosar(
                  a.item_id as string,
                  Number(a.valor_sugerido),
                  `Glosa sugerida pela regra ${a.regra_codigo}`,
                )
              }
            >
              <Scissors className="h-3.5 w-3.5" />
              Glosar até {formatarBRL(a.valor_sugerido)}
            </Button>
          )}

          {a.campo_cadastro && (
            <ResolverCadastroInline
              solicitacaoId={solicitacaoId}
              regraCodigo={a.regra_codigo}
              campoCadastro={a.campo_cadastro}
              mensagemResolucao={a.mensagem_resolucao}
              vinculoId={vinculoId}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function PopoverGlosa({
  item,
  onConfirmar,
}: {
  item: ItemSolicitacao;
  onConfirmar: (itemId: string, valor: number, motivo: string) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState(String(item.valor_aprovado ?? item.valor_solicitado ?? ""));
  const [motivo, setMotivo] = useState("");

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost">
          Glosar
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2">
        <div className="space-y-1">
          <Label className="text-xs">Valor aprovado</Label>
          <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Motivo (obrigatório)</Label>
          <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <Button
          size="sm"
          className="w-full"
          onClick={async () => {
            await onConfirmar(item.id, Number(String(valor).replace(",", ".")), motivo);
            setAberto(false);
            setMotivo("");
          }}
        >
          Confirmar glosa
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Comprovantes
// ---------------------------------------------------------------------------

function BlocoComprovantes({
  solicitacaoId,
  itens,
  apontamentos,
  somenteLeitura,
  nomeCategoria,
}: {
  solicitacaoId: string;
  itens: ItemSolicitacao[];
  apontamentos: ApontamentoComRegra[];
  somenteLeitura: boolean;
  nomeCategoria: Map<string, string>;
}) {
  const comprovantesQ = useComprovantes(solicitacaoId);
  const remover = useRemoverComprovante();
  const urlAssinada = useUrlAssinada();
  const [visualizando, setVisualizando] = useState<{
    comprovante: Comprovante;
    url: string;
    dados: DadosConferencia;
  } | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);

  const comprovantes = comprovantesQ.data ?? [];
  const porItem = useMemo(() => {
    const m = new Map<string, Comprovante>();
    for (const c of comprovantes) {
      if (c.tipo_anexo === "comprovante" && c.item_id) m.set(c.item_id, c);
    }
    return m;
  }, [comprovantes]);

  const anexoLider = comprovantes.find((c) => c.tipo_anexo === "ok_lider") ?? null;
  const anexoDiretoria = comprovantes.find((c) => c.tipo_anexo === "ok_previo_diretoria") ?? null;
  const temR15 = apontamentos.some((a) => a.regra_codigo === "R-15");
  const temR09 = apontamentos.some((a) => a.regra_codigo === "R-09");

  async function ver(c: Comprovante, dados: DadosConferencia) {
    setAbrindo(c.id);
    try {
      const url = await urlAssinada(c.arquivo_path);
      setVisualizando({ comprovante: c, url, dados });
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? "Falha ao abrir o arquivo.");
    } finally {
      setAbrindo(null);
    }
  }

  async function aoRemover(c: Comprovante) {
    try {
      await remover.mutateAsync({ solicitacaoId, comprovanteId: c.id });
      toast.success("Anexo removido.");
    } catch {
      // erro já exibido pelo hook
    }
  }

  function LinhaAnexo({ c, dados }: { c: Comprovante; dados: DadosConferencia }) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md bg-success/10 px-3 py-2 text-xs">
        <span className="truncate">
          <Badge variant="outline" className="mr-2">
            {c.numero ?? "—"}
          </Badge>
          {c.nome_original ?? c.arquivo_path}
          <span className="text-muted-foreground"> · {formatarTamanho(c.tamanho_bytes)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => ver(c, dados)} disabled={abrindo === c.id}>
            {abrindo === c.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            Ver
          </Button>
          {!somenteLeitura && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => aoRemover(c)}
              disabled={remover.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remover
            </Button>
          )}
        </span>
      </div>
    );
  }

  return (
    <Card className="card-shadow">
      <CardContent className="space-y-4 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="h-4 w-4" /> Comprovantes
        </h3>

        {comprovantesQ.isError && (
          <BlocoErro
            mensagem={(comprovantesQ.error as Error)?.message ?? "Falha ao carregar os anexos."}
            onRetry={() => comprovantesQ.refetch()}
          />
        )}
        {comprovantesQ.isLoading && (
          <p className="text-sm text-muted-foreground">Carregando anexos…</p>
        )}

        <div className="space-y-3">
          {itens.map((i, idx) => {
            const c = porItem.get(i.id) ?? null;
            const dados: DadosConferencia = {
              titulo: `Item ${i.seq ?? idx + 1}`,
              data: i.data_despesa,
              valor: i.valor_solicitado,
              cnpj: i.cnpj_emitente,
              estabelecimento: i.estabelecimento,
            };
            return (
              <div key={i.id} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <Badge variant="outline">Item {i.seq ?? idx + 1}</Badge>
                  <span>{i.categoria_id ? nomeCategoria.get(i.categoria_id) ?? "—" : "—"}</span>
                  <span className="text-muted-foreground">{formatarData(i.data_despesa)}</span>
                  <span className="font-semibold tabular-nums">
                    {formatarBRL(i.valor_solicitado)}
                  </span>
                  <span className="text-muted-foreground">
                    CNPJ {i.cnpj_emitente ?? "—"}
                  </span>
                  <span className="text-muted-foreground">
                    {i.estabelecimento ?? "sem estabelecimento"}
                  </span>
                </div>

                {c ? (
                  <LinhaAnexo c={c} dados={dados} />
                ) : somenteLeitura ? (
                  <p className="text-xs text-muted-foreground">Sem comprovante anexado.</p>
                ) : (
                  <UploadAnexo
                    solicitacaoId={solicitacaoId}
                    itemId={i.id}
                    tipoAnexo="comprovante"
                    rotulo="Anexar comprovante"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-3 border-t pt-3">
          <AnexoSolicitacao
            solicitacaoId={solicitacaoId}
            tipoAnexo="ok_lider"
            rotulo="OK do líder por escrito"
            anexo={anexoLider}
            destaque={temR15}
            somenteLeitura={somenteLeitura}
            renderAnexo={(c) => (
              <LinhaAnexo
                c={c}
                dados={{
                  titulo: "OK do líder por escrito",
                  data: null,
                  valor: null,
                  cnpj: null,
                  estabelecimento: null,
                }}
              />
            )}
          />
          <AnexoSolicitacao
            solicitacaoId={solicitacaoId}
            tipoAnexo="ok_previo_diretoria"
            rotulo="OK prévio da Diretoria"
            anexo={anexoDiretoria}
            destaque={temR09}
            somenteLeitura={somenteLeitura}
            renderAnexo={(c) => (
              <LinhaAnexo
                c={c}
                dados={{
                  titulo: "OK prévio da Diretoria",
                  data: null,
                  valor: null,
                  cnpj: null,
                  estabelecimento: null,
                }}
              />
            )}
          />
        </div>
      </CardContent>

      <VisualizadorDialog
        aberto={visualizando}
        onFechar={() => setVisualizando(null)}
      />
    </Card>
  );
}

function AnexoSolicitacao({
  solicitacaoId,
  tipoAnexo,
  rotulo,
  anexo,
  destaque,
  somenteLeitura,
  renderAnexo,
}: {
  solicitacaoId: string;
  tipoAnexo: TipoAnexo;
  rotulo: string;
  anexo: Comprovante | null;
  destaque: boolean;
  somenteLeitura: boolean;
  renderAnexo: (c: Comprovante) => JSX.Element;
}) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-md border p-3",
        destaque && "border-warning/50 bg-warning/10",
      )}
    >
      <div className="flex items-center gap-2 text-xs font-semibold">
        {rotulo}
        {destaque && (
          <span className="flex items-center gap-1 font-normal text-warning">
            <AlertTriangle className="h-3.5 w-3.5" /> pendência em aberto pede este anexo
          </span>
        )}
      </div>
      {anexo ? (
        renderAnexo(anexo)
      ) : somenteLeitura ? (
        <p className="text-xs text-muted-foreground">Sem anexo.</p>
      ) : (
        <UploadAnexo
          solicitacaoId={solicitacaoId}
          itemId={null}
          tipoAnexo={tipoAnexo}
          rotulo={`Anexar ${rotulo.toLowerCase()}`}
        />
      )}
    </div>
  );
}

function UploadAnexo({
  solicitacaoId,
  itemId,
  tipoAnexo,
  rotulo,
}: {
  solicitacaoId: string;
  itemId: string | null;
  tipoAnexo: TipoAnexo;
  rotulo: string;
}) {
  const anexar = useAnexarComprovante();

  async function aoEscolher(file: File | null) {
    if (!file) return;
    if (!(MIMES_COMPROVANTE as readonly string[]).includes(file.type)) {
      toast.error("Formato não aceito. Use PDF, PNG, JPEG ou WEBP.");
      return;
    }
    if (file.size > LIMITE_COMPROVANTE_BYTES) {
      toast.error("Arquivo acima de 10 MB.");
      return;
    }
    try {
      const r = await anexar.mutateAsync({ solicitacaoId, itemId, tipoAnexo, file });
      toast.success(`Anexo ${r.numero ?? ""} registrado.`.replace("  ", " "));
    } catch {
      // erro já exibido pelo hook
    }
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{rotulo}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="file"
          className="text-xs"
          accept={MIMES_COMPROVANTE.join(",")}
          disabled={anexar.isPending}
          onChange={(e) => aoEscolher(e.target.files?.[0] ?? null)}
        />
        {anexar.isPending && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
      </div>
    </div>
  );
}

function VisualizadorDialog({
  aberto,
  onFechar,
}: {
  aberto: { comprovante: Comprovante; url: string; dados: DadosConferencia } | null;
  onFechar: () => void;
}) {
  const c = aberto?.comprovante;
  const mime = c?.mime ?? "";
  return (
    <Dialog open={!!aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{c?.nome_original ?? "Documento"}</DialogTitle>
          <DialogDescription>{aberto?.dados.titulo}</DialogDescription>
        </DialogHeader>

        {aberto && (
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div className="min-w-0 md:order-1 order-2">
              {mime.startsWith("image/") ? (
                <img
                  src={aberto.url}
                  alt={`Documento ${c?.nome_original ?? ""}`}
                  className="w-full rounded-md border"
                />
              ) : mime === "application/pdf" ? (
                <iframe
                  src={aberto.url}
                  title={c?.nome_original ?? "Documento"}
                  className="w-full rounded-md border"
                  style={{ minHeight: "70vh" }}
                />
              ) : (
                <div className="space-y-2 rounded-md border p-4 text-sm text-muted-foreground">
                  <p>Este formato não abre aqui.</p>
                  <Button variant="outline" size="sm" asChild>
                    <a href={aberto.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir em nova aba
                    </a>
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2 text-sm md:order-2 order-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Conferir contra
              </p>
              <p>
                <span className="text-muted-foreground">Data </span>
                {formatarData(aberto.dados.data)}
              </p>
              <p>
                <span className="text-muted-foreground">Valor </span>
                <span className="font-semibold tabular-nums">
                  {aberto.dados.valor == null ? "—" : formatarBRL(aberto.dados.valor)}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">CNPJ </span>
                {aberto.dados.cnpj ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Estabelecimento </span>
                {aberto.dados.estabelecimento ?? "—"}
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href={aberto.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir em nova aba
                </a>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
