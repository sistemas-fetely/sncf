import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { buscarTodos } from '@/lib/supabaseLotes';
import { KpiPill } from '@/components/shared/KpiPill';
import { SortableTableHead, ordenarPor, type SortState } from '@/components/shared/SortableTableHead';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Selo, type EstadoSelo } from '@/components/ui/selo';
import { useEstadoTela } from '@/lib/navegacao/useEstadoTela';
import { lerOrdemKD, escreverOrdemKD } from '@/lib/navegacao/codecUrl';
import { usePermissaoAcaoOuSuperAdmin } from '@/hooks/usePermissaoAcao';
import { formatBRL } from '@/lib/format-currency';
import { fmtDataHora } from '@/lib/data';
import { formatError } from '@/lib/format-error';
import { cn } from '@/lib/utils';
import { ProdutoMiniatura, useImagensProduto } from '@/components/venda-direta/ProdutoMiniatura';
import { RECORTES_ML, RECORTES_DESTINOS_ML, bateBusca, contarRecortes, noRecorte, type AnuncioMl, type RecorteMl } from '@/lib/marketplace/anunciosMl';

interface SemAnuncio { sku: string; cod_cadastro: string | null; nome_comercial: string | null; preco_varejo: number | null }
const COR_PILULA: Record<RecorteMl, 'emerald' | 'amber' | 'blue' | 'gray' | 'violet' | 'admin'> = {
  anunciado: 'emerald', pausado: 'amber', sem_anuncio: 'violet', preco_diferente: 'amber', vinculo_quebrado: 'admin', revisao: 'blue', encerrado: 'gray',
};
const ESTADOS: EstadoSelo[] = ['success', 'warning', 'destructive', 'info', 'muted'];
type Col = 'sku' | 'nome_comercial' | 'titulo' | 'anuncio_loja_id' | 'situacao_rotulo' | 'preco' | 'preco_varejo' | 'diferenca_preco' | 'qtd_imagens' | 'visto_em';

function useAnunciosMl() {
  return useQuery({
    queryKey: ['ml-anuncios'],
    queryFn: async () => {
      const [anuncios, semAnuncio, exec] = await Promise.all([
        buscarTodos<AnuncioMl>(() => (supabase as any).from('vw_ml_anuncio_gestao').select('*'), ['id']),
        buscarTodos<SemAnuncio>(() => (supabase as any).from('vw_ml_sem_anuncio').select('sku,cod_cadastro,nome_comercial,preco_varejo'), ['sku']),
        supabase.from('bling_anuncio_sync_execucao').select('terminado_em,erro,iniciado_em').order('iniciado_em', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (exec.error) throw exec.error;
      return { anuncios, semAnuncio, ultima: exec.data };
    },
  });
}

export function AnunciosMl() {
  const q = useAnunciosMl();
  const qc = useQueryClient();
  const sincronizar = usePermissaoAcaoOuSuperAdmin('acao.marketplace.sincronizar');
  const [estado, setEstado] = useEstadoTela({ recorte: 'anunciado', q: '', ordemAn: '' }, { replaceKeys: ['q'] });
  const recorte = (RECORTES_DESTINOS_ML.includes(estado.recorte as RecorteMl) ? estado.recorte : 'anunciado') as RecorteMl;
  const ler = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('bling-anuncios-sync', { body: {} });
      if (error) {
        const ctx = (error as any).context;
        const corpo = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
        throw new Error(corpo?.erro ?? error.message);
      }
      if (!data?.ok) throw new Error(data?.erro ?? 'Leitura falhou sem mensagem.');
      return data;
    },
    onSuccess: async d => {
      await qc.invalidateQueries({ queryKey: ['ml-anuncios'] });
      toast.success(`Leitura concluída: ${d.total_lidos} anúncios, ${d.total_novos} novos, ${d.total_alterados} alterados, ${d.total_sumidos} sumidos.`);
    },
    onError: e => toast.error(formatError(e)),
  });

  const bruto = lerOrdemKD(estado.ordemAn);
  const sort: SortState<Col> | null = bruto ? { column: bruto.key as Col, direction: bruto.dir } : null;
  const contagem = useMemo(() => contarRecortes(q.data?.anuncios ?? [], q.data?.semAnuncio.length ?? 0), [q.data]);
  const linhas = useMemo(() => {
    const lista = (q.data?.anuncios ?? []).filter(a => noRecorte(a, recorte) && bateBusca(estado.q, a.sku, a.titulo, a.anuncio_loja_id, a.cod_cadastro));
    return ordenarPor(lista, sort, {
      sku: a => a.sku, nome_comercial: a => a.nome_comercial, titulo: a => a.titulo, anuncio_loja_id: a => a.anuncio_loja_id,
      situacao_rotulo: a => a.situacao_rotulo, preco: a => a.preco, preco_varejo: a => a.preco_varejo,
      diferenca_preco: a => a.diferenca_preco, qtd_imagens: a => a.qtd_imagens, visto_em: a => a.visto_em,
    });
  }, [q.data, recorte, estado.q, sort?.column, sort?.direction]);
  const semAnuncio = useMemo(() => (q.data?.semAnuncio ?? []).filter(s => bateBusca(estado.q, s.sku, s.nome_comercial, s.cod_cadastro)), [q.data, estado.q]);
  const visiveisSku = recorte === 'sem_anuncio' ? semAnuncio.slice(0, 300).map(s => s.sku) : linhas.slice(0, 300).map(a => a.sku).filter(Boolean) as string[];
  const imagens = useImagensProduto(visiveisSku);
  const ultima = q.data?.ultima;
  const ordenar = (n: SortState<Col> | null) => setEstado({ ordemAn: escreverOrdemKD(n ? { key: n.column, dir: n.direction } : null) });
  const H = ({ c, children, align }: { c: Col; children: React.ReactNode; align?: 'left' | 'right' }) =>
    <SortableTableHead column={c} sort={sort} onSort={ordenar} align={align}>{children}</SortableTableHead>;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-xs text-muted-foreground">
        Última leitura do Bling: {ultima ? (ultima.terminado_em ? fmtDataHora(ultima.terminado_em) : `em andamento desde ${fmtDataHora(ultima.iniciado_em)}`) : 'nunca'}
        {ultima?.erro && <span className="ml-2 text-destructive">Erro: {ultima.erro}</span>}
      </div>
      {sincronizar.permitido && <Button size="sm" variant="outline" disabled={ler.isPending} onClick={() => ler.mutate()}>
        <RefreshCw className={cn('h-4 w-4', ler.isPending && 'animate-spin')} />{ler.isPending ? 'Lendo…' : 'Ler agora'}
      </Button>}
    </div>
    {q.error && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{formatError(q.error)}</div>}
    <div className="flex flex-wrap gap-2">
      {RECORTES_ML.filter(r => RECORTES_DESTINOS_ML.includes(r.codigo)).map(r => <KpiPill key={r.codigo} label={r.rotulo} count={contagem[r.codigo]} color={COR_PILULA[r.codigo]}
        active={recorte === r.codigo} onClick={() => setEstado({ recorte: r.codigo })} />)}
    </div>
    <Input className="w-[280px]" aria-label="Buscar anúncios" placeholder="Buscar por SKU, título ou MLB…" value={estado.q} onChange={e => setEstado({ q: e.target.value })} />
    <Card><CardContent className="p-0 overflow-x-auto">
      {q.isPending ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
      : recorte === 'sem_anuncio' ? <Table className="text-xs">
          <TableHeader><TableRow><TableHead className="w-12">Foto</TableHead><TableHead>SKU</TableHead><TableHead>Nome</TableHead><TableHead className="text-right">Preço varejo</TableHead></TableRow></TableHeader>
          <TableBody>
            {semAnuncio.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Nenhum produto sem anúncio.</TableCell></TableRow>}
            {semAnuncio.map(s => <TableRow key={s.sku}>
              <TableCell><ProdutoMiniatura img={imagens.data?.get(s.sku)} tamanho={36} /></TableCell>
              <TableCell className="font-mono">{s.sku}</TableCell><TableCell>{s.nome_comercial}</TableCell>
              <TableCell className="text-right">{s.preco_varejo != null ? formatBRL(s.preco_varejo) : ''}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      : <Table className="text-xs">
          <TableHeader><TableRow>
            <TableHead className="w-12">Foto</TableHead><H c="sku">SKU</H><H c="nome_comercial">Nome SNCF</H><H c="titulo">Título do anúncio</H>
            <H c="anuncio_loja_id">MLB</H><H c="situacao_rotulo">Situação</H><H c="preco" align="right">Preço anúncio</H>
            <H c="preco_varejo" align="right">Preço varejo</H><H c="diferenca_preco" align="right">Diferença</H><H c="qtd_imagens" align="right">Fotos</H><H c="visto_em">Visto em</H>
          </TableRow></TableHeader>
          <TableBody>
            {linhas.length === 0 && <TableRow><TableCell colSpan={11} className="py-6 text-center text-muted-foreground">Nenhum anúncio neste recorte.</TableCell></TableRow>}
            {linhas.map(a => <TableRow key={a.id}>
              <TableCell><ProdutoMiniatura img={a.sku ? imagens.data?.get(a.sku) : undefined} tamanho={36} /></TableCell>
              <TableCell className="font-mono">{a.sku ?? ''}</TableCell>
              <TableCell>{a.nome_comercial ?? ''}</TableCell>
              <TableCell className="max-w-[280px]">{a.titulo}</TableCell>
              <TableCell>{a.url_ml ? <a href={a.url_ml} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{a.anuncio_loja_id}<ExternalLink className="h-3 w-3" /></a> : a.anuncio_loja_id}</TableCell>
              <TableCell><Selo estado={ESTADOS.includes(a.situacao_cor as EstadoSelo) ? a.situacao_cor as EstadoSelo : 'muted'}>{a.situacao_rotulo ?? `Situação ${a.situacao ?? '?'}`}</Selo></TableCell>
              <TableCell className="text-right">{a.preco != null ? formatBRL(a.preco) : ''}</TableCell>
              <TableCell className="text-right">{a.preco_varejo != null ? formatBRL(a.preco_varejo) : ''}</TableCell>
              <TableCell className={cn('text-right', a.preco_diferente && 'font-medium text-destructive')}>{a.diferenca_preco != null ? formatBRL(a.diferenca_preco) : ''}</TableCell>
              <TableCell className="text-right">{a.qtd_imagens ?? ''}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDataHora(a.visto_em)}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>}
    </CardContent></Card>
  </div>;
}
