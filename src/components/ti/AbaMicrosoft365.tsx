import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Save, Plug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { formatError } from "@/lib/format-error";

export function AbaMicrosoft365() {
  const qc=useQueryClient();
  const {permitido}=usePermissaoAcaoOuSuperAdmin("acao.credenciais_integracao.gravar");
  const [config,setConfig]=useState({site:"",arquivo:"",drive_id:"",aba:"cadastro"});
  const [segredos,setSegredos]=useState({tenant_id:"",client_id:"",client_secret:""});
  const [resultado,setResultado]=useState("");
  const q=useQuery({queryKey:["m365-config"],enabled:permitido,queryFn:async()=>{
    const r=await supabase.from("integracoes_config").select("config").eq("sistema","microsoft_365").maybeSingle();if(r.error)throw r.error;return r.data;
  }});
  useEffect(()=>{if(q.data?.config&&typeof q.data.config==="object"&&!Array.isArray(q.data.config))setConfig(v=>({...v,...q.data?.config as typeof v}));},[q.data]);
  const gravar=useMutation({mutationFn:async()=>{const r=await supabase.rpc("fn_catalogo_m365_gravar",{p_config:config,p_segredos:segredos});if(r.error)throw r.error;},onSuccess:async()=>{setSegredos({tenant_id:"",client_id:"",client_secret:""});toast.success("Microsoft 365 salvo no Vault.");await qc.invalidateQueries({queryKey:["m365-config"]});},onError:e=>{setSegredos({tenant_id:"",client_id:"",client_secret:""});toast.error(formatError(e));}});
  const testar=useMutation({mutationFn:async()=>{const r=await supabase.functions.invoke("catalogo-planilha-ler",{body:{acao:"testar"}});if(r.error){const text=r.error instanceof FunctionsHttpError?await r.error.context.text():r.error.message;throw new Error(text);}if(!r.data?.ok)throw new Error(r.data?.erro);return r.data;},onSuccess:r=>{setResultado(r.mensagem);toast.success(r.mensagem);},onError:e=>{setResultado(formatError(e));toast.error(formatError(e));}});
  if(!permitido)return <p className="text-muted-foreground">Sem permissão para credenciais.</p>;
  return <section className="space-y-4">
    <h2 className="text-lg font-semibold">Microsoft 365</h2>
    {q.error&&<Alert variant="destructive"><AlertDescription>{formatError(q.error)}</AlertDescription></Alert>}
    <form autoComplete="off" onSubmit={e=>{e.preventDefault();gravar.mutate();}} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">{([['tenant_id','Tenant ID'],['client_id','Client ID'],['client_secret','Client secret']] as const).map(([k,label])=><div key={k} className="space-y-1"><Label htmlFor={`m365-${k}`}>{label}</Label><Input id={`m365-${k}`} type="password" autoComplete="new-password" value={segredos[k]} placeholder="Manter credencial salva" onChange={e=>setSegredos(v=>({...v,[k]:e.target.value}))}/></div>)}</div>
      <div className="grid gap-4 md:grid-cols-2">{([['site','Site (hostname:/sites/caminho)'],['arquivo','Caminho /nome.xlsx ou ID do arquivo'],['drive_id','ID da biblioteca (opcional)'],['aba','Nome da aba']] as const).map(([k,label])=><div key={k} className="space-y-1"><Label htmlFor={`m365-${k}`}>{label}</Label><Input id={`m365-${k}`} value={config[k]} onChange={e=>setConfig(v=>({...v,[k]:e.target.value}))}/></div>)}</div>
      <div className="flex gap-2"><Button type="submit" disabled={gravar.isPending}><Save className="mr-2 h-4 w-4"/>Salvar</Button><Button type="button" variant="outline" disabled={testar.isPending} onClick={()=>testar.mutate()}><Plug className="mr-2 h-4 w-4"/>Testar conexão</Button></div>
    </form>
    {resultado&&<p role="status" className="break-words text-sm">{resultado}</p>}
  </section>;
}