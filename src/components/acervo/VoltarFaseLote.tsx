import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

/**
 * REGRESSÃO EM LOTE (23/09/2026) — mutirão de correção mora na Conciliação.
 *
 * A fase de destino é a anterior a `ativo` em `produto_fase_dim`: nada de slug
 * escrito aqui. A escrita é sempre pela edge `promover-fase-produto`, um
 * produto por vez. FAIL-LOUD: erro de produto não interrompe a fila e aparece
 * nomeado no fim, com o corpo cru da função.
 */

export type ProdutoLote = { sku: string; cod_cadastro: string | null };
type Fase = { slug: string; nome: string; ordem: number };
type CorpoFuncao = Record<string, unknown>;
type ErroFuncao = { status: number; corpo: CorpoFuncao | null };

async function chamarFuncao(nome: string, payload: Record<string, unknown>): Promise<CorpoFuncao> {
  const { data, error } = await supabase.functions.invoke(nome, { body: payload });
  if (error) {
    const resp = (error as { context?: unknown })?.context as Response | undefined;
    if (resp && typeof resp.json === "function") {
      let corpo: CorpoFuncao | null = null;
      try { corpo = await resp.json(); } catch { try { corpo = { erro: await resp.text() }; } catch { corpo = null; } }
      throw { status: resp.status, corpo } as ErroFuncao;
    }
    throw { status: 0, corpo: { erro: error.message } } as ErroFuncao;
  }
  if (!data || data.ok !== true) throw { status: 0, corpo: data ?? { erro: "Resposta vazia da função" } } as ErroFuncao;
  return data as CorpoFuncao;
}

function motivoDaFalha(e: unknown): string {
  const err = e as ErroFuncao;
  const corpo = err?.corpo ?? {};
  if (err?.status === 409) return `saldo em estoque (${String(corpo.saldo_disponivel ?? "?")}) — marque "Seguir mesmo se houver saldo"`;
  if (err?.status === 422) return `ficha incompleta: ${(Array.isArray(corpo.campos_faltando) ? corpo.campos_faltando.map(String) : []).join(", ") || "campos não informados"}`;
  if (err?.status === 502) return `o FOP recusou: ${typeof corpo.fop_body === "string" ? corpo.fop_body : JSON.stringify(corpo.fop_body ?? corpo)}`;
  for (const k of ["mensagem", "erro", "message"]) {
    const v = (corpo as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) return err?.status ? `${err.status}: ${v}` : v;
  }
  return `${err?.status || ""} ${JSON.stringify(corpo)}`.trim() || "Erro sem detalhe.";
}

export function VoltarFaseLote({ produtos, onFeito, sempreVisivel = false }: { produtos: ProdutoLote[]; onFeito: () => void; sempreVisivel?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [saldo, setSaldo] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [feito, setFeito] = useState(0);
  const [resultado, setResultado] = useState<{ ok: number; falhas: { cod: string; motivo: string }[] } | null>(null);

  const fasesDim = useQuery({
    queryKey: ["produto-fase-dim"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produto_fase_dim").select("slug, nome, ordem").order("ordem");
      if (error) throw error;
      return (data ?? []) as Fase[];
    },
  });

  const faseAtiva = useMemo(() => fasesDim.data?.find(f => f.slug === "ativo") ?? null, [fasesDim.data]);
  const destino = useMemo(() => {
    if (!faseAtiva) return null;
    return [...(fasesDim.data ?? [])].filter(f => f.ordem < faseAtiva.ordem).sort((a, b) => b.ordem - a.ordem)[0] ?? null;
  }, [fasesDim.data, faseAtiva]);

  const zerar = () => { setMotivo(""); setSaldo(false); setResultado(null); setFeito(0); };

  async function executar() {
    if (!destino || !motivo.trim()) return;
    const alvo = [...produtos];
    setRodando(true); setFeito(0); setResultado(null);
    let ok = 0; const falhas: { cod: string; motivo: string }[] = [];
    for (const p of alvo) {
      try {
        await chamarFuncao("promover-fase-produto", { sku: p.sku, fase_destino: destino.slug, motivo: motivo.trim(), ...(saldo ? { confirmar_saldo: true } : {}) });
        ok++;
      } catch (e) {
        falhas.push({ cod: p.cod_cadastro ?? p.sku, motivo: motivoDaFalha(e) });
      }
      setFeito(f => f + 1);
    }
    setResultado({ ok, falhas });
    setRodando(false);
    if (falhas.length) toast.error(`${ok} voltaram para ${destino.nome} · ${falhas.length} falharam`, { description: "Veja a lista de falhas no diálogo." });
    else toast.success(`${ok} produtos voltaram para ${destino.nome}`, { description: "Fase gravada no FOP e espelhada aqui." });
    onFeito();
  }

  if ((!produtos.length && !sempreVisivel) || (!destino && !sempreVisivel)) return null;

  const { permitido: podeFase, carregando: carregandoPermFase } = usePermissaoAcaoOuSuperAdmin("acao.produto_promover_fase");
  const semPermFase = carregandoPermFase || !podeFase;

  const desabilitado = produtos.length === 0 || !destino || semPermFase;
  const tituloDesabilitado = produtos.length === 0 ? "Nenhum selecionado em Ativo" : !destino ? "Carregando fase anterior" : (!podeFase && !carregandoPermFase) ? "Sem permissão: acao.produto_promover_fase" : undefined;

  return <>
    <Button variant="outline" size="sm" onClick={() => { zerar(); setAberto(true); }} disabled={desabilitado} title={tituloDesabilitado}>
      <ArrowDownCircle className="mr-2 h-4 w-4" />Voltar {produtos.length} ativos para {destino?.nome ?? "fase anterior"}
    </Button>
    {destino && <Dialog open={aberto} onOpenChange={o => { if (rodando) return; if (!o) { setAberto(false); zerar(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Voltar {produtos.length} produtos de Ativo para {destino.nome}?</DialogTitle>
          <DialogDescription>Os produtos saem do faturamento enquanto estiverem fora de Ativo.</DialogDescription>
        </DialogHeader>
        {!resultado && <>
          <ScrollArea className="h-32 rounded-md border"><div className="flex flex-wrap gap-1 p-2">{produtos.map(p => <Badge key={p.sku} variant="outline" className="font-normal">{p.cod_cadastro ?? p.sku}</Badge>)}</div></ScrollArea>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-lote-conciliacao">Motivo (obrigatório)</Label>
            <Textarea id="motivo-lote-conciliacao" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: coleção ativada antes do cadastro completo" rows={3} disabled={rodando} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="saldo-lote-conciliacao" checked={saldo} onCheckedChange={v => setSaldo(v === true)} disabled={rodando} />
            <Label htmlFor="saldo-lote-conciliacao" className="font-normal">Seguir mesmo se houver saldo em estoque</Label>
          </div>
          {rodando && <div className="space-y-1.5"><Progress value={produtos.length ? (feito / produtos.length) * 100 : 0} /><p className="text-xs text-muted-foreground">{feito} de {produtos.length}</p></div>}
        </>}
        {resultado && <div className="space-y-2">
          <p className="text-sm">{resultado.ok} voltaram para {destino.nome}{resultado.falhas.length > 0 && ` · ${resultado.falhas.length} falharam`}.</p>
          {resultado.falhas.length > 0 && <ScrollArea className="h-48 rounded-md border"><div className="space-y-2 p-2">{resultado.falhas.map(f => <div key={f.cod} className="text-xs"><span className="font-medium">{f.cod}</span><span className="text-muted-foreground"> — {f.motivo}</span></div>)}</div></ScrollArea>}
        </div>}
        <DialogFooter>
          {resultado
            ? <Button variant="outline" onClick={() => { setAberto(false); zerar(); }}>Fechar</Button>
            : <>
              <Button variant="outline" onClick={() => setAberto(false)} disabled={rodando}>Cancelar</Button>
              <Button disabled={rodando || !motivo.trim() || !produtos.length} onClick={executar}>{rodando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar</Button>
            </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>}
  </>;
}
