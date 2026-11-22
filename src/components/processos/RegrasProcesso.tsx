import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, ListOrdered, Pencil, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatError } from "@/lib/format-error";
import {
  dataProcesso, numeroProcesso, idsHistoricoSobDemanda,
  useProcessoRegras, useProcessoRegrasHistorico, useAlterarProcessoRegra, podeSalvarRegra,
  type ProcessoRegraHistorico, type ProcessoRegra, type EdicaoRegra,
} from "@/hooks/processos/useProcessoRegras";

function valorRegra(r: Pick<ProcessoRegraHistorico, "valor" | "unidade" | "valor_texto">, unidadeRotulo: string | null) {
  if (r.unidade === "texto") return r.valor_texto || "—";
  if (r.valor == null) return r.valor_texto || "—";
  return `${numeroProcesso(r.valor)}${unidadeRotulo ? ` ${unidadeRotulo}` : ""}${r.valor_texto ? ` (${r.valor_texto})` : ""}`;
}

export function RegrasProcesso({ processoId }: { processoId: string }) {
  const regras = useProcessoRegras(processoId);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<ProcessoRegra | null>(null);
  const lista = regras.data ?? [];
  const historico = useProcessoRegrasHistorico(processoId, idsHistoricoSobDemanda(lista, expandidas));
  const alternar = (id: string) => setExpandidas((atual) => {
    const proxima = new Set(atual);
    if (proxima.has(id)) proxima.delete(id); else proxima.add(id);
    return proxima;
  });

  if (regras.isError) return <p className="text-sm text-destructive">{formatError(regras.error)}</p>;
  if (lista.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Regras e prazos</h2>
          <span className="text-xs text-muted-foreground">({lista.length})</span>
        </div>
        <Table className="table-fixed min-w-[800px] text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 px-1"><span className="sr-only">Detalhes</span></TableHead>
              <TableHead className="w-[24%] px-2">Regra</TableHead>
              <TableHead className="w-[15%] px-2">Valor</TableHead>
              <TableHead className="w-[20%] px-2">Conta a partir de</TableHead>
              <TableHead className="px-2">Usada em</TableHead>
              <TableHead className="w-[18%] px-2">Definido por / em</TableHead>
              <TableHead className="w-10 px-1"><span className="sr-only">Alterar</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.map((r) => {
              const aberta = expandidas.has(r.id);
              return (
                <Fragment key={r.id}>
                  <TableRow className={r.ativo ? "" : "opacity-50"} onClick={() => alternar(r.id)}>
                    <TableCell className="px-1 py-2 align-top">
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Detalhes da regra ${r.codigo}`} aria-expanded={aberta}
                        onClick={(e) => { e.stopPropagation(); alternar(r.id); }}>
                        {aberta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </Button>
                    </TableCell>
                    <TableCell className="break-words px-2 py-3 align-top">
                      <p className="font-medium">{r.nome}</p>
                      <p className="text-[10px] text-muted-foreground">{r.codigo}</p>
                      {!r.ativo && <Badge variant="outline" className="text-[10px]">inativa</Badge>}
                    </TableCell>
                    <TableCell className="break-words px-2 py-3 align-top">{valorRegra(r, r.unidade_rotulo)}</TableCell>
                    <TableCell className="break-words px-2 py-3 align-top">{r.conta_a_partir_de || "—"}</TableCell>
                    <TableCell className="break-words px-2 py-3 align-top">{r.passos || "—"}</TableCell>
                    <TableCell className="break-words px-2 py-3 align-top">{r.definido_por || "—"} · {dataProcesso(r.definido_em)}</TableCell>
                    <TableCell className="px-1 py-2 align-top">
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Alterar regra ${r.codigo}`} title={`Alterar regra ${r.codigo}`}
                        onClick={(e) => { e.stopPropagation(); setEditando(r); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {aberta && (
                    <TableRow className={r.ativo ? "" : "opacity-50"}>
                      <TableCell colSpan={7} className="space-y-3 bg-muted/30 p-3">
                        <p className="whitespace-pre-line">{r.motivo || "Sem motivo registrado"}</p>
                        {r.mudancas === 0 ? <p className="text-muted-foreground">Nunca foi alterada.</p> : (
                          <>
                            {historico.isLoading && <Skeleton className="h-12 w-full" />}
                            {historico.isError && <p className="text-destructive">{formatError(historico.error)}</p>}
                            {historico.isSuccess && (historico.data.get(r.id) ?? []).length === 0 && <p className="text-muted-foreground">Histórico não encontrado.</p>}
                            {(historico.data?.get(r.id) ?? []).map((h, i) => (
                              <div key={`${h.substituido_em}-${i}`} className="space-y-1 border-t pt-2">
                                <p><span className="font-medium">Valor anterior: </span>{valorRegra(h, h.unidade === r.unidade ? r.unidade_rotulo : h.unidade?.split("_").join(" ") ?? null)}</p>
                                <p className="text-muted-foreground">Definido por {h.definido_por || "—"} em {dataProcesso(h.definido_em)} · trocado em {dataProcesso(h.substituido_em)}</p>
                                {h.conta_a_partir_de && <p className="text-muted-foreground">Conta a partir de: {h.conta_a_partir_de}</p>}
                                {h.motivo && <p className="whitespace-pre-line text-muted-foreground">{h.motivo}</p>}
                              </div>
                            ))}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      {editando && <AlterarRegraDialog key={editando.id} regra={editando} processoId={processoId} fechar={() => setEditando(null)} />}
    </Card>
  );
}

function AlterarRegraDialog({ regra, processoId, fechar }: { regra: ProcessoRegra; processoId: string; fechar: () => void }) {
  const alterar = useAlterarProcessoRegra(processoId);
  const [edicao, setEdicao] = useState<EdicaoRegra>({
    valor: regra.valor == null ? "" : `${regra.valor}`,
    valorTexto: regra.valor_texto ?? "",
    contaAPartirDe: regra.conta_a_partir_de ?? "",
    motivo: "",
  });
  const campo = (nome: keyof EdicaoRegra, valor: string) => setEdicao((atual) => ({ ...atual, [nome]: valor }));
  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto && !alterar.isPending) fechar(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Alterar regra</DialogTitle>
          <p className="break-words text-sm font-medium">{regra.nome}</p>
          <p className="break-words text-xs text-muted-foreground">{regra.codigo}</p>
          <DialogDescription className="break-words text-xs">Hoje: {valorRegra(regra, regra.unidade_rotulo)} · definido por {regra.definido_por || "—"} em {dataProcesso(regra.definido_em)}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (!alterar.isPending && podeSalvarRegra(regra, edicao)) alterar.mutate({ regra, edicao }, { onSuccess: fechar });
        }}>
          <fieldset disabled={alterar.isPending} className="min-w-0 space-y-4">
            {regra.unidade === "texto" ? (
              <div className="space-y-1.5">
                <Label htmlFor="regra-texto">Texto da regra</Label>
                <Textarea id="regra-texto" value={edicao.valorTexto} onChange={(e) => campo("valorTexto", e.target.value)} />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="regra-valor">Novo valor</Label>
                  <div className="flex items-center gap-2">
                    <Input id="regra-valor" className="w-28 shrink-0" type="number" min={0} step={1} required value={edicao.valor} onChange={(e) => campo("valor", e.target.value)} />
                    <span className="text-sm text-muted-foreground">{regra.unidade_rotulo}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="regra-observacao">Observação do valor</Label>
                  <Input id="regra-observacao" value={edicao.valorTexto} onChange={(e) => campo("valorTexto", e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="regra-conta">Conta a partir de</Label>
              <Input id="regra-conta" value={edicao.contaAPartirDe} onChange={(e) => campo("contaAPartirDe", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="regra-motivo">Motivo da mudança</Label>
              <Textarea id="regra-motivo" required placeholder="Por que a regra mudou — fica no histórico" value={edicao.motivo} onChange={(e) => campo("motivo", e.target.value)} />
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={alterar.isPending} onClick={fechar}>Cancelar</Button>
            <Button type="submit" disabled={alterar.isPending || !podeSalvarRegra(regra, edicao)}>
              {alterar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}