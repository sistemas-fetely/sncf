import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, UploadCloud } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BotaoGuardado } from '@/components/acesso/BotaoGuardado';
import { formatError } from '@/lib/format-error';
import type { ItemFop, ResultadoFopItem } from '@/lib/acervo/registroFop';
import { registrarNoFop, usePendentesFop } from '@/hooks/useRegistroFop';

const ROTULO: Record<ResultadoFopItem['situacao'], string> = { registrado: 'registrado', ja_existia: 'já existia', nasceria: 'pendente', falhou: 'falhou' };

/** Resultado por código do registro no FOP (registrado / já existia / falhou com o erro inteiro). */
export function ResultadoRegistroFop({ resultado }: { resultado: ResultadoFopItem[] }) {
  if (!resultado.length) return null;
  const falhas = resultado.filter((r) => r.situacao === 'falhou');
  return <div className="space-y-1 text-sm">
    <p className="font-medium">FOP: {resultado.filter((r) => r.situacao === 'registrado').length} registrados · {resultado.filter((r) => r.situacao === 'ja_existia').length} já existiam · <span className={falhas.length ? 'text-destructive' : ''}>{falhas.length} falharam</span></p>
    <div className="max-h-48 overflow-auto">{resultado.map((r) => <p key={r.cod_cadastro} className="border-b py-0.5"><span className="font-mono">{r.cod_cadastro}</span> · <span className={r.situacao === 'falhou' ? 'text-destructive' : 'text-muted-foreground'}>{ROTULO[r.situacao]}</span>{r.situacao === 'falhou' && r.motivo && <span className="whitespace-pre-wrap break-words text-destructive"> — {r.motivo}</span>}</p>)}</div>
  </div>;
}

/** Registra no FOP e invalida a lista de pendentes. Nunca desfaz o nascimento no SNCF. */
export async function registrarEAvisar(itens: ItemFop[], qc: ReturnType<typeof useQueryClient>, onParcial?: (r: ResultadoFopItem[]) => void) {
  const r = await registrarNoFop(itens, false, onParcial);
  await qc.invalidateQueries({ queryKey: ['fop-pendentes-registro'] });
  const falhas = r.filter((x) => x.situacao === 'falhou').length;
  if (falhas) toast.error(`${falhas} produto(s) não entraram no FOP — continuam pendentes. Veja o erro de cada código.`);
  else toast.success(`FOP: ${r.filter((x) => x.situacao === 'registrado').length} registrado(s), ${r.filter((x) => x.situacao === 'ja_existia').length} já existiam.`);
  return r;
}

/** Faixa "N produtos nascidos ainda não estão no FOP" — derivada de consulta real ao FOP (prévia). */
export function PendentesFopCatalogo() {
  const qc = useQueryClient();
  const q = usePendentesFop();
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoFopItem[]>([]);
  if (q.isLoading) return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Conferindo no FOP os produtos nascidos…</p>;
  if (q.error) return <Alert variant="destructive"><AlertTitle>Não consegui conferir os produtos no FOP</AlertTitle><AlertDescription className="whitespace-pre-wrap break-words">{formatError(q.error)}</AlertDescription></Alert>;
  const pend = q.data ?? [];
  if (!pend.length && !resultado.length) return null;
  const registrar = async () => {
    setRodando(true); setResultado([]);
    try { await registrarEAvisar(pend.map((p) => p.item), qc, setResultado); } catch (e) { toast.error(formatError(e)); } finally { setRodando(false); }
  };
  return <Alert variant={pend.length ? 'destructive' : 'default'} className="space-y-2">
    {pend.length > 0 && <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AlertTitle className="mb-0">{pend.length} produto(s) nascido(s) ainda não estão no FOP</AlertTitle>
        <BotaoGuardado slug="acao.produto_importar_planilha_cadastro" rotuloAcao="Registrar no FOP" size="sm" disabled={rodando} onClick={() => void registrar()}><UploadCloud className="mr-2 h-4 w-4" />{rodando ? 'Registrando…' : 'Registrar no FOP'}</BotaoGuardado>
      </div>
      <AlertDescription className="text-xs">Existem no SNCF na fase registrado, mas o FOP não os tem. Reenviar é seguro: quem já existe no FOP não é duplicado. {pend.slice(0, 12).map((p) => p.cod_cadastro).join(', ')}{pend.length > 12 ? '…' : ''}{pend.some((p) => p.situacao === 'falhou') && <span className="block text-destructive">O FOP recusaria {pend.filter((p) => p.situacao === 'falhou').length}: {pend.filter((p) => p.situacao === 'falhou').slice(0, 3).map((p) => `${p.cod_cadastro} — ${p.motivo}`).join(' · ')}</span>}</AlertDescription>
    </>}
    <ResultadoRegistroFop resultado={resultado} />
  </Alert>;
}
