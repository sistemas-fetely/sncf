import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
const Body = z.discriminatedUnion("acao", [z.object({ acao: z.literal("pendentes") }).strict(), z.object({ acao: z.literal("confirmar"), ids: z.array(z.string().uuid()).min(1).max(2000), status: z.enum(["aplicada", "descartada", "resolvida"]), escolha: z.enum(["planilha", "sistema"]).default("planilha"), quem: z.string().uuid() }).strict()]);
const json = (b: unknown, status=200) => new Response(JSON.stringify(b),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
Deno.serve(async req => {
 if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
 const sb=createClient(Deno.env.get("SUPABASE_URL")??"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"");
 try {
  const secret=await sb.rpc("get_vault_secret",{p_name:"FOP_INBOUND_TOKEN"});
  const auth=req.headers.get("Authorization");
  if(secret.error||!secret.data||auth!==`Bearer ${secret.data}`) return json({ok:false,erro:"Token entre projetos inválido."},401);
  const body=Body.parse(await req.json());
  if(body.acao==="confirmar") {
   const r=await sb.rpc("fn_catalogo_resolver",{p_ids:body.ids,p_acao:body.status==="aplicada"?"aplicar":body.status==="descartada"?"descartar":"resolver",p_escolha:body.escolha,p_dono:"produto",p_ator:body.quem});
   if(r.error) throw r.error; return json(r.data);
  }
  const ultima=await sb.from("catalogo_planilha_leitura").select("*").eq("ambiente","oficial").in("status",["comparada","aplicada_parcial","aplicada"]).order("lida_em",{ascending:false}).limit(1).maybeSingle();
  if(ultima.error) throw ultima.error;
  if(!ultima.data) return json({ok:true,leitura:null,mudancas:[]});
  const mudancas=[];
  for(let de=0;;de+=1000){const r=await sb.from("catalogo_planilha_mudanca").select("*").eq("leitura_id",ultima.data.id).eq("dono","produto").eq("status","pendente").order("id").range(de,de+999);if(r.error)throw r.error;mudancas.push(...(r.data??[]));if(!r.data||r.data.length<1000)break;}
  return json({ok:true,leitura:ultima.data,mudancas});
 }catch(e){return json({ok:false,erro:e instanceof Error?e.message:String((e as {message?:string}).message??e)},400);}
});