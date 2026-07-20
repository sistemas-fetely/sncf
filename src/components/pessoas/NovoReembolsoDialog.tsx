import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editar?: any;
  onSaved: () => void;
}

export function NovoReembolsoDialog({ open, onOpenChange, editar, onSaved }: Props) {
  const { user } = useAuth();
  const [vinculoId, setVinculoId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [valor, setValor] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [descricao, setDescricao] = useState("");
  const [semComprovante, setSemComprovante] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editar) {
      setVinculoId(editar.vinculo_id || "");
      setCategoriaId(editar.categoria_id || "");
      setValor(String(editar.valor ?? ""));
      setCompetencia(editar.competencia || "");
      setDescricao(editar.descricao || "");
      setSemComprovante(!!editar.sem_comprovante);
      setArquivo(null);
    } else {
      setVinculoId("");
      setCategoriaId("");
      setValor("");
      setCompetencia("");
      setDescricao("");
      setSemComprovante(false);
      setArquivo(null);
    }
  }, [open, editar]);

  const { data: vinculos = [] } = useQuery({
    queryKey: ["reembolso-vinculos-ativos"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vinculos")
        .select("id, pessoa_id, pessoas:pessoa_id ( nome_completo )")
        .eq("status", "ativo");
      if (error) throw error;
      return (data ?? [])
        .map((v: any) => ({ id: v.id, nome: v.pessoas?.nome_completo ?? "—" }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ["reembolso-categorias"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reembolso_categorias")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function salvar() {
    const valorNum = parseFloat(valor.replace(",", "."));
    if (!vinculoId) return toast.error("Selecione a pessoa");
    if (!categoriaId) return toast.error("Selecione a categoria");
    if (!valorNum || valorNum <= 0) return toast.error("Valor deve ser maior que zero");
    if (!competencia) return toast.error("Informe a competência");
    if (!semComprovante && !arquivo && !editar?.comprovante_url) {
      return toast.error("Anexe um comprovante ou marque 'Sem comprovante'");
    }

    setSaving(true);
    try {
      let comprovanteUrl: string | null = editar?.comprovante_url ?? null;

      if (semComprovante) {
        comprovanteUrl = null;
      } else if (arquivo) {
        const ext = arquivo.name.split(".").pop() || "bin";
        const path = `${user!.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("comprovantes-reembolso")
          .upload(path, arquivo, { upsert: false });
        if (upErr) throw upErr;
        comprovanteUrl = path;
      }

      const payload: any = {
        vinculo_id: vinculoId,
        categoria_id: categoriaId,
        valor: valorNum,
        competencia,
        descricao: descricao.trim() || null,
        comprovante_url: comprovanteUrl,
        sem_comprovante: semComprovante,
        status: "pendente",
      };

      if (editar) {
        const { error } = await supabase
          .from("reembolsos_colaborador")
          .update(payload)
          .eq("id", editar.id);
        if (error) throw error;
        toast.success("Reembolso atualizado");
      } else {
        payload.created_by = user!.id;
        const { error } = await supabase
          .from("reembolsos_colaborador")
          .insert(payload);
        if (error) throw error;
        toast.success("Reembolso criado");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar reembolso");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editar ? "Editar reembolso" : "Novo reembolso"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Pessoa *</Label>
            <Select value={vinculoId} onValueChange={setVinculoId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {vinculos.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Categoria *</Label>
            <Select value={categoriaId} onValueChange={setCategoriaId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {categorias.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Competência *</Label>
              <Input
                type="date"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="O que foi gasto..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Comprovante</Label>
            <Input
              type="file"
              accept="image/*,application/pdf"
              disabled={semComprovante}
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
            {editar?.comprovante_url && !arquivo && !semComprovante && (
              <p className="text-xs text-muted-foreground">
                Já existe um comprovante anexado. Envie um novo arquivo para substituir.
              </p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="sem_comprovante"
                checked={semComprovante}
                onCheckedChange={(v) => {
                  setSemComprovante(!!v);
                  if (v) setArquivo(null);
                }}
              />
              <Label htmlFor="sem_comprovante" className="cursor-pointer text-sm font-normal">
                Sem comprovante (será marcado no reembolso)
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
