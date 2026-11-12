import { gerarResumoCtePdf, linhasResumoCte } from "./cte-resumo-pdf.ts";
const assert = (v: boolean, m: string) => { if (!v) throw new Error(m); };
Deno.test("CT-e real do storage: chave, prestação, carga, referências e PDF", async () => {
  const path = Deno.env.get("CTE_XML_TEST_PATH") ?? new URL("./fixtures/cte-real-anonimizado.xml", import.meta.url);
  const xml = await Deno.readTextFile(path);
  const linhas = linhasResumoCte(xml).join("\n");
  assert(linhas.includes("42261006225952000190570010031333361314451964"), "chave real ausente");
  assert(linhas.includes("3133336/1"), "número/série real ausente");
  assert(linhas.includes("243,41"), "valor real da prestação ausente");
  assert(linhas.includes("2.393,13"), "valor real da carga ausente");
  assert(linhas.includes("42261063591078000229550010000007521904550732"), "NF-e real referenciada ausente");
  assert(linhas.includes("NF-e REFERENCIADAS"), "referências ausentes");
  const pdf = await gerarResumoCtePdf(xml);
  assert(new TextDecoder().decode(pdf.slice(0, 5)) === "%PDF-", "PDF inválido");
});
Deno.test("CT-e tolera namespace e campos opcionais ausentes", async () => {
  const xml = '<c:CTe xmlns:c="urn:cte"><c:infCte Id="CTe123"><c:ide><c:nCT>7</c:nCT></c:ide></c:infCte></c:CTe>';
  assert(linhasResumoCte(xml).some(l => l.includes("7/-")), "namespace não resolvido");
  assert((await gerarResumoCtePdf(xml)).length > 500, "PDF vazio");
});
