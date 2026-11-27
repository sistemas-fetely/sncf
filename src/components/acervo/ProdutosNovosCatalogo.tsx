import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { BotaoGuardado } from '@/components/acesso/BotaoGuardado';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatError } from '@/lib/format-error';
import { lerPropostas, montarLoteNascimento, problemasDaPrevia, type RespostaNascer } from '@/lib/acervo/nascimentoCatalogo';

const t = (v: unknown) => v == null || v === '' ? '—' : String(v);

/** Bloco "Produtos novos" / "Códigos e EAN" da planilha v2: nada é gravado na leitura; confirma via prévia + fn_catalogo_nascer_da_planilha. */
export function ProdutosNovosCatalogo({ totais, leituraId }: { totais: unknown; leituraId?: string }) {
  const qc = useQueryClient();
  const propostas = lerPropostas(totais);
  const cods = useMemo(() => propostas?.nascimentos.map(n => n.cod_cadastro) ?? [], [propostas]);
  const jaNasceram = useQuery({ queryKey: ['catalogo-v2-ja-nasceram', leituraId, cods.join(',')], enabled: cods.length > 0, queryFn: async () => {
    const out = new Set<string>();
    for (let de = 0; de < cods.length; de += 200) {
      const r = await supabase.from('sncf_produtos').select('cod_cadastro').in('cod_cadastro', cods.slice(de, de + 200));
      if (r.error) throw r.error;
      for (const p of r.data ?? []) if (p.cod_cadastro) out.add(p.cod_cadastro);
    }
    return out;
  } });
  const [selCart, setSelCart] = useState<Set<string>>(new Set());
  const [selNasc, setSelNasc] = useState<Set<string>>(new Set());
  const [previa, setPrevia] = useState<{ resposta: RespostaNascer; lote: ReturnType<typeof montarLoteNascimento> } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  if (!propostas) return null;
  const nascimentos = propostas.nascimentos.filter(n => !jaNasceram.data?.has(n.cod_cadastro));
  const lote = montarLoteNascimento({ ...propostas, nascimentos }, selCart, selNasc);
  const vazio = !lote.p_cartorio.length && !lote.p_produtos.length;
  const alternar = (set: Set<string>, setter: (s: Set<string>) => void, k: string, v: boolean) => { const n = new Set(set); if (v) n.add(k); else n.delete(k); setter(n); };
  const chamar = async (dry: boolean, l = lote) => {
    const r = await supabase.rpc('fn_catalogo_nascer_da_planilha', { p_cartorio: l.p_cartorio, p_produtos: l.p_produtos, p_dry_run: dry, p_leitura_id: leituraId ?? null });
    if (r.error) throw r.error;
    return r.data as unknown as RespostaNascer;
  };
  const conferir = async () => {
    setErro(null); setRodando(true);
    try { setPrevia({ resposta: await chamar(true), lote }); } catch (e) { setErro(formatError(e)); setPrevia(null); } finally { setRodando(false); }
  };
  const confirmar = async () => {
    if (!previa) return;
    setErro(null); setRodando(true);
    try {
      const r = await chamar(false, previa.lote);
      toast.success(`${previa.lote.p_cartorio.length} códigos atualizados no cartório · ${r.nascimento?.nasceram ?? 0} produtos nasceram.`);
      setPrevia(null); setSelCart(new Set()); setSelNasc(new Set());
      await qc.invalidateQueries();
    } catch (e) { setErro(formatError(e)); } finally { setRodando(false); }
  };
  const problemas = previa ? problemasDaPrevia(previa.resposta, previa.lote) : [];
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-semibold">Produtos novos · Códigos e EAN</h3><p className="text-xs text-muted-foreground">Vindos da planilha v2. O par código↔EAN e o inner vêm da aba Códigos e EAN; nada é gravado até você confirmar.</p></div>
      <BotaoGuardado slug="acao.produto_importar_planilha_cadastro" rotuloAcao="Conferir produtos novos" size="sm" disabled={vazio || rodando} onClick={() => void conferir()}><Sparkles className="mr-2 h-4 w-4" />{rodando && !previa ? 'Conferindo…' : `Conferir (${lote.p_produtos.length} nasc. · ${lote.p_cartorio.length} cartório)`}</BotaoGuardado>
    </div>
    {erro && !previa && <Alert variant="destructive"><AlertDescription className="whitespace-pre-wrap break-words">{erro}</AlertDescription></Alert>}
    {jaNasceram.error && <Alert variant="destructive"><AlertDescription>{formatError(jaNasceram.error)}</AlertDescription></Alert>}
    <Table containerClassName="max-h-[calc(100vh-22rem)] min-h-64"><TableHeader><TableRow>
      <TableHead className="w-10"><Checkbox aria-label="Selecionar todos os produtos novos" checked={nascimentos.length > 0 && nascimentos.every(n => selNasc.has(n.cod_cadastro))} disabled={!nascimentos.length} onCheckedChange={v => setSelNasc(v === true ? new Set(nascimentos.map(n => n.cod_cadastro)) : new Set())} /></TableHead>
      <TableHead>Proposta</TableHead><TableHead>Código</TableHead><TableHead>EAN</TableHead><TableHead>DUN</TableHead><TableHead>Inner</TableHead><TableHead>Nome</TableHead><TableHead>Origem</TableHead>
    </TableRow></TableHeader><TableBody>
      {nascimentos.map(n => <TableRow key={`nascimento-${n.cod_cadastro}`}><TableCell><Checkbox aria-label={`Selecionar produto novo ${n.cod_cadastro}`} checked={selNasc.has(n.cod_cadastro)} onCheckedChange={v => alternar(selNasc, setSelNasc, n.cod_cadastro, v === true)} /></TableCell><TableCell>Produto novo{n.reserva_na_planilha && <span className="ml-2 text-xs text-muted-foreground">(reserva nova)</span>}</TableCell><TableCell className="font-mono">{n.cod_cadastro}</TableCell><TableCell className="font-mono">{n.ean}</TableCell><TableCell className="font-mono">{t(n.dun)}</TableCell><TableCell>{t(n.inner_qtd)}</TableCell><TableCell>{t(n.nome_comercial)}</TableCell><TableCell className="capitalize">{n.origem}</TableCell></TableRow>)}
      {propostas.cartorio.map(c => { const obrig = lote.obrigatorias.has(c.ean); return <TableRow key={`cartorio-${c.ean}`}><TableCell><Checkbox aria-label={`Selecionar proposta do EAN ${c.ean}`} checked={obrig || selCart.has(c.ean)} disabled={obrig} onCheckedChange={v => alternar(selCart, setSelCart, c.ean, v === true)} /></TableCell><TableCell>{c.tipo === 'reservar' ? 'Reservar código' : 'Mudar inner'}{obrig && <span className="ml-2 text-xs text-muted-foreground">(exigida pelo nascimento)</span>}</TableCell><TableCell className="font-mono">{c.cod_cadastro}</TableCell><TableCell className="font-mono">{c.ean}</TableCell><TableCell className="font-mono">{t(c.dun)}</TableCell><TableCell>{c.tipo === 'mudar_inner' ? `${t(c.inner_antes)} → ${t(c.inner_qtd)}` : t(c.inner_qtd)}</TableCell><TableCell /><TableCell /></TableRow>; })}
      {!nascimentos.length && !propostas.cartorio.length && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhuma proposta de produto novo ou cartório.</TableCell></TableRow>}
    </TableBody></Table>
    {!!propostas.recusas.length && <div className="space-y-1"><p className="text-sm font-medium text-destructive">Recusas ({propostas.recusas.length})</p><div className="max-h-48 overflow-auto text-sm">{propostas.recusas.map((r, i) => <p key={i} className="border-b py-1"><span className="text-muted-foreground">{r.aba === 'codigos' ? 'Códigos e EAN' : 'Catálogo'} · linha {r.linha}</span> · <strong>{t(r.cod_cadastro)}</strong>{r.ean && <span className="font-mono"> · {r.ean}</span>} · <span className="text-destructive">{r.motivo}</span></p>)}</div></div>}
    <Dialog open={!!previa} onOpenChange={o => { if (!o && !rodando) { setPrevia(null); setErro(null); } }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Prévia · {previa?.lote.p_produtos.length} nascimentos · {previa?.lote.p_cartorio.length} no cartório</DialogTitle></DialogHeader>
      {previa?.resposta.pode_confirmar ? <p className="text-sm text-success">Prévia sem recusas. Ao confirmar, o cartório é atualizado e os produtos nascem num bloco só (se algo falhar, nada é gravado).</p> : <p className="text-sm text-destructive">A prévia recusou o lote. Corrija na planilha e leia de novo.</p>}
      {!!problemas.length && <div className="max-h-60 space-y-1 overflow-auto text-sm">{problemas.map((p, i) => <p key={i} className={p.nivel === 'erro' ? 'text-destructive' : 'text-warning'}>{p.texto}</p>)}</div>}
      {erro && <Alert variant="destructive"><AlertDescription className="whitespace-pre-wrap break-words">{erro}</AlertDescription></Alert>}
      <DialogFooter><Button variant="outline" disabled={rodando} onClick={() => { setPrevia(null); setErro(null); }}>Voltar</Button><Button disabled={rodando || !previa?.resposta.pode_confirmar} onClick={() => void confirmar()}>{rodando ? 'Gravando…' : 'Confirmar'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
