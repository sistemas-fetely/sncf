import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { BotaoGuardado } from '@/components/acesso/BotaoGuardado';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatError } from '@/lib/format-error';
import { agruparDimensoes, coresParecidas, kindDoCampo, type GrupoDimensao } from '@/lib/acervo/dimensoesCatalogo';
import type { CelulaCatalogo } from '@/lib/acervo/revisaoCatalogo';

type Decisao = { grupo: GrupoDimensao<CelulaCatalogo>; acao: 'cadastrar' | 'descartar'; leituraId: string };
export function ValoresNaoCadastradosFop({ celulas, rotulos, leituraId, bloqueado, aplicar, descartar }: {
  celulas: CelulaCatalogo[]; rotulos: Record<string, string>; leituraId?: string; bloqueado: boolean;
  aplicar: (celulas: CelulaCatalogo[], leituraId: string) => void;
  descartar: (celulas: CelulaCatalogo[], leituraId: string) => Promise<unknown>;
}) {
  const grupos = agruparDimensoes(celulas);
  const [decisao, setDecisao] = useState<Decisao | null>(null);
  const cores = useQuery({ queryKey: ['catalogo-fop-cores'], enabled: grupos.some(g => g.campo === 'cor' || g.campo === 'cor_nome'), queryFn: async () => {
    const out: { nome: string }[] = [];
    for (let de = 0; ; de += 1000) {
      const r = await supabase.from('fop_cores').select('nome').order('nome').range(de, de + 999);
      if (r.error) throw r.error;
      out.push(...(r.data ?? [])); if ((r.data?.length ?? 0) < 1000) break;
    }
    return out;
  } });
  const mutation = useMutation({ mutationFn: async (d: Decisao) => {
    if (d.acao === 'descartar') { await descartar(d.grupo.celulas, d.leituraId); return; }
    kindDoCampo(d.grupo.campo);
    const r = await supabase.functions.invoke('catalogo-dimensao-cadastrar', { body: { campo: d.grupo.campo, nome: d.grupo.nome } });
    if (r.error instanceof FunctionsHttpError) {
      const body = await r.error.context.json().catch(() => null);
      throw new Error(body?.erro ?? r.error.message);
    }
    if (r.error) throw r.error;
    if (r.data?.ok !== true) throw new Error(r.data?.erro ?? 'FOP não confirmou o cadastro da dimensão.');
  }, onSuccess: (_, d) => {
    setDecisao(null);
    if (d.acao === 'cadastrar') aplicar(d.grupo.celulas, d.leituraId);
  } });
  const abrir = (grupo: GrupoDimensao<CelulaCatalogo>, acao: Decisao['acao']) => {
    if (!leituraId) return;
    mutation.reset(); setDecisao({ grupo, acao, leituraId });
  };
  if (!grupos.length && !decisao) return null;
  return <div className="space-y-3 border-y py-4">
    <h3 className="font-semibold">Valores não cadastrados no FOP</h3>
    {cores.error && <Alert variant="destructive"><AlertDescription>Não foi possível consultar cores parecidas: {formatError(cores.error)}</AlertDescription></Alert>}
    <div className="divide-y">{grupos.map(g => {
      const parecidas = g.campo === 'cor' || g.campo === 'cor_nome' ? coresParecidas(g.nome, cores.data ?? []) : [];
      const permitido = ['cor', 'cor_nome', 'colecao'].includes(g.campo);
      return <div key={g.chave} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1"><p className="break-words text-sm font-medium">{rotulos[g.campo] ?? g.campo} · {g.nome} · {g.celulas.length} células</p>
          {!!parecidas.length && <p className="break-words text-xs text-warning">Parecidas já cadastradas: {parecidas.join(' · ')}</p>}
          {!permitido && <p className="text-xs text-muted-foreground">{g.campo === 'grupo' ? 'Grupo exige categoria e não pode ser cadastrado nesta versão.' : 'Cadastro deste campo indisponível nesta versão.'}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <BotaoGuardado slug="acao.produto_importar_planilha_cadastro" rotuloAcao="Cadastrar dimensão no FOP" size="sm" disabled={!permitido || !leituraId || bloqueado || mutation.isPending} onClick={() => abrir(g, 'cadastrar')}>Cadastrar no FOP</BotaoGuardado>
          <BotaoGuardado slug="acao.produto_importar_planilha_cadastro" rotuloAcao="Descartar dimensão da planilha" size="sm" variant="outline" disabled={!leituraId || bloqueado || mutation.isPending} onClick={() => abrir(g, 'descartar')}>É erro na planilha</BotaoGuardado>
        </div>
      </div>;
    })}</div>
    <Dialog open={!!decisao} onOpenChange={o => { if (!o && !mutation.isPending) setDecisao(null); }}><DialogContent className={`max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto ${mutation.isPending ? '[&>button:last-child]:hidden' : ''}`} onEscapeKeyDown={e => { if (mutation.isPending) e.preventDefault(); }} onInteractOutside={e => { if (mutation.isPending) e.preventDefault(); }}>
      <DialogHeader><DialogTitle>{decisao?.acao === 'cadastrar' ? 'Cadastrar valor no FOP' : 'É erro na planilha'}</DialogTitle></DialogHeader>
      {decisao?.acao === 'cadastrar' ? <div className="space-y-3 text-sm"><p>{rotulos[decisao.grupo.campo] ?? decisao.grupo.campo}</p><p className="whitespace-pre-wrap break-words border-l-2 border-primary pl-3 font-semibold">{decisao.grupo.nome}</p><p className="text-muted-foreground">Após o cadastro, serão reaplicadas {decisao.grupo.celulas.length} células com este valor.</p></div> : <p className="text-sm">Estas {decisao?.grupo.celulas.length} células serão descartadas; corrija o valor na planilha e a próxima leitura traz a mudança de novo.</p>}
      {mutation.error && <Alert variant="destructive"><AlertDescription className="break-words">{formatError(mutation.error)}</AlertDescription></Alert>}
      <DialogFooter className="gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={() => setDecisao(null)}>Voltar</Button><BotaoGuardado slug="acao.produto_importar_planilha_cadastro" rotuloAcao={decisao?.acao === 'cadastrar' ? 'Confirmar cadastro de dimensão' : 'Confirmar descarte de dimensão'} disabled={mutation.isPending} onClick={() => { if (decisao) mutation.mutate(decisao); }}>{mutation.isPending ? 'Processando…' : 'Confirmar'}</BotaoGuardado></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}