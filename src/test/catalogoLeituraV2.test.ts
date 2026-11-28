import { describe, expect, it } from "vitest";
import { AVISO_DESCRICAO, colunasNaoComparadas, linhaSoNascimento, validarSlugs } from "../../supabase/functions/_shared/catalogo-planilha/comparacao";
const C = "Sistema · consulta";
// Mirrors COLS of catalogo-planilha-gerar-v2 (slug, dono).
const V2: [string, string][] = [["cod_cadastro","Operações"],["_codigo_externo",C],["ean",C],["dun",C],["inner_qtd",C],["marca","Produto"],["ncm","Operações"],["cest","Operações"],["origem_fisc","Operações"],["origem_prod","Operações"],["grupo_tributario_bling",C],["_fase_sncf",C],["loja_b2b","Produto"],["loja_site","Produto"],["loja_ml","Produto"],["loja_shopee","Produto"],["loja_tiktok","Produto"],
  ...["departamento","categoria","linha","familia","grupo","tipo","colecao","sub_colecao","sub_colecao2","cor_nome","cor","estampa","tamanho_numero","tamanho_ref","is_vela_numerica","numero_vela","material","tipo_embalagem","peso_g","altura_cm","largura_cm","profundidade_cm","nome_comercial","nome_completo"].map(s => [s,"Produto"] as [string,string]),
  ["nome_operacional",C],["qtd_kit","Produto"],["material_descritivo","Produto"],["descricao_produto","Produto"],["meta_descricao","Produto"]];
const slugs = V2.map(c => c[0]), donos = V2.map(c => c[1]);
// Ficha without loja_*, grupo_tributario_bling, nome_operacional: those must not break the layout.
const ficha = slugs.filter(s => !s.startsWith("_") && !s.startsWith("loja_") && !["grupo_tributario_bling","nome_operacional","ean","dun"].includes(s)).map(campo => ({ campo, importavel_planilha: true }));
const nc = colunasNaoComparadas(slugs, donos, true);
const LOJAS = new Set(["loja_b2b","loja_site","loja_ml","loja_shopee","loja_tiktok"]);
describe("leitura da planilha v2", () => {
  it("cabeçalho v2 real não quebra por slug desconhecido", () => expect(() => validarSlugs(slugs, ficha, [], nc.ignorar, LOJAS)).not.toThrow());
  it("sem a regra da v2 o slug novo ainda quebraria (a v1 fica igual)", () => expect(() => validarSlugs(slugs, ficha)).toThrow(/slug desconhecido/));
  it("colunas 'Sistema · consulta' nunca são comparadas", () => {
    for (const s of ["_codigo_externo","ean","dun","inner_qtd","grupo_tributario_bling","_fase_sncf","nome_operacional"]) expect(nc.ignorar.has(s)).toBe(true);
    for (const s of ["marca","ncm","cor","nome_comercial"]) expect(nc.ignorar.has(s)).toBe(false);
  });
  it("loja_* deixam de ser ignoradas, sem aviso, e são colunas conhecidas (lojas)", () => {
    for (const s of LOJAS) expect(nc.ignorar.has(s)).toBe(false);
    expect(nc.avisos.some(a => /loja/i.test(a))).toBe(false);
    const r = validarSlugs(slugs, ficha, [], nc.ignorar, LOJAS);
    for (const s of LOJAS) expect(r.colunas_ignoradas).not.toContain(s);
  });
  it("loja fora de loja_dim quebra o layout (fail-loud)", () => expect(() => validarSlugs(slugs, ficha, [], nc.ignorar)).toThrow(/loja_b2b/));
  it("descrição e meta descrição não são comparadas na v2, com aviso único", () => {
    expect(nc.ignorar.has("descricao_produto") && nc.ignorar.has("meta_descricao")).toBe(true);
    expect(nc.avisos.filter(a => a === AVISO_DESCRICAO)).toHaveLength(1);
  });
  it("na v1 a descrição continua comparável", () => expect(colunasNaoComparadas(["cod_cadastro","descricao_produto"], ["Operações","Produto"], false).ignorar.has("descricao_produto")).toBe(false));
  it("colunas da v1 ausentes da v2 não são exigidas nem viram campo apagado", () => {
    const r = validarSlugs(slugs, [...ficha, { campo: "multiplos", importavel_planilha: true }, { campo: "canal_venda", importavel_planilha: true }], [], nc.ignorar, LOJAS);
    expect(r.colunas_ignoradas).not.toContain("multiplos");
  });
  it("código sem cadastro na v2 vai só para nascimento; na v1 segue como sem_cadastro", () => {
    expect(linhaSoNascimento(false, true, "09999")).toBe(true);
    expect(linhaSoNascimento(false, false, "09999")).toBe(false);
    expect(linhaSoNascimento(true, true, "00001")).toBe(false);
  });
});
