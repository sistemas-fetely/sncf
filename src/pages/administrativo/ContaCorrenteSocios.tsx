import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEstadoTela, useFocoAoVoltar, useRestaurarScroll } from "@/lib/navegacao";
import { formatBRL } from "@/lib/format-currency";
import { rawMessage } from "@/lib/format-error";
import type { Tables } from "@/integrations/supabase/types";
import { usePermissaoAcao } from "@/hooks/usePermissaoAcao";

const dataPt = (v: string | null) => v ? new Date(`${v.slice(0,10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";
type Saldo = Tables<"vw_socio_conta_corrente">;
type Acerto = Tables<"socio_acerto">;

function AcertoAberto({ acerto }: { acerto: Acerto }) {
  const podeConfirmar=usePermissaoAcao("acao.socio_acerto.confirmar");
  const podeCancelar=usePermissaoAcao("acao.socio_acerto.cancelar");
  const qc = useQueryClient();
  const [data, setData] = useState(new Date().toISOString().slice(0,10));
  const [nsu, setNsu] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [motivo, setMotivo] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const confirmar = useMutation({ mutationFn: async () => {
    if(!podeConfirmar.permitido)throw new Error("Sem permissão para confirmar acerto");
    let path: string | undefined;
    if (arquivo) {
      path = `socio-acerto/${acerto.id}/${crypto.randomUUID()}.${arquivo.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g,"") || "bin"}`;
      const { error } = await supabase.storage.from("comprovantes-pagamento").upload(path,arquivo);
      if(error) throw error;
    }
    const { error } = await supabase.rpc("socio_acerto_confirmar",{p_acerto_id:acerto.id,p_data_pagamento:data,...(nsu.trim() ? {p_nsu:nsu.trim()} : {}),...(path ? {p_comprovante_path:path} : {})});
    if(error) throw error;
  }, onSuccess:async()=>{toast.success("Pagamento confirmado");await qc.invalidateQueries();},onError:e=>toast.error(rawMessage(e)) });
  const cancelar = useMutation({ mutationFn: async()=>{
    if(!podeCancelar.permitido)throw new Error("Sem permissão para cancelar acerto");
    const {error}=await supabase.rpc("socio_acerto_cancelar",{p_acerto_id:acerto.id,p_motivo:motivo.trim()});if(error)throw error;
  },onSuccess:async()=>{toast.success("Acerto cancelado");await qc.invalidateQueries();},onError:e=>toast.error(rawMessage(e)) });
  return <div className="space-y-3 border-t pt-3">
    {acerto.pix_payload && <div className="space-y-2"><Textarea readOnly aria-label="PIX copia-e-cola" value={acerto.pix_payload} /><Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(acerto.pix_payload ?? "");toast.success("PIX copiado");}catch(e){toast.error(rawMessage(e));}}}><Copy />Copiar PIX</Button></div>}
    <Label htmlFor={`data-${acerto.id}`}>Data do pagamento</Label><Input id={`data-${acerto.id}`} type="date" value={data} onChange={e=>setData(e.target.value)} />
    {acerto.meio === "cartao" && <><Label htmlFor={`nsu-${acerto.id}`}>NSU</Label><Input id={`nsu-${acerto.id}`} value={nsu} onChange={e=>setNsu(e.target.value)} /></>}
    <Label htmlFor={`file-${acerto.id}`}>Comprovante</Label><Input id={`file-${acerto.id}`} type="file" accept="image/*,application/pdf" onChange={e=>setArquivo(e.target.files?.[0] ?? null)} />
    <div className="flex flex-wrap gap-2"><Button disabled={!podeConfirmar.permitido || confirmar.isPending || cancelar.isPending || !data} onClick={()=>confirmar.mutate()}>Confirmar pagamento</Button><Button variant="outline" disabled={!podeCancelar.permitido || confirmar.isPending || cancelar.isPending} onClick={()=>setCancelando(!cancelando)}>Cancelar</Button></div>
    {cancelando && <div className="space-y-2"><Label htmlFor={`motivo-${acerto.id}`}>Motivo do cancelamento</Label><Textarea id={`motivo-${acerto.id}`} value={motivo} onChange={e=>setMotivo(e.target.value)} /><Button variant="destructive" disabled={!podeCancelar.permitido || !motivo.trim() || cancelar.isPending} onClick={()=>cancelar.mutate()}>Cancelar acerto</Button></div>}
  </div>;
}

function GavetaSocio({ socio }: { socio: Saldo }) {
  const podeGerar=usePermissaoAcao("acao.socio_acerto.gerar");
  const qc=useQueryClient();
  const [valor,setValor]=useState(String(socio.saldo_devedor ?? 0));
  const [meio,setMeio]=useState("pix");
  const [observacao,setObservacao]=useState("");
  const [pix,setPix]=useState("");
  const extrato=useQuery({queryKey:["socios","extrato",socio.parceiro_id],queryFn:async()=>{
    const {data,error}=await supabase.from("vw_socio_conta_corrente_extrato").select("*").eq("parceiro_id",socio.parceiro_id ?? "").order("data",{ascending:false});if(error)throw error;return data;
  }});
  const acertos=useQuery({queryKey:["socios","acertos",socio.parceiro_id],queryFn:async()=>{
    const {data,error}=await supabase.from("socio_acerto").select("*").eq("parceiro_id",socio.parceiro_id ?? "").order("criado_em",{ascending:false});if(error)throw error;return data;
  }});
  const gerar=useMutation({mutationFn:async()=>{
    if(!podeGerar.permitido)throw new Error("Sem permissão para gerar acerto");
    if(!socio.parceiro_id)throw new Error("Sócio não identificado");
    const {data,error}=await supabase.rpc("socio_acerto_gerar",{p_parceiro_id:socio.parceiro_id,p_valor:Number(valor),p_meio:meio,...(observacao.trim()?{p_observacao:observacao.trim()}:{})});if(error)throw error;
    return data as {numero?:string;pix_copia_cola?:string};
  },onSuccess:async r=>{setPix(r.pix_copia_cola ?? "");toast.success(`Acerto ${r.numero ?? ""} gerado`);await qc.invalidateQueries();},onError:e=>toast.error(rawMessage(e))});
  return <div className="space-y-6 py-6">
    <p className="text-lg font-medium">Saldo devedor {formatBRL(socio.saldo_devedor)}</p>
    <section className="space-y-3"><h2 className="font-medium">Extrato</h2>{extrato.isPending?<p>Carregando…</p>:extrato.isError?<p className="text-destructive">{rawMessage(extrato.error)}</p>:<><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader><TableBody>{extrato.data.map((r,i)=><TableRow key={`${r.ref}-${i}`} className={r.tipo === "a_faturar" ? "text-muted-foreground" : r.tipo === "acerto" ? "text-success" : ""}><TableCell className="whitespace-nowrap">{dataPt(r.data)}</TableCell><TableCell>{r.descricao}{r.tipo === "a_faturar" && <Badge variant="secondary" className="ml-1">aguardando NF</Badge>}</TableCell><TableCell className="text-right tabular-nums">{formatBRL(r.valor)}</TableCell></TableRow>)}</TableBody></Table>{!extrato.data.length && <p className="text-sm text-muted-foreground">Sem lançamentos</p>}</>}</section>
    <section className="space-y-3"><h2 className="font-medium">Gerar acerto</h2><Label htmlFor="valor-acerto">Valor</Label><Input id="valor-acerto" type="number" min="0.01" step="0.01" value={valor} onChange={e=>setValor(e.target.value)} /><Label>Meio</Label><Select value={meio} onValueChange={setMeio}><SelectTrigger aria-label="Meio do acerto"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pix">PIX</SelectItem><SelectItem value="cartao">Cartão</SelectItem></SelectContent></Select><Label htmlFor="obs-acerto">Observação</Label><Textarea id="obs-acerto" value={observacao} onChange={e=>setObservacao(e.target.value)} /><Button disabled={!podeGerar.permitido || gerar.isPending || !Number.isFinite(Number(valor)) || Number(valor)<=0} onClick={()=>gerar.mutate()}>Gerar acerto</Button>{pix && <div className="space-y-2"><Textarea aria-label="PIX gerado" readOnly value={pix} /><Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(pix);toast.success("PIX copiado");}catch(e){toast.error(rawMessage(e));}}}><Copy />Copiar</Button></div>}</section>
    <section className="space-y-3"><h2 className="font-medium">Acertos</h2>{acertos.isPending?<p>Carregando…</p>:acertos.isError?<p className="text-destructive">{rawMessage(acertos.error)}</p>:acertos.data.length?acertos.data.map(a=><div key={a.id} className="space-y-3 rounded-md border p-3"><div className="flex flex-wrap justify-between gap-2"><strong>{a.numero}</strong><Badge variant="outline">{a.status}</Badge></div><p className="text-sm">{a.meio === "pix" ? "PIX" : "Cartão"} · {formatBRL(a.valor)} · {dataPt(a.data_pagamento ?? a.criado_em)}</p>{a.status === "aberto" && <AcertoAberto acerto={a} />}</div>):<p className="text-sm text-muted-foreground">Nenhum acerto</p>}</section>
  </div>;
}

export default function ContaCorrenteSocios(){
  const [nav,setNav]=useEstadoTela({socio:""});

  const q=useQuery({queryKey:["socios","conta-corrente"],queryFn:async()=>{const {data,error}=await supabase.from("vw_socio_conta_corrente").select("*").order("nome");if(error)throw error;return data;}});
  useFocoAoVoltar({pronto:!q.isPending,idsVisiveis:(q.data ?? []).flatMap(s=>s.parceiro_id?[s.parceiro_id]:[])});useRestaurarScroll(null,!q.isPending);
  const lista=q.data ?? [];const selecionado=lista.find(s=>s.parceiro_id===nav.socio);
  return <PageShell><PageHeader titulo="Conta Corrente de Sócios" icone={Wallet} />
    {q.isPending?<p>Carregando…</p>:q.isError?<p className="text-destructive">{rawMessage(q.error)}</p>:<>
      <div className="grid gap-4 py-4 sm:grid-cols-2">{[["Saldo devedor total",lista.reduce((s,r)=>s+Number(r.saldo_devedor ?? 0),0)],["A faturar total",lista.reduce((s,r)=>s+Number(r.a_faturar ?? 0),0)]].map(([label,total])=><div key={label} className="border-b py-3"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-medium tabular-nums">{formatBRL(Number(total))}</p></div>)}</div>
      <Table><TableHeader><TableRow>{["Sócio","Faturado","Acertado","Saldo devedor","A faturar","Último acerto"].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{lista.map(s=><TableRow key={s.parceiro_id} data-foco-id={s.parceiro_id} className="cursor-pointer" tabIndex={0} onClick={()=>setNav({socio:s.parceiro_id ?? ""})} onKeyDown={e=>{if(e.key==="Enter")setNav({socio:s.parceiro_id ?? ""});}}><TableCell className="font-medium">{s.nome}</TableCell><TableCell>{formatBRL(s.faturado)}</TableCell><TableCell>{formatBRL(s.acertado)}</TableCell><TableCell className="font-medium text-warning tabular-nums">{formatBRL(s.saldo_devedor)}</TableCell><TableCell>{formatBRL(s.a_faturar)}</TableCell><TableCell>{dataPt(s.ultimo_acerto)}</TableCell></TableRow>)}</TableBody></Table>{!lista.length && <p className="py-6 text-muted-foreground">Nenhum sócio</p>}
    </>}
    <Sheet open={Boolean(selecionado)} onOpenChange={v=>{if(!v)setNav({socio:""});}}><SheetContent className="w-full overflow-y-auto sm:max-w-2xl"><SheetHeader><SheetTitle>{selecionado?.nome}</SheetTitle></SheetHeader>{selecionado && <GavetaSocio key={selecionado.parceiro_id} socio={selecionado} />}</SheetContent></Sheet>
  </PageShell>;
}