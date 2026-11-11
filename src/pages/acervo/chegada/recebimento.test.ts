import {describe,it,expect} from "vitest";
import {somarTermos,ordenarLinhas,divergente,type LinhaTermo,type TermoResumo} from "./recebimento";
const linha:LinhaTermo={nf_id:"nf",nf_numero:"1",sku:"A",codigo_xpm:null,descricao:null,qtd_declarada:3,qtd_recebida:3,qtd_falta:0,qtd_excesso:0,qtd_nao_conforme:0,rnc:null};
describe("Recebimento",()=>{
 it("soma unidades e tarefas_abertas por termo",()=>{expect(somarTermos([{recebido:10,falta:2,tarefas_abertas:3},{recebido:5,falta:1,tarefas_abertas:4}] as TermoResumo[])).toEqual({termos:2,recebido:15,falta:3,tarefas:7});});
 it.each(["qtd_falta","qtd_excesso","qtd_nao_conforme"])("%s positivo determina divergência",campo=>{expect(divergente({...linha,[campo]:1})).toBe(true);expect(divergente(linha)).toBe(false);});
 it("sem NF é divergência e sobe antes das linhas conformes",()=>{const sem={...linha,sku:"B",nf_id:null};expect(ordenarLinhas([linha,sem]).map(l=>l.sku)).toEqual(["B","A"]);});
});