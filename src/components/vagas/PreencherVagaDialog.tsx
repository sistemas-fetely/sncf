import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

interface Posicao {
  id: string;
  titulo: string;
  cargo_id: string | null;
  departamento_id: string | null;
  unidade_id: string | null;
  centro_custo_id: string | null;
  tipo_vinculo: string | null;
  senioridade: string | null;
}


interface Props {
  posicao: Posicao | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cargoNome?: string;
  departamentoNome?: string;
  unidadeNome?: string;
}

type Modo = "existente" | "nova";

export function PreencherVagaDialog({
  posicao, open, onOpenChange, cargoNome, departamentoNome, unidadeNome,
}: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [modo, setModo] = useState<Modo>("existente");
  const [pessoaId, setPessoaId] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoCpf, setNovoCpf] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [tipoVinculo, setTipoVinculo] = useState<"CLT" | "PJ">("CLT");
  const [valorBase, setValorBase] = useState("");
  const [centroCustoId, setCentroCustoId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && posicao) {
      setModo("existente");
      setPessoaId("");
      setNovoNome("");
      setNovoCpf("");
      setDataInicio(new Date().toISOString().slice(0, 10));
      setTipoVinculo(
        posicao.tipo_vinculo === "PJ" ? "PJ" : "CLT",
      );
      setValorBase("");
      setCentroCustoId(posicao.centro_custo_id || "");
    }
  }, [open, posicao]);


  // Pessoas sem vínculo ativo
  const { data: pessoasDisponiveis } = useQuery({
    queryKey: ["pessoas-sem-vinculo-ativo"],
    enabled: open,
    queryFn: async () => {
      const [{ data: pessoas, error: e1 }, { data: vinculos, error: e2 }] = await Promise.all([
        (supabase as any).from("pessoas").select("id, nome_completo, cpf").order("nome_completo"),
        (supabase as any).from("vinculos").select("pessoa_id").eq("status", "ativo").is("data_fim", null),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const comVinculo = new Set((vinculos || []).map((v: any) => v.pessoa_id));
      return ((pessoas || []) as any[]).filter((p) => !comVinculo.has(p.id));
    },
  });

  const { data: centrosCusto } = useQuery({
    queryKey: ["centros-custo-ativos"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("centros_custo").select("id, codigo, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data || []) as { id: string; codigo: string; nome: string }[];
    },
  });

  const camposValidos = useMemo(() => {
    if (!posicao) return false;
    if (!dataInicio || !valorBase || !centroCustoId) return false;
    if (modo === "existente" && !pessoaId) return false;
    if (modo === "nova" && (!novoNome.trim() || !novoCpf.trim())) return false;
    return true;
  }, [posicao, modo, pessoaId, novoNome, novoCpf, dataInicio, valorBase, centroCustoId]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!posicao) throw new Error("Posição inválida.");

      // 1) Resolver pessoa_id
      let finalPessoaId = pessoaId;
      let pessoaCriadaId: string | null = null;

      if (modo === "nova") {
        const cpfLimpo = novoCpf.replace(/\D/g, "");
        if (cpfLimpo.length !== 11) throw new Error("CPF inválido (precisa ter 11 dígitos).");
        const { data: novaPessoa, error: eP } = await (supabase as any)
          .from("pessoas")
          .insert({ nome_completo: novoNome.trim(), cpf: cpfLimpo })
          .select("id")
          .single();
        if (eP) throw eP;
        finalPessoaId = novaPessoa.id;
        pessoaCriadaId = novaPessoa.id;
      }

      // 2) INSERT vínculo
      const vinculoPayload: any = {
        pessoa_id: finalPessoaId,
        tipo_vinculo: tipoVinculo,
        cargo_id: posicao.cargo_id,
        departamento_id: posicao.departamento_id,
        unidade_id: posicao.unidade_id,
        centro_custo_id: centroCustoId,
        data_inicio: dataInicio,
        valor_base: Number(valorBase.replace(",", ".")) || 0,
        status: "ativo",
      };
      const { data: novoVinculo, error: eV } = await (supabase as any)
        .from("vinculos")
        .insert(vinculoPayload)
        .select("id")
        .single();
      if (eV) {
        // Rollback pessoa se criamos nesta transação
        if (pessoaCriadaId) {
          await (supabase as any).from("pessoas").delete().eq("id", pessoaCriadaId);
        }
        throw eV;
      }

      // 3) UPDATE posição
      const { error: eU } = await (supabase as any)
        .from("posicoes_planejadas")
        .update({ status: "preenchida", vinculo_id: novoVinculo.id })
        .eq("id", posicao.id);
      if (eU) {
        // Rollback vínculo + pessoa nova
        await (supabase as any).from("vinculos").delete().eq("id", novoVinculo.id);
        if (pessoaCriadaId) {
          await (supabase as any).from("pessoas").delete().eq("id", pessoaCriadaId);
        }
        throw eU;
      }

      return { vinculoId: novoVinculo.id, pessoaId: finalPessoaId };
    },
    onSuccess: () => {
      toast.success("Posição preenchida · Vínculo criado");
      qc.invalidateQueries({ queryKey: ["posicoes-planejadas"] });
      qc.invalidateQueries({ queryKey: ["pessoas-sem-vinculo-ativo"] });
      qc.invalidateQueries({ queryKey: ["dimensionamento-areas"] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(humanizeError(err?.message || String(err)));
    },
  });

  async function handleSave() {
    setSaving(true);
    try {
      await mutation.mutateAsync();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preencher posição: {posicao?.titulo}</DialogTitle>
          <DialogDescription>
            Cria o vínculo da pessoa nesta posição e marca a vaga como preenchida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Contexto da posição (read-only) */}
          <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Cargo: </span>{cargoNome || "—"}</div>
            <div><span className="text-muted-foreground">Departamento: </span>{departamentoNome || "—"}</div>
            <div><span className="text-muted-foreground">Unidade: </span>{unidadeNome || "—"}</div>
            <div><span className="text-muted-foreground">Senioridade: </span>{posicao?.senioridade || "—"}</div>
          </div>

          {/* Modo pessoa */}
          <div className="space-y-1.5">
            <Label>Pessoa</Label>
            <Select value={modo} onValueChange={(v) => setModo(v as Modo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="existente">Selecionar pessoa existente</SelectItem>
                <SelectItem value="nova">Cadastrar pessoa nova</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {modo === "existente" ? (
            <div className="space-y-1.5">
              <Label>Selecionar pessoa *</Label>
              <Select value={pessoaId} onValueChange={setPessoaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pessoas sem vínculo ativo" />
                </SelectTrigger>
                <SelectContent>
                  {(pessoasDisponiveis || []).length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      Ninguém disponível. Cadastre uma pessoa nova.
                    </div>
                  ) : (
                    (pessoasDisponiveis || []).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome_completo}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome completo *</Label>
                <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>CPF *</Label>
                <Input
                  value={novoCpf}
                  onChange={(e) => setNovoCpf(e.target.value)}
                  placeholder="Somente números"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data de início *</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de vínculo *</Label>
              <Select value={tipoVinculo} onValueChange={(v) => setTipoVinculo(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLT">CLT</SelectItem>
                  <SelectItem value="PJ">PJ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Remuneração base (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                value={valorBase}
                onChange={(e) => setValorBase(e.target.value)}
                placeholder="Ex: 5000.00"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Centro de custo *</Label>
              <Select value={centroCustoId} onValueChange={setCentroCustoId}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {(centrosCusto || []).map((cc) => (
                    <SelectItem key={cc.id} value={cc.id}>{cc.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Após criar, você pode complementar dados bancários, benefícios e extras em Pessoas → editar.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !camposValidos}>
            {saving ? "Preenchendo..." : "Preencher vaga"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
