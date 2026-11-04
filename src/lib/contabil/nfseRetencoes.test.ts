import { describe, expect, it } from "vitest";
import { calcularRetencoes, retencoesDoXml, OBS_SOMADOS, OBS_CONFERIR } from "../../../supabase/functions/_shared/nfse-retencoes";

const abrasf = (bruto: string, ir: string, csll: string) => `<CompNfse><Nfse><InfNfse><Numero>1</Numero><ValoresNfse><ValorLiquidoNfse>${bruto}</ValorLiquidoNfse></ValoresNfse>
<DeclaracaoPrestacaoServico><InfDeclaracaoPrestacaoServico><Servico><Valores><ValorServicos>${bruto}</ValorServicos><ValorPis>0.00</ValorPis><ValorCofins>0.00</ValorCofins>
<ValorInss>0.00</ValorInss><ValorIr>${ir}</ValorIr><ValorCsll>${csll}</ValorCsll></Valores><IssRetido>2</IssRetido></Servico></InfDeclaracaoPrestacaoServico></DeclaracaoPrestacaoServico></InfNfse></Nfse></CompNfse>`;

describe("Retenções NFS-e — regra 4,65% no campo CSLL", () => {
  it("NFS-e 7916 (out/2026): separa 81,38 em PIS 11,38 · COFINS 52,50 · CSLL 17,50", () => {
    const r = retencoesDoXml(abrasf("1750.00", "26.25", "81.38"));
    expect([r.pis, r.cofins, r.csll, r.ir]).toEqual([11.38, 52.5, 17.5, 26.25]);
    expect(r.liquido).toBe(1642.37);
    expect(r.observacoes).toContain(OBS_SOMADOS);
  });
  it("NFS-e 7915 (out/2026): separa 64,40 em PIS 9,00 · COFINS 41,55 · CSLL 13,85", () => {
    const r = retencoesDoXml(abrasf("1385.00", "20.78", "64.40"));
    expect([r.pis, r.cofins, r.csll]).toEqual([9, 41.55, 13.85]);
    expect(r.liquido).toBe(1299.82);
  });
  it("não bate com 4,65% (fora de R$ 0,02): mantém como veio e pede conferência", () => {
    const r = retencoesDoXml(abrasf("1000.00", "15.00", "46.53"));
    expect([r.pis, r.cofins, r.csll]).toEqual([0, 0, 46.53]);
    expect(r.observacoes).toContain(OBS_CONFERIR);
  });
  it("dentro da tolerância de R$ 0,02 ainda separa", () => {
    expect(retencoesDoXml(abrasf("1000.00", "0", "46.52")).observacoes).toContain(OBS_SOMADOS);
  });
  it("sem retenção não entra na planilha", () => {
    expect(retencoesDoXml(abrasf("500.00", "0", "0")).tem_retencao).toBe(false);
  });
  it("INSS 11% identificado pela alíquota", () => {
    const r = calcularRetencoes({ bruto: 1000, ir: 0, pis: 0, cofins: 0, csll: 0, inss: 110, iss_retido: 0, liquido_xml: null });
    expect(r.inss_aliquota).toBe(11);
    expect(r.liquido).toBe(890);
  });
});
