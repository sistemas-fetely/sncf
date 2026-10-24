import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Flag } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface ContextoProblema {
  pedidoRef?: string | null;
  descricao?: string;
  cadeiraId?: string | null;
  entidadeTipo?: string | null;
  entidadeRef?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contexto?: ContextoProblema;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const hojeIso = () => new Date().toLocaleDateString("sv-SE");

export function DialogoAbrirProblema({ open, onOpenChange, contexto }: Props) {
  const navigate = useNavigate();
  const [descricao, setDescricao] = useState("");
  const [busca, setBusca] = useState("");
  const [atribuido, setAtribuido] = useState("");
  const [cadeira, setCadeira] = useState("");
  const [assunto, setAssunto] = useState("");
  const [impacto, setImpacto] = useState("2");
  const [dataAlvo, setDataAlvo] = useState("");

  const pessoas = useQuery({
    queryKey: ["problema-profiles"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await sb.from("profiles").select("user_id, full_name").not("full_name", "is", null).order("full_name");
      if (error) throw error;
      return (data ?? []) as { user_id: string; full_name: string }[];
    },
  });
  const deps = useQuery({
    queryKey: ["problema-departamentos"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await sb.from("departamentos").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
  const assuntos = useQuery({
    queryKey: ["problema-assuntos"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await sb.from("demanda_assunto").select("codigo, nome, cadeira_id").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as { codigo: string; nome: string; cadeira_id: string }[];
    },
  });
  const sugestao = useQuery({
    queryKey: ["problema-data-alvo-sugerida", hojeIso()],
    enabled: open,
    queryFn: async () => {
      const { data: regra, error } = await sb.from("chamado_regra_prazo").select("dias_uteis").eq("chave", "problema_data_alvo_padrao").maybeSingle();
      if (error) throw error;
      const { data, error: e2 } = await sb.rpc("fn_add_dias_uteis", { p_data: hojeIso(), p_dias: regra?.dias_uteis ?? 10 });
      if (e2) throw e2;
      return String(data).slice(0, 10);
    },
  });

  useEffect(() => {
    if (!open) return;
    setDescricao(contexto?.descricao ?? "");
    setCadeira(contexto?.cadeiraId ?? "");
    setAssunto("");
    setAtribuido("");
    setBusca("");
    setImpacto("2");
    setDataAlvo("");
  }, [open, contexto?.descricao, contexto?.cadeiraId]);

  useEffect(() => {
    if (open && sugestao.data && !dataAlvo) setDataAlvo(sugestao.data);
  }, [open, sugestao.data, dataAlvo]);

  const assuntoSel = assuntos.data?.find((a) => a.codigo === assunto);
  useEffect(() => {
    if (assuntoSel) setCadeira(assuntoSel.cadeira_id);
  }, [assuntoSel]);

  const pessoasFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const l = pessoas.data ?? [];
    const f = t ? l.filter((p) => p.full_name.toLowerCase().includes(t)) : l;
    const sel = l.find((p) => p.user_id === atribuido);
    return sel && !f.includes(sel) ? [sel, ...f] : f;
  }, [pessoas.data, busca, atribuido]);

  const abrir = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("abrir_problema", {
        p_descricao: descricao.trim(),
        p_atribuido_a: atribuido || null,
        p_data_alvo: dataAlvo || null,
        p_assunto_codigo: assunto || null,
        p_cadeira_id: assunto ? null : cadeira || null,
        p_pedido_ref: contexto?.pedidoRef ?? null,
        p_entidade_tipo: contexto?.entidadeTipo ?? null,
        p_entidade_ref: contexto?.entidadeRef ?? null,
        p_impacto: Number(impacto),
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro ?? "Não foi possível abrir o problema");
      return data as { chamado_id: string; numero: string };
    },
    onSuccess: (r) => {
      const nome = pessoas.data?.find((p) => p.user_id === atribuido)?.full_name ?? "";
      toast.success(`Problema ${r.numero} aberto para ${nome}`, {
        action: { label: "Ver chamado", onClick: () => navigate(`/chamados/${r.chamado_id}`) },
      });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Abrir problema</DialogTitle>
          <DialogDescription>Importante, não urgente. Fica com um responsável e uma data-alvo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {contexto?.pedidoRef && <p className="text-xs text-muted-foreground">Pedido: {contexto.pedidoRef}</p>}
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Textarea rows={4} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            <p className="text-xs text-muted-foreground">Mínimo de 20 caracteres.</p>
          </div>
          <div className="space-y-1">
            <Label>Responsável</Label>
            <Input className="h-8" placeholder="Buscar pessoa…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <Select value={atribuido} onValueChange={setAtribuido}>
              <SelectTrigger><SelectValue placeholder="Escolha o responsável" /></SelectTrigger>
              <SelectContent>
                {pessoasFiltradas.slice(0, 100).map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Assunto (opcional)</Label>
              <Select value={assunto || "_"} onValueChange={(v) => setAssunto(v === "_" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_">Sem assunto</SelectItem>
                  {(assuntos.data ?? []).map((a) => (
                    <SelectItem key={a.codigo} value={a.codigo}>{a.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Área</Label>
              <Select value={cadeira} onValueChange={setCadeira} disabled={!!assunto}>
                <SelectTrigger><SelectValue placeholder="Escolha a área" /></SelectTrigger>
                <SelectContent>
                  {(deps.data ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Impacto</Label>
              <Select value={impacto} onValueChange={setImpacto}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Baixo</SelectItem>
                  <SelectItem value="2">Médio</SelectItem>
                  <SelectItem value="3">Alto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Data-alvo</Label>
              <Input type="date" value={dataAlvo} onChange={(e) => setDataAlvo(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={abrir.isPending} onClick={() => abrir.mutate()}>Abrir problema</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Botão + diálogo, para cabeçalhos de detalhe (ex.: pedido). */
export function BotaoAbrirProblema({ contexto, className }: { contexto?: ContextoProblema; className?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className={className ?? "w-full gap-1.5"} onClick={() => setAberto(true)}>
        <Flag className="h-3.5 w-3.5" />
        Abrir problema
      </Button>
      <DialogoAbrirProblema open={aberto} onOpenChange={setAberto} contexto={contexto} />
    </>
  );
}
