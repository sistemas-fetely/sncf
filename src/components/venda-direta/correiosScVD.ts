import type { OpcaoTransportadora } from "./CotacaoTransportadoraVD";

export interface PlanoCorreiosSC {
  ok: boolean; situacao: "elegivel" | "improvavel" | "inelegivel"; motivo?: string; erro?: string;
  transportadora_id: string; cep_origem: string; cep_destino: string; n_volumes: number;
  volume: { peso_g: number; comprimento_cm: number; largura_cm: number; altura_cm: number };
}
export interface PrecoCorreiosSC { servico: string; preco: number | null; prazo_dias: number | null; erro?: string | null }
export const chaveOpcaoVD = (o: OpcaoTransportadora) => o.servico ? `${o.transportadora_id}:${o.servico}` : o.transportadora_id;
export const podeCotarCorreiosSC = (p: PlanoCorreiosSC) => p.ok && p.situacao !== "inelegivel";
export const bodyCorreiosSC = (p: PlanoCorreiosSC) => ({
  cep_origem: p.cep_origem, cep_destino: p.cep_destino, volumes: [{ ...p.volume, quantidade: p.n_volumes }],
});
export function opcoesCorreiosSC(plano: PlanoCorreiosSC, precos: PrecoCorreiosSC[]) {
  const opcoes: OpcaoTransportadora[] = [];
  const erros: string[] = [];
  for (const c of precos) {
    if (c.erro || c.preco == null || !Number.isFinite(c.preco)) {
      erros.push(c.erro ?? `Preço de ${c.servico} indisponível.`);
      continue;
    }
    if (c.servico !== "SEDEX" && c.servico !== "PAC") {
      erros.push(`Serviço Correios desconhecido: ${c.servico}`);
      continue;
    }
    opcoes.push({ transportadora_id: plano.transportadora_id, nome: `Correios · ${c.servico}`, servico: c.servico,
      valor: c.preco, prazo_dias: c.prazo_dias, aviso: plano.situacao === "improvavel" ? plano.motivo : undefined });
  }
  return { opcoes, erro: erros.length ? erros.join("; ") : !opcoes.length ? "Nenhuma cotação disponível." : null };
}
export const ordenarOpcoesVD = (opcoes: OpcaoTransportadora[]) => [...opcoes].sort((a, b) => a.valor - b.valor);