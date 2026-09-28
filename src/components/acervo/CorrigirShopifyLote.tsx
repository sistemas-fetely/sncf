import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * CORRIGIR NO SHOPIFY PELA MATRIZ (28/09/2026) — espelho do CorrigirBlingLote.
 * SISTEMA SUGERE / HUMANO DECIDE: abre em dry-run, mostra o de-para e só grava no Aplicar.
 * Levas sequenciais de 50 (teto da edge); falha de leva preserva o que já voltou.
 */

export type ProdutoShopify = { sku: string; cod_cadastro: string | null };

type DePara = { campo: string; shopify: unknown; novo: unknown };
type Resultado = { sku: string; status: string; produto?: string; de_para?: DePara[]; erro?: string };

// Teto da edge corrigir-produto-shopify = 50 SKUs por chamada.
const TETO = 50;

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
      const { data, error } = await supabase.functions.invoke("corrigir-produto-shopify", {
        body: { skus: levas[i], dry_run },
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

export function CorrigirShopifyLote({ produtos, onFeito, sempreVisivel = false }: { produtos: ProdutoShopify[]; onFeito: () => void; sempreVisivel?: boolean }) {
  const perm = usePermissaoAcaoOuSuperAdmin("acao.produto_corrigir_externo");
  const semPerm = perm.carregando || !perm.permitido;
  const tituloPerm = !perm.permitido && !perm.carregando ? "Sem permissão: acao.produto_corrigir_externo" : undefined;
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [previa, setPrevia] = useState<Resultado[] | null>(null);
  const [final, setFinal] = useState<Resultado[] | null>(null);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cod = (sku: string) => produtos.find(p => p.sku === sku)?.cod_cadastro ?? sku;

  const vaiMudar = (previa ?? []).filter(r => r.status === "dry_run");
  const semMudanca = (previa ?? []).filter(r => r.status === "sem_mudanca");
  const semAnuncio = (previa ?? []).filter(r => r.status === "sem_anuncio");
  const semFicha = (previa ?? []).filter(r => r.status === "sem_ficha_sncf");
  const outros = (previa ?? []).filter(r => !["dry_run", "sem_mudanca", "sem_anuncio", "sem_ficha_sncf"].includes(r.status));

  const zerar = () => { setPrevia(null); setFinal(null); setCarregando(false); setAplicando(false); setProgresso(null); setAviso(null); };

  async function abrir() {
    zerar();
    setAberto(true);
    await comparar();
  }

  async function comparar() {
    setPrevia(null); setAviso(null);
    setCarregando(true);
    try {
      const res = await chamar(produtos.map(p => p.sku), true, setProgresso);
      setPrevia(res.resultados);
      if (res.erroLeva) setAviso(`comparação incompleta: leva ${res.levaFalha} falhou — ${res.erroLeva}`);
    } catch (e) {
      toast.error("Não foi possível comparar com o Shopify", { description: formatError(e) });
      setAberto(false);
    } finally {
      setCarregando(false);
      setProgresso(null);
    }
  }

  async function aplicar() {
    const skus = vaiMudar.map(r => r.sku);
    if (!skus.length) return;
    setAplicando(true);
    try {
      const res = await chamar(skus, false, setProgresso);
      setFinal(res.resultados);
      if (res.erroLeva) setAviso(`correção incompleta: leva ${res.levaFalha} falhou — ${res.erroLeva}`);
      const oks = res.resultados.filter(r => r.status === "corrigido" || r.status === "sem_mudanca").length;
      const falhas = res.resultados.filter(r => r.status !== "corrigido" && r.status !== "sem_mudanca");
      if (falhas.length || res.erroLeva) toast.error(`${oks} corrigidos no Shopify · ${falhas.length} falharam`, { description: res.erroLeva ?? "Veja a lista de falhas no diálogo." });
      else toast.success(`${oks} produtos corrigidos no Shopify`);
      onFeito();
    } catch (e) {
      toast.error("A correção no Shopify falhou", { description: formatError(e) });
    } finally {
      setAplicando(false);
      setProgresso(null);
    }
  }

  if (!produtos.length && !sempreVisivel) return null;

  const barra = (p: Progresso) => (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(p.leva / p.total) * 100}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{p.leva}/{p.total}</span>
    </div>
  );

  const okFinal = (r: Resultado) => r.status === "corrigido" || r.status === "sem_mudanca";

  return <>
    <BotaoGuardado slug="acao.produto_corrigir_externo" rotuloAcao="Corrigir no Shopify" contexto={{ skus: produtos.map((p) => p.sku) }} variant="outline" size="sm" onClick={() => void abrir()} disabled={produtos.length === 0} title={produtos.length === 0 ? "Nenhum produto selecionado com pendência no Shopify" : undefined}>
      <RefreshCw className="mr-2 h-4 w-4" />Corrigir no Shopify ({produtos.length})
    </BotaoGuardado>
    <Dialog open={aberto} onOpenChange={o => { if (carregando || aplicando) return; if (!o) { setAberto(false); zerar(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Corrigir no Shopify pela matriz</DialogTitle>
          <DialogDescription>Lê o anúncio ao vivo e mostra o que muda: preço, código de barras, SKU do anúncio, peso e marca. Título não é alterado. Nada é gravado até Aplicar.</DialogDescription>
        </DialogHeader>

        {carregando && (
          <div className="space-y-2 py-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progresso
                ? <>Comparando leva {progresso.leva} de {progresso.total} ({Math.min(progresso.leva * TETO, produtos.length)} produtos)…</>
                : <>Comparando {produtos.length} produto(s) com o Shopify…</>}
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
            {vaiMudar.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto selecionado tem diferença para corrigir.</p>}
            {vaiMudar.map(r => <div key={r.sku} className="space-y-1 rounded-md border p-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{cod(r.sku)}</p>
                <Badge variant="secondary" className="font-normal">vai mudar</Badge>
              </div>
              {r.produto && <p className="text-xs text-muted-foreground">{r.produto}</p>}
              {(r.de_para ?? []).map(d => <p key={d.campo} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{d.campo}</span>: Shopify {mostrar(d.shopify)} → <span className="text-foreground">{mostrar(d.novo)}</span>
              </p>)}
            </div>)}

            {semMudanca.length > 0 && <div className="space-y-1">
              <p className="text-xs font-medium">Já iguais ao Shopify ({semMudanca.length})</p>
              <div className="flex flex-wrap gap-1">{semMudanca.map(r => <Badge key={r.sku} variant="outline" className="font-normal">{cod(r.sku)}</Badge>)}</div>
            </div>}

            {semAnuncio.length > 0 && <div className="space-y-1">
              <p className="text-xs font-medium">Sem anúncio no Shopify — cadastre em Destinos de Cadastro ({semAnuncio.length})</p>
              <div className="flex flex-wrap gap-1">{semAnuncio.map(r => <Badge key={r.sku} variant="outline" className="font-normal">{cod(r.sku)}</Badge>)}</div>
            </div>}

            {semFicha.length > 0 && <div className="space-y-1">
              <p className="text-xs font-medium">Sem ficha no SNCF ({semFicha.length})</p>
              <div className="flex flex-wrap gap-1">{semFicha.map(r => <Badge key={r.sku} variant="outline" className="font-normal">{cod(r.sku)}</Badge>)}</div>
            </div>}

            {outros.length > 0 && <div className="space-y-1">
              <p className="text-xs font-medium">Erros ({outros.length})</p>
              {outros.map(r => <p key={r.sku} className="text-xs"><Badge variant="destructive" className="mr-1 font-normal">{r.status}</Badge><span className="font-medium">{cod(r.sku)}</span><span className="text-muted-foreground">{r.erro ? ` — ${r.erro}` : ""}</span></p>)}
            </div>}
          </div>
        </ScrollArea>}

        {final && <div className="space-y-2">
          <p className="text-sm">{final.filter(okFinal).length} corrigidos no Shopify{final.some(r => !okFinal(r)) && ` · ${final.filter(r => !okFinal(r)).length} falharam`}.</p>
          {final.some(r => !okFinal(r)) && <ScrollArea className="h-40 rounded-md border"><div className="space-y-2 p-2">{final.filter(r => !okFinal(r)).map(r => <div key={r.sku} className="text-xs"><Badge variant="destructive" className="mr-1 font-normal">{r.status}</Badge><span className="font-medium">{cod(r.sku)}</span><span className="text-muted-foreground"> — {r.erro ?? r.status}</span></div>)}</div></ScrollArea>}
        </div>}

        <DialogFooter>
          {final
            ? <Button variant="outline" onClick={() => { setAberto(false); zerar(); }}>Fechar</Button>
            : <>
              <Button variant="outline" onClick={() => { setAberto(false); zerar(); }} disabled={carregando || aplicando}>Cancelar</Button>
              <Button disabled={carregando || aplicando || vaiMudar.length === 0 || semPerm} title={tituloPerm} onClick={() => void aplicar()}>
                {aplicando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Aplicar {vaiMudar.length} correções
              </Button>
            </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function mostrar(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}
