import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEstadoTela } from "@/lib/navegacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { rawMessage } from "@/lib/format-error";
import { sb, useFilaExtrato, useClassesExtrato, invalidarExtrato, type MovExtrato } from "./dados";
import { filtrarExtrato, periodoMesAtual, ORIGENS_CLASSE } from "./filtros";

function documento(doc: string | null) {
  if (!doc) return "—";
  const d = doc.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return doc;
}
export default function FilaTab() {
  const qc = useQueryClient();
  const [nav, setNav] = useEstadoTela({ modo: "aberto", conta: "todas", busca: "", de: "", ate: "", rapido: "", pagina: 1 }, { replaceKeys: ["busca"] });
  const historico = nav.modo === "classificadas";
  const periodo = periodoMesAtual();
  const de = historico ? nav.de || periodo.de : nav.de;
  const ate = historico ? nav.ate || periodo.ate : nav.ate;
  const filaQ = useFilaExtrato();
  const classesQ = useClassesExtrato("manual");
  const todasClassesQ = useClassesExtrato("todas");
  const contasQ = useQuery<{ id: string; nome_exibicao: string }[]>({
    queryKey: ["inbox-contas"], queryFn: async () => {
      const { data, error } = await sb.from("contas_bancarias").select("id,nome_exibicao").eq("ativo", true).order("nome_exibicao");
      if (error) throw error;
      return data ?? [];
    },
  });
  const historicoQ = useQuery<MovExtrato[]>({
    queryKey: ["extrato-inbox", "classificadas", de, ate], enabled: historico && !!de && !!ate,
    queryFn: async () => {
      const linhas: MovExtrato[] = [];
      for (let inicio = 0; ; inicio += 1000) {
        const { data, error } = await sb.from("movimentacoes_bancarias")
          .select("id,conta_bancaria_id,data_transacao,descricao,valor,tipo,contraparte_nome,contraparte_documento,referencia_pedido,tipo_meio,classe,classe_definida_por,classe_nota")
          .not("classe", "is", null).gte("data_transacao", de).lte("data_transacao", ate)
          .order("data_transacao", { ascending: false }).order("id").range(inicio, inicio + 999);
        if (error) throw error;
        linhas.push(...(data ?? []).map((m: MovExtrato) => ({ ...m, dias_em_aberto: Math.floor((Date.now() - new Date(`${m.data_transacao}T00:00:00`).getTime()) / 86400000) })));
        if ((data?.length ?? 0) < 1000) break;
      }
      return linhas;
    },
  });
  const [selecionada, setSelecionada] = useState<MovExtrato | null>(null);
  const [classe, setClasse] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const q = historico ? historicoQ : filaQ;
  const filtros = { ...nav, de, ate, rapido: historico ? "" : nav.rapido };
  const base = filtrarExtrato(q.data ?? [], { ...filtros, rapido: "" });
  const filtrados = filtrarExtrato(q.data ?? [], filtros);
  const pagina = Math.max(1, Math.min(nav.pagina, Math.ceil(filtrados.length / 50) || 1));
  const visiveis = filtrados.slice((pagina - 1) * 50, pagina * 50);
  const erro = q.error || contasQ.error || todasClassesQ.error;
  async function executar(acao: string, parametros?: Record<string, unknown>) {
    setOcupado(parametros?.p_mov_id as string || acao);
    try {
      const { data, error } = await sb.rpc(acao, parametros);
      if (error) throw error;
      toast.success(acao === "fn_regras_aplicar" ? `${data.classificadas} movimentações classificadas` : acao === "fn_extrato_desfazer_classe" ? "Classificação desfeita" : "Movimentação classificada");
      setSelecionada(null);
      await invalidarExtrato(qc);
    } catch (e) { toast.error(rawMessage(e)); }
    finally { setOcupado(null); }
  }
  return <TooltipProvider><div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1 rounded-md border bg-card p-1">
        <Button size="sm" variant={!historico ? "secondary" : "ghost"} onClick={() => setNav({ modo: "aberto", de: "", ate: "", pagina: 1 })}>Em aberto</Button>
        <Button size="sm" variant={historico ? "secondary" : "ghost"} onClick={() => setNav({ modo: "classificadas", de: periodo.de, ate: periodo.ate, rapido: "", pagina: 1 })}>Classificadas</Button>
      </div>
      <Button variant="outline" disabled={!!ocupado} onClick={() => executar("fn_regras_aplicar")} className="gap-2">{ocupado === "fn_regras_aplicar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Aplicar regras</Button>
    </div>
    {!historico && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[{ chave: "abertos", nome: "Em aberto", linhas: base }, { chave: "creditos", nome: "Créditos", linhas: base.filter(m => m.tipo === "credito") }, { chave: "debitos", nome: "Débitos", linhas: base.filter(m => m.tipo === "debito") }, { chave: "antigos", nome: "Há mais de 30 dias", linhas: base.filter(m => m.dias_em_aberto > 30) }].map(k =>
        <Button key={k.chave} variant="outline" onClick={() => setNav({ rapido: nav.rapido === k.chave ? "" : k.chave, pagina: 1 })} className={`h-auto items-start flex-col gap-1 bg-card p-3 ${nav.rapido === k.chave ? "border-primary bg-primary/10" : ""}`}>
          <span className="text-xs text-muted-foreground">{k.nome}</span><span className="text-xl font-medium">{k.linhas.length}</span><span className="font-mono text-xs">{formatBRL(k.linhas.reduce((s, m) => s + Number(m.valor), 0))}</span>
        </Button>)}
    </div>}
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-56"><Label>Conta</Label><Select value={nav.conta} onValueChange={v => setNav({ conta: v, pagina: 1 })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todas</SelectItem>{contasQ.data?.map(c => <SelectItem key={c.id} value={c.id}>{c.nome_exibicao}</SelectItem>)}</SelectContent></Select></div>
      <div><Label htmlFor="extrato-de">De</Label><Input id="extrato-de" type="date" value={de} required={historico} onChange={e => setNav({ de: e.target.value, pagina: 1 })} /></div>
      <div><Label htmlFor="extrato-ate">Até</Label><Input id="extrato-ate" type="date" value={ate} required={historico} onChange={e => setNav({ ate: e.target.value, pagina: 1 })} /></div>
      <div className="min-w-48 flex-1"><Label htmlFor="extrato-busca">Busca</Label><Input id="extrato-busca" value={nav.busca} onChange={e => setNav({ busca: e.target.value, pagina: 1 })} placeholder="Descrição, contraparte, documento ou ref. pedido" /></div>
    </div>
    {erro && <p role="alert" className="text-destructive">{rawMessage(erro)}</p>}
    <div className="rounded-md border bg-card"><Table className="w-full table-fixed text-xs [&_td]:px-2 [&_th]:px-2 [&_th]:text-[10px] [&_th]:break-words">
      <colgroup>{(historico ? [8, 8, 12, 8, 11, 6, 12, 5, 7, 8, 6, 9] : [9, 10, 17, 12, 13, 8, 13, 8, 10]).map((largura, i) => <col key={i} width={`${largura}%`} />)}</colgroup>
      <TableHeader><TableRow><TableHead >Data</TableHead><TableHead >Conta</TableHead><TableHead >Descrição</TableHead><TableHead>Contraparte</TableHead><TableHead >Documento</TableHead><TableHead>Ref. pedido</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Dias em aberto</TableHead>{historico && <><TableHead>Classe</TableHead><TableHead>Origem</TableHead><TableHead>Nota</TableHead></>}<TableHead  /></TableRow></TableHeader>
      <TableBody>
        {q.isLoading && <TableRow><TableCell colSpan={historico ? 12 : 9} className="py-8 text-center"><Loader2 className="inline h-4 w-4 animate-spin" /></TableCell></TableRow>}
        {!q.isLoading && !erro && !filtrados.length && <TableRow><TableCell colSpan={historico ? 12 : 9} className="py-8 text-center text-muted-foreground">Nenhuma movimentação encontrada.</TableCell></TableRow>}
        {visiveis.map(m => <TableRow key={m.id}>
          <TableCell>{formatDateBR(m.data_transacao)}</TableCell>
          <TableCell className="truncate" title={m.conta_nome || contasQ.data?.find(c => c.id === m.conta_bancaria_id)?.nome_exibicao}>{m.conta_nome || contasQ.data?.find(c => c.id === m.conta_bancaria_id)?.nome_exibicao || "—"}</TableCell>
          <TableCell><Tooltip><TooltipTrigger asChild><div className="truncate">{m.descricao}</div></TooltipTrigger><TooltipContent className="max-w-md">{m.descricao}</TooltipContent></Tooltip></TableCell>
          <TableCell className="truncate" title={m.contraparte_nome || ""}>{m.contraparte_nome || "—"}</TableCell>
          <TableCell className="truncate" title={documento(m.contraparte_documento)}>{documento(m.contraparte_documento)}</TableCell>
          <TableCell className="truncate" title={m.referencia_pedido || ""}>{m.referencia_pedido || "—"}</TableCell>
          <TableCell className={`whitespace-nowrap text-right font-mono ${m.tipo === "credito" ? "text-success" : "text-destructive"}`}>{formatBRL(m.valor)}</TableCell><TableCell className="font-mono">{m.dias_em_aberto}</TableCell>
          {historico && <><TableCell className="truncate" title={todasClassesQ.data?.find(c => c.codigo === m.classe)?.nome}><Badge variant="outline" className="max-w-full truncate text-[10px]">{todasClassesQ.data?.find(c => c.codigo === m.classe)?.nome || "—"}</Badge></TableCell><TableCell className="truncate" title={ORIGENS_CLASSE[m.classe_definida_por || ""]}>{ORIGENS_CLASSE[m.classe_definida_por || ""] || "—"}</TableCell><TableCell className="truncate" title={m.classe_nota || ""}>{m.classe_nota || "—"}</TableCell></>}
          <TableCell>{!historico ? <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => { setSelecionada(m); setClasse(""); setNota(""); }}>Classificar</Button> : m.classe_definida_por === "manual_p5" && <Button size="sm" variant="outline" disabled={!!ocupado} onClick={() => executar("fn_extrato_desfazer_classe", { p_mov_id: m.id })}>Desfazer</Button>}</TableCell>
        </TableRow>)}
      </TableBody>
    </Table><div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground"><span>{filtrados.length} movimentações · {pagina}/{Math.ceil(filtrados.length / 50) || 1}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setNav({ pagina: pagina - 1 })}>Anterior</Button><Button size="sm" variant="outline" disabled={pagina * 50 >= filtrados.length} onClick={() => setNav({ pagina: pagina + 1 })}>Próxima</Button></div></div></div>
    <Dialog open={!!selecionada} onOpenChange={v => { if (!v && !ocupado) setSelecionada(null); }}><DialogContent><DialogHeader><DialogTitle>Classificar movimentação</DialogTitle><DialogDescription>{selecionada?.descricao} · {formatBRL(selecionada?.valor ?? 0)}</DialogDescription></DialogHeader>
      <div className="space-y-3"><Label>Classe</Label><Select value={classe} onValueChange={setClasse}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{classesQ.data?.map(c => <SelectItem key={c.codigo} value={c.codigo}>{c.nome}</SelectItem>)}</SelectContent></Select>
        {classesQ.error && <p role="alert" className="text-destructive">{rawMessage(classesQ.error)}</p>}<p className="text-sm text-muted-foreground">{classesQ.data?.find(c => c.codigo === classe)?.descricao}</p><Label htmlFor="extrato-nota">Nota (opcional)</Label><Textarea id="extrato-nota" value={nota} onChange={e => setNota(e.target.value)} /></div>
      <DialogFooter><Button variant="outline" disabled={!!ocupado} onClick={() => setSelecionada(null)}>Cancelar</Button><Button disabled={!!ocupado || !classe || !!classesQ.error} onClick={() => { if (selecionada) void executar("fn_extrato_classificar_manual", { p_mov_id: selecionada.id, p_classe: classe, p_nota: nota.trim() || null }); }}>{ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button></DialogFooter>
    </DialogContent></Dialog></div></TooltipProvider>;
}