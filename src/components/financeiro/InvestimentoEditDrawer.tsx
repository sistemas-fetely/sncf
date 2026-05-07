import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type EditMode = "frente" | "tema" | "linha" | null;

interface Props {
  mode: EditMode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entidade: any | null;
  parentId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function InvestimentoEditDrawer({
  mode,
  entidade,
  parentId,
  onClose,
  onSaved,
}: Props) {
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const [confirmDesativarOpen, setConfirmDesativarOpen] = useState(false);

  // Frente / Tema fields
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ordem, setOrdem] = useState(0);
  const [ativa, setAtiva] = useState(true);
  const [frenteId, setFrenteId] = useState<string>("");
  const [temaId, setTemaId] = useState<string>("");

  // Linha fields
  const [valorInicial, setValorInicial] = useState<string>("0");
  const [valorFechado, setValorFechado] = useState<string>("");
  const [dataPrevista, setDataPrevista] = useState<string>("");
  const [observacao, setObservacao] = useState<string>("");

  const isEdit = !!entidade;

  useEffect(() => {
    if (!mode) return;
    if (mode === "frente") {
      setNome(entidade?.nome || "");
      setDescricao(entidade?.descricao || "");
      setOrdem(entidade?.ordem ?? 0);
      setAtiva(entidade?.ativa ?? true);
    } else if (mode === "tema") {
      setNome(entidade?.nome || "");
      setDescricao(entidade?.descricao || "");
      setOrdem(entidade?.ordem ?? 0);
      setAtiva(entidade?.ativa ?? true);
      setFrenteId(entidade?.frente_id || parentId || "");
    } else if (mode === "linha") {
      setDescricao(entidade?.descricao || "");
      setValorInicial(entidade?.valor_inicial != null ? String(entidade.valor_inicial) : "0");
      setValorFechado(entidade?.valor_fechado != null ? String(entidade.valor_fechado) : "");
      setDataPrevista(entidade?.data_prevista_pagamento || "");
      setObservacao(entidade?.observacao || "");
      setAtiva(entidade?.ativa ?? true);
      setTemaId(entidade?.tema_id || parentId || "");
    }
  }, [mode, entidade, parentId]);

  // Frentes pra select de tema
  const { data: frentes = [] } = useQuery({
    queryKey: ["frentes-investimento-lista"],
    enabled: mode === "tema",
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("frentes_investimento")
        .select("id, nome, ativa")
        .eq("ativa", true)
        .order("ordem");
      if (error) throw error;
      return data || [];
    },
  });

  // Temas pra select de linha (mostra "Frente > Tema")
  const { data: temas = [] } = useQuery({
    queryKey: ["temas-investimento-lista-com-frente"],
    enabled: mode === "linha",
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: ts, error } = await sb
        .from("temas_investimento")
        .select("id, nome, frente_id, ativa")
        .eq("ativa", true)
        .order("ordem");
      if (error) throw error;
      const frenteIds = Array.from(new Set((ts || []).map((t: any) => t.frente_id)));
      const { data: fs } = await sb
        .from("frentes_investimento")
        .select("id, nome")
        .in("id", frenteIds.length ? frenteIds : ["00000000-0000-0000-0000-000000000000"]);
      const fMap = new Map((fs || []).map((f: any) => [f.id, f.nome]));
      return (ts || []).map((t: any) => ({
        id: t.id,
        label: `${fMap.get(t.frente_id) || "—"} > ${t.nome}`,
      }));
    },
  });

  function close() {
    onClose();
  }

  async function checkBlockDeactivation(): Promise<string | null> {
    if (!isEdit) return null;
    const wasActive = entidade?.ativa ?? true;
    if (!wasActive || ativa) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    if (mode === "frente") {
      const { count } = await sb
        .from("temas_investimento")
        .select("id", { count: "exact", head: true })
        .eq("frente_id", entidade.id)
        .eq("ativa", true);
      if ((count || 0) > 0) {
        return `Não é possível desativar. Existem ${count} temas ativos vinculados. Desative-os primeiro.`;
      }
    } else if (mode === "tema") {
      const { count } = await sb
        .from("linhas_investimento")
        .select("id", { count: "exact", head: true })
        .eq("tema_id", entidade.id)
        .eq("ativa", true);
      if ((count || 0) > 0) {
        return `Não é possível desativar. Existem ${count} linhas ativas. Desative-as primeiro.`;
      }
    } else if (mode === "linha") {
      const { count } = await sb
        .from("contas_pagar_receber")
        .select("id", { count: "exact", head: true })
        .eq("linha_investimento_id", entidade.id)
        .neq("status", "cancelado");
      if ((count || 0) > 0) {
        return `Existem ${count} CPRs ativos vinculados a esta linha. Cancele ou desvincule antes de desativar.`;
      }
    }
    return null;
  }

  async function handleSave() {
    if (!mode) return;
    if ((mode === "frente" || mode === "tema") && nome.trim().length < 2) {
      toast.error("Nome deve ter ao menos 2 caracteres.");
      return;
    }
    if (mode === "linha" && descricao.trim().length < 2) {
      toast.error("Descrição obrigatória.");
      return;
    }
    if (mode === "tema" && !frenteId) {
      toast.error("Selecione uma frente.");
      return;
    }
    if (mode === "linha" && !temaId) {
      toast.error("Selecione um tema.");
      return;
    }

    const blocker = await checkBlockDeactivation();
    if (blocker) {
      toast.error(blocker);
      return;
    }

    // Se está desativando um item que estava ativo: pede confirmação
    const wasActive = entidade?.ativa ?? true;
    if (isEdit && wasActive && !ativa) {
      setConfirmDesativarOpen(true);
      return;
    }

    await executarSave();
  }

  async function executarSave() {
    setSalvando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      if (mode === "frente") {
        const payload: any = { nome: nome.trim(), descricao: descricao || null, ordem, ativa };
        if (!isEdit) {
          // codigo: simples slug do nome
          payload.codigo = nome.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
        }
        const q = isEdit
          ? sb.from("frentes_investimento").update(payload).eq("id", entidade.id)
          : sb.from("frentes_investimento").insert(payload);
        const { error } = await q;
        if (error) throw error;
      } else if (mode === "tema") {
        const payload: any = {
          nome: nome.trim(),
          descricao: descricao || null,
          ordem,
          ativa,
          frente_id: frenteId,
        };
        if (!isEdit) {
          payload.codigo = nome.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
        }
        const q = isEdit
          ? sb.from("temas_investimento").update(payload).eq("id", entidade.id)
          : sb.from("temas_investimento").insert(payload);
        const { error } = await q;
        if (error) throw error;
      } else if (mode === "linha") {
        const vi = parseFloat(valorInicial.replace(",", ".")) || 0;
        const vfStr = valorFechado.trim();
        const vf = vfStr === "" ? null : parseFloat(vfStr.replace(",", ".")) || 0;
        const payload: any = {
          tema_id: temaId,
          descricao: descricao.trim(),
          valor_inicial: vi,
          valor_fechado: vf,
          data_prevista_pagamento: dataPrevista || null,
          observacao: observacao || null,
          ativa,
        };
        if (!isEdit) {
          const { data: u } = await supabase.auth.getUser();
          payload.created_by = u?.user?.id || null;
        }
        const q = isEdit
          ? sb.from("linhas_investimento").update(payload).eq("id", entidade.id)
          : sb.from("linhas_investimento").insert(payload);
        const { error } = await q;
        if (error) throw error;
      }

      toast.success("Salvo");
      qc.invalidateQueries({ queryKey: ["frentes-investimento-kpis"] });
      qc.invalidateQueries({ queryKey: ["temas-investimento-kpis"] });
      qc.invalidateQueries({ queryKey: ["linhas-investimento-kpis"] });
      qc.invalidateQueries({ queryKey: ["linhas-investimento-combobox"] });
      onSaved();
    } catch (e: any) {
      const msg =
        e?.message ||
        e?.error_description ||
        e?.details ||
        e?.hint ||
        (typeof e === "string" ? e : JSON.stringify(e));
      console.error("[InvestimentoEditDrawer] erro ao salvar:", e);
      toast.error("Erro: " + msg);
    } finally {
      setSalvando(false);
    }
  }

  const titulo =
    mode === "frente"
      ? isEdit ? "Editar Frente" : "Nova Frente"
      : mode === "tema"
        ? isEdit ? "Editar Tema" : "Novo Tema"
        : mode === "linha"
          ? isEdit ? "Editar Linha" : "Nova Linha"
          : "";

  return (
    <>
    <Sheet open={!!mode} onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{titulo}</SheetTitle>
          <SheetDescription>
            {mode === "linha"
              ? "Item de orçamento dentro de um tema."
              : mode === "tema"
                ? "Agrupamento de linhas dentro de uma frente."
                : "Frente macro de investimento."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {mode === "tema" && (
            <div className="space-y-1">
              <Label>Frente *</Label>
              <Select value={frenteId} onValueChange={setFrenteId} disabled={isEdit}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {frentes.map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "linha" && (
            <div className="space-y-1">
              <Label>Tema *</Label>
              <Select value={temaId} onValueChange={setTemaId} disabled={isEdit}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {temas.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(mode === "frente" || mode === "tema") && (
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
          )}

          {mode === "linha" && (
            <div className="space-y-1">
              <Label>Descrição *</Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={2}
              />
            </div>
          )}

          {(mode === "frente" || mode === "tema") && (
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={2}
              />
            </div>
          )}

          {mode === "linha" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Valor Inicial (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={valorInicial}
                    onChange={(e) => setValorInicial(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Valor Fechado (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={valorFechado}
                    onChange={(e) => setValorFechado(e.target.value)}
                    placeholder="Vazio = ainda sem cotação"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Data Prevista de Pagamento</Label>
                <Input
                  type="date"
                  value={dataPrevista}
                  onChange={(e) => setDataPrevista(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Observação</Label>
                <Textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={2}
                />
              </div>
            </>
          )}

          {(mode === "frente" || mode === "tema") && (
            <div className="space-y-1">
              <Label>Ordem</Label>
              <Input
                type="number"
                value={ordem}
                onChange={(e) => setOrdem(parseInt(e.target.value) || 0)}
              />
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Ativa</Label>
              <p className="text-[11px] text-muted-foreground">
                Inativa não aparece em listas/comboboxes.
              </p>
            </div>
            <Switch checked={ativa} onCheckedChange={setAtiva} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={close} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={salvando} className="gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </SheetContent>
    </Sheet>

    <AlertDialog open={confirmDesativarOpen} onOpenChange={setConfirmDesativarOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar desativação</AlertDialogTitle>
          <AlertDialogDescription>
            {mode === "frente" && "Esta frente ficará oculta em listas e comboboxes."}
            {mode === "tema" && "Este tema ficará oculto em listas e comboboxes."}
            {mode === "linha" && "Esta linha não aparecerá mais em comboboxes de novas despesas."}
            {" "}Deseja continuar?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90"
            onClick={async () => {
              setConfirmDesativarOpen(false);
              await executarSave();
            }}
          >
            Desativar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
