import { describe, expect, it } from "vitest";
import { argsEscolhaCdVD } from "./escolherCdVD";
import { bodyCorreiosSC, chaveOpcaoVD, opcoesCorreiosSC, ordenarOpcoesVD, podeCotarCorreiosSC, type PlanoCorreiosSC } from "./correiosScVD";

const plano: PlanoCorreiosSC = { ok: true, situacao: "elegivel", transportadora_id: "correios", cep_origem: "89160000", cep_destino: "01001000",
  n_volumes: 2, volume: { peso_g: 1250, comprimento_cm: 30, largura_cm: 20, altura_cm: 15 } };
const precos = [{ servico: "SEDEX", preco: 48.25, prazo_dias: 2 }, { servico: "PAC", preco: 31.5, prazo_dias: 5 }];
describe("Correios na saída SC", () => {
  it("cota elegível e improvável, nunca inelegível ou plano recusado", () => {
    expect(podeCotarCorreiosSC(plano)).toBe(true);
    expect(podeCotarCorreiosSC({ ...plano, situacao: "improvavel" })).toBe(true);
    expect(podeCotarCorreiosSC({ ...plano, situacao: "inelegivel" })).toBe(false);
    expect(podeCotarCorreiosSC({ ...plano, ok: false })).toBe(false);
  });
  it("envia volumes e quantidade do plano sem registrar cotação", () => {
    expect(bodyCorreiosSC(plano)).toEqual({ cep_origem: "89160000", cep_destino: "01001000",
      volumes: [{ peso_g: 1250, comprimento_cm: 30, largura_cm: 20, altura_cm: 15, quantidade: 2 }] });
  });
  it("mantém PAC e SEDEX separados mesmo compartilhando o id Correios", () => {
    const { opcoes } = opcoesCorreiosSC(plano, precos);
    expect(opcoes.map(chaveOpcaoVD)).toEqual(["correios:SEDEX", "correios:PAC"]);
    expect(opcoes.map((o) => o.nome)).toEqual(["Correios · SEDEX", "Correios · PAC"]);
  });
  it("ordena todas as opções por preço sem modificar a recomendação original", () => {
    const recomendada = { transportadora_id: "icaro", nome: "Ícaro", valor: 35.49, prazo_dias: 3 };
    const originais = [recomendada, ...opcoesCorreiosSC(plano, precos).opcoes];
    expect(ordenarOpcoesVD(originais).map((o) => o.valor)).toEqual([31.5, 35.49, 48.25]);
    expect(originais[0]).toBe(recomendada);
  });
  it("preserva preço e motivo curto quando o plano é improvável", () => {
    const { opcoes } = opcoesCorreiosSC({ ...plano, situacao: "improvavel", motivo: "Volume perto do limite" }, precos);
    expect(opcoes[0]).toMatchObject({ valor: 48.25, aviso: "Volume perto do limite" });
  });
  it("isola cotação com erro e mantém o outro serviço disponível", () => {
    const resultado = opcoesCorreiosSC(plano, [{ ...precos[0], erro: "Preço indisponível" }, precos[1]]);
    expect(resultado.opcoes.map((o) => o.servico)).toEqual(["PAC"]);
    expect(resultado.erro).toBe("Preço indisponível");
  });
  it("não converte preço ausente em zero", () => {
    expect(opcoesCorreiosSC(plano, [{ servico: "PAC", preco: null, prazo_dias: 5 }]).opcoes).toEqual([]);
  });
  it.each(["SEDEX", "PAC"] as const)("confirma %s com preço e id Correios", (servico) => {
    const opcao = opcoesCorreiosSC(plano, precos).opcoes.find((o) => o.servico === servico);
    expect(opcao).toBeDefined();
    expect(argsEscolhaCdVD("pedido", "XPM-SC", "", opcao?.transportadora_id ?? null, opcao)).toMatchObject({
      p_transportadora_id: "correios", p_frete_estimado: servico === "SEDEX" ? 48.25 : 31.5, p_servico: servico,
    });
  });
  it("envia também o valor da transportadora convencional, sem serviço Correios", () => {
    expect(argsEscolhaCdVD("pedido", "XPM-SC", "", "icaro", { valor: 35.49 })).toMatchObject({
      p_transportadora_id: "icaro", p_frete_estimado: 35.49, p_servico: null,
    });
  });
  it("não envia preço nem serviço na escolha SP", () => {
    expect(argsEscolhaCdVD("pedido", "SITE-SP", "", "correios", { valor: 31.5, servico: "PAC" })).toEqual({
      p_pedido_id: "pedido", p_centro_codigo: "SITE-SP", p_motivo: null, p_transportadora_id: null,
    });
  });
});