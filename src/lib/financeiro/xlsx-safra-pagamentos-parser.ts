import { cpfValido } from "@/lib/documentos/cpf";

export interface PagamentoSafra {
  data_pagamento: string;
  data_vencimento: string | null;
  numero_documento: string | null;
  favorecido_nome: string | null;
  favorecido_documento: string | null;
  valor: number;
  modalidade: string | null;
  situacao: string | null;
  ocorrencia: number;
}
export interface ResultadoPagamentos {
  lidas: number; novas: number; ja_existiam: number; exatos: number;
  lotes: number; itens_em_lote: number; pagamentos_sem_debito: number;
}
const normalizar = (v: unknown) => String(v ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const texto = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return !s || s === "-" ? null : s;
};

export function ehSafraPagamentos(nomeAba: string, rows: unknown[][]): boolean {
  return nomeAba === "Consulta - Pagamentos" && rows.slice(0, 12).some(r => r.some(c => normalizar(c) === "banco safra"));
}
export function documentoSafraPagamento(v: unknown): string | null {
  const d = (texto(v) ?? "").replace(/\D/g, "");
  if (!d) return null;
  return d.length === 14 && d.startsWith("000") && cpfValido(d.slice(-11)) ? d.slice(-11) : d;
}
function dataIso(v: unknown): string | null {
  const s = texto(v);
  if (!s) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) throw new Error(`Data inválida no relatório Safra: ${s}`);
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== iso) throw new Error(`Data inválida no relatório Safra: ${s}`);
  return iso;
}
export function parseXlsxSafraPagamentos(rows: unknown[][], nomeAba = "Consulta - Pagamentos") {
  if (!ehSafraPagamentos(nomeAba, rows)) throw new Error("Arquivo não reconhecido como Safra — Gestão de Pagamentos (Por Pagamentos).");
  const header = rows.findIndex(r => normalizar(r[0]) === "data");
  if (header < 0) throw new Error("Cabeçalho Data não encontrado no relatório Safra.");
  const titulos = rows[header].map(normalizar);
  const coluna = (titulo: string) => {
    const i = titulos.indexOf(normalizar(titulo));
    if (i < 0) throw new Error(`Coluna obrigatória ausente no relatório Safra: ${titulo}`);
    return i;
  };
  const cols = { data: coluna("Data"), vencimento: coluna("Data vencimento"), documento: coluna("N° Documento"),
    nome: coluna("Favorecido / Beneficiário"), cpf: coluna("CPF / CNPJ"), valor: coluna("Valor (R$)"), modalidade: coluna("Modalidade"), situacao: coluna("Situação") };
  const periodo = rows.slice(0, header).map(r => r.map(c => String(c ?? "")).join(" | ")).join("\n");
  const intervalo = /Pagamentos de\s+(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i.exec(periodo);
  if (!intervalo) throw new Error("Período de pagamentos não encontrado no relatório Safra.");
  const ocorrencias = new Map<string, number>();
  const itens: PagamentoSafra[] = [];
  for (const r of rows.slice(header + 1)) {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(r[cols.data] ?? "").trim())) continue;
    const data = dataIso(r[cols.data]);
    if (!data) continue;
    const valor = r[cols.valor];
    if (typeof valor !== "number" || !Number.isFinite(valor)) throw new Error(`Valor inválido no pagamento Safra de ${data}.`);
    const documento = texto(r[cols.documento]);
    const nome = texto(r[cols.nome]);
    const chave = JSON.stringify([data, documento, nome, valor]);
    const ocorrencia = (ocorrencias.get(chave) ?? 0) + 1;
    ocorrencias.set(chave, ocorrencia);
    itens.push({ data_pagamento: data, data_vencimento: dataIso(r[cols.vencimento]), numero_documento: documento,
      favorecido_nome: nome, favorecido_documento: documentoSafraPagamento(r[cols.cpf]), valor,
      modalidade: texto(r[cols.modalidade]), situacao: texto(r[cols.situacao]), ocorrencia });
  }
  return { itens, periodo_inicio: dataIso(intervalo[1]), periodo_fim: dataIso(intervalo[2]) };
}
export function resumoPagamentosSafra(r: ResultadoPagamentos): string {
  return `${r.lidas} pagamentos lidos · ${r.novas} novos · ${r.exatos} débitos identificados (par exato) · ${r.lotes} lotes (${r.itens_em_lote} pagamentos) · ${r.pagamentos_sem_debito} pagamentos sem débito no extrato`;
}
