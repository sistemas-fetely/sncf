import { useState, Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, AlertTriangle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  normalizarTimeline,
  type EntregaCustoRow,
} from "@/hooks/logistica/useEntregasTransportadora";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function fmt(v: number | null | undefined) {
  return v == null ? "—" : BRL.format(Number(v));
}
function fmtData(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtDataHora(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function faseBadge(fase: string | null): { label: string; cls: string } {
  switch (fase) {
    case "entregue":
      return { label: "Entregue", cls: "border-success/40 text-success bg-success/5" };
    case "em_transito":
      return { label: "Em trânsito", cls: "border-info/40 text-info bg-info/5" };
    case "atencao":
      return { label: "Atenção", cls: "border-destructive/40 text-destructive bg-destructive/5" };
    case "sem_conhecimento":
      return { label: "Sem conhecimento", cls: "border-warning/40 text-warning bg-warning/5" };
    default:
      return { label: fase ?? "—", cls: "border-border text-muted-foreground" };
  }
}

function pctClass(pct: number) {
  if (pct >= 15) return "bg-destructive/10 text-destructive";
  if (pct >= 8) return "bg-warning/10 text-warning";
  return "bg-success/10 text-success";
}

function chaveLinha(e: EntregaCustoRow, i: number) {
  return e.rastreio_id ?? e.frete_id ?? `${e.nf_numero ?? "sem-nf"}-${i}`;
}

export function TabelaEntregas({ entregas }: { entregas: EntregaCustoRow[] }) {
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpandido((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="w-8"></TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Destino</TableHead>
            <TableHead>NF</TableHead>
            <TableHead>CT-e</TableHead>
            <TableHead>CIF/FOB</TableHead>
            <TableHead>Prazo</TableHead>
            <TableHead>Ocorrência</TableHead>
            <TableHead className="text-right">Frete R$</TableHead>
            <TableHead className="text-right">% NF</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entregas.map((e, i) => {
            const id = chaveLinha(e, i);
            const aberto = expandido.has(id);
            const st = faseBadge(e.fase_entrega ?? null);
            const atencao = e.fase_entrega === "atencao";
            const fob = (e.tipo_frete ?? "").toUpperCase() === "FOB";
            const pct = e.pct_frete_nf == null ? null : Number(e.pct_frete_nf);
            const eventos = normalizarTimeline(e.timeline_json);
            return (
              <Fragment key={id}>
                <TableRow
                  className={cn(
                    "text-xs cursor-pointer",
                    atencao && "bg-destructive/5 hover:bg-destructive/10"
                  )}
                  onClick={() => toggle(id)}
                >
                  <TableCell>
                    {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] border inline-flex items-center gap-1", st.cls)}
                    >
                      {atencao && <AlertTriangle className="h-3 w-3" />}
                      {st.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">{e.destinatario ?? "—"}</TableCell>
                  <TableCell>
                    {e.cidade_destino ?? "—"}{e.uf_destino ? ` / ${e.uf_destino}` : ""}
                  </TableCell>
                  <TableCell className="font-mono">{e.nf_numero ?? "—"}</TableCell>
                  <TableCell className="font-mono">{e.cte_numero ?? "—"}</TableCell>
                  <TableCell>
                    {e.tipo_frete ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] border",
                          fob
                            ? "border-warning/50 text-warning bg-warning/5"
                            : "border-border text-muted-foreground"
                        )}
                        title={fob ? "FOB — o pagante do frete deveria ser o destinatário" : undefined}
                      >
                        {e.tipo_frete}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{fmtData(e.previsao_entrega)}</TableCell>
                  <TableCell className={cn("max-w-[240px] truncate", atencao && "text-destructive")}>
                    {e.ocorrencia_codigo ? `${e.ocorrencia_codigo} · ` : ""}
                    {e.ocorrencia_ativa ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.custo_pendente ? (
                      <div className="flex flex-col items-end">
                        <span>—</span>
                        <span className="text-[10px] text-muted-foreground">custo pendente</span>
                      </div>
                    ) : (
                      fmt(e.frete_total)
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {pct != null && !e.custo_pendente && (
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", pctClass(pct))}>
                        {pct.toFixed(1)}%
                      </span>
                    )}
                  </TableCell>
                </TableRow>

                {atencao && e.motivo_atencao && (
                  <TableRow className="bg-destructive/5 hover:bg-destructive/5">
                    <TableCell />
                    <TableCell colSpan={10} className="pt-0 text-xs text-destructive">
                      <span className="font-medium">Motivo:</span> {e.motivo_atencao}
                    </TableCell>
                  </TableRow>
                )}

                {aberto && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={11}>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs p-2">
                        <div><span className="text-muted-foreground">Frete peso:</span> {fmt(e.frete_peso)}</div>
                        <div><span className="text-muted-foreground">GRIS:</span> {fmt(e.gris)}</div>
                        <div><span className="text-muted-foreground">Ad Valorem:</span> {fmt(e.ad_valorem)}</div>
                        <div><span className="text-muted-foreground">ITR:</span> {fmt(e.itr)}</div>
                        <div><span className="text-muted-foreground">TDE:</span> {fmt(e.tde)}</div>
                        <div><span className="text-muted-foreground">Pedágio:</span> {fmt(e.valor_pedagio)}</div>
                        <div><span className="text-muted-foreground">Imposto:</span> {fmt(e.valor_imposto)}</div>
                        <div><span className="text-muted-foreground">Redespacho:</span> {fmt(e.valor_redespacho)}</div>
                        <div><span className="text-muted-foreground">Peso real:</span> {e.peso_real ?? "—"} kg</div>
                        <div><span className="text-muted-foreground">Peso taxado:</span> {e.peso_taxado ?? "—"} kg</div>
                        <div><span className="text-muted-foreground">Emissão CT-e:</span> {fmtData(e.cte_emissao)}</div>
                        <div><span className="text-muted-foreground">Data ocorrência:</span> {fmtData(e.ocorrencia_data)}</div>
                      </div>

                      <div className="border-t mt-2 pt-3 px-2 pb-2 space-y-3">
                        <div className="text-xs font-medium">Rastreio</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div className="md:col-span-2">
                            <span className="text-muted-foreground">Último evento:</span>{" "}
                            {e.ultimo_evento_descricao ?? "—"}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Quando:</span>{" "}
                            {fmtDataHora(e.ultimo_evento_em)}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Previsão:</span>{" "}
                            {fmtData(e.previsao_entrega)}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Entrega:</span>{" "}
                            {fmtData(e.data_entrega)}
                          </div>
                          <div className="md:col-span-2">
                            <span className="text-muted-foreground">Recebedor:</span>{" "}
                            {e.recebedor ?? "—"}
                          </div>
                        </div>

                        {e.divergencia_cabecalho_timeline && (
                          <div className="text-xs text-warning">
                            Divergência entre o cabeçalho da transportadora e a linha do tempo.
                          </div>
                        )}

                        {e.sync_erro && (
                          <div className="text-xs text-destructive">
                            <span className="font-medium">Erro de sincronização:</span> {e.sync_erro}
                          </div>
                        )}

                        {eventos.length === 0 ? (
                          <div className="text-xs text-muted-foreground">
                            Nenhum evento de rastreio registrado.
                          </div>
                        ) : (
                          <ol className="space-y-2 border-l pl-4 ml-1">
                            {eventos.map((ev, idx) => (
                              <li key={idx} className="relative text-xs">
                                <Circle
                                  className={cn(
                                    "absolute -left-[21px] top-1 h-2 w-2 fill-current",
                                    ev.data ? "text-primary" : "text-muted-foreground"
                                  )}
                                />
                                <div className={cn(!ev.data && "text-muted-foreground")}>
                                  {ev.descricao ?? "Evento sem descrição"}
                                </div>
                                <div className="text-muted-foreground">
                                  {ev.data ? fmtDataHora(ev.data) : "sem data registrada"}
                                  {ev.local ? ` · ${ev.local}` : ""}
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
