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
import { Badge } from "@/components/ui/badge";
import {
  useLinkPagamentoPedido, useRegistrarLinkPagamento, fmtDataBR,
} from "@/hooks/pedidos/useLinkPagamentoPedido";
import {
  montarPacoteCobranca, type TituloPacote,
} from "@/lib/financeiro/montar-pacote-cobranca";
import { resolverEmailCobranca } from "@/lib/financeiro/email-cobranca-parceiro";
import { ehBrCodePix } from "@/lib/financeiro/instrumento-pagamento";

type TipoEmail = "cobranca" | "portao_boleto" | "boleto" | "nf" | "nf_boletos";

interface Props {
  pedido_id: string;
  parceiro_id: string;
  estagio: string;
  exige_portao?: boolean;
  /** Se falso, a natureza de operação não gera título — cobrança e histórico ficam ocultos. */
  gera_titulo_receber?: boolean;
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

export function ComunicacaoPedidoPanel({ pedido_id, parceiro_id, estagio, exige_portao, gera_titulo_receber = true }: Props) {
  const qc = useQueryClient();

  // ── Queries ──
  const parceiroQ = useQuery({
    queryKey: ["comunic-parceiro", parceiro_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("email, email_cobranca, contatos, razao_social")
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
        .select("tipo_pagamento, link_pagamento, valor, pix_txid")
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
      // Traz TODOS os títulos não-entrada; o montador é quem recorta por status/instrumento.
      const { data } = await (supabase as any)
        .from("titulo_a_receber")
        .select(
          "id, numero_parcela, total_parcelas, valor_bruto, data_vencimento_atual, linha_digitavel, status, tipo_pagamento, boleto_status",
        )
        .eq("pedido_id", pedido_id)
        .eq("eh_entrada", false)
        .order("numero_parcela", { ascending: true });
      return (data ?? []) as TituloPacote[];
    },
    enabled: !!pedido_id,
  });

  // Boletos SEMPRE via montador: só títulos com status 'aberto' e tipo boleto.
  const titulosBoleto = useMemo(() => {
    try {
      return montarPacoteCobranca((titulosBoletoQ.data ?? []) as TituloPacote[]).titulosBoleto;
    } catch {
      return [] as TituloPacote[];
    }
  }, [titulosBoletoQ.data]);

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

  // Vendedor do pedido: e-mail resolvido pela view, para cópia automática.
  const vendedorQ = useQuery({
    queryKey: ["comunic-vendedor", pedido_id],
    queryFn: async () => {
      const { data: ped } = await (supabase as any)
        .from("pedidos")
        .select("vendedor_id")
        .eq("id", pedido_id)
        .maybeSingle();
      if (!ped?.vendedor_id) return null;
      const { data } = await (supabase as any)
        .from("vw_vendedor_contato")
        .select("vendedor_id, nome, email")
        .eq("vendedor_id", ped.vendedor_id)
        .maybeSingle();
      if (!data?.email) return null;
      return { nome: data.nome as string | null, email: String(data.email).trim().toLowerCase() };
    },
    enabled: !!pedido_id,
  });

  const logQ = usePedidoEmailLog(pedido_id);
  const linkQ = useLinkPagamentoPedido(pedido_id);
  const registrarLink = useRegistrarLinkPagamento();


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
  const hojeISO = new Date().toISOString().slice(0, 10);
  const [novoLink, setNovoLink] = useState("");
  const [geradoEm, setGeradoEm] = useState(hojeISO);
  const [expiraEm, setExpiraEm] = useState("");

  // Precedência: contatos.financeiro.email > email_cobranca > email.
  const emailPreferido = useMemo(
    () => resolverEmailCobranca(parceiroQ.data ?? null).email,
    [parceiroQ.data],
  );

  useEffect(() => {
    if (dialogOpen && emailPreferido && !emailPrincipal) {
      setEmailPrincipal(emailPreferido);
    }
  }, [dialogOpen, emailPreferido, emailPrincipal]);

  const vendedorEmail = vendedorQ.data?.email ?? null;
  const vendedorNome = vendedorQ.data?.nome ?? null;

  const abrirDialog = (tipo: TipoEmail) => {
    setDialogTipo(tipo);
    const principal = (emailPreferido ?? "").trim().toLowerCase();
    setEmailPrincipal(emailPreferido ?? "");
    setEmailsAdicionais(vendedorEmail && vendedorEmail !== principal ? [vendedorEmail] : []);
    setNovoEmail("");
    setNovoLink("");
    setGeradoEm(hojeISO);
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
      // Boleto: destinatários escolhidos no diálogo têm que chegar ao hook.
      const destinatarios = [principal, ...cc];

      if (dialogTipo === "cobranca") {
        await enviarCobranca.mutateAsync({
          pedido_id, emails: [principal], cc, reenvio: !!ultimoPorTipo["cobranca"],
        });
      } else if (dialogTipo === "portao_boleto") {
        if (tituloEntradaQ.data?.id) {
          await enviarBoleto.mutateAsync({ titulo_id: tituloEntradaQ.data.id, destinatarios });
        }
      } else if (dialogTipo === "boleto") {
        for (const t of titulosBoleto) {
          await enviarBoleto.mutateAsync({ titulo_id: t.id, destinatarios });
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
        className={enviado
          ? "w-full gap-2 justify-start bg-success/10 border-success/40 text-success hover:bg-success/10"
          : "w-full gap-2 justify-start"
        }
        onClick={() => abrirDialog(tipo)}
      >
        <Icon className={enviado ? "h-4 w-4 text-success" : "h-4 w-4 text-muted-foreground"} />
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

  // ── Link de pagamento (view) ──
  const linkInfo = linkQ.data ?? null;
  const linkUrl = linkInfo?.link?.trim() ?? "";
  const linkUrlValida = /^https?:\/\//i.test(linkUrl);
  const tipoLinkNorm = (linkInfo?.tipo_pagamento ?? portao?.tipo_pagamento ?? "").toString().toLowerCase();
  const tipoExigeLink = tipoLinkNorm.includes("cart") || tipoLinkNorm.includes("pix");
  const linkExpirado = linkInfo?.situacao === "expirado";
  // BR Code PIX gerado pelo SNCF é instrumento válido — não é URL, não vence.
  const brCodePix = ehBrCodePix(portao?.link_pagamento) ? String(portao?.link_pagamento).trim() : null;
  const precisaRenovar =
    dialogTipo === "cobranca" &&
    !brCodePix &&
    (linkExpirado || (!!linkUrl && !linkUrlValida) || (!linkUrl && tipoExigeLink));
  const diasVencer = linkInfo?.dias_para_vencer ?? 0;

  const salvarLinkNovo = async () => {
    if (!novoLink.trim()) return;
    await registrarLink.mutateAsync({
      pedido_id,
      link: novoLink.trim(),
      gerado_em: geradoEm || undefined,
      expira_em: expiraEm || undefined,
      tipo_pagamento: linkInfo?.tipo_pagamento ?? portao?.tipo_pagamento ?? undefined,
      motivo: "Renovação de link vencido/inválido",
    });
    setNovoLink("");
    setExpiraEm("");
    await linkQ.refetch();
  };

  const historico = (logQ.data ?? []).slice(0, 5);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 pt-1">
        <i className="ti ti-send" style={{fontSize: "13px", color: "var(--color-text-secondary)"}} aria-hidden="true"></i>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Comunicação</p>
      </div>
      <div className="space-y-2">
        {gera_titulo_receber && renderBotao("cobranca", mostrarCobranca)}
        {renderBotao("portao_boleto", mostrarPortaoBoleto)}
        {renderBotao("boleto", mostrarBoleto)}
        {renderBotao("nf", mostrarNf)}
        {renderBotao("nf_boletos", mostrarNfBoletos)}
      </div>

      {gera_titulo_receber && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full px-2 py-1.5 mt-1 rounded-md text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-dashed border-border/50">
              <span className="flex items-center gap-1.5">
                <i className="ti ti-history" style={{fontSize: "13px"}} aria-hidden="true"></i>
                Histórico de envios{historico.length > 0 ? ` (${historico.length})` : ""}
              </span>
              <ChevronDown className="h-3 w-3" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-1.5">
            {historico.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-2">Nenhum envio registrado ainda.</p>
            ) : (
              historico.map((l) => (
                <div key={l.id} className="text-xs text-muted-foreground border-l-2 border-border pl-2">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <i className="ti ti-mail" style={{fontSize: "12px"}} aria-hidden="true"></i>
                    {TIPO_LABEL[l.tipo_email as TipoEmail]?.btn ?? l.tipo_email}
                  </div>
                  <div className="truncate">{l.destinatario !== "—" ? l.destinatario : "envio anterior"}</div>
                  <div className="opacity-70">{fmtDateTime(l.enviado_em)}</div>
                </div>
              ))
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

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

          <div className="space-y-4 min-w-0">
            {dialogTipo === "cobranca" && !!ultimoPorTipo["cobranca"] && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
                <p className="text-xs font-medium text-warning">
                  O cliente já recebeu esta cobrança em {fmtDateTime(ultimoPorTipo["cobranca"].enviado_em)}.
                  Enviar novamente é um reenvio consciente.
                </p>
              </div>
            )}

            {dialogTipo === "cobranca" && !!brCodePix && (
              <div className="rounded-md border border-success/40 bg-success/10 p-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-success">
                  PIX copia e cola
                </p>
                <p className="text-xs text-success">
                  O e-mail seguirá com o código PIX copia-e-cola gerado pelo SNCF (sem link do SafraPay).
                </p>
                {portao?.valor != null && (
                  <p className="text-sm font-medium text-success">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(portao.valor))}
                  </p>
                )}
                {portao?.pix_txid && (
                  <p className="text-xs text-success/80">
                    Identificador no extrato: <span className="font-mono">{portao.pix_txid}</span>
                  </p>
                )}
              </div>
            )}

            {dialogTipo === "cobranca" && !brCodePix && !!linkUrl && (
              <div className="rounded-md border bg-muted/40 p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Link que será enviado
                    </p>
                    <p className="break-all text-sm font-medium" title={linkUrl}>
                      {linkUrl}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Gerado em {fmtDataBR(linkInfo?.gerado_em)} · válido até {fmtDataBR(linkInfo?.expira_em)}
                    </p>
                  </div>
                  {linkInfo?.situacao === "expirado" ? (
                    <Badge variant="destructive" className="shrink-0">
                      VENCIDO há {Math.abs(diasVencer)} dia(s)
                    </Badge>
                  ) : linkInfo?.situacao === "vencendo" ? (
                    <Badge className="shrink-0 bg-warning/10 text-warning border-warning/40 hover:bg-warning/10">
                      vence em {diasVencer} dia(s)
                    </Badge>
                  ) : (
                    <Badge className="shrink-0 bg-success/10 text-success border-success/40 hover:bg-success/10">
                      válido
                    </Badge>
                  )}
                </div>
                {!!linkUrl && !linkUrlValida && (
                  <p className="text-xs text-destructive">
                    Link inválido no cadastro — cadastre a URL completa do SafraPay.
                  </p>
                )}
                {linkInfo?.renovado_nao_reenviado && (
                  <p className="text-xs text-warning">
                    Link renovado e ainda não reenviado ao cliente.
                  </p>
                )}
              </div>
            )}

            {precisaRenovar && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 space-y-2">
                <p className="text-xs font-medium text-warning">
                  {linkExpirado
                    ? "Link vencido. Gere um link novo no SafraPay e cole abaixo antes de enviar."
                    : !linkUrl
                      ? "Sem link de pagamento. Cole o link do SafraPay antes de enviar."
                      : "Link inválido. Cole a URL completa do SafraPay antes de enviar."}
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="comunic-novo-link">Link novo do SafraPay</Label>
                  <Input
                    id="comunic-novo-link"
                    type="url"
                    placeholder="https://..."
                    value={novoLink}
                    onChange={(e) => setNovoLink(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="comunic-gerado-em">Gerado em</Label>
                  <Input
                    id="comunic-gerado-em"
                    type="date"
                    max={hojeISO}
                    value={geradoEm}
                    onChange={(e) => setGeradoEm(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="comunic-expira-em">Vence em</Label>
                  <Input
                    id="comunic-expira-em"
                    type="date"
                    min={geradoEm || hojeISO}
                    value={expiraEm}
                    onChange={(e) => setExpiraEm(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">Vazio = validade padrão do sistema.</p>
                </div>
                <Button
                  size="sm"
                  onClick={salvarLinkNovo}
                  disabled={!novoLink.trim() || registrarLink.isPending}
                  className="gap-1.5"
                >
                  {registrarLink.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Salvando…</>
                  ) : (
                    "Salvar link"
                  )}
                </Button>
              </div>
            )}

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
                      {vendedorEmail === em && (
                        <Badge variant="outline" className="text-[10px]">
                          vendedor{vendedorNome ? `: ${vendedorNome}` : ""}
                        </Badge>
                      )}
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
                  className="min-w-0 flex-1"
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
            <Button onClick={handleEnviar} disabled={!emailPrincipal.trim() || sending || precisaRenovar} className="gap-1.5">
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
