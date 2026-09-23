import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * CORRIGIR NO XPM PELA MATRIZ (23/09/2026).
 *
 * SISTEMA SUGERE / HUMANO DECIDE: o diálogo abre sempre em dry-run (nenhum PUT),
 * mostra o de-para campo a campo e só envia depois do clique em Aplicar.
 * A guarda de matriz furada mora na edge; aqui a matriz incompleta só é exibida.
 *
 * A edge tem teto de 200 SKUs por chamada: este componente fatia sozinho,
 * chamando as levas SEQUENCIALMENTE e concatenando os resultados. Se uma
 * leva falhar, para ali e preserva o que já voltou (nunca descarta em silêncio).
 */

export type ProdutoXpm = { sku: string; cod_cadastro: string | null };

type DePara = { campo: string; xpm: unknown; novo: unknown };
type Resultado = { sku: string; status: string; de_para?: DePara[]; bloqueios?: string[]; erro?: string };

const TETO = 200;

type Progresso = { leva: number; total: number };
type Chamada = { resultados: Resultado[]; levaFalha: number | null; erroLeva: string | null };

async function chamar(skus: string[], dry_run: boolean, onProgresso?: (p: Progresso) => void): Promise<Chamada> {
  const levas: string[][] = [];
  for (let i = 0; i < skus.length; i += TETO) levas.push(skus.slice(i, i + TETO));
  const total = levas.length;

  const resultados: Resultado[] = [];
  for (let i = 0; i < total; i++) {
    onProgresso?.({ leva: i + 1, total });
    try {
      const { data, error } = await supabase.functions.invoke("gerar-planilha-xpm", {
        body: { tipo: "atualizar_cadastro_xpm", skus: levas[i], dry_run },
      });
      if (error) throw error;
      if (!data || data.ok !== true) throw data ?? new Error("Resposta vazia da função");
      resultados.push(...((data.resultados ?? []) as Resultado[]));
    } catch (e) {
      // FAIL-LOUD sem perder o feito: devolve o que já voltou + a falha nomeada.
      return { resultados, levaFalha: i + 1, erroLeva: formatError(e) };
    }
  }
  return { resultados, levaFalha: null, erroLeva: null };
}

export function CorrigirXpmLote({ produtos, onFeito }: { produtos: ProdutoXpm[]; onFeito: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [previa, setPrevia] = useState<Resultado[] | null>(null);
  const [final, setFinal] = useState<Resultado[] | null>(null);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cod = (sku: string) => produtos.find(p => p.sku === sku)?.cod_cadastro ?? sku;

  const comDiferenca = (previa ?? []).filter(r => r.status === "tem_diferenca");
  const semDiferenca = (previa ?? []).filter(r => r.status === "sem_diferenca");
  const foraDoXpm = (previa ?? []).filter(r => r.status === "nao_esta_no_xpm");
  const incompletos = (previa ?? []).filter(r => r.status === "matriz_incompleta");
  const outros = (previa ?? []).filter(r => !["tem_diferenca", "sem_diferenca", "nao_esta_no_xpm", "matriz_incompleta"].includes(r.status));

  const zerar = () => { setPrevia(null); setFinal(null); setCarregando(false); setAplicando(false); setProgresso(null); setAviso(null); };

  async function abrir() {
    zerar();
    setAberto(true);
    setCarregando(true);
    try {
      const res = await chamar(produtos.map(p => p.sku), true, setProgresso);
      setPrevia(res.resultados);
      if (res.erroLeva) setAviso(`comparação incompleta: leva ${res.levaFalha} falhou — ${res.erroLeva}`);
    } catch (e) {
      toast.error("Não foi possível comparar com o XPM", { description: formatError(e) });
      setAberto(false);
    } finally {
      setCarregando(false);
      setProgresso(null);
    }
  }

  async function aplicar() {
    const skus = comDiferenca.map(r => r.sku);
    if (!skus.length) return;
    setAplicando(true);
    try {
      const res = await chamar(skus, false, setProgresso);
      setFinal(res.resultados);
      if (res.erroLeva) setAviso(`comparação incompleta: leva ${res.levaFalha} falhou — ${res.erroLeva}`);
      const oks = res.resultados.filter(r => r.status === "ok").length;
      const falhas = res.resultados.filter(r => r.status !== "ok");
      if (falhas.length) toast.error(`${oks} corrigidos no XPM · ${falhas.length} falharam`, { description: "Veja a lista de falhas no diálogo." });
      else toast.success(`${oks} produtos corrigidos no XPM`);
      onFeito();
    } catch (e) {
      toast.error("A correção no XPM falhou", { description: formatError(e) });
    } finally {
      setAplicando(false);
      setProgresso(null);
    }
  }

  if (!produtos.length) return null;

  const barra = (p: Progresso) => (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(p.leva / p.total) * 100}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{p.leva}/{p.total}</span>
    </div>
  );

  return <>
    <Button variant="outline" size="sm" onClick={() => void abrir()}>
      <Wand2 className="mr-2 h-4 w-4" />Corrigir no XPM ({produtos.length})
    </Button>
    <Dialog open={aberto} onOpenChange={o => { if (carregando || aplicando) return; if (!o) { setAberto(false); zerar(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Corrigir no XPM pela matriz</DialogTitle>
          <DialogDescription>Nada é enviado antes de você clicar em Aplicar. O sistema só mostra o que mudaria.</DialogDescription>
        </DialogHeader>

        {carregando && (
          <div className="space-y-2 py-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progresso
                ? <>Comparando leva {progresso.leva} de {progresso.total} ({Math.min(progresso.leva * TETO, produtos.length)} produtos)…</>
                : <>Comparando {produtos.length} produto(s) com o XPM…</>}
            </div>
            {progresso && barra(progresso)}
          </div>
        )}

        {aviso && <p className="text-sm text-destructive">{aviso}</p>}

        {aplicando && progresso && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <>Corrigindo leva {progresso.leva} de {progresso.total}…</>
            </div>
            {barra(progresso)}
          </div>
        )}

        {!carregando && !final && previa && <ScrollArea className="max-h-[22rem] pr-3">
          <div className="space-y-4">
            {comDiferenca.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto selecionado tem diferença para corrigir.</p>}
            {comDiferenca.map(r => <div key={r.sku} className="space-y-1 rounded-md border p-2">
              <p className="text-sm font-medium">{cod(r.sku)}</p>
              {(r.de_para ?? []).map(d => <p key={d.campo} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{rotulos[d.campo] ?? d.campo}</span>: {mostrar(d.xpm)} → <span className="text-foreground">{mostrar(d.novo)}</span>
              </p>)}
            </div>)}

            {semDiferenca.length > 0 && <div className="space-y-1">
              <p className="text-xs font-medium">Já iguais ao XPM ({semDiferenca.length})</p>
              <div className="flex flex-wrap gap-1">{semDiferenca.map(r => <Badge key={r.sku} variant="outline" className="font-normal">{cod(r.sku)}</Badge>)}</div>
            </div>}

            {foraDoXpm.length > 0 && <div className="space-y-1">
              <p className="text-xs font-medium">Não estão no XPM ({foraDoXpm.length})</p>
              <div className="flex flex-wrap gap-1">{foraDoXpm.map(r => <Badge key={r.sku} variant="outline" className="font-normal">{cod(r.sku)}</Badge>)}</div>
            </div>}

            {incompletos.length > 0 && <div className="space-y-1">
              <p className="text-xs font-medium">Matriz incompleta — não podem ser enviados ({incompletos.length})</p>
              {incompletos.map(r => <p key={r.sku} className="text-xs"><span className="font-medium">{cod(r.sku)}</span><span className="text-muted-foreground"> — {(r.bloqueios ?? []).join(" · ") || "sem detalhe"}</span></p>)}
            </div>}

            {outros.length > 0 && <div className="space-y-1">
              <p className="text-xs font-medium">Outros avisos ({outros.length})</p>
              {outros.map(r => <p key={r.sku} className="text-xs"><span className="font-medium">{cod(r.sku)}</span><span className="text-muted-foreground"> — {r.status}{r.erro ? `: ${r.erro}` : ""}</span></p>)}
            </div>}
          </div>
        </ScrollArea>}

        {final && <div className="space-y-2">
          <p className="text-sm">{final.filter(r => r.status === "ok").length} corrigidos no XPM{final.some(r => r.status !== "ok") && ` · ${final.filter(r => r.status !== "ok").length} falharam`}.</p>
          {final.some(r => r.status !== "ok") && <ScrollArea className="h-40 rounded-md border"><div className="space-y-2 p-2">{final.filter(r => r.status !== "ok").map(r => <div key={r.sku} className="text-xs"><span className="font-medium">{cod(r.sku)}</span><span className="text-muted-foreground"> — {r.erro ?? r.status}</span></div>)}</div></ScrollArea>}
        </div>}

        <DialogFooter>
          {final
            ? <Button variant="outline" onClick={() => { setAberto(false); zerar(); }}>Fechar</Button>
            : <>
              <Button variant="outline" onClick={() => { setAberto(false); zerar(); }} disabled={carregando || aplicando}>Cancelar</Button>
              <Button disabled={carregando || aplicando || comDiferenca.length === 0} onClick={() => void aplicar()}>
                {aplicando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Aplicar {comDiferenca.length} correções
              </Button>
            </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

const rotulos: Record<string, string> = {
  descricao: "Descrição",
  ncm: "NCM",
  peso_kg: "Peso (kg)",
  altura_m: "Altura (m)",
  largura_m: "Largura (m)",
  comprimento_m: "Comprimento (m)",
  categoria: "Categoria",
};

function mostrar(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}
