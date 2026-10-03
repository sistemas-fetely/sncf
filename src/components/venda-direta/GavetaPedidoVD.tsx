import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SeloConfirmacaoAutomatica, usePixSafrapay } from "@/components/venda-direta/PixSafrapay";
import { rotuloFormaPagamento, useCfgParcelas } from "@/components/venda-direta/LinkCartao";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TrilhaDevolucao, type DevolucaoVD } from "./DevolucaoVendaDireta";

export interface LinhaGaveta {
  id: string;
  id_externo: string | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  cliente_cpf_mascarado?: string | null;
  modal: string | null;
  endereco_entrega?: Record<string, unknown> | null;
  frete: { servico?: string | null; custo?: number | null; cobrado?: number | null; gratis?: boolean | null } | null;
  pagamento: "pix" | "cartao" | null;
  pagamento_confirmado_em?: string | null;
  link_pagamento: string | null;
  nf_numero: string | number | null;
  bling_pedido_numero: string | number | null;
  valor_liquido: number | null;
}

interface Item { id: string; sku: string; descricao: string | null; quantidade: number; valor_unitario: number | null; subtotal: number | null }
interface Prod { sku: string; cod_cadastro: string | null; nome_comercial: string | null }
interface Evento { id: string; criado_em: string; tipo_evento: string; descricao: string | null }
interface Link { status: string; url: string | null; max_parcelas: number | null; expira_em: string | null; nsu: string | null; pago_em: string | null; erro: string | null }

const dataHora = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{titulo}</h3>
      <div className="text-sm">{children}</div>
    </section>
  );
}
function Par({ k, v }: { k: string; v: ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>;
}
function Erro({ e }: { e: unknown }) {
  return <p className="text-sm text-destructive">{rawMessage(e)}</p>;
}

function endereco(e: Record<string, unknown> | null | undefined) {
  if (!e) return "—";
  const g = (k: string) => (e[k] == null ? "" : String(e[k]));
  const l1 = [g("logradouro") || g("endereco") || g("rua"), g("numero")].filter(Boolean).join(", ");
  const l2 = [g("complemento"), g("bairro")].filter(Boolean).join(" · ");
  const l3 = [g("cidade") || g("municipio"), g("uf")].filter(Boolean).join("/");
  return [l1, l2, l3, g("cep")].filter(Boolean).join(" — ") || "—";
}

/** Sincroniza cod_cadastro + nome dos SKUs (doutrina COD-CADASTRO-É-O-NOME-DO-PRODUTO). */
export function useProdutosPorSku(skus: string[]) {
  return useQuery({
    queryKey: ["vd-produtos-sku", [...skus].sort().join(",")],
    enabled: skus.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("sncf_produtos" as never).select("sku, cod_cadastro, nome_comercial").in("sku", skus);
      if (error) throw error;
      return new Map(((data ?? []) as unknown as Prod[]).map((p) => [p.sku, p]));
    },
  });
}

export function GavetaPedidoVD({ linha, modalLabel, onClose, acoes, devolucao }: {
  linha: LinhaGaveta | null;
  modalLabel: (m: string | null) => string;
  onClose: () => void;
  acoes?: ReactNode;
  devolucao?: DevolucaoVD | null;
}) {
  const id = linha?.id;
  const itensQ = useQuery({
    queryKey: ["vd-gaveta-itens", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("pedido_itens" as never)
        .select("id, sku, descricao, quantidade, valor_unitario, subtotal").eq("pedido_id", id as string).order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as Item[];
    },
  });
  const skus = Array.from(new Set((itensQ.data ?? []).map((i) => i.sku)));
  const prodQ = useProdutosPorSku(skus);
  const saldoQ = useQuery({
    queryKey: ["vd-gaveta-saldo", skus.join(",")],
    enabled: skus.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("vw_estoque_centro" as never).select("sku, disponivel").eq("centro", "SITE-SP").in("sku", skus);
      if (error) throw error;
      return new Map(((data ?? []) as unknown as { sku: string; disponivel: number | null }[]).map((r) => [r.sku, Number(r.disponivel ?? 0)]));
    },
  });
  const linkQ = useQuery({
    queryKey: ["vd-gaveta-link", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("pagamento_link" as never)
        .select("status, url, max_parcelas, expira_em, nsu, pago_em, erro").eq("pedido_id", id as string)
        .order("criado_em", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Link | null;
    },
  });
  const pixSafraQ = usePixSafrapay(linha?.pagamento === "pix" ? id : null);
  const cfgPixNoLink = useCfgParcelas().data?.pix_no_link === true;
  const evQ = useQuery({
    queryKey: ["vd-gaveta-eventos", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("pedido_eventos" as never)
        .select("id, criado_em, tipo_evento, descricao").eq("pedido_id", id as string)
        .order("criado_em", { ascending: false }).limit(15);
      if (error) throw error;
      return (data ?? []) as unknown as Evento[];
    },
  });

  const l = linha;
  return (
    <Sheet open={!!l} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 bg-card p-0 text-card-foreground sm:max-w-[480px]">
        <SheetHeader className="border-b bg-muted p-4">
          <SheetTitle>{l?.id_externo}</SheetTitle>
          <SheetDescription>{l?.cliente_nome ?? "—"} · <span className="tabular-nums">{formatBRL(l?.valor_liquido ?? null)}</span></SheetDescription>
        </SheetHeader>
        {l && (
          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            <Secao titulo="Itens">
              {itensQ.isLoading ? <Skeleton className="h-16 w-full" /> : itensQ.isError ? <Erro e={itensQ.error} /> : (itensQ.data ?? []).length === 0 ? (
                <p className="text-muted-foreground">Nenhum item.</p>
              ) : (
                <div className="divide-y rounded-md border bg-card">
                  {prodQ.isError && <Erro e={prodQ.error} />}
                  {saldoQ.isError && <Erro e={saldoQ.error} />}
                  {itensQ.data!.map((i) => {
                    const p = prodQ.data?.get(i.sku);
                    const saldo = saldoQ.data?.get(i.sku) ?? (saldoQ.data ? 0 : null);
                    const falta = saldo != null && saldo < Number(i.quantidade);
                    return (
                      <div key={i.id} className="space-y-1 p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium">{p?.cod_cadastro ?? i.sku}</div>
                            <div className="text-xs text-muted-foreground">{p?.nome_comercial ?? i.descricao ?? "—"}</div>
                          </div>
                          {falta && <span className="shrink-0 text-xs text-destructive-strong">Sem saldo no Site SP</span>}
                        </div>
                        <div className="grid grid-cols-[1fr_auto] gap-3 text-xs tabular-nums text-muted-foreground">
                          <span className="text-right">{Number(i.quantidade)} × {formatBRL(i.valor_unitario)}</span>
                          <span className="min-w-24 text-right text-foreground">{formatBRL(i.subtotal)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Secao>

            <Secao titulo="Cliente">
              <Par k="Nome" v={l.cliente_nome ?? "—"} />
              <Par k="Telefone" v={l.cliente_telefone ?? "—"} />
              <Par k="CPF" v={l.cliente_cpf_mascarado ?? "—"} />
            </Secao>

            <Secao titulo="Entrega">
              <Par k="Modal" v={modalLabel(l.modal)} />
              {l.modal !== "retirada" && <Par k="Endereço" v={endereco(l.endereco_entrega)} />}
              <Par k="Frete cobrado" v={<span className="tabular-nums">{l.frete ? (l.frete.gratis || Number(l.frete.cobrado ?? 0) === 0 ? "Grátis" : formatBRL(l.frete.cobrado)) : "—"}</span>} />
              <Par k="Custo do frete" v={<span className="tabular-nums">{l.frete?.custo != null ? formatBRL(l.frete.custo) : "—"}</span>} />
              {(() => {
                const ee = (l.endereco_entrega ?? {}) as any;
                const bf = ee?.frete?.beneficio;
                const dp = ee?.desconto;
                const txtBen = (b: any) => b.tipo === "gratis" ? "Grátis" : b.tipo === "pct" ? `${b.valor_informado ?? b.valor}%` : formatBRL(b.valor_informado ?? b.valor);
                return (
                  <>
                    {bf && bf.tipo && bf.tipo !== "nenhum" && (
                      <Par k="Benefício no frete" v={<span><span className="tabular-nums">{txtBen(bf)}</span>{bf.motivo && <span className="block text-xs text-muted-foreground">{bf.motivo}</span>}</span>} />
                    )}
                    {dp && Number(dp.valor ?? 0) > 0 && (
                      <Par k="Desconto do pedido" v={<span><span className="tabular-nums">−{formatBRL(dp.valor)}{dp.tipo === "pct" ? ` (${dp.valor_informado}%)` : ""}</span>{dp.motivo && <span className="block text-xs text-muted-foreground">{dp.motivo}</span>}</span>} />
                    )}
                  </>
                );
              })()}
            </Secao>

            <Secao titulo="Pagamento">
              <Par k="Forma" v={rotuloFormaPagamento(l.pagamento, cfgPixNoLink)} />
              <Par k="Status" v={l.pagamento_confirmado_em ? `Confirmado em ${dataHora(l.pagamento_confirmado_em)}` : "Aguardando"} />
              {(l.pagamento === "cartao" || linkQ.data) && (
                linkQ.isLoading ? <Skeleton className="h-10 w-full" /> : linkQ.isError ? <Erro e={linkQ.error} /> : !linkQ.data ? (
                  <Par k="Link" v="Nenhum link gerado" />
                ) : (
                  <>
                    {linkQ.data.erro?.startsWith("Pago via PIX no link") && (
                      <p className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-warning-strong">{linkQ.data.erro}</p>
                    )}
                    <Par k="Link" v={linkQ.data.status === "pago" ? (l.pagamento === "pix" || linkQ.data.erro?.startsWith("Pago via PIX no link") ? "pago com PIX" : "pago com cartão") : linkQ.data.status} />
                    {linkQ.data.url && <Par k="URL" v={<a className="break-all text-primary underline-offset-2 hover:underline" href={linkQ.data.url} target="_blank" rel="noreferrer">abrir link</a>} />}
                    {l.pagamento === "cartao" && <Par k="Parcelas" v={linkQ.data.max_parcelas && linkQ.data.max_parcelas > 1 ? `em até ${linkQ.data.max_parcelas}x` : "à vista"} />}
                    <Par k="Validade" v={linkQ.data.expira_em ? `vale até ${dataHora(linkQ.data.expira_em)}` : "—"} />
                    <Par k="NSU" v={<span className="tabular-nums">{linkQ.data.nsu ?? "—"}</span>} />
                  </>
                )
              )}
              {l.pagamento === "pix" && !linkQ.data && (pixSafraQ.data ? (
                <Par k="PIX" v={<SeloConfirmacaoAutomatica />} />
              ) : (
                <Par k="PIX" v={l.link_pagamento ? <a className="text-primary underline-offset-2 hover:underline" href={l.link_pagamento} target="_blank" rel="noreferrer">abrir link</a> : "—"} />
              ))}
            </Secao>

            <Secao titulo="Fiscal">
              <Par k="NF" v={<span className="tabular-nums">{l.nf_numero ?? "—"}</span>} />
              <Par k="Nº Bling" v={<span className="tabular-nums">{l.bling_pedido_numero ?? "—"}</span>} />
            </Secao>

            {devolucao && <Secao titulo="Devolução"><TrilhaDevolucao devolucao={devolucao} /></Secao>}

            <Secao titulo="Histórico">
              {evQ.isLoading ? <Skeleton className="h-16 w-full" /> : evQ.isError ? <Erro e={evQ.error} /> : (evQ.data ?? []).length === 0 ? (
                <p className="text-muted-foreground">Sem eventos.</p>
              ) : (
                <ol className="space-y-2">
                  {evQ.data!.map((e) => (
                    <li key={e.id} className="border-l-2 pl-2">
                      <div className="text-xs tabular-nums text-muted-foreground">{dataHora(e.criado_em)}</div>
                      <div>{e.descricao ?? e.tipo_evento}</div>
                    </li>
                  ))}
                </ol>
              )}
            </Secao>
          </div>
        )}
        {acoes && <SheetFooter className="flex flex-row flex-wrap gap-2 border-t p-4 sm:justify-start">{acoes}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
