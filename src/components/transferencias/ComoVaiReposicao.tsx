import { useEffect, useState } from "react";
import { useFretesReposicaoSp } from "@/hooks/estoque/useFretesReposicaoSp";
import { escolherFrete, type AbaReposicao, type FreteReposicao, type ItemReposicao } from "@/lib/estoque/reposicaoSp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";

export function ComoVaiReposicao({ itens, destino, aba, onEscolher }: { itens: ItemReposicao[]; destino: string; aba: AbaReposicao; onEscolher: (frete: FreteReposicao | null) => void }) {
  const [volume, setVolume] = useState({ comprimento: 0, largura: 0, altura: 0 });
  const [volumeCotado, setVolumeCotado] = useState(volume);
  const [escolha, setEscolha] = useState<string | null>(null);
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
    <div className="flex flex-wrap items-end gap-2">{(["comprimento", "largura", "altura"] as const).map(c => <label key={c} className="text-xs capitalize">{c} do volume (cm)<Input aria-label={`${c} do volume`} type="number" min={0} className="w-32" value={volume[c] || ""} onChange={e => setVolume(v => ({ ...v, [c]: Number(e.target.value) || 0 }))} /></label>)}<Button type="button" variant="outline" disabled={q.isFetching} onClick={() => setVolumeCotado({ ...volume })}>Cotar volume</Button></div>
    {q.isFetching && <p className="text-sm text-muted-foreground">Cotando…</p>}
    {q.error && <p role="alert" className="text-sm text-destructive">{formatError(q.error)}</p>}
    <div className="grid gap-2 md:grid-cols-3">{(q.data?.opcoes ?? []).map(o => <Button key={o.chave} type="button" variant="outline" aria-pressed={ativo === o.chave} disabled={q.isFetching} className={cn("h-auto p-3 block text-left whitespace-normal bg-card", ativo === o.chave && "border-primary ring-1 ring-primary")} onClick={() => { setEscolha(o.chave); onEscolher(o); }}><div className="font-medium">{o.nome}</div><div className="text-lg tabular-nums">{formatBRL(o.valor)}</div><div className="text-xs text-muted-foreground">{o.prazo == null ? "Prazo indisponível" : `${o.prazo} dias`} · {formatBRL(kits > 0 ? o.valor / kits : 0)}/kit</div></Button>)}</div>
    {(q.data?.avisos ?? []).map(a => <p key={a} className="text-xs text-warning">{a}</p>)}
  </section>;
}