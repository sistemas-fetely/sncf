import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFretesReposicaoSp } from "@/hooks/estoque/useFretesReposicaoSp";
import { escolherFrete, type AbaReposicao, type FreteReposicao, type ItemReposicao } from "@/lib/estoque/reposicaoSp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";

type CaixaSugerida = { codigo: string; comprimento_cm: number; largura_cm: number; altura_cm: number; volume_util_l: number };
type PreparoCotacao = { peso_g: number | null; peso_incompleto: boolean | null; itens_hash: string | null; volume_l: number | null; volume_incompleto: boolean | null; caixa: CaixaSugerida | null };
const num = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function ComoVaiReposicao({ itens, destino, aba, onEscolher }: { itens: ItemReposicao[]; destino: string; aba: AbaReposicao; onEscolher: (frete: FreteReposicao | null) => void }) {
  const [volume, setVolume] = useState({ comprimento: 0, largura: 0, altura: 0 });
  const [volumeCotado, setVolumeCotado] = useState(volume);
  const [escolha, setEscolha] = useState<string | null>(null);
  const [editadoManual, setEditadoManual] = useState(false);
  const sugestaoQ = useQuery({
    queryKey: ["reposicao-sp-caixa-sugerida", itens.map(i => [i.sku, i.quantidade])],
    enabled: itens.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_frete_preparar_cotacao", { p_itens: itens.map(i => ({ sku: i.sku, quantidade: i.quantidade })) });
      if (error) throw error;
      return data as unknown as PreparoCotacao;
    },
  });
  const caixa = sugestaoQ.data?.caixa ?? null;
  const aplicarSugerida = () => {
    if (!caixa) return;
    const v = { comprimento: caixa.comprimento_cm, largura: caixa.largura_cm, altura: caixa.altura_cm };
    setVolume(a => a.comprimento === v.comprimento && a.largura === v.largura && a.altura === v.altura ? a : v);
    setVolumeCotado(a => a.comprimento === v.comprimento && a.largura === v.largura && a.altura === v.altura ? a : v);
  };
  useEffect(() => { if (!editadoManual) aplicarSugerida(); }, [caixa?.codigo, caixa?.comprimento_cm, caixa?.largura_cm, caixa?.altura_cm, editadoManual]);
  const q = useFretesReposicaoSp(itens, destino, volumeCotado, true);
  const assinatura = JSON.stringify([itens.map(i => [i.sku, i.quantidade]), destino, aba, volumeCotado]);
  useEffect(() => { setEscolha(null); onEscolher(null); }, [assinatura]);
  useEffect(() => {
    if (!q.data || q.isFetching) return;
    const frete = q.data.opcoes.find(o => o.chave === escolha) ?? escolherFrete(q.data.opcoes, aba);
    onEscolher(frete);
  }, [q.data, q.isFetching, escolha, aba]);
  const ativo = escolha ?? escolherFrete(q.data?.opcoes ?? [], aba)?.chave;
  const kits = itens.reduce((s,i) => s + i.quantidade, 0);
  return <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">Como vai</h3>
    <div className="flex flex-wrap items-end gap-2">{(["comprimento", "largura", "altura"] as const).map(c => <label key={c} className="text-xs capitalize">{c} do volume (cm)<Input aria-label={`${c} do volume`} type="number" min={0} className="w-32" value={volume[c] || ""} onChange={e => { setEditadoManual(true); setVolume(v => ({ ...v, [c]: Number(e.target.value) || 0 })); }} /></label>)}<Button type="button" variant="outline" disabled={q.isFetching} onClick={() => setVolumeCotado({ ...volume })}>Cotar volume</Button></div>
    {sugestaoQ.error ? <p role="alert" className="text-xs text-destructive">{formatError(sugestaoQ.error)}</p>
      : caixa ? <p className="text-xs text-muted-foreground">Caixa sugerida: {caixa.codigo} ({num(caixa.comprimento_cm)} × {num(caixa.largura_cm)} × {num(caixa.altura_cm)} cm) para {num(sugestaoQ.data?.volume_l)} L de produto. Estimativa — a XPM define a caixa real; ajuste se precisar.{editadoManual && <> <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => { setEditadoManual(false); aplicarSugerida(); }}>Voltar à sugerida</Button></>}</p>
      : sugestaoQ.data ? <p className="text-xs text-muted-foreground">{sugestaoQ.data.volume_incompleto ? "Sem caixa sugerida: falta medida no cadastro de um ou mais produtos. Informe as dimensões do volume." : "Sem caixa sugerida: os itens não cabem em uma única caixa cadastrada. Informe as dimensões do volume."}</p>
      : null}
    {q.isFetching && <p className="text-sm text-muted-foreground">Cotando…</p>}
    {q.error && <p role="alert" className="text-sm text-destructive">{formatError(q.error)}</p>}
    <div className="grid gap-2 md:grid-cols-3">{(q.data?.opcoes ?? []).map(o => <Button key={o.chave} type="button" variant="outline" aria-pressed={ativo === o.chave} disabled={q.isFetching} className={cn("h-auto p-3 block text-left whitespace-normal bg-card", ativo === o.chave && "border-primary ring-1 ring-primary")} onClick={() => { setEscolha(o.chave); onEscolher(o); }}><div className="font-medium">{o.nome}</div><div className="text-lg tabular-nums">{formatBRL(o.valor)}</div><div className="text-xs text-muted-foreground">{o.prazo == null ? "Prazo indisponível" : `${o.prazo} dias`} · {formatBRL(kits > 0 ? o.valor / kits : 0)}/kit</div></Button>)}</div>
    {(q.data?.avisos ?? []).map(a => <p key={a} className="text-xs text-warning">{a}</p>)}
  </section>;
}