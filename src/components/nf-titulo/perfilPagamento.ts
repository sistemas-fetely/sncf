export type MotivoFila = "sem_perfil" | "sem_prazo" | "pendente" | "sem_parceiro" | "aguarda_cartao" | "perfil_nao_gera";

export interface NfSemTitulo {
  nf_id: string;
  nf_numero: string | null;
  tipo_documento: string | null;
  emissao: string | null;
  valor: number | null;
  data_vencimento: string | null;
  parceiro_id: string | null;
  fornecedor: string | null;
  fornecedor_cnpj: string | null;
  destino_rotulo: string | null;
  plano_codigo: string | null;
  plano_nome: string | null;
  perfil_forma_codigo: string | null;
  perfil_forma_nome: string | null;
  perfil_prazo_dias: number | null;
  sug_forma_codigo: string | null;
  sug_prazo_dias: number | null;
  sug_base: string | null;
  tem_parcelas: boolean | null;
  motivo: MotivoFila;
  created_at: string | null;
}

export interface PerfilPainel {
  parceiro_id: string;
  fornecedor: string | null;
  cnpj: string | null;
  notas: number | null;
  valor: number | null;
  ultima_nota: string | null;
  notas_sem_titulo: number | null;
  perfil_forma_codigo: string | null;
  perfil_forma_nome: string | null;
  perfil_prazo_dias: number | null;
  definido_em: string | null;
  sug_forma_codigo: string | null;
  sug_prazo_dias: number | null;
  sug_base: string | null;
  tem_perfil: boolean;
}

export const MOTIVOS_PRECISA: MotivoFila[] = ["sem_perfil", "sem_prazo", "sem_parceiro", "pendente"];
export const MOTIVOS_AGUARDA: MotivoFila[] = ["aguarda_cartao", "perfil_nao_gera"];
export const ROTULO_MOTIVO: Record<MotivoFila, string> = {
  sem_perfil: "Fornecedor sem perfil de pagamento",
  sem_prazo: "Perfil sem prazo",
  pendente: "Tem perfil ou parcelas — aguardando geração ou decisão",
  sem_parceiro: "Nota sem parceiro identificado",
  aguarda_cartao: "Paga no cartão — espera a fatura",
  perfil_nao_gera: "Forma de pagamento não gera título",
};

export const contarPrecisa = (linhas: NfSemTitulo[]) => linhas.filter((l) => MOTIVOS_PRECISA.includes(l.motivo)).length;

export interface GrupoFornecedor {
  chave: string;
  parceiro_id: string | null;
  fornecedor: string;
  cnpj: string | null;
  notas: NfSemTitulo[];
  valor: number;
  sug_forma_codigo: string | null;
  sug_prazo_dias: number | null;
  sug_base: string | null;
  precisaPerfil: boolean;
}

export function agruparPorFornecedor(linhas: NfSemTitulo[]): GrupoFornecedor[] {
  const mapa = new Map<string, GrupoFornecedor>();
  for (const l of linhas) {
    const chave = l.parceiro_id ?? `sem:${l.fornecedor_cnpj ?? l.fornecedor ?? "?"}`;
    let g = mapa.get(chave);
    if (!g) {
      g = { chave, parceiro_id: l.parceiro_id, fornecedor: l.fornecedor || "Sem fornecedor", cnpj: l.fornecedor_cnpj, notas: [], valor: 0, sug_forma_codigo: null, sug_prazo_dias: null, sug_base: null, precisaPerfil: false };
      mapa.set(chave, g);
    }
    g.notas.push(l);
    g.valor += Number(l.valor ?? 0);
    if (!g.sug_forma_codigo && l.sug_forma_codigo) g.sug_forma_codigo = l.sug_forma_codigo;
    if (g.sug_prazo_dias == null && l.sug_prazo_dias != null) g.sug_prazo_dias = l.sug_prazo_dias;
    if (!g.sug_base && l.sug_base) g.sug_base = l.sug_base;
    if (l.parceiro_id && (l.motivo === "sem_perfil" || l.motivo === "sem_prazo")) g.precisaPerfil = true;
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}

/** "Boleto · 15 dias", "Cartão de crédito", "prazo 10 dias" ou "—". */
export function rotuloPerfil(formaNome: string | null | undefined, prazo: number | null | undefined, geraTitulo = true): string {
  const temPrazo = prazo != null && geraTitulo;
  if (formaNome) return temPrazo ? `${formaNome} · ${prazo} dias` : formaNome;
  return prazo != null ? `prazo ${prazo} dias` : "—";
}

/** Confirmar sugestão: precisa de forma e (prazo ou forma que não exige prazo). */
export function podeConfirmarSugestao(formaCodigo: string | null, prazo: number | null, formaNaoGera: (codigo: string) => boolean): boolean {
  if (!formaCodigo) return false;
  return prazo != null || formaNaoGera(formaCodigo);
}
