import { describe, it, expect } from 'vitest';
import { resolverLeituraConteudo } from '../../../supabase/functions/_shared/catalogo-planilha/referencia';
import { estadoLeituraCatalogo } from './estadoLeituraCatalogo';
import { propostasPendentes, type PropostasCatalogo } from './nascimentoCatalogo';
import { contadoresConciliacao } from './abasConciliacao';

type LeituraTeste = { id: string; status: string; lida_em: string; totais: unknown };
const avisos = ['Colunas de loja ainda não são gravadas'];
const conteudo: LeituraTeste = { id: 'conteudo', status: 'comparada', lida_em: '2026-11-27', totais: { v2: true, avisos } };
const salto = (id: string, referencia: string): LeituraTeste => ({ ...conteudo, id, status: 'sem_mudanca', totais: { leitura_referencia: referencia } });
describe('referências de conteúdo do catálogo', () => {
  it('resolve um salto', async () => {
    expect((await resolverLeituraConteudo(salto('hoje', 'conteudo'), async () => conteudo)).id).toBe('conteudo');
  });
  it('resolve dois saltos e conserva v2 e avisos no cabeçalho', async () => {
    const hoje = salto('hoje', 'ontem');
    const r = await resolverLeituraConteudo(hoje, async id => id === 'ontem' ? salto('ontem', 'conteudo') : conteudo);
    expect(r.id).toBe('conteudo');
    expect(estadoLeituraCatalogo(hoje, r)).toMatchObject({ v2: true, avisos });
  });
  it('preserva referência aplicada_parcial', async () => {
    const aplicada = { ...conteudo, status: 'aplicada_parcial' };
    expect(await resolverLeituraConteudo(salto('hoje', 'conteudo'), async () => aplicada)).toEqual(aplicada);
  });
  it('preserva referência aplicada', async () => {
    const aplicada = { ...conteudo, status: 'aplicada' };
    expect(await resolverLeituraConteudo(salto('hoje', 'conteudo'), async () => aplicada)).toEqual(aplicada);
  });
  it('recusa referência circular em vez de travar', async () => {
    const circular = salto('hoje', 'hoje');
    await expect(resolverLeituraConteudo(circular, async () => circular)).rejects.toThrow('circular');
  });
  it('recusa referência inexistente', async () => {
    await expect(resolverLeituraConteudo(salto('hoje', 'ausente'), async () => null)).rejects.toThrow('não encontrada');
  });
});
const propostas: PropostasCatalogo = {
  nascimentos: Array.from({ length: 207 }, (_, i) => ({ linha: i + 5, cod_cadastro: String(i), ean: `ean-${i}`, dun: null, inner_qtd: 1, nome_comercial: null, origem: 'nacional', reserva_na_planilha: false })),
  cartorio: [{ tipo: 'reservar', linha: 5, cod_cadastro: 'novo', ean: 'ean-novo', dun: null, inner_qtd: 1, inner_antes: null }], recusas: [],
};
describe('propostas ainda não confirmadas', () => {
  it('conta 207 nascimentos mais 1 reserva e mantém 1 ajuste', () => {
    const p = propostasPendentes(propostas, new Set(), []);
    expect(contadoresConciliacao({ propostas: p }, 1, 0)).toEqual({ novos: 208, ajustes: 1, saida: 0 });
  });
  it('não conta nascimento cujo código já existe', () => {
    expect(propostasPendentes(propostas, new Set(['0']), []).nascimentos).toHaveLength(206);
  });
  it('não conta reserva cujo par já está no cartório', () => {
    expect(propostasPendentes(propostas, new Set(), [{ ean: 'ean-novo', cod_cadastro: 'novo', inner_qtd: 1 }]).cartorio).toHaveLength(0);
  });
  it('mantém reserva se o EAN estiver pareado a outro código', () => {
    expect(propostasPendentes(propostas, new Set(), [{ ean: 'ean-novo', cod_cadastro: 'outro', inner_qtd: 1 }]).cartorio).toHaveLength(1);
  });
  it('remove mudança de inner apenas quando já corresponde ao pedido', () => {
    const p = { ...propostas, cartorio: [{ ...propostas.cartorio[0], tipo: 'mudar_inner' as const, inner_qtd: 6 }] };
    expect(propostasPendentes(p, new Set(), [{ ean: 'ean-novo', cod_cadastro: 'novo', inner_qtd: 1 }]).cartorio).toHaveLength(1);
    expect(propostasPendentes(p, new Set(), [{ ean: 'ean-novo', cod_cadastro: 'novo', inner_qtd: 6 }]).cartorio).toHaveLength(0);
  });
});