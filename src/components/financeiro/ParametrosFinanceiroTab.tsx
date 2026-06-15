import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CreditCard, FileText, Target, Store, TreePine, Users, Plus, Pencil, Trash2, Loader2, Zap, Landmark,
} from "lucide-react";
import { OFXRegrasPanel } from "@/components/financeiro/OFXRegrasPanel";
import { BancosLiquidacaoPanel } from "@/components/financeiro/BancosLiquidacaoPanel";

type TabelaFin = "formas_pagamento" | "centros_custo" | "canais_venda" | "tipos_contrato";

interface CategoriaConfig {
  value: TabelaFin;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  hasTipo?: boolean;
  hasOrdem?: boolean;
}

const CATEGORIAS: CategoriaConfig[] = [
  {
    value: "formas_pagamento",
    label: "Formas de Pagamento",
    icon: CreditCard,
    description: "PIX, boleto, cartão, transferência e outras formas de pagamento",
    hasTipo: true,
    hasOrdem: true,
  },
  {
    value: "centros_custo",
    label: "Centros de Custo",
    icon: Target,
    description: "Áreas de custo: comercial, administrativo, fábrica, TI, etc.",
  },
  {
    value: "canais_venda",
    label: "Canais de Venda",
    icon: Store,
    description: "Canais de receita: B2B, B2C, marketplace, parceiros",
  },
  {
    value: "tipos_contrato",
    label: "Tipos de Contrato",
    icon: FileText,
    description: "Categorias de contrato: Aluguel, SaaS, Serviço, Licença, Associação, etc.",
  },
];

interface RegistroFin {
  id: string;
  codigo: string;
  nome: string;
  tipo?: string | null;
  ordem?: number | null;
  ativo: boolean | null;
}

function useTabela(tabela: TabelaFin) {
  return useQuery({
    queryKey: ["fin-param", tabela],
    queryFn: async () => {
      const orderField = tabela === "formas_pagamento" ? "ordem" : "nome";
      const { data, error } = await supabase
        .from(tabela)
        .select("*")
        .order(orderField, { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as RegistroFin[];
    },
  });
}

function FormDialog({
  open, onClose, registro, config,
}: {
  open: boolean;
  onClose: () => void;
  registro: RegistroFin | null;
  config: CategoriaConfig;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [codigo, setCodigo] = useState(registro?.codigo || "");
  const [nome, setNome] = useState(registro?.nome || "");
  const [tipo, setTipo] = useState(registro?.tipo || "a_vista");
  const [ordem, setOrdem] = useState<number>(registro?.ordem ?? 0);

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Nome é obrigatório"); return; }
    const codigoFinal = codigo.trim() || nome.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { codigo: codigoFinal, nome: nome.trim() };
      if (config.hasTipo) payload.tipo = tipo;
      if (config.hasOrdem) payload.ordem = ordem;

      if (registro) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from(config.value) as any).update(payload).eq("id", registro.id);
        if (error) throw error;
        toast.success("Atualizado!");
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from(config.value) as any).insert(payload);
        if (error) throw error;
        toast.success("Adicionado!");
      }
      queryClient.invalidateQueries({ queryKey: ["fin-param", config.value] });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{registro ? "Editar" : "Novo"} - {config.label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: PIX" />
          </div>
          <div className="space-y-2">
            <Label>Código</Label>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Auto-gerado se vazio" />
            <p className="text-xs text-muted-foreground">Identificador interno único</p>
          </div>
          {config.hasTipo && (
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a_vista">À vista</SelectItem>
                  <SelectItem value="parcelado">Parcelado</SelectItem>
                  <SelectItem value="recorrente">Recorrente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {config.hasOrdem && (
            <div className="space-y-2">
              <Label>Ordem de exibição</Label>
              <Input type="number" value={ordem} onChange={(e) => setOrdem(Number(e.target.value))} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoriaPanel({ config }: { config: CategoriaConfig }) {
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useTabela(config.value);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RegistroFin | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RegistroFin | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleToggleAtivo = async (r: RegistroFin) => {
    const { error } = await supabase
      .from(config.value)
      .update({ ativo: !r.ativo })
      .eq("id", r.id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    queryClient.invalidateQueries({ queryKey: ["fin-param", config.value] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from(config.value).delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else toast.success("Removido");
    queryClient.invalidateQueries({ queryKey: ["fin-param", config.value] });
    setDeleteTarget(null);
    setDeleting(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg">{config.label}</CardTitle>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !items || items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {items.map((r) => (
              <div key={r.id} className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Switch checked={!!r.ativo} onCheckedChange={() => handleToggleAtivo(r)} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{r.nome}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">{r.codigo}</Badge>
                      {config.hasTipo && r.tipo && (
                        <Badge variant="secondary" className="text-[10px]">
                          {r.tipo === "a_vista" ? "À vista" : r.tipo === "parcelado" ? "Parcelado" : "Recorrente"}
                        </Badge>
                      )}
                      {!r.ativo && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(r); setFormOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {formOpen && (
        <FormDialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          registro={editing}
          config={config}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.nome}" será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function ParametrosFinanceiroTab() {
  return (
    <div className="space-y-4">
      {/* Atalhos */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="p-4 rounded-lg border border-dashed flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Plano de Contas</p>
            <p className="text-xs text-muted-foreground">Estrutura hierárquica de receitas e despesas</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/administrativo/plano-contas" className="gap-2">
              <TreePine className="h-4 w-4" /> Gerenciar
            </Link>
          </Button>
        </div>
        <div className="p-4 rounded-lg border border-dashed flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Parceiros Comerciais</p>
            <p className="text-xs text-muted-foreground">Fornecedores e clientes - cadastro unificado</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/administrativo-fetely/parceiros" className="gap-2">
              <Users className="h-4 w-4" /> Gerenciar
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue={CATEGORIAS[0].value}>
        <TabsList className="flex-wrap h-auto">
          {CATEGORIAS.map((cat) => (
            <TabsTrigger key={cat.value} value={cat.value} className="gap-2">
              <cat.icon className="h-4 w-4" />
              {cat.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="regras_ofx" className="gap-2">
            <Zap className="h-4 w-4" />
            Regras OFX
          </TabsTrigger>
          <TabsTrigger value="bancos_liquidacao" className="gap-2">
            <Landmark className="h-4 w-4" />
            Bancos & Liquidação
          </TabsTrigger>
        </TabsList>
        {CATEGORIAS.map((cat) => (
          <TabsContent key={cat.value} value={cat.value}>
            <CategoriaPanel config={cat} />
          </TabsContent>
        ))}
        <TabsContent value="regras_ofx">
          <OFXRegrasPanel />
        </TabsContent>
        <TabsContent value="bancos_liquidacao">
          <BancosLiquidacaoPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
