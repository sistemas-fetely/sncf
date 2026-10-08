import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Upload } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { chamarFuncao, motivoDaFalha } from "@/components/acervo/promocaoFase";
import { calcularPrevia, lerPlanilha, montarNascimentos, validarFormatoPrevia, type ItemPrevia, type LinhaPlanilha, type MontagemNascimentos, type Previa } from "@/lib/acervo/importar-planilha-cadastro";
import { supabase } from "@/integrations/supabase/client";
import { gerarPlanilhaCadastro, nomeArquivoCadastro, type RespostaExport } from "@/lib/acervo/planilha-cadastro-xlsx";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; onConcluido: () => void }
interface Resultado { nasceram: string[]; gravados: string[]; promovidos: string[]; recusas: { cod: string; motivo: string }[] }
interface DryNascer {
  linhas?: number; nasceram?: number; nasceriam?: number; codigos_consumidos?: number; gs1_livres_depois?: number | null;
  alocacao_prevista?: { linha: number; cod_cadastro: string; nome: string; ean?: string | null; dun?: string | null }[];
  problemas?: { linha: number; erro?: string; aviso?: string }[];
  pode_confirmar?: boolean;
  produtos?: { cod_cadastro?: string; ean?: string | null }[];
}

async function nascerLote(produtos: Record<string, unknown>[], dry: boolean): Promise<DryNascer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("fn_nascer_produtos_lote", { p_produtos: produtos, p_dry_run: dry });
  if (error) throw new Error([error.message, error.details, error.hint].filter(Boolean).join(" — "));
  return (data ?? {}) as DryNascer;
}

const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v));
const legivel = (s: string | null) => (s ? s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "");

export function ImportarPlanilhaCadastroDialog({ open, onOpenChange, onConcluido }: Props) {
  const [lendo, setLendo] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("Importação de planilha de cadastro");
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [confirmarSug, setConfirmarSug] = useState(false);
  const [linhasLidas, setLinhasLidas] = useState<LinhaPlanilha[]>([]);
  const [montagem, setMontagem] = useState<MontagemNascimentos | null>(null);
  const [dryNascer, setDryNascer] = useState<DryNascer | null>(null);
  const [erroNascer, setErroNascer] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  const reset = () => { setMontagem(null); setDryNascer(null); setErroNascer(null); setLinhasLidas([]); setPrevia(null); setErro(null); setProgresso(null); setResultado(null); setConfirmarSug(false); };
  const fechar = (v: boolean) => { if (progresso && !resultado) return; if (!v) reset(); onOpenChange(v); };

  async function carregar(arquivo: File) {
    reset(); setLendo(true);
    try {
      const linhas = await lerPlanilha(arquivo);
      if (!linhas.length) throw new Error("Nenhuma linha preenchida na planilha.");
      setLinhasLidas(linhas);
      const m = montarNascimentos(linhas, motivo);
      setMontagem(m);
      if (m.nascimentos.length) {
        try { setDryNascer(await nascerLote(m.nascimentos.map((n) => n.payload), true)); }
        catch (e) { setErroNascer(e instanceof Error ? e.message : String(e)); }
      }
      const cods = [...new Set(linhas.map((l) => l.cod).filter(Boolean))] as string[];
      let r: RespostaExport = { ok: true, ficha: [], opcoes: {}, produtos: [] };
      if (cods.length) {
        try { r = (await chamarFuncao("exportar-planilha-produto", { cods })) as unknown as RespostaExport; }
        catch (e) { throw new Error(`Leitura do FOP falhou: ${motivoDaFalha(e)}`); }
      }
      setPrevia(await validarFormatoPrevia(calcularPrevia(linhas, r), async (cod, campos) => {
        const { data, error } = await (supabase.rpc as any)("fn_produto_formato_validar_patch", { p_cod_cadastro: cod, p_campos: campos });
        if (error) throw new Error(error.message);
        return (data ?? []) as { campo: string; valor: unknown; motivo: string }[];
      }));
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErro(m); toast.error(m);
    } finally { setLendo(false); }
  }

  const semErro = (previa?.itens ?? []).filter((i) => !i.erros.length);
  const mantidas = semErro.flatMap((i) => i.sugestoes_mantidas.map((m) => ({ ...m, cod: i.cod, sku: i.sku })));
  const efetivas = (i: ItemPrevia) => (confirmarSug ? [...i.mudancas, ...i.sugestoes_mantidas] : i.mudancas);
  const validos: ItemPrevia[] = semErro.filter((i) => efetivas(i).length || i.liberar);

  const nascimentos = montagem?.nascimentos ?? [];
  const inexistentes = (previa?.itens ?? []).filter((i) => i.inexistente);
  const errosNascer = [...(montagem?.erros ?? []), ...((dryNascer?.problemas ?? []).filter((p) => p.erro).map((p) => ({ linha: p.linha, erro: p.erro! })))];
  const avisosNascer = (dryNascer?.problemas ?? []).filter((p) => p.aviso && !p.erro);
  const nascerBloqueado = nascimentos.length > 0 && (!!erroNascer || !dryNascer || dryNascer.pode_confirmar === false || errosNascer.length > 0);
  const bloqueado = inexistentes.length > 0 || nascerBloqueado || (montagem?.erros.length ?? 0) > 0;
  const linhaParaNasc = new Map(nascimentos.map((n) => [n.linha, n]));

  async function confirmar() {
    if (!motivo.trim()) { toast.error("Informe o motivo."); return; }
    if (bloqueado) { toast.error("Corrija os erros da planilha antes de confirmar."); return; }
    const loteId = crypto.randomUUID();
    const res: Resultado = { nasceram: [], gravados: [], promovidos: [], recusas: [] };
    if (nascimentos.length) {
      setProgresso({ feito: 0, total: validos.length + 1 });
      try {
        const payloads = montarNascimentos(linhasLidas, motivo).nascimentos.map((n) => n.payload);
        const r = await nascerLote(payloads, false);
        res.nasceram = (r.produtos ?? [])
          .map((p) => { const cod = String(p.cod_cadastro ?? "").trim(); return p.ean ? `${cod} · ${p.ean}` : cod; })
          .filter(Boolean);
        if (!res.nasceram.length && r.nasceram) res.nasceram = [`${r.nasceram} produto(s)`];
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        res.recusas.push({ cod: "Nascimentos (lote inteiro desfeito)", motivo: m });
        setResultado(res); setProgresso(null); onConcluido();
        toast.error(`Nascimento recusado — nada foi gravado: ${m}`);
        return;
      }
    }
    setProgresso({ feito: 0, total: validos.length });
    for (let i = 0; i < validos.length; i++) {
      const it = validos[i];
      let gravouOk = true;
      const muds = efetivas(it);
      if (muds.length) {
        try {
          await chamarFuncao("gravar-produto-fop", {
            cod_cadastro: it.cod, motivo: motivo.trim(), origem: "planilha", lote_id: loteId,
            campos: Object.fromEntries(muds.map((m) => [m.campo, m.para])),
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
    const resumo = `${res.nasceram.length} nascido(s), ${res.gravados.length} enriquecido(s), ${res.promovidos.length} liberado(s)`;
    if (res.recusas.length) toast.error(`${resumo} · ${res.recusas.length} recusa(s) — veja a lista.`);
    else toast.success(`Importação concluída: ${resumo}.`);
  }

  const comErro = (previa?.itens ?? []).filter((i) => i.erros.length && !i.inexistente);
  const semMudanca = semErro.filter((i) => !efetivas(i).length && !i.liberar);

  // Mesmo export do botão "Exportar planilha de cadastro" da Mesa (catálogo inteiro).
  async function baixarPlanilhaAtualizada() {
    setBaixando(true);
    try {
      const { data, error } = await supabase.functions.invoke("exportar-planilha-produto", { body: { colecoes: null, so_aguardando_medicao: false } });
      if (error) {
        let m = error.message;
        try { const ctx = (error as { context?: Response }).context; const j = ctx ? await ctx.json() : null; if (j?.erro) m = j.erro; } catch { /* mantém */ }
        throw new Error(m);
      }
      const r = data as RespostaExport;
      if (!r?.ok) throw new Error(r?.erro ?? "Resposta inválida da exportação");
      if (!r.produtos.length) throw new Error("O FOP não devolveu nenhum produto.");
      const blob = await gerarPlanilhaCadastro(r);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeArquivoCadastro([]); a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      toast.error(m);
    } finally { setBaixando(false); }
  }

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar planilha de cadastro</DialogTitle>
          <DialogDescription>
            Use a planilha exportada pela Mesa. Linha com código enriquece (só o que mudou; vazio não apaga). Linha sem código nasce pela porta única.
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
            {inexistentes.length > 0 && (
              <Alert variant="destructive"><AlertDescription>
                <div className="font-medium">Código inexistente na matriz — importação bloqueada</div>
                {inexistentes.map((i) => <div key={`x${i.linha}`}>Linha {i.linha} · {i.cod}: {i.erros.join("; ")}</div>)}
              </AlertDescription></Alert>
            )}
            <div className="font-medium">✏️ Enriquecem: {validos.length} linha(s)</div>
            <p className="text-muted-foreground">
              {semMudanca.length} sem mudança · {comErro.length} com erro
            </p>
            {mantidas.length > 0 && (
              <div className="rounded-md border border-warning/50 bg-warning/5 p-2 text-xs">
                <div className="mb-1 font-medium">{mantidas.length} sugestão(ões) mantida(s) sem alteração</div>
                {mantidas.map((m) => (
                  <div key={`${m.cod}-${m.campo}`}>{m.cod} <span className="font-mono text-muted-foreground">{m.sku}</span> · {m.rotulo}: <strong>{fmt(m.para)}</strong></div>
                ))}
                <label className="mt-2 flex items-center gap-2 font-medium">
                  <Checkbox checked={confirmarSug} onCheckedChange={(v) => setConfirmarSug(v === true)} disabled={!!progresso} />
                  Confirmar estas sugestões
                </label>
                <p className="mt-1 text-muted-foreground">{confirmarSug ? "Serão gravadas no FOP e marcadas como confirmadas." : "Não serão gravadas; as sugestões seguem abertas."}</p>
              </div>
            )}
            {validos.map((i) => (
              <div key={i.cod} className="rounded-md border p-2">
                <div className="font-medium">{i.cod} <span className="font-mono text-xs text-muted-foreground">{i.sku}</span>
                  {i.liberar && <span className="ml-2 rounded bg-success/15 px-1.5 py-0.5 text-xs text-success">Liberar → {legivel(i.fase_destino)}</span>}</div>
                {efetivas(i).map((m) => (
                  <div key={m.campo} className="text-xs"><span className="text-muted-foreground">{m.rotulo}:</span> {fmt(m.de)} → <strong>{fmt(m.para)}</strong>{m.confirmando_sugestao && <span className="ml-1 text-warning">(confirmando sugestão)</span>}</div>
                ))}
              </div>
            ))}
            {comErro.map((i) => (
              <div key={`e${i.linha}`} className="rounded-md border border-destructive/50 p-2 text-xs">
                <strong>Linha {i.linha} · {i.cod}</strong> — pulada: {i.erros.join("; ")}
              </div>
            ))}
            {(nascimentos.length > 0 || (montagem?.erros.length ?? 0) > 0) && (
              <div className="space-y-2 rounded-md border p-2">
                <div className="font-medium">
                  🐣 Nascem: {nascimentos.length} linha(s) — consomem {dryNascer?.codigos_consumidos ?? nascimentos.length} código(s) do banco GS1
                  {dryNascer?.gs1_livres_depois != null && <> (restam {dryNascer.gs1_livres_depois} depois)</>}
                </div>
                {erroNascer && <Alert variant="destructive"><AlertDescription>{erroNascer}</AlertDescription></Alert>}
                {(dryNascer?.alocacao_prevista?.length ?? 0) > 0 && (
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-muted-foreground"><th className="py-1">Linha</th><th>Código previsto</th><th>EAN</th><th>DUN</th><th>Nome</th><th>Origem</th><th>Inner</th></tr></thead>
                    <tbody>
                      {dryNascer!.alocacao_prevista!.map((a) => {
                        const n = linhaParaNasc.get(a.linha);
                        return (
                          <tr key={a.linha} className="border-t">
                            <td className="py-1">{a.linha}</td><td className="font-mono">{a.cod_cadastro}</td>
                            <td>{fmt(a.ean)}</td><td>{a.dun ? a.dun : "sem caixa master"}</td>
                            <td>{a.nome}</td>
                            <td>{n ? legivel(n.origem) : "—"}</td><td>{fmt(n?.inner_qtd)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {avisosNascer.map((p, k) => (
                  <div key={`a${k}`} className="rounded border border-warning/50 bg-warning/10 p-1.5 text-xs">Linha {p.linha}: {p.aviso}</div>
                ))}
                {errosNascer.map((p, k) => (
                  <div key={`n${k}`} className="rounded border border-destructive/50 bg-destructive/10 p-1.5 text-xs text-destructive">Linha {p.linha}: {p.erro}</div>
                ))}
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
            <p><strong>Nasceram ({resultado.nasceram.length}):</strong> {resultado.nasceram.join(", ") || "—"}</p>
            <p><strong>Enriquecidos ({resultado.gravados.length}):</strong> {resultado.gravados.join(", ") || "—"}</p>
            <p><strong>Liberados ({resultado.promovidos.length}):</strong> {resultado.promovidos.join(", ") || "—"}</p>
            {resultado.nasceram.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => void baixarPlanilhaAtualizada()} disabled={baixando}>
                {baixando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Baixar planilha atualizada
              </Button>
            )}
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
                <Button onClick={() => void confirmar()} disabled={(!validos.length && !nascimentos.length) || bloqueado || !!progresso || !motivo.trim()}>
                  {progresso ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Confirmar ({nascimentos.length + validos.length})
                </Button>
              </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
