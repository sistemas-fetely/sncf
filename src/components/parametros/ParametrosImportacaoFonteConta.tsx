/**
 * CRUD da dimensão `importacao_fonte_conta` — fonte de importação → conta bancária.
 *
 * Existe porque o seletor manual de conta na importação mandou 89 movimentações
 * do Mercado Pago para o Safra. Fonte de conta única declara a conta AQUI;
 * arquivo cuja fonte não está mapeada é recusado na importação, de propósito.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Save, X, Trash2, Landmark } from "lucide-react";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Mapa = {
  fonte: string;
  conta_bancaria_id: string;
  observacao: string | null;
};

type Conta = { id: string; nome_exibicao: string };

export function ParametrosImportacaoFonteConta() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<{ conta_bancaria_id: string; observacao: string }>({
    conta_bancaria_id: "",
    observacao: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
  const [novo, setNovo] = useState({ fonte: "", conta_bancaria_id: "", observacao: "" });

  const { data: mapas = [], isLoading, isError, error } = useQuery({
    queryKey: ["importacao-fonte-conta"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("importacao_fonte_conta")
        .select("fonte, conta_bancaria_id, observacao")
        .order("fonte");
      if (error) throw error;
      return (data || []) as Mapa[];
    },
  });

  const { data: contas = [] } = useQuery({
    queryKey: ["importacao-fonte-conta-contas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao")
        .order("nome_exibicao");
      if (error) throw error;
      return (data || []) as Conta[];
    },
  });

  const nomeConta = (id: string) =>
    contas.find((c) => c.id === id)?.nome_exibicao ?? "conta não encontrada";

  async function salvarEdicao(fonte: string) {
    if (!rascunho.conta_bancaria_id) {
      toast.error("Escolha a conta bancária");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await sb
        .from("importacao_fonte_conta")
        .update({
          conta_bancaria_id: rascunho.conta_bancaria_id,
          observacao: rascunho.observacao || null,
        })
        .eq("fonte", fonte);
      if (error) throw error;
      toast.success(`Mapeamento de "${fonte}" atualizado`);
      setEditando(null);
      qc.invalidateQueries({ queryKey: ["importacao-fonte-conta"] });
    } catch (e) {
      toast.error("Falha ao salvar: " + formatError(e));
    } finally {
      setSalvando(false);
    }
  }

  async function criar() {
    const fonte = novo.fonte.trim();
    if (!fonte || !novo.conta_bancaria_id) {
      toast.error("Informe o código da fonte e a conta bancária");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await sb.from("importacao_fonte_conta").insert({
        fonte,
        conta_bancaria_id: novo.conta_bancaria_id,
        observacao: novo.observacao || null,
      });
      if (error) throw error;
      toast.success(`Fonte "${fonte}" mapeada`);
      setNovoOpen(false);
      setNovo({ fonte: "", conta_bancaria_id: "", observacao: "" });
      qc.invalidateQueries({ queryKey: ["importacao-fonte-conta"] });
    } catch (e) {
      toast.error("Falha ao criar: " + formatError(e));
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(fonte: string) {
    if (
      !window.confirm(
        `Apagar o mapeamento da fonte "${fonte}"? Arquivos dessa fonte passarão a ser recusados na importação.`
      )
    )
      return;
    try {
      const { error } = await sb.from("importacao_fonte_conta").delete().eq("fonte", fonte);
      if (error) throw error;
      toast.success("Mapeamento apagado");
      qc.invalidateQueries({ queryKey: ["importacao-fonte-conta"] });
    } catch (e) {
      toast.error("Falha ao apagar: " + formatError(e));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4" />
            Conta bancária por fonte de importação
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Na importação de arquivos bancários não existe seletor de conta. O OFX resolve pelo
            próprio cabeçalho; as demais fontes resolvem por este mapeamento. Fonte sem mapeamento
            faz o arquivo ser recusado.
          </p>
        </div>
        <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Nova fonte
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mapear fonte para conta</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Código da fonte</Label>
                <Input
                  value={novo.fonte}
                  onChange={(e) => setNovo({ ...novo, fonte: e.target.value })}
                  placeholder="ex.: mp_release"
                />
              </div>
              <div>
                <Label>Conta bancária</Label>
                <Select
                  value={novo.conta_bancaria_id}
                  onValueChange={(v) => setNovo({ ...novo, conta_bancaria_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                  <SelectContent>
                    {contas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome_exibicao}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Observação</Label>
                <Input
                  value={novo.observacao}
                  onChange={(e) => setNovo({ ...novo, observacao: e.target.value })}
                  placeholder="ex.: Fonte de conta única"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNovoOpen(false)}>Cancelar</Button>
              <Button onClick={criar} disabled={salvando} className="gap-2">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">{formatError(error)}</p>
        ) : mapas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma fonte mapeada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fonte</TableHead>
                <TableHead>Conta bancária</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mapas.map((m) => {
                const emEdicao = editando === m.fonte;
                return (
                  <TableRow key={m.fonte}>
                    <TableCell className="font-mono text-xs">{m.fonte}</TableCell>
                    <TableCell>
                      {emEdicao ? (
                        <Select
                          value={rascunho.conta_bancaria_id}
                          onValueChange={(v) => setRascunho({ ...rascunho, conta_bancaria_id: v })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Selecione a conta" />
                          </SelectTrigger>
                          <SelectContent>
                            {contas.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.nome_exibicao}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        nomeConta(m.conta_bancaria_id)
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {emEdicao ? (
                        <Input
                          className="h-8"
                          value={rascunho.observacao}
                          onChange={(e) => setRascunho({ ...rascunho, observacao: e.target.value })}
                        />
                      ) : (
                        (m.observacao ?? "—")
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {emEdicao ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              disabled={salvando}
                              onClick={() => salvarEdicao(m.fonte)}
                              aria-label="Salvar"
                            >
                              {salvando ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setEditando(null)}
                              aria-label="Cancelar"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              aria-label="Editar"
                              onClick={() => {
                                setEditando(m.fonte);
                                setRascunho({
                                  conta_bancaria_id: m.conta_bancaria_id,
                                  observacao: m.observacao ?? "",
                                });
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              aria-label="Apagar"
                              onClick={() => apagar(m.fonte)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
