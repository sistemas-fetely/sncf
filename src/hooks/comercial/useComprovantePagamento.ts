import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ComprovantePagamento {
  id: string;
  pedido_id: string;
  storage_path: string;
  hash_arquivo: string | null;
  mime_type: string | null;
  tamanho_bytes: number | null;
  status: string;
  tipo_lido: string | null;
  sentido: string | null;
  valor_lido: number | null;
  data_lida: string | null;
  chave_lida: string | null;
  pagador_lido: string | null;
  beneficiario_cnpj_lido: string | null;
  confianca_ia: string | null;
  payload_ia: Record<string, unknown> | null;
  divergencia_valor: number | null;
  divergencia_justificativa: string | null;
  criado_em: string;
  confirmado_por: string | null;
  confirmado_em: string | null;
}

export interface LeituraComprovante {
  tipo: string;
  sentido: string;
  valor: number;
  data: string;
  chave: string;
  pagador: string;
  /** CPF/CNPJ do pagador como veio no comprovante (pode vir mascarado). Chave nova: opcional para não quebrar payloads antigos. */
  pagador_documento?: string;
  beneficiario_nome: string;
  beneficiario_cnpj: string;
  instituicao: string;
  confianca: string;
  mime?: string;
  bytes?: number;
}

const chaveLista = (pedidoId: string) => ["comprovantes-pagamento", pedidoId];

export function useComprovantesPedido(pedidoId: string, enabled = true) {
  return useQuery({
    queryKey: chaveLista(pedidoId),
    enabled: enabled && !!pedidoId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("comprovante_pagamento")
        .select("*")
        .eq("pedido_id", pedidoId)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ComprovantePagamento[];
    },
  });
}

export async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function extensaoDe(file: File): string {
  const doNome = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (doNome) return doNome;
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export function useEnviarComprovante(pedidoId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const hash = await sha256Hex(file);
      const path = `${pedidoId}/${hash}.${extensaoDe(file)}`;

      const { error: erroUpload } = await supabase.storage
        .from("comprovantes-pagamento")
        .upload(path, file, { contentType: file.type || undefined, upsert: true });
      if (erroUpload) throw erroUpload;

      const { data: leitura, error: erroFn } = await supabase.functions.invoke(
        "ler-comprovante-pagamento",
        { body: { storage_path: path } },
      );
      if (erroFn) {
        const detalhe =
          (leitura as { error?: string } | null)?.error ?? erroFn.message ?? "falha ao ler o comprovante";
        throw new Error(detalhe);
      }
      const lido = leitura as LeituraComprovante & { error?: string };
      if (!lido || lido.error) {
        throw new Error(lido?.error || "A IA não devolveu a leitura do comprovante.");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("registrar_comprovante_pagamento", {
        p_pedido_id: pedidoId,
        p_storage_path: path,
        p_hash: hash,
        p_leitura: lido,
        p_mime: file.type || lido.mime || "application/octet-stream",
        p_bytes: file.size,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chaveLista(pedidoId) });
      toast.success("Comprovante lido pela IA — revise os campos antes de confirmar.");
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });
}

interface ConfirmarArgs {
  comprovante_id: string;
  tipo: string;
  chave: string;
  valor: number;
  data: string;
  justificativa?: string | null;
  /** Conta onde o dinheiro entrou (`banco_recebimento.id`). */
  banco_recebimento_id?: string | null;
}

export function useConfirmarComprovante(pedidoId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: ConfirmarArgs) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("confirmar_comprovante_pagamento", {
        p_comprovante_id: args.comprovante_id,
        p_tipo: args.tipo,
        p_chave: args.chave,
        p_valor: args.valor,
        p_data: args.data,
        p_justificativa: args.justificativa?.trim() || null,
        p_banco_recebimento_id: args.banco_recebimento_id || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oportunidades-comercial"] });
      qc.invalidateQueries({ queryKey: chaveLista(pedidoId) });
      qc.invalidateQueries({ queryKey: ["oportunidade-obs-comerciais", pedidoId] });
      toast.success("Pagamento confirmado pelo comprovante");
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });
}
