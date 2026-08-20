import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KEY_GESTAO } from "./useGestaoSalas";

/**
 * A reunião é um carimbo no tempo. A ata NÃO é digitada: ela nasce dos itens
 * tocados (gestao_reuniao_item) e é lida por vw_gestao_ata / vw_gestao_ata_cabecalho.
 * Nunca criar campo de texto livre "ata".
 */

export type ItemTipo = "projeto" | "decisao" | "risco" | "tarefa";
export type SaudeProjeto = "no_prazo" | "em_risco" | "atrasado";

export const SAUDE_ROTULO: Record<string, string> = {
  no_prazo: "No prazo",
  em_risco: "Em risco",
  atrasado: "Atrasado",
};

export interface Reuniao {
  id: string;
  sala_id: string;
  numero: number;
  data: string;
  status: string;
  fechada_em: string | null;
  fechada_por: string | null;
  gerada_automaticamente: boolean | null;
}

export interface Participante {
  reuniao_id: string;
  pessoa_id: string;
  presente: boolean | null;
}

export interface LinhaPauta {
  sala_id: string | null;
  sala_nome: string | null;
  categoria: string | null;
  ordem_grupo: number | null;
  item_tipo: string | null;
  item_id: string | null;
  titulo: string | null;
  detalhe: string | null;
  marcador: string | null;
  dias: number | null;
}

export interface ItemReuniao {
  id: string;
  reuniao_id: string;
  ordem: number | null;
  nota: string | null;
  saude: string | null;
  projeto_id: string | null;
  decisao_id: string | null;
  risco_id: string | null;
  tarefa_id: string | null;
  criado_em: string | null;
}

export interface AtaCabecalho {
  reuniao_id: string | null;
  sala_id: string | null;
  sala_codigo: string | null;
  sala_nome: string | null;
  confidencial: boolean | null;
  numero: number | null;
  data: string | null;
  status: string | null;
  fechada_em: string | null;
  presentes: number | null;
  ausentes: number | null;
  lista_presentes: string | null;
  lista_ausentes: string | null;
  total_itens: number | null;
  reuniao_anterior_data: string | null;
}

export interface LinhaAta {
  reuniao_id: string | null;
  item_id: string | null;
  ordem: number | null;
  item_tipo: string | null;
  ordem_grupo: number | null;
  titulo: string | null;
  nota: string | null;
  saude: string | null;
  complemento: string | null;
  marcador: string | null;
  responsavel: string | null;
  projeto_id: string | null;
  decisao_id: string | null;
  risco_id: string | null;
  tarefa_id: string | null;
}

export function useReuniao(reuniaoId: string | null) {
  return useQuery({
    queryKey: [...KEY_GESTAO, "reuniao", reuniaoId ?? "nenhuma"],
    enabled: !!reuniaoId,
    queryFn: async (): Promise<Reuniao | null> => {
      const { data, error } = await supabase
        .from("gestao_reuniao")
        .select("id,sala_id,numero,data,status,fechada_em,fechada_por,gerada_automaticamente")
        .eq("id", reuniaoId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Reuniao | null;
    },
  });
}

/** Reuniões da sala, mais recente primeiro. */
export function useReunioesDaSala(salaId: string | null) {
  return useQuery({
    queryKey: [...KEY_GESTAO, "reunioes", salaId ?? "nenhuma"],
    enabled: !!salaId,
    queryFn: async (): Promise<Reuniao[]> => {
      const { data, error } = await supabase
        .from("gestao_reuniao")
        .select("id,sala_id,numero,data,status,fechada_em,fechada_por,gerada_automaticamente")
        .eq("sala_id", salaId!)
        .order("numero", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Reuniao[];
    },
  });
}

export function usePauta(salaId: string | null) {
  return useQuery({
    queryKey: [...KEY_GESTAO, "pauta", salaId ?? "nenhuma"],
    enabled: !!salaId,
    queryFn: async (): Promise<LinhaPauta[]> => {
      const { data, error } = await supabase
        .from("vw_gestao_pauta")
        .select("sala_id,sala_nome,categoria,ordem_grupo,item_tipo,item_id,titulo,detalhe,marcador,dias")
        .eq("sala_id", salaId!)
        .order("ordem_grupo", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as LinhaPauta[];
    },
  });
}

export function useParticipantes(reuniaoId: string | null) {
  return useQuery({
    queryKey: [...KEY_GESTAO, "participantes", reuniaoId ?? "nenhuma"],
    enabled: !!reuniaoId,
    queryFn: async (): Promise<Participante[]> => {
      const { data, error } = await supabase
        .from("gestao_reuniao_participante")
        .select("reuniao_id,pessoa_id,presente")
        .eq("reuniao_id", reuniaoId!);
      if (error) throw error;
      return (data ?? []) as Participante[];
    },
  });
}

export function useItensReuniao(reuniaoId: string | null) {
  return useQuery({
    queryKey: [...KEY_GESTAO, "itens", reuniaoId ?? "nenhuma"],
    enabled: !!reuniaoId,
    queryFn: async (): Promise<ItemReuniao[]> => {
      const { data, error } = await supabase
        .from("gestao_reuniao_item")
        .select("id,reuniao_id,ordem,nota,saude,projeto_id,decisao_id,risco_id,tarefa_id,criado_em")
        .eq("reuniao_id", reuniaoId!)
        .order("ordem", { ascending: true, nullsFirst: false })
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItemReuniao[];
    },
  });
}

export function useAtaCabecalho(reuniaoId: string | null) {
  return useQuery({
    queryKey: [...KEY_GESTAO, "ata-cabecalho", reuniaoId ?? "nenhuma"],
    enabled: !!reuniaoId,
    queryFn: async (): Promise<AtaCabecalho | null> => {
      const { data, error } = await supabase
        .from("vw_gestao_ata_cabecalho")
        .select("*")
        .eq("reuniao_id", reuniaoId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AtaCabecalho | null;
    },
  });
}

export function useAta(reuniaoId: string | null) {
  return useQuery({
    queryKey: [...KEY_GESTAO, "ata", reuniaoId ?? "nenhuma"],
    enabled: !!reuniaoId,
    queryFn: async (): Promise<LinhaAta[]> => {
      const { data, error } = await supabase
        .from("vw_gestao_ata")
        .select("*")
        .eq("reuniao_id", reuniaoId!)
        .order("ordem_grupo", { ascending: true, nullsFirst: false })
        .order("ordem", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as LinhaAta[];
    },
  });
}

/** Traz um item da pauta para a reunião — EXATAMENTE UM id é preenchido (CHECK no banco). */
export function useTrazerItemParaReuniao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reuniaoId,
      tipo,
      itemId,
      ordem,
    }: {
      reuniaoId: string;
      tipo: ItemTipo;
      itemId: string;
      ordem?: number | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const alvo =
        tipo === "projeto" ? { projeto_id: itemId }
        : tipo === "decisao" ? { decisao_id: itemId }
        : tipo === "risco" ? { risco_id: itemId }
        : { tarefa_id: itemId };
      const { error } = await supabase.from("gestao_reuniao_item").insert({
        reuniao_id: reuniaoId,
        ordem: ordem ?? null,
        ...alvo,
        criado_por: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_GESTAO });
      toast.success("Item na pauta da reunião");
    },
    onError: (e: Error) => toast.error(`Não foi possível trazer o item: ${e.message}`),
  });
}

export function useAtualizarItemReuniao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      nota,
      saude,
    }: {
      id: string;
      nota?: string | null;
      saude?: string | null;
    }) => {
      const patch: { nota?: string | null; saude?: string | null } = {};
      if (nota !== undefined) patch.nota = nota?.trim() ? nota : null;
      if (saude !== undefined) patch.saude = saude;
      const { error } = await supabase.from("gestao_reuniao_item").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_GESTAO }),
    onError: (e: Error) => toast.error(`Não foi possível salvar o item: ${e.message}`),
  });
}

export function useRemoverItemReuniao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gestao_reuniao_item").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_GESTAO });
      toast.success("Item retirado da reunião");
    },
    onError: (e: Error) => toast.error(`Não foi possível retirar o item: ${e.message}`),
  });
}

export function useMarcarPresenca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reuniaoId,
      pessoaId,
      presente,
    }: {
      reuniaoId: string;
      pessoaId: string;
      presente: boolean;
    }) => {
      const { error } = await supabase
        .from("gestao_reuniao_participante")
        .upsert({ reuniao_id: reuniaoId, pessoa_id: pessoaId, presente }, { onConflict: "reuniao_id,pessoa_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_GESTAO }),
    onError: (e: Error) => toast.error(`Não foi possível marcar presença: ${e.message}`),
  });
}

/** Irreversível: grava check-ins, congela notas e dispara a ata. Só facilitador. */
/** Retorno real da RPC fn_gestao_fechar_reuniao — FAIL-LOUD: o front não promete o que não checou. */
export type ResultadoFecharReuniao = {
  checkins: number;
  decisoes_carimbadas: number;
  ata_destinatarios: number;
  ata_erro: string | null;
};

export function useFecharReuniao() {
  const qc = useQueryClient();
  return useMutation<ResultadoFecharReuniao, Error, string>({
    mutationFn: async (reuniaoId: string): Promise<ResultadoFecharReuniao> => {
      const { data, error } = await supabase.rpc("fn_gestao_fechar_reuniao", { _reuniao_id: reuniaoId });
      if (error) throw error;
      if (!data || typeof data !== "object") throw new Error("A RPC de fechamento não devolveu o resumo esperado.");
      const bruto = data as Record<string, unknown>;
      return {
        checkins: Number(bruto.checkins ?? 0),
        decisoes_carimbadas: Number(bruto.decisoes_carimbadas ?? 0),
        ata_destinatarios: Number(bruto.ata_destinatarios ?? 0),
        ata_erro: typeof bruto.ata_erro === "string" && bruto.ata_erro.trim() ? bruto.ata_erro : null,
      };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: KEY_GESTAO });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      const carimbos = `${r.checkins} check-in(s) gravado(s) · ${r.decisoes_carimbadas} decisão(ões) carimbada(s)`;
      if (r.ata_erro) {
        toast.error(`Reunião fechada, mas a ata não saiu: ${r.ata_erro}`, { description: carimbos });
        return;
      }
      if (r.ata_destinatarios === 0) {
        toast.warning(
          "Reunião fechada. Nenhum membro tem e-mail corporativo cadastrado — a ata não foi enviada.",
          { description: carimbos },
        );
        return;
      }
      toast.success(`Reunião fechada. Ata enviada para ${r.ata_destinatarios} membro(s).`, {
        description: carimbos,
      });
    },
    onError: (e: Error) => toast.error(`Não foi possível fechar a reunião: ${e.message}`),
  });
}


/** Cria uma reunião nova (sob demanda) na sala. */
export function useAbrirReuniao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ salaId, numero }: { salaId: string; numero: number }): Promise<string> => {
      const hoje = new Date();
      const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
      const { data: criada, error } = await supabase
        .from("gestao_reuniao")
        .insert({ sala_id: salaId, numero, data, status: "aberta", gerada_automaticamente: false })
        .select("id")
        .single();
      if (error) throw error;
      return criada.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_GESTAO });
      toast.success("Reunião aberta");
    },
    onError: (e: Error) => toast.error(`Não foi possível abrir a reunião: ${e.message}`),
  });
}
