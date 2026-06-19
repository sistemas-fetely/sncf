import { useState, Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FreteRow } from "@/hooks/logistica/useFretesTransportadora";
import { statusBadge, pctClass } from "./CardFrete";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function fmt(v: number | null | undefined) { return v == null ? "—" : BRL.format(Number(v)); }
function fmtData(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function TabelaFretes({ fretes }: { fretes: FreteRow[] }) {
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpandido((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="w-8"></TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Destino</TableHead>
            <TableHead>NF</TableHead>
            <TableHead>CT-e</TableHead>
            <TableHead>Prazo</TableHead>
            <TableHead>Ocorrência</TableHead>
            <TableHead className="text-right">Frete R$</TableHead>
            <TableHead className="text-right">% NF</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fretes.map((f) => {
            const st = statusBadge(f.classe);
            const pct = f.pct_frete_nf == null ? null : Number(f.pct_frete_nf);
            const aberto = expandido.has(f.id);
            return (
              <Fragment key={f.id}>
                <TableRow className="text-xs cursor-pointer" onClick={() => toggle(f.id)}>
                  <TableCell>
                    {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-[10px] border", st.cls)}>{st.label}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">{f.destinatario ?? "—"}</TableCell>
                  <TableCell>{f.destinatario_cidade ?? "—"}{f.destinatario_uf ? ` / ${f.destinatario_uf}` : ""}</TableCell>
                  <TableCell className="font-mono">{f.nf_numero ?? "—"}</TableCell>
                  <TableCell className="font-mono">{f.cte_numero ?? "—"}</TableCell>
                  <TableCell>{fmtData(f.prazo_entrega)}</TableCell>
                  <TableCell className={cn("max-w-[260px] truncate", f.eh_problema && "text-destructive")}>
                    {f.ocorrencia_codigo ? `${f.ocorrencia_codigo} · ` : ""}{f.ocorrencia_label ?? f.ocorrencia_texto ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(f.frete_total)}</TableCell>
                  <TableCell className="text-right">
                    {pct != null && (
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", pctClass(pct))}>
                        {pct.toFixed(1)}%
                      </span>
                    )}
                  </TableCell>
                </TableRow>
                {aberto && (
                  <TableRow className="bg-muted/30">
                    <TableCell colSpan={10}>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs p-2">
                        <div><span className="text-muted-foreground">Frete peso:</span> {fmt(f.frete_peso)}</div>
                        <div><span className="text-muted-foreground">GRIS:</span> {fmt(f.gris)}</div>
                        <div><span className="text-muted-foreground">Ad Valorem:</span> {fmt(f.ad_valorem)}</div>
                        <div><span className="text-muted-foreground">ITR:</span> {fmt(f.itr)}</div>
                        <div><span className="text-muted-foreground">TDE:</span> {fmt(f.tde)}</div>
                        <div><span className="text-muted-foreground">Pedágio:</span> {fmt(f.valor_pedagio)}</div>
                        <div><span className="text-muted-foreground">Imposto:</span> {fmt(f.valor_imposto)}</div>
                        <div><span className="text-muted-foreground">Redespacho:</span> {fmt(f.valor_redespacho)}</div>
                        <div><span className="text-muted-foreground">Peso real:</span> {f.peso_real ?? "—"} kg</div>
                        <div><span className="text-muted-foreground">Peso taxado:</span> {f.peso_taxado ?? "—"} kg</div>
                        <div><span className="text-muted-foreground">Emissão CT-e:</span> {fmtData(f.cte_emissao)}</div>
                        <div><span className="text-muted-foreground">Data ocorrência:</span> {fmtData(f.ocorrencia_data)}</div>
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
