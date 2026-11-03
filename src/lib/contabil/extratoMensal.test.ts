import {describe,it,expect} from "vitest";
import {cobreMes,lerAccountStatement,lerExtratoMensal} from "./extratoMensal";
describe("extrato oficial mensal",()=>{
 it("exige o mês inteiro e aceita dias além",()=>{expect(cobreMes("2026-09-29","2026-11-01","2026-10-01")).toBe(true);expect(cobreMes("2026-10-02","2026-10-31","2026-10-01")).toBe(false);expect(cobreMes("2026-10-01","2026-10-30","2026-10-01")).toBe(false);});
 it("lê saldos e período do Account Statement de outubro",()=>{expect(lerAccountStatement([["INITIAL_BALANCE","FINAL_BALANCE"],["4.966,91","9.838,63"],["RELEASE_DATE","PARTIAL_BALANCE","TRANSACTION_NET_AMOUNT"],["01-10-2026","5.051,25","84,34"],["31-10-2026","9.838,63","86,57"]])).toEqual({periodo_inicio:"2026-10-01",periodo_fim:"2026-10-31",saldo_inicial:4966.91,saldo_final:9838.63});});
 it("PDF não inventa conferência",async()=>{expect(await lerExtratoMensal(new File(["pdf"],"banco.pdf"),"pdf")).toEqual({periodo_inicio:null,periodo_fim:null,saldo_inicial:null,saldo_final:null});});
 it("recusa settlement como extrato oficial",()=>{expect(()=>lerAccountStatement([["DATE","NET_AMOUNT"]])).toThrow("Cabeçalho Account Statement");});
});