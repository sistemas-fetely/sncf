import { ArrowRight, AlertTriangle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import type { FaseTransferencia, TransferenciaAndamento } from "./painelRegras";

export function AndamentoTransferencias({ fases, linhas, fase, onFase, onAbrir, carregando, erro }: {
  fases: FaseTransferencia[]; linhas: TransferenciaAndamento[]; fase: string;
  onFase: (fase: string) => void; onAbrir: (linha: TransferenciaAndamento) => void;
  carregando: boolean; erro: string | null;
}) {
  const filtradas = linhas.filter((t) => !fase || t.fase_codigo === fase);
  return <section className="space-y-4" aria-label="Em andamento">
    <h2 className="text-base font-medium">Em andamento</h2>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {fases.map((f) => {
        const daFase = linhas.filter((t) => t.fase_codigo === f.codigo);
        const atrasadas = daFase.filter((t) => t.atrasada).length;
        return <Card key={f.codigo} className={cn("overflow-hidden", !daFase.length && "opacity-70", fase === f.codigo && "border-primary ring-1 ring-primary")}>
          <Button variant="ghost" className="h-full min-h-28 w-full flex-col items-start justify-start whitespace-normal p-4 text-left" aria-pressed={fase === f.codigo} onClick={() => onFase(fase === f.codigo ? "" : f.codigo)}>
            <span className={cn("text-sm", daFase.length ? "text-foreground" : "text-muted-foreground")}>{f.rotulo}</span>
            <span className={cn("text-2xl font-medium tabular-nums", daFase.length ? "text-foreground" : "text-muted-foreground")}>{daFase.length}</span>
            <span className="min-h-4 text-xs text-destructive">{atrasadas > 0 && `${atrasadas} ${atrasadas === 1 ? "atrasada" : "atrasadas"}`}</span>
          </Button>
        </Card>;
      })}
    </div>
    {carregando ? <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      : erro ? <p className="text-sm text-destructive">Falha ao carregar andamento: {erro}</p>
      : !filtradas.length ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma transferência em andamento</p>
      : <div className="overflow-x-auto"><Table className="min-w-[1050px]">
        <TableHeader><TableRow>
          {["Número", "Finalidade", "Origem → Destino", "Fase", "Dias na fase", "NF", "Previsão", "Qtd peças", "Valor (a custo)"].map((coluna, i) => <TableHead key={coluna} className={i >= 7 ? "text-right" : undefined}>{coluna}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>{filtradas.map((t) => <TableRow key={t.id} data-foco-id={t.id} role="link" tabIndex={0} className="cursor-pointer hover:bg-muted/50" onClick={() => onAbrir(t)} onKeyDown={(e) => { if (e.key === "Enter") onAbrir(t); }}>
          <TableCell className="whitespace-nowrap font-medium text-primary">{t.id_externo ?? "—"}</TableCell>
          <TableCell>{t.finalidade_rotulo ? <Badge variant="secondary" className="whitespace-nowrap">{t.finalidade_rotulo}</Badge> : "—"}</TableCell>
          <TableCell><span className="inline-flex items-center gap-1 whitespace-nowrap">{t.origem_codigo ?? "—"}<ArrowRight className="h-3 w-3 text-muted-foreground" />{t.destino_codigo ?? "—"}</span></TableCell>
          <TableCell><Badge variant="outline" className="whitespace-nowrap">{t.fase_rotulo ?? "—"}</Badge></TableCell>
          <TableCell><Tooltip><TooltipTrigger asChild><span tabIndex={0} className={cn("inline-flex items-center gap-1 tabular-nums", t.atrasada && "font-medium text-destructive")}>
            {t.atrasada && <AlertTriangle className="h-3.5 w-3.5" />}{t.dias_na_fase ?? "—"}
          </span></TooltipTrigger><TooltipContent>{t.data_entrega_prevista ? `previsão ${formatDateBR(t.data_entrega_prevista).slice(0, 5)}` : `limite: ${t.dias_alerta ?? "—"} dias`}</TooltipContent></Tooltip></TableCell>
          <TableCell className="tabular-nums">{t.nf_numero ?? "—"}</TableCell>
          <TableCell className="whitespace-nowrap">{formatDateBR(t.data_entrega_prevista)}</TableCell>
          <TableCell className="text-right tabular-nums">{t.qtd_total_pecas ?? "—"}</TableCell>
          <TableCell className="text-right tabular-nums">{formatBRL(t.valor_bruto)}</TableCell>
        </TableRow>)}</TableBody>
      </Table></div>}
  </section>;
}