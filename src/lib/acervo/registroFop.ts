/**
 * Registro de produtos já nascidos no SNCF no FOP (mesmo passo 6 da Importação de PI:
 * promover-fase-produto tipo=registrar_pi → fn_registrar_produtos_cartorio, idempotente).
 * Funções puras: blocos, leitura da resposta e quem continua pendente.
 */
export const TETO_ITENS_FOP = 200;

export type ItemFop = { cod_cadastro: string; sku?: string; ean?: string | null; dun?: string | null; inner_qtd?: number | null; marca?: string; fase?: string };
export type SituacaoFop = 'registrado' | 'ja_existia' | 'nasceria' | 'falhou';
export type ResultadoFopItem = { cod_cadastro: string; situacao: SituacaoFop; motivo: string | null };

export function emBlocos<T>(itens: T[], teto = TETO_ITENS_FOP): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += teto) out.push(itens.slice(i, i + teto));
  return out;
}

const txt = (v: unknown) => (v == null ? '' : String(v)).trim();
const jaExiste = (motivo: string) => motivo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().includes('JA EXISTE NO FOP');

/** Lê cada item devolvido pelo FOP. Código enviado sem resposta vira falha explícita (nunca silêncio). */
export function lerResultadoFop(enviados: string[], resposta: unknown[]): ResultadoFopItem[] {
  const porCod = new Map<string, Record<string, unknown>>();
  for (const r of resposta ?? []) if (r && typeof r === 'object') porCod.set(txt((r as Record<string, unknown>).cod_cadastro), r as Record<string, unknown>);
  return enviados.map((cod) => {
    const r = porCod.get(cod);
    if (!r) return { cod_cadastro: cod, situacao: 'falhou', motivo: 'O FOP não respondeu este código.' };
    const status = txt(r.status), motivo = txt(r.motivo ?? r.erro) || null;
    if (status === 'registrado') return { cod_cadastro: cod, situacao: 'registrado', motivo };
    if (status === 'nasceria') return { cod_cadastro: cod, situacao: 'nasceria', motivo };
    if (status === 'bloqueado' && motivo && jaExiste(motivo)) return { cod_cadastro: cod, situacao: 'ja_existia', motivo };
    return { cod_cadastro: cod, situacao: 'falhou', motivo: motivo ?? `Status do FOP: ${status || 'vazio'}` };
  });
}

/** Pendente de FOP = tudo que o FOP não confirmou que já existe (prévia ou real). */
export const pendentesDeFop = (r: ResultadoFopItem[]) => r.filter((x) => x.situacao !== 'ja_existia' && x.situacao !== 'registrado');
