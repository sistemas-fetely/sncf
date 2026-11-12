import type { MovExtrato } from "./dados";

export function filtrarExtrato(linhas: MovExtrato[], filtros: { conta: string; busca: string; de: string; ate: string; rapido: string }) {
  const busca = filtros.busca.trim().toLocaleLowerCase("pt-BR");
  return linhas.filter(m =>
    (filtros.conta === "todas" || m.conta_bancaria_id === filtros.conta) &&
    (!filtros.de || m.data_transacao >= filtros.de) &&
    (!filtros.ate || m.data_transacao <= filtros.ate) &&
    (!busca || [m.descricao, m.contraparte_nome, m.contraparte_documento, m.referencia_pedido].join(" ").toLocaleLowerCase("pt-BR").includes(busca)) &&
    (filtros.rapido !== "creditos" || m.tipo === "credito") &&
    (filtros.rapido !== "debitos" || m.tipo === "debito") &&
    (filtros.rapido !== "antigos" || m.dias_em_aberto > 30));
}
export function periodoMesAtual(hoje = new Date()) {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const prefixo = `${ano}-${String(mes + 1).padStart(2, "0")}`;
  return { de: `${prefixo}-01`, ate: `${prefixo}-${new Date(ano, mes + 1, 0).getDate()}` };
}
export const ORIGENS_CLASSE: Record<string, string> = {
  regra_p1: "Regra", par_p2: "Par", match_p3: "Casamento automático", match_p4: "Casamento automático", manual_p5: "Manual",
};