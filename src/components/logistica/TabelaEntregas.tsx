import { useState, Fragment } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Selo, type EstadoSelo } from "@/components/ui/selo";
import { CelulaDinheiro } from "@/components/ui/celula-dinheiro";
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

/** Sistema Visual Fetely §4 — uma unica coluna de estado, sempre em Selo. */
export function faseSelo(fase: string | null): { label: string; estado: EstadoSelo } {
  switch (fase) {
    case "entregue":
      return { label: "Entregue", estado: "success" };
    case "em_transito":
      return { label: "Em trânsito", estado: "info" };
    case "atencao":
      return { label: "Atenção", estado: "destructive" };
    case "sem_conhecimento":
      return { label: "Sem conhecimento", estado: "warning" };
    default:
      return { label: fase ?? "—", estado: "muted" };
  }
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
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="w-8"></TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Destino</TableHead>
            <TableHead>NF</TableHead>
            <TableHead>CT-e</TableHead>
            <TableHead>Prazo</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Última ocorrência</TableHead>
            <TableHead className="text-right">Frete R$</TableHead>
            <TableHead className="text-right">% NF</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entregas.map((e, i) => {
            const id = chaveLinha(e, i);
            const aberto = expandido.has(id);
            const st = faseSelo(e.fase_entrega ?? null);
            const atencao = e.fase_entrega === "atencao";
            const fob = (e.tipo_frete ?? "").toUpperCase() === "FOB";
            const pct = e.pct_frete_nf == null ? null : Number(e.pct_frete_nf);
            const eventos = normalizarTimeline(e.timeline_json);
            return (
              <Fragment key={id}>
                <TableRow
                  className={cn(
                    "cursor-pointer text-xs",
                    atencao && "bg-destructive/5 hover:bg-destructive/10"
                  )}
                  onClick={() => toggle(id)}
                >
                  <TableCell>
                    {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </TableCell>
                  <TableCell className="max-w-[240px]">
                    <span className="block truncate">{e.destinatario ?? "—"}</span>
                    {e.tipo_frete && (
                      <span
                        className="text-[11px] text-muted-foreground"
                        title={fob ? "FOB — o pagante do frete deveria ser o destinatário" : undefined}
                      >
                        {e.tipo_frete}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {e.cidade_destino ?? "—"}{e.uf_destino ? ` / ${e.uf_destino}` : ""}
                  </TableCell>
                  <TableCell className="font-mono">{e.nf_numero ?? "—"}</TableCell>
                  <TableCell className="font-mono">{e.cte_numero ?? "—"}</TableCell>
                  <TableCell>{fmtData(e.previsao_entrega)}</TableCell>
                  <TableCell>
                    <Selo estado={st.estado} className="gap-1">
                      {atencao && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
                      {st.label}
                    </Selo>
                  </TableCell>
                  <TableCell className={cn("max-w-[240px] truncate", atencao ? "text-destructive" : "text-muted-foreground")}>
                    {e.ocorrencia_codigo ? `${e.ocorrencia_codigo} · ` : ""}
                    {e.ocorrencia_ativa ?? "—"}
                  </TableCell>
                  <CelulaDinheiro
                    valor={e.frete_total}
                    indisponivel={!!e.custo_pendente}
                    nota={e.custo_pendente ? "custo pendente" : undefined}
                  />
                  <TableCell className="text-right tabular-nums">
                    {pct != null && !e.custo_pendente ? (
                      <span className={cn("text-[11px]", pct >= 15 ? "text-destructive" : "text-muted-foreground")}>
                        {pct.toFixed(1)}%
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>

                {atencao && e.motivo_atencao && (
                  <TableRow className="bg-destructive/5 hover:bg-destructive/5">
                    <TableCell />
                    <TableCell colSpan={9} className="pt-0 text-xs text-destructive">
                      <span className="font-medium">Motivo:</span> {e.motivo_atencao}
                    </TableCell>
                  </TableRow>
                )}

                {aberto && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={10}>
                      <div className="grid grid-cols-2 gap-3 p-2 text-xs md:grid-cols-4">
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

                      <div className="mt-2 space-y-3 border-t px-2 pb-2 pt-3">
                        <div className="text-xs font-medium">Rastreio</div>
                        <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
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
                          <ol className="ml-1 space-y-2 border-l pl-4">
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
