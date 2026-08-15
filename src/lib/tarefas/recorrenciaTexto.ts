/**
 * Frequência em português legível, montada a partir dos campos da regra.
 * "Toda segunda-feira", "Todo dia 5", "A cada 2 semanas às quartas",
 * "Todo dia", "Todo ano em 15 de março".
 */

export const DIAS_SEMANA_NOME = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado",
];

export const DIAS_SEMANA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const DIAS_SEMANA_PLURAL = [
  "domingos", "segundas", "terças", "quartas", "quintas", "sextas", "sábados",
];

export const MESES_NOME = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export interface RegraRecorrencia {
  frequencia: string;
  intervalo: number;
  dias_semana: number[] | null;
  dia_mes: number | null;
  mes: number | null;
}

function lista(nomes: string[]): string {
  if (nomes.length === 0) return "";
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

export function textoRecorrencia(r: RegraRecorrencia): string {
  const n = Math.max(1, Number(r.intervalo || 1));
  const dias = (r.dias_semana ?? []).filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);

  if (r.frequencia === "diaria") {
    return n === 1 ? "Todo dia" : `A cada ${n} dias`;
  }

  if (r.frequencia === "semanal") {
    if (n === 1) {
      if (dias.length === 0) return "Toda semana";
      if (dias.length === 1) return `Toda ${DIAS_SEMANA_NOME[dias[0]]}`;
      return `Toda semana às ${lista(dias.map((d) => DIAS_SEMANA_PLURAL[d]))}`;
    }
    if (dias.length === 0) return `A cada ${n} semanas`;
    return `A cada ${n} semanas às ${lista(dias.map((d) => DIAS_SEMANA_PLURAL[d]))}`;
  }

  if (r.frequencia === "mensal") {
    const dia = r.dia_mes ?? 1;
    return n === 1 ? `Todo dia ${dia}` : `A cada ${n} meses no dia ${dia}`;
  }

  if (r.frequencia === "anual") {
    const dia = r.dia_mes ?? 1;
    const mes = MESES_NOME[(r.mes ?? 1) - 1] ?? "";
    return n === 1
      ? `Todo ano em ${dia} de ${mes}`
      : `A cada ${n} anos em ${dia} de ${mes}`;
  }

  return "Regra personalizada";
}

export function dataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10).split("-").reverse().join("/");
}
