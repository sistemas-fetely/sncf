import { kindDoCampo } from './campos.ts';
import type { ItemFop, ResultadoFop } from '../catalogo-planilha/aplicar-fop.ts';

/** Comparison only: no fuzzy matching and no normalized spelling is ever written. */
export function chaveDimensao(nome: string): string {
  const termos = nome.trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ (?:e|&) /g, ' ').split(' ').filter(Boolean);
  return JSON.stringify([...new Set(termos)].sort());
}
export const dimensaoAusente = (r: ResultadoFop) => r.status === 'erro' && /^Valor de dimensão não cadastrado: /.test(r.erro ?? '');
export type Dimensao = { kind: string; nome: string };

export function criarAplicadorAutomatico(deps: {
  enviar: (itens: ItemFop[]) => Promise<unknown>;
  listar: () => Promise<Dimensao[]>;
  original: (item: ItemFop) => string;
  cadastrar: (campo: string, nome: string) => Promise<{ nome: string }>;
}) {
  let dimensoes: Dimensao[] | undefined;
  const mapeados = new Map<string, string>();
  return async (itens: ItemFop[]): Promise<unknown> => {
    const resposta = await deps.enviar(itens) as { resultados?: ResultadoFop[] };
    if (!Array.isArray(resposta?.resultados)) return resposta;
    const faltantes = resposta.resultados.filter(dimensaoAusente);
    if (!faltantes.length) return resposta;
    dimensoes ??= await deps.listar();
    const novos = itens.map(i => ({ ...i }));
    const produtos = new Set<string>();
    for (const r of faltantes) {
      const item = novos.find(i => i.id === r.id);
      if (!item || typeof item.valor_novo !== 'string') continue;
      try {
        const kind = kindDoCampo(item.campo);
        const chave = `${kind}:${chaveDimensao(item.valor_novo)}`;
        let nome = mapeados.get(chave);
        if (!nome) {
          const existente = dimensoes.find(d => d.kind === kind && chaveDimensao(d.nome) === chaveDimensao(String(item.valor_novo)));
          // Even an existing mirror name is checked through the same live, idempotent FOP door.
          nome = (await deps.cadastrar(item.campo, existente?.nome ?? deps.original(item))).nome;
          if (chaveDimensao(nome) !== chaveDimensao(item.valor_novo)) throw new Error('FOP retornou dimensão não equivalente.');
          mapeados.set(chave, nome);
          dimensoes.push({ kind, nome });
        }
        item.valor_novo = nome;
        produtos.add(item.cod_cadastro);
      } catch (e) { r.erro = e instanceof Error ? e.message : String(e); }
    }
    // Resend complete product groups, never an isolated color: FOP keeps its cor/cor_nome guard.
    const reenviar = novos.filter(i => produtos.has(i.cod_cadastro));
    if (!reenviar.length) return resposta;
    const repetida = await deps.enviar(reenviar) as { resultados?: ResultadoFop[] };
    if (!Array.isArray(repetida?.resultados)) throw new Error('Resposta do FOP sem lista de resultados.');
    for (const item of reenviar) {
      const r = repetida.resultados.find(r => r.id === item.id);
      const indice = resposta.resultados.findIndex(r => r.id === item.id);
      if (indice >= 0) resposta.resultados[indice] = r ?? { id: item.id, status: 'erro', erro: 'FOP não respondeu esta célula.' };
      // The caller must classify conflicts against the canonical spelling actually sent.
      const original = itens.find(i => i.id === item.id);
      if (original) original.valor_novo = item.valor_novo;
    }
    return resposta;
  };
}