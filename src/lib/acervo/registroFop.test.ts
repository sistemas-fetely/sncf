import { describe, it, expect } from 'vitest';
import { emBlocos, lerResultadoFop, pendentesDeFop } from './registroFop';

describe('registroFop', () => {
  it('divide em blocos de 200', () => {
    expect(emBlocos(Array.from({ length: 465 }, (_, i) => i)).map((b) => b.length)).toEqual([200, 200, 65]);
  });
  it('classifica registrado, já existia, prévia e falha', () => {
    const r = lerResultadoFop(['1', '2', '3', '4', '5'], [
      { cod_cadastro: '1', status: 'registrado' },
      { cod_cadastro: '2', status: 'bloqueado', motivo: 'cod_cadastro JÁ EXISTE no FOP' },
      { cod_cadastro: '3', status: 'nasceria' },
      { cod_cadastro: '4', status: 'bloqueado', motivo: 'EAN em uso por 00001' },
    ]);
    expect(r.map((x) => x.situacao)).toEqual(['registrado', 'ja_existia', 'nasceria', 'falhou', 'falhou']);
    expect(r[3].motivo).toBe('EAN em uso por 00001');
    expect(r[4].motivo).toBe('O FOP não respondeu este código.');
  });
  it('pendentes são os que o FOP não confirmou', () => {
    const r = lerResultadoFop(['1', '2', '3'], [{ cod_cadastro: '1', status: 'registrado' }, { cod_cadastro: '2', status: 'bloqueado', motivo: 'cod_cadastro JA EXISTE no FOP' }, { cod_cadastro: '3', status: 'nasceria' }]);
    expect(pendentesDeFop(r).map((x) => x.cod_cadastro)).toEqual(['3']);
  });
});
