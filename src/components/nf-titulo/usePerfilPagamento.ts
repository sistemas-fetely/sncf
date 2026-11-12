import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import type { NfSemTitulo, PerfilPainel } from "./perfilPagamento";

// Objetos novos do banco ainda fora dos tipos gerados.
interface Resposta<T> { data: T | null; error: { message: string } | null }
interface Consulta<T> extends PromiseLike<Resposta<T>> { eq(c: string, v: unknown): Consulta<T>; order(c: string, o?: { ascending?: boolean }): Consulta<T>; range(a: number, b: number): Consulta<T> }
interface ClienteSolto {
  from<T>(t: string): { select(c: string): Consulta<T> };
  rpc<T>(f: string, a: Record<string, unknown>): PromiseLike<Resposta<T>>;
}
export const db = supabase as unknown as ClienteSolto;

export const QK_FILA = ["nf-sem-titulo-fila"];
export const QK_PAINEL = ["perfil-pagamento-painel"];

async function tudo<T>(tabela: string): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from<T[]>(tabela).select("*").range(de, de + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
}

export const useFilaSemTitulo = () => useQuery({ queryKey: QK_FILA, queryFn: () => tudo<NfSemTitulo>("vw_nf_sem_titulo_fila") });
export const usePainelPerfis = () => useQuery({ queryKey: QK_PAINEL, queryFn: () => tudo<PerfilPainel>("vw_parceiro_perfil_pagamento_painel") });

export interface FormaPg { codigo: string; nome: string }
export interface FormaDim { forma_codigo: string; gera_titulo: boolean; motivo: string | null }

export function useFormas() {
  const formas = useQuery({
    queryKey: ["formas-pagamento-ativas"],
    queryFn: async () => {
      const { data, error } = await db.from<FormaPg[]>("formas_pagamento").select("codigo,nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const dim = useQuery({
    queryKey: ["nf-titulo-forma-dim"],
    queryFn: async () => {
      const { data, error } = await db.from<FormaDim[]>("nf_titulo_forma_dim").select("forma_codigo,gera_titulo,motivo");
      if (error) throw error;
      return data ?? [];
    },
  });
  const lista = formas.data ?? [];
  const dims = dim.data ?? [];
  return {
    formas: lista,
    erro: formas.error ?? dim.error,
    nome: (c: string | null) => (c ? lista.find((f) => f.codigo === c)?.nome ?? c : null),
    dimDe: (c: string | null) => dims.find((d) => d.forma_codigo === c),
    naoGera: (c: string) => dims.some((d) => d.forma_codigo === c && !d.gera_titulo),
  };
}

interface RetornoPerfil { ok: boolean; notas?: { titulos_gerados?: number; valor?: number; erros?: { nf: string; erro: string }[] } }

export function useInvalidarPerfis() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: QK_FILA }),
    qc.invalidateQueries({ queryKey: QK_PAINEL }),
    qc.invalidateQueries({ queryKey: ["contas-pagar"] }),
    qc.invalidateQueries({ queryKey: ["nf-a-gerar-titulo"] }),
  ]);
}

export function useDefinirPerfil(onOk?: () => void) {
  const invalidar = useInvalidarPerfis();
  return useMutation({
    mutationFn: async (a: { parceiro_id: string; forma: string; prazo: number | null }) => {
      const { data, error } = await db.rpc<RetornoPerfil>("fn_parceiro_definir_perfil_pagamento", { p_parceiro_id: a.parceiro_id, p_forma_codigo: a.forma, p_prazo_dias: a.prazo });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      await invalidar();
      const n = data?.notas;
      toast.success(`Perfil salvo · ${n?.titulos_gerados ?? 0} título(s) gerado(s) (${formatBRL(n?.valor ?? 0)})`);
      if (n?.erros?.length) toast.warning(`Notas com erro: ${n.erros.map((e) => `NF ${e.nf}: ${e.erro}`).join(" · ")}`, { duration: 15000 });
      onOk?.();
    },
    onError: (e) => toast.error(formatError(e)),
  });
}
