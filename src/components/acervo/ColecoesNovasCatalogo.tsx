import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { BotaoGuardado } from '@/components/acesso/BotaoGuardado';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatError } from '@/lib/format-error';

export function ColecoesNovasCatalogo({ novas }: { novas: { nome: string; produtos: number; parecida?: string }[] }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState<string | null>(null);
  const cadastrar = useMutation({ mutationFn: async (valor: string) => {
    const r = await supabase.functions.invoke('catalogo-dimensao-criar', { body: { dimensao: 'colecao', nome: valor } });
    if (r.error) {
      const corpo = r.error instanceof FunctionsHttpError ? await r.error.context.json().catch(() => null) : null;
      throw new Error(corpo?.erro ?? r.error.message);
    }
    if (!r.data?.ok) throw new Error(r.data?.erro ?? 'FOP não confirmou o cadastro da coleção.');
    return r.data;
  }, onSuccess: async r => { setNome(null); await qc.invalidateQueries(); toast.success(`Coleção ${r.nome} cadastrada.`); }, onError: e => toast.error(formatError(e)) });
  if (!novas.length) return null;
  return <>
    <div className="rounded-md border bg-card card-shadow">
      <h3 className="border-b px-4 py-3 font-semibold">Coleções novas</h3>
      <ul className="divide-y">{novas.map(c => <li key={c.nome} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 space-y-1"><p className="break-words font-medium whitespace-pre-wrap">{c.nome}</p><p className="text-xs text-muted-foreground">{c.produtos} produtos</p>{c.parecida && <p className="text-sm text-warning">parecida com: {c.parecida}</p>}</div>
        <BotaoGuardado slug="acao.produto_importar_planilha_cadastro" rotuloAcao="Cadastrar coleção" size="sm" disabled={cadastrar.isPending} onClick={() => setNome(c.nome)}>Cadastrar</BotaoGuardado>
      </li>)}</ul>
    </div>
    <Dialog open={nome !== null} onOpenChange={o => { if (!o && !cadastrar.isPending) setNome(null); }}><DialogContent><DialogHeader><DialogTitle>Confirmar cadastro da coleção</DialogTitle></DialogHeader><p className="break-words whitespace-pre-wrap font-medium">{nome}</p><DialogFooter><Button variant="outline" disabled={cadastrar.isPending} onClick={() => setNome(null)}>Voltar</Button><BotaoGuardado slug="acao.produto_importar_planilha_cadastro" rotuloAcao="Cadastrar coleção" disabled={cadastrar.isPending} onClick={() => { if (nome !== null) cadastrar.mutate(nome); }}>{cadastrar.isPending ? 'Cadastrando…' : 'Confirmar cadastro'}</BotaoGuardado></DialogFooter></DialogContent></Dialog>
  </>;
}
