// Repositório de Mídia · gestão na aba Fotos (mapa-repositorio-midia-v1, 28/11/2026). Regras puras, testadas.
export type SituacaoMidia = "com_foto" | "so_cor_colecao" | "sem_foto";
export type MidiaProduto = {
  cod_cadastro: string; sku: string | null; nome_comercial: string | null; colecao: string | null; cor_nome: string | null;
  ativo: boolean | null; foto_principal_url: string | null; foto_origem: string | null; foto_fonte: string | null; foto_do_produto: boolean | null;
  n_fotos: number | null; n_fotos_copiadas: number | null; n_fotos_falha: number | null; n_videos: number | null;
  n_videos_copiados: number | null; n_proprias: number | null; n_fotos_bling: number | null; bling_lido_em: string | null;
  espelhado_em: string | null; situacao: SituacaoMidia;
};
export type CartaoMidia = "" | "com_foto" | "so_cor_colecao" | "sem_foto" | "com_video" | "falha" | "sem_vinculo";

const ROTULO_ORIGEM: Record<string, string> = { fop: "FOP", propria: "Própria", shopify: "Shopify", fop_cor: "FOP · cor", fop_colecao: "FOP · coleção" };
/** Rótulo da fonte real da foto principal (vw_midia_produto_gestao.foto_fonte); desconhecido aparece como veio, vazio vira "—". */
export function rotuloOrigemFoto(o: string | null | undefined): string {
  if (!o) return "—";
  return ROTULO_ORIGEM[o.toLowerCase()] ?? o;
}
export const ROTULO_SITUACAO: Record<SituacaoMidia, string> = { com_foto: "Com foto", so_cor_colecao: "Só cor/coleção", sem_foto: "Sem foto" };

export type FiltroMidia = { cartao: CartaoMidia; busca: string; situacao: string; colecao: string; soVideo: boolean; soAtivos: boolean; soFalha: boolean };

/** Filtra a lista. O cartão vira filtro; "sem_vinculo" não filtra produtos (abre a seção de variantes). */
export function filtrarMidia(lista: MidiaProduto[], f: FiltroMidia): MidiaProduto[] {
  const termo = f.busca.trim().toLowerCase();
  return lista.filter((p) => {
    if (f.soAtivos && p.ativo !== true) return false;
    if (f.soVideo && !(p.n_videos ?? 0)) return false;
    if (f.soFalha && !(p.n_fotos_falha ?? 0)) return false;
    if (f.situacao && p.situacao !== f.situacao) return false;
    if (f.colecao && (p.colecao ?? "") !== f.colecao) return false;
    switch (f.cartao) {
      case "com_foto": case "so_cor_colecao": case "sem_foto": if (p.situacao !== f.cartao) return false; break;
      case "com_video": if (!(p.n_videos ?? 0)) return false; break;
      case "falha": if (!(p.n_fotos_falha ?? 0)) return false; break;
    }
    if (termo && !`${p.cod_cadastro} ${p.nome_comercial ?? ""} ${p.sku ?? ""}`.toLowerCase().includes(termo)) return false;
    return true;
  });
}

/** Destaque suave: há fotos no SNCF e o Bling leu zero. */
export const blingSemFoto = (p: Pick<MidiaProduto, "n_fotos" | "n_fotos_bling">) => (p.n_fotos ?? 0) > 0 && p.n_fotos_bling === 0;

/** Números dos cartões a partir da lista (produtos ativos), na mesma regra do filtro por cartão. */
export function contarCartoes(lista: MidiaProduto[]) {
  const at = lista.filter((p) => p.ativo === true);
  return {
    com_foto: at.filter((p) => p.situacao === "com_foto").length,
    so_cor_colecao: at.filter((p) => p.situacao === "so_cor_colecao").length,
    sem_foto: at.filter((p) => p.situacao === "sem_foto").length,
    com_video: at.filter((p) => (p.n_videos ?? 0) > 0).length,
    falha: at.filter((p) => (p.n_fotos_falha ?? 0) > 0).length,
  };
}
