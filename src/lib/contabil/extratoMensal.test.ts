import {describe,it,expect} from "vitest";
import {cobreMes,lerAccountStatement,lerExtratoMensal} from "./extratoMensal";
const transacao = (memo: string, valor: number, dia = "20261030") => `<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>${dia}
<TRNAMT>${valor}
<MEMO>${memo}
</STMTTRN>`;
const ofx = (linhas: string, dataSaldo = "20261112") => {
 const texto = `<OFX><BANKTRANLIST>
<DTSTART>20261001
<DTEND>20261031
${linhas}
</BANKTRANLIST><LEDGERBAL>
<BALAMT>2494.06
<DTASOF>${dataSaldo}
</LEDGERBAL></OFX>`;
 // jsdom não implementa File.text; preserva o conteúdo sintético nesta fixture.
 return Object.assign(new File([texto], "itau.ofx"), {text: async () => texto});
};
describe("extrato oficial mensal",()=>{
 it("exige o mês inteiro e aceita dias além",()=>{expect(cobreMes("2026-09-29","2026-11-01","2026-10-01")).toBe(true);expect(cobreMes("2026-10-02","2026-10-31","2026-10-01")).toBe(false);expect(cobreMes("2026-10-01","2026-10-30","2026-10-01")).toBe(false);});
 it("lê saldos e período do Account Statement de outubro",()=>{expect(lerAccountStatement([["INITIAL_BALANCE","FINAL_BALANCE"],["4.966,91","9.838,63"],["RELEASE_DATE","PARTIAL_BALANCE","TRANSACTION_NET_AMOUNT"],["01-10-2026","5.051,25","84,34"],["31-10-2026","9.838,63","86,57"]])).toEqual({periodo_inicio:"2026-10-01",periodo_fim:"2026-10-31",saldo_inicial:4966.91,saldo_final:9838.63});});
 it("PDF não inventa conferência",async()=>{expect(await lerExtratoMensal(new File(["pdf"],"banco.pdf"),"pdf")).toEqual({periodo_inicio:null,periodo_fim:null,saldo_inicial:null,saldo_final:null});});
 it("recusa settlement como extrato oficial",()=>{expect(()=>lerAccountStatement([["DATE","NET_AMOUNT"]])).toThrow("Cabeçalho Account Statement");});
 it("lê saldos Itaú nas linhas STMTTRN sem somá-las como movimentos", async () => {
   const arquivo = ofx([
     transacao("saldo anterior", 3773.25, "20261001"),
     transacao("PIX RECEBIDO", 500, "20261010"),
     transacao("SALDO TOTAL DISPONÍVEL DIA", 4273.25, "20261010"),
     transacao("PAGAMENTO", -128.24),
     transacao("SALDO TOTAL DISPONÍVEL DIA", 4145.01),
     transacao("SALDO TOTAL DISPONÍVEL DIA", 9999, "20261101"),
   ].join("\n"));
   expect(await lerExtratoMensal(arquivo, "ofx")).toEqual({periodo_inicio:"2026-10-01", periodo_fim:"2026-10-31", saldo_inicial:3773.25, saldo_final:4145.01});
 });
 it("não inventa saldos quando LEDGERBAL é posterior a DTEND e não há linhas de saldo", async () => {
   expect(await lerExtratoMensal(ofx(transacao("PIX RECEBIDO", 500)), "ofx")).toMatchObject({saldo_inicial:null, saldo_final:null});
 });
 it("calcula o final pelo saldo anterior e apenas movimentos reais quando falta saldo final", async () => {
   const linhas = [transacao("SALDO ANTERIOR", 3773.25), transacao("PIX", 500), transacao("PAGAMENTO", -128.24), transacao("SALDO TOTAL DISPONIVEL DIA", 9999, "20261101")].join("\n");
   expect(await lerExtratoMensal(ofx(linhas, "20261031"), "ofx")).toMatchObject({saldo_inicial:3773.25, saldo_final:4145.01});
 });
 it("mantém o cálculo legado com LEDGERBAL dentro do período", async () => {
   expect(await lerExtratoMensal(ofx(transacao("PIX", 500), "20261031"), "ofx")).toMatchObject({saldo_inicial:1994.06, saldo_final:2494.06});
 });
 it("escolhe a maior DTPOSTED e a última linha em empate, mesmo fora de ordem", async () => {
   const linhas = [transacao("SALDO ANTERIOR", 3773.25), transacao("SALDO TOTAL DISPONÍVEL DIA", 4000, "20261030180000"), transacao("SALDO TOTAL DISPONÍVEL DIA", 1, "20261030100000"), transacao("SALDO TOTAL DISPONÍVEL DIA", 4145.01, "20261030180000"), transacao("SALDO TOTAL DISPONÍVEL DIA", 2, "20261029")].join("\n");
   expect(await lerExtratoMensal(ofx(linhas), "ofx")).toMatchObject({saldo_inicial:3773.25, saldo_final:4145.01});
 });
 it("exclui também MEMO que contém SALDO TOTAL DISPONIVEL", async () => {
   const linhas = [transacao("SALDO ANTERIOR", 3773.25), transacao("PIX", 371.76), transacao("POSIÇÃO: SALDO TOTAL DISPONÍVEL", 4145.01)].join("\n");
   expect(await lerExtratoMensal(ofx(linhas), "ofx")).toMatchObject({saldo_inicial:3773.25, saldo_final:4145.01});
 });
});