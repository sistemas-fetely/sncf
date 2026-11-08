import { describe, expect, it } from "vitest";
import { compararCelula, validarSlugs, normalizarCodigo, normalizarValor, donoCampo, somenteLeitura, tiposColunasProduto } from "../../../supabase/functions/_shared/catalogo-planilha/comparacao";
const cabecalhoOficial = "cod_cadastro, sku, ean, dun, inner_qtd, marca, fase, _fase_sncf, _ativo, canal_venda, departamento, categoria, linha, familia, grupo, tipo, colecao, sub_colecao, sub_colecao2, cor_nome, cor, estampa, tamanho_numero, tamanho_ref, is_vela_numerica, numero_vela, nome_comercial, nome_completo, nome_operacional, _tem_descricao, _tem_meta_descricao, multiplos, qtd_kit, material_descritivo, material, tipo_embalagem, peso_g, altura_cm, largura_cm, profundidade_cm, ncm, cest, origem_fisc, origem_prod, grupo_tributario_bling".split(", ");
const fichaOficial = cabecalhoOficial.filter(c => !c.startsWith("_") && c !== "grupo_tributario_bling").map(campo => ({ campo, importavel_planilha: true }));
describe("catálogo diário — comparação de três vias", () => {
  it.each(["Sim", "S", "true", "1", "verdadeiro", " SIM ", "TrUe"])("booleano verdadeiro equivalente: %s", valor => {
    expect(compararCelula("true", valor, true, "boolean")).toBeNull();
    expect(normalizarValor(valor, "boolean")).toBe("true");
  });
  it.each(["Não", "N", "false", "0", "falso", " NÃO ", "FaLsE"])("booleano falso equivalente: %s", valor => {
    expect(compararCelula("false", valor, false, "boolean")).toBeNull();
    expect(normalizarValor(valor, "boolean")).toBe("false");
  });
  it.each(["numeric", "integer", "bigint", "smallint"])("números equivalentes pelo tipo %s", tipo => {
    for (const valor of ["6", "6.0", "6,0", "006.000", 6]) {
      expect(compararCelula("6", valor, "6.0", tipo)).toBeNull();
      expect(normalizarValor(valor, tipo)).toBe("6");
    }
  });
  it("ignora espaços repetidos e nas pontas", () => expect(compararCelula("Produto azul", "  Produto   azul  ", "Produto azul")).toBeNull());
  it("não converte texto numérico ou Sim em campos de texto", () => {
    expect(normalizarValor("006.0", "text")).toBe("006.0");
    expect(normalizarValor("Sim", "text")).toBe("Sim");
    expect(compararCelula("6", "6.0", "6", "text")).toBe("mudanca");
  });
  it("mudança booleana real conserva valores canônicos", () => {
    expect(compararCelula(false, "Sim", false, "boolean")).toBe("mudanca");
    expect(normalizarValor("Sim", "boolean")).toBe("true");
  });
  it("normaliza decimais sem perder precisão", () => {
    expect(normalizarValor("9007199254740993.12000", "numeric")).toBe("9007199254740993.12");
    expect(normalizarValor("-0,000", "numeric")).toBe("0");
    expect(normalizarValor("6e-2", "numeric")).toBe("0.06");
  });
  it("falha explicitamente para valor incompatível com o tipo", () => {
    expect(() => normalizarValor("talvez", "boolean")).toThrow("booleano inválido");
    expect(() => normalizarValor("seis", "numeric")).toThrow("numérico inválido");
  });
  it("obtém tipos do esquema sem lista de campos", () => {
    const tipos = tiposColunasProduto({ definitions: { sncf_produtos: { properties: {
      campo_booleano_novo: { type: "boolean", format: "boolean" },
      campo_numero_novo: { type: "number", format: "numeric" },
      campo_inteiro_novo: { type: "integer", format: "integer" },
    } } } });
    expect(compararCelula(true, "Sim", true, tipos.campo_booleano_novo)).toBeNull();
    expect(compararCelula(6, "6,0", 6, tipos.campo_numero_novo)).toBeNull();
    expect(compararCelula(6, "6.0", 6, tipos.campo_inteiro_novo)).toBeNull();
    expect(() => tiposColunasProduto({})).toThrow("Metadados");
  });
  it("mudança quando sistema continua na base", () => expect(compararCelula("A", "B", "A")).toBe("mudanca"));
  it("conflito quando ambos mudaram diferentemente", () => expect(compararCelula("A", "B", "C")).toBe("conflito"));
  it("já igual não precisa aplicação", () => expect(compararCelula("A", "B", "B")).toBe("ja_igual"));
  it("base aplicada é a referência, não a leitura anterior", () => expect(compararCelula("A", "B", "A")).toBe("mudanca"));
  it("vazio/apagado nunca mexe", () => { expect(compararCelula("A", "", "C")).toBeNull(); expect(compararCelula("A", null, "C")).toBeNull(); });
  it("planilha igual à base não altera sistema", () => expect(compararCelula("A", "A", "C")).toBeNull());
  it("código numérico mantém cinco casas", () => expect(normalizarCodigo(123)).toBe("00123"));
  it("layout exige cod_cadastro na linha 3", () => expect(() => validarSlugs(["ncm"], [{ campo: "ncm" }])).toThrow("sem cod_cadastro"));
  it("layout rejeita slug desconhecido", () => expect(() => validarSlugs(["cod_cadastro", "nao_existe"], [])).toThrow("desconhecido"));
  it("aceita o cabeçalho oficial e registra grupo_tributario_bling como ignorado", () => {
    const layout = validarSlugs(cabecalhoOficial, fichaOficial, ["grupo_tributario_bling"]);
    expect(layout.colunas_ignoradas).toEqual(["cod_cadastro", "sku", "ean", "dun", "fase", "_fase_sncf", "_ativo", "_tem_descricao", "_tem_meta_descricao", "grupo_tributario_bling"]);
  });
  it("rejeita slug inventado no cabeçalho oficial", () => expect(() => validarSlugs([...cabecalhoOficial, "campo_inventado"], fichaOficial, ["grupo_tributario_bling"])).toThrow("slug desconhecido campo_inventado"));
  it("qualquer prefixo _ é somente leitura mesmo se importável na ficha", () => {
    expect(somenteLeitura("_informacao_nova")).toBe(true);
    expect(somenteLeitura("ncm")).toBe(false);
    expect(validarSlugs(["cod_cadastro", "_informacao_nova"], [{ campo: "_informacao_nova", importavel_planilha: true }]).colunas_ignoradas).toContain("_informacao_nova");
  });
  it("coluna do produto ausente da ficha é ignorada, não ganha permissão de escrita", () => expect(validarSlugs(["cod_cadastro", "coluna_existente"], [], ["coluna_existente"]).colunas_ignoradas).toContain("coluna_existente"));
  it("slug duplicado continua inválido", () => expect(() => validarSlugs(["cod_cadastro", "ncm", "ncm"], [{ campo: "ncm" }])).toThrow("slug duplicado ncm"));
  it("coluna informativa duplicada também é inválida", () => expect(() => validarSlugs(["cod_cadastro", "_fase_sncf", "_fase_sncf"], [])).toThrow("slug duplicado _fase_sncf"));
  it("fase e ativo conhecidos nunca são importáveis", () => expect(() => validarSlugs(["cod_cadastro", "fase", "ativo"], [])).not.toThrow());
  it("Operações só recebe quatro campos fiscais da matriz", () => { expect(donoCampo({campo:"ncm",onde_resolver:"SNCF"})).toBe("operacoes"); expect(donoCampo({campo:"peso_g",onde_resolver:"FOP"})).toBe("produto"); expect(donoCampo({campo:"multiplos",onde_resolver:"SNCF"})).toBe("produto"); });
});