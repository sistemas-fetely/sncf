export type FiltrosMarketplace = { marketplace: string; estagio: string; semTransportadora?: boolean; semCusto?: boolean; comAlerta?: boolean; busca: string };
export type PedidoFiltro = { marketplace_codigo: string; estagio: string | null; transportadora_id: string | null; custo_transporte: number | null; id_externo: string; cliente_nome: string | null; numero_marketplace: string | null; alerta?: string | null };

export function filtrarPedidos<T extends PedidoFiltro>(pedidos: T[], filtros: FiltrosMarketplace): T[] {
  const busca = filtros.busca.trim().toLocaleLowerCase('pt-BR');
  const estagio = normalizarEstagioMarketplace(filtros.estagio);
  return pedidos.filter(p =>
    (filtros.marketplace === 'todos' || p.marketplace_codigo === filtros.marketplace) &&
    (estagio === 'todos' || p.estagio === estagio) &&
    (!filtros.comAlerta || p.alerta != null) &&
    (!filtros.semTransportadora || !p.transportadora_id) &&
    (!filtros.semCusto || p.custo_transporte == null || Number(p.custo_transporte) === 0) &&
    (!busca || [p.id_externo, p.cliente_nome, p.numero_marketplace].some(v => v?.toLocaleLowerCase('pt-BR').includes(busca)))
  );
}

export function podeAbrirDevolucao(p: { estagio: string | null; devolucao_numero: string | null; devolucao_status: string | null }): boolean {
  return (p.estagio === 'em_transporte' || p.estagio === 'entregue') &&
    !(p.devolucao_numero && p.devolucao_status !== 'cancelada');
}
export function podeIrMesaSp(p: { estagio: string | null; cd_codigo: string | null }): boolean {
  return ['faturado', 'pre_separacao', 'em_separacao'].includes(p.estagio ?? '') && p.cd_codigo != null && p.cd_codigo !== 'XPM-SC';
}

export function normalizarEstagioMarketplace(estagio: string): string {
  if (estagio === 'aguardando_nf') return 'pre_faturamento';
  if (estagio === 'no_cd') return 'todos';
  if (estagio === 'devolucao') return 'devolvido';
  return estagio;
}

export function valorTransporte(texto: string): number | null {
  if (!texto.trim()) return null;
  const numero = Number(texto.trim().includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto);
  if (!Number.isFinite(numero) || numero < 0) throw new Error('Informe um valor de transporte válido.');
  return numero;
}

export function hojeSaoPaulo(data = new Date()): string {
  const partes = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(data);
  const parte = (tipo: string) => partes.find(p => p.type === tipo)?.value ?? '';
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
}

export function exigirSucesso(resultado: unknown): void {
  if (resultado && typeof resultado === 'object' && 'ok' in resultado && resultado.ok === false) {
    const erro = 'erro' in resultado ? resultado.erro : 'Falha ao registrar transporte.';
    throw new Error(String(erro));
  }
}