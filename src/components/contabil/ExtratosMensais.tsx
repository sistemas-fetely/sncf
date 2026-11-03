import {useState} from "react";
import {useQuery,useMutation,useQueryClient} from "@tanstack/react-query";
import {Upload,Download,RefreshCw} from "lucide-react";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import {Button} from "@/components/ui/button";
import {Selo} from "@/components/ui/selo";
import {usePermissaoAcao} from "@/hooks/usePermissaoAcao";
import {lerExtratoMensal} from "@/lib/contabil/extratoMensal";
import {nomeSeguro,sha256Hex,baixarOriginalComoArquivo} from "@/lib/contabil/arquivoOriginal";
import {rawMessage} from "@/lib/format-error";

export function useExtratosMensais(competencia: string | null) {
 return useQuery({queryKey:["contabil-extratos-mensais",competencia],enabled:!!competencia,queryFn:async()=>{
  if (!competencia) throw new Error("Selecione uma competência");
  const [contas,extratos,fontes] = await Promise.all([
   supabase.from("contas_bancarias").select("id,nome_exibicao").eq("ativo",true).order("nome_exibicao"),
   supabase.from("contabil_extrato_mensal").select("*").eq("competencia",competencia).order("enviado_em",{ascending:false}),
   supabase.from("extrato_fontes").select("conta_bancaria_id,nome_documento,formato,papel,destino,fonte_codigo").eq("ativo",true).eq("periodicidade","mensal")]);
  for(const r of [contas,extratos,fontes]) if(r.error) throw r.error;
  return (contas.data??[]).map(c=>({...c,extrato:extratos.data?.find(e=>e.conta_bancaria_id===c.id&&e.vigente),automatico:extratos.data?.find(e=>e.conta_bancaria_id===c.id&&e.origem==="api_mp"&&!e.vigente),fonte:fontes.data?.find(f=>f.conta_bancaria_id===c.id && ((f.papel==="extrato" && f.destino==="movimentacoes_bancarias")||(f.papel==="conferencia" && f.destino==="saldo_diario_conta")))}));
 }});
}
const brl=(n:number|null)=> n==null?"—":n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function ExtratosMensais({competencia}:{competencia:string}) {
 const q=useExtratosMensais(competencia),qc=useQueryClient();
 const {permitido}=usePermissaoAcao("acao.contabil_extrato_mensal.enviar");
 const {permitido:podeGerar}=usePermissaoAcao("acao.contabil_extrato_mensal.gerar");
 const gerarAutomatico=useMutation({mutationFn:async()=>{
  const {data,error}=await supabase.functions.invoke("mp-relatorios",{body:{acao:"mensal",competencia}});
  if(error){const ctx=(error as {context?:Response}).context;const body=ctx?await ctx.json().catch(()=>null):null;throw new Error(body?.erro??error.message);}
  if(!data?.ok)throw new Error(data?.erro??"Falha ao gerar extrato mensal");return data;
 },onSuccess:async(r)=>{await qc.invalidateQueries({queryKey:["contabil-extratos-mensais"]});toast.success(r.aguardando?"Relatório solicitado — aguardando Mercado Pago":r.vigente===false?"Extrato automático disponível; enviado à mão preservado":"Extrato automático guardado");},onError:e=>toast.error(rawMessage(e),{duration:Infinity,closeButton:true})});
 const [alvo,setAlvo]=useState<string|null>(null);
 const upload=useMutation({mutationFn:async({file,conta}:{file:File;conta:string})=>{
  const formato=file.name.split(".").pop()?.toLowerCase();
  const fonte=q.data?.find(c=>c.id===conta)?.fonte;
  if(formato!=="pdf" && formato!==fonte?.formato) throw new Error("Envie o extrato oficial desta conta ou PDF do banco");
  if(formato!=="pdf" && formato!=="ofx" && formato!=="xlsx") throw new Error("Formato não aceito");
  const leitura=await lerExtratoMensal(file,formato);
  const hash=await sha256Hex(await file.arrayBuffer());
  const path=`bancos/${competencia.slice(0,7)}/extrato_mensal/${conta}/${crypto.randomUUID()}-${nomeSeguro(file.name)}`;
  const {error:up}=await supabase.storage.from("contabil").upload(path,file,{upsert:false}); if(up) throw up;
  const {error}=await supabase.rpc("fn_contabil_extrato_mensal_guardar",{p_competencia:competencia,p_conta:conta,p_storage_path:path,p_nome:file.name,p_formato:formato,p_sha256:hash,p_bytes:file.size,p_periodo_inicio:leitura.periodo_inicio??undefined,p_periodo_fim:leitura.periodo_fim??undefined,p_saldo_inicial:leitura.saldo_inicial??undefined,p_saldo_final:leitura.saldo_final??undefined});
  if(error) throw new Error(`Arquivo guardado, mas registro falhou: ${error.message}`);
 },onSuccess:async()=>{await qc.invalidateQueries({queryKey:["contabil-extratos-mensais"]});toast.success("Extrato mensal guardado");},onError:e=>toast.error(rawMessage(e),{duration:Infinity,closeButton:true})});
 async function baixar(path:string,nome:string){try{const file=await baixarOriginalComoArquivo(path,nome);const url=URL.createObjectURL(file);const a=document.createElement("a");a.href=url;a.download=nome;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){toast.error(rawMessage(e));}}
 return <section className="space-y-3" aria-label="Extratos do mês"><h2 className="text-sm font-medium">Extratos do mês</h2>
 {q.error?<p className="text-sm text-destructive">{rawMessage(q.error)}</p>:q.isLoading?<p className="text-sm text-muted-foreground">Carregando extratos…</p>:<div className="grid gap-3 lg:grid-cols-3">{q.data?.map(c=>{
  const e=c.extrato;const conf=e?.conferencia as {avisos?:string[];diferenca_inicial?:number|null;diferenca_final?:number|null}|undefined;const avisos=conf?.avisos??[];
  return <article key={c.id} aria-label={c.nome_exibicao??c.id} className="min-w-0 rounded-lg border bg-card p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium text-sm">{c.nome_exibicao}</h3><Selo estado={!e||avisos.length?"warning":"success"}>{!e?"Falta":avisos.length?"Guardado com aviso":"Guardado ✓"}</Selo></div>
  <p className="mt-2 text-xs text-muted-foreground">{c.fonte?.nome_documento??"Extrato oficial"} · {c.fonte?.formato?.toUpperCase()} / PDF</p>
  {e&&<p className="mt-1 text-xs text-muted-foreground">{e.origem==="api_mp"?"Automático":"Enviado à mão"}</p>}
  {c.automatico&&<div className="mt-2 text-xs text-info"><p>Há um extrato automático disponível</p><Button variant="ghost" size="sm" onClick={()=>baixar(c.automatico.storage_path,c.automatico.nome_arquivo)}>Baixar automático</Button></div>}
  {c.fonte?.fonte_codigo==="mp_account_statement"&&<Button variant="outline" size="sm" className="mt-3" disabled={!podeGerar||gerarAutomatico.isPending} onClick={()=>gerarAutomatico.mutate()}><RefreshCw className="mr-1.5 h-4 w-4"/>{gerarAutomatico.isPending?"Aguardando MP…":"Gerar agora"}</Button>}
  {e&&<><p className="mt-2 break-all text-xs">{e.nome_arquivo}</p><p className="mt-1 text-xs text-muted-foreground">{e.periodo_inicio??"—"} a {e.periodo_fim??"—"}</p><div className="mt-3 overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-muted-foreground"><th className="text-left font-normal">Saldo</th><th className="text-right font-normal">Arquivo</th><th className="text-right font-normal">SNCF</th></tr></thead><tbody><tr><td>Inicial</td><td className="text-right tabular-nums">{brl(e.saldo_inicial)}</td><td className="text-right tabular-nums">{brl(e.saldo_inicial_sncf)}</td></tr><tr><td>Final</td><td className="text-right tabular-nums">{brl(e.saldo_final)}</td><td className="text-right tabular-nums">{brl(e.saldo_final_sncf)}</td></tr></tbody></table></div><p className="mt-2 text-xs">Diferença inicial {brl(conf?.diferenca_inicial??null)} · final {brl(conf?.diferenca_final??null)}</p>{avisos.map(a=><p key={a} className="mt-1 text-xs text-warning">{a}</p>)}</>}
  <div className="mt-4 flex gap-2"><Button variant="outline" size="sm" disabled={!permitido||upload.isPending} onClick={()=>{setAlvo(c.id);document.getElementById(`extrato-${c.id}`)?.click();}}><Upload className="mr-1.5 h-4 w-4"/>{upload.isPending&&alvo===c.id?"Guardando…":e?"Substituir":"Enviar"}</Button><input id={`extrato-${c.id}`} aria-label={`Enviar extrato ${c.nome_exibicao}`} type="file" className="hidden" accept={`.${c.fonte?.formato??"ofx"},.pdf`} onChange={ev=>{const file=ev.target.files?.[0];if(file)upload.mutate({file,conta:c.id});ev.target.value="";}}/>{e&&<Button variant="ghost" size="sm" onClick={()=>baixar(e.storage_path,e.nome_arquivo)}><Download className="mr-1.5 h-4 w-4"/>Baixar</Button>}</div></article>;
 })}</div>}</section>;
}