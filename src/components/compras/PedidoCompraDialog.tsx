import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Info, Ban } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { ItensList } from "./ItensList";
import { AnexosList } from "./AnexosList";
import { TimelinePedido } from "./TimelinePedido";
import { CancelarPedidoDialog } from "./CancelarPedidoDialog";
import { useDepartamentoUnidadeUsuario } from "@/hooks/compras/useDepartamentoUnidadeUsuario";
import { useCriarPedidoCompra } from "@/hooks/compras/useCriarPedidoCompra";
import { useEnviarPedidoCompra } from "@/hooks/compras/useEnviarPedidoCompra";
import { useAtualizarPedidoCompra } from "@/hooks/compras/useAtualizarPedidoCompra";
import type {
  ItemEdit,
  PedidoCompraAnexoRow,
  PedidoCompraFull,
} from "@/lib/compras/types";

type Mode = "criar" | "editar" | "ver";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: Mode;
  pedido?: PedidoCompraFull | null;
}

export function PedidoCompraDialog({ open, onOpenChange, mode, pedido }: Props) {
  const readOnly = mode === "ver";
  const { data: depUni } = useDepartamentoUnidadeUsuario();
  const criar = useCriarPedidoCompra();
  const enviar = useEnviarPedidoCompra();
  const atualizar = useAtualizarPedidoCompra();

  const [descricaoGeral, setDescricaoGeral] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [centroCustoId, setCentroCustoId] = useState<string>("");
  const [linhaInvId, setLinhaInvId] = useState<string>("");
  const [parceiroId, setParceiroId] = useState<string>("");
  const [itens, setItens] = useState<ItemEdit[]>([]);
  const [anexos, setAnexos] = useState<PedidoCompraAnexoRow[]>([]);
  const [anexosARemover, setAnexosARemover] = useState<{ id: string; storage_path: string }[]>([]);
  const [pedidoIdLocal, setPedidoIdLocal] = useState<string | undefined>(pedido?.id);
  const [submitting, setSubmitting] = useState(false);
  const [cancelarDialogOpen, setCancelarDialogOpen] = useState(false);
  const { user } = useAuth();
  const podeCancelar =
    mode === "ver" &&
    !!pedido &&
    !!user &&
    pedido.solicitante_id === user.id &&
    (pedido.status === "rascunho" || pedido.status === "aberto");

  // Reset / load on open
  useEffect(() => {
    if (!open) return;
    if (mode === "criar") {
      setDescricaoGeral("");
      setJustificativa("");
      setCentroCustoId("");
      setLinhaInvId("");
      setParceiroId("");
      setItens([
        {
          descricao: "",
          quantidade: 1,
          valor_estimado_unitario: 0,
          urls: [],
          especificacao_tecnica: "",
          ordem: 0,
          _action: "create",
        },
      ]);
      setAnexos([]);
      setAnexosARemover([]);
      setPedidoIdLocal(undefined);
    } else if (pedido) {
      setDescricaoGeral(pedido.descricao_geral || "");
      setJustificativa(pedido.justificativa || "");
      setCentroCustoId(pedido.centro_custo_id || "");
      setLinhaInvId(pedido.linha_investimento_id || "");
      setParceiroId(pedido.parceiro_preferencial_id || "");
      setItens(
        [...pedido.pedidos_compra_itens]
          .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
          .map((i) => ({
            id: i.id,
            descricao: i.descricao,
            quantidade: Number(i.quantidade),
            valor_estimado_unitario: Number(i.valor_estimado_unitario),
            urls: i.urls || [],
            especificacao_tecnica: i.especificacao_tecnica || "",
            ordem: i.ordem ?? 0,
            _action: "keep",
            status: i.status as "pendente" | "comprado" | "cancelado" | undefined,
            cancelamento_motivo: i.cancelamento_motivo,
          })),
      );
      setAnexos(pedido.pedidos_compra_anexos || []);
      setAnexosARemover([]);
      setPedidoIdLocal(pedido.id);
    }
  }, [open, mode, pedido]);

  // Lookups
  const { data: centros = [] } = useQuery({
    queryKey: ["compras", "centros-custo"],
    queryFn: async () => {
      const { data } = await supabase
        .from("centros_custo")
        .select("id, codigo, nome")
        .eq("ativo", true)
        .order("codigo");
      return data || [];
    },
  });

  const { data: linhas = [] } = useQuery({
    queryKey: ["compras", "linhas-investimento-com-tema"],
    queryFn: async () => {
      const { data } = await supabase
        .from("linhas_investimento")
        .select(`
          id,
          descricao,
          tema_id,
          ativa,
          temas_investimento:tema_id (id, nome, ordem)
        `)
        .eq("ativa", true);
      return (data || []) as Array<{
        id: string;
        descricao: string;
        tema_id: string;
        ativa: boolean;
        temas_investimento: { id: string; nome: string; ordem: number } | null;
      }>;
    },
  });

  const linhasAgrupadas = useMemo(() => {
    const grupos = new Map<string, { tema_nome: string; tema_ordem: number; linhas: typeof linhas }>();
    for (const l of linhas) {
      const temaId = l.temas_investimento?.id || "_sem_tema";
      const temaNome = l.temas_investimento?.nome || "Sem tema";
      const temaOrdem = l.temas_investimento?.ordem ?? 9999;
      if (!grupos.has(temaId)) {
        grupos.set(temaId, { tema_nome: temaNome, tema_ordem: temaOrdem, linhas: [] });
      }
      grupos.get(temaId)!.linhas.push(l);
    }
    return Array.from(grupos.entries())
      .sort((a, b) => a[1].tema_ordem - b[1].tema_ordem)
      .map(([temaId, g]) => ({
        tema_id: temaId,
        tema_nome: g.tema_nome,
        linhas: [...g.linhas].sort((a, b) => a.descricao.localeCompare(b.descricao)),
      }));
  }, [linhas]);

  const { data: parceiros = [] } = useQuery({
    queryKey: ["compras", "parceiros"],
    queryFn: async () => {
      const { data } = await supabase
        .from("parceiros_comerciais")
        .select("id, nome_fantasia, razao_social")
        .eq("ativo", true)
        .order("razao_social");
      return data || [];
    },
  });

  const validarParaEnvio = (): string | null => {
    if (!descricaoGeral.trim()) return "Descrição geral é obrigatória";
    if (!justificativa.trim()) return "Justificativa é obrigatória";
    if (!centroCustoId) return "Centro de custo é obrigatório";
    const ativos = itens.filter((i) => i._action !== "delete");
    if (ativos.length === 0) return "Pedido precisa ter pelo menos 1 item";
    const invalidos = ativos.filter(
      (i) => !i.descricao.trim() || !(i.quantidade > 0) || !(i.valor_estimado_unitario > 0),
    );
    if (invalidos.length) return `${invalidos.length} item(s) com dados inválidos`;
    return null;
  };

  const cabecalho = useMemo(
    () => ({
      descricao_geral: descricaoGeral || null,
      justificativa: justificativa || null,
      centro_custo_id: centroCustoId || null,
      linha_investimento_id: linhaInvId || null,
      parceiro_preferencial_id: parceiroId || null,
    }),
    [descricaoGeral, justificativa, centroCustoId, linhaInvId, parceiroId],
  );

  const handleSalvar = async (enviar_apos: boolean) => {
    if (enviar_apos) {
      const err = validarParaEnvio();
      if (err) {
        toast.error(err);
        return;
      }
    }
    setSubmitting(true);
    try {
      let pid = pedidoIdLocal;

      if (mode === "criar") {
        const ativos = itens.filter((i) => i._action !== "delete");
        const res = await criar.mutateAsync({
          ...cabecalho,
          itens: ativos.map((i) => ({
            descricao: i.descricao,
            quantidade: i.quantidade,
            valor_estimado_unitario: i.valor_estimado_unitario,
            urls: i.urls,
            especificacao_tecnica: i.especificacao_tecnica || undefined,
          })),
        });
        pid = res.pedido_id;
        setPedidoIdLocal(pid);
        if (!enviar_apos) toast.success("Rascunho salvo");
      } else if (mode === "editar" && pedidoIdLocal) {
        await atualizar.mutateAsync({
          pedido_id: pedidoIdLocal,
          cabecalho,
          itens,
          anexos_a_remover: anexosARemover,
        });
        if (!enviar_apos) toast.success("Pedido atualizado");
      }

      if (enviar_apos && pid) {
        await enviar.mutateAsync(pid);
      }
      onOpenChange(false);
    } catch {
      // erros já mostrados via toast nos hooks
    } finally {
      setSubmitting(false);
    }
  };

  const podeEditar = mode !== "ver";

  const detalhesContent = (
    <>
      {/* SEÇÃO 1: CABEÇALHO */}
      <div className="space-y-3">
        <div>
          <Label>Descrição geral *</Label>
          <Textarea
            value={descricaoGeral}
            onChange={(e) => setDescricaoGeral(e.target.value)}
            placeholder="O que você precisa? Resumo em 1-2 linhas"
            disabled={!podeEditar}
            rows={2}
          />
        </div>
        <div>
          <Label>Justificativa *</Label>
          <Textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Por que essa compra? Contexto pro Comprador"
            disabled={!podeEditar}
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Centro de custo *</Label>
            <Select value={centroCustoId} onValueChange={setCentroCustoId} disabled={!podeEditar}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {centros.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Linha de investimento (opcional)</Label>
            <Select
              value={linhaInvId || "none"}
              onValueChange={(v) => setLinhaInvId(v === "none" ? "" : v)}
              disabled={!podeEditar}
            >
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent className="max-h-[400px]">
                <SelectItem value="none">—</SelectItem>
                {linhasAgrupadas.map((grupo) => (
                  <SelectGroup key={grupo.tema_id}>
                    <SelectLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                      {grupo.tema_nome}
                    </SelectLabel>
                    {grupo.linhas.map((l) => (
                      <SelectItem key={l.id} value={l.id} className="pl-6">{l.descricao}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Fornecedor preferencial (opcional)</Label>
          <Select
            value={parceiroId || "none"}
            onValueChange={(v) => setParceiroId(v === "none" ? "" : v)}
            disabled={!podeEditar}
          >
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {parceiros.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nome_fantasia || p.razao_social}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Card className="p-3 bg-muted/30 flex items-start gap-2">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Departamento:</span>{" "}
            {depUni?.departamento?.nome || "—"}
            <span className="mx-2">·</span>
            <span className="font-medium">Unidade:</span> {depUni?.unidade?.nome || "—"}
            <div className="mt-0.5 italic">Herdado automaticamente do seu cadastro.</div>
          </div>
        </Card>
      </div>
      <ItensList items={itens} onChange={setItens} readOnly={readOnly} showItemStatus={mode === "ver"} />
      <AnexosList
        pedidoId={pedidoIdLocal}
        anexos={anexos}
        onChange={setAnexos}
        readOnly={readOnly}
        onRemoverPendente={
          mode === "editar"
            ? (a) => setAnexosARemover((prev) => [...prev, { id: a.id, storage_path: a.storage_path }])
            : undefined
        }
      />
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "criar" && "Novo pedido de compra"}
            {mode === "editar" && "Editar pedido de compra"}
            {mode === "ver" && "Pedido de compra"}
          </DialogTitle>
          <DialogDescription>
            Descreva o que você precisa, justifique a aquisição e adicione itens.
          </DialogDescription>
        </DialogHeader>

        {mode === "ver" && pedido ? (
          <Tabs defaultValue="detalhes" className="w-full">
            <TabsList>
              <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
              <TabsTrigger value="timeline">Timeline e Comentários</TabsTrigger>
            </TabsList>
            <TabsContent value="detalhes" className="space-y-6 mt-4">
              {detalhesContent}
            </TabsContent>
            <TabsContent value="timeline" className="mt-4">
              <TimelinePedido pedidoId={pedido.id} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-6">{detalhesContent}</div>
        )}

        <DialogFooter>
          {mode === "ver" ? (
            <div className="flex w-full justify-between gap-2">
              <div>
                {podeCancelar && (
                  <Button
                    variant="outline"
                    className="text-destructive border-destructive/40 hover:bg-destructive/10"
                    onClick={() => setCancelarDialogOpen(true)}
                  >
                    <Ban className="h-4 w-4 mr-1" />
                    Cancelar pedido
                  </Button>
                )}
              </div>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button variant="outline" onClick={() => handleSalvar(false)} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {mode === "criar" ? "Salvar rascunho" : "Salvar"}
              </Button>
              <Button
                onClick={() => handleSalvar(true)}
                disabled={submitting}
                style={{ backgroundColor: "#1A4A3A", color: "white" }}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Salvar e Enviar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
      {pedido && (
        <CancelarPedidoDialog
          open={cancelarDialogOpen}
          onOpenChange={setCancelarDialogOpen}
          pedidoId={pedido.id}
          onCancelado={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}
