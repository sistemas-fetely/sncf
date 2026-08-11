import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Save, X, FileStack } from "lucide-react";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const PAPEIS = ["extrato", "enriquece", "informativa", "conferencia", "fora"] as const;
const DESTINOS = [
  "movimentacoes_bancarias",
  "faturas_cartao",
  "saldo_diario_conta",
  "nenhum",
] as const;

type Fonte = {
  id: string;
  banco: string;
  fonte_codigo: string;
  conta_bancaria_id: string | null;
  nome_documento: string;
  papel: string;
  destino: string;
  padrao_descricao: string | null;
  periodicidade: string | null;
  formato: string | null;
  implantado: boolean;
  ativo: boolean;
  observacao: string | null;
  ordem: number | null;
};

type Rascunho = Pick<
  Fonte,
  "nome_documento" | "papel" | "destino" | "padrao_descricao" | "periodicidade" | "implantado" | "ativo" | "observacao"
>;

export function ParametrosExtratoFontes() {
  const qc = useQueryClient();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
  const [novo, setNovo] = useState({
    banco: "",
    fonte_codigo: "",
    conta_bancaria_id: "",
    nome_documento: "",
    papel: "extrato",
    destino: "movimentacoes_bancarias",
    padrao_descricao: "",
    periodicidade: "",
    observacao: "",
    implantado: false,
    ativo: true,
  });

  const { data: fontes = [], isLoading, isError, error } = useQuery({
    queryKey: ["extrato-fontes"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("extrato_fontes")
        .select("*")
        .order("banco")
        .order("ordem")
        .order("fonte_codigo");
      if (error) throw error;
      return (data || []) as Fonte[];
    },
  });

  const { data: contas = [] } = useQuery({
    queryKey: ["extrato-fontes-contas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao")
        .order("nome_exibicao");
      if (error) throw error;
      return data || [];
    },
  });

  const porBanco = useMemo(() => {
    const map = new Map<string, Fonte[]>();
    for (const f of fontes) {
      const arr = map.get(f.banco) || [];
      arr.push(f);
      map.set(f.banco, arr);
    }
    return Array.from(map.entries());
  }, [fontes]);

  const nomeConta = (id: string | null) =>
    contas.find((c: { id: string }) => c.id === id)?.nome_exibicao ?? null;

  function iniciarEdicao(f: Fonte) {
    setEditandoId(f.id);
    setRascunho({
      nome_documento: f.nome_documento,
      papel: f.papel,
      destino: f.destino,
      padrao_descricao: f.padrao_descricao,
      periodicidade: f.periodicidade,
      implantado: f.implantado,
      ativo: f.ativo,
      observacao: f.observacao,
    });
  }

  async function salvar(id: string) {
    if (!rascunho) return;
    setSalvando(true);
    try {
      const { error } = await sb
        .from("extrato_fontes")
        .update({
          nome_documento: rascunho.nome_documento,
          papel: rascunho.papel,
          destino: rascunho.destino,
          padrao_descricao: rascunho.padrao_descricao || null,
          periodicidade: rascunho.periodicidade || null,
          implantado: rascunho.implantado,
          ativo: rascunho.ativo,
          observacao: rascunho.observacao || null,
        })
        .eq("id", id);
      if (error) throw error;
      toast.success("Fonte atualizada");
      setEditandoId(null);
      setRascunho(null);
      qc.invalidateQueries({ queryKey: ["extrato-fontes"] });
    } catch (e) {
      toast.error("Falha ao salvar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvando(false);
    }
  }

  async function criar() {
    if (!novo.banco.trim() || !novo.fonte_codigo.trim() || !novo.nome_documento.trim()) {
      toast.error("Banco, código da fonte e nome do documento são obrigatórios");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await sb.from("extrato_fontes").insert({
        banco: novo.banco.trim(),
        fonte_codigo: novo.fonte_codigo.trim(),
        conta_bancaria_id: novo.conta_bancaria_id || null,
        nome_documento: novo.nome_documento.trim(),
        papel: novo.papel,
        destino: novo.destino,
        padrao_descricao: novo.padrao_descricao.trim() || null,
        periodicidade: novo.periodicidade.trim() || null,
        observacao: novo.observacao.trim() || null,
        implantado: novo.implantado,
        ativo: novo.ativo,
      });
      if (error) throw error;
      toast.success("Fonte criada");
      setNovoOpen(false);
      setNovo({
        banco: "", fonte_codigo: "", conta_bancaria_id: "", nome_documento: "",
        papel: "extrato", destino: "movimentacoes_bancarias", padrao_descricao: "",
        periodicidade: "", observacao: "", implantado: false, ativo: true,
      });
      qc.invalidateQueries({ queryKey: ["extrato-fontes"] });
    } catch (e) {
      toast.error("Falha ao criar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileStack className="h-4 w-4" />
            Fontes de extrato (documentos de banco)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Define o papel e o destino de cada documento de banco. Quando o banco inventar uma
            variante nova de linha de saldo, é um registro aqui — não um deploy.
          </p>
        </div>
        <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Nova fonte</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nova fonte de extrato</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Banco *</Label>
                  <Input value={novo.banco} onChange={(e) => setNovo({ ...novo, banco: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Código da fonte * (chave)</Label>
                  <Input
                    value={novo.fonte_codigo}
                    onChange={(e) => setNovo({ ...novo, fonte_codigo: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Nome do documento *</Label>
                <Input
                  value={novo.nome_documento}
                  onChange={(e) => setNovo({ ...novo, nome_documento: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Conta bancária (opcional — vale para todas se vazio)</Label>
                <Select
                  value={novo.conta_bancaria_id}
                  onValueChange={(v) => setNovo({ ...novo, conta_bancaria_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Todas as contas" /></SelectTrigger>
                  <SelectContent>
                    {contas.map((c: { id: string; nome_exibicao: string }) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome_exibicao}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Papel</Label>
                  <Select value={novo.papel} onValueChange={(v) => setNovo({ ...novo, papel: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAPEIS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Destino</Label>
                  <Select value={novo.destino} onValueChange={(v) => setNovo({ ...novo, destino: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DESTINOS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Padrão de descrição (linha informativa)</Label>
                <Input
                  value={novo.padrao_descricao}
                  onChange={(e) => setNovo({ ...novo, padrao_descricao: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Periodicidade</Label>
                  <Input
                    value={novo.periodicidade}
                    onChange={(e) => setNovo({ ...novo, periodicidade: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Observação</Label>
                  <Input
                    value={novo.observacao}
                    onChange={(e) => setNovo({ ...novo, observacao: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={novo.implantado}
                    onCheckedChange={(v) => setNovo({ ...novo, implantado: v })}
                  />
                  Implantado
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={novo.ativo}
                    onCheckedChange={(v) => setNovo({ ...novo, ativo: v })}
                  />
                  Ativo
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNovoOpen(false)}>Cancelar</Button>
              <Button onClick={criar} disabled={salvando} className="gap-2">
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {isError && (
          <p className="text-sm text-destructive py-4">
            Falha ao carregar fontes: {error instanceof Error ? error.message : String(error)}
          </p>
        )}
        {!isLoading && !isError && fontes.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nenhuma fonte cadastrada.
          </p>
        )}

        <div className="space-y-6">
          {porBanco.map(([banco, itens]) => (
            <div key={banco} className="space-y-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {banco}
              </h4>
              <div className="space-y-2">
                {itens.map((f) => {
                  const editando = editandoId === f.id && rascunho;
                  return (
                    <div key={f.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              {editando ? rascunho!.nome_documento : f.nome_documento}
                            </span>
                            <Badge variant="outline" className="text-[10px]">{f.fonte_codigo}</Badge>
                            {!f.ativo && <Badge variant="secondary" className="text-[10px]">inativo</Badge>}
                            {!f.implantado && (
                              <Badge variant="outline" className="text-[10px]">não implantado</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {nomeConta(f.conta_bancaria_id) || "Todas as contas"}
                            {f.formato ? ` · ${f.formato}` : ""}
                          </div>
                        </div>
                        {editando ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="gap-1"
                              disabled={salvando}
                              onClick={() => salvar(f.id)}
                            >
                              {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              Salvar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setEditandoId(null); setRascunho(null); }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => iniciarEdicao(f)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                      </div>

                      {editando ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <Label className="text-xs">Nome do documento</Label>
                            <Input
                              value={rascunho!.nome_documento}
                              onChange={(e) => setRascunho({ ...rascunho!, nome_documento: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Padrão de descrição</Label>
                            <Input
                              value={rascunho!.padrao_descricao || ""}
                              onChange={(e) => setRascunho({ ...rascunho!, padrao_descricao: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Papel</Label>
                            <Select
                              value={rascunho!.papel}
                              onValueChange={(v) => setRascunho({ ...rascunho!, papel: v })}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {PAPEIS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Destino</Label>
                            <Select
                              value={rascunho!.destino}
                              onValueChange={(v) => setRascunho({ ...rascunho!, destino: v })}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {DESTINOS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Periodicidade</Label>
                            <Input
                              value={rascunho!.periodicidade || ""}
                              onChange={(e) => setRascunho({ ...rascunho!, periodicidade: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Observação</Label>
                            <Input
                              value={rascunho!.observacao || ""}
                              onChange={(e) => setRascunho({ ...rascunho!, observacao: e.target.value })}
                            />
                          </div>
                          <div className="flex items-center gap-6">
                            <label className="flex items-center gap-2 text-xs">
                              <Switch
                                checked={rascunho!.implantado}
                                onCheckedChange={(v) => setRascunho({ ...rascunho!, implantado: v })}
                              />
                              Implantado
                            </label>
                            <label className="flex items-center gap-2 text-xs">
                              <Switch
                                checked={rascunho!.ativo}
                                onCheckedChange={(v) => setRascunho({ ...rascunho!, ativo: v })}
                              />
                              Ativo
                            </label>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="text-[10px]">papel: {f.papel}</Badge>
                          <Badge variant="secondary" className="text-[10px]">destino: {f.destino}</Badge>
                          {f.periodicidade && <span>· {f.periodicidade}</span>}
                          {f.padrao_descricao && (
                            <span className="font-mono">· {f.padrao_descricao}</span>
                          )}
                          {f.observacao && <span>· {f.observacao}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
