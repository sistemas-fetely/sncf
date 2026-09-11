/**
 * NF referenciada (grupo NFref/refNFe da NF-e) — leitura tolerante + normalização.
 *
 * Motivo real (NF 26133 série 10 da UTILPLAST, CNPJ 43367390000498, 10/09/2026):
 * a nota entrou pelo Qive com `fin_nfe = 4` (devolução) e 241 itens CFOP 6918, mas
 * com `nf_referenciada_chave = NULL`, apesar de o XML referenciar a NF 000450 pela
 * chave 42260963591078000229550010000004501721470720. Causa: o regex usado era
 * rígido (`<refNFe>(\d{44})</refNFe>`) e não casa com espaço, quebra de linha ou
 * prefixo de namespace. Sem a chave, `fn_devolucao_sugerir_vinculos` não tem o que
 * casar e o vínculo fiscal precisa ser feito à mão.
 *
 * Regras: só dígitos, exatamente 44 caracteres. Tamanho diferente NÃO grava
 * (chave truncada casaria com nota errada) e o valor recusado é logado.
 */

/** Normaliza a chave: só dígitos e exatamente 44. Fora disso devolve null e loga. */
export function normalizarChaveNfe(
  bruto: unknown,
  ctx: { numero?: string | null; fonte?: string },
): string | null {
  if (bruto == null) return null;
  const digitos = String(bruto).replace(/\D/g, "");
  if (digitos === "") return null;
  if (digitos.length !== 44) {
    console.error(
      `[nf-referenciada] chave referenciada RECUSADA (${digitos.length} dígitos, esperado 44) ` +
        `— nota ${ctx.numero ?? "?"}, fonte ${ctx.fonte ?? "?"}, valor bruto: ${String(bruto).slice(0, 80)}`,
    );
    return null;
  }
  return digitos;
}

/**
 * Extrai a primeira `refNFe` do XML, tolerando prefixo de namespace, atributos e
 * espaços/quebras de linha em volta do valor. Não substitui parser: é o caminho
 * dos syncs que só fazem GET de texto.
 */
export function extrairRefNFeDoXml(xml: string): string | null {
  if (!xml) return null;
  const m = xml.match(/<(?:\w+:)?refNFe\b[^>]*>\s*([\s\S]*?)\s*<\/(?:\w+:)?refNFe>/i);
  return m ? m[1].trim() : null;
}

/** Extrai `finNFe` tolerando namespace e espaços. */
export function extrairFinNFeDoXml(xml: string): number | null {
  if (!xml) return null;
  const m = xml.match(/<(?:\w+:)?finNFe\b[^>]*>\s*(\d)\s*<\/(?:\w+:)?finNFe>/i);
  return m ? Number(m[1]) : null;
}

/**
 * FAIL-LOUD: devolução (finNFe = 4) sem chave referenciada é documento incompleto.
 * Não bloqueia a ingestão — dado ruim é permanente, a nota entra com o alarme aceso.
 */
export function alertarDevolucaoSemReferencia(ctx: {
  fin_nfe: number | null | undefined;
  chave_referenciada: string | null | undefined;
  numero?: string | null;
  serie?: string | null;
  cnpj_emitente?: string | null;
  fonte: string;
  diagnostico?: unknown;
}): void {
  if (Number(ctx.fin_nfe) !== 4) return;
  if (ctx.chave_referenciada) return;
  console.error(
    "[nf-referenciada] ANOMALIA: devolução (finNFe=4) sem nota referenciada — " +
      `numero=${ctx.numero ?? "?"} serie=${ctx.serie ?? "?"} ` +
      `cnpj_emitente=${ctx.cnpj_emitente ?? "?"} fonte=${ctx.fonte}. ` +
      "Sem refNFe o vínculo fiscal terá de ser feito à mão." +
      (ctx.diagnostico !== undefined
        ? ` payload_cru=${String(
            typeof ctx.diagnostico === "string" ? ctx.diagnostico : JSON.stringify(ctx.diagnostico),
          ).slice(0, 1500)}`
        : ""),
  );
}
