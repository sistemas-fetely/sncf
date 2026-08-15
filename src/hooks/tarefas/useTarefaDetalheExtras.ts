import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { chaveDetalhe } from "./useTarefaDetalhe";

/**
 * Comentários, anexos, dependências, tempo e histórico do detalhe da tarefa.
 * FAIL-LOUD igual ao resto do módulo.
 */

async function uidAtual(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function useInvalidar(tarefaId: string, extra: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["tarefas"] });
    qc.invalidateQueries({ queryKey: chaveDetalhe(tarefaId) });
    qc.invalidateQueries({ queryKey: ["tarefas", extra, tarefaId] });
    qc.invalidateQueries({ queryKey: ["tarefas", "historico", tarefaId] });
  };
}

/* --------------------------------------------------------- comentários ---- */

export interface Comentario {
  id: string;
  tarefa_id: string;
  user_id: string;
  conteudo: string;
  editado: boolean;
  criado_em: string;
  mencionados: string[];
}

export function useComentarios(tarefaId: string | null) {
  return useQuery({
    queryKey: ["tarefas", "comentarios", tarefaId],
    enabled: !!tarefaId,
    queryFn: async (): Promise<Comentario[]> => {
      const { data, error } = await supabase
        .from("tarefas_comentarios")
        .select("id,tarefa_id,user_id,conteudo,editado,criado_em,mencionados")
        .eq("tarefa_id", tarefaId!)
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Comentario[];
    },
  });
}

export function useMutarComentarios(tarefaId: string) {
  const invalidar = useInvalidar(tarefaId, "comentarios");

  const criar = useMutation({
    mutationFn: async ({ conteudo, mencionados }: { conteudo: string; mencionados: string[] }) => {
      const texto = conteudo.trim();
      if (!texto) throw new Error("Comentário vazio.");
      const uid = await uidAtual();
      if (!uid) throw new Error("Sessão expirada.");
      const { error } = await supabase
        .from("tarefas_comentarios")
        .insert({ tarefa_id: tarefaId, user_id: uid, conteudo: texto, mencionados });
      if (error) throw error;
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não foi possível comentar: ${e.message}`),
  });

  const editar = useMutation({
    mutationFn: async ({ id, conteudo }: { id: string; conteudo: string }) => {
      const texto = conteudo.trim();
      if (!texto) throw new Error("Comentário vazio.");
      const { error } = await supabase
        .from("tarefas_comentarios")
        .update({ conteudo: texto })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não foi possível editar: ${e.message}`),
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas_comentarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não foi possível apagar: ${e.message}`),
  });

  return { criar, editar, apagar };
}

/* -------------------------------------------------------------- anexos ---- */

export const BUCKET_ANEXOS = "tarefas-anexos";

export interface Anexo {
  id: string;
  nome_arquivo: string;
  storage_path: string;
  tamanho_bytes: number | null;
  mime_type: string | null;
  enviado_por: string | null;
  criado_em: string;
}

export function useAnexos(tarefaId: string | null) {
  return useQuery({
    queryKey: ["tarefas", "anexos", tarefaId],
    enabled: !!tarefaId,
    queryFn: async (): Promise<Anexo[]> => {
      const { data, error } = await supabase
        .from("tarefas_anexos")
        .select("id,nome_arquivo,storage_path,tamanho_bytes,mime_type,enviado_por,criado_em")
        .eq("tarefa_id", tarefaId!)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Anexo[];
    },
  });
}

export function useMutarAnexos(tarefaId: string) {
  const invalidar = useInvalidar(tarefaId, "anexos");

  const enviar = useMutation({
    mutationFn: async (arquivo: File) => {
      const uid = await uidAtual();
      // o path PRECISA começar com o id da tarefa — a policy do bucket usa isso
      const limpo = arquivo.name.replace(/[^\w.\-]+/g, "_");
      const path = `${tarefaId}/${Date.now()}_${limpo}`;
      const { error: errUp } = await supabase.storage
        .from(BUCKET_ANEXOS)
        .upload(path, arquivo, { contentType: arquivo.type || undefined });
      if (errUp) throw errUp;

      const { error } = await supabase.from("tarefas_anexos").insert({
        tarefa_id: tarefaId,
        nome_arquivo: arquivo.name,
        storage_path: path,
        tamanho_bytes: arquivo.size,
        mime_type: arquivo.type || null,
        enviado_por: uid,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Anexo enviado");
    },
    onError: (e: Error) => toast.error(`Não foi possível anexar: ${e.message}`),
  });

  const apagar = useMutation({
    mutationFn: async (anexo: Anexo) => {
      const { error } = await supabase.from("tarefas_anexos").delete().eq("id", anexo.id);
      if (error) throw error;
      const { error: errStorage } = await supabase.storage
        .from(BUCKET_ANEXOS)
        .remove([anexo.storage_path]);
      if (errStorage) throw errStorage;
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não foi possível apagar o anexo: ${e.message}`),
  });

  return { enviar, apagar };
}

export async function abrirAnexo(storagePath: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET_ANEXOS)
    .createSignedUrl(storagePath, 3600);
  if (error) {
    toast.error(`Não foi possível abrir o anexo: ${error.message}`);
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

/* -------------------------------------------------------- dependências ---- */

export interface Dependencia {
  id: string;
  tarefa_id: string;
  depende_de_id: string;
  titulo: string;
  status: string;
}

/** bloqueadoras: linhas onde tarefa_id = esta (esta depende delas) */
export function useDependencias(tarefaId: string | null) {
  return useQuery({
    queryKey: ["tarefas", "dependencias", tarefaId],
    enabled: !!tarefaId,
    queryFn: async () => {
      const [bloqueiam, bloqueadas] = await Promise.all([
        supabase
          .from("tarefas_dependencias")
          .select("id,tarefa_id,depende_de_id, alvo:tarefas!tarefas_dependencias_depende_de_id_fkey(titulo,status)")
          .eq("tarefa_id", tarefaId!),
        supabase
          .from("tarefas_dependencias")
          .select("id,tarefa_id,depende_de_id, origem:tarefas!tarefas_dependencias_tarefa_id_fkey(titulo,status)")
          .eq("depende_de_id", tarefaId!),
      ]);
      if (bloqueiam.error) throw bloqueiam.error;
      if (bloqueadas.error) throw bloqueadas.error;

      return {
        bloqueadaPor: (bloqueiam.data ?? []).map((l) => ({
          id: l.id,
          tarefa_id: l.tarefa_id,
          depende_de_id: l.depende_de_id,
          titulo: l.alvo?.titulo ?? "(sem título)",
          status: l.alvo?.status ?? "",
        })) as Dependencia[],
        bloqueia: (bloqueadas.data ?? []).map((l) => ({
          id: l.id,
          tarefa_id: l.tarefa_id,
          depende_de_id: l.depende_de_id,
          titulo: l.origem?.titulo ?? "(sem título)",
          status: l.origem?.status ?? "",
        })) as Dependencia[],
      };
    },
  });
}

export function useMutarDependencias(tarefaId: string) {
  const invalidar = useInvalidar(tarefaId, "dependencias");

  const adicionar = useMutation({
    mutationFn: async ({ outraId, sentido }: { outraId: string; sentido: "bloqueada_por" | "bloqueia" }) => {
      const criado_por = await uidAtual();
      const linha =
        sentido === "bloqueada_por"
          ? { tarefa_id: tarefaId, depende_de_id: outraId, criado_por }
          : { tarefa_id: outraId, depende_de_id: tarefaId, criado_por };
      const { error } = await supabase.from("tarefas_dependencias").insert(linha);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Dependência criada");
    },
    onError: (e: Error) => toast.error(`Não foi possível criar a dependência: ${e.message}`),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas_dependencias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não foi possível remover: ${e.message}`),
  });

  return { adicionar, remover };
}

/** busca simples de tarefas por título, para escolher a dependência */
export function useBuscarTarefas(termo: string, excluirId: string) {
  return useQuery({
    queryKey: ["tarefas", "busca", termo],
    enabled: termo.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("id,titulo,status")
        .ilike("titulo", `%${termo.trim()}%`)
        .neq("id", excluirId)
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* --------------------------------------------------------------- tempo ---- */

export interface Apontamento {
  id: string;
  tarefa_id: string;
  user_id: string;
  data: string;
  horas: number;
  descricao: string | null;
  criado_em: string;
}

export function useApontamentos(tarefaId: string | null) {
  return useQuery({
    queryKey: ["tarefas", "apontamentos", tarefaId],
    enabled: !!tarefaId,
    queryFn: async (): Promise<Apontamento[]> => {
      const { data, error } = await supabase
        .from("tarefas_apontamentos")
        .select("id,tarefa_id,user_id,data,horas,descricao,criado_em")
        .eq("tarefa_id", tarefaId!)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Apontamento[];
    },
  });
}

export function useMutarApontamentos(tarefaId: string) {
  const invalidar = useInvalidar(tarefaId, "apontamentos");

  const criar = useMutation({
    mutationFn: async ({ data, horas, descricao }: { data: string; horas: number; descricao?: string | null }) => {
      if (!(horas > 0)) throw new Error("Horas precisam ser maiores que zero.");
      const uid = await uidAtual();
      if (!uid) throw new Error("Sessão expirada.");
      const { error } = await supabase
        .from("tarefas_apontamentos")
        .insert({ tarefa_id: tarefaId, user_id: uid, data, horas, descricao: descricao ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Apontamento registrado");
    },
    onError: (e: Error) => toast.error(`Não foi possível apontar: ${e.message}`),
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas_apontamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não foi possível apagar o apontamento: ${e.message}`),
  });

  return { criar, apagar };
}

/* --------------------------------------------------------------- timer ---- */

export interface TimerAtivo {
  user_id: string;
  tarefa_id: string;
  iniciado_em: string;
}

/** PK é user_id: cada pessoa tem UM timer ativo. */
export function useTimerAtivo() {
  return useQuery({
    queryKey: ["tarefas", "timer"],
    queryFn: async (): Promise<TimerAtivo | null> => {
      const uid = await uidAtual();
      if (!uid) return null;
      const { data, error } = await supabase
        .from("tarefas_timer")
        .select("user_id,tarefa_id,iniciado_em")
        .eq("user_id", uid)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TimerAtivo | null;
    },
  });
}

export function useMutarTimer(tarefaId: string) {
  const qc = useQueryClient();
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["tarefas"] });
    qc.invalidateQueries({ queryKey: ["tarefas", "timer"] });
    qc.invalidateQueries({ queryKey: ["tarefas", "apontamentos", tarefaId] });
    qc.invalidateQueries({ queryKey: chaveDetalhe(tarefaId) });
  };

  const iniciar = useMutation({
    mutationFn: async () => {
      const uid = await uidAtual();
      if (!uid) throw new Error("Sessão expirada.");
      const { error } = await supabase
        .from("tarefas_timer")
        .upsert({ user_id: uid, tarefa_id: tarefaId, iniciado_em: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Cronômetro iniciado");
    },
    onError: (e: Error) => toast.error(`Não foi possível iniciar: ${e.message}`),
  });

  /** para o cronômetro e converte o tempo corrido em apontamento */
  const parar = useMutation({
    mutationFn: async (iniciadoEm: string) => {
      const uid = await uidAtual();
      if (!uid) throw new Error("Sessão expirada.");
      const horas = (Date.now() - new Date(iniciadoEm).getTime()) / 3_600_000;
      const arredondado = Math.round(horas * 100) / 100;
      const { error: errDel } = await supabase.from("tarefas_timer").delete().eq("user_id", uid);
      if (errDel) throw errDel;
      if (arredondado >= 0.01) {
        const hoje = new Date();
        const dataISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
        const { error } = await supabase.from("tarefas_apontamentos").insert({
          tarefa_id: tarefaId,
          user_id: uid,
          data: dataISO,
          horas: arredondado,
          descricao: "Cronômetro",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidar();
      toast.success("Cronômetro parado");
    },
    onError: (e: Error) => toast.error(`Não foi possível parar: ${e.message}`),
  });

  return { iniciar, parar };
}

/* ----------------------------------------------------------- histórico ---- */

export interface HistoricoTarefa {
  id: string;
  tarefa_id: string;
  user_id: string | null;
  acao: string;
  de: unknown;
  para: unknown;
  criado_em: string;
}

export function useHistoricoTarefa(tarefaId: string | null, habilitado: boolean) {
  return useQuery({
    queryKey: ["tarefas", "historico", tarefaId],
    enabled: !!tarefaId && habilitado,
    queryFn: async (): Promise<HistoricoTarefa[]> => {
      const { data, error } = await supabase
        .from("historico_tarefas")
        .select("id,tarefa_id,user_id,acao,de,para,criado_em")
        .eq("tarefa_id", tarefaId!)
        .order("criado_em", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as HistoricoTarefa[];
    },
  });
}
