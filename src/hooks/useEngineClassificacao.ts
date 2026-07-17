/**
 * Engine Universal de Classificação - Hook
 *
 * Este é o substituto unificado do antigo useRegrasCategorizacao.
 * Funciona para qualquer fonte (NF, cartão, extrato, manual).
 *
 * APIs principais:
 * - useSugerirCategoria(input): sugere categoria pra um item
 * - useSugerirCategoriaBatch(items): sugere em lote (otimizado)
 * - registrarClassificacao(input): chama quando user classifica manualmente (aprendizado)
 * - registrarCorrecao(regra_id): chama quando user corrige sugestão errada
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ============= Types =============

export interface SugerirInput {
  descricao?: string | null;
  cnpj?: string | null;
  parceiro_id?: string | null;
  ncm?: string | null;
  origem?: "todos" | "nf" | "cartao" | "extrato" | "manual";
}

export interface SugestaoResult {
  regra_id: string;
  plano_contas_id: string;
  centro_custo_id: string | null;
  confianca: number;
  tipo_match: "parceiro" | "cnpj" | "ncm" | "token" | "descricao";
  motivo: string;
}

export interface RegistrarClassificacaoInput {
  descricao?: string | null;
  cnpj?: string | null;
  parceiro_id?: string | null;
  plano_contas_id: string;
  origem?: string;
}

// ============= API direta (para chamadas pontuais) =============

/**
 * Sugere uma categoria pra um item.
 * Retorna null se não houver match.
 */
export async function sugerirCategoria(input: SugerirInput): Promise<SugestaoResult | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("sugerir_categoria", {
    p_descricao: input.descricao || null,
    p_cnpj: input.cnpj || null,
    p_parceiro_id: input.parceiro_id || null,
    p_ncm: input.ncm || null,
    p_origem: input.origem || "todos",
  });

  if (error) {
    console.error("sugerirCategoria erro:", error);
    return null;
  }

  if (!data || data.length === 0) return null;
  return data[0] as SugestaoResult;
}

/**
 * Registra uma classificação manual (aprendizado).
 * Retorna o ID da regra criada/atualizada (ou null).
 */
export async function registrarClassificacao(
  input: RegistrarClassificacaoInput,
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("registrar_classificacao", {
    p_descricao: input.descricao || null,
    p_cnpj: input.cnpj || null,
    p_parceiro_id: input.parceiro_id || null,
    p_categoria_id: input.plano_contas_id,
    p_origem: input.origem || "manual",
    p_user_id: user?.id || null,
  });

  if (error) {
    console.error("registrarClassificacao erro:", error);
    return null;
  }

  return (data as string) || null;
}

/**
 * Registra que a sugestão estava errada (diminui confiança).
 */
export async function registrarCorrecao(regra_id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc("registrar_correcao_regra", {
    p_regra_id: regra_id,
  });
}

// ============= Hooks =============

/**
 * Carrega TODAS as regras ativas pra cálculos no client.
 * Útil quando precisa sugerir em lote (ex: preview de N lançamentos).
 */
export function useRegrasAtivas() {
  return useQuery({
    queryKey: ["engine-regras-ativas"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("regras_categorizacao")
        .select(`
          id, parceiro_id, cnpj_emitente, ncm_prefixo, descricao_contem,
          token_principal, plano_contas_id, centro_custo_id, prioridade,
          confianca, vezes_aplicada, vezes_corrigida, escopo_origem,
          aprendida_automaticamente,
          conta:plano_contas(id, codigo, nome)
        `)
        .eq("ativo", true)
        .order("confianca", { ascending: false });
      if (error) throw error;
      return (data || []) as RegraEngine[];
    },
    staleTime: 30_000,
  });
}

export interface RegraEngine {
  id: string;
  parceiro_id: string | null;
  cnpj_emitente: string | null;
  ncm_prefixo: string | null;
  descricao_contem: string | null;
  token_principal: string | null;
  plano_contas_id: string;
  centro_custo_id: string | null;
  prioridade: number;
  confianca: number;
  vezes_aplicada: number;
  vezes_corrigida: number;
  escopo_origem: "todos" | "nf" | "cartao" | "extrato" | "manual";
  aprendida_automaticamente: boolean;
  conta?: { id: string; codigo: string; nome: string } | null;
}

// ============= Engine no client =============

/**
 * Versão CLIENT-SIDE do sugerir_categoria.
 * Usa quando você já tem as regras carregadas (useRegrasAtivas) e quer
 * sugerir pra muitos itens sem fazer N chamadas ao banco.
 *
 * Mesma lógica de prioridades do backend:
 * 1) parceiro > 2) cnpj > 3) ncm > 4) token > 5) descricao
 */
export function sugerirNoClient(
  input: SugerirInput,
  regras: RegraEngine[] | undefined,
): SugestaoResult | null {
  if (!regras || regras.length === 0) return null;

  const escopo = input.origem || "todos";
  const aplica = (r: RegraEngine) =>
    r.escopo_origem === "todos" || r.escopo_origem === escopo;

  const token = input.descricao ? extrairToken(input.descricao) : null;

  type Candidata = { r: RegraEngine; prio: number; tipo: SugestaoResult["tipo_match"]; motivo: string };
  const candidatas: Candidata[] = [];

  // Prioridade 1: Parceiro
  if (input.parceiro_id) {
    for (const r of regras) {
      if (!aplica(r)) continue;
      if (r.parceiro_id === input.parceiro_id) {
        candidatas.push({
          r,
          prio: 1,
          tipo: "parceiro",
          motivo: "Parceiro com regra cadastrada",
        });
      }
    }
  }

  // Prioridade 2: CNPJ exato
  if (input.cnpj) {
    for (const r of regras) {
      if (!aplica(r)) continue;
      if (r.cnpj_emitente === input.cnpj) {
        candidatas.push({
          r,
          prio: 2,
          tipo: "cnpj",
          motivo: `CNPJ já classificado ${r.vezes_aplicada}x`,
        });
      }
    }
  }

  // Prioridade 3: NCM
  if (input.ncm) {
    for (const r of regras) {
      if (!aplica(r)) continue;
      if (r.ncm_prefixo && input.ncm.startsWith(r.ncm_prefixo)) {
        candidatas.push({
          r,
          prio: 3,
          tipo: "ncm",
          motivo: `NCM ${r.ncm_prefixo}`,
        });
      }
    }
  }

  // Prioridade 4: Token
  if (token) {
    for (const r of regras) {
      if (!aplica(r)) continue;
      if (r.token_principal === token) {
        candidatas.push({
          r,
          prio: 4,
          tipo: "token",
          motivo: `Estabelecimento "${token.toUpperCase()}" já classificado ${r.vezes_aplicada}x`,
        });
      }
    }
  }

  // Prioridade 5: Descrição contém
  if (input.descricao) {
    const descLower = input.descricao.toLowerCase();
    for (const r of regras) {
      if (!aplica(r)) continue;
      if (r.descricao_contem && descLower.includes(r.descricao_contem.toLowerCase())) {
        candidatas.push({
          r,
          prio: 5,
          tipo: "descricao",
          motivo: `Descrição contém "${r.descricao_contem}"`,
        });
      }
    }
  }

  if (candidatas.length === 0) return null;

  // Ordena: menor prioridade (mais forte) + maior confiança
  candidatas.sort((a, b) => {
    if (a.prio !== b.prio) return a.prio - b.prio;
    return b.r.confianca - a.r.confianca;
  });

  const escolhida = candidatas[0];
  return {
    regra_id: escolhida.r.id,
    plano_contas_id: escolhida.r.plano_contas_id,
    centro_custo_id: escolhida.r.centro_custo_id,
    confianca: escolhida.r.confianca,
    tipo_match: escolhida.tipo,
    motivo: escolhida.motivo,
  };
}

/**
 * Mesma lógica do SQL extrair_token_principal, em JS.
 */
function extrairToken(desc: string): string | null {
  if (!desc) return null;
  const STOPWORDS = new Set([
    "para", "com", "por", "dos", "das", "uma", "um", "de", "da", "do",
    "the", "and", "for", "of", "to", "ltda", "me", "epp", "sa",
    "pg", "pgto", "pag", "comp", "cob", "pgt",
  ]);
  let s = desc
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+\d{1,2}\/\d{1,2}\s*$/, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = s.split(" ");
  for (const w of words) {
    if (w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w)) {
      return w;
    }
  }
  return null;
}

// ============= Helper: classificar com aprendizado =============

/**
 * Wrapper helper: classifica um item E registra o aprendizado em background.
 * Use sempre que o usuário aceitar/escolher uma categoria.
 *
 * @param descricao - texto livre do lançamento
 * @param cnpj - CNPJ do estabelecimento (se houver)
 * @param parceiro_id - ID do parceiro (se houver)
 * @param plano_contas_id - categoria escolhida
 * @param origem - origem do lançamento (cartao, nf, extrato, manual)
 */
export async function classificarComAprendizado(args: {
  descricao?: string | null;
  cnpj?: string | null;
  parceiro_id?: string | null;
  plano_contas_id: string;
  origem?: string;
}): Promise<void> {
  // Fire and forget - não bloqueia o usuário
  registrarClassificacao(args).catch((e) => {
    console.warn("Aprendizado falhou (não bloqueante):", e);
  });
}
