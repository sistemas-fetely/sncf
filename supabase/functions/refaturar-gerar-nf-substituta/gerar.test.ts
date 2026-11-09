import { describe, expect, it, vi } from "vitest";
import { BlingHttpError } from "../_shared/bling/bling-client";
import { candidataSubstituta, gerarSubstituta, payloadSubstituta, type DadosSubstituta } from "./gerar";

const d: DadosSubstituta = {
  destinatario: { nome: "Cliente teste", numeroDocumento: "123.456.789-01", tipoPessoa: "F" },
  loja_bling_id: 8, natureza_bling_id: 12, mesma_natureza_original: false,
  itens: [{ sku: "01895", descricao: "Vela", unidade: null, quantidade: 2, valor: 45, ncm: "3406.00.00", origem: 0 }],
  parcelas: [{ data: "2026-11-10", valor: 100, formaPagamento: { id: 3 } }], transporte: { fretePorConta: 0 },
  valor_frete: 10, observacoes: "Correção teste", valor: 100,
};
const nf = { id: 98, numero: "000910", tipo: 1, situacao: 1, contato: d.destinatario, loja: { id: 8 }, valorNota: 100, itens: [{ codigo: "01895", quantidade: 2, valor: 45 }] };
function deps() {
  return {
    bling: { post: vi.fn().mockResolvedValue({ data: { id: 98 } }), get: vi.fn().mockResolvedValue({ data: nf }) },
    registrar: vi.fn().mockResolvedValue({ ok: true }), idsUsados: vi.fn().mockResolvedValue(new Set<number>()),
  };
}
function recuperar(x: ReturnType<typeof deps>, nfs: typeof nf[]) {
  x.bling.get.mockImplementation(async (path: string) => path.includes("?") ? { data: nfs.map((n) => ({ id: n.id, contato: n.contato })) } : { data: nfs.find((n) => path === `/nfe/${n.id}`) });
}
describe("NF substituta", () => {
  it("monta saída normal sem documento referenciado, preservando parcelas/transporte", () => {
    const p = payloadSubstituta(d, new Date("2026-11-09T14:44:00Z"));
    expect(p.tipo).toBe(1); expect(p.finalidade).toBe(1);
    expect(p).not.toHaveProperty("documentoReferenciado");
    expect(p.dataOperacao).toBe("2026-11-09 11:44:00");
    expect(p.parcelas).toEqual(d.parcelas); expect(p.transporte).toEqual({ fretePorConta: 0, frete: 10 });
    expect(p.itens[0]).toMatchObject({ codigo: "01895", unidade: "UN", tipo: "P", classificacaoFiscal: "3406.00.00" });
  });
  it("não acrescenta frete sem cobrança", () => {
    expect(payloadSubstituta({ ...d, valor_frete: 0 }).transporte).not.toHaveProperty("frete");
  });
  it("faz um único POST sem retry e registra rascunho pelo número lido", async () => {
    const x = deps(); const r = await gerarSubstituta(d, x);
    expect(x.bling.post).toHaveBeenCalledTimes(1);
    expect(x.bling.post).toHaveBeenCalledWith("/nfe", expect.objectContaining({ tipo: 1 }), { retry: false });
    expect(x.bling.get).toHaveBeenCalledWith("/nfe/98");
    expect(x.registrar).toHaveBeenCalledWith("rascunho", 98, "000910", null);
    expect(r.bling_nfe_id).toBe(98);
  });
  it("avisa natureza original repetida", async () => {
    const r = await gerarSubstituta({ ...d, mesma_natureza_original: true }, deps());
    expect(r.alertas).toHaveLength(1);
  });
  it("alerta somente quando o valor diverge mais de R$0,02", async () => {
    const x = deps(); x.bling.get.mockResolvedValue({ data: { ...nf, valorNota: 100.02 } });
    expect((await gerarSubstituta(d, x)).alertas).toHaveLength(0);
    x.bling.get.mockResolvedValue({ data: { ...nf, valorNota: 100.03 } });
    expect((await gerarSubstituta(d, x)).alertas).toHaveLength(1);
  });
  it.each([500, 429])("recupera exatamente uma candidata após HTTP %i sem repetir POST", async (status) => {
    const x = deps(); x.bling.post.mockRejectedValue(new BlingHttpError("incerto", status)); recuperar(x, [nf]);
    expect((await gerarSubstituta(d, x)).bling_nfe_id).toBe(98);
    expect(x.bling.post).toHaveBeenCalledTimes(1);
    expect(x.bling.get).toHaveBeenCalledWith("/nfe?tipo=1&situacao=1&pagina=1&limite=100");
  });
  it("recupera timeout", async () => {
    const x = deps(); x.bling.post.mockRejectedValue(new Error("timeout")); recuperar(x, [nf]);
    expect((await gerarSubstituta(d, x)).bling_nfe_id).toBe(98);
  });
  it("recupera duplicidade recusada em 400", async () => {
    const x = deps(); x.bling.post.mockRejectedValue(new BlingHttpError("recusado", 400, "Já existe uma nota fiscal cadastrada")); recuperar(x, [nf]);
    expect((await gerarSubstituta(d, x)).bling_nfe_id).toBe(98);
  });
  it("não reaproveita id já usado", async () => {
    const x = deps(); x.idsUsados.mockResolvedValue(new Set([98])); x.bling.post.mockRejectedValue(new Error("timeout")); recuperar(x, [nf]);
    await expect(gerarSubstituta(d, x)).rejects.toThrow("0 candidata(s)");
    expect(x.registrar).toHaveBeenCalledWith("erro", null, null, expect.any(String));
  });
  it("recusa duas candidatas", async () => {
    const x = deps(); x.bling.post.mockRejectedValue(new Error("timeout")); recuperar(x, [nf, { ...nf, id: 99 }]);
    await expect(gerarSubstituta(d, x)).rejects.toThrow("2 candidata(s)");
  });
  it("erro definitivo registra a mensagem sem procurar NF", async () => {
    const x = deps(); x.bling.post.mockRejectedValue(new BlingHttpError("NCM inválido", 400));
    await expect(gerarSubstituta(d, x)).rejects.toThrow("NCM inválido");
    expect(x.registrar).toHaveBeenCalledWith("erro", null, null, "NCM inválido");
    expect(x.bling.get).not.toHaveBeenCalled();
  });
  it("falha no GET após POST mantém o rascunho conhecido e avisa", async () => {
    const x = deps(); x.bling.get.mockRejectedValue(new Error("GET indisponível"));
    const r = await gerarSubstituta(d, x);
    expect(r.bling_nfe_id).toBe(98); expect(r.alertas).toHaveLength(1);
    expect(x.registrar).toHaveBeenCalledWith("rascunho", 98, null, null);
  });
  it("falha de registro não declara sucesso e preserva id criado", async () => {
    const x = deps(); x.registrar.mockRejectedValue(new Error("banco indisponível"));
    await expect(gerarSubstituta(d, x)).rejects.toThrow("Falha ao registrar o erro");
    expect(x.registrar).toHaveBeenLastCalledWith("erro", 98, "000910", expect.any(String));
  });
  it("candidata exige saída pendente, documento, valor e todos os itens", () => {
    expect(candidataSubstituta(nf, d)).toBe(true);
    for (const patch of [{ tipo: 0 }, { situacao: 6 }, { valorNota: 101 }, { contato: { numeroDocumento: "999" } }, { itens: [{ codigo: "01895", quantidade: 1, valor: 90 }] }, { itens: [...nf.itens, { codigo: "extra", quantidade: 1, valor: 1 }] }]) expect(candidataSubstituta({ ...nf, ...patch }, d)).toBe(false);
  });
});