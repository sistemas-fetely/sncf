/**
 * PAINEL DO CLIENTE — camada de dados própria da tela /cliente/:id.
 *
 * Só leitura. As perguntas de dinheiro continuam nos hooks de
 * `useContaCliente` (saldo, extrato, cobertura, furos); aqui ficam o cabeçalho
 * de cadastro e a análise de crédito vigente.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClienteCadastro {
  id: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
  cpf: string | null;
  inscricao_estadual: string | null;
  isento_ie: boolean | null;
  telefone: string | null;
  email: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  nivel_programa: string | null;
  perfil_credito: string | null;
  ativo: boolean | null;
}

export const QK_CLIENTE_CADASTRO = "cliente-painel-cadastro";
export const QK_CLIENTE_ANALISE_VIGENTE = "cliente-painel-analise-vigente";

/** Cabeçalho + aba Cadastro. Uma consulta só serve as duas. */
export function useClienteCadastro(parceiroId: string | null | undefined) {
  return useQuery({
    queryKey: [QK_CLIENTE_CADASTRO, parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<ClienteCadastro | null> => {
      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select(
          "id, razao_social, nome_fantasia, cnpj, cpf, inscricao_estadual, isento_ie, telefone, email, cep, logradouro, numero, bairro, cidade, uf, nivel_programa, perfil_credito, ativo",
        )
        .eq("id", parceiroId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ClienteCadastro | null;
    },
  });
}

export interface AnaliseCreditoVigente {
  id: string;
  status_final: string | null;
  estagio_atual: string | null;
  limite_concedido: number | null;
  prazo_max_dias: number | null;
  validade_ate: string | null;
  parecer_final: string | null;
  ressalva: string | null;
  perfil_aplicado: string | null;
  decidido_em: string | null;
  criado_em: string | null;
}

/** Última análise DECIDIDA do parceiro. Somente leitura. */
export function useAnaliseCreditoVigente(parceiroId: string | null | undefined) {
  return useQuery({
    queryKey: [QK_CLIENTE_ANALISE_VIGENTE, parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<AnaliseCreditoVigente | null> => {
      const { data, error } = await (supabase as any)
        .from("analises_credito")
        .select(
          "id, status_final, estagio_atual, limite_concedido, prazo_max_dias, validade_ate, parecer_final, ressalva, perfil_aplicado, decidido_em, criado_em",
        )
        .eq("parceiro_id", parceiroId)
        .not("status_final", "is", null)
        .order("decidido_em", { ascending: false, nullsFirst: false })
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...(data as any),
        limite_concedido:
          (data as any).limite_concedido == null ? null : Number((data as any).limite_concedido),
      } as AnaliseCreditoVigente;
    },
  });
}
