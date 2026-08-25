import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Check, ChevronDown, Copy, Link2, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
import { hojeISO } from "@/lib/data";
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
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum link cadastrado</p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {linha?.link && <BadgeSituacaoLink linha={linha} />}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setForm((v) => !v)}>
              <RefreshCw className="h-3.5 w-3.5" />
              {linha?.link ? "Renovar link" : "Cadastrar link"}
            </Button>
          </div>
        </div>

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
