import { selecionarContas, corpoConfiguracao, type ContaMp } from "./contas.ts";
import { classificarRelease, normalizarMpRelease, type MpLiberacao } from "../_shared/financeiro/mp/release.ts";
const check=(x:boolean)=>{if(!x)throw new Error("Resultado divergente");};
const regra={regra_atribuicao:"marketplace_ml",classe_recebivel:"recebivel_marketplace"} as const;
const linha=(descricao_mp:string,valor_liquido:number):MpLiberacao=>({descricao_mp,descricao:descricao_mp,valor_liquido,meio_pagamento:"Pix",conta_destino:"123",data_liberacao:"2026-11-18",id_operacao:"123",codigo_referencia:"ref",saldo_apos:0,origem:"mp_reserve_release"});
Deno.test("marketplace payment positivo recebe classe marketplace e regra_p1",()=>{
 const l=normalizarMpRelease([["RECORD_TYPE","DESCRIPTION","NET_CREDIT_AMOUNT","NET_DEBIT_AMOUNT","EXTERNAL_REFERENCE"],["release","payment","50","0","pedido-1"]])[0];
 const r=classificarRelease(l,regra);check(r.classe==="recebivel_marketplace"&&r.classe_definida_por==="regra_p1"&&l.codigo_referencia==="pedido-1");
});
Deno.test("marketplace tarifa mantém descrição e classe null",()=>{const r=classificarRelease(linha("shipping_fee",-5),regra);check(r.classe===null&&r.descricao==="MP SHIPPING_FEE"&&r.tipo_meio==="outro");});
Deno.test("marketplace saque continua transferência",()=>{const r=classificarRelease(linha("Saque",-50),regra);check(r.classe===null&&r.tipo_meio==="transferencia"&&r.descricao==="MP SAQUE PARA CONTA 123");});
Deno.test("marketplace pagamento negativo não é recebível",()=>check(classificarRelease(linha("Pagamento",-1),regra).classe===null));
Deno.test("Shopify mantém comportamento anterior inclusive descrições não saque",()=>{const r=classificarRelease(linha("shipping_fee",-5));check(r.classe==="recebivel_b2c"&&r.descricao==="MP PAGAMENTO PIX"&&r.tipo_meio==="pix");});
Deno.test("cron sem conta exclui Meli inativa e manual default é Shopify",()=>{const contas=[{codigo:"MP-SHOPIFY",ativo:true},{codigo:"MP-MELI",ativo:false}] as ContaMp[];check(selecionarContas(contas,true).length===1&&selecionarContas(contas,true)[0].codigo==="MP-SHOPIFY");check(selecionarContas(contas,false)[0].codigo==="MP-SHOPIFY");check(selecionarContas(contas,false,"MP-MELI")[0].codigo==="MP-MELI");});
Deno.test("config copia somente campos documentados, timezone e scheduled",()=>{const r=corpoConfiguracao({columns:[{key:"SOURCE_ID"}],file_name_prefix:"report",scheduled:true,separator:";",display_timezone:"GMT-04",sftp_info:{password:"não copiar"}});check(r.display_timezone==="GMT-03"&&r.scheduled===true&&r.separator===";"&&r.sftp_info===undefined);});
Deno.test("config daily remove value/format legado e alias vazio, preserva idioma",()=>{
 const r=corpoConfiguracao({columns:[{key:"SOURCE_ID",alias:""}],file_name_prefix:"report",frequency:{hour:0,type:"daily",value:"0",format:"XLSX"},report_language:"pt"});
 const f=r.frequency as Record<string,unknown>;check(f.type==="daily"&&f.hour===0&&f.value===undefined&&f.format===undefined&&r.report_translation==="pt");
 check((r.columns as Record<string,unknown>[])[0].alias===undefined&&r.execute_after_withdrawal===false);
});