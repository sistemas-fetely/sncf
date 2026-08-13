/**
 * TRILHO DO BOLETO — 4 marcos fixos: C · E · R · B.
 *
 * O boleto tem 10 status no banco, mas só 4 posições na vida real:
 * foi criado, foi enviado ao banco, o banco registrou, o banco baixou.
 * Os outros 6 valores são variações dentro dessas 4 posições (rejeitado é
 * uma tentativa de envio que voltou; baixa_solicitada é uma baixa a caminho).
 *
 * POR QUE CONSTANTE E NÃO TABELA: este mapa é derivado do próprio CHECK
 * `titulo_a_receber_boleto_status_check`, não é política de negócio. Status novo
 * implica migration no banco e deploy no front juntos de qualquer jeito — tabela
 * daria falsa sensação de configurabilidade. DIMENSÃO-VIA-TABELA vale para a régua
 * de cobrança, não para a letra do boleto.
 *
 * VENCIDO NÃO É MARCO. Existe como `boleto_status` mas também sai de
 * `data_vencimento_atual < hoje`. Duas fontes para a mesma verdade é uma mentira
 * esperando o CNAB atrasar. Aqui vencido é ALERTA (cor), derivado da data.
 * Mesma regra de `classificarAtencao` em BancoSafra.tsx.
 *
 * PROTESTO NÃO ENTRA. Mora em `subestado_atraso`, outro eixo: um título pode estar
 * protestado e registrado ao mesmo tempo. Trilho conta a vida do boleto no banco.
 */

export const MARCOS = ["C", "E", "R", "B"] as const;
export type Marco = (typeof MARCOS)[number];

export const MARCO_NOME: Record<Marco, string> = {
  C: "Criado",
  E: "Enviado ao banco",
  R: "Registrado",
  B: "Baixado",
};

/** Cor do marco quando ele é o ATUAL. Herdada dos dots antigos de propósito:
 *  o operador já lê amarelo = esperando banco, azul = registrado. Mudar custaria
 *  reaprendizado por zero ganho. Vermelho sobrepõe tudo quando há alerta. */
export const MARCO_COR_ATUAL: Record<Marco, string> = {
  C: "bg-gray-100 text-gray-700 border-gray-400",
  E: "bg-yellow-100 text-yellow-800 border-yellow-500",
  R: "bg-blue-100 text-blue-800 border-blue-500",
  B: "bg-emerald-100 text-emerald-800 border-emerald-500",
};

interface DefMarco {
  marco: Marco;
  /** O que dizer no hover. Frase do operador, não nome de coluna. */
  descricao: string;
  /** Pinta vermelho: o banco recusou. */
  alerta?: boolean;
  /** Chegou no marco mas ainda não concluiu (baixa a caminho). */
  emCurso?: boolean;
}

export const STATUS_MARCO: Record<string, DefMarco> = {
  pendente: { marco: "C", descricao: "Criado — falta gerar remessa" },
  remessa_gerada: { marco: "E", descricao: "Remessa enviada, aguardando retorno do Safra" },
  rejeitado: { marco: "E", descricao: "Rejeitado pelo banco — precisa reemitir", alerta: true },
  registrado: { marco: "R", descricao: "Registrado no Safra" },
  vencido: { marco: "R", descricao: "Registrado e vencido", alerta: true },
  baixa_solicitada: { marco: "B", descricao: "Baixa solicitada, remessa ainda não saiu", emCurso: true },
  baixa_remessa_gerada: { marco: "B", descricao: "Baixa em remessa, aguardando o banco", emCurso: true },
  baixado_banco: { marco: "B", descricao: "Baixado pelo banco" },
  pago_banco: { marco: "B", descricao: "Liquidado no Safra" },
  pago_manual: { marco: "B", descricao: "Baixado manualmente" },
};

/**
 * Espelho literal de `titulo_a_receber_boleto_status_check`.
 * Serve de trava: se o banco ganhar um status e ninguém atualizar este arquivo,
 * o app grita em dev. Foi exatamente assim que `baixado_banco` ficou órfão dos
 * mapas de cor e virou bolinha cinza sem significado na tela de Boletos.
 */
export const BOLETO_STATUS_DO_BANCO = [
  "pendente",
  "remessa_gerada",
  "registrado",
  "rejeitado",
  "pago_manual",
  "pago_banco",
  "vencido",
  "baixa_solicitada",
  "baixa_remessa_gerada",
  "baixado_banco",
] as const;

(function conferirCobertura() {
  const mapeados = new Set(Object.keys(STATUS_MARCO));
  const faltando = BOLETO_STATUS_DO_BANCO.filter((s) => !mapeados.has(s));
  const sobrando = Object.keys(STATUS_MARCO).filter(
    (s) => !(BOLETO_STATUS_DO_BANCO as readonly string[]).includes(s),
  );
  if (faltando.length === 0 && sobrando.length === 0) return;
  const msg =
    `marcos-boleto: mapa fora de sincronia com o CHECK do banco.` +
    (faltando.length ? ` Sem marco: ${faltando.join(", ")}.` : "") +
    (sobrando.length ? ` Status inexistente no banco: ${sobrando.join(", ")}.` : "");
  // Em dev quebra na cara de quem mexeu. Em produção não derruba a tela por
  // um problema cosmético — mas deixa rastro no console.
  if (import.meta.env.DEV) throw new Error(msg);
  console.error(msg);
})();

/** Status do TÍTULO que encerram o assunto. A query da tela já exclui pago e
 *  cancelado, então na prática sobram estes dois — mas a lista fica completa. */
const TITULO_ENCERRADO = new Set([
  "pago",
  "cancelado",
  "devolvido",
  "baixado_por_perda",
  "cancelado_recuperacao",
]);

export const MARCO_ORDEM: Record<Marco, number> = { C: 0, E: 1, R: 2, B: 3 };

export interface ItemTrilho {
  boleto_status: string | null;
  status: string | null;
  data_vencimento_atual: string | null;
}

export interface ResumoTrilho {
  marcoAtual: Marco;
  /** Vermelho: rejeitado pelo banco ou registrado e vencido. */
  alerta: boolean;
  /** Tracejado no marco atual: chegou mas não concluiu. */
  emCurso: boolean;
  /** Quantos títulos do grupo estão parados no marco atual. */
  qtdNoMarco: number;
  total: number;
  /** Todos os títulos do grupo estão encerrados: fita inteira apagada. */
  encerrado: boolean;
  /** Texto do hover. */
  descricao: string;
}

function lerUm(item: ItemTrilho, hojeIso: string): DefMarco {
  const def = STATUS_MARCO[item.boleto_status ?? "pendente"];
  if (!def) return { marco: "C", descricao: item.boleto_status ?? "sem status" };
  // Vencido derivado da data, nunca só do status.
  const venceu =
    def.marco === "R" &&
    !!item.data_vencimento_atual &&
    item.data_vencimento_atual < hojeIso;
  return venceu ? { ...def, descricao: "Registrado e vencido", alerta: true } : def;
}

/**
 * ELO MAIS FRACO. Numa linha agrupada por cliente, a fita mostra o marco de quem
 * está MAIS ATRÁS, não a média nem o mais avançado — a tela existe para achar o
 * que travou. Títulos encerrados não contam para o elo fraco: só puxam a fita
 * quando todos do grupo estão encerrados.
 */
export function resumirTrilho(itens: ItemTrilho[], hojeIso: string): ResumoTrilho | null {
  if (itens.length === 0) return null;

  const vivos = itens.filter((i) => !TITULO_ENCERRADO.has(i.status ?? ""));
  const encerrado = vivos.length === 0;
  const base = encerrado ? itens : vivos;

  const lidos = base.map((i) => lerUm(i, hojeIso));

  let escolhido = lidos[0];
  for (const d of lidos) {
    if (MARCO_ORDEM[d.marco] < MARCO_ORDEM[escolhido.marco]) escolhido = d;
    // Empate de marco: alerta ganha, porque é o que exige ação.
    else if (d.marco === escolhido.marco && d.alerta && !escolhido.alerta) escolhido = d;
  }

  const qtdNoMarco = lidos.filter((d) => d.marco === escolhido.marco).length;

  return {
    marcoAtual: escolhido.marco,
    alerta: !!escolhido.alerta && !encerrado,
    emCurso: !!escolhido.emCurso && !encerrado,
    qtdNoMarco,
    total: base.length,
    encerrado,
    descricao: escolhido.descricao,
  };
}
