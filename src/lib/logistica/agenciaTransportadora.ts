/** Correios (e outras) com agência por CD: a agência nunca é opção própria; é resolvida pelo CD. */
export interface AgenciaCd { transportadora_id: string; centro_codigo: string; agencia_id: string; agencia_nome: string; centro_rotulo: string }
export interface TranspOpcao { id: string; razao_social: string; nome_fantasia?: string | null; cnpj?: string | null; bling_id?: string | null }

/** CD padrão quando o pedido não tem origem (mesma regra de fn_pedido_transportadora_efetiva). */
export const CD_PADRAO = "XPM-SC";

export function nomeTransportadora(t: TranspOpcao, agencias: AgenciaCd[]): string {
  const temAgencia = agencias.some((a) => a.transportadora_id === t.id);
  return temAgencia ? (t.nome_fantasia?.trim() || t.razao_social) : t.razao_social;
}

/** Esconde agências ativas; um pedido antigo gravado com a agência aparece como a transportadora-mãe. */
export function opcoesTransportadora(lista: TranspOpcao[], agencias: AgenciaCd[]): TranspOpcao[] {
  const idsAgencia = new Set(agencias.map((a) => a.agencia_id));
  return lista.filter((t) => !idsAgencia.has(t.id));
}

/** Pedido antigo com a agência gravada: devolve a transportadora-mãe para exibir. */
export function transportadoraExibida(id: string | null | undefined, agencias: AgenciaCd[]): string | null {
  if (!id) return null;
  return agencias.find((a) => a.agencia_id === id)?.transportadora_id ?? id;
}

export type AgenciaResolvida = { tipo: "agencia"; texto: string } | { tipo: "sem_agencia"; texto: string } | null;

export function agenciaDoCd(transportadoraId: string | null | undefined, cdCodigo: string | null | undefined, cdRotulo: string | null | undefined, agencias: AgenciaCd[]): AgenciaResolvida {
  if (!transportadoraId) return null;
  const mae = transportadoraExibida(transportadoraId, agencias)!;
  const daTransp = agencias.filter((a) => a.transportadora_id === mae);
  if (!daTransp.length) return null;
  const cd = cdCodigo || CD_PADRAO;
  const rot = cdRotulo || cd;
  const gravadaAgencia = agencias.find((a) => a.agencia_id === transportadoraId);
  const a = gravadaAgencia ?? daTransp.find((x) => x.centro_codigo === cd);
  if (!a) return { tipo: "sem_agencia", texto: `Correios sem agência para o CD ${rot}` };
  return { tipo: "agencia", texto: `Agência: ${a.agencia_nome} (${gravadaAgencia ? a.centro_rotulo : rot})` };
}
