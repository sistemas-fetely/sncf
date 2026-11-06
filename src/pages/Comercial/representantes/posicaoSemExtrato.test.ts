import { describe, expect, it } from "vitest";
import { acaoEmailPosicao, quemRecebePosicao } from "./posicaoSemExtrato";
import { assuntoPosicao, linhasPosicao, montarHtmlPosicao } from "../../../../supabase/functions/enviar-posicao-comissao/email";

const viva = (id: string, nome: string) => ({ vendedor_id: id, representante: nome, email_contato: "a@b.c", carteira_total: 100, em_atraso: 0, em_atraso_qtd: 0 });

describe("quem recebe posição", () => {
  it("exclui quem tem extrato com valor e marca enviados", () => {
    const r = quemRecebePosicao([viva("1", "Bia"), viva("2", "Ana"), viva("3", "Caio")],
      [{ vendedor_id: "1", valor_total: 50 }, { vendedor_id: "3", valor_total: 0 }],
      [{ vendedor_id: "3", enviado_em: "2026-11-05T10:00:00Z" }]);
    expect(r.map((x) => x.vendedor_id)).toEqual(["2", "3"]);
    expect(r[1].enviado_em).toBe("2026-11-05T10:00:00Z");
    expect(r[0].enviado_em).toBeNull();
  });
});

describe("ação de e-mail da posição", () => {
  it("sem envio na competência: enviar sem force", () => {
    expect(acaoEmailPosicao(null)).toEqual({ rotulo: "Enviar e-mail", force: false, toast: "E-mail enviado." });
  });
  it("com envio na competência: reenviar com force", () => {
    expect(acaoEmailPosicao("2026-11-05T10:00:00Z")).toEqual({ rotulo: "Reenviar e-mail", force: true, toast: "E-mail reenviado." });
  });
});

describe("e-mail da posição", () => {
  it("assunto usa a competência apurada", () => expect(assuntoPosicao("2026-11-01")).toBe("Fetély · Posição de comissões 10/2026"));
  it("linhas zeradas somem", () => {
    const l = linhasPosicao({ a_vencer: 200, a_vencer_qtd: 3, proximo_vencimento: "2026-11-20", em_atraso: 0, aguardando_extrato: 0, complementos: 0 });
    expect(l).toHaveLength(1);
    expect(l[0].rotulo).toBe("A vencer (3 parcelas · próxima 20/11)");
  });
  it("atraso em vermelho e sem pedido de NF", () => {
    const h = montarHtmlPosicao("ana souza", "2026-11-01", { carteira_total: 300, em_atraso: 80, em_atraso_qtd: 2 }, "https://x", "20/11");
    expect(h).toContain("color:#b91c1c\">Em atraso do cliente (2)");
    expect(h).toContain("Olá, Ana.");
    expect(h).not.toContain("Enviar minha nota fiscal");
    expect(h).not.toContain("A vencer");
  });
});
