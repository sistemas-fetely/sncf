import {lerCsvMp} from "../_shared/financeiro/mp/release.ts";

export function janelaMensal(comp: string) {
 if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(comp)) throw new Error("Competência inválida (AAAA-MM-01)");
 const fim=new Date(Date.UTC(Number(comp.slice(0,4)),Number(comp.slice(5,7)),0)).toISOString().slice(0,10);
 return {inicio:comp,fim,begin_date:`${comp}T00:00:00-03:00`,end_date:`${fim}T23:59:59-03:00`};
}
export function lerReleaseMensal(text: string,inicio: string,fim: string) {
 const rows=lerCsvMp(text),h=rows[0]?.map(x=>String(x).trim().toUpperCase())??[];
 const tipo=h.indexOf("RECORD_TYPE"),saldo=h.indexOf("BALANCE_AMOUNT"),credito=h.indexOf("NET_CREDIT_AMOUNT"),debito=h.indexOf("NET_DEBIT_AMOUNT"),date=h.indexOf("DATE");
 if ([tipo,saldo,credito,debito,date].some(i=>i<0)) throw new Error("Release mensal sem colunas de saldo obrigatórias");
 const n=(x:unknown)=>{const v=Number(String(x??"").replace(",","."));if(!Number.isFinite(v))throw new Error("Saldo MP inválido");return v;};
 const inicial=rows.find(r=>r[tipo]==="initial_available_balance");
 if(!inicial)throw new Error("Release mensal sem saldo inicial");
 const releases=rows.filter(r=>r[tipo]==="release");
 const final=rows.find(r=>r[tipo]==="final_available_balance");
 const si=n(inicial[saldo]);
 const sf=final?n(final[saldo]):Math.round((si+releases.reduce((a,r)=>a+n(r[credito])-n(r[debito]),0))*100)/100;
 return {periodo_inicio:inicio,periodo_fim:fim,saldo_inicial:si,saldo_final:sf,linhas:releases.length};
}
export function automaticoVigente(origemVigente:string|null) {return origemVigente!=="manual";}