import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { chamarFuncao, motivoDaFalha } from "./promocaoFase";
import { CorrigirBlingLote } from "./CorrigirBlingLote";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
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
 * PROMOÇÃO EM LOTE (04/10/2026) — espelho do VoltarFaseLote.
 *
 * Destino = a fase seguinte à fase atual de CADA produto, por `ordem` em
 * `produto_fase_dim` (nenhum slug escrito aqui). Escrita sempre pela edge
 * `promover-fase-produto`, um produto por vez. FAIL-LOUD: erro de um produto
 * não interrompe a fila e aparece nomeado no fim. Quem chega a `ativo` pode
 * seguir direto para o CorrigirBlingLote (liga o card).
 */

export type ProdutoPromover = {
  sku: string;
  cod_cadastro: string | null;
  fase: string | null;
  /** Motivo para não promover (ex.: já está na última fase). Vira falha nomeada, sem chamada. */
  bloqueio?: string | null;
};
type Fase = { slug: string; nome: string; ordem: number };
type Sucesso = { sku: string; cod_cadastro: string | null; destino: string };

export function PromoverFaseLote({ produtos, onFeito, abrirSinal = 0 }: { produtos: ProdutoPromover[]; onFeito: () => void; abrirSinal?: number }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [saldo, setSaldo] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [feito, setFeito] = useState(0);
  const [resultado, setResultado] = useState<{ sucessos: Sucesso[]; falhas: { cod: string; motivo: string }[] } | null>(null);
  // Fotografia da seleção no momento de abrir: a fila não muda enquanto roda.
  const [alvo, setAlvo] = useState<ProdutoPromover[]>([]);

  const fasesDim = useQuery({
    queryKey: ["produto-fase-dim"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produto_fase_dim").select("slug, nome, ordem").order("ordem");
      if (error) throw error;
      return (data ?? []) as Fase[];
    },
  });

  const proximaDe = useMemo(() => {
    const ordenadas = [...(fasesDim.data ?? [])].sort((a, b) => a.ordem - b.ordem);
    return (slug: string | null) => {
      const atual = ordenadas.find((f) => f.slug === slug);
      if (!atual) return null;
      return ordenadas.find((f) => f.ordem > atual.ordem) ?? null;
    };
  }, [fasesDim.data]);

  const plano = (lista: ProdutoPromover[]) => lista.map((p) => ({ p, destino: p.bloqueio ? null : proximaDe(p.fase) }));
  const destinosDe = (lista: ProdutoPromover[]) => {
    const m = new Map<string, { nome: string; n: number }>();
    for (const { destino } of plano(lista)) if (destino) m.set(destino.slug, { nome: destino.nome, n: (m.get(destino.slug)?.n ?? 0) + 1 });
    return [...m.values()];
  };
  const destinosBotao = destinosDe(produtos);
  const rotuloDestino = destinosBotao.length === 1 ? destinosBotao[0].nome : "a próxima fase";
  const destinosAlvo = destinosDe(alvo);
  const fasesMisturadas = new Set(alvo.map((p) => p.fase ?? "")).size > 1;

  const zerar = () => { setMotivo(""); setSaldo(false); setResultado(null); setFeito(0); };
  const abrir = () => { zerar(); setAlvo([...produtos]); setAberto(true); };

  // Atalho externo (card de KPI): abre já com a seleção montada pela Mesa.
  const ultimoSinal = useRef(abrirSinal);
  useEffect(() => {
    if (abrirSinal === ultimoSinal.current) return;
    ultimoSinal.current = abrirSinal;
    if (abrirSinal > 0 && produtos.length) abrir();
  // abrir depende de `produtos`, que já é o desta renderização
  }, [abrirSinal, produtos]); // eslint-disable-line react-hooks/exhaustive-deps

  async function executar() {
    const fila = plano(alvo);
    setRodando(true); setFeito(0); setResultado(null);
    const sucessos: Sucesso[] = []; const falhas: { cod: string; motivo: string }[] = [];
    for (const { p, destino } of fila) {
      const cod = p.cod_cadastro ?? p.sku;
      if (!destino) {
        falhas.push({ cod, motivo: p.bloqueio ?? "sem próxima fase cadastrada para a fase atual" });
      } else {
        try {
          await chamarFuncao("promover-fase-produto", { sku: p.sku, fase_destino: destino.slug, ...(motivo.trim() ? { motivo: motivo.trim() } : {}), ...(saldo ? { confirmar_saldo: true } : {}) });
          sucessos.push({ sku: p.sku, cod_cadastro: p.cod_cadastro, destino: destino.slug });
        } catch (e) {
          falhas.push({ cod, motivo: motivoDaFalha(e) });
        }
      }
      setFeito((f) => f + 1);
    }
    setResultado({ sucessos, falhas });
    setRodando(false);
    if (falhas.length) toast.error(`${sucessos.length} promovidos · ${falhas.length} falharam`, { description: "Veja a lista de falhas no diálogo." });
    else toast.success(`${sucessos.length} produtos promovidos`, { description: "Fase gravada no FOP e espelhada aqui." });
    onFeito();
  }

  const { permitido: podeFase, carregando: carregandoPermFase } = usePermissaoAcaoOuSuperAdmin("acao.produto_promover_fase");
  const semPermFase = carregandoPermFase || !podeFase;
  const ativados = (resultado?.sucessos ?? []).filter((s) => s.destino === "ativo").map((s) => ({ sku: s.sku, cod_cadastro: s.cod_cadastro }));

  return <>
    <BotaoGuardado slug="acao.produto_promover_fase" rotuloAcao="Promover fase em lote" contexto={{ skus: produtos.map((p) => p.sku) }} variant="outline" size="sm" onClick={abrir} disabled={produtos.length === 0 || !fasesDim.data} title={produtos.length === 0 ? "Nenhum produto selecionado" : undefined}>
      <ArrowUpCircle className="mr-2 h-4 w-4" />Promover {produtos.length} para {rotuloDestino}
    </BotaoGuardado>
    <Dialog open={aberto} onOpenChange={(o) => { if (rodando) return; if (!o) { setAberto(false); zerar(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Promover {alvo.length} produtos para {destinosAlvo.length === 1 ? destinosAlvo[0].nome : "a próxima fase"}?</DialogTitle>
          <DialogDescription>Cada produto avança uma fase. A fase é gravada no FOP e espelhada aqui.</DialogDescription>
        </DialogHeader>
        {!resultado && <>
          {fasesMisturadas && <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-strong">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>A seleção mistura fases. Cada produto vai para a próxima fase da sua própria fase: {destinosAlvo.map((d) => `${d.n} → ${d.nome}`).join(" · ") || "nenhum destino"}.</span>
          </div>}
          <ScrollArea className="h-32 rounded-md border"><div className="flex flex-wrap gap-1 p-2">{alvo.map((p) => <Badge key={p.sku} variant="outline" className="font-normal">{p.cod_cadastro ?? p.sku}</Badge>)}</div></ScrollArea>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-lote-promover">Motivo (opcional)</Label>
            <Textarea id="motivo-lote-promover" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: coleção liberada para venda" rows={2} disabled={rodando} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="saldo-lote-promover" checked={saldo} onCheckedChange={(v) => setSaldo(v === true)} disabled={rodando} />
            <Label htmlFor="saldo-lote-promover" className="font-normal">Seguir mesmo se houver saldo em estoque</Label>
          </div>
          {rodando && <div className="space-y-1.5"><Progress value={alvo.length ? (feito / alvo.length) * 100 : 0} /><p className="text-xs text-muted-foreground">{feito} de {alvo.length}</p></div>}
        </>}
        {resultado && <div className="space-y-2">
          <p className="text-sm">{resultado.sucessos.length} promovidos{resultado.falhas.length > 0 && ` · ${resultado.falhas.length} falharam`}.</p>
          {resultado.falhas.length > 0 && <ScrollArea className="h-48 rounded-md border"><div className="space-y-2 p-2">{resultado.falhas.map((f) => <div key={f.cod} className="text-xs"><span className="font-medium">{f.cod}</span><span className="text-muted-foreground"> — {f.motivo}</span></div>)}</div></ScrollArea>}
        </div>}
        <DialogFooter>
          {resultado
            ? <>
              {ativados.length > 0 && <CorrigirBlingLote produtos={ativados} sugerirCard onFeito={onFeito} rotuloBotao={`Ativar no Bling os ${ativados.length} promovidos`} />}
              <Button variant="outline" onClick={() => { setAberto(false); zerar(); }}>Fechar</Button>
            </>
            : <>
              <Button variant="outline" onClick={() => setAberto(false)} disabled={rodando}>Cancelar</Button>
              <Button disabled={rodando || !alvo.length || semPermFase} title={!podeFase && !carregandoPermFase ? "Sem permissão: acao.produto_promover_fase" : undefined} onClick={executar}>{rodando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar</Button>
            </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
