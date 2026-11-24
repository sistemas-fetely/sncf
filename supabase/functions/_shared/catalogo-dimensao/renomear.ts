import { aplicarNoFop, montarItens, type CelulaFop, type Dependencias, type ItemFop, type Resumo } from '../catalogo-planilha/aplicar-fop.ts';

type Kind = 'grupo' | 'colecao' | 'cor';
type Quem = { id: string; nome: string };
export type Renomeacao = { campo: 'grupo' | 'colecao'; de: string; para: string; produtos: number };
export type AjusteFop = { quem: Quem; acao: 'renomear'; kind: 'grupo' | 'colecao'; de: string; para: string; categoria_id?: string; cod_cadastros: string[]; dry_run?: boolean }
  | { quem: Quem; acao: 'inativar_se_vazio'; kind: Kind; nome: string; categoria_id?: string };
export type ResultadoAjuste = { ok?: boolean; renomeado?: boolean; inativado?: boolean; motivo?: string; erro?: string; id?: string; nome?: string; produtos?: number };
export type ResultadoSncf = { renomeado?: boolean; inativado?: boolean; motivo?: string };
export type DependenciasDimensao = Dependencias & {
  categoria: (item: ItemFop) => Promise<string | undefined>;
  ajustarFop: (corpo: AjusteFop) => Promise<ResultadoAjuste>;
  renomearSncf: (campo: 'grupo' | 'colecao', de: string, para: string, cods: string[], desfazer: boolean) => Promise<ResultadoSncf>;
  inativarSncf: (campo: 'grupo' | 'colecao', nome: string) => Promise<ResultadoSncf>;
  espelhar: (campo: 'grupo' | 'colecao', id: string, nome: string) => Promise<void>;
};
const mensagem = (e: unknown) => e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : 'Falha na operação de dimensão.';
const exigirOk = (r: ResultadoAjuste) => { if (r?.ok !== true) throw new Error(r?.erro || 'FOP não confirmou o ajuste da dimensão.'); return r; };

/** Exact old/new pairs: equivalence belongs to the authoritative FOP/SQL doors, not grouping. */
export function candidatasRenomeacao(celulas: CelulaFop[]) {
  const grupos = new Map<string, CelulaFop[]>();
  for (const c of celulas) {
    if (c.dono !== 'produto' || c.tipo !== 'mudanca' || !['grupo', 'colecao'].includes(c.campo)
      || typeof c.valor_sistema !== 'string' || !c.valor_sistema.trim()
      || typeof c.valor_planilha !== 'string' || !c.valor_planilha.trim() || c.valor_sistema === c.valor_planilha) continue;
    const key = JSON.stringify([c.campo, c.valor_sistema, c.valor_planilha]);
    grupos.set(key, [...(grupos.get(key) ?? []), c]);
  }
  return [...grupos.values()];
}

/** Pure orchestration with injected I/O; no live endpoint is called by the tests. */
export async function aplicarComDimensoes(celulas: CelulaFop[], ids: string[], leituraId: string, quem: Quem, deps: DependenciasDimensao): Promise<Resumo & { renomeadas: Renomeacao[]; inativadas: number }> {
  // Validate the entire selection before any rename can write, even if all cells are optimized out.
  const itens = montarItens(celulas, ids, leituraId);
  const selecionadas = new Set(ids);
  const cs = celulas.filter(c => selecionadas.has(c.id));
  const porId = new Map(itens.map(i => [i.id, i]));
  const aplicadas = new Set<string>();
  const renomeadas: Renomeacao[] = [];
  const motivos: string[] = [];
  const categorias = new Map<string, string | undefined>();
  const categoria = async (c: CelulaFop) => {
    if (!categorias.has(c.cod_cadastro)) {
      const item = porId.get(c.id);
      if (!item) throw new Error('Célula sem item validado.');
      categorias.set(c.cod_cadastro, await deps.categoria(item));
    }
    return categorias.get(c.cod_cadastro);
  };
  const concluir: Dependencias['concluir'] = async (lista, acao, dono) => {
    await deps.concluir(lista, acao, dono);
    for (const id of lista) aplicadas.add(id);
  };

  for (const grupo of candidatasRenomeacao(cs)) {
    const primeira = grupo[0];
    if (!primeira || (primeira.campo !== 'grupo' && primeira.campo !== 'colecao')) continue;
    const campo = primeira.campo;
    const de = String(primeira.valor_sistema), para = String(primeira.valor_planilha);
    const cods = [...new Set(grupo.map(c => c.cod_cadastro))];
    const subdivisoes = new Map<string, string[]>();
    let sncfRenomeado = false;
    const confirmadas: { corpo: Extract<AjusteFop, { acao: 'renomear' }>; resposta: ResultadoAjuste }[] = [];
    try {
      for (const c of grupo) {
        const cat = campo === 'grupo' ? await categoria(c) : '';
        if (campo === 'grupo' && !cat) throw new Error('Grupo sem categoria conhecida no produto.');
        const key = cat ?? '';
        subdivisoes.set(key, [...new Set([...(subdivisoes.get(key) ?? []), c.cod_cadastro])]);
      }
      const corpos = [...subdivisoes].map<Extract<AjusteFop, { acao: 'renomear' }>>(([cat, produtos]) => ({ quem, acao: 'renomear', kind: campo, de, para,
        cod_cadastros: produtos, ...(cat ? { categoria_id: cat } : {}) }));
      const previas = await Promise.all(corpos.map(async corpo => exigirOk(await deps.ajustarFop({ ...corpo, dry_run: true }))));
      if (previas.some(r => r.renomeado !== true)) {
        motivos.push(`${campo} ${de} → ${para}: produto a produto (${previas.filter(r => r.renomeado !== true).map(r => r.motivo ?? 'prévia recusada').join(', ')}).`);
        continue;
      }
      const local = await deps.renomearSncf(campo, de, para, cods, false);
      sncfRenomeado = local.renomeado === true;
      if (!sncfRenomeado && local.motivo !== 'parcial') {
        motivos.push(`${campo} ${de} → ${para}: produto a produto (${local.motivo ?? 'SNCF não confirmou'}).`);
        continue;
      }
      if (!sncfRenomeado) motivos.push(`${campo} ${de} → ${para}: renomeação só no FOP; conjunto parcial no SNCF.`);
      for (const corpo of corpos) {
        const r = exigirOk(await deps.ajustarFop(corpo));
        if (r.renomeado !== true) throw new Error(r.motivo || 'FOP não renomeou a dimensão.');
        if (!r.id || !r.nome) throw new Error('FOP confirmou renomeação sem id/nome para o espelho.');
        confirmadas.push({ corpo, resposta: r });
      }
    } catch (e) {
      if (sncfRenomeado) {
        // A failed compensation is fatal: never continue silently with mismatched local state.
        const desfeito = await deps.renomearSncf(campo, de, para, cods, true);
        if (desfeito.renomeado !== true) throw new Error(`Não foi possível desfazer ${campo} ${de} → ${para}: ${desfeito.motivo ?? 'SNCF não confirmou'}.`);
      }
      motivos.push(`${campo} ${de} → ${para}: produto a produto após falha: ${mensagem(e)}`);
      continue;
    }
    // Registration/mirror failures must not fall back and resend a confirmed rename.
    await concluir(grupo.map(c => c.id), 'aplicar', 'produto');
    for (const { resposta } of confirmadas) {
      if (resposta.id && resposta.nome) await deps.espelhar(campo, resposta.id, resposta.nome);
    }
    renomeadas.push({ campo, de, para, produtos: cods.length });
  }

  const nRenomeadas = aplicadas.size;
  let inativadas = 0;
  const inativar = async () => {
    const vazias = new Map<string, { kind: Kind; nome: string; cat?: string }>();
    for (const c of cs) {
      if (!aplicadas.has(c.id) || !['grupo', 'colecao', 'cor', 'cor_nome'].includes(c.campo)
        || typeof c.valor_sistema !== 'string' || !c.valor_sistema.trim() || c.valor_sistema === c.valor_planilha) continue;
      try {
        const kind: Kind = c.campo === 'grupo' ? 'grupo' : c.campo === 'colecao' ? 'colecao' : 'cor';
        const cat = kind === 'grupo' ? await categoria(c) : undefined;
        if (kind === 'grupo' && !cat) throw new Error('Grupo sem categoria conhecida para inativar.');
        vazias.set(JSON.stringify([kind, c.valor_sistema, cat]), { kind, nome: c.valor_sistema, cat });
      } catch (e) { motivos.push(`Inativação ${c.campo} ${c.valor_sistema}: ${mensagem(e)}`); }
    }
    const locais = new Set<string>();
    for (const { kind, nome, cat } of vazias.values()) {
      // Each service checks current membership atomically; a remaining product prevents inactivation.
      try {
        const r = exigirOk(await deps.ajustarFop({ quem, acao: 'inativar_se_vazio', kind, nome, ...(cat ? { categoria_id: cat } : {}) }));
        if (typeof r.inativado !== 'boolean') throw new Error('FOP não confirmou a verificação de dimensão vazia.');
        if (r.inativado) inativadas++;
      } catch (e) { motivos.push(`Inativação FOP ${kind} ${nome}: ${mensagem(e)}`); }
      const key = JSON.stringify([kind, nome]);
      if (kind !== 'cor' && !locais.has(key)) {
        locais.add(key);
        try {
          const r = await deps.inativarSncf(kind, nome);
          if (typeof r.inativado !== 'boolean') throw new Error('SNCF não confirmou a verificação de dimensão vazia.');
          if (r.inativado) inativadas++;
        } catch (e) { motivos.push(`Inativação SNCF ${kind} ${nome}: ${mensagem(e)}`); }
      }
    }
  };
  let resumo: Resumo;
  try {
    resumo = await aplicarNoFop(celulas, ids.filter(id => !aplicadas.has(id)), leituraId, quem, { ...deps, concluir });
  } catch (e) {
    // Previous successful batches also lost values, even if a later batch failed transport.
    await inativar();
    throw new Error(`${mensagem(e)}${motivos.length ? ` ${motivos.join(' ')}` : ''}`);
  }
  await inativar();
  return { ...resumo, aplicadas: resumo.aplicadas + nRenomeadas, renomeadas, inativadas,
    ...((resumo.motivos?.length || motivos.length) ? { motivos: [...(resumo.motivos ?? []), ...motivos] } : {}) };
}