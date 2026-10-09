import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { chamarEdge } from "@/components/venda-direta/LinkCartao";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Check, ChevronDown, Copy, CreditCard, Link2, Loader2, RefreshCw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { hojeISO } from "@/lib/data";
import {
  fmtDataBR,
  useHistoricoLinksPagamento,
  useLinkPagamentoPedido,
  useRegistrarLinkPagamento,
  type LinkPagamentoPedido,
} from "@/hooks/pedidos/useLinkPagamentoPedido";



/** Badge de situação do link — reutilizada nas filas. */
export function BadgeSituacaoLink({ linha }: { linha: LinkPagamentoPedido }) {
  const d = Number(linha.dias_para_vencer ?? 0);
  if (linha.situacao === "expirado") {
    return (
      <Badge variant="outline" className="border-0 bg-destructive/10 text-destructive text-[10px] whitespace-nowrap">
        VENCIDO há {Math.abs(d)} dia{Math.abs(d) === 1 ? "" : "s"}
      </Badge>
    );
  }
  if (linha.situacao === "vencendo") {
    return (
      <Badge variant="outline" className="border-0 bg-warning/10 text-warning text-[10px] whitespace-nowrap">
        vence em {d} dia{d === 1 ? "" : "s"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-0 bg-success/10 text-success text-[10px]">
      válido
    </Badge>
  );
}

/**
 * Badge compacta para filas. Só aparece quando a cobrança está VIVA e o link
 * não está válido — link de parcela já capturada é histórico, não exige ação.
 */
export function BadgeLinkFila({ linha }: { linha?: LinkPagamentoPedido | null }) {
  if (!linha || linha.cobranca_viva !== true || linha.situacao === "valido") return null;
  const d = Number(linha.dias_para_vencer ?? 0);
  if (linha.situacao === "expirado") {
    return (
      <Badge variant="outline" className="border-0 bg-destructive/10 text-destructive text-[10px] whitespace-nowrap w-fit">
        link vencido
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-0 bg-warning/10 text-warning text-[10px] whitespace-nowrap w-fit">
      link vence em {d} d
    </Badge>
  );
}
function UrlCopiavel({ url, className }: { url: string; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1400);
    });
  };
  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      <span
        className="truncate text-xs text-primary underline cursor-pointer"
        onClick={copiar}
        title={url}
      >
        {url}
      </span>
      <button
        type="button"
        onClick={copiar}
        className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
      >
        {copiado ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export function LinkPagamentoCard({ pedidoId, className }: { pedidoId: string; className?: string }) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const provisoesQ = useQuery({
    queryKey: ["provisoes-pedido", pedidoId, "links"],
    queryFn: async () => {
      const { data, error } = await supabase.from("provisao_recebimento")
        .select("tipo_pagamento, status, pago_em").eq("pedido_id", pedidoId).eq("eh_portao", true).is("pago_em", null);
      if (error) throw error;
      return (data ?? []).filter((p) => !["pago", "cancelado", "cancelada"].includes(String(p.status)));
    },
  });
  const linksApiQ = useQuery({
    queryKey: ["gerenciar-links", pedidoId, "api"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pagamento_link")
        .select("id, url, pix_copia_cola, status, expira_em, criado_em, meio, erro")
        .eq("pedido_id", pedidoId).order("criado_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const atualizar = async () => {
    invalidarPedido(qc, pedidoId);
    await Promise.all([linksApiQ.refetch(), linkQ.refetch(), provisoesQ.refetch()]);
  };
  const gerar = async (meio: "cartao" | "pix") => {
    setOcupado(meio);
    try {
      await chamarEdge(meio === "cartao" ? "safrapay-link" : "safrapay-pix", {
        pedido_id: pedidoId, ...(meio === "cartao" ? { meio } : {}),
      });
      await atualizar();
      toast.success(meio === "cartao" ? "Link de cartão gerado" : "PIX gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setOcupado(null); }
  };
  const sincronizar = async () => {
    setOcupado("sync");
    try {
      const r = await chamarEdge<{ detalhes?: { erro?: string }[] }>("safrapay-link-sync", { pedido_id: pedidoId });
      const erros = r.detalhes?.filter((d) => d.erro).map((d) => d.erro) ?? [];
      await atualizar();
      if (erros.length) throw new Error(erros.join("\n"));
      toast.success("Links sincronizados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setOcupado(null); }
  };
  const linkQ = useLinkPagamentoPedido(pedidoId);
  const registrar = useRegistrarLinkPagamento();

  const [form, setForm] = useState(false);
  const [histAberto, setHistAberto] = useState(false);
  const [novoLink, setNovoLink] = useState("");
  const [geradoEm, setGeradoEm] = useState(hojeISO());
  const [expiraEm, setExpiraEm] = useState("");
  const [motivo, setMotivo] = useState("");

  const linha = linkQ.data ?? null;
  const trilha = Number(linha?.links_na_trilha ?? 0);
  const historicoQ = useHistoricoLinksPagamento(pedidoId, histAberto && trilha > 1);

  const salvar = async () => {
    const url = novoLink.trim();
    if (!/^https?:\/\//i.test(url)) return;
    try {
      await registrar.mutateAsync({
        pedido_id: pedidoId,
        link: url,
        gerado_em: geradoEm || hojeISO(),
        expira_em: expiraEm || null,
        tipo_pagamento: linha?.tipo_pagamento ?? null,
        motivo: motivo.trim() || null,
      });
      setNovoLink("");
      setMotivo("");
      setGeradoEm(hojeISO());
      setExpiraEm("");
      setForm(false);
    } catch {
      /* toast já sai no hook */
    }
  };

  return (
    <Card className={className}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <Link2 className="h-3.5 w-3.5" />
              Link de pagamento
            </div>

            {linkQ.isLoading ? (
              <Skeleton className="h-4 w-64" />
            ) : linha?.link ? (
              <>
                <UrlCopiavel url={linha.link} className="max-w-[420px]" />
                <p className="text-[11px] text-muted-foreground">
                  Gerado em {fmtDataBR(linha.gerado_em)} · válido até {fmtDataBR(linha.expira_em)}
                </p>
                {linha.renovado_nao_reenviado && (
                  <p className="text-[11px] text-warning">
                    Renovado e ainda não reenviado ao cliente.
                  </p>
                )}
              </>
            ) : linksApiQ.data?.length ? null : (
              <p className="text-sm text-muted-foreground">Nenhum link cadastrado</p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {linha?.link && <BadgeSituacaoLink linha={linha} />}
          </div>
        </div>

        {(provisoesQ.error || linksApiQ.error) && (
          <p role="alert" className="text-xs text-destructive">{(provisoesQ.error ?? linksApiQ.error)?.message}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {(["cartao", "pix"] as const).map((meio) => provisoesQ.data?.some((p) => p.tipo_pagamento === meio) && (
            <BotaoGuardado key={meio} slug="acao.cobranca_gerar_link" rotuloAcao="Gerar link de pagamento"
              contexto={{ pedido_id: pedidoId }} size="sm" variant="outline" disabled={ocupado !== null}
              className="gap-1.5" onClick={() => void gerar(meio)}>
              {ocupado === meio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : meio === "cartao" ? <CreditCard className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
              {meio === "cartao" ? "Gerar link de cartão" : "Gerar PIX"}
            </BotaoGuardado>
          ))}
        </div>
        {linksApiQ.isLoading && <Skeleton className="h-12 w-full" />}
        {linksApiQ.data?.map((l) => (
          <div key={l.id} className="border-t pt-2 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium">{l.meio === "pix" ? "PIX" : "Cartão"}</span>
              <Badge variant="secondary" className="text-[10px]">{l.status}</Badge>
              <span className="text-[11px] text-muted-foreground">Válido até {fmtDataBR(l.expira_em)}</span>
            </div>
            {l.url && <UrlCopiavel url={l.url} />}
            {l.pix_copia_cola && <UrlCopiavel url={l.pix_copia_cola} />}
            {l.erro && <p className="text-xs text-destructive">{l.erro}</p>}
          </div>
        ))}
        {!!linksApiQ.data?.length && (
          <BotaoGuardado slug="acao.cobranca_gerar_link" rotuloAcao="Gerar link de pagamento" contexto={{ pedido_id: pedidoId }}
            size="sm" variant="outline" disabled={ocupado !== null} className="gap-1.5" onClick={() => void sincronizar()}>
            {ocupado === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sincronizar agora
          </BotaoGuardado>
        )}
        <Button size="sm" variant="outline" className="gap-1.5 h-auto py-2 max-w-full whitespace-normal text-left" onClick={() => setForm((v) => !v)}>
          <RefreshCw className="h-3.5 w-3.5" />
          Cadastrar link manual (failover)
        </Button>
        {form && (
          <div className="rounded-md border bg-muted/40 p-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lp-url" className="text-xs">Link novo do SafraPay</Label>
              <Input
                id="lp-url"
                type="url"
                placeholder="https://..."
                value={novoLink}
                onChange={(e) => setNovoLink(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="lp-data" className="text-xs">Gerado em</Label>
                <Input
                  id="lp-data"
                  type="date"
                  max={hojeISO()}
                  value={geradoEm}
                  onChange={(e) => setGeradoEm(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lp-expira" className="text-xs">Vence em</Label>
                <Input
                  id="lp-expira"
                  type="date"
                  min={geradoEm || hojeISO()}
                  value={expiraEm}
                  onChange={(e) => setExpiraEm(e.target.value)}
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">Vazio = validade padrão do sistema.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lp-motivo" className="text-xs">Motivo (opcional)</Label>
                <Input
                  id="lp-motivo"
                  placeholder="Ex: link anterior venceu"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setForm(false)} disabled={registrar.isPending}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={salvar}
                disabled={registrar.isPending || !/^https?:\/\//i.test(novoLink.trim())}
                className="gap-1.5"
              >
                {registrar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        )}

        {trilha > 1 && (
          <Collapsible open={histAberto} onOpenChange={setHistAberto}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", histAberto && "rotate-180")} />
                Histórico de links ({trilha})
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              {historicoQ.isLoading && <Skeleton className="h-16 w-full" />}
              {historicoQ.data?.map((h) => (
                <div key={h.id} className="border-t py-2 space-y-1">
                  {h.link ? <UrlCopiavel url={h.link} className="max-w-[420px]" /> : <span className="text-xs text-muted-foreground">—</span>}
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>Gerado em {fmtDataBR(h.gerado_em)}</span>
                    <span>· válido até {fmtDataBR(h.expira_em)}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {h.status === "ativo" ? "ativo" : h.status === "substituido" ? "substituído" : (h.status ?? "—")}
                    </Badge>
                    <span>{h.enviado_em ? `enviado em ${fmtDataBR(h.enviado_em)}` : "não enviado"}</span>
                    {h.motivo_troca && <span>· {h.motivo_troca}</span>}
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
