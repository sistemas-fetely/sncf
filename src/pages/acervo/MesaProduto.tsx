import { Fragment, useEffect, useMemo, useState, type SetStateAction } from "react";
import { Link, useLocation } from "react-router-dom";
import { useEstadoTela, useFocoAoVoltar, useRestaurarScroll, montarFrom, resolverAcao, lerLista, escreverLista } from "@/lib/navegacao";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check,
  ChevronDown, Columns3, Download, GripVertical,
  ImageOff, PackageX, RefreshCw, Search, X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { buscarAlertasFormatoMesa } from "@/lib/acervo/mesaFormato";
import { BUSCA_MESA_DEBOUNCE_MS, ordenarFacetasMesa, parametrosMesaProduto } from "@/lib/acervo/mesaProdutoRpc";
import type { Json } from "@/integrations/supabase/types";
import { ExportarPlanilhaCadastroDialog } from "@/components/acervo/ExportarPlanilhaCadastroDialog";
import { FormatoInvalidoDialog, type AlertaFormato } from "@/components/acervo/FormatoInvalidoDialog";
// 20/10/2026 (Flavio): porta única de ajuste de cadastro = Conciliação; Mesa = só tabela
import { PageHeader } from "@/components/layout/PageHeader";
import { ProdutoAbas } from "@/components/produto/ProdutoAbas";
import { ExportarCamposPorSistemaButton } from "@/components/produto/ExportarCamposPorSistemaButton";
import { PageShell } from "@/components/layout/PageShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RodapePaginacao, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/components/tabela/RodapePaginacao";
import { usePreferenciaTela } from "@/hooks/usePreferenciaTela";
// 20/10/2026 (Flavio): Mesa = área de trabalho (só tabela); todo processo de consistência/correção vive na Conciliação de Cadastro
const MOSTRAR_CARDS_FASE = false as boolean;
import { fmtDataHora } from "@/lib/data";
// O de-para da conciliação virou componente compartilhado com a tela Conciliação de Cadastro.
import { type ConcLinha, type RegraDiv } from "@/components/acervo/DeParaConciliacao";

type Linha = Record<string, unknown> & {
  sku: string; cod_cadastro: string | null; nome_comercial: string | null;
  fase: string | null; fase_nome: string | null; fase_ordem: number | null;
  sugestao: string | null;
  falta_fase_atual: string[] | null; falta_proxima_fase: string[] | null;
  qtd_falta_atual: number | null; qtd_falta_proxima: number | null;
  falta_separada: string[] | null;
  foto_url: string | null; foto_exata: boolean | null; foto_origem: string | null;
};

type LinhaUnida = Linha & Partial<ConcLinha> & {
  pendencias: number; sistemas_pendencia: string[] | null; situacao: string | null;
  proxima_fase: string | null; cod_bling: string | null; cod_shopify: string | null; cod_xpm: string | null;
  shopify_sku_diverge: boolean | null; shopify_status: string | null;
};
type FacetaMesa = { valor: string; rotulo: string; contagem: number };
type MesaResultado = {
  total: number; pagina: number; tamanho: number; linhas: LinhaUnida[];
  facetas: Record<"situacao" | "fase" | "colecao" | "grupo" | "sistemas", FacetaMesa[]>;
  cards: { id: string; label: string; n: number; linha: string | null }[];
};
type FaseProduto = { slug: string; nome: string; ordem: number };
type CampoFicha = { campo: string; rotulo: string | null };
type TipoCol = "texto" | "num" | "bool" | "chips" | "fase" | "datahora" | "selos" | "divergencias" | "foto";
type ColDef = { key: string; rotulo: string; tipo: TipoCol; direita?: boolean };
// Indicador: slug da fase selecionada no funil — a Mesa é gestão de fase; os cards de
// problema (impacto, furo, pendência separada, anúncios) moram na Conciliação.
type Indicador = string | null;
type SituacaoDim = { slug: string; rotulo: string; descricao: string | null; fase_slug: string | null; tom: string | null; ordem: number };
const TOM_SITUACAO: Record<string, string> = {
  alerta: "border-destructive/40 bg-destructive/10 text-destructive-strong",
  atencao: "border-warning/40 bg-warning/10 text-warning-strong",
  bom: "border-success/40 bg-success/10 text-success-strong",
};
const COLUNAS_PADRAO = [
  "foto_url", "cod_cadastro", "sku", "cod_bling", "cod_shopify", "cod_xpm", "sistemas",
  "nome_comercial", "fase_nome", "pendencias", "grupo", "colecao",
  "qtd_falta_proxima", "falta_proxima_fase", "saldo_disponivel", "atualizado_em",
];
const COLUNAS: ColDef[] = [
  { key:"foto_url",rotulo:"Foto",tipo:"foto" }, { key:"foto_origem",rotulo:"Origem da foto",tipo:"texto" },
  { key:"cod_cadastro",rotulo:"Cód. Cadastro",tipo:"texto" }, { key:"sku",rotulo:"Cód. SKU",tipo:"texto" },
  { key:"cod_bling",rotulo:"Cód. Bling",tipo:"texto" }, { key:"cod_shopify",rotulo:"Cód. Shopify",tipo:"texto" },
  { key:"cod_xpm",rotulo:"Cód. XPM",tipo:"texto" }, { key:"sistemas",rotulo:"Sistemas",tipo:"selos" },
  { key:"nome_comercial",rotulo:"Nome comercial",tipo:"texto" }, { key:"fase_nome",rotulo:"Fase",tipo:"fase" },
  { key:"pendencias",rotulo:"Pendências",tipo:"num",direita:true },
  { key:"grupo",rotulo:"Grupo",tipo:"texto" }, { key:"colecao",rotulo:"Coleção",tipo:"texto" },
  { key:"qtd_falta_proxima",rotulo:"Falta para a próxima fase (qtd)",tipo:"num",direita:true }, { key:"falta_proxima_fase",rotulo:"Falta para a próxima fase",tipo:"chips" },
  { key:"tem_bling",rotulo:"Ficha no Bling",tipo:"bool" }, { key:"saldo_disponivel",rotulo:"Saldo disponível",tipo:"num",direita:true },
  { key:"atualizado_em",rotulo:"Atualizado em",tipo:"datahora" }, { key:"nome_operacional",rotulo:"Nome operacional",tipo:"texto" },
  { key:"nome_completo",rotulo:"Nome completo",tipo:"texto" }, { key:"fase",rotulo:"Fase (código)",tipo:"texto" },
  { key:"fase_ordem",rotulo:"Ordem da fase",tipo:"num",direita:true }, { key:"proxima_fase",rotulo:"Próxima fase",tipo:"texto" },
  { key:"sugestao",rotulo:"Sugestão",tipo:"texto" },
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
  { key:"falta_separada",rotulo:"Pendência separada",tipo:"chips" },
];
const ORDENAVEIS = new Set(["cod_cadastro","sku","nome_comercial","fase_ordem","pendencias","qtd_falta_proxima","qtd_divergencias","atualizado_em"]);
const fmtNum = (v: number | null | undefined) => typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "0";
const temValor = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";

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

function FiltroFacetado({ label, opcoes, selecionados, onChange, ordemDim }: { label:string; opcoes:{valor:string;rotulo:string;contagem:number}[]; selecionados:string[]; onChange:(v:string[])=>void; ordemDim?:ReadonlyMap<string,number> }) {
  return <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="gap-2 font-normal"><span className="text-muted-foreground">{label}</span>{selecionados.length>0&&<Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{selecionados.length}</Badge>}<ChevronDown className="h-3.5 w-3.5 opacity-50" /></Button></PopoverTrigger><PopoverContent align="start" className="w-64 p-1"><div className="max-h-72 overflow-auto">{ordenarFacetasMesa(opcoes, selecionados, ordemDim).map(o=><Button key={o.valor} variant="ghost" size="sm" className={cn("w-full justify-start gap-2 font-normal",o.contagem===0&&"text-muted-foreground")} onClick={()=>onChange(selecionados.includes(o.valor)?selecionados.filter(v=>v!==o.valor):[...selecionados,o.valor])}><span className={cn("flex h-4 w-4 items-center justify-center rounded border",selecionados.includes(o.valor)&&"border-primary bg-primary text-primary-foreground")}>{selecionados.includes(o.valor)&&<Check className="h-3 w-3"/>}</span><span className="flex-1 truncate text-left">{o.rotulo}</span><span className="tabular-nums text-muted-foreground">{o.contagem}</span></Button>)}</div>{selecionados.length>0&&<Button variant="ghost" size="sm" className="mt-1 w-full" onClick={()=>onChange([])}>Limpar seleção</Button>}</PopoverContent></Popover>;
}

export default function MesaProduto() {
  const location=useLocation();
  // TELA-LEMBRA-ONDE-EU-ESTAVA: recorte, ordem e página vivem na URL.
  const [nav,setNav]=useEstadoTela({busca:"",sit:"",fase:"",col:"",grp:"",sis:"",ind:"",ordem:"cod_cadastro:asc",pagina:1},{replaceKeys:["busca"]});
  const busca=nav.busca; const setBusca=(v:string)=>setNav({busca:v,pagina:1});
  const [buscaBanco,setBuscaBanco]=useState(busca);
  useEffect(()=>{const timer=setTimeout(()=>setBuscaBanco(busca),BUSCA_MESA_DEBOUNCE_MS);return()=>clearTimeout(timer);},[busca]);
  const situacoes=useMemo(()=>lerLista(nav.sit),[nav.sit]); const setSituacoes=(v:string[])=>setNav({sit:escreverLista(v),pagina:1});
  const fasesSel=useMemo(()=>lerLista(nav.fase),[nav.fase]); const setFasesSel=(v:string[])=>setNav({fase:escreverLista(v),pagina:1});
  const [exportCad,setExportCad]=useState(false);
  const [exportSoMedicao,setExportSoMedicao]=useState(false);
  const [exportCods,setExportCods]=useState<string[]|null>(null);
  const [formatoAberto,setFormatoAberto]=useState(false);
  const formato=useQuery({queryKey:["mesa-formato-alerta"],staleTime:5*60_000,queryFn:buscarAlertasFormatoMesa});
  const nFormato=new Set((formato.data??[]).filter(a=>a.fase!=="inativo").map(a=>a.cod_cadastro)).size;
  const aguardandoMedicao=useQuery({queryKey:["mesa-aguardando-medicao"],staleTime:5*60_000,queryFn:async()=>{
    const {data,error}=await supabase.functions.invoke("exportar-planilha-produto",{body:{so_contagem:true}});
    if(error){let m=error.message;try{const ctx=(error as {context?:Response}).context;const j=ctx?await ctx.json():null;if(j?.erro)m=j.erro;}catch{/* mantém */}throw new Error(m);}
    if(!data?.ok)throw new Error(data?.erro??"Resposta inválida do FOP");
    return Number(data.aguardando_medicao);
  }});
  const colecoes=useMemo(()=>lerLista(nav.col),[nav.col]); const setColecoes=(v:string[])=>setNav({col:escreverLista(v),pagina:1});
  const grupos=useMemo(()=>lerLista(nav.grp),[nav.grp]); const setGrupos=(v:string[])=>setNav({grp:escreverLista(v),pagina:1});
  const sistemas=useMemo(()=>lerLista(nav.sis),[nav.sis]); const setSistemas=(v:string[])=>setNav({sis:escreverLista(v),pagina:1});
  const indicador:Indicador=nav.ind||null; const setIndicador=(v:Indicador)=>setNav({ind:v??"",pagina:1}); const [visiveis,setVisiveis]=useState<string[]>(COLUNAS_PADRAO);
  const [ordemColunas,setOrdemColunas]=useState<string[]>(COLUNAS.map(c=>c.key)); const [arrastando,setArrastando]=useState<string|null>(null);
  const ordem=useMemo(()=>{const [coluna,dir]=nav.ordem.split(":");return{coluna:coluna||"cod_cadastro",dir:(dir==="desc"?"desc":"asc") as "asc"|"desc"};},[nav.ordem]);
  const setOrdem=(v:SetStateAction<{coluna:string;dir:"asc"|"desc"}>)=>{const o=resolverAcao(v,ordem);setNav({ordem:`${o.coluna}:${o.dir}`,pagina:1});};
  const pagina=nav.pagina; const setPagina=(v:number)=>setNav({pagina:v}); const [tamanho,setTamanho]=useState<number>(DEFAULT_PAGE_SIZE);
  const [fotoAberta,setFotoAberta]=useState<{url:string;nome:string}|null>(null);
  // Seleção em lote (por SKU). Limpa quando o recorte de filtros muda.
  const qc=useQueryClient();
  const recarregarMesa=()=>qc.invalidateQueries({queryKey:["mesa-produto"]});;
  // A regressão em lote (mutirão) mora na tela Conciliação de Cadastro.


  // Preferencia por usuario, no banco: colunas visiveis, ordem das colunas e
  // tamanho de pagina. Aba, filtros e busca ficam de fora — recorte e' do momento.
  // Coluna que nao existe mais na view e' ignorada em silencio.
  const pref=usePreferenciaTela<{colunas_visiveis?:string[];ordem_colunas?:string[];tamanho_pagina?:number}>("mesa_produto",{});
  const [hidratado,setHidratado]=useState(false);
  useEffect(()=>{
    if(hidratado||pref.carregando)return;
    const chaves=new Set(COLUNAS.map(c=>c.key));
    const vis=Array.isArray(pref.preferencias.colunas_visiveis)?pref.preferencias.colunas_visiveis.filter(k=>typeof k==="string"&&chaves.has(k)):null;
    if(vis&&vis.length)setVisiveis([...new Set([...COLUNAS_PADRAO.filter(k=>["foto_url","cod_cadastro"].includes(k)),...vis])]);
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


  const params=useMemo(()=>parametrosMesaProduto({busca:buscaBanco,situacao:situacoes,fase:fasesSel,colecao:colecoes,grupo:grupos,sistemas,indicador,ordem_coluna:ordem.coluna,ordem_dir:ordem.dir,pagina,tamanho}),[buscaBanco,situacoes,fasesSel,colecoes,grupos,sistemas,indicador,ordem,pagina,tamanho]);
  const mesa=useQuery({queryKey:["mesa-produto",params],placeholderData:keepPreviousData,queryFn:async({signal})=>{
    // RPC já existente no banco, ainda ausente dos tipos gerados.
    const {data,error}=await supabase.rpc("fn_mesa_produto" as never,{p:params as unknown as Json} as never).abortSignal(signal);
    if(error)throw error;
    if(!data)throw new Error("A consulta da Mesa não retornou dados.");
    return data as unknown as MesaResultado;
  }});
  const fasesDim=useQuery({queryKey:["produto-fase-dim"],queryFn:async()=>{const {data,error}=await supabase.from("produto_fase_dim").select("slug, nome, ordem").order("ordem");if(error)throw error;return(data??[]) as FaseProduto[];}});
  const camposDim=useQuery({queryKey:["produto-ficha-rotulos"],queryFn:async()=>{const {data,error}=await supabase.from("produto_ficha_nascimento").select("campo, rotulo");if(error)throw error;return(data??[]) as CampoFicha[];}});
  const regrasDim=useQuery({queryKey:["divergencia-regra"],queryFn:async()=>{const {data,error}=await supabase.from("divergencia_regra" as never).select("slug, nome, sistema, consequencia, o_que_fazer, onde_resolver, ordem").order("ordem");if(error)throw error;return(data??[]) as RegraDiv[];}});
  const regraPorSlug=useMemo(()=>new Map((regrasDim.data??[]).map(r=>[r.slug,r])),[regrasDim.data]);
  const rotuloCampoPorSlug=useMemo(()=>new Map((camposDim.data??[]).map(c=>[c.campo,c.rotulo?.trim()||c.campo])),[camposDim.data]);
  const situacoesDim=useQuery({queryKey:["produto-mesa-situacao-dim"],staleTime:10*60*1000,queryFn:async()=>{const {data,error}=await (supabase as any).from("produto_mesa_situacao_dim").select("slug, rotulo, descricao, fase_slug, tom, ordem").eq("ativo",true).order("ordem");if(error)throw error;return(data??[]) as SituacaoDim[];}});
  const situacaoPorSlug=useMemo(()=>new Map((situacoesDim.data??[]).map(s=>[s.slug,s])),[situacoesDim.data]);
  const ordemSituacoes=useMemo(()=>new Map((situacoesDim.data??[]).map(s=>[s.slug,s.ordem])),[situacoesDim.data]);
  const ordemFases=useMemo(()=>new Map((fasesDim.data??[]).map(f=>[f.slug,f.ordem])),[fasesDim.data]);
  const rotuloSituacao=(slug:string|null|undefined)=>slug?(situacaoPorSlug.get(slug)?.rotulo??slug):"";
  const rotuloDoSlug=(slug:string)=>regraPorSlug.get(slug)?.nome??slug;
  const carregando=mesa.isLoading||situacoesDim.isLoading||fasesDim.isLoading||camposDim.isLoading||regrasDim.isLoading;
  const erro=mesa.error??situacoesDim.error??fasesDim.error??camposDim.error??regrasDim.error;
  const cards=mesa.data?.cards??[];
  const facetas=mesa.data?.facetas;
  const filtrosAtivos=(busca?1:0)+situacoes.length+fasesSel.length+colecoes.length+grupos.length+sistemas.length+(indicador?1:0);
  const colunasVisiveis=ordemColunas.map(k=>COLUNAS.find(c=>c.key===k)).filter((c):c is ColDef=>!!c&&visiveis.includes(c.key));
  const total=mesa.data?.total??0;
  const paginaAtual=mesa.data?.pagina??pagina;
  const paginaLinhas=mesa.data?.linhas??[];
  const estado=`${total} produtos`;
  useFocoAoVoltar({pronto:!carregando&&!mesa.isPlaceholderData&&!mesa.isFetching,idsVisiveis:paginaLinhas.map(l=>l.cod_cadastro??l.sku).filter(Boolean).map(String)});
  useRestaurarScroll(null,!carregando&&!mesa.isPlaceholderData&&!mesa.isFetching);

  function limpar(){setBusca("");setSituacoes([]);setFasesSel([]);setColecoes([]);setGrupos([]);setSistemas([]);setIndicador(null);}
  function ordenar(key:string){if(!ORDENAVEIS.has(key))return;setOrdem(o=>o.coluna===key?{coluna:key,dir:o.dir==="asc"?"desc":"asc"}:{coluna:key,dir:"asc"});}
  function mover(destino:string){if(!arrastando||arrastando===destino||["foto_url","cod_cadastro"].includes(arrastando))return;setOrdemColunas(atual=>{const n=atual.filter(k=>k!==arrastando);const i=n.indexOf(destino);n.splice(Math.max(2,i),0,arrastando);return n;});setArrastando(null);}
  const ultima=(l:LinhaUnida)=>!l.proxima_fase||String(l.proxima_fase).toLowerCase()==="inativo";
  const chips=(itens:string[]|null|undefined,usarRotuloCampo=false)=><div className="flex flex-wrap gap-1">{!itens?.length?<span className="text-muted-foreground">—</span>:<>{itens.slice(0,3).map(x=><Badge key={x} variant="outline" className="font-normal">{usarRotuloCampo?(rotuloCampoPorSlug.get(x)??x):x}</Badge>)}{itens.length>3&&<Badge variant="outline" className="font-normal">+{itens.length-3}</Badge>}</>}</div>;
  const chipDivergencia=(slug:string)=>{const r=regraPorSlug.get(slug);return <Tooltip key={slug}><TooltipTrigger asChild><Badge variant="outline" className="font-normal">{r?.nome??slug}</Badge></TooltipTrigger><TooltipContent className="max-w-xs space-y-1"><p>{r?.consequencia??slug}</p>{r?.onde_resolver&&<p className="text-muted-foreground">resolve-se no {r.onde_resolver}</p>}</TooltipContent></Tooltip>;};
  const chipsDivergencia=(itens:string[]|null|undefined)=><div className="flex flex-wrap gap-1">{!itens?.length?<span className="text-muted-foreground">—</span>:<>{itens.slice(0,3).map(slug=>chipDivergencia(slug))}{itens.length>3&&<Tooltip><TooltipTrigger asChild><Badge variant="outline" className="font-normal">+{itens.length-3}</Badge></TooltipTrigger><TooltipContent className="max-w-xs">{itens.slice(3).map(rotuloDoSlug).join(" · ")}</TooltipContent></Tooltip>}</>}</div>;
  const selos=(l:LinhaUnida)=><div className="flex gap-1">{[["B","Bling",temValor(l.cod_bling),false],["S","Shopify",temValor(l.cod_shopify),l.shopify_sku_diverge===true],["X","XPM",temValor(l.cod_xpm),false]].map(([letra,nome,ok,div])=><Tooltip key={String(letra)}><TooltipTrigger asChild><span className={cn("inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-medium",ok?(div?"border-warning/40 bg-warning/10 text-warning-strong":"border-success/40 bg-success/10 text-success-strong"):"border-destructive/40 bg-destructive/10 text-destructive-strong")}>{String(letra)}</span></TooltipTrigger><TooltipContent>{nome}: {ok?(div?"presente, mas com SKU diferente do nosso":letra==="S"?(new Map([["active","presente (ativo)"],["draft","presente (rascunho)"],["archived","presente (arquivado)"],["unlisted","presente (não listado)"]]).get(String(l.shopify_status??"").toLowerCase())??"presente"):"presente"):"não encontrado"}</TooltipContent></Tooltip>)}</div>;
  function celula(l:LinhaUnida,c:ColDef){const v=l[c.key];if(c.tipo==="foto")return <MiniFoto url={l.foto_url??null} origem={l.foto_origem??null} nome={l.nome_comercial??l.sku} onAmpliar={(url,nome)=>setFotoAberta({url,nome})}/>;if(c.key==="foto_origem")return <span className={cn(!l.foto_origem&&"text-muted-foreground")}>{rotuloFotoOrigem(l.foto_origem)}</span>;if(c.tipo==="selos")return selos(l);if(c.tipo==="fase")return <Badge>{String(v??l.fase??"—")}</Badge>;if(c.tipo==="chips"){if(c.key==="falta_proxima_fase"&&ultima(l))return <Tooltip><TooltipTrigger>—</TooltipTrigger><TooltipContent>produto já está na última fase — descontinuar é ação, não promoção</TooltipContent></Tooltip>;const campoFaltante=c.key==="falta_proxima_fase"||c.key==="falta_separada";return chips(Array.isArray(v)?v.map(String):null,campoFaltante);}if(c.tipo==="divergencias")return chipsDivergencia(l.divergencias);if(c.tipo==="bool")return v==null?<span className="text-muted-foreground">—</span>:v?<Check className="h-4 w-4 text-success"/>:<X className="h-4 w-4 text-destructive"/>;if(c.tipo==="datahora")return <span className="text-muted-foreground">{fmtDataHora(typeof v==="string"?v:null)}</span>;if(c.key==="pendencias"){if(!l.pendencias)return <span className="text-muted-foreground">—</span>;return <Link to={`/vendas/produto/conciliacao?q=${l.cod_cadastro}`} className="tabular-nums text-muted-foreground hover:text-foreground hover:underline">{l.pendencias}{(l.sistemas_pendencia??[]).length>0&&<span className="text-[11px] lowercase"> · {(l.sistemas_pendencia??[]).join(", ").toLowerCase()}</span>}</Link>;}if(c.key==="sugestao"){if(!l.situacao)return <span className="text-muted-foreground">—</span>;const s=situacaoPorSlug.get(l.situacao);return <Badge variant="outline" className={cn("font-normal",s?.tom?TOM_SITUACAO[s.tom]:undefined)}>{rotuloSituacao(l.situacao)}</Badge>;}if(c.tipo==="num"){if(c.key==="qtd_falta_proxima"&&ultima(l))return <Tooltip><TooltipTrigger>—</TooltipTrigger><TooltipContent>produto já está na última fase — descontinuar é ação, não promoção</TooltipContent></Tooltip>;return v==null?<span className="text-muted-foreground">—</span>:<span className={cn("tabular-nums",c.key==="qtd_falta_proxima"&&Number(v)===0&&"text-success-strong")}>{fmtNum(Number(v))}</span>;}if(!temValor(v)){const nome=c.key==="cod_bling"?"Bling":c.key==="cod_shopify"?"Shopify":c.key==="cod_xpm"?"XPM":null;return nome?<Tooltip><TooltipTrigger><span className="text-muted-foreground">—</span></TooltipTrigger><TooltipContent>não encontrado no {nome}</TooltipContent></Tooltip>:<span className="text-muted-foreground">—</span>;}const texto=String(v);if(c.key==="cod_cadastro")return <span className="inline-flex flex-col leading-tight"><Link to={`/vendas/produto/ficha/${encodeURIComponent(texto)}`} state={{from:montarFrom(location.pathname,location.search,texto),fromLabel:"Central do Produto"}} className="font-mono font-medium hover:underline">{texto}</Link>{l.sku&&<span className="font-mono text-[11px] text-muted-foreground">{l.sku}</span>}</span>;if(c.key==="cod_bling")return <span className="block min-w-56 whitespace-normal">{texto}</span>;if(c.key==="cod_shopify"||c.key==="cod_xpm")return <span className={cn("block max-w-44 truncate",c.key==="cod_shopify"&&l.shopify_sku_diverge&&"text-warning-strong")}>{texto}</span>;return <span>{texto}</span>;}

  const fixa=(key:string,cab=false)=>key==="foto_url"?cn("sticky left-0 w-14 bg-muted",cab?"z-50":"z-20"):key==="cod_cadastro"?cn("sticky left-14 w-28 border-r bg-muted",cab?"z-50":"z-20"):"";
  return <TooltipProvider delayDuration={200}><PageShell><ExportarPlanilhaCadastroDialog open={exportCad} onOpenChange={setExportCad} inicialSoMedicao={exportSoMedicao} cods={exportCods}/><FormatoInvalidoDialog open={formatoAberto} onOpenChange={setFormatoAberto} alertas={formato.data??[]} erro={formato.error?(formato.error as Error).message:null} onExportar={(c)=>{setFormatoAberto(false);setExportSoMedicao(false);setExportCods(c);setExportCad(true);}}/><PageHeader titulo="Central do Produto" icone={PackageX} estado={carregando?"Carregando produtos…":estado} acoes={<><ExportarCamposPorSistemaButton /><Button size="sm" onClick={async()=>{await Promise.all([recarregarMesa(),regrasDim.refetch(),camposDim.refetch()]);}} disabled={mesa.isFetching||regrasDim.isFetching||camposDim.isFetching}><RefreshCw className={cn("mr-2 h-4 w-4",(mesa.isFetching||regrasDim.isFetching||camposDim.isFetching)&&"animate-spin")}/>Atualizar</Button></>}/>
  <ProdutoAbas />
  {erro&&<Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertDescription>Não foi possível carregar os produtos. Atualize a página para tentar novamente. Detalhe: {(erro as Error).message}</AlertDescription></Alert>}
  {/* 20/10/2026 (Flavio): Mesa = área de trabalho (só tabela); todo processo de consistência/correção vive na Conciliação de Cadastro */}
  {/* 20/10/2026: cards de fase saíram da Mesa; Mesa é área de trabalho */}
  {MOSTRAR_CARDS_FASE&&<section className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Indicadores">{carregando?Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-20"/>):cards.map(c=>{const selecionado=indicador===c.id;const card=<Button key={c.label} variant="outline" className={cn("h-auto min-h-20 items-start justify-center border p-3 text-left",selecionado&&"ring-2 ring-primary ring-offset-2 ring-offset-background")} onClick={()=>setIndicador(selecionado?null:c.id)}><span className="flex w-full flex-col"><span className="text-[11px] font-normal text-muted-foreground">{c.label}</span><span className="mt-1 text-[21px] font-medium tabular-nums text-foreground">{c.n}</span>{c.linha&&<span className="truncate text-[11px] font-normal text-muted-foreground">{c.linha}</span>}</span></Button>;return card;})}{!carregando&&(aguardandoMedicao.isLoading?<Skeleton className="h-20"/>:<Button variant="outline" className="h-auto min-h-20 items-start justify-center border p-3 text-left" title={aguardandoMedicao.error?(aguardandoMedicao.error as Error).message:"Abrir a lista para o showroom medir"} onClick={()=>{setExportSoMedicao(true);setExportCods(null);setExportCad(true);}}><span className="flex w-full flex-col"><span className="text-[11px] font-normal text-muted-foreground">Aguardando medição</span><span className={cn("mt-1 text-[21px] font-medium tabular-nums",aguardandoMedicao.error?"text-destructive":"text-foreground")}>{aguardandoMedicao.error?"erro":aguardandoMedicao.data}</span><span className="truncate text-[11px] font-normal text-muted-foreground">{aguardandoMedicao.error?(aguardandoMedicao.error as Error).message:"lista para o showroom"}</span></span></Button>)}{!carregando&&(formato.isLoading?<Skeleton className="h-20"/>:<Button variant="outline" className="h-auto min-h-20 items-start justify-center border p-3 text-left" title={formato.error?(formato.error as Error).message:"Ver campos fora do formato da ficha"} onClick={()=>setFormatoAberto(true)}><span className="flex w-full flex-col"><span className="text-[11px] font-normal text-muted-foreground">Formato inválido</span><span className={cn("mt-1 text-[21px] font-medium tabular-nums",formato.error?"text-destructive":"text-foreground")}>{formato.error?"erro":nFormato}</span><span className="truncate text-[11px] font-normal text-muted-foreground">{formato.error?(formato.error as Error).message:"produtos fora de inativo"}</span></span></Button>)}</section>}
  <section className="flex flex-wrap items-center gap-2 border-y py-3"><div className="relative min-w-64 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={busca} onChange={e=>setBusca(e.target.value)} className="pl-9" placeholder="Buscar código, SKU, nome ou EAN"/></div>
  <FiltroFacetado label="Situação" ordemDim={ordemSituacoes} selecionados={situacoes} onChange={setSituacoes} opcoes={facetas?.situacao??[]}/>
  <FiltroFacetado label="Fase" ordemDim={ordemFases} selecionados={fasesSel} onChange={setFasesSel} opcoes={facetas?.fase??[]}/>
  <FiltroFacetado label="Coleção" selecionados={colecoes} onChange={setColecoes} opcoes={facetas?.colecao??[]}/>
  <FiltroFacetado label="Grupo" selecionados={grupos} onChange={setGrupos} opcoes={facetas?.grupo??[]}/>
  <FiltroFacetado label="Sistemas" selecionados={sistemas} onChange={setSistemas} opcoes={facetas?.sistemas??[]}/>
  <Popover><PopoverTrigger asChild><Button variant="outline" size="sm"><Columns3 className="mr-2 h-4 w-4"/>Colunas ({colunasVisiveis.length})</Button></PopoverTrigger><PopoverContent align="end" className="w-80 p-0"><div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground"><span>Arraste para reordenar</span><Button variant="ghost" size="sm" onClick={()=>{setVisiveis(COLUNAS_PADRAO);setOrdemColunas(COLUNAS.map(c=>c.key));}}>Padrão</Button></div><ScrollArea className="h-96"><div className="p-2">{ordemColunas.map(k=>COLUNAS.find(c=>c.key===k)).filter((c):c is ColDef=>!!c).map(c=>{const fixaId=["foto_url","cod_cadastro"].includes(c.key);return <div key={c.key} draggable={!fixaId} onDragStart={()=>setArrastando(c.key)} onDragOver={e=>e.preventDefault()} onDrop={()=>mover(c.key)} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"><GripVertical className={cn("h-4 w-4 text-muted-foreground",fixaId&&"opacity-30")}/><Checkbox checked={visiveis.includes(c.key)} disabled={fixaId} onCheckedChange={()=>setVisiveis(v=>v.includes(c.key)?v.filter(x=>x!==c.key):[...v,c.key])}/><span className="truncate text-sm">{c.rotulo}</span></div>})}</div></ScrollArea></PopoverContent></Popover>
  {filtrosAtivos>0&&<Button variant="ghost" size="sm" onClick={limpar}>Limpar filtros ({filtrosAtivos})</Button>}</section>
  {carregando?<div className="space-y-2">{Array.from({length:8}).map((_,i)=><Skeleton key={i} className="h-11 w-full"/>)}</div>:paginaLinhas.length===0?<div className="py-12 text-center"><p className="text-sm text-muted-foreground">Nenhum produto neste recorte.</p><Button variant="link" onClick={limpar}>Limpar filtros</Button></div>:<div className="overflow-hidden rounded-md border bg-card"><Table className="text-xs" containerClassName="mesa-produto-scroll max-h-[calc(100vh-17rem)]"><TableHeader><TableRow>{colunasVisiveis.map(c=><TableHead key={c.key} className={cn("sticky top-0 z-40 whitespace-nowrap font-medium",c.direita&&"text-right",fixa(c.key,true))} aria-sort={ordem.coluna===c.key?(ordem.dir==="asc"?"ascending":"descending"):"none"}>{ORDENAVEIS.has(c.key)?<Button variant="ghost" size="sm" className="h-auto p-0 font-medium" onClick={()=>ordenar(c.key)}>{c.rotulo}{ordem.coluna!==c.key?<ArrowUpDown className="ml-1 h-3 w-3"/>:ordem.dir==="asc"?<ArrowUp className="ml-1 h-3 w-3"/>:<ArrowDown className="ml-1 h-3 w-3"/>}</Button>:c.rotulo}</TableHead>)}</TableRow></TableHeader><TableBody>{paginaLinhas.map(l=>{return <Fragment key={l.sku}><TableRow className="border-b" data-foco-id={String(l.cod_cadastro??l.sku)}>{colunasVisiveis.map(c=><TableCell key={c.key} className={cn("py-2.5 align-top",c.direita&&"text-right",fixa(c.key))}>{celula(l,c)}</TableCell>)}</TableRow></Fragment>;})}</TableBody></Table><RodapePaginacao total={total} pagina={paginaAtual} tamanhoPagina={mesa.data?.tamanho??tamanho} tela="mesa_produto" onPagina={setPagina} onTamanhoPagina={setTamanho} /></div>}
  <Dialog open={!!fotoAberta} onOpenChange={o=>!o&&setFotoAberta(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{fotoAberta?.nome}</DialogTitle></DialogHeader>{fotoAberta&&<img src={fotoAberta.url} alt={fotoAberta.nome} className="max-h-[70vh] w-full rounded-md object-contain"/>}</DialogContent></Dialog>
  </PageShell></TooltipProvider>;
}
