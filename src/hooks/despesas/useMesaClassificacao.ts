import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { contasFolha, type GrupoMesa, type Porta } from "@/lib/despesas/mesaClassificacao";

const sb = supabase as any;
export const QK_MESA = "mesa-classificacao";

async function lerTudo(montar: (de: number, ate: number) => any) {
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar(de, de + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export function useGruposMesa() {
  return useQuery({
    queryKey: [QK_MESA, "grupos"],
    queryFn: async () => (await lerTudo((a, b) => sb.from("vw_mesa_classificacao_grupo").select("*").range(a, b))) as GrupoMesa[],
  });
}

export interface ItemMesa {
  despesa_id: string; data_competencia: string | null; valor: number; descricao: string | null; pista: string | null;
  nf_numero: string | null; plano_codigo: string | null; plano_nome: string | null; centro_codigo: string | null;
  centro_nome: string | null; falta_plano: boolean; falta_centro: boolean;
}
export function useItensMesa(porta: Porta, chave: string, ativo: boolean) {
  return useQuery({
    queryKey: [QK_MESA, "itens", porta, chave],
    enabled: ativo,
    queryFn: async () => {
      const { data, error } = await sb.from("vw_mesa_classificacao_item").select("*").eq("porta", porta).eq("chave", chave).order("data_competencia", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ItemMesa[];
    },
  });
}

export function useListasMesa() {
  const planos = useQuery({
    queryKey: [QK_MESA, "planos"],
    queryFn: async () => contasFolha((await lerTudo((a, b) => sb.from("plano_contas").select("id, codigo, nome, parent_id").range(a, b))) as { id: string; codigo: string; nome: string; parent_id: string | null }[]),
  });
  const centros = useQuery({
    queryKey: [QK_MESA, "centros"],
    queryFn: async () => {
      const { data, error } = await sb.from("centros_custo").select("id, codigo, nome").order("codigo");
      if (error) throw error;
      return (data ?? []) as { id: string; codigo: string; nome: string }[];
    },
  });
  const destinos = useQuery({
    queryKey: [QK_MESA, "destinos"],
    queryFn: async () => {
      const { data, error } = await sb.from("nf_entrada_destino").select("codigo, rotulo").eq("ativo", true).order("ordem");
      if (error) throw error;
      return (data ?? []) as { codigo: string; rotulo: string }[];
    },
  });
  return { planos, centros, destinos };
}

export interface ClassificarArgs {
  p_porta: Porta; p_chave: string; p_plano_contas_id: string; p_centro_custo_id: string | null;
  p_destino_codigo: string | null; p_despesa_ids: string[] | null; p_vira_regra: boolean;
}
export function useClassificarGrupo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: ClassificarArgs) => {
      const { data, error } = await sb.rpc("fn_mesa_classificar_grupo", args);
      if (error) throw error;
      return data as { nf: number; cartao: number; recusadas: { despesa_id: string; nf: string | null; motivo: string }[] };
    },
    onSuccess: async (r) => {
      toast.success(`${(r?.nf ?? 0) + (r?.cartao ?? 0)} lançamentos classificados`);
      if (r?.recusadas?.length) toast.error(`${r.recusadas.length} recusadas: ${r.recusadas.map((x) => `NF ${x.nf ?? "—"}: ${x.motivo}`).join("; ")}`, { duration: 15000 });
      await Promise.all([qc.invalidateQueries({ queryKey: [QK_MESA] }), qc.invalidateQueries({ queryKey: ["vw_despesas_v2"] })]);
    },
    onError: (e) => toast.error(rawMessage(e)),
  });
}
