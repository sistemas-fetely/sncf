export interface ContaMp {
  codigo: string; rotulo: string; conta_bancaria_id: string; segredo_cofre: string;
  regra_atribuicao: "shopify" | "marketplace_ml";
  classe_recebivel: "recebivel_b2c" | "recebivel_marketplace";
  inicio_coleta: string; ativo: boolean;
}
export function selecionarContas(contas: ContaMp[], cron: boolean, codigo?: string): ContaMp[] {
  if (cron && codigo === undefined) return contas.filter(c => c.ativo);
  const escolhida = contas.find(c => c.codigo === (codigo ?? "MP-SHOPIFY"));
  if (!escolhida) throw new Error("Conta Mercado Pago não cadastrada");
  return [escolhida];
}
/** POST config fields documented by Mercado Pago; never copy SFTP credentials or account identifiers. */
export function corpoConfiguracao(origem: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of ["columns", "file_name_prefix", "separator", "report_translation", "header_language", "frequency", "include_withdrawal_at_end", "execute_after_withdrawal", "scheduled", "include_withdraw", "refund_detailed", "shipping_detail", "coupon_detailed", "show_chargeback_cancel", "show_fee_prevision"]) {
    if (origem[key] !== undefined) out[key] = origem[key];
  }
  out.display_timezone = "GMT-03";
  // Legacy GET configs may omit these fields; POST requires actual booleans.
  out.execute_after_withdrawal = origem.execute_after_withdrawal === true;
  out.include_withdrawal_at_end = origem.include_withdrawal_at_end === true;
  out.report_translation = origem.report_translation ?? origem.report_language ?? "pt";
  const frequency = origem.frequency as Record<string, unknown> | undefined;
  if (frequency) out.frequency = frequency.type === "daily"
    ? { hour: Number(frequency.hour) || 0, type: "daily" }
    : { hour: Number(frequency.hour) || 0, type: frequency.type, value: Number(frequency.value) };
  if (!Array.isArray(out.columns) || !out.columns.length || !out.file_name_prefix) throw new Error("Configuração Shopify incompleta");
  out.columns = out.columns.map((column: Record<string, unknown>) => column.alias
    ? { key: column.key, alias: column.alias } : { key: column.key });
  return out;
}