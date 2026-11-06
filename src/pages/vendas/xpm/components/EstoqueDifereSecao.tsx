import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Loader2, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface LinhaEstoqueDifere {
  tipo: string; referencia: string; cliente: string | null; estagio_codigo: string | null;
  nf_numero: string | null; cobrancas: number | null; ultima_cobranca_em: string | null;
}

/** referencia = "sku|real|contábil" — chave das ações; Δ = armazém − contábil. */
export function parseEstoqueDifere(p: LinhaEstoqueDifere) {
  const [sku, realS, contS] = p.referencia.split("|");
  const armazem = Number(realS);
  const contabil = Number(contS);
  const [cod, ...resto] = (p.cliente ?? "").split(" · ");
  return { sku: sku || p.estagio_codigo || "", armazem, contabil, delta: armazem - contabil, cod: cod || sku, nome: resto.join(" · ") };
}

export function resumoEstoqueDifere(linhas: LinhaEstoqueDifere[]) {
  return { produtos: linhas.length, unidades: linhas.reduce((s, l) => s + Math.abs(parseEstoqueDifere(l).delta || 0), 0) };
}

const ROTA_CONCILIACAO = "/vendas/produto/estoque/conciliacao";
const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString("pt-BR") : "—");

export function EstoqueDifereSecao({ rotulo, linhas, onFeito }: { rotulo: string; linhas: LinhaEstoqueDifere[]; onFeito: () => Promise<void> }) {
  const [aberto, setAberto] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dlg, setDlg] = useState<{ acao: "cobrar" | "fechar"; refs: string[] } | null>(null);
  const r = resumoEstoqueDifere(linhas);
  const ordenadas = useMemo(() => [...linhas].sort((a, b) => Math.abs(parseEstoqueDifere(b).delta) - Math.abs(parseEstoqueDifere(a).delta)), [linhas]);
  const todasSel = ordenadas.length > 0 && ordenadas.every((l) => sel.has(l.referencia));

  return (
    <section className="space-y-2 rounded-md border">
      <button type="button" onClick={() => setAberto(!aberto)} className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/50">
        {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <h3 className="text-sm font-semibold">{rotulo} <span className="font-normal text-muted-foreground">· {fmt(r.produtos)} produtos · {fmt(r.unidades)} un</span></h3>
      </button>
      {aberto && (
        <div className="space-y-2 px-3 pb-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 gap-1" disabled={sel.size === 0} onClick={() => setDlg({ acao: "cobrar", refs: [...sel] })}>
              <Megaphone className="h-3.5 w-3.5" />Cobrar XPM · {sel.size}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"><Checkbox checked={todasSel} onCheckedChange={(v) => setSel(v ? new Set(ordenadas.map((l) => l.referencia)) : new Set())} /></TableHead>
                  <TableHead>Código</TableHead><TableHead>Produto</TableHead>
                  <TableHead className="text-right">Contábil</TableHead><TableHead className="text-right">Armazém</TableHead><TableHead className="text-right">Δ</TableHead>
                  <TableHead>NF pendente</TableHead><TableHead>Cobrado</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenadas.map((l) => {
                  const x = parseEstoqueDifere(l);
                  return (
                    <TableRow key={l.referencia} data-foco-id={l.referencia}>
                      <TableCell><Checkbox checked={sel.has(l.referencia)} onCheckedChange={(v) => { const n = new Set(sel); v ? n.add(l.referencia) : n.delete(l.referencia); setSel(n); }} /></TableCell>
                      <TableCell className="font-medium">{x.cod}</TableCell>
                      <TableCell className="max-w-[260px] truncate" title={x.nome}>{x.nome || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(x.contabil)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(x.armazem)}</TableCell>
                      <TableCell className={cn("text-right font-medium tabular-nums", x.delta < 0 ? "text-destructive" : "text-warning")}>{x.delta > 0 ? "+" : ""}{fmt(x.delta)}</TableCell>
                      <TableCell className="text-xs">{l.nf_numero ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{Number(l.cobrancas ?? 0) > 0 ? `${l.cobrancas} / ${l.ultima_cobranca_em ? new Date(l.ultima_cobranca_em).toLocaleDateString("pt-BR") : "—"}` : "—"}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 gap-1 px-2" onClick={() => setDlg({ acao: "cobrar", refs: [l.referencia] })}><Megaphone className="h-3.5 w-3.5" />Cobrar XPM</Button>
                          <Button size="sm" variant="outline" className="h-7 gap-1 px-2" asChild>
                            <Link to={`${ROTA_CONCILIACAO}?centro_card=XPM-SC&q=${encodeURIComponent(x.cod)}`}><ExternalLink className="h-3.5 w-3.5" />Ajustar pelo armazém</Link>
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 gap-1 px-2" onClick={() => setDlg({ acao: "fechar", refs: [l.referencia] })}><CheckCircle2 className="h-3.5 w-3.5" />Fechar</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {dlg && <DialogDifere acao={dlg.acao} refs={dlg.refs} onClose={() => setDlg(null)} onFeito={async () => { setSel(new Set()); await onFeito(); }} />}
    </section>
  );
}

function DialogDifere({ acao, refs, onClose, onFeito }: { acao: "cobrar" | "fechar"; refs: string[]; onClose: () => void; onFeito: () => Promise<void> }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const invalido = acao === "fechar" && texto.trim().length === 0;

  const enviar = async () => {
    setEnviando(true);
    const erros: string[] = [];
    let ok = 0;
    for (const ref of refs) {
      const { error } = await (supabase as any).rpc("fn_xpm_pendencia_acao", {
        p_tipo: "estoque_difere", p_referencia: ref, p_acao: acao,
        p_motivo: acao === "fechar" ? texto.trim() : null,
        p_observacao: acao === "cobrar" ? texto.trim() || null : null,
        p_motivo_pausa_id: null,
      });
      if (error) erros.push(`${ref.split("|")[0]}: ${rawMessage(error)}`); else ok++;
    }
    setEnviando(false);
    if (ok) toast.success(`${acao === "cobrar" ? "Cobrança registrada" : "Pendência fechada"} · ${ok}`);
    if (erros.length) toast.error(`${erros.length} falharam`, { description: erros.slice(0, 5).join("\n") });
    await onFeito();
    if (!erros.length) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{acao === "cobrar" ? "Cobrar XPM" : "Fechar pendência"}</DialogTitle>
          <DialogDescription>Estoque difere do armazém · {refs.length} {refs.length === 1 ? "produto" : "produtos"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="ed-texto">{acao === "cobrar" ? "Observação (opcional)" : "Motivo*"}</Label>
          <Textarea id="ed-texto" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <DialogFooter>
          <Button disabled={invalido || enviando} onClick={enviar} className="gap-1">
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}{acao === "cobrar" ? "Registrar cobrança" : "Fechar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
