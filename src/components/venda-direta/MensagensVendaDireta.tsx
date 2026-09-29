import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const CHAVES_MSG = [
  { k: "pagamento_confirmado", label: "Pagamento confirmado" },
  { k: "pronto_retirada", label: "Pronto para retirada" },
  { k: "saiu_correios", label: "Saiu pelos Correios" },
  { k: "saiu_fetely", label: "Saiu com o frete Fetely" },
  { k: "entregue", label: "Entregue" },
  { k: "cobrar_pagamento", label: "Cobrar pagamento" },
] as const;
export type ChaveMsg = (typeof CHAVES_MSG)[number]["k"];

const PLACEHOLDERS = "{nome} {pedido} {total} {rastreio} {link_rastreio} {servico} {endereco_retirada} {horario_retirada} {link_pagamento}";

export interface ParametrosVD {
  alerta_sem_pagamento_horas: number | null;
  retirada_endereco: string | null;
  retirada_horario: string | null;
  mensagens: Partial<Record<ChaveMsg, string>> | null;
}

export const QK_VD_PARAM = ["venda-direta-parametro"] as const;

export function useParametrosVD() {
  return useQuery({
    queryKey: QK_VD_PARAM,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ParametrosVD> => {
      const { data, error } = await (supabase as any)
        .from("venda_direta_parametro")
        .select("alerta_sem_pagamento_horas, retirada_endereco, retirada_horario, mensagens")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Parâmetros da Venda Direta não encontrados (venda_direta_parametro id=1).");
      return data as ParametrosVD;
    },
  });
}

export interface LinhaAviso {
  id: string;
  id_externo: string | null;
  valor_liquido: number | null;
  cliente_nome: string | null;
  cliente_telefone?: string | null;
  situacao: string;
  modal: string | null;
  pagamento: "pix" | "cartao" | null;
  link_pagamento?: string | null;
  codigo_rastreio?: string | null;
  rastreio_servico?: string | null;
}

export function chaveDaLinha(l: LinhaAviso): ChaveMsg | null {
  switch (l.situacao) {
    case "descendo_bling": case "aguardando_nf": case "separacao": return "pagamento_confirmado";
    case "pronto_retirada": return "pronto_retirada";
    case "entregue": return "entregue";
    case "aguardando_pagamento": return "cobrar_pagamento";
    case "em_transporte":
      if (l.modal === "frete_fetely") return "saiu_fetely";
      if (l.modal === "sedex" || l.modal === "pac" || l.modal === "entrega") return "saiu_correios";
      return null;
    default: return null;
  }
}

function servicoDe(l: LinhaAviso) {
  if (l.rastreio_servico) return l.rastreio_servico;
  return l.modal === "sedex" ? "SEDEX" : "PAC";
}

export function montarMensagem(tpl: string, l: LinhaAviso, p: ParametrosVD, linkPagamento: string | null) {
  const primeiro = (l.cliente_nome ?? "").trim().split(/\s+/)[0] ?? "";
  const vals: Record<string, string> = {
    nome: primeiro,
    pedido: l.id_externo ?? "",
    total: formatBRL(l.valor_liquido ?? 0),
    rastreio: l.codigo_rastreio ?? "",
    link_rastreio: l.codigo_rastreio ? `https://rastreamento.correios.com.br/app/index.php?objeto=${l.codigo_rastreio}` : "",
    servico: servicoDe(l),
    endereco_retirada: p.retirada_endereco ?? "",
    horario_retirada: p.retirada_horario ?? "",
    link_pagamento: linkPagamento ?? "",
  };
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));
}

async function linkPagamentoDe(l: LinhaAviso): Promise<string | null> {
  if (l.pagamento === "pix") return l.link_pagamento ?? null;
  if (l.pagamento === "cartao") {
    const { data, error } = await (supabase as any)
      .from("pagamento_link")
      .select("url")
      .eq("pedido_id", l.id)
      .eq("status", "aberto")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.url ?? null;
  }
  return null;
}

export function abrirWhatsApp(telefone: string | null | undefined, texto: string) {
  const tel = (telefone ?? "").replace(/\D/g, "");
  if (tel.length < 10) throw new Error("Cliente sem telefone válido.");
  window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
}

export function AvisarClienteButton({ linha, chave, label = "Avisar cliente" }: { linha: LinhaAviso; chave?: ChaveMsg; label?: string }) {
  const qp = useParametrosVD();
  const [enviando, setEnviando] = useState(false);
  const k = chave ?? chaveDaLinha(linha);
  if (!k) return null;
  const semRastreio = k === "saiu_correios" && !linha.codigo_rastreio;

  const clicar = async () => {
    try {
      setEnviando(true);
      const p = qp.data;
      if (!p) throw new Error(qp.error ? rawMessage(qp.error) : "Parâmetros da Venda Direta ainda carregando.");
      if (k === "pronto_retirada" && !(p.retirada_endereco ?? "").trim()) {
        toast.warning("Configure o endereço de retirada");
        return;
      }
      const tpl = p.mensagens?.[k];
      if (!tpl?.trim()) throw new Error(`Mensagem "${k}" não configurada.`);
      const link = k === "cobrar_pagamento" ? await linkPagamentoDe(linha) : null;
      abrirWhatsApp(linha.cliente_telefone, montarMensagem(tpl, linha, p, link));
    } catch (e) {
      toast.error(rawMessage(e));
    } finally {
      setEnviando(false);
    }
  };

  const botao = (
    <Button size="sm" variant="outline" disabled={semRastreio || enviando} onClick={clicar}>
      {enviando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="mr-1 h-3.5 w-3.5" />}
      {label}
    </Button>
  );
  if (!semRastreio) return botao;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0}>{botao}</span></TooltipTrigger>
      <TooltipContent>Sem código de rastreio ainda</TooltipContent>
    </Tooltip>
  );
}

export function ConfiguracoesVDDialog({ aberto, onClose }: { aberto: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const qp = useParametrosVD();
  const [horas, setHoras] = useState("");
  const [endereco, setEndereco] = useState("");
  const [horario, setHorario] = useState("");
  const [msgs, setMsgs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto || !qp.data) return;
    setHoras(qp.data.alerta_sem_pagamento_horas != null ? String(qp.data.alerta_sem_pagamento_horas) : "");
    setEndereco(qp.data.retirada_endereco ?? "");
    setHorario(qp.data.retirada_horario ?? "");
    setMsgs({ ...(qp.data.mensagens ?? {}) } as Record<string, string>);
  }, [aberto, qp.data]);

  const salvar = useMutation({
    mutationFn: async () => {
      const h = Number(horas);
      if (!Number.isInteger(h) || h <= 0) throw new Error("Horas para alerta deve ser um número inteiro maior que zero.");
      const { error } = await (supabase as any).rpc("vd_salvar_parametros", {
        p_alerta_horas: h,
        p_retirada_endereco: endereco.trim() || null,
        p_retirada_horario: horario.trim() || null,
        p_mensagens: msgs,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Configurações da Venda Direta salvas");
      await qc.invalidateQueries({ queryKey: QK_VD_PARAM });
      await qc.invalidateQueries({ queryKey: ["venda-direta-gestao"] });
      onClose();
    },
    onError: (e) => toast.error(rawMessage(e)),
  });

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurações da Venda Direta</DialogTitle>
          <DialogDescription>Alerta de pedido sem pagamento, retirada e mensagens de WhatsApp.</DialogDescription>
        </DialogHeader>
        {qp.isError ? (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{rawMessage(qp.error)}</div>
        ) : qp.isLoading ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Horas para alerta</Label>
                <Input type="number" min={1} value={horas} onChange={(e) => setHoras(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Horário de retirada</Label>
                <Input value={horario} onChange={(e) => setHorario(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Endereço de retirada</Label>
              <Textarea rows={2} value={endereco} onChange={(e) => setEndereco(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">Campos disponíveis nas mensagens: {PLACEHOLDERS}</p>
            {CHAVES_MSG.map((c) => (
              <div key={c.k} className="space-y-1">
                <Label>{c.label}</Label>
                <Textarea rows={3} value={msgs[c.k] ?? ""} onChange={(e) => setMsgs((m) => ({ ...m, [c.k]: e.target.value }))} />
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvar.isPending || !qp.data} onClick={() => salvar.mutate()}>
            {salvar.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
