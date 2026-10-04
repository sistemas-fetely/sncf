import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { chamarFuncao, motivoDaFalha } from "@/components/acervo/promocaoFase";
import { calcularPrevia, lerPlanilha, type ItemPrevia, type Previa } from "@/lib/acervo/importar-planilha-cadastro";
import type { RespostaExport } from "@/lib/acervo/planilha-cadastro-xlsx";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; onConcluido: () => void }
interface Resultado { gravados: string[]; promovidos: string[]; recusas: { cod: string; motivo: string }[] }

const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v));
const legivel = (s: string | null) => (s ? s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "");

export function ImportarPlanilhaCadastroDialog({ open, onOpenChange, onConcluido }: Props) {
  const qc = useQueryClient();
  const [lendo, setLendo] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("Importação de planilha de cadastro");
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const reset = () => { setPrevia(null); setErro(null); setProgresso(null); setResultado(null); };
  const fechar = (v: boolean) => { if (progresso && !resultado) return; if (!v) reset(); onOpenChange(v); };

  async function carregar(arquivo: File) {
    reset(); setLendo(true);
    try {
      const linhas = await lerPlanilha(arquivo);
      if (!linhas.length) throw new Error("Nenhuma linha preenchida a partir da linha 4.");
      const cods = [...new Set(linhas.map((l) => l.cod).filter(Boolean))] as string[];
      let r: RespostaExport = { ok: true, ficha: [], opcoes: {}, produtos: [] };
      if (cods.length) {
        try { r = (await chamarFuncao("exportar-planilha-produto", { cods })) as unknown as RespostaExport; }
        catch (e) { throw new Error(`Leitura do FOP falhou: ${motivoDaFalha(e)}`); }
      }
      setPrevia(calcularPrevia(linhas, r));
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErro(m); toast.error(m);
    } finally { setLendo(false); }
  }

  const validos: ItemPrevia[] = (previa?.itens ?? []).filter((i) => !i.erros.length && (i.mudancas.length || i.liberar));

  async function confirmar() {
    if (!motivo.trim()) { toast.error("Informe o motivo."); return; }
    const loteId = crypto.randomUUID();
    const res: Resultado = { gravados: [], promovidos: [], recusas: [] };
    setProgresso({ feito: 0, total: validos.length });
    for (let i = 0; i < validos.length; i++) {
      const it = validos[i];
      let gravouOk = true;
      if (it.mudancas.length) {
        try {
          await chamarFuncao("gravar-produto-fop", {
            cod_cadastro: it.cod, motivo: motivo.trim(), origem: "planilha", lote_id: loteId,
            campos: Object.fromEntries(it.mudancas.map((m) => [m.campo, m.para])),
          });
          res.gravados.push(it.cod);
        } catch (e) { gravouOk = false; res.recusas.push({ cod: it.cod, motivo: `gravação: ${motivoDaFalha(e)}` }); }
      }
      if (it.liberar && gravouOk && it.fase_destino) {
        try {
          await chamarFuncao("promover-fase-produto", { sku: it.sku, fase_destino: it.fase_destino, motivo: motivo.trim() });
          res.promovidos.push(it.cod);
        } catch (e) { res.recusas.push({ cod: it.cod, motivo: `liberação: ${motivoDaFalha(e)}` }); }
      }
      setProgresso({ feito: i + 1, total: validos.length });
    }
    setResultado(res);
    onConcluido();
    void qc.invalidateQueries();
    if (res.recusas.length) toast.error(`${res.recusas.length} recusa(s) na importação — veja a lista.`);
    else toast.success(`Importação concluída: ${res.gravados.length} gravados, ${res.promovidos.length} liberados.`);
  }

  const comErro = (previa?.itens ?? []).filter((i) => i.erros.length);
  const semMudanca = (previa?.itens ?? []).filter((i) => !i.erros.length && !i.mudancas.length && !i.liberar);

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar planilha de cadastro</DialogTitle>
          <DialogDescription>
            Use a planilha exportada pela Mesa. Só os campos que mudaram em relação ao FOP são gravados; célula vazia não apaga nada.
          </DialogDescription>
        </DialogHeader>

        {!resultado && (
          <Input type="file" accept=".xlsx" disabled={lendo || !!progresso}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void carregar(f); e.target.value = ""; }} />
        )}
        {lendo && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Lendo planilha e valores atuais do FOP…</p>}
        {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}

        {previa && !resultado && (
          <div className="max-h-[50vh] space-y-3 overflow-auto text-sm">
            <p className="text-muted-foreground">
              {validos.length} produto(s) a processar · {semMudanca.length} sem mudança · {comErro.length} com erro · {previa.novos.length} produto(s) novo(s) ignorado(s)
            </p>
            {validos.map((i) => (
              <div key={i.cod} className="rounded-md border p-2">
                <div className="font-medium">{i.cod} <span className="font-mono text-xs text-muted-foreground">{i.sku}</span>
                  {i.liberar && <span className="ml-2 rounded bg-success/15 px-1.5 py-0.5 text-xs text-success">Liberar → {legivel(i.fase_destino)}</span>}</div>
                {i.mudancas.map((m) => (
                  <div key={m.campo} className="text-xs"><span className="text-muted-foreground">{m.rotulo}:</span> {fmt(m.de)} → <strong>{fmt(m.para)}</strong></div>
                ))}
              </div>
            ))}
            {comErro.map((i) => (
              <div key={`e${i.linha}`} className="rounded-md border border-destructive/50 p-2 text-xs">
                <strong>Linha {i.linha} · {i.cod}</strong> — pulada: {i.erros.join("; ")}
              </div>
            ))}
            {previa.novos.length > 0 && (
              <div className="rounded-md border p-2 text-xs text-muted-foreground">
                Linhas {previa.novos.join(", ")}: produto novo — ainda não suportado.
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium">Motivo</label>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={!!progresso} />
            </div>
          </div>
        )}

        {progresso && (
          <div className="space-y-1">
            <Progress value={progresso.total ? (progresso.feito / progresso.total) * 100 : 100} />
            <p className="text-xs text-muted-foreground">{progresso.feito} de {progresso.total}</p>
          </div>
        )}

        {resultado && (
          <div className="max-h-[50vh] space-y-2 overflow-auto text-sm">
            <p><strong>Gravados ({resultado.gravados.length}):</strong> {resultado.gravados.join(", ") || "—"}</p>
            <p><strong>Liberados ({resultado.promovidos.length}):</strong> {resultado.promovidos.join(", ") || "—"}</p>
            {resultado.recusas.length > 0 && (
              <Alert variant="destructive"><AlertDescription>
                {resultado.recusas.map((r, k) => <div key={k}><strong>{r.cod}</strong>: {r.motivo}</div>)}
              </AlertDescription></Alert>
            )}
          </div>
        )}

        <DialogFooter>
          {resultado
            ? <Button onClick={() => fechar(false)}>Fechar</Button>
            : <>
                <Button variant="outline" onClick={() => fechar(false)} disabled={!!progresso}>Cancelar</Button>
                <Button onClick={() => void confirmar()} disabled={!validos.length || !!progresso || !motivo.trim()}>
                  {progresso ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Confirmar ({validos.length})
                </Button>
              </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
