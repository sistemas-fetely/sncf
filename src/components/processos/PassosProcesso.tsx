// "Passos" — o processo deixa de ser prosa e passa a ter itens verificáveis.
// Cada passo pode apontar para a atribuição que o executa: é isso que dá endereço
// à divergência entre o que está documentado e o que está declarado.
import { useState } from "react";
import { ArrowDown, ArrowUp, ListOrdered, Pencil, Plus, Trash2, User } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatError } from "@/lib/format-error";
import {
  useAtribuicoesParaPasso,
  useProcessoPassos,
  useRemoverPasso,
  useReordenarPassos,
  useSalvarPasso,
  type ProcessoPasso,
} from "@/hooks/processos/useProcessoPassos";
import { SeletorAtribuicaoPasso } from "@/components/processos/SeletorAtribuicaoPasso";

export function PassosProcesso({ processoId }: { processoId: string }) {
  const passos = useProcessoPassos(processoId);
  const { data: atribuicoes } = useAtribuicoesParaPasso();
  const reordenar = useReordenarPassos(processoId);
  const remover = useRemoverPasso(processoId);
  const [emEdicao, setEmEdicao] = useState<ProcessoPasso | null>(null);
  const [criando, setCriando] = useState(false);

  const lista = passos.data ?? [];

  const mover = (indice: number, direcao: -1 | 1) => {
    const destino = indice + direcao;
    if (destino < 0 || destino >= lista.length) return;
    const ids = lista.map((p) => p.id);
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    reordenar.mutate(ids, {
      onError: (e) => toast.error("Não reordenou", { description: formatError(e) }),
    });
  };

  const apagar = (passo: ProcessoPasso) => {
    if (!window.confirm(`Remover o passo "${passo.nome}"?`)) return;
    remover.mutate(passo.id, {
      onSuccess: () => toast.success("Passo removido."),
      onError: (e) => toast.error("Não removeu", { description: formatError(e) }),
    });
  };

  const nomeAtribuicao = (id: string | null) => {
    if (!id) return null;
    const a = (atribuicoes ?? []).find((x) => x.atribuicao_id === id);
    if (!a) return { nome: "Atribuição fora do catálogo", pessoa: null as string | null };
    return { nome: a.nome ?? "sem nome", pessoa: a.pessoa_nome };
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Passos</h2>
            <span className="text-xs text-muted-foreground">({lista.length})</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCriando(true)} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Novo passo
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          O passo diz o que se faz; a atribuição ligada diz quem faz e quanto custa. Passo marcado
          como condicional só acontece às vezes e não é cobrado como divergência.
        </p>

        {passos.isLoading && <Skeleton className="h-24 w-full" />}
        {passos.isError && (
          <p className="text-sm text-destructive">{formatError(passos.error)}</p>
        )}

        {!passos.isLoading && lista.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum passo declarado ainda. Sem passo, a narrativa não pode ser comparada com o que as
            pessoas declaram executar.
          </p>
        )}

        {lista.length > 0 && (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {lista.map((p, i) => {
              const atr = nomeAtribuicao(p.atribuicao_id);
              return (
                <div key={p.id} className="space-y-2 rounded-lg border bg-card p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-medium">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.nome}</p>
                      {p.descricao && (
                        <p className="text-[11px] text-muted-foreground">{p.descricao}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {p.condicional && (
                      <Badge variant="outline" className="text-[10px]">
                        condicional
                      </Badge>
                    )}
                    {atr ? (
                      <Badge variant="secondary" className="max-w-full gap-1 text-[10px]">
                        <User className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">
                          {atr.pessoa ? `${atr.pessoa} · ${atr.nome}` : atr.nome}
                        </span>
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        sem atribuição
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1 border-t pt-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={i === 0 || reordenar.isPending}
                      onClick={() => mover(i, -1)}
                      aria-label="Subir passo"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={i === lista.length - 1 || reordenar.isPending}
                      onClick={() => mover(i, 1)}
                      aria-label="Descer passo"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <div className="flex-1" />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setEmEdicao(p)}
                      aria-label="Editar passo"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => apagar(p)}
                      aria-label="Remover passo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(criando || emEdicao) && (
          <DialogPasso
            processoId={processoId}
            passo={emEdicao}
            onFechar={() => {
              setCriando(false);
              setEmEdicao(null);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function DialogPasso({
  processoId,
  passo,
  nomeInicial,
  atribuicaoInicial,
  onFechar,
}: {
  processoId: string;
  passo?: ProcessoPasso | null;
  nomeInicial?: string;
  atribuicaoInicial?: string | null;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState(passo?.nome ?? nomeInicial ?? "");
  const [descricao, setDescricao] = useState(passo?.descricao ?? "");
  const [condicional, setCondicional] = useState(passo?.condicional ?? false);
  const [atribuicaoId, setAtribuicaoId] = useState<string | null>(
    passo?.atribuicao_id ?? atribuicaoInicial ?? null,
  );
  const salvar = useSalvarPasso(processoId);

  const enviar = () =>
    salvar.mutate(
      { id: passo?.id ?? null, nome, descricao, atribuicao_id: atribuicaoId, condicional },
      {
        onSuccess: () => {
          toast.success(passo ? "Passo atualizado." : "Passo criado.");
          onFechar();
        },
        onError: (e) => toast.error("Não salvou", { description: formatError(e) }),
      },
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{passo ? "Editar passo" : "Novo passo"}</DialogTitle>
          <DialogDescription>
            Um passo do processo. Ligue a uma atribuição para saber quem executa e quanto custa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="passo-nome">Nome</Label>
            <Input
              id="passo-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Conferir boleto contra a nota"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="passo-desc">Descrição</Label>
            <Textarea
              id="passo-desc"
              rows={3}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="O que precisa acontecer neste passo."
            />
          </div>

          <div className="space-y-1">
            <Label>Atribuição ligada</Label>
            <SeletorAtribuicaoPasso valor={atribuicaoId} onChange={setAtribuicaoId} />
            <p className="text-[11px] text-muted-foreground">
              Opcional. Sem atribuição, o passo aparece como divergência.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-card p-3">
            <div className="space-y-0.5">
              <Label htmlFor="passo-cond">Passo condicional</Label>
              <p className="text-[11px] text-muted-foreground">
                Só acontece às vezes. Não é cobrado como divergência.
              </p>
            </div>
            <Switch id="passo-cond" checked={condicional} onCheckedChange={setCondicional} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
