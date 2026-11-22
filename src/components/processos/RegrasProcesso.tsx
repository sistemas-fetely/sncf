import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, ListOrdered } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatError } from "@/lib/format-error";
import {
  dataProcesso, numeroProcesso, idsHistoricoSobDemanda,
  useProcessoRegras, useProcessoRegrasHistorico,
  type ProcessoRegraHistorico,
} from "@/hooks/processos/useProcessoRegras";

function valorRegra(r: Pick<ProcessoRegraHistorico, "valor" | "unidade" | "valor_texto">, unidadeRotulo: string | null) {
  if (r.unidade === "texto") return r.valor_texto || "—";
  if (r.valor == null) return r.valor_texto || "—";
  return `${numeroProcesso(r.valor)}${unidadeRotulo ? ` ${unidadeRotulo}` : ""}${r.valor_texto ? ` (${r.valor_texto})` : ""}`;
}

export function RegrasProcesso({ processoId }: { processoId: string }) {
  const regras = useProcessoRegras(processoId);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
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
                  </TableRow>
                  {aberta && (
                    <TableRow className={r.ativo ? "" : "opacity-50"}>
                      <TableCell colSpan={6} className="space-y-3 bg-muted/30 p-3">
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
    </Card>
  );
}