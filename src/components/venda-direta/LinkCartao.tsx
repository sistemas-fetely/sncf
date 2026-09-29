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
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { QK_VD_GESTAO, type LinhaVD } from "@/components/venda-direta/AcoesVendaDireta";

export interface LinkCartaoOk { ok: true; url: string; expira_em: string; max_parcelas: number; pagamento_link_id: string }
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

function whatsappUrl(telefone: string | null | undefined, nome: string | null | undefined, vd: string | null, total: number | null, n: number, url: string) {
  const t = (telefone ?? "").replace(/\D/g, "");
  if (t.length < 10) return null;
  const tel = t.length <= 11 ? `55${t}` : t;
  const primeiro = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  const msg = `Olá ${primeiro}! Seu pedido ${vd ?? ""} na Fetely ficou em ${formatBRL(total)}. Pague com cartão em até ${n}x neste link: ${url}`;
  return `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
}

function LinkBloco({ url, maxParcelas, expiraEm, wa }: { url: string; maxParcelas: number; expiraEm: string | null; wa: string | null }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Link do cartão (até {maxParcelas}x)</p>
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
export function LinkCartaoPainel({ pedidoId, idExterno, total, clienteNome, telefone }: {
  pedidoId: string; idExterno: string | null; total: number | null; clienteNome: string | null; telefone: string | null;
}) {
  const [estado, setEstado] = useState<{ fase: "carregando" } | { fase: "ok"; r: LinkCartaoOk } | { fase: "off" } | { fase: "erro"; msg: string }>({ fase: "carregando" });
  const pedidoRef = useRef<string | null>(null);

  const gerar = async () => {
    setEstado({ fase: "carregando" });
    try {
      const r = await chamarEdge<LinkCartaoOk>("safrapay-link", { pedido_id: pedidoId });
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
  return <LinkBloco url={r.url} maxParcelas={r.max_parcelas} expiraEm={r.expira_em} wa={whatsappUrl(telefone, clienteNome, idExterno, total, r.max_parcelas, r.url)} />;
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

  useEffect(() => { setResultado(null); }, [linha?.id]);

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

  const gerarNovo = async () => {
    if (!linha) return;
    setOcupado("gerar"); setResultado(null);
    try {
      await chamarEdge<LinkCartaoOk>("safrapay-link", { pedido_id: linha.id, forcar_novo: true });
      toast.success("Novo link gerado");
    } catch (e) {
      toast.error(e instanceof ErroEdge && e.status === 409 && /aguardando ativa/i.test(e.message) ? AVISO_409 : rawMessage(e));
    } finally {
      setOcupado(null);
      await q.refetch();
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
          <DialogTitle>Link do cartão · {linha?.id_externo}</DialogTitle>
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
                wa={whatsappUrl(linha?.cliente_telefone, linha?.cliente_nome ?? null, linha?.id_externo ?? null, linha?.valor_liquido ?? null, l.max_parcelas ?? 1, l.url!)}
              />
            ) : l.url ? (
              <p className="break-all text-sm text-muted-foreground">{l.url} · validade {fmtDataHora(l.expira_em)}</p>
            ) : null}
          </div>
        )}
        {resultado && <p className="text-sm">{resultado}</p>}
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" disabled={!!ocupado} onClick={verificar}>
            {ocupado === "verificar" && <Loader2 className="h-4 w-4 animate-spin" />} Verificar pagamento agora
          </Button>
          <Button variant="outline" disabled={!!ocupado} onClick={gerarNovo}>
            {ocupado === "gerar" && <Loader2 className="h-4 w-4 animate-spin" />} Gerar novo link
          </Button>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
