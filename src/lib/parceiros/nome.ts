// Doutrina NOME-CANONICO-COM-APELIDO (frente Qualidade do Dado, 01/08/2026).
// Canonico = razao_social, SEMPRE. E o que sai em NF, boleto, CNAB, e-mail e PDF.
// Apelido = nome_fantasia, apenas quando existe e difere da razao social.
// PROIBIDO usar apelido em saida fiscal ou bancaria.
// Espelha public.fn_parceiro_apelido(razao, fantasia) no banco.

export function apelidoParceiro(razao?: string | null, fantasia?: string | null): string | null {
  const f = (fantasia ?? "").trim();
  if (!f) return null;
  const r = (razao ?? "").trim();
  if (f.toUpperCase() === r.toUpperCase()) return null;
  return f;
}

/** Nome canonico puro. Use em qualquer saida fiscal, bancaria ou documental. */
export function nomeCanonico(razao?: string | null, fallback = "—"): string {
  const r = (razao ?? "").trim();
  return r || fallback;
}

/** Uma linha, para tela e lista: "RAZAO SOCIAL · APELIDO". Nunca em documento fiscal. */
export function nomeExibicao(razao?: string | null, fantasia?: string | null, fallback = "—"): string {
  const r = nomeCanonico(razao, fallback);
  const a = apelidoParceiro(razao, fantasia);
  return a ? `${r} · ${a}` : r;
}

/** Casa o termo digitado contra razao social, apelido e CNPJ (com ou sem pontuacao). */
export function parceiroCombina(termo: string, razao?: string | null, fantasia?: string | null, cnpj?: string | null): boolean {
  const t = termo.trim().toLowerCase();
  if (!t) return true;
  const digitos = t.replace(/\D/g, "");
  return (
    (razao ?? "").toLowerCase().includes(t) ||
    (fantasia ?? "").toLowerCase().includes(t) ||
    (digitos.length > 0 && (cnpj ?? "").replace(/\D/g, "").includes(digitos))
  );
}

/**
 * Nome de PESSOA em contrato PJ — uso exclusivo do modulo Pessoas.
 * No modulo Pessoas o colaborador PJ e identificado pela PESSOA (contato_nome);
 * a razao social e contexto secundario, e o nome fantasia da empresa NAO e
 * usado para identificar pessoa. Fora do modulo Pessoas, use nomeCanonico/nomeExibicao.
 */
export function nomePessoaPJ(
  contatoNome?: string | null,
  razaoSocial?: string | null,
  fallback = "—",
): string {
  const c = (contatoNome ?? "").trim();
  if (c) return c;
  const r = (razaoSocial ?? "").trim();
  return r || fallback;
}

/**
 * Nome de TRATAMENTO — vocativo de mensagem ao cliente ("Olá, X!").
 * NÃO revoga NOME-CANONICO-COM-APELIDO: identificação fiscal, bancária e
 * documental continua sendo razão social. Isto é só a saudação.
 * Regras: apelido quando existe; senão razão social sem a raiz de CNPJ que a
 * Receita prefixa em MEI ("62.067.027 FULANO DE TAL" -> "Fulano de Tal"),
 * com capitalização corrigida quando o cadastro veio em CAIXA ALTA.
 * Espelha public.fn_parceiro_tratamento(razao, fantasia) no banco.
 */
export function nomeTratamento(
  razao?: string | null,
  fantasia?: string | null,
  fallback = "cliente",
): string {
  const base = (apelidoParceiro(razao, fantasia) ?? razao ?? "").trim();
  const semRaiz = base.replace(/^\d{2}\.?\d{3}\.?\d{3}[\s./-]+/, "").trim();
  const limpo = semRaiz || base;
  if (!limpo) return fallback;
  if (limpo !== limpo.toUpperCase()) return limpo; // já veio em caixa mista: respeita
  return limpo
    .toLowerCase()
    .replace(/(^|[\s'`\-(&.])([a-zà-ÿ])/g, (_m, p, c) => p + c.toUpperCase())
    .replace(/\s(De|Da|Do|Das|Dos|E)\s/g, (w) => w.toLowerCase());
}

