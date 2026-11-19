import { describe, it, expect } from "vitest";
import { enderecoInicialCliente, enderecoParaCadastro } from "./enderecoClienteVd";

const e = { cep: "01310100", logradouro: "Av Paulista", numero: "1", complemento: "", bairro: "BV", cidade: "São Paulo", uf: "SP" };

describe("endereço do cliente VD", () => {
  it("usa o cadastro quando tem CEP", () => {
    expect(enderecoInicialCliente({ cep: "01310-100", logradouro: "X" }, [{ cep: "22222222" }])?.origem).toBe("cadastro");
  });
  it("cai no último pedido com CEP quando o cadastro não tem", () => {
    const r = enderecoInicialCliente({ cep: null }, [{ cep: "" }, { cep: "22222-222", cidade: "Rio" }]);
    expect(r?.origem).toBe("pedido");
    expect(r?.endereco.cep).toBe("22222222");
  });
  it("fica vazio sem cadastro nem pedido", () => {
    expect(enderecoInicialCliente({ cep: "" }, [])).toBeNull();
  });
  it("nunca sobrescreve cadastro com CEP", () => {
    expect(enderecoParaCadastro("01001000", e)).toBeNull();
  });
  it("exige CEP, logradouro, cidade e UF", () => {
    expect(enderecoParaCadastro(null, { ...e, cidade: "" })).toBeNull();
    expect(enderecoParaCadastro("", e)?.uf).toBe("SP");
  });
});
