import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Filter, Loader2, Plus, Play, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Conta = { id: string; nome_exibicao: string };
type Regra = {
  id: string;
  ordem: number;
  ativo: boolean;
  conta_bancaria_id: string | null;
  campo_alvo: string;
  operador: string;
  padrao: string;
  classe_destino: string;
  tipo_meio_destino: string | null;
  descricao_regra: string | null;
};

const CAMPOS = ["descricao", "contraparte_nome", "contraparte_documento", "referencia_pedido"];
const OPERADORES = ["contains", "equals", "starts_with", "regex"];
const CLASSES = [
  "tarifa_bancaria", "rendimento", "imposto", "transferencia_interna",
  "ajuste_adquirencia", "recebivel_titulo", "recebivel_cartao",
  "despesa_cpr", "outro_classificado",
];
const MEIOS = ["pix", "ted", "tarifa", "rendimento", "imposto", "boleto", "outro"];

const VAZIO: Partial<Regra> = {
  ordem: 100,
  ativo: true,
  conta_bancaria_id: null,
  campo_alvo: "descricao",
  operador: "contains",
  padrao: "",
  classe_destino: "outro_classificado",
  tipo_meio_destino: null,
  descricao_regra: "",
};

export default function RegrasInbox() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Partial<Regra> | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const { data: contas = [] } = useQuery({
    queryKey: ["regras-inbox-contas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao")
        .eq("ativo", true)
        .order("nome_exibicao");
      if (error) throw error;
      return (data || []) as Conta[];
    },
  });

  const { data: regras = [], isLoading } = useQuery({
    queryKey: ["regras-classificacao-extrato"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("regras_classificacao_extrato")
        .select("*")
        .order("ordem", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as Regra[];
    },
  });

  async function salvar() {
    if (!editando) return;
    const r = editando;
    if (!r.padrao?.trim()) {
      toast.error("Padrão é obrigatório");
      return;
    }
    setSalvando(true);
    try {
      const payload = {
        ordem: r.ordem ?? 100,
        ativo: r.ativo ?? true,
        conta_bancaria_id: r.conta_bancaria_id || null,
        campo_alvo: r.campo_alvo,
        operador: r.operador,
        padrao: r.padrao.trim(),
        classe_destino: r.classe_destino,
        tipo_meio_destino: r.tipo_meio_destino || null,
        descricao_regra: r.descricao_regra?.trim() || null,
      };
      const { error } = r.id
        ? await sb.from("regras_classificacao_extrato").update(payload).eq("id", r.id)
        : await sb.from("regras_classificacao_extrato").insert(payload);
      if (error) throw error;
      toast.success(r.id ? "Regra atualizada" : "Regra criada");
      setEditando(null);
      qc.invalidateQueries({ queryKey: ["regras-classificacao-extrato"] });
    } catch (e) {
      toast.error("Falha: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvando(false);
    }
  }

  async function toggleAtivo(r: Regra) {
    const { error } = await sb
      .from("regras_classificacao_extrato")
      .update({ ativo: !r.ativo })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["regras-classificacao-extrato"] });
  }

  async function apagar(r: Regra) {
    if (!confirm(`Apagar regra "${r.padrao}"?`)) return;
    const { error } = await sb.from("regras_classificacao_extrato").delete().eq("id", r.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Regra apagada");
      qc.invalidateQueries({ queryKey: ["regras-classificacao-extrato"] });
    }
  }

  async function aplicarRegras() {
    setAplicando(true);
    try {
      const { data, error } = await sb.rpc("fn_regras_aplicar");
      if (error) throw error;
      const n = typeof data === "number" ? data : (data ?? 0);
      toast.success(`${n} movimentações classificadas`);
      qc.invalidateQueries({ queryKey: ["extrato-inbox"] });
    } catch (e) {
      toast.error("Falha: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Filter className="h-6 w-6 text-admin" />
            Regras Automáticas — Extrato
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Padrões aplicados sobre movimentações abertas para classificação automática.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={aplicarRegras}
            disabled={aplicando}
            className="gap-2"
          >
            {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Aplicar regras agora
          </Button>
          <Button
            onClick={() => setEditando({ ...VAZIO })}
            className="bg-admin hover:bg-admin/90 text-admin-foreground gap-2"
          >
            <Plus className="h-4 w-4" />
            Nova regra
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Ordem</TableHead>
                <TableHead className="w-16">Ativo</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Quando</TableHead>
                <TableHead>Padrão</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Meio</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={9} className="text-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin inline" />
                </TableCell></TableRow>
              )}
              {!isLoading && regras.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                  Nenhuma regra ainda
                </TableCell></TableRow>
              )}
              {regras.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.ordem}</TableCell>
                  <TableCell>
                    <Switch checked={r.ativo} onCheckedChange={() => toggleAtivo(r)} />
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.conta_bancaria_id
                      ? contas.find((c) => c.id === r.conta_bancaria_id)?.nome_exibicao || "?"
                      : <span className="text-muted-foreground">Todas</span>}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    <Badge variant="outline" className="mr-1">{r.campo_alvo}</Badge>
                    <span className="text-muted-foreground">{r.operador}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[220px] truncate" title={r.padrao}>
                    {r.padrao}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-admin text-admin-foreground">{r.classe_destino}</Badge>
                  </TableCell>
                  <TableCell>
                    {r.tipo_meio_destino ? <Badge variant="outline">{r.tipo_meio_destino}</Badge> : "—"}
                  </TableCell>
                  <TableCell className="text-xs max-w-[220px] truncate" title={r.descricao_regra || ""}>
                    {r.descricao_regra || "—"}
                  </TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditando(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => apagar(r)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar regra" : "Nova regra"}</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={editando.ordem ?? 100}
                  onChange={(e) => setEditando({ ...editando, ordem: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label>Ativo</Label>
                  <div className="pt-2">
                    <Switch
                      checked={editando.ativo ?? true}
                      onCheckedChange={(v) => setEditando({ ...editando, ativo: v })}
                    />
                  </div>
                </div>
              </div>
              <div className="col-span-2">
                <Label>Conta (opcional — vazio = todas)</Label>
                <Select
                  value={editando.conta_bancaria_id || "todas"}
                  onValueChange={(v) => setEditando({ ...editando, conta_bancaria_id: v === "todas" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_exibicao}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Campo</Label>
                <Select
                  value={editando.campo_alvo}
                  onValueChange={(v) => setEditando({ ...editando, campo_alvo: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CAMPOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Operador</Label>
                <Select
                  value={editando.operador}
                  onValueChange={(v) => setEditando({ ...editando, operador: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPERADORES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Padrão</Label>
                <Input
                  value={editando.padrao || ""}
                  onChange={(e) => setEditando({ ...editando, padrao: e.target.value })}
                  placeholder="ex.: TARIFA, PIX QR, 12.345.678/0001-90"
                />
              </div>
              <div>
                <Label>Classe destino</Label>
                <Select
                  value={editando.classe_destino}
                  onValueChange={(v) => setEditando({ ...editando, classe_destino: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Meio (opcional)</Label>
                <Select
                  value={editando.tipo_meio_destino || "nenhum"}
                  onValueChange={(v) => setEditando({ ...editando, tipo_meio_destino: v === "nenhum" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">—</SelectItem>
                    {MEIOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Descrição (nota interna)</Label>
                <Input
                  value={editando.descricao_regra || ""}
                  onChange={(e) => setEditando({ ...editando, descricao_regra: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)} disabled={salvando}>Cancelar</Button>
            <Button
              onClick={salvar}
              disabled={salvando}
              className="bg-admin hover:bg-admin/90 text-admin-foreground"
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
