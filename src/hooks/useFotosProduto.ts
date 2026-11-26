// FOTOS DO PRODUTO (22/09/2026) — base PRÓPRIA de fotos do SNCF, indexada por
// cod_cadastro. Nada aqui toca o FOP: o FOP indexa por coleção+cor e o Shopify
// só cobre o catálogo B2C. Tabela `produto_foto` + bucket público `produto-fotos`.
// Só uma foto principal por produto (índice único parcial no banco); as antigas
// ficam no histórico, nunca são apagadas por troca de principal.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";

export const BUCKET_FOTOS = "produto-fotos";
export const LIMITE_BYTES = 10 * 1024 * 1024;
export const EXTENSOES_ACEITAS = [".jpg", ".jpeg", ".png", ".webp"];
export const ORIGENS_SUGERIDAS = ["catalogo_pdf", "foto_estudio", "fornecedor"];

export type FotoProduto = {
  id: string;
  cod_cadastro: string;
  arquivo: string;
  url: string | null;
  origem: string | null;
  catalogo: string | null;
  largura_px: number | null;
  altura_px: number | null;
  bytes: number | null;
  principal: boolean | null;
  ordem: number | null;
  observacao: string | null;
  criado_em: string | null;
  criado_por: string | null;
};

export type FotoLinha = FotoProduto & {
  nome_comercial: string | null;
  fotos_do_produto: number;
};

/** O nome do arquivo é a chave: sequência de 5 dígitos começando em 0. */
export function extrairCodCadastro(nome: string): string | null {
  const achado = nome.match(/0\d{4}/);
  return achado ? achado[0] : null;
}

export function extensaoValida(nome: string): boolean {
  const n = nome.toLowerCase();
  return EXTENSOES_ACEITAS.some((ext) => n.endsWith(ext));
}

export function lerDimensoes(file: File): Promise<{ largura: number | null; altura: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ largura: img.naturalWidth || null, altura: img.naturalHeight || null });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ largura: null, altura: null });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/** Lista da base própria, com nome comercial e quantas fotos o produto tem. */
export function useFotosProduto() {
  return useQuery({
    queryKey: ["produto-fotos", "lista"],
    staleTime: Infinity,
    queryFn: async (): Promise<FotoLinha[]> => {
      const { data, error } = await supabase
        .from("produto_foto")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(5000);
      if (error) throw new Error(rawMessage(error));
      const fotos = (data ?? []) as FotoProduto[];

      const codigos = Array.from(new Set(fotos.map((f) => f.cod_cadastro).filter(Boolean)));
      const nomes = new Map<string, string | null>();
      for (let i = 0; i < codigos.length; i += 300) {
        const fatia = codigos.slice(i, i + 300);
        const { data: prods, error: erroProd } = await supabase
          .from("sncf_produtos")
          .select("cod_cadastro, nome_comercial")
          .in("cod_cadastro", fatia);
        if (erroProd) throw new Error(rawMessage(erroProd));
        (prods ?? []).forEach((p) => {
          if (p.cod_cadastro) nomes.set(p.cod_cadastro, p.nome_comercial ?? null);
        });
      }

      const porProduto = new Map<string, number>();
      fotos.forEach((f) => porProduto.set(f.cod_cadastro, (porProduto.get(f.cod_cadastro) ?? 0) + 1));

      return fotos.map((f) => ({
        ...f,
        nome_comercial: nomes.get(f.cod_cadastro) ?? null,
        fotos_do_produto: porProduto.get(f.cod_cadastro) ?? 1,
      }));
    },
  });
}

/** Faixa de números: cobertura da base própria. */
export function useResumoFotos() {
  return useQuery({
    queryKey: ["produto-fotos", "resumo"],
    staleTime: Infinity,
    queryFn: async () => {
      const { count: totalProdutos, error: e1 } = await supabase
        .from("sncf_produtos")
        .select("cod_cadastro", { count: "exact", head: true })
        .not("cod_cadastro", "is", null);
      if (e1) throw new Error(rawMessage(e1));

      const { data, error: e2 } = await supabase
        .from("produto_foto")
        .select("cod_cadastro, bytes")
        .limit(20000);
      if (e2) throw new Error(rawMessage(e2));

      const fotos = (data ?? []) as { cod_cadastro: string; bytes: number | null }[];
      const comFoto = new Set(fotos.map((f) => f.cod_cadastro)).size;
      const bytes = fotos.reduce((soma, f) => soma + (f.bytes ?? 0), 0);
      return {
        com_foto: comFoto,
        sem_foto: Math.max(0, (totalProdutos ?? 0) - comFoto),
        arquivos: fotos.length,
        mb: bytes / (1024 * 1024),
      };
    },
  });
}

export function useTornarPrincipal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, cod_cadastro }: { id: string; cod_cadastro: string }) => {
      const { error: erroLimpa } = await supabase
        .from("produto_foto")
        .update({ principal: false })
        .eq("cod_cadastro", cod_cadastro)
        .eq("principal", true);
      if (erroLimpa) throw new Error(rawMessage(erroLimpa));
      const { error } = await supabase.from("produto_foto").update({ principal: true }).eq("id", id);
      if (error) throw new Error(rawMessage(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["produto-fotos"] });
    },
  });
}

export function useExcluirFoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (foto: FotoProduto) => {
      const { error: erroStorage } = await supabase.storage.from(BUCKET_FOTOS).remove([foto.arquivo]);
      if (erroStorage) throw new Error(rawMessage(erroStorage));
      const { error } = await supabase.from("produto_foto").delete().eq("id", foto.id);
      if (error) throw new Error(rawMessage(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["produto-fotos"] });
    },
  });
}

/** Sobe um arquivo e grava a linha. Não redimensiona nem recomprime: sobe como veio. */
export async function enviarFoto(params: {
  file: File;
  cod_cadastro: string;
  origem: string;
  catalogo: string | null;
  criado_por: string | null;
  tinhaPrincipal: boolean;
}): Promise<void> {
  const { file, cod_cadastro, origem, catalogo, criado_por, tinhaPrincipal } = params;
  const caminho = `${cod_cadastro}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;

  const { error: erroUp } = await supabase.storage.from(BUCKET_FOTOS).upload(caminho, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (erroUp) throw new Error(rawMessage(erroUp));

  const { data: pub } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(caminho);
  const { largura, altura } = await lerDimensoes(file);

  if (tinhaPrincipal) {
    const { error: erroLimpa } = await supabase
      .from("produto_foto")
      .update({ principal: false })
      .eq("cod_cadastro", cod_cadastro)
      .eq("principal", true);
    if (erroLimpa) throw new Error(rawMessage(erroLimpa));
  }

  const { error: erroInsert } = await supabase.from("produto_foto").insert({
    cod_cadastro,
    arquivo: caminho,
    url: pub.publicUrl,
    origem,
    catalogo,
    largura_px: largura,
    altura_px: altura,
    bytes: file.size,
    principal: true,
    criado_por,
  });
  if (erroInsert) throw new Error(rawMessage(erroInsert));
}
