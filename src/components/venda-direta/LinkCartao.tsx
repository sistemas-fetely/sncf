import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { QK_VD_GESTAO, type LinhaVD } from "@/components/venda-direta/AcoesVendaDireta";

export interface LinkCartaoOk { ok: true; url: string; expira_em: string; max_parcelas: number; parcelas_padrao?: number; pagamento_link_id: string }

export interface CfgParcelas { max_parcelas: number; valor_minimo_parcelar_centavos: number; parcela_min_centavos: number; pix_no_link: boolean }

/** Regras de parcelamento lidas de safrapay_config. */
export function useCfgParcelas() {
  return useQuery({
    queryKey: ["safrapay-config-parcelas"],
    queryFn: async (): Promise<CfgParcelas> => {
      const { data, error } = await supabase
        .from("safrapay_config" as never)
        .select("max_parcelas, valor_minimo_parcelar_centavos, parcela_min_centavos, pix_no_link")
        .eq("id", 1).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Configuração Safrapay ausente.");
      const d = data as unknown as Record<string, number | null>;
      const pixNoLink = (data as unknown as { pix_no_link?: boolean | null }).pix_no_link === true;
      return {
        max_parcelas: Number(d.max_parcelas ?? 1),
        valor_minimo_parcelar_centavos: Number(d.valor_minimo_parcelar_centavos ?? 0),
        parcela_min_centavos: Number(d.parcela_min_centavos ?? 0),
        pix_no_link: pixNoLink,
      };
    },
  });
}

/** Mesma regra da edge safrapay-link. */
export function parcelasPadrao(cfg: CfgParcelas, total: number) {
  const c = Math.round(total * 100);
  let n = c < cfg.valor_minimo_parcelar_centavos ? 1 : Math.max(1, cfg.max_parcelas);
  if (cfg.parcela_min_centavos > 0) n = Math.min(n, Math.floor(c / cfg.parcela_min_centavos));
  return Math.max(1, n);
}

export const textoParcelas = (n: number) => (n <= 1 ? "à vista" : `em até ${n}x`);

/** Rótulo curto da forma de pagamento (coluna/selo da Gestão e resumo do pedido). */
export function rotuloFormaPagamento(forma: "pix" | "cartao" | null | undefined, _pixNoLink?: boolean) {
  if (forma === "pix") return "PIX QR Code";
  if (forma === "cartao") return "Link de pagamento";
  return "—";
}

/** Rótulo e legenda das opções de pagamento da tela Novo pedido. */
export function rotulosOpcaoPagamento(pixNoLink: boolean, parcelas = 3) {
  return {
    cartao: pixNoLink ? "Link de pagamento · cartão ou PIX" : "Link de pagamento",
    cartaoLegenda: pixNoLink
      ? `O cliente escolhe cartão (até ${parcelas}x) ou PIX na página do Safrapay · vale 30 dias · confirma sozinho`
      : `Cartão de crédito (até ${parcelas}x) · vale 30 dias · confirma sozinho`,
    pix: "Só QR Code PIX",
    pixLegenda: "QR na chave da Fetely, sem prazo · sem confirmação automática (confirma pelo extrato)",
  };
}

export function textoPadraoParcelas(cfg: CfgParcelas | undefined) {
  if (!cfg) return null;
  return `Padrão: até ${cfg.max_parcelas}x a partir de ${formatBRL(cfg.valor_minimo_parcelar_centavos / 100)}`;
}

export function SelectParcelas({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))} disabled={disabled}>
      <SelectTrigger className="w-28 tabular-nums" aria-label="Parcelas no link"><SelectValue /></SelectTrigger>
      <SelectContent>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
          <SelectItem key={n} value={String(n)} className="tabular-nums">{n}x</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export class ErroEdge extends Error {
  constructor(msg: string, readonly status: number | null) { super(msg); }
}

/** Chama uma edge e devolve o corpo; erro HTTP vira ErroEdge com a mensagem real do corpo. */
export async function chamarEdge<T>(nome: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let msg = error.message;
    let status: number | null = null;
    if (ctx && typeof ctx.json === "function") {
      status = ctx.status ?? null;
      try {
        const j = await ctx.clone().json();
        if (j?.erro) msg = String(j.erro);
      } catch { /* mantém mensagem original */ }
    }
    throw new ErroEdge(msg, status);
  }
  if (data && (data as { ok?: boolean }).ok === false) throw new ErroEdge(String((data as { erro?: string }).erro ?? "Falha"), null);
  return data as T;
}

const fmtDataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function whatsappUrl(telefone: string | null | undefined, nome: string | null | undefined, vd: string | null, total: number | null, n: number, url: string, pixNoLink = false) {
  const t = (telefone ?? "").replace(/\D/g, "");
  if (t.length < 10) return null;
  const tel = t.length <= 11 ? `55${t}` : t;
  const primeiro = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  const msg = `Olá ${primeiro}! Seu pedido ${vd ?? ""} na Fetely ficou em ${formatBRL(total)}. ${pixNoLink ? `Pague com cartão ${n <= 1 ? "à vista" : `em até ${n}x`} ou PIX` : `Pague com cartão ${textoParcelas(n)}`} neste link: ${url}`;
  return `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
}

function LinkBloco({ url, maxParcelas, expiraEm, wa }: { url: string; maxParcelas: number; expiraEm: string | null; wa: string | null }) {
  const pixNoLink = useCfgParcelas().data?.pix_no_link === true;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{pixNoLink ? "Link de pagamento (cartão ou PIX)" : "Link de pagamento"} ({textoParcelas(maxParcelas)})</p>
      <div className="flex gap-2">
        <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <Button
          variant="outline"
          onClick={async () => {
            try { await navigator.clipboard.writeText(url); toast.success("Link copiado"); }
            catch (e) { toast.error(`Não foi possível copiar: ${rawMessage(e)}`); }
          }}
        ><Copy className="h-4 w-4" /> Copiar</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!wa} onClick={() => wa && window.open(wa, "_blank", "noopener")}>
          <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
        </Button>
        {!wa && <span className="text-xs text-muted-foreground">Cliente sem telefone válido.</span>}
        <span className="text-sm text-muted-foreground">vale até {fmtDataHora(expiraEm)}</span>
      </div>
    </div>
  );
}

export const AVISO_409 = "Link de cartão indisponível — integração Safrapay aguardando ativação. O Financeiro confirma o pagamento manualmente.";

/** Painel da tela Novo pedido: gera o link automaticamente. */
export function LinkCartaoPainel({ pedidoId, idExterno, total, clienteNome, telefone, maxParcelas }: {
  pedidoId: string; idExterno: string | null; total: number | null; clienteNome: string | null; telefone: string | null; maxParcelas?: number;
}) {
  const cfgPix = useCfgParcelas().data?.pix_no_link === true;
  const [estado, setEstado] = useState<{ fase: "carregando" } | { fase: "ok"; r: LinkCartaoOk } | { fase: "off" } | { fase: "erro"; msg: string }>({ fase: "carregando" });
  const pedidoRef = useRef<string | null>(null);

  const gerar = async () => {
    setEstado({ fase: "carregando" });
    try {
      const r = await chamarEdge<LinkCartaoOk>("safrapay-link", { pedido_id: pedidoId, ...(maxParcelas ? { max_parcelas: maxParcelas } : {}) });
      setEstado({ fase: "ok", r });
    } catch (e) {
      if (e instanceof ErroEdge && e.status === 409 && /aguardando ativa/i.test(e.message)) setEstado({ fase: "off" });
      else setEstado({ fase: "erro", msg: rawMessage(e) });
    }
  };

  useEffect(() => {
    if (pedidoRef.current === pedidoId) return;
    pedidoRef.current = pedidoId;
    void gerar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoId]);

  if (estado.fase === "carregando")
    return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Gerando link do cartão…</p>;
  if (estado.fase === "off") return <p className="text-sm text-warning">{AVISO_409}</p>;
  if (estado.fase === "erro")
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">{estado.msg}</p>
        <Button variant="outline" size="sm" onClick={gerar}><RefreshCw className="h-4 w-4" /> Tentar de novo</Button>
      </div>
    );
  const r = estado.r;
  return <LinkBloco url={r.url} maxParcelas={r.max_parcelas} expiraEm={r.expira_em} wa={whatsappUrl(telefone, clienteNome, idExterno, total, r.max_parcelas, r.url, cfgPix)} />;
}

interface PagamentoLink {
  id: string; status: string; url: string | null; expira_em: string | null; max_parcelas: number | null;
  erro: string | null; ultimo_sync_em: string | null; criado_em: string;
}

const COR_STATUS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  aberto: "secondary", pago: "default", erro: "destructive", expirado: "outline", cancelado: "outline", criando: "outline",
};

/** Dialog da Gestão: link mais recente + gerar novo + verificar pagamento. */
export function LinkCartaoDialog({ linha, onClose }: { linha: LinhaVD | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<null | "gerar" | "verificar">(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [parcelas, setParcelas] = useState<number | null>(null);
  const cfgQ = useCfgParcelas();
  const cfgDlgPix = cfgQ.data?.pix_no_link === true;

  useEffect(() => { setResultado(null); setParcelas(null); }, [linha?.id]);

  const q = useQuery({
    queryKey: ["venda-direta-pagamento-link", linha?.id],
    enabled: !!linha?.id,
    queryFn: async (): Promise<PagamentoLink | null> => {
      const { data, error } = await supabase
        .from("pagamento_link" as never)
        .select("id, status, url, expira_em, max_parcelas, erro, ultimo_sync_em, criado_em")
        .eq("pedido_id", linha?.id as string)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as PagamentoLink | null;
    },
  });

  const padraoAtual = q.data?.max_parcelas
    ?? (cfgQ.data ? parcelasPadrao(cfgQ.data, Number(linha?.valor_liquido ?? 0)) : 1);
  const parcelasEfetivas = parcelas ?? padraoAtual;

  const gerarNovo = async () => {
    if (!linha) return;
    setOcupado("gerar"); setResultado(null);
    try {
      const r = await chamarEdge<LinkCartaoOk>("safrapay-link", { pedido_id: linha.id, forcar_novo: true, max_parcelas: parcelasEfetivas });
      toast.success(`Novo link gerado · ${textoParcelas(r.max_parcelas)}`);
      setParcelas(null);
      qc.invalidateQueries({ queryKey: QK_VD_GESTAO });
    } catch (e) {
      toast.error(e instanceof ErroEdge && e.status === 409 && /aguardando ativa/i.test(e.message) ? AVISO_409 : rawMessage(e));
    } finally {
      setOcupado(null);
      await qc.resetQueries({ queryKey: ["venda-direta-pagamento-link", linha.id], exact: true });
    }
  };

  const verificar = async () => {
    if (!linha) return;
    setOcupado("verificar"); setResultado(null);
    try {
      const r = await chamarEdge<{ verificados: number; pagos: number; expirados: number; cancelados: number; erros: number; detalhes: { erro?: string; resultado?: string }[] }>(
        "safrapay-link-sync", { pedido_id: linha.id },
      );
      const d = r.detalhes?.[0];
      const txt = r.verificados === 0 ? "Nenhum link aberto para verificar." : d?.erro ? `Erro: ${d.erro}` : `Resultado: ${d?.resultado ?? "—"}`;
      setResultado(txt);
      if (d?.erro) toast.error(d.erro); else toast.success(txt);
      qc.invalidateQueries({ queryKey: QK_VD_GESTAO });
    } catch (e) {
      toast.error(rawMessage(e));
      setResultado(`Erro: ${rawMessage(e)}`);
    } finally {
      setOcupado(null);
      await q.refetch();
    }
  };

  const l = q.data;
  const vigente = l && l.status === "aberto" && l.url;
  return (
    <Dialog open={!!linha} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{cfgDlgPix ? "Link de pagamento (cartão ou PIX)" : "Link de pagamento"} · {linha?.id_externo}</DialogTitle>
          <DialogDescription>{linha?.cliente_nome} · {formatBRL(linha?.valor_liquido ?? null)}</DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : q.isError ? (
          <p className="text-sm text-destructive">{rawMessage(q.error)}</p>
        ) : !l ? (
          <p className="text-sm text-muted-foreground">Nenhum link gerado ainda para este pedido.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={COR_STATUS[l.status] ?? "outline"}>{l.status}</Badge>
              <span className="text-muted-foreground">criado {fmtDataHora(l.criado_em)}</span>
              {l.ultimo_sync_em && <span className="text-muted-foreground">· verificado {fmtDataHora(l.ultimo_sync_em)}</span>}
            </div>
            {l.erro && <p className="text-sm text-destructive">{l.erro}</p>}
            {vigente ? (
              <LinkBloco
                url={l.url!}
                maxParcelas={l.max_parcelas ?? 1}
                expiraEm={l.expira_em}
                wa={whatsappUrl(linha?.cliente_telefone, linha?.cliente_nome ?? null, linha?.id_externo ?? null, linha?.valor_liquido ?? null, l.max_parcelas ?? 1, l.url!, cfgDlgPix)}
              />
            ) : l.url ? (
              <p className="break-all text-sm text-muted-foreground">{l.url} · vale até {fmtDataHora(l.expira_em)}</p>
            ) : null}
          </div>
        )}
        {resultado && <p className="text-sm">{resultado}</p>}
        {cfgQ.isError && <p className="text-sm text-destructive">Regras de parcelamento: {rawMessage(cfgQ.error)}</p>}
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" disabled={!!ocupado} onClick={verificar}>
            {ocupado === "verificar" && <Loader2 className="h-4 w-4 animate-spin" />} Verificar pagamento agora
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Parcelas no link</span>
            <SelectParcelas value={parcelasEfetivas} onChange={setParcelas} disabled={!!ocupado} />
          </div>
          <Button variant="outline" disabled={!!ocupado} onClick={gerarNovo}>
            {ocupado === "gerar" && <Loader2 className="h-4 w-4 animate-spin" />} Gerar novo link
          </Button>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
