import { describe, expect, it } from "vitest";
import { filtrarMidia, rotuloOrigemFoto, type FiltroMidia, type MidiaProduto } from "@/lib/midia/gestao";

const base: Omit<MidiaProduto, "cod_cadastro" | "situacao"> = {
  sku: null, nome_comercial: null, colecao: null, cor_nome: null, ativo: true, foto_principal_url: null, foto_origem: null, foto_fonte: null, foto_do_produto: null,
  n_fotos: 0, n_fotos_copiadas: 0, n_fotos_falha: 0, n_videos: 0, n_videos_copiados: 0, n_proprias: 0, n_fotos_bling: null, bling_lido_em: null, espelhado_em: null,
};
const p = (cod: string, x: Partial<MidiaProduto>): MidiaProduto => ({ ...base, cod_cadastro: cod, situacao: "com_foto", ...x });
const lista = [
  p("1", { situacao: "com_foto", n_videos: 1 }),
  p("2", { situacao: "so_cor_colecao" }),
  p("3", { situacao: "sem_foto", ativo: false }),
  p("4", { situacao: "com_foto", n_fotos_falha: 2 }),
];
const f0: FiltroMidia = { cartao: "", busca: "", situacao: "", colecao: "", soVideo: false, soAtivos: true, soFalha: false };
const cods = (f: Partial<FiltroMidia>) => filtrarMidia(lista, { ...f0, ...f }).map((x) => x.cod_cadastro);

describe("rotuloOrigemFoto", () => {
  it("mapeia as origens", () => {
    expect(rotuloOrigemFoto("fop")).toBe("FOP");
    expect(rotuloOrigemFoto("propria")).toBe("Própria");
    expect(rotuloOrigemFoto("shopify")).toBe("Shopify");
    expect(rotuloOrigemFoto("fop_cor")).toBe("FOP · cor");
    expect(rotuloOrigemFoto("fop_colecao")).toBe("FOP · coleção");
    expect(rotuloOrigemFoto(null)).toBe("—");
  });
});
describe("filtrarMidia por cartão", () => {
  it("com foto", () => expect(cods({ cartao: "com_foto" })).toEqual(["1", "4"]));
  it("só cor/coleção", () => expect(cods({ cartao: "so_cor_colecao" })).toEqual(["2"]));
  it("sem foto respeita só ativos", () => { expect(cods({ cartao: "sem_foto" })).toEqual([]); expect(cods({ cartao: "sem_foto", soAtivos: false })).toEqual(["3"]); });
  it("com vídeo", () => expect(cods({ cartao: "com_video" })).toEqual(["1"]));
  it("falhas", () => expect(cods({ cartao: "falha" })).toEqual(["4"]));
  it("variantes sem vínculo não filtra produtos", () => expect(cods({ cartao: "sem_vinculo" })).toEqual(["1", "2", "4"]));
});
import { contarCartoes } from "@/lib/midia/gestao";
describe("contarCartoes", () => {
  it("conta só ativos, na regra do filtro", () => expect(contarCartoes(lista)).toEqual({ com_foto: 2, so_cor_colecao: 1, sem_foto: 0, com_video: 1, falha: 1 }));
});
