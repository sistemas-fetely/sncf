import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Mail, MailCheck, Loader2, Plus, X, ChevronDown } from "lucide-react";
import { useEnviarEmailPedidoCobranca } from "@/hooks/pedidos/useEnviarEmailPedidoCobranca";
import { useEnviarEmailNfFaturado } from "@/hooks/pedidos/useEnviarEmailNfFaturado";
import { useEnviarEmailNfBoletos } from "@/hooks/pedidos/useEnviarEmailNfBoletos";
import { useEnviarEmailBoleto } from "@/hooks/credito/useEnviarEmailBoleto";
import { usePedidoEmailLog, useLogEmailEnvio } from "@/hooks/pedidos/usePedidoEmailLog";

type TipoEmail = "cobranca" | "portao_boleto" | "boleto" | "nf" | "nf_boletos";

interface Props {
  pedido_id: string;
  parceiro_id: string;
  estagio: string;
  exige_portao?: boolean;
}

const TIPO_LABEL: Record<TipoEmail, { btn: string; title: string; desc: string }> = {
  cobranca: { btn: "Enviar cobrança", title: "Enviar cobrança", desc: "PDF do pedido será anexado" },
  portao_boleto: { btn: "Enviar boleto de entrada", title: "Enviar boleto de entrada", desc: "PDF do boleto do portão será anexado" },
  boleto: { btn: "Enviar boleto(s)", title: "Enviar boleto(s)", desc: "PDF dos boletos registrados serão anexados" },
  nf: { btn: "Enviar NF", title: "Enviar NF", desc: "PDF e XML da NF serão anexados" },
  nf_boletos: { btn: "Enviar NF + boletos", title: "Enviar NF + boletos", desc: "NF e PDFs dos boletos serão anexados" },
};

const ESTAGIOS_SEM_COBRANCA = new Set(["faturado", "cancelado", "em_analise_credito", "entregue"]);

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function ComunicacaoPedidoPanel({ pedido_id, parceiro_id, estagio, exige_portao }: Props) {
  const qc = useQueryClient();

  // ── Queries ──
  const parceiroQ = useQuery({
    queryKey: ["comunic-parceiro", parceiro_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("email, razao_social")
        .eq("id", parceiro_id)
        .maybeSingle();
      return data;
    },
    enabled: !!parceiro_id,
  });

  const portaoQ = useQuery({
    queryKey: ["comunic-portao", pedido_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pedido_portao")
        .select("tipo_pagamento, link_pagamento")
        .eq("pedido_id", pedido_id)
        .eq("status", "provisorio")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!pedido_id,
  });

  const tituloEntradaQ = useQuery({
    queryKey: ["comunic-titulo-entrada", pedido_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("titulo_a_receber")
        .select("id, linha_digitavel")
        .eq("pedido_id", pedido_id)
        .eq("eh_entrada", true)
        .eq("boleto_status", "registrado")
        .neq("status", "cancelado")
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!pedido_id,
  });

  const titulosBoletoQ = useQuery({
    queryKey: ["comunic-titulos-boleto", pedido_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("titulo_a_receber")
        .select("id, numero_parcela, total_parcelas, valor_bruto, data_vencimento_atual, linha_digitavel")
        .eq("pedido_id", pedido_id)
        .eq("tipo_pagamento", "boleto")
        .eq("boleto_status", "registrado")
        .eq("eh_entrada", false)
        .not("linha_digitavel", "is", null);
      return (data ?? []) as any[];
    },
    enabled: !!pedido_id,
  });

  const nfQ = useQuery({
    queryKey: ["comunic-nf", pedido_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("nfs_emitidas")
        .select("id")
        .eq("pedido_venda_id", pedido_id)
        .eq("tipo", "saida")
        .eq("situacao", "autorizada")
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!pedido_id,
  });

  const logQ = usePedidoEmailLog(pedido_id);

  // ── Mutations ──
  const enviarCobranca = useEnviarEmailPedidoCobranca();
  const enviarNf = useEnviarEmailNfFaturado();
  const enviarNfBoletos = useEnviarEmailNfBoletos();
  const enviarBoleto = useEnviarEmailBoleto();
  const logEnvio = useLogEmailEnvio();

  // ── State ──
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTipo, setDialogTipo] = useState<TipoEmail | null>(null);
  const [emailPrincipal, setEmailPrincipal] = useState("");
  const [emailsAdicionais, setEmailsAdicionais] = useState<string[]>([]);
  const [novoEmail, setNovoEmail] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (dialogOpen && parceiroQ.data?.email && !emailPrincipal) {
      setEmailPrincipal(parceiroQ.data.email);
    }
  }, [dialogOpen, parceiroQ.data, emailPrincipal]);

  const abrirDialog = (tipo: TipoEmail) => {
    setDialogTipo(tipo);
    setEmailPrincipal(parceiroQ.data?.email ?? "");
    setEmailsAdicionais([]);
    setNovoEmail("");
    setDialogOpen(true);
  };

  const fecharDialog = () => {
    if (sending) return;
    setDialogOpen(false);
    setDialogTipo(null);
  };

  const addEmail = () => {
    const e = novoEmail.trim().toLowerCase();
    if (e && !emailsAdicionais.includes(e) && e !== emailPrincipal.trim().toLowerCase()) {
      setEmailsAdicionais((p) => [...p, e]);
    }
    setNovoEmail("");
  };

  const handleEnviar = async () => {
    if (!dialogTipo || !emailPrincipal.trim()) return;
    setSending(true);
    try {
      const principal = emailPrincipal.trim();
      const cc = emailsAdicionais;

      if (dialogTipo === "cobranca") {
        await enviarCobranca.mutateAsync({ pedido_id, emails: [principal], cc });
      } else if (dialogTipo === "portao_boleto") {
        if (tituloEntradaQ.data?.id) {
          await enviarBoleto.mutateAsync(tituloEntradaQ.data.id);
        }
      } else if (dialogTipo === "boleto") {
        for (const t of titulosBoletoQ.data ?? []) {
          await enviarBoleto.mutateAsync(t.id);
        }
      } else if (dialogTipo === "nf") {
        await enviarNf.mutateAsync({ pedido_id, emails: [principal], cc, skipEstagioCheck: true });
      } else if (dialogTipo === "nf_boletos") {
        await enviarNfBoletos.mutateAsync({ pedido_id, emails: [principal], cc, skipEstagioCheck: true });
      }

      await logEnvio.mutateAsync({
        pedido_id,
        tipo_email: dialogTipo,
        destinatario: principal,
        cc,
        estagio_pedido: estagio,
      });

      qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedido_id] });
      qc.invalidateQueries({ queryKey: ["pedido-titulos", pedido_id] });
      setDialogOpen(false);
      setDialogTipo(null);
    } finally {
      setSending(false);
    }
  };

  // ── Visibilidade ──
  const titulosBoleto = titulosBoletoQ.data ?? [];
  const nfExiste = !!nfQ.data?.id;
  const portao = portaoQ.data;
  const tituloEntrada = tituloEntradaQ.data;

  const mostrarCobranca = !ESTAGIOS_SEM_COBRANCA.has(estagio);
  const mostrarPortaoBoleto = !!exige_portao && portao?.tipo_pagamento === "boleto" && !!tituloEntrada;
  const mostrarBoleto = titulosBoleto.length > 0;
  const mostrarNf = nfExiste && estagio !== "cancelado";
  const mostrarNfBoletos = nfExiste && titulosBoleto.length > 0;

  const algumVisivel = mostrarCobranca || mostrarPortaoBoleto || mostrarBoleto || mostrarNf || mostrarNfBoletos;

  const pedidoFieldsQ = useQuery({
    queryKey: ["comunic-pedido-fields", pedido_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pedidos")
        .select("nf_email_enviado_em")
        .eq("id", pedido_id)
        .maybeSingle();
      return data;
    },
    enabled: !!pedido_id,
  });

  // ── Último envio por tipo ──
  const ultimoPorTipo = useMemo(() => {
    const map: Record<string, any> = {};
    for (const l of logQ.data ?? []) {
      if (!map[l.tipo_email]) map[l.tipo_email] = l;
    }
    // Fallback legado: se nf_email_enviado_em estiver preenchido e não há log de nf/nf_boletos
    const nfEnviadoEm = pedidoFieldsQ.data?.nf_email_enviado_em;
    if (nfEnviadoEm) {
      if (!map["nf"]) map["nf"] = { tipo_email: "nf", destinatario: "—", enviado_em: nfEnviadoEm };
      if (!map["nf_boletos"]) map["nf_boletos"] = { tipo_email: "nf_boletos", destinatario: "—", enviado_em: nfEnviadoEm };
    }
    return map;
  }, [logQ.data, pedidoFieldsQ.data]);

  if (!algumVisivel) return null;

  const renderBotao = (tipo: TipoEmail, visivel: boolean) => {
    if (!visivel) return null;
    const ultimo = ultimoPorTipo[tipo];
    const enviado = !!ultimo;
    const Icon = enviado ? MailCheck : Mail;
    const btn = (
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 justify-start"
        onClick={() => abrirDialog(tipo)}
      >
        <Icon className={enviado ? "h-4 w-4 text-emerald-600" : "h-4 w-4 text-muted-foreground"} />
        <span className="truncate">{TIPO_LABEL[tipo].btn}</span>
      </Button>
    );
    if (!enviado) return <div key={tipo}>{btn}</div>;
    return (
      <TooltipProvider key={tipo}>
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent>
            Enviado em {fmtDateTime(ultimo.enviado_em)} para {ultimo.destinatario}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const dialogCfg = dialogTipo ? TIPO_LABEL[dialogTipo] : null;
  const historico = (logQ.data ?? []).slice(0, 5);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">Comunicação</p>
      <div className="space-y-2">
        {renderBotao("cobranca", mostrarCobranca)}
        {renderBotao("portao_boleto", mostrarPortaoBoleto)}
        {renderBotao("boleto", mostrarBoleto)}
        {renderBotao("nf", mostrarNf)}
        {renderBotao("nf_boletos", mostrarNfBoletos)}
      </div>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground pt-1">
            <ChevronDown className="h-3 w-3" />
            Histórico{historico.length > 0 ? ` (${historico.length})` : ""}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-1.5">
          {historico.length === 0 ? (
            <p className="text-xs text-muted-foreground pl-2">Nenhum envio registrado ainda.</p>
          ) : (
            historico.map((l) => (
              <div key={l.id} className="text-xs text-muted-foreground border-l-2 border-border pl-2">
                <div className="font-medium text-foreground">{TIPO_LABEL[l.tipo_email as TipoEmail]?.btn ?? l.tipo_email}</div>
                <div className="truncate">{l.destinatario !== "—" ? l.destinatario : "envio anterior"}</div>
                <div className="opacity-70">{fmtDateTime(l.enviado_em)}</div>
              </div>
            ))
          )}
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) fecharDialog(); else setDialogOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {dialogCfg?.title}
            </DialogTitle>
            <DialogDescription>
              Confirme o email do destinatário antes de enviar. {dialogCfg?.desc}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="comunic-email-principal">Email principal</Label>
              <Input
                id="comunic-email-principal"
                type="email"
                placeholder="cliente@email.com"
                value={emailPrincipal}
                onChange={(e) => setEmailPrincipal(e.target.value)}
              />
            </div>

            {emailsAdicionais.length > 0 && (
              <div className="space-y-1.5">
                <Label>Emails adicionais</Label>
                <div className="flex flex-wrap gap-2">
                  {emailsAdicionais.map((em) => (
                    <div key={em} className="flex items-center gap-1.5 rounded-md border bg-muted px-2 py-1 text-sm">
                      <span>{em}</span>
                      <button
                        type="button"
                        onClick={() => setEmailsAdicionais((p) => p.filter((x) => x !== em))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="comunic-novo-email">Adicionar outro destinatário</Label>
              <div className="flex gap-2">
                <Input
                  id="comunic-novo-email"
                  type="email"
                  placeholder="outro@email.com"
                  value={novoEmail}
                  onChange={(e) => setNovoEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
                />
                <Button variant="outline" size="icon" onClick={addEmail} disabled={!novoEmail.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={fecharDialog} disabled={sending}>
              Cancelar
            </Button>
            <Button onClick={handleEnviar} disabled={!emailPrincipal.trim() || sending} className="gap-1.5">
              {sending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Enviando…</>
              ) : (
                <><Mail className="h-4 w-4" />Enviar</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
