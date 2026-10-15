import { AlertTriangle, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useRemessaDetalhe } from "@/hooks/logistica/useLogisticaRemessas";
import { brl, dataBr, ddmmHora } from "@/lib/logistica/formato";
import { BadgeAuditoria, ComposicaoFrete } from "./ComposicaoFrete";
import { cn } from "@/lib/utils";

interface Evento { data: string | null; texto: string }

function eventoLivre(e: unknown): Evento {
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const data = (o.data ?? o.data_hora ?? o.dataHora ?? o.dtHrCriado ?? o.em ?? o.quando ?? null) as string | null;
    const partes = [o.descricao, o.local].filter((v) => typeof v === "string" && v.trim()) as string[];
    if (data || partes.length) return { data, texto: partes.join(" · ") || JSON.stringify(o) };
    return { data: null, texto: JSON.stringify(o) };
  }
  return { data: null, texto: String(e) };
}

function Timeline({ eventos }: { eventos: Evento[] }) {
  if (!eventos.length) return <p className="text-xs text-muted-foreground">sem eventos</p>;
  const ord = [...eventos].sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
  return (
    <ul className="space-y-1 text-xs border-l pl-3">
      {ord.map((e, i) => (
        <li key={i}>{e.data && <><span className="tabular-nums text-muted-foreground">{ddmmHora(e.data)}</span> — </>}{e.texto}</li>
      ))}
    </ul>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-medium">{titulo}</h4>
      {children}
    </section>
  );
}

export function RemessaDetalheDrawer({ pedidoId, onClose }: { pedidoId: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useRemessaDetalhe(pedidoId);
  const r = data?.remessa;

  return (
    <Sheet open={!!pedidoId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{r?.referencia ?? "Remessa"}</SheetTitle>
        </SheetHeader>
        {isLoading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando remessa…
          </div>
        ) : error ? (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <div className="flex items-center gap-2 text-destructive font-medium"><AlertTriangle className="h-4 w-4" /> Não foi possível carregar</div>
            <p className="mt-1">{error instanceof Error ? error.message : String(error)}</p>
          </div>
        ) : data ? (
          <div className="mt-4 space-y-6">
            {r && (
              <div className="rounded-lg border bg-card p-3 text-sm space-y-1">
                <div className="font-medium">{r.cliente ?? "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {r.transportadora} · {r.estado_rotulo ?? "sem rastreio"}
                  {r.entregue_em ? ` · entregue em ${dataBr(r.entregue_em)}` : r.previsao_entrega ? ` · previsão ${dataBr(r.previsao_entrega)}` : ""}
                </div>
                <div className="text-xs">
                  Frete cobrado {brl(r.receita_frete)} × custo {brl(r.custo_frete)} ={" "}
                  <span className={cn(r.margem_frete < 0 && "text-destructive")}>{brl(r.margem_frete)}</span>
                </div>
              </div>
            )}

            <Secao titulo="Notas fiscais">
              {!data.nfs?.length ? <p className="text-xs text-muted-foreground">nenhuma NF</p> : (
                <ul className="space-y-1 text-xs">
                  {data.nfs.map((n) => (
                    <li key={n.nf_id} className="flex justify-between gap-2">
                      <span>NF {n.numero}{n.serie ? `/${n.serie}` : ""} · {dataBr(n.emissao)} · {n.situacao}</span>
                      <span className="tabular-nums">{brl(n.valor_nota)}{n.valor_frete ? ` · frete ${brl(n.valor_frete)}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>

            <Secao titulo="Rastreio">
              {!data.cte_api?.length && !data.rastreio_postal?.length ? (
                <p className="text-xs text-muted-foreground">sem rastreio</p>
              ) : (
                <div className="space-y-4">
                  {data.cte_api?.map((c, i) => (
                    <div key={`c${i}`} className="rounded-lg border p-3 space-y-2">
                      <div className="text-xs">
                        <span className="font-medium">CT-e {c.cte_numero ?? "—"}</span> · NF {c.nf_numero} · {c.status ?? "—"}
                        {c.previsao_entrega ? ` · previsão ${dataBr(c.previsao_entrega)}` : ""}
                      </div>
                      {c.ultimo_evento && <div className="text-xs text-muted-foreground">Último: {ddmmHora(c.ultimo_evento_em)} — {c.ultimo_evento}</div>}
                      {c.sync_erro && <div className="text-xs text-destructive">{c.sync_erro}</div>}
                      <Timeline eventos={(c.timeline ?? []).map(eventoLivre)} />
                    </div>
                  ))}
                  {data.rastreio_postal?.map((p) => (
                    <div key={p.codigo} className="rounded-lg border p-3 space-y-2">
                      <div className="text-xs">
                        <span className="font-medium">{p.codigo}</span>{p.servico ? ` · ${p.servico}` : ""} · {p.estado ?? p.status ?? "—"}
                      </div>
                      <Timeline eventos={(p.eventos ?? []).map(eventoLivre)} />
                    </div>
                  ))}
                </div>
              )}
            </Secao>

            <Secao titulo="Documentos de frete">
              {!data.documentos_frete?.length ? <p className="text-xs text-muted-foreground">nenhum documento</p> : (
                <div className="space-y-3">
                  {data.documentos_frete.map((d) => (
                    <div key={d.doc_id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span>
                          <Badge variant="outline" className="text-[10px] mr-1">{d.tipo_doc === "cte" ? "CT-e" : "Postagem"}</Badge>
                          {d.numero ?? "—"} · {dataBr(d.data_doc)} · {d.natureza ?? "—"}
                        </span>
                        <span className="font-medium tabular-nums">{brl(d.valor_doc)}</span>
                      </div>
                      <ComposicaoFrete composicao={d.composicao} />
                      <div className="flex items-center gap-2 text-xs">
                        <BadgeAuditoria status={d.auditoria_status} motivo={d.auditoria_motivo} />
                        {d.auditoria_motivo && <span className="text-muted-foreground">{d.auditoria_motivo}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Secao>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
