import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Pencil, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatError } from "@/lib/format-error";
import { codigoVariacaoValido, type VariacaoCatalogo } from "@/lib/chamados/catalogoVariacoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface VariacaoServico extends VariacaoCatalogo {
  id: string;
  assunto_id: string;
  ativo: boolean;
  ordem: number;
}
type FormVariacao = Omit<VariacaoServico, "id" | "assunto_id"> & { id: string | null };
const cliente = supabase as unknown as SupabaseClient;
const chave = ["demanda_assunto_variacao", "catalogo"];

export function useVariacoesServico(assuntoId: string | null | undefined) {
  return useQuery({
    queryKey: [...chave, assuntoId],
    enabled: !!assuntoId,
    queryFn: async (): Promise<VariacaoServico[]> => {
      if (!assuntoId) return [];
      const { data, error } = await cliente.from("demanda_assunto_variacao").select("*")
        .eq("assunto_id", assuntoId).order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as VariacaoServico[];
    },
  });
}

export function VariacoesServico({ assuntoId, podeEditar }: { assuntoId: string; podeEditar: boolean }) {
  const query = useVariacoesServico(assuntoId);
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const podeGravar = podeEditar && hasRole("super_admin");
  const [form, setForm] = useState<FormVariacao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const invalido = !form?.nome.trim() || !codigoVariacaoValido(form?.codigo.trim() ?? "") ||
    !Number.isFinite(form?.ordem) || (query.data ?? []).some((v) => v.id !== form?.id && v.codigo === form?.codigo.trim());

  async function salvar() {
    if (!form || invalido || !podeGravar) return;
    setSalvando(true);
    try {
      const payload = { nome: form.nome.trim(), descricao: form.descricao?.trim() || null,
        ordem: form.ordem, ativo: form.ativo, libera_refaturamento: form.libera_refaturamento };
      const { error } = form.id
        ? await cliente.from("demanda_assunto_variacao").update(payload).eq("id", form.id).eq("assunto_id", assuntoId)
        : await cliente.from("demanda_assunto_variacao").insert({ ...payload, codigo: form.codigo.trim(), assunto_id: assuntoId });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: chave }),
        qc.invalidateQueries({ queryKey: ["demanda_assunto", "catalogo"] }),
        qc.invalidateQueries({ queryKey: ["chamado_fila", "catalogo"] }),
        qc.invalidateQueries({ queryKey: ["catalogo-arvore-chamados"] }),
      ]);
      toast.success("Variação salva.");
      setForm(null);
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Variações</Label>
        <Button type="button" variant="outline" size="sm" disabled={!podeGravar || salvando || query.isLoading || query.isError}
          onClick={() => setForm({ id: null, codigo: "", nome: "", descricao: "", ordem: Math.max(0, ...(query.data ?? []).map((v) => v.ordem)) + 10, ativo: true, libera_refaturamento: false })}>
          <PlusCircle className="mr-1 h-3.5 w-3.5" />Adicionar variação
        </Button>
      </div>
      {query.isError ? <Alert variant="destructive"><AlertDescription>{formatError(query.error)}</AlertDescription></Alert>
        : query.isLoading ? <p className="text-xs text-muted-foreground">Carregando variações...</p>
        : (query.data ?? []).map((v) => (
          <div key={v.id} className="flex items-start justify-between gap-2 rounded-md border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{v.nome} {!v.ativo && <Badge variant="outline">inativa</Badge>}</p>
              <p className="break-words text-xs text-muted-foreground">{v.codigo} · ordem {v.ordem}</p>
              {v.descricao && <p className="text-xs text-muted-foreground">{v.descricao}</p>}
            </div>
            <Button type="button" variant="ghost" size="sm" disabled={!podeGravar || salvando} onClick={() => setForm({ ...v })}>
              <Pencil className="mr-1 h-3.5 w-3.5" />Editar
            </Button>
          </div>
        ))}
      {!query.isLoading && !query.isError && !query.data?.length && <p className="text-xs text-muted-foreground">Nenhuma variação.</p>}
      {form && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="var-nome">Nome *</Label><Input id="var-nome" value={form.nome} disabled={salvando} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="var-codigo">Código *</Label><Input id="var-codigo" value={form.codigo} readOnly={!!form.id} disabled={salvando} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="var-descricao">Descrição</Label><Textarea id="var-descricao" rows={2} value={form.descricao ?? ""} disabled={salvando} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="var-ordem">Ordem</Label><Input id="var-ordem" type="number" value={form.ordem} disabled={salvando} onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) })} /></div>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2"><Switch id="var-refaturamento" checked={form.libera_refaturamento} disabled={salvando} onCheckedChange={(v) => setForm({ ...form, libera_refaturamento: v })} /><Label htmlFor="var-refaturamento">Libera refaturamento</Label></div>
            <div className="flex items-center gap-2"><Switch id="var-ativa" checked={form.ativo} disabled={salvando} onCheckedChange={(v) => setForm({ ...form, ativo: v })} /><Label htmlFor="var-ativa">Ativa</Label></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={salvando} onClick={() => setForm(null)}>Cancelar variação</Button>
            <Button type="button" disabled={invalido || salvando || !podeGravar} onClick={salvar}>{salvando ? "Salvando..." : "Salvar variação"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}