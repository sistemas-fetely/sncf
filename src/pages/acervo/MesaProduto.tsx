import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDown, ArrowDownCircle, ArrowUp, ArrowUpCircle, ArrowUpDown, Ban, Check,
  ChevronDown, ChevronRight, Columns3, Download, GripVertical,
  ImageOff, Loader2, PackageX, RefreshCw, Search, X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RodapePaginacao, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/components/tabela/RodapePaginacao";
import { usePreferenciaTela } from "@/hooks/usePreferenciaTela";
import { fmtData, fmtDataHora } from "@/lib/data";

type Linha = Record<string, unknown> & {
  sku: string; cod_cadastro: string | null; nome_comercial: string | null;
  fase: string | null; fase_nome: string | null; fase_ordem: number | null;
  sugestao: string | null; campos_fora_do_espelho: string[] | null;
  falta_fase_atual: string[] | null; falta_proxima_fase: string[] | null;
  qtd_falta_atual: number | null; qtd_falta_proxima: number | null;
  foto_url: string | null; foto_exata: boolean | null; foto_origem: string | null;
};

// CONCILIAÇÃO 360 (22/09/2026) — fonte única `vw_produto_conciliacao_360`: funde a antiga
// aba da Mesa (SNCF × Bling × XPM × cartório) com a tela /estoque/conciliacao (Shopify, preço,
// marca), e traz o card canônico do Bling por SKU.
type ConcLinha = {
  sku: string; cod_cadastro: string | null; nome_comercial: string | null; colecao: string | null;
  grupo: string | null; fase: string | null; ean: string | null; dun: string | null;
  ncm: string | null; peso_g: number | null; qtd_kit: number | null; multiplos: number | null;
  preco_varejo: number | null; atualizado_em: string | null; cartorio_estado: string | null;
  cartorio_inner: number | null; cartorio_sku: string | null; bling_codigo: string | null;
  bling_gtin: string | null; bling_ncm: string | null; bling_ativo: boolean | null;
  bling_preco: number | null; bling_n_linhas: number | null; xpm_codigo: string | null;
  xpm_ean: string | null; xpm_ncm: string | null; xpm_peso_kg: number | null;
  tem_ficha_bling: boolean | null; divergencias: string[] | null; qtd_divergencias: number | null;
  existe_bling: boolean | null; existe_xpm: boolean | null;
  bling_nome: string | null; bling_marca: string | null; bling_card_canonico: string | null;
  bling_n_cards: number | null; bling_canonico_por: string | null; bling_canonico_motivo: string | null;
  no_shopify: boolean | null; ativo_shopify: boolean | null; variantes_shopify: number | null;
  inventory_items: number | null; handle: string | null; preco_shopify: number | null;
  barcode_shopify: string | null;
  // Consequência da divergência, resolvida na própria view.
  impactos: string[] | null; impacto_maior: string | null; gravidade: number | null;
};

type CardBling = {
  sku: string; bling_id: string; nome_bling: string | null; card_ativo: boolean | null;
  estoque_atual: number | null; preco_venda: number | null; updated_at: string | null;
  nome_bate_catalogo: boolean | null; nome_legado: boolean | null; e_canonico: boolean | null;
  escolhido_por: string | null; motivo_canonico: string | null; n_candidatos: number | null;
  ja_foi_usado: boolean | null; n_envios: number | null; ultimo_envio: string | null;
};

type LinhaUnida = Linha & Partial<ConcLinha>;
type FaseProduto = { slug: string; nome: string; ordem: number };
type TipoCol = "texto" | "num" | "bool" | "chips" | "fase" | "datahora" | "selos" | "divergencias" | "foto";
type ColDef = { key: string; rotulo: string; tipo: TipoCol; direita?: boolean };
type ErroFuncao = { status: number; corpo: Record<string, unknown> };
// Indicador: "prontos" | "bloqueados" | "furo" | `imp:<slug do impacto>`.
type Indicador = string | null;
type GrupoFiltro = "situacao" | "fase" | "colecao" | "grupo" | "sistemas";

// DIVERGÊNCIA POR CONSEQUÊNCIA (22/09/2026) — o dicionário saiu do código: nome,
// consequência, o que fazer e onde resolver vêm de `divergencia_regra`; nome,
// descrição e gravidade do impacto vêm de `divergencia_impacto_dim`. Slug que a
// view devolver sem regra cadastrada continua aparecendo cru.
type ImpactoDim = { slug: string; nome: string; descricao: string | null; gravidade: number | null; ordem: number | null };
type RegraDiv = {
  slug: string; nome: string; sistema: string | null; impacto: string | null;
  consequencia: string | null; o_que_fazer: string | null; onde_resolver: string | null; ordem: number | null;
};
/** Tom do chip pela gravidade do impacto — nada de "crítico/atenção" escrito aqui. */
const tomGravidade = (g: number | null | undefined) =>
  (g ?? 0) >= 90 ? "border-destructive/40 bg-destructive/10 text-destructive-strong"
  : (g ?? 0) >= 60 ? "border-warning/40 bg-warning/10 text-warning-strong"
  : "";

const tomCardImpacto = (gravidade: number | null | undefined, contagem: number) =>
  contagem === 0 ? ""
  : (gravidade ?? 0) >= 90 ? "border-destructive/50"
  : (gravidade ?? 0) >= 60 ? "border-warning/50"
  : "";

const tomNumeroImpacto = (gravidade: number | null | undefined, contagem: number) =>
  contagem === 0 ? "text-foreground"
  : (gravidade ?? 0) >= 90 ? "text-destructive-strong"
  : (gravidade ?? 0) >= 60 ? "text-warning-strong"
  : "text-foreground";


const SITUACOES = [
  ["pronto_para_ativo", "Prontos para promover"], ["falta_ficha_bling", "Falta ficha no Bling"],
  ["bloqueado", "Bloqueados"], ["ativo_sem_bling", "Ativo sem Bling"],
  ["ativo_com_furo", "Furo em ativo"], ["__sem__", "Sem situação"],
] as const;
const SISTEMAS = [
  ["sem_bling", "Sem Bling"], ["bling_card_duplicado", "Card duplicado no Bling"],
  ["sem_shopify", "Sem Shopify"],
  ["sem_xpm", "Sem XPM"], ["divergencia", "Com divergência"], ["sem_foto_propria", "Sem foto própria"],
] as const;
// Predicado único do filtro Sistemas (usado no recorte e na contagem facetada).
// `imp:<slug>` são as opções de impacto, lidas de divergencia_impacto_dim.
const predSistema = (l: LinhaUnida, v: string): boolean =>
  v.startsWith("imp:") ? (l.impactos ?? []).includes(v.slice(4))
  : v === "sem_bling" ? !temValor(l.cod_bling)
  : v === "bling_card_duplicado" ? (l.bling_n_cards ?? 0) > 1
  : v === "sem_shopify" ? l.no_shopify !== true
  : v === "sem_xpm" ? !temValor(l.cod_xpm)
  : v === "sem_foto_propria" ? l.foto_origem !== "propria" && l.foto_origem !== "produto"
  : (l.qtd_divergencias ?? 0) > 0;

const COLUNAS_PADRAO = [
  "foto_url", "cod_cadastro", "sku", "cod_bling", "cod_shopify", "cod_xpm", "sistemas",
  "nome_comercial", "fase_nome", "grupo", "colecao", "qtd_falta_atual", "falta_fase_atual",
  "qtd_falta_proxima", "falta_proxima_fase", "saldo_disponivel", "atualizado_em",
];
const COLUNAS: ColDef[] = [
  { key:"foto_url",rotulo:"Foto",tipo:"foto" }, { key:"foto_origem",rotulo:"Origem da foto",tipo:"texto" },
  { key:"cod_cadastro",rotulo:"Cód. Cadastro",tipo:"texto" }, { key:"sku",rotulo:"Cód. SKU",tipo:"texto" },
  { key:"cod_bling",rotulo:"Cód. Bling",tipo:"texto" }, { key:"cod_shopify",rotulo:"Cód. Shopify",tipo:"texto" },
  { key:"cod_xpm",rotulo:"Cód. XPM",tipo:"texto" }, { key:"sistemas",rotulo:"Sistemas",tipo:"selos" },
  { key:"nome_comercial",rotulo:"Nome comercial",tipo:"texto" }, { key:"fase_nome",rotulo:"Fase",tipo:"fase" },
  { key:"grupo",rotulo:"Grupo",tipo:"texto" }, { key:"colecao",rotulo:"Coleção",tipo:"texto" },
  { key:"qtd_falta_atual",rotulo:"Falta agora (qtd)",tipo:"num",direita:true }, { key:"falta_fase_atual",rotulo:"Falta agora",tipo:"chips" },
  { key:"qtd_falta_proxima",rotulo:"Falta p/ promover (qtd)",tipo:"num",direita:true }, { key:"falta_proxima_fase",rotulo:"Falta p/ promover",tipo:"chips" },
  { key:"tem_bling",rotulo:"Ficha no Bling",tipo:"bool" }, { key:"saldo_disponivel",rotulo:"Saldo disponível",tipo:"num",direita:true },
  { key:"atualizado_em",rotulo:"Atualizado em",tipo:"datahora" }, { key:"nome_operacional",rotulo:"Nome operacional",tipo:"texto" },
  { key:"nome_completo",rotulo:"Nome completo",tipo:"texto" }, { key:"fase",rotulo:"Fase (código)",tipo:"texto" },
  { key:"fase_ordem",rotulo:"Ordem da fase",tipo:"num",direita:true }, { key:"proxima_fase",rotulo:"Próxima fase",tipo:"texto" },
  { key:"sugestao",rotulo:"Sugestão",tipo:"texto" }, { key:"donos_pendencia",rotulo:"Quem resolve",tipo:"chips" },
  { key:"campos_fora_do_espelho",rotulo:"Campos fora do espelho",tipo:"chips" }, { key:"ficha_completa",rotulo:"Ficha completa",tipo:"bool" },
  { key:"pronto_proxima_fase",rotulo:"Pronto p/ próxima fase",tipo:"bool" }, { key:"ativo",rotulo:"Ativo",tipo:"bool" },
  { key:"ean",rotulo:"EAN",tipo:"texto" }, { key:"dun",rotulo:"DUN",tipo:"texto" }, { key:"ncm",rotulo:"NCM",tipo:"texto" },
  { key:"cest",rotulo:"CEST",tipo:"texto" }, { key:"peso_g",rotulo:"Peso (g)",tipo:"num",direita:true },
  { key:"altura_cm",rotulo:"Altura (cm)",tipo:"num",direita:true }, { key:"largura_cm",rotulo:"Largura (cm)",tipo:"num",direita:true },
  { key:"profundidade_cm",rotulo:"Profundidade (cm)",tipo:"num",direita:true }, { key:"material",rotulo:"Material",tipo:"texto" },
  { key:"material_descritivo",rotulo:"Material descritivo",tipo:"texto" }, { key:"tipo_embalagem",rotulo:"Tipo de embalagem",tipo:"texto" },
  { key:"origem_fisc",rotulo:"Origem fiscal",tipo:"texto" }, { key:"origem_prod",rotulo:"Origem de produção",tipo:"texto" },
  { key:"preco_atacado",rotulo:"Preço atacado",tipo:"num",direita:true }, { key:"preco_varejo",rotulo:"Preço varejo",tipo:"num",direita:true },
  { key:"preco_custo",rotulo:"Preço custo",tipo:"num",direita:true }, { key:"multiplos",rotulo:"Múltiplos",tipo:"num",direita:true },
  { key:"qtd_kit",rotulo:"Qtd kit",tipo:"num",direita:true }, { key:"familia",rotulo:"Família",tipo:"texto" },
  { key:"tipo",rotulo:"Tipo",tipo:"texto" }, { key:"marca",rotulo:"Marca",tipo:"texto" }, { key:"linha",rotulo:"Linha",tipo:"texto" },
  { key:"cor",rotulo:"Cor (código)",tipo:"texto" }, { key:"cor_nome",rotulo:"Cor",tipo:"texto" }, { key:"estampa",rotulo:"Estampa",tipo:"texto" },
  { key:"tamanho_numero",rotulo:"Tamanho / número",tipo:"texto" }, { key:"departamento",rotulo:"Departamento",tipo:"texto" },
  { key:"categoria",rotulo:"Categoria",tipo:"texto" }, { key:"descricao_produto",rotulo:"Descrição do produto",tipo:"texto" },
  { key:"qtd_divergencias",rotulo:"Divergências (qtd)",tipo:"num",direita:true }, { key:"divergencias",rotulo:"Divergências",tipo:"divergencias" },
];
const ORDENAVEIS = new Set(["cod_cadastro","sku","nome_comercial","fase_ordem","qtd_falta_atual","qtd_falta_proxima","qtd_divergencias","atualizado_em"]);
const fmtNum = (v: number | null | undefined) => typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "0";
const temValor = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
async function chamarPromocao(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("promover-fase-produto", { body: payload });
  if (error) {
    const resp = (error as { context?: Response })?.context;
    if (resp && typeof resp.json === "function") {
      let corpo: Record<string, unknown> = {};
      try { corpo = await resp.json(); } catch (_) { try { corpo = { erro: await resp.text() }; } catch (_e) { corpo = null; } }
      throw { status: resp.status, corpo } as ErroFuncao;
    }
    throw { status: 0, corpo: { erro: error.message } } as ErroFuncao;
  }
  if (!data || data.ok !== true) throw { status: 0, corpo: data ?? { erro: "Resposta vazia da função" } } as ErroFuncao;
  return data as Record<string, unknown>;
}

function csvCelula(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const FOTO_ORIGEM: Record<string, { rotulo: string; tooltip: string; borda: string; opaco: boolean }> = {
  // 'propria' é a base própria do SNCF (produto_foto) — a fonte mais confiável:
  // identifica o produto, não a cor nem a coleção. Sem marca nenhuma.
  propria: { rotulo: "Foto do produto (base própria)", tooltip: "foto do produto — base própria", borda: "border-border", opaco: false },
  produto: { rotulo: "Foto do produto", tooltip: "foto do produto", borda: "border-border", opaco: false },
  produto_shopify: { rotulo: "Foto principal (Shopify)", tooltip: "foto principal do produto — pode não ser desta cor", borda: "border-border", opaco: false },
  cor: { rotulo: "Foto da cor", tooltip: "foto da coleção nesta cor — não é do produto", borda: "border-dashed border-muted-foreground/60", opaco: false },
  colecao: { rotulo: "Foto da coleção", tooltip: "foto genérica da coleção", borda: "border-dashed border-muted-foreground/60", opaco: true },
};
const rotuloFotoOrigem = (o: string | null | undefined) => (o && FOTO_ORIGEM[o]?.rotulo) ?? (o ?? "Sem foto");

function MiniFoto({ url, origem, nome, onAmpliar }: { url: string | null; origem: string | null; nome: string; onAmpliar: (url: string, nome: string) => void }) {
  const [quebrada, setQuebrada] = useState(false);
  if (!url || quebrada) return <Tooltip><TooltipTrigger asChild><span className="flex h-9 w-9 items-center justify-center rounded border border-dashed border-border text-muted-foreground/50" aria-label="Sem foto"><ImageOff className="h-4 w-4" /></span></TooltipTrigger><TooltipContent>sem foto</TooltipContent></Tooltip>;
  const o = (origem && FOTO_ORIGEM[origem]) || null;
  const botao = <button type="button" onClick={() => onAmpliar(url, nome)} aria-label={`Ampliar foto de ${nome}`} className={cn("block h-9 w-9 overflow-hidden rounded border", o ? o.borda : "border-border")}><img src={url} alt={nome} loading="lazy" onError={() => setQuebrada(true)} className={cn("h-full w-full object-cover", o?.opaco && "opacity-70")} /></button>;
  return <Tooltip><TooltipTrigger asChild>{botao}</TooltipTrigger><TooltipContent>{o ? o.tooltip : `origem: ${origem}`}</TooltipContent></Tooltip>;
}

function FiltroFacetado({ label, opcoes, selecionados, onChange }: { label:string; opcoes:{valor:string;rotulo:string;contagem:number}[]; selecionados:string[]; onChange:(v:string[])=>void }) {
  return <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="gap-2 font-normal"><span className="text-muted-foreground">{label}</span>{selecionados.length>0&&<Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{selecionados.length}</Badge>}<ChevronDown className="h-3.5 w-3.5 opacity-50" /></Button></PopoverTrigger><PopoverContent align="start" className="w-64 p-1"><div className="max-h-72 overflow-auto">{opcoes.map(o=><Button key={o.valor} variant="ghost" size="sm" className="w-full justify-start gap-2 font-normal" onClick={()=>onChange(selecionados.includes(o.valor)?selecionados.filter(v=>v!==o.valor):[...selecionados,o.valor])}><span className={cn("flex h-4 w-4 items-center justify-center rounded border",selecionados.includes(o.valor)&&"border-primary bg-primary text-primary-foreground")}>{selecionados.includes(o.valor)&&<Check className="h-3 w-3"/>}</span><span className="flex-1 truncate text-left">{o.rotulo}</span><span className="tabular-nums text-muted-foreground">{o.contagem}</span></Button>)}</div>{selecionados.length>0&&<Button variant="ghost" size="sm" className="mt-1 w-full" onClick={()=>onChange([])}>Limpar seleção</Button>}</PopoverContent></Popover>;
}

export default function MesaProduto() {
  const [busca,setBusca]=useState(""); const [situacoes,setSituacoes]=useState<string[]>([]); const [fasesSel,setFasesSel]=useState<string[]>([]);
  const [colecoes,setColecoes]=useState<string[]>([]); const [grupos,setGrupos]=useState<string[]>([]); const [sistemas,setSistemas]=useState<string[]>([]);
  const [indicador,setIndicador]=useState<Indicador>(null); const [visiveis,setVisiveis]=useState<string[]>(COLUNAS_PADRAO);
  const [ordemColunas,setOrdemColunas]=useState<string[]>(COLUNAS.map(c=>c.key)); const [arrastando,setArrastando]=useState<string|null>(null);
  const [ordem,setOrdem]=useState({coluna:"cod_cadastro",dir:"asc" as "asc"|"desc"}); const [pagina,setPagina]=useState(1); const [tamanho,setTamanho]=useState<number>(DEFAULT_PAGE_SIZE);
  const [expandido,setExpandido]=useState<string|null>(null); const [emAcao,setEmAcao]=useState<string|null>(null);
  const [confirmSaldo,setConfirmSaldo]=useState<{sku:string;saldo:number;faseDestino:string;motivo?:string}|null>(null); const [faltando,setFaltando]=useState<{sku:string;campos:string[]}|null>(null); const [erroFop,setErroFop]=useState<{sku:string;corpo:string}|null>(null);
  const [regressao,setRegressao]=useState<{linha:LinhaUnida;fase:FaseProduto}|null>(null); const [motivoRegressao,setMotivoRegressao]=useState("");
  const [fotoAberta,setFotoAberta]=useState<{url:string;nome:string}|null>(null);

  // Preferencia por usuario, no banco: colunas visiveis, ordem das colunas e
  // tamanho de pagina. Aba, filtros e busca ficam de fora — recorte e' do momento.
  // Coluna que nao existe mais na view e' ignorada em silencio.
  const pref=usePreferenciaTela<{colunas_visiveis?:string[];ordem_colunas?:string[];tamanho_pagina?:number}>("mesa_produto",{});
  const [hidratado,setHidratado]=useState(false);
  useEffect(()=>{
    if(hidratado||pref.carregando)return;
    const chaves=new Set(COLUNAS.map(c=>c.key));
    const vis=Array.isArray(pref.preferencias.colunas_visiveis)?pref.preferencias.colunas_visiveis.filter(k=>typeof k==="string"&&chaves.has(k)):null;
    if(vis&&vis.length)setVisiveis([...new Set([...COLUNAS_PADRAO.filter(k=>["foto_url","cod_cadastro","sku"].includes(k)),...vis])]);
    const ord=Array.isArray(pref.preferencias.ordem_colunas)?pref.preferencias.ordem_colunas.filter(k=>typeof k==="string"&&chaves.has(k)):null;
    if(ord&&ord.length)setOrdemColunas([...ord,...COLUNAS.map(c=>c.key).filter(k=>!ord.includes(k))]);
    const tam=Number(pref.preferencias.tamanho_pagina);
    if((PAGE_SIZE_OPTIONS as readonly number[]).includes(tam))setTamanho(tam);
    setHidratado(true);
  },[hidratado,pref.carregando,pref.preferencias]);
  useEffect(()=>{
    if(!hidratado)return;
    pref.salvar({colunas_visiveis:visiveis,ordem_colunas:ordemColunas});
  // salvar e' estavel por tela; depender dele reescreveria a cada render
  },[hidratado,visiveis,ordemColunas]); // eslint-disable-line react-hooks/exhaustive-deps


  const lista=useQuery({queryKey:["mesa-produto-lista"],queryFn:async()=>{const {data,error}=await supabase.from("vw_produto_mesa_lista" as never).select("*").order("cod_cadastro");if(error)throw error;return(data??[]) as Linha[];}});
  const fasesDim=useQuery({queryKey:["produto-fase-dim"],queryFn:async()=>{const {data,error}=await supabase.from("produto_fase_dim").select("slug, nome, ordem").order("ordem");if(error)throw error;return(data??[]) as FaseProduto[];}});
  const conc=useQuery({queryKey:["mesa-produto-conciliacao-360"],queryFn:async()=>{const {data,error}=await supabase.from("vw_produto_conciliacao_360" as never).select("*");if(error)throw error;return(data??[]) as ConcLinha[];}});
  const impactosDim=useQuery({queryKey:["divergencia-impacto-dim"],queryFn:async()=>{const {data,error}=await supabase.from("divergencia_impacto_dim" as never).select("slug, nome, descricao, gravidade, ordem").order("ordem");if(error)throw error;return(data??[]) as ImpactoDim[];}});
  const regrasDim=useQuery({queryKey:["divergencia-regra"],queryFn:async()=>{const {data,error}=await supabase.from("divergencia_regra" as never).select("slug, nome, sistema, impacto, consequencia, o_que_fazer, onde_resolver, ordem").order("ordem");if(error)throw error;return(data??[]) as RegraDiv[];}});
  const impactoPorSlug=useMemo(()=>new Map((impactosDim.data??[]).map(i=>[i.slug,i])),[impactosDim.data]);
  const regraPorSlug=useMemo(()=>new Map((regrasDim.data??[]).map(r=>[r.slug,r])),[regrasDim.data]);
  const rotuloDoSlug=(slug:string)=>regraPorSlug.get(slug)?.nome??slug;
  const impactoDaRegra=(slug:string)=>{const imp=regraPorSlug.get(slug)?.impacto;return imp?impactoPorSlug.get(imp)??null:null;};
  const sugestoes=useQuery({queryKey:["mesa-produto-sugestoes"],queryFn:async()=>{const slugs=SITUACOES.filter(([slug])=>slug!=="__sem__").map(([slug])=>slug);const respostas=await Promise.all(slugs.map(async slug=>{const {data,error}=await supabase.from("vw_produto_mesa_fase" as never).select("sku, sugestao").eq("sugestao",slug);if(error)throw error;return(data??[]) as {sku:string;sugestao:string|null}[];}));return respostas.flat();}});
  const linhas=useMemo(()=>{const mapa=new Map((conc.data??[]).map(c=>[c.sku,c]));const sugestaoPorSku=new Map((sugestoes.data??[]).map(l=>[l.sku,l.sugestao]));return(lista.data??[]).map(l=>{const unida={...l,...(mapa.get(l.sku)??{})} as LinhaUnida;const sugestaoRecebida=sugestaoPorSku.get(l.sku)??l.sugestao;if(unida.fase!=="ativo")return{...unida,sugestao:sugestaoRecebida};if(!temValor(unida.cod_bling))return{...unida,sugestao:"ativo_sem_bling"};if((unida.qtd_falta_atual??0)>0)return{...unida,sugestao:"ativo_com_furo"};return{...unida,sugestao:null};}) as LinhaUnida[];},[lista.data,conc.data,sugestoes.data]);
  const carregando=lista.isLoading||conc.isLoading||sugestoes.isLoading||fasesDim.isLoading||impactosDim.isLoading||regrasDim.isLoading; const erro=lista.error??conc.error??sugestoes.error??fasesDim.error??impactosDim.error??regrasDim.error;
  const fases=useMemo(()=>{const m=new Map<string,{valor:string;rotulo:string;ordem:number}>();for(const l of linhas){const v=l.fase??"__sem__";if(!m.has(v))m.set(v,{valor:v,rotulo:l.fase_nome??l.fase??"Sem fase",ordem:l.fase_ordem??999});}return[...m.values()].sort((a,b)=>a.ordem-b.ordem);},[linhas]);
  const faseAnterior=(l:LinhaUnida)=>{const atual=fasesDim.data?.find(f=>f.slug===l.fase);if(!atual)return null;return[...(fasesDim.data??[])].filter(f=>f.ordem<atual.ordem).sort((a,b)=>b.ordem-a.ordem)[0]??null;};
  const valores=(key:"colecao"|"grupo")=>[...new Set(linhas.map(l=>l[key]).filter(temValor).map(String))].sort((a,b)=>a.localeCompare(b,"pt-BR"));

  function aplica(l:LinhaUnida, ignorar?:GrupoFiltro, semIndicador=false){
    const q=busca.trim().toLocaleLowerCase("pt-BR"); if(q&&![l.cod_cadastro,l.sku,l.nome_comercial,l.ean].filter(temValor).some(v=>String(v).toLocaleLowerCase("pt-BR").includes(q)))return false;
    if(ignorar!=="situacao"&&situacoes.length&&!situacoes.includes(l.sugestao??"__sem__"))return false;
    if(ignorar!=="fase"&&fasesSel.length&&!fasesSel.includes(l.fase??"__sem__"))return false;
    if(ignorar!=="colecao"&&colecoes.length&&!colecoes.includes(String(l.colecao??"")))return false;
    if(ignorar!=="grupo"&&grupos.length&&!grupos.includes(String(l.grupo??"")))return false;
    if(ignorar!=="sistemas"&&sistemas.length&&!sistemas.some(s=>predSistema(l,s)))return false;
    if(!semIndicador&&indicador){if(indicador.startsWith("imp:")){if(l.fase!=="ativo"||!(l.impactos??[]).includes(indicador.slice(4)))return false;}else{const slug=indicador==="prontos"?"pronto_para_ativo":indicador==="bloqueados"?"bloqueado":"ativo_com_furo";if(l.sugestao!==slug)return false;}}
    return true;
  }
  const recorte=(()=>{const base=linhas.filter(l=>aplica(l));const mult=ordem.dir==="asc"?1:-1;return [...base].sort((a,b)=>{const va=a[ordem.coluna],vb=b[ordem.coluna];if(va==null&&vb==null)return 0;if(va==null)return 1;if(vb==null)return -1;if(typeof va==="number"&&typeof vb==="number")return(va-vb)*mult;return String(va).localeCompare(String(vb),"pt-BR",{numeric:true})*mult;});})();
  useEffect(()=>{setPagina(1);setExpandido(null);},[busca,situacoes,fasesSel,colecoes,grupos,sistemas,indicador,tamanho]);
  const conta=(pred:(l:LinhaUnida)=>boolean,ignorar?:GrupoFiltro)=>linhas.filter(l=>aplica(l,ignorar,true)&&pred(l)).length;
  // INDICADOR-POR-CONSEQUÊNCIA: no lugar de "Com divergência" (que marcava o
  // catálogo inteiro), um card por impacto da dimensão. Contagem zero fica visível.
  const impactosOrdenados=useMemo(()=>[...(impactosDim.data??[])].sort((a,b)=>(b.gravidade??0)-(a.gravidade??0)||(a.ordem??999)-(b.ordem??999)),[impactosDim.data]);
  const contemImpacto=(l:LinhaUnida,slug:string)=>Array.isArray(l.impactos)&&l.impactos.some(i=>String(i)===slug);
  const cards=[{id:null as Indicador,label:"Total",n:linhas.filter(l=>aplica(l,undefined,true)).length,tooltip:null as string|null,gravidade:null as number|null},{id:"prontos" as Indicador,label:"Prontos para promover",n:conta(l=>l.sugestao==="pronto_para_ativo"),tooltip:null,gravidade:null},{id:"bloqueados" as Indicador,label:"Bloqueados",n:conta(l=>l.sugestao==="bloqueado"),tooltip:null,gravidade:null},{id:"furo" as Indicador,label:"Furo em ativo",n:conta(l=>l.sugestao==="ativo_com_furo"),tooltip:null,gravidade:null},...impactosOrdenados.map(i=>({id:`imp:${i.slug}` as Indicador,label:i.nome,n:conta(l=>l.fase==="ativo"&&contemImpacto(l,i.slug)),tooltip:i.descricao,gravidade:i.gravidade}))];
  const facet=(grupo:GrupoFiltro,ops:{valor:string;rotulo:string}[],pred:(l:LinhaUnida,v:string)=>boolean)=>ops.map(o=>({...o,contagem:linhas.filter(l=>aplica(l,grupo)&&pred(l,o.valor)).length}));
  const filtrosAtivos=(busca?1:0)+situacoes.length+fasesSel.length+colecoes.length+grupos.length+sistemas.length+(indicador?1:0);
  const colunasVisiveis=ordemColunas.map(k=>COLUNAS.find(c=>c.key===k)).filter((c):c is ColDef=>!!c&&visiveis.includes(c.key));
  const paginas=Math.max(1,Math.ceil(recorte.length/tamanho)),paginaAtual=Math.min(pagina,paginas),paginaLinhas=recorte.slice((paginaAtual-1)*tamanho,paginaAtual*tamanho);
  const estado=`${recorte.length} produtos · ${recorte.filter(l=>l.sugestao==="bloqueado").length} bloqueados · ${recorte.filter(l=>l.sugestao==="ativo_com_furo").length} com furo`;

  function limpar(){setBusca("");setSituacoes([]);setFasesSel([]);setColecoes([]);setGrupos([]);setSistemas([]);setIndicador(null);}
  function ordenar(key:string){if(!ORDENAVEIS.has(key))return;setOrdem(o=>o.coluna===key?{coluna:key,dir:o.dir==="asc"?"desc":"asc"}:{coluna:key,dir:"asc"});}
  function mover(destino:string){if(!arrastando||arrastando===destino||["foto_url","cod_cadastro","sku"].includes(arrastando))return;setOrdemColunas(atual=>{const n=atual.filter(k=>k!==arrastando);const i=n.indexOf(destino);n.splice(Math.max(3,i),0,arrastando);return n;});setArrastando(null);}
  function exportar(){const cab=colunasVisiveis.map(c=>csvCelula(c.rotulo)).join(";");const corpo=recorte.map(l=>colunasVisiveis.map(c=>csvCelula(c.key==="sistemas"?`B:${temValor(l.cod_bling)?"sim":"não"};S:${temValor(l.cod_shopify)?"sim":"não"};X:${temValor(l.cod_xpm)?"sim":"não"}`:c.key==="divergencias"?(l.divergencias??[]).map(rotuloDoSlug).join("; "):c.key==="foto_origem"?rotuloFotoOrigem(l.foto_origem):l[c.key])).join(";")).join("\n");const url=URL.createObjectURL(new Blob(["\uFEFF"+cab+"\n"+corpo],{type:"text/csv;charset=utf-8;"}));const a=document.createElement("a");a.href=url;a.download=`mesa-produto-${fmtData(new Date(),"").split("/").reverse().join("-")}.csv`;a.click();URL.revokeObjectURL(url);}
  function tratarErro(sku:string,faseDestino:string,motivo:string|undefined,e:unknown){const err=e as ErroFuncao,corpo=err?.corpo??{};if(err?.status===409){setConfirmSaldo({sku,saldo:Number(corpo.saldo_disponivel??0),faseDestino,motivo});return;}if(err?.status===422){setFaltando({sku,campos:Array.isArray(corpo.campos_faltando)?corpo.campos_faltando.map(String):[]});return;}if(err?.status===502){setErroFop({sku,corpo:typeof corpo.fop_body==="string"?corpo.fop_body:JSON.stringify(corpo.fop_body??corpo,null,2)});return;}toast.error(`Falha em ${sku}`,{description:typeof corpo.erro==="string"?corpo.erro:"Erro sem detalhe."});}
  async function agir(sku:string,faseDestino:string,confirmarSaldo=false,motivo?:string){setEmAcao(sku);try{const r=await chamarPromocao({sku,fase_destino:faseDestino,...(motivo?{motivo}:{}),...(confirmarSaldo?{confirmar_saldo:true}:{})});toast.success(`${String(r.cod_cadastro??sku)} — ${String(r.de??"?")} → ${String(r.para??"?")}`,{description:"Fase gravada no FOP e espelhada aqui."});setRegressao(null);setMotivoRegressao("");await lista.refetch();}catch(e){tratarErro(sku,faseDestino,motivo,e);}finally{setEmAcao(null);}}
  const ultima=(l:LinhaUnida)=>!l.proxima_fase||String(l.proxima_fase).toLowerCase()==="inativo";
  const chips=(itens:string[]|null|undefined)=><div className="flex flex-wrap gap-1">{!itens?.length?<span className="text-muted-foreground">—</span>:<>{itens.slice(0,3).map(x=><Badge key={x} variant="outline" className="font-normal">{x}</Badge>)}{itens.length>3&&<Badge variant="outline" className="font-normal">+{itens.length-3}</Badge>}</>}</div>;
  const chipDivergencia=(slug:string)=>{const r=regraPorSlug.get(slug);const imp=impactoDaRegra(slug);return <Tooltip key={slug}><TooltipTrigger asChild><Badge variant="outline" className={cn("font-normal",tomGravidade(imp?.gravidade))}>{r?.nome??slug}</Badge></TooltipTrigger><TooltipContent className="max-w-xs space-y-1"><p>{r?.consequencia??slug}</p>{r?.onde_resolver&&<p className="text-muted-foreground">resolve-se no {r.onde_resolver}</p>}</TooltipContent></Tooltip>;};
  const chipsDivergencia=(itens:string[]|null|undefined)=><div className="flex flex-wrap gap-1">{!itens?.length?<span className="text-muted-foreground">—</span>:<>{itens.slice(0,3).map(slug=>chipDivergencia(slug))}{itens.length>3&&<Tooltip><TooltipTrigger asChild><Badge variant="outline" className="font-normal">+{itens.length-3}</Badge></TooltipTrigger><TooltipContent className="max-w-xs">{itens.slice(3).map(rotuloDoSlug).join(" · ")}</TooltipContent></Tooltip>}</>}</div>;
  const selos=(l:LinhaUnida)=><div className="flex gap-1">{[["B","Bling",temValor(l.cod_bling),false],["S","Shopify",temValor(l.cod_shopify),l.shopify_sku_diverge===true],["X","XPM",temValor(l.cod_xpm),false]].map(([letra,nome,ok,div])=><Tooltip key={String(letra)}><TooltipTrigger asChild><span className={cn("inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-medium",ok?(div?"border-warning/40 bg-warning/10 text-warning-strong":"border-success/40 bg-success/10 text-success-strong"):"border-destructive/40 bg-destructive/10 text-destructive-strong")}>{String(letra)}</span></TooltipTrigger><TooltipContent>{nome}: {ok?(div?"presente, mas com SKU diferente do nosso":"presente"):"não encontrado"}</TooltipContent></Tooltip>)}</div>;
  function celula(l:LinhaUnida,c:ColDef){const v=l[c.key];if(c.tipo==="foto")return <MiniFoto url={l.foto_url??null} origem={l.foto_origem??null} nome={l.nome_comercial??l.sku} onAmpliar={(url,nome)=>setFotoAberta({url,nome})}/>;if(c.key==="foto_origem")return <span className={cn(!l.foto_origem&&"text-muted-foreground")}>{rotuloFotoOrigem(l.foto_origem)}</span>;if(c.tipo==="selos")return selos(l);if(c.tipo==="fase")return <Badge>{String(v??l.fase??"—")}</Badge>;if(c.tipo==="chips"){if(c.key==="falta_proxima_fase"&&ultima(l))return <Tooltip><TooltipTrigger>—</TooltipTrigger><TooltipContent>produto já está na última fase — descontinuar é ação, não promoção</TooltipContent></Tooltip>;return chips(Array.isArray(v)?v.map(String):null);}if(c.tipo==="divergencias")return chipsDivergencia(l.divergencias);if(c.tipo==="bool")return v==null?<span className="text-muted-foreground">—</span>:v?<Check className="h-4 w-4 text-success"/>:<X className="h-4 w-4 text-destructive"/>;if(c.tipo==="datahora")return <span className="text-muted-foreground">{fmtDataHora(typeof v==="string"?v:null)}</span>;if(c.tipo==="num"){if(c.key==="qtd_falta_proxima"&&ultima(l))return <Tooltip><TooltipTrigger>—</TooltipTrigger><TooltipContent>produto já está na última fase — descontinuar é ação, não promoção</TooltipContent></Tooltip>;return v==null?<span className="text-muted-foreground">—</span>:<span className={cn("tabular-nums",c.key==="qtd_falta_atual"&&Number(v)>0&&l.fase==="ativo"&&"text-warning-strong",c.key==="qtd_falta_proxima"&&Number(v)===0&&"text-success-strong")}>{fmtNum(Number(v))}</span>;}if(!temValor(v)){const nome=c.key==="cod_bling"?"Bling":c.key==="cod_shopify"?"Shopify":c.key==="cod_xpm"?"XPM":null;return nome?<Tooltip><TooltipTrigger><span className="text-muted-foreground">—</span></TooltipTrigger><TooltipContent>não encontrado no {nome}</TooltipContent></Tooltip>:<span className="text-muted-foreground">—</span>;}const texto=String(v);if(c.key==="cod_cadastro")return <div className="flex items-center gap-1"><Link to={`/vendas/produto/ficha/${encodeURIComponent(texto)}`} className="font-medium hover:underline">{texto}</Link>{(l.campos_fora_do_espelho??[]).length>0&&<Tooltip><TooltipTrigger><AlertTriangle className="h-3.5 w-3.5 text-warning"/></TooltipTrigger><TooltipContent className="max-w-xs">campo exigido pela matriz que não existe na tabela do SNCF: {(l.campos_fora_do_espelho??[]).join(", ")}</TooltipContent></Tooltip>}</div>;if(c.key==="cod_bling")return <span className="block min-w-56 whitespace-normal">{texto}</span>;if(c.key==="cod_shopify"||c.key==="cod_xpm")return <span className={cn("block max-w-44 truncate",c.key==="cod_shopify"&&l.shopify_sku_diverge&&"text-warning-strong")}>{texto}</span>;return <span>{texto}</span>;}

  const fixa=(key:string,cab=false)=>key==="foto_url"?cn("sticky left-0 w-14 bg-muted",cab?"z-50":"z-20"):key==="cod_cadastro"?cn("sticky left-14 w-28 bg-muted",cab?"z-50":"z-20"):key==="sku"?cn("sticky left-[10.5rem] w-32 border-r bg-muted",cab?"z-50":"z-20"):"";
  return <TooltipProvider delayDuration={200}><PageShell><PageHeader titulo="Mesa do Produto" icone={PackageX} estado={carregando?"Carregando produtos…":estado} acoes={<><Button variant="outline" size="sm" onClick={exportar} disabled={!recorte.length}><Download className="mr-2 h-4 w-4"/>Exportar CSV</Button><Button size="sm" onClick={async()=>{await Promise.all([lista.refetch(),conc.refetch(),sugestoes.refetch(),impactosDim.refetch(),regrasDim.refetch()]);}} disabled={lista.isFetching||conc.isFetching||sugestoes.isFetching||impactosDim.isFetching||regrasDim.isFetching}><RefreshCw className={cn("mr-2 h-4 w-4",(lista.isFetching||conc.isFetching||sugestoes.isFetching||impactosDim.isFetching||regrasDim.isFetching)&&"animate-spin")}/>Atualizar</Button></>}/>
  {erro&&<Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertDescription>Não foi possível carregar os produtos. Atualize a página para tentar novamente. Detalhe: {(erro as Error).message}</AlertDescription></Alert>}
  <section className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6" aria-label="Indicadores">{carregando?Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-20"/>):cards.map(c=>{const impacto=String(c.id??"").startsWith("imp:");const selecionado=indicador===c.id;const botao=<Button key={c.label} variant="outline" className={cn("h-20 items-start justify-center border p-3 text-left",impacto&&tomCardImpacto(c.gravidade,c.n),selecionado&&"ring-2 ring-primary ring-offset-2 ring-offset-background")} onClick={()=>setIndicador(selecionado?null:c.id)}><span className="flex w-full flex-col"><span className="text-[11px] font-normal text-muted-foreground">{c.label}</span><span className={cn("mt-1 text-[21px] font-medium tabular-nums",impacto?tomNumeroImpacto(c.gravidade,c.n):"text-foreground")}>{c.n}</span></span></Button>;return c.tooltip?<Tooltip key={c.label}><TooltipTrigger asChild>{botao}</TooltipTrigger><TooltipContent className="max-w-xs">{c.tooltip}</TooltipContent></Tooltip>:botao;})}</section>
  <section className="flex flex-wrap items-center gap-2 border-y py-3"><div className="relative min-w-64 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={busca} onChange={e=>setBusca(e.target.value)} className="pl-9" placeholder="Buscar código, SKU, nome ou EAN"/></div>
  <FiltroFacetado label="Situação" selecionados={situacoes} onChange={setSituacoes} opcoes={facet("situacao",SITUACOES.map(([valor,rotulo])=>({valor,rotulo})),(l,v)=>(l.sugestao??"__sem__")===v)}/>
  <FiltroFacetado label="Fase" selecionados={fasesSel} onChange={setFasesSel} opcoes={facet("fase",fases.map(({valor,rotulo})=>({valor,rotulo})),(l,v)=>(l.fase??"__sem__")===v)}/>
  <FiltroFacetado label="Coleção" selecionados={colecoes} onChange={setColecoes} opcoes={facet("colecao",valores("colecao").map(v=>({valor:v,rotulo:v})),(l,v)=>l.colecao===v)}/>
  <FiltroFacetado label="Grupo" selecionados={grupos} onChange={setGrupos} opcoes={facet("grupo",valores("grupo").map(v=>({valor:v,rotulo:v})),(l,v)=>l.grupo===v)}/>
  <FiltroFacetado label="Sistemas" selecionados={sistemas} onChange={setSistemas} opcoes={facet("sistemas",[...SISTEMAS.map(([valor,rotulo])=>({valor,rotulo})),...(impactosDim.data??[]).map(i=>({valor:`imp:${i.slug}`,rotulo:i.nome}))],predSistema)}/>
  <Popover><PopoverTrigger asChild><Button variant="outline" size="sm"><Columns3 className="mr-2 h-4 w-4"/>Colunas ({colunasVisiveis.length})</Button></PopoverTrigger><PopoverContent align="end" className="w-80 p-0"><div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground"><span>Arraste para reordenar</span><Button variant="ghost" size="sm" onClick={()=>{setVisiveis(COLUNAS_PADRAO);setOrdemColunas(COLUNAS.map(c=>c.key));}}>Padrão</Button></div><ScrollArea className="h-96"><div className="p-2">{ordemColunas.map(k=>COLUNAS.find(c=>c.key===k)).filter((c):c is ColDef=>!!c).map(c=>{const fixaId=["foto_url","cod_cadastro","sku"].includes(c.key);return <div key={c.key} draggable={!fixaId} onDragStart={()=>setArrastando(c.key)} onDragOver={e=>e.preventDefault()} onDrop={()=>mover(c.key)} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"><GripVertical className={cn("h-4 w-4 text-muted-foreground",fixaId&&"opacity-30")}/><Checkbox checked={visiveis.includes(c.key)} disabled={fixaId} onCheckedChange={()=>setVisiveis(v=>v.includes(c.key)?v.filter(x=>x!==c.key):[...v,c.key])}/><span className="truncate text-sm">{c.rotulo}</span></div>})}</div></ScrollArea></PopoverContent></Popover>
  {filtrosAtivos>0&&<Button variant="ghost" size="sm" onClick={limpar}>Limpar filtros ({filtrosAtivos})</Button>}</section>
  {carregando?<div className="space-y-2">{Array.from({length:8}).map((_,i)=><Skeleton key={i} className="h-11 w-full"/>)}</div>:recorte.length===0?<div className="py-12 text-center"><p className="text-sm text-muted-foreground">Nenhum produto neste recorte.</p><Button variant="link" onClick={limpar}>Limpar filtros</Button></div>:<div className="overflow-hidden rounded-md border bg-card"><Table className="text-xs" containerClassName="mesa-produto-scroll max-h-[min(62vh,46rem)]"><TableHeader><TableRow>{colunasVisiveis.map(c=><TableHead key={c.key} className={cn("sticky top-0 z-40 whitespace-nowrap font-medium",c.direita&&"text-right",fixa(c.key,true))} aria-sort={ordem.coluna===c.key?(ordem.dir==="asc"?"ascending":"descending"):"none"}>{ORDENAVEIS.has(c.key)?<Button variant="ghost" size="sm" className="h-auto p-0 font-medium" onClick={()=>ordenar(c.key)}>{c.rotulo}{ordem.coluna!==c.key?<ArrowUpDown className="ml-1 h-3 w-3"/>:ordem.dir==="asc"?<ArrowUp className="ml-1 h-3 w-3"/>:<ArrowDown className="ml-1 h-3 w-3"/>}</Button>:c.rotulo}</TableHead>)}<TableHead className="sticky right-0 top-0 z-50 w-px text-center font-medium">Ações</TableHead></TableRow></TableHeader><TableBody>{paginaLinhas.map(l=>{const anterior=faseAnterior(l);return <Fragment key={l.sku}><TableRow className="border-b">{colunasVisiveis.map(c=><TableCell key={c.key} className={cn("py-2.5 align-top",c.direita&&"text-right",fixa(c.key))}>{c.key==="cod_cadastro"&&(l.qtd_divergencias??0)>0?<div className="flex items-center gap-1"><Button variant="ghost" size="icon" className="h-6 w-6" aria-label={expandido===l.sku?"Recolher conciliação":"Expandir conciliação"} onClick={()=>setExpandido(e=>e===l.sku?null:l.sku)}>{expandido===l.sku?<ChevronDown className="h-3.5 w-3.5"/>:<ChevronRight className="h-3.5 w-3.5"/>}</Button>{celula(l,c)}</div>:celula(l,c)}</TableCell>)}<TableCell className="sticky right-0 z-20 bg-card py-2.5"><div className="flex justify-center gap-1">{anterior&&<Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Voltar para ${anterior.nome}`} disabled={emAcao===l.sku} onClick={()=>setRegressao({linha:l,fase:anterior})}><ArrowDownCircle className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>Voltar fase para {anterior.nome}</TooltipContent></Tooltip>}{(l.fase==="ativo"||l.fase==="pre_venda")&&<Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Descontinuar" disabled={emAcao===l.sku} onClick={()=>agir(l.sku,"inativo")}><Ban className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>Descontinuar</TooltipContent></Tooltip>}{l.sugestao==="pronto_para_ativo"&&<Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Promover para Ativo" disabled={emAcao===l.sku} onClick={()=>agir(l.sku,"ativo")}><ArrowUpCircle className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>Promover para Ativo</TooltipContent></Tooltip>}</div></TableCell></TableRow>{expandido===l.sku&&(l.qtd_divergencias??0)>0&&<TableRow><TableCell colSpan={colunasVisiveis.length+1} className="bg-muted/30 p-4"><DeParaConciliacao l={l} regras={regraPorSlug} impactos={impactoPorSlug}/></TableCell></TableRow>}</Fragment>;})}</TableBody></Table><RodapePaginacao total={recorte.length} pagina={paginaAtual} tamanhoPagina={tamanho} tela="mesa_produto" onPagina={setPagina} onTamanhoPagina={setTamanho} /></div>}
  <AlertDialog open={!!confirmSaldo} onOpenChange={o=>!o&&setConfirmSaldo(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Seguir com saldo em estoque?</AlertDialogTitle><AlertDialogDescription>O produto <strong>{confirmSaldo?.sku}</strong> ainda tem saldo disponível ({fmtNum(confirmSaldo?.saldo)}). Mudar de fase não apaga o saldo.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={()=>{const pendente=confirmSaldo;setConfirmSaldo(null);if(pendente)agir(pendente.sku,pendente.faseDestino,true,pendente.motivo);}}>Seguir mesmo assim</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  <Dialog open={!!regressao} onOpenChange={o=>{if(emAcao)return;if(!o){setRegressao(null);setMotivoRegressao("");}}}><DialogContent><DialogHeader><DialogTitle>Voltar {regressao?.linha.cod_cadastro??regressao?.linha.sku} — {regressao?.linha.nome_comercial??"Produto sem nome"} de {regressao?.linha.fase_nome??regressao?.linha.fase??"—"} para {regressao?.fase.nome??"—"}?</DialogTitle><DialogDescription>O produto sai do catálogo de venda enquanto estiver em pré-venda.</DialogDescription></DialogHeader><div className="space-y-1.5"><Label htmlFor="motivo-regressao-mesa">Motivo (obrigatório)</Label><Textarea id="motivo-regressao-mesa" value={motivoRegressao} onChange={e=>setMotivoRegressao(e.target.value)} placeholder="Ex.: produto ativado antes do lançamento" rows={3}/></div><DialogFooter><Button variant="outline" onClick={()=>{setRegressao(null);setMotivoRegressao("");}} disabled={!!emAcao}>Cancelar</Button><Button disabled={!motivoRegressao.trim()||!!emAcao} onClick={()=>regressao&&agir(regressao.linha.sku,regressao.fase.slug,false,motivoRegressao.trim())}>{emAcao&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Confirmar</Button></DialogFooter></DialogContent></Dialog>
  <Dialog open={!!faltando} onOpenChange={o=>!o&&setFaltando(null)}><DialogContent><DialogHeader><DialogTitle>Ficha incompleta</DialogTitle><DialogDescription>O produto <strong>{faltando?.sku}</strong> não pode avançar enquanto estes campos estiverem vazios:</DialogDescription></DialogHeader>{chips(faltando?.campos)}<DialogFooter><Button variant="outline" onClick={()=>setFaltando(null)}>Fechar</Button></DialogFooter></DialogContent></Dialog>
  <Dialog open={!!fotoAberta} onOpenChange={o=>!o&&setFotoAberta(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{fotoAberta?.nome}</DialogTitle></DialogHeader>{fotoAberta&&<img src={fotoAberta.url} alt={fotoAberta.nome} className="max-h-[70vh] w-full rounded-md object-contain"/>}</DialogContent></Dialog>
  <Dialog open={!!erroFop} onOpenChange={o=>!o&&setErroFop(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>O FOP recusou a mudança</DialogTitle><DialogDescription>Resposta na íntegra da trava para <strong>{erroFop?.sku}</strong>.</DialogDescription></DialogHeader><pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">{erroFop?.corpo}</pre><DialogFooter><Button variant="outline" onClick={()=>setErroFop(null)}>Fechar</Button></DialogFooter></DialogContent></Dialog>
  </PageShell></TooltipProvider>;
}

const fmtMoeda=(v:number|null|undefined)=>typeof v==="number"?v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}):null;

function DeParaConciliacao({l,regras,impactos}:{l:LinhaUnida;regras:Map<string,RegraDiv>;impactos:Map<string,ImpactoDim>}){
  const divs=new Set(l.divergencias??[]);
  const dash=(v:unknown)=>v==null||String(v).trim()===""?"—":String(v);
  const rows=[
    {r:"EAN",s:l.ean,b:l.bling_gtin,x:l.xpm_ean,y:l.barcode_shopify,sb:"bling_ean_diverge",sx:"xpm_ean_diverge",sy:"shopify_barcode_diverge"},
    {r:"NCM",s:l.ncm,b:l.bling_ncm,x:l.xpm_ncm,y:null,sb:"bling_ncm_diverge",sx:"xpm_ncm_diverge"},
    {r:"Nome",s:l.nome_comercial,b:l.bling_nome,x:null,y:null,sb:"bling_nome_diverge"},
    {r:"Marca",s:l.marca,b:l.bling_marca,x:null,y:null,sb:"bling_marca_diverge"},
    {r:"Preço",s:fmtMoeda(l.preco_varejo),b:fmtMoeda(l.bling_preco),x:null,y:fmtMoeda(l.preco_shopify),sb:"bling_preco_diverge",sy:"shopify_preco_diverge"},
    {r:"Peso",s:l.peso_g!=null?`${fmtNum(l.peso_g)} g`:null,b:null,x:l.xpm_peso_kg!=null?`${fmtNum(l.xpm_peso_kg)} kg`:null,y:null,sx:divs.has("xpm_peso_padrao")?"xpm_peso_padrao":"xpm_peso_diverge"},
    {r:"Ativo",s:l.fase,b:l.bling_ativo==null?null:l.bling_ativo?"ativo":"inativo",x:null,y:l.no_shopify==null?null:l.no_shopify?(l.ativo_shopify?"ativo":"inativo"):"não existe",sb:"bling_inativo_com_ativo",sy:divs.has("sem_shopify")?"sem_shopify":undefined},
  ] as {r:string;s:unknown;b:unknown;x:unknown;y:unknown;sb?:string;sx?:string;sy?:string}[];
  const val=(v:unknown,slug?:string)=><span className={cn(divs.has(slug??"")&&"text-destructive-strong",!temValor(v)&&"text-muted-foreground")}>{dash(v)}</span>;
  // ROTEIRO-ANTES-DO-DIAGNÓSTICO: o que fazer com cada divergência, ordenado pela
  // gravidade do impacto. Slug sem regra cadastrada aparece cru, sem inventar texto.
  const roteiro=[...(l.divergencias??[])].map(slug=>({slug,r:regras.get(slug)??null})).map(x=>({...x,imp:x.r?.impacto?impactos.get(x.r.impacto)??null:null})).sort((a,b)=>(b.imp?.gravidade??0)-(a.imp?.gravidade??0));
  return <div className="space-y-3">
    {roteiro.length>0&&<div className="overflow-hidden rounded-md border bg-background">
      <div className="border-b bg-muted px-3 py-2 text-xs font-medium">O que fazer</div>
      <ul className="divide-y">{roteiro.map(x=><li key={x.slug} className="space-y-0.5 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{x.r?.nome??x.slug}</span>{x.imp&&<Badge variant="outline" className={cn("font-normal",tomGravidade(x.imp.gravidade))}>{x.imp.nome}</Badge>}</div>
        {x.r?.consequencia&&<p className="text-muted-foreground">{x.r.consequencia}</p>}
        {x.r?.o_que_fazer&&<p>{x.r.o_que_fazer}</p>}
        {x.r?.onde_resolver&&<p className="text-muted-foreground">resolve-se no {x.r.onde_resolver}</p>}
      </li>)}</ul>
    </div>}
    <div className="overflow-hidden rounded-md border bg-background"><table className="w-full text-xs"><thead><tr className="border-b bg-muted text-left"><th className="px-3 py-2 font-medium">Campo</th><th className="px-3 py-2 font-medium">SNCF</th><th className="px-3 py-2 font-medium">Bling</th><th className="px-3 py-2 font-medium">XPM</th><th className="px-3 py-2 font-medium">Shopify</th></tr></thead><tbody>{rows.map(r=><tr key={r.r} className="border-b last:border-0"><td className="px-3 py-2 text-muted-foreground">{r.r}</td><td className="px-3 py-2">{val(r.s)}</td><td className="px-3 py-2">{val(r.b,r.sb)}</td><td className="px-3 py-2">{val(r.x,r.sx)}</td><td className="px-3 py-2">{val(r.y,r.sy)}</td></tr>)}</tbody></table></div>
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span>Cartório: {val(l.cartorio_estado,divs.has("sem_cartorio")?"sem_cartorio":"cartorio_nao_alocado")}</span><span>Inner: {val(l.cartorio_inner,"cartorio_sem_inner")}</span><span>SKU no cartório: {val(l.cartorio_sku,"cartorio_sku_diverge")}</span>{temValor(l.handle)&&<span>Handle Shopify: {val(l.handle)}</span>}{l.variantes_shopify!=null&&<span>Variantes Shopify: {val(fmtNum(l.variantes_shopify))}</span>}</div>
    {(l.bling_n_cards??0)>1&&<CardsBling sku={l.sku} motivo={l.bling_canonico_motivo??null} por={l.bling_canonico_por??null}/>}
  </div>;
}

// CARDS NO BLING (22/09/2026) — somente leitura. Excluir/mesclar card com estoque e histórico
// de nota é operação do Flavio dentro do Bling, olho a olho.
function CardsBling({sku,motivo,por}:{sku:string;motivo:string|null;por:string|null}){
  const q=useQuery({queryKey:["mesa-produto-cards-bling",sku],queryFn:async()=>{const {data,error}=await supabase.from("vw_bling_card_360" as never).select("*").eq("sku",sku);if(error)throw error;return(data??[]) as CardBling[];}});
  const cards=useMemo(()=>[...(q.data??[])].sort((a,b)=>Number(b.e_canonico)-Number(a.e_canonico)||Number(b.estoque_atual??0)-Number(a.estoque_atual??0)),[q.data]);
  return <div className="space-y-2">
    <div className="flex flex-wrap items-baseline gap-2"><span className="text-xs font-medium">Cards no Bling</span><span className="text-xs text-muted-foreground">{cards.length} cadastros para o mesmo SKU{motivo?` · canônico escolhido por ${por==="manual"?"escolha manual":"regra"}: ${motivo}`:""}</span></div>
    {q.isLoading?<Skeleton className="h-16 w-full"/>:q.error?<Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertDescription>Não foi possível carregar os cards do Bling. Detalhe: {(q.error as Error).message}</AlertDescription></Alert>:cards.length===0?<p className="text-xs text-muted-foreground">Nenhum card encontrado.</p>:
    <div className="overflow-hidden rounded-md border bg-background"><table className="w-full text-xs"><thead><tr className="border-b bg-muted text-left"><th className="px-3 py-2 font-medium">ID no Bling</th><th className="px-3 py-2 font-medium">Nome no Bling</th><th className="px-3 py-2 font-medium">Situação</th><th className="px-3 py-2 text-right font-medium">Estoque</th><th className="px-3 py-2 text-right font-medium">Preço</th><th className="px-3 py-2 font-medium">Atualizado</th><th className="px-3 py-2 font-medium">Marcas</th></tr></thead><tbody>{cards.map(c=><tr key={c.bling_id} className={cn("border-b last:border-0",!c.e_canonico&&"text-muted-foreground")}><td className="px-3 py-2 tabular-nums">{c.bling_id}</td><td className="px-3 py-2">{c.nome_bling??"—"}</td><td className="px-3 py-2">{c.card_ativo==null?"—":c.card_ativo?"ativo":"inativo"}</td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(c.estoque_atual)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtMoeda(c.preco_venda)??"—"}</td><td className="px-3 py-2">{fmtDataHora(c.updated_at)}</td><td className="px-3 py-2"><div className="flex flex-wrap gap-1">
      {c.e_canonico&&<Tooltip><TooltipTrigger asChild><Badge className="font-normal">Canônico</Badge></TooltipTrigger><TooltipContent className="max-w-xs">é este que o sistema usa para enviar pedido e emitir nota</TooltipContent></Tooltip>}
      {c.ja_foi_usado&&<Tooltip><TooltipTrigger asChild><Badge variant="secondary" className="font-normal">Já usado</Badge></TooltipTrigger><TooltipContent className="max-w-xs">{fmtNum(c.n_envios)} envio(s) · último em {fmtDataHora(c.ultimo_envio)}</TooltipContent></Tooltip>}
      {c.nome_legado&&<Tooltip><TooltipTrigger asChild><Badge variant="outline" className="font-normal">Nome legado</Badge></TooltipTrigger><TooltipContent className="max-w-xs">nome no padrão antigo</TooltipContent></Tooltip>}
    </div></td></tr>)}</tbody></table></div>}
  </div>;
}
