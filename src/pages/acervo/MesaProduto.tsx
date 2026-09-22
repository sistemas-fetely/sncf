import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpCircle, ArrowUpDown, Ban, Check,
  ChevronDown, ChevronRight, Columns3, Download, GripVertical,
  ImageOff, PackageX, RefreshCw, Search, X,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RodapePaginacao, lerTamanhoPaginaSalvo } from "@/components/tabela/RodapePaginacao";
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
};

type CardBling = {
  sku: string; bling_id: string; nome_bling: string | null; card_ativo: boolean | null;
  estoque_atual: number | null; preco_venda: number | null; updated_at: string | null;
  nome_bate_catalogo: boolean | null; nome_legado: boolean | null; e_canonico: boolean | null;
  escolhido_por: string | null; motivo_canonico: string | null; n_candidatos: number | null;
  ja_foi_usado: boolean | null; n_envios: number | null; ultimo_envio: string | null;
};

type LinhaUnida = Linha & Partial<ConcLinha>;
type TipoCol = "texto" | "num" | "bool" | "chips" | "fase" | "datahora" | "selos" | "divergencias" | "foto";
type ColDef = { key: string; rotulo: string; tipo: TipoCol; direita?: boolean };
type ErroFuncao = { status: number; corpo: Record<string, unknown> };
type Indicador = "prontos" | "bloqueados" | "furo" | "divergencia" | null;
type GrupoFiltro = "situacao" | "fase" | "colecao" | "grupo" | "sistemas";

type SevDiv = "critico" | "atencao";
const DIC_DIV: Record<string, { rotulo: string; sev: SevDiv; explicacao: string }> = {
  sem_cartorio: { rotulo: "Sem registro no cartório", sev: "critico", explicacao: "Produto existe mas o código não está no cartório." },
  cartorio_nao_alocado: { rotulo: "Código não alocado", sev: "critico", explicacao: "Produto usa código que o cartório não marcou como alocado." },
  cartorio_sem_inner: { rotulo: "Cartório sem Inner", sev: "atencao", explicacao: "Código alocado sem a quantidade do Inner. Vem do packing list." },
  cartorio_sku_diverge: { rotulo: "SKU diverge do cartório", sev: "critico", explicacao: "O SKU do produto não bate com o registrado no cartório." },
  sem_bling: { rotulo: "Sem produto no Bling", sev: "critico", explicacao: "Não fatura: não existe no ERP." },
  bling_duplicado: { rotulo: "Código duplicado no Bling", sev: "critico", explicacao: "Mais de uma linha no Bling com o mesmo código." },
  bling_ean_diverge: { rotulo: "EAN diverge do Bling", sev: "critico", explicacao: "O GTIN do Bling não bate com o EAN do cadastro." },
  bling_ncm_diverge: { rotulo: "NCM diverge do Bling", sev: "critico", explicacao: "NCM diferente entre cadastro e ERP: risco fiscal na NF-e." },
  bling_inativo_com_ativo: { rotulo: "Inativo no Bling", sev: "critico", explicacao: "Produto ativo aqui e inativo no ERP." },
  sem_ficha_bling: { rotulo: "Sem ficha no Bling", sev: "critico", explicacao: "Ativo sem ficha criada no ERP." },
  sem_xpm: { rotulo: "Sem cadastro no XPM", sev: "critico", explicacao: "Não expede: o armazém não conhece o produto." },
  xpm_ean_diverge: { rotulo: "EAN diverge do XPM", sev: "critico", explicacao: "Etiqueta do armazém não bate com o EAN do cadastro." },
  xpm_ncm_vazio: { rotulo: "NCM vazio no XPM", sev: "atencao", explicacao: "Cadastrado no armazém sem NCM." },
  xpm_ncm_diverge: { rotulo: "NCM diverge do XPM", sev: "critico", explicacao: "NCM diferente entre cadastro e armazém." },
  xpm_peso_padrao: { rotulo: "Peso padrão no XPM (10,11 kg)", sev: "critico", explicacao: "Valor default que ninguém corrigiu. Peso errado = cubagem e frete errados." },
  xpm_peso_diverge: { rotulo: "Peso diverge do XPM", sev: "atencao", explicacao: "Peso do armazém fora de 10% do cadastro." },
  bling_preco_diverge: { rotulo: "Preço diverge do Bling", sev: "critico", explicacao: "Preço do ERP diferente do catálogo: a NF sai com o preço do ERP." },
  bling_marca_diverge: { rotulo: "Marca diverge do Bling", sev: "atencao", explicacao: "Marca diferente entre catálogo e ERP." },
  bling_nome_diverge: { rotulo: "Nome diverge do Bling", sev: "critico", explicacao: "O nome do card no Bling não bate com o nome comercial. No Bling o nome é a chave de identificação — nome errado é card errado na nota." },
  sem_shopify: { rotulo: "Sem produto no Shopify", sev: "atencao", explicacao: "Produto ativo que não existe na vitrine." },
  shopify_preco_diverge: { rotulo: "Preço diverge do Shopify", sev: "critico", explicacao: "O consumidor final vê um preço diferente do catálogo." },
  shopify_barcode_diverge: { rotulo: "Código de barras diverge do Shopify", sev: "critico", explicacao: "A etiqueta da loja não bate com o EAN." },
};
// Slug desconhecido do dicionário conta como crítico (não pode passar batido).
const sevDoSlug = (slug: string): SevDiv => DIC_DIV[slug]?.sev ?? "critico";
const rotuloDoSlug = (slug: string) => DIC_DIV[slug]?.rotulo ?? slug;

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
const predSistema = (l: LinhaUnida, v: string): boolean =>
  v === "sem_bling" ? !temValor(l.cod_bling)
  : v === "bling_card_duplicado" ? (l.bling_n_cards ?? 0) > 1
  : v === "sem_shopify" ? l.no_shopify !== true
  : v === "sem_xpm" ? !temValor(l.cod_xpm)
  : v === "sem_foto_propria" ? l.foto_origem !== "produto"
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
  const [ordem,setOrdem]=useState({coluna:"cod_cadastro",dir:"asc" as "asc"|"desc"}); const [pagina,setPagina]=useState(1); const [tamanho,setTamanho]=useState<number>(()=>lerTamanhoPaginaSalvo("mesa-produto-tamanho-pagina"));
  const [expandido,setExpandido]=useState<string|null>(null); const [emAcao,setEmAcao]=useState<string|null>(null);
  const [confirmSaldo,setConfirmSaldo]=useState<{sku:string;saldo:number}|null>(null); const [faltando,setFaltando]=useState<{sku:string;campos:string[]}|null>(null); const [erroFop,setErroFop]=useState<{sku:string;corpo:string}|null>(null);
  const [fotoAberta,setFotoAberta]=useState<{url:string;nome:string}|null>(null);

  const lista=useQuery({queryKey:["mesa-produto-lista"],queryFn:async()=>{const {data,error}=await supabase.from("vw_produto_mesa_lista" as never).select("*").order("cod_cadastro");if(error)throw error;return(data??[]) as Linha[];}});
  const conc=useQuery({queryKey:["mesa-produto-conciliacao-360"],queryFn:async()=>{const {data,error}=await supabase.from("vw_produto_conciliacao_360" as never).select("*");if(error)throw error;return(data??[]) as ConcLinha[];}});
  const sugestoes=useQuery({queryKey:["mesa-produto-sugestoes"],queryFn:async()=>{const slugs=SITUACOES.filter(([slug])=>slug!=="__sem__").map(([slug])=>slug);const respostas=await Promise.all(slugs.map(async slug=>{const {data,error}=await supabase.from("vw_produto_mesa_fase" as never).select("sku, sugestao").eq("sugestao",slug);if(error)throw error;return(data??[]) as {sku:string;sugestao:string|null}[];}));return respostas.flat();}});
  const linhas=useMemo(()=>{const mapa=new Map((conc.data??[]).map(c=>[c.sku,c]));const sugestaoPorSku=new Map((sugestoes.data??[]).map(l=>[l.sku,l.sugestao]));return(lista.data??[]).map(l=>{const unida={...l,...(mapa.get(l.sku)??{})} as LinhaUnida;const sugestaoRecebida=sugestaoPorSku.get(l.sku)??l.sugestao;if(unida.fase!=="ativo")return{...unida,sugestao:sugestaoRecebida};if(!temValor(unida.cod_bling))return{...unida,sugestao:"ativo_sem_bling"};if((unida.qtd_falta_atual??0)>0)return{...unida,sugestao:"ativo_com_furo"};return{...unida,sugestao:null};}) as LinhaUnida[];},[lista.data,conc.data,sugestoes.data]);
  const carregando=lista.isLoading||conc.isLoading||sugestoes.isLoading; const erro=lista.error??conc.error??sugestoes.error;
  const fases=useMemo(()=>{const m=new Map<string,{valor:string;rotulo:string;ordem:number}>();for(const l of linhas){const v=l.fase??"__sem__";if(!m.has(v))m.set(v,{valor:v,rotulo:l.fase_nome??l.fase??"Sem fase",ordem:l.fase_ordem??999});}return[...m.values()].sort((a,b)=>a.ordem-b.ordem);},[linhas]);
  const valores=(key:"colecao"|"grupo")=>[...new Set(linhas.map(l=>l[key]).filter(temValor).map(String))].sort((a,b)=>a.localeCompare(b,"pt-BR"));

  function aplica(l:LinhaUnida, ignorar?:GrupoFiltro, semIndicador=false){
    const q=busca.trim().toLocaleLowerCase("pt-BR"); if(q&&![l.cod_cadastro,l.sku,l.nome_comercial,l.ean].filter(temValor).some(v=>String(v).toLocaleLowerCase("pt-BR").includes(q)))return false;
    if(ignorar!=="situacao"&&situacoes.length&&!situacoes.includes(l.sugestao??"__sem__"))return false;
    if(ignorar!=="fase"&&fasesSel.length&&!fasesSel.includes(l.fase??"__sem__"))return false;
    if(ignorar!=="colecao"&&colecoes.length&&!colecoes.includes(String(l.colecao??"")))return false;
    if(ignorar!=="grupo"&&grupos.length&&!grupos.includes(String(l.grupo??"")))return false;
    if(ignorar!=="sistemas"&&sistemas.length&&!sistemas.some(s=>predSistema(l,s)))return false;
    if(!semIndicador&&indicador){if(indicador==="divergencia"&&(l.qtd_divergencias??0)<=0)return false;const slug=indicador==="prontos"?"pronto_para_ativo":indicador==="bloqueados"?"bloqueado":"ativo_com_furo";if(indicador!=="divergencia"&&l.sugestao!==slug)return false;}
    return true;
  }
  const recorte=(()=>{const base=linhas.filter(l=>aplica(l));const mult=ordem.dir==="asc"?1:-1;return [...base].sort((a,b)=>{const va=a[ordem.coluna],vb=b[ordem.coluna];if(va==null&&vb==null)return 0;if(va==null)return 1;if(vb==null)return -1;if(typeof va==="number"&&typeof vb==="number")return(va-vb)*mult;return String(va).localeCompare(String(vb),"pt-BR",{numeric:true})*mult;});})();
  useEffect(()=>{setPagina(1);setExpandido(null);},[busca,situacoes,fasesSel,colecoes,grupos,sistemas,indicador,tamanho]);
  const conta=(pred:(l:LinhaUnida)=>boolean,ignorar?:GrupoFiltro)=>linhas.filter(l=>aplica(l,ignorar,true)&&pred(l)).length;
  const cards=[{id:null as Indicador,label:"Total",n:linhas.filter(l=>aplica(l,undefined,true)).length},{id:"prontos" as Indicador,label:"Prontos para promover",n:conta(l=>l.sugestao==="pronto_para_ativo")},{id:"bloqueados" as Indicador,label:"Bloqueados",n:conta(l=>l.sugestao==="bloqueado")},{id:"furo" as Indicador,label:"Furo em ativo",n:conta(l=>l.sugestao==="ativo_com_furo")},{id:"divergencia" as Indicador,label:"Com divergência",n:conta(l=>(l.qtd_divergencias??0)>0)}];
  const facet=(grupo:GrupoFiltro,ops:{valor:string;rotulo:string}[],pred:(l:LinhaUnida,v:string)=>boolean)=>ops.map(o=>({...o,contagem:linhas.filter(l=>aplica(l,grupo)&&pred(l,o.valor)).length}));
  const filtrosAtivos=(busca?1:0)+situacoes.length+fasesSel.length+colecoes.length+grupos.length+sistemas.length+(indicador?1:0);
  const colunasVisiveis=ordemColunas.map(k=>COLUNAS.find(c=>c.key===k)).filter((c):c is ColDef=>!!c&&visiveis.includes(c.key));
  const paginas=Math.max(1,Math.ceil(recorte.length/tamanho)),paginaAtual=Math.min(pagina,paginas),paginaLinhas=recorte.slice((paginaAtual-1)*tamanho,paginaAtual*tamanho);
  const estado=`${recorte.length} produtos · ${recorte.filter(l=>l.sugestao==="bloqueado").length} bloqueados · ${recorte.filter(l=>l.sugestao==="ativo_com_furo").length} com furo`;

  function limpar(){setBusca("");setSituacoes([]);setFasesSel([]);setColecoes([]);setGrupos([]);setSistemas([]);setIndicador(null);}
  function ordenar(key:string){if(!ORDENAVEIS.has(key))return;setOrdem(o=>o.coluna===key?{coluna:key,dir:o.dir==="asc"?"desc":"asc"}:{coluna:key,dir:"asc"});}
  function mover(destino:string){if(!arrastando||arrastando===destino||["foto_url","cod_cadastro","sku"].includes(arrastando))return;setOrdemColunas(atual=>{const n=atual.filter(k=>k!==arrastando);const i=n.indexOf(destino);n.splice(Math.max(3,i),0,arrastando);return n;});setArrastando(null);}
  function exportar(){const cab=colunasVisiveis.map(c=>csvCelula(c.rotulo)).join(";");const corpo=recorte.map(l=>colunasVisiveis.map(c=>csvCelula(c.key==="sistemas"?`B:${temValor(l.cod_bling)?"sim":"não"};S:${temValor(l.cod_shopify)?"sim":"não"};X:${temValor(l.cod_xpm)?"sim":"não"}`:c.key==="divergencias"?(l.divergencias??[]).map(rotuloDoSlug).join("; "):c.key==="foto_origem"?rotuloFotoOrigem(l.foto_origem):l[c.key])).join(";")).join("\n");const url=URL.createObjectURL(new Blob(["\uFEFF"+cab+"\n"+corpo],{type:"text/csv;charset=utf-8;"}));const a=document.createElement("a");a.href=url;a.download=`mesa-produto-${fmtData(new Date(),"").split("/").reverse().join("-")}.csv`;a.click();URL.revokeObjectURL(url);}
  function tratarErro(sku:string,e:unknown){const err=e as ErroFuncao,corpo=err?.corpo??{};if(err?.status===409){setConfirmSaldo({sku,saldo:Number(corpo.saldo_disponivel??0)});return;}if(err?.status===422){setFaltando({sku,campos:Array.isArray(corpo.campos_faltando)?corpo.campos_faltando.map(String):[]});return;}if(err?.status===502){setErroFop({sku,corpo:typeof corpo.fop_body==="string"?corpo.fop_body:JSON.stringify(corpo.fop_body??corpo,null,2)});return;}toast.error(`Falha em ${sku}`,{description:typeof corpo.erro==="string"?corpo.erro:"Erro sem detalhe."});}
  async function agir(sku:string,faseDestino:string,confirmarSaldo=false){setEmAcao(sku);try{const r=await chamarPromocao({sku,fase_destino:faseDestino,...(confirmarSaldo?{confirmar_saldo:true}:{})});toast.success(`${String(r.cod_cadastro??sku)} — ${String(r.de??"?")} → ${String(r.para??"?")}`,{description:"Fase gravada no FOP e espelhada aqui."});await lista.refetch();}catch(e){tratarErro(sku,e);}finally{setEmAcao(null);}}
  const ultima=(l:LinhaUnida)=>!l.proxima_fase||String(l.proxima_fase).toLowerCase()==="inativo";
  const chips=(itens:string[]|null|undefined)=><div className="flex flex-wrap gap-1">{!itens?.length?<span className="text-muted-foreground">—</span>:<>{itens.slice(0,3).map(x=><Badge key={x} variant="outline" className="font-normal">{x}</Badge>)}{itens.length>3&&<Badge variant="outline" className="font-normal">+{itens.length-3}</Badge>}</>}</div>;
  const chipsDivergencia=(itens:string[]|null|undefined)=><div className="flex flex-wrap gap-1">{!itens?.length?<span className="text-muted-foreground">—</span>:<>{itens.slice(0,3).map(slug=><Tooltip key={slug}><TooltipTrigger asChild><Badge variant="outline" className="font-normal">{rotuloDoSlug(slug)}</Badge></TooltipTrigger><TooltipContent className="max-w-xs">{DIC_DIV[slug]?.explicacao??slug}</TooltipContent></Tooltip>)}{itens.length>3&&<Tooltip><TooltipTrigger asChild><Badge variant="outline" className="font-normal">+{itens.length-3}</Badge></TooltipTrigger><TooltipContent className="max-w-xs">{itens.slice(3).map(rotuloDoSlug).join(" · ")}</TooltipContent></Tooltip>}</>}</div>;
  const selos=(l:LinhaUnida)=><div className="flex gap-1">{[["B","Bling",temValor(l.cod_bling),false],["S","Shopify",temValor(l.cod_shopify),l.shopify_sku_diverge===true],["X","XPM",temValor(l.cod_xpm),false]].map(([letra,nome,ok,div])=><Tooltip key={String(letra)}><TooltipTrigger asChild><span className={cn("inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-medium",ok?(div?"border-warning/40 bg-warning/10 text-warning-strong":"border-success/40 bg-success/10 text-success-strong"):"border-destructive/40 bg-destructive/10 text-destructive-strong")}>{String(letra)}</span></TooltipTrigger><TooltipContent>{nome}: {ok?(div?"presente, mas com SKU diferente do nosso":"presente"):"não encontrado"}</TooltipContent></Tooltip>)}</div>;
  function celula(l:LinhaUnida,c:ColDef){const v=l[c.key];if(c.tipo==="foto")return <MiniFoto url={l.foto_url??null} origem={l.foto_origem??null} nome={l.nome_comercial??l.sku} onAmpliar={(url,nome)=>setFotoAberta({url,nome})}/>;if(c.key==="foto_origem")return <span className={cn(!l.foto_origem&&"text-muted-foreground")}>{rotuloFotoOrigem(l.foto_origem)}</span>;if(c.tipo==="selos")return selos(l);if(c.tipo==="fase")return <Badge>{String(v??l.fase??"—")}</Badge>;if(c.tipo==="chips"){if(c.key==="falta_proxima_fase"&&ultima(l))return <Tooltip><TooltipTrigger>—</TooltipTrigger><TooltipContent>produto já está na última fase — descontinuar é ação, não promoção</TooltipContent></Tooltip>;return chips(Array.isArray(v)?v.map(String):null);}if(c.tipo==="divergencias")return chipsDivergencia(l.divergencias);if(c.tipo==="bool")return v==null?<span className="text-muted-foreground">—</span>:v?<Check className="h-4 w-4 text-success"/>:<X className="h-4 w-4 text-destructive"/>;if(c.tipo==="datahora")return <span className="text-muted-foreground">{fmtDataHora(typeof v==="string"?v:null)}</span>;if(c.tipo==="num"){if(c.key==="qtd_falta_proxima"&&ultima(l))return <Tooltip><TooltipTrigger>—</TooltipTrigger><TooltipContent>produto já está na última fase — descontinuar é ação, não promoção</TooltipContent></Tooltip>;return v==null?<span className="text-muted-foreground">—</span>:<span className={cn("tabular-nums",c.key==="qtd_falta_atual"&&Number(v)>0&&l.fase==="ativo"&&"text-warning-strong",c.key==="qtd_falta_proxima"&&Number(v)===0&&"text-success-strong")}>{fmtNum(Number(v))}</span>;}if(!temValor(v)){const nome=c.key==="cod_bling"?"Bling":c.key==="cod_shopify"?"Shopify":c.key==="cod_xpm"?"XPM":null;return nome?<Tooltip><TooltipTrigger><span className="text-muted-foreground">—</span></TooltipTrigger><TooltipContent>não encontrado no {nome}</TooltipContent></Tooltip>:<span className="text-muted-foreground">—</span>;}const texto=String(v);if(c.key==="cod_cadastro")return <div className="flex items-center gap-1"><Link to={`/vendas/produto/ficha/${encodeURIComponent(texto)}`} className="font-medium hover:underline">{texto}</Link>{(l.campos_fora_do_espelho??[]).length>0&&<Tooltip><TooltipTrigger><AlertTriangle className="h-3.5 w-3.5 text-warning"/></TooltipTrigger><TooltipContent className="max-w-xs">campo exigido pela matriz que não existe na tabela do SNCF: {(l.campos_fora_do_espelho??[]).join(", ")}</TooltipContent></Tooltip>}</div>;if(c.key==="cod_bling")return <span className="block min-w-56 whitespace-normal">{texto}</span>;if(c.key==="cod_shopify"||c.key==="cod_xpm")return <span className={cn("block max-w-44 truncate",c.key==="cod_shopify"&&l.shopify_sku_diverge&&"text-warning-strong")}>{texto}</span>;return <span>{texto}</span>;}

  const fixa=(key:string,cab=false)=>key==="foto_url"?cn("sticky left-0 w-14 bg-muted",cab?"z-50":"z-20"):key==="cod_cadastro"?cn("sticky left-14 w-28 bg-muted",cab?"z-50":"z-20"):key==="sku"?cn("sticky left-[10.5rem] w-32 border-r bg-muted",cab?"z-50":"z-20"):"";
  return <TooltipProvider delayDuration={200}><PageShell><PageHeader titulo="Mesa do Produto" icone={PackageX} estado={carregando?"Carregando produtos…":estado} acoes={<><Button variant="outline" size="sm" onClick={exportar} disabled={!recorte.length}><Download className="mr-2 h-4 w-4"/>Exportar CSV</Button><Button size="sm" onClick={async()=>{await Promise.all([lista.refetch(),conc.refetch(),sugestoes.refetch()]);}} disabled={lista.isFetching||conc.isFetching||sugestoes.isFetching}><RefreshCw className={cn("mr-2 h-4 w-4",(lista.isFetching||conc.isFetching||sugestoes.isFetching)&&"animate-spin")}/>Atualizar</Button></>}/>
  {erro&&<Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertDescription>Não foi possível carregar os produtos. Atualize a página para tentar novamente. Detalhe: {(erro as Error).message}</AlertDescription></Alert>}
  <section className="grid grid-cols-2 gap-2 lg:grid-cols-5" aria-label="Indicadores">{carregando?Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-20"/>):cards.map(c=><Button key={c.label} variant="outline" className={cn("h-20 items-start justify-center border p-3 text-left",indicador===c.id&&"border-primary bg-primary/5")} onClick={()=>setIndicador(indicador===c.id?null:c.id)}><span className="flex w-full flex-col"><span className="text-[11px] font-normal text-muted-foreground">{c.label}</span><span className="mt-1 text-[21px] font-medium tabular-nums text-foreground">{c.n}</span></span></Button>)}</section>
  <section className="flex flex-wrap items-center gap-2 border-y py-3"><div className="relative min-w-64 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={busca} onChange={e=>setBusca(e.target.value)} className="pl-9" placeholder="Buscar código, SKU, nome ou EAN"/></div>
  <FiltroFacetado label="Situação" selecionados={situacoes} onChange={setSituacoes} opcoes={facet("situacao",SITUACOES.map(([valor,rotulo])=>({valor,rotulo})),(l,v)=>(l.sugestao??"__sem__")===v)}/>
  <FiltroFacetado label="Fase" selecionados={fasesSel} onChange={setFasesSel} opcoes={facet("fase",fases.map(({valor,rotulo})=>({valor,rotulo})),(l,v)=>(l.fase??"__sem__")===v)}/>
  <FiltroFacetado label="Coleção" selecionados={colecoes} onChange={setColecoes} opcoes={facet("colecao",valores("colecao").map(v=>({valor:v,rotulo:v})),(l,v)=>l.colecao===v)}/>
  <FiltroFacetado label="Grupo" selecionados={grupos} onChange={setGrupos} opcoes={facet("grupo",valores("grupo").map(v=>({valor:v,rotulo:v})),(l,v)=>l.grupo===v)}/>
  <FiltroFacetado label="Sistemas" selecionados={sistemas} onChange={setSistemas} opcoes={facet("sistemas",SISTEMAS.map(([valor,rotulo])=>({valor,rotulo})),(l,v)=>v==="sem_bling"?!temValor(l.cod_bling):v==="sem_shopify"?!temValor(l.cod_shopify):v==="sem_xpm"?!temValor(l.cod_xpm):v==="sem_foto_propria"?l.foto_origem!=="produto":(l.qtd_divergencias??0)>0)}/>
  <Popover><PopoverTrigger asChild><Button variant="outline" size="sm"><Columns3 className="mr-2 h-4 w-4"/>Colunas ({colunasVisiveis.length})</Button></PopoverTrigger><PopoverContent align="end" className="w-80 p-0"><div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground"><span>Arraste para reordenar</span><Button variant="ghost" size="sm" onClick={()=>{setVisiveis(COLUNAS_PADRAO);setOrdemColunas(COLUNAS.map(c=>c.key));}}>Padrão</Button></div><ScrollArea className="h-96"><div className="p-2">{ordemColunas.map(k=>COLUNAS.find(c=>c.key===k)).filter((c):c is ColDef=>!!c).map(c=>{const fixaId=["foto_url","cod_cadastro","sku"].includes(c.key);return <div key={c.key} draggable={!fixaId} onDragStart={()=>setArrastando(c.key)} onDragOver={e=>e.preventDefault()} onDrop={()=>mover(c.key)} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"><GripVertical className={cn("h-4 w-4 text-muted-foreground",fixaId&&"opacity-30")}/><Checkbox checked={visiveis.includes(c.key)} disabled={fixaId} onCheckedChange={()=>setVisiveis(v=>v.includes(c.key)?v.filter(x=>x!==c.key):[...v,c.key])}/><span className="truncate text-sm">{c.rotulo}</span></div>})}</div></ScrollArea></PopoverContent></Popover>
  {filtrosAtivos>0&&<Button variant="ghost" size="sm" onClick={limpar}>Limpar filtros ({filtrosAtivos})</Button>}</section>
  {carregando?<div className="space-y-2">{Array.from({length:8}).map((_,i)=><Skeleton key={i} className="h-11 w-full"/>)}</div>:recorte.length===0?<div className="py-12 text-center"><p className="text-sm text-muted-foreground">Nenhum produto neste recorte.</p><Button variant="link" onClick={limpar}>Limpar filtros</Button></div>:<div className="overflow-hidden rounded-md border bg-card"><Table className="text-xs" containerClassName="mesa-produto-scroll max-h-[min(62vh,46rem)]"><TableHeader><TableRow>{colunasVisiveis.map(c=><TableHead key={c.key} className={cn("sticky top-0 z-40 whitespace-nowrap font-medium",c.direita&&"text-right",fixa(c.key,true))} aria-sort={ordem.coluna===c.key?(ordem.dir==="asc"?"ascending":"descending"):"none"}>{ORDENAVEIS.has(c.key)?<Button variant="ghost" size="sm" className="h-auto p-0 font-medium" onClick={()=>ordenar(c.key)}>{c.rotulo}{ordem.coluna!==c.key?<ArrowUpDown className="ml-1 h-3 w-3"/>:ordem.dir==="asc"?<ArrowUp className="ml-1 h-3 w-3"/>:<ArrowDown className="ml-1 h-3 w-3"/>}</Button>:c.rotulo}</TableHead>)}<TableHead className="sticky right-0 top-0 z-50 w-px text-center font-medium">Ações</TableHead></TableRow></TableHeader><TableBody>{paginaLinhas.map(l=><Fragment key={l.sku}><TableRow className="border-b">{colunasVisiveis.map(c=><TableCell key={c.key} className={cn("py-2.5 align-top",c.direita&&"text-right",fixa(c.key))}>{c.key==="cod_cadastro"&&(l.qtd_divergencias??0)>0?<div className="flex items-center gap-1"><Button variant="ghost" size="icon" className="h-6 w-6" aria-label={expandido===l.sku?"Recolher conciliação":"Expandir conciliação"} onClick={()=>setExpandido(e=>e===l.sku?null:l.sku)}>{expandido===l.sku?<ChevronDown className="h-3.5 w-3.5"/>:<ChevronRight className="h-3.5 w-3.5"/>}</Button>{celula(l,c)}</div>:celula(l,c)}</TableCell>)}<TableCell className="sticky right-0 z-20 bg-card py-2.5"><div className="flex justify-center gap-1">{(l.fase==="ativo"||l.fase==="pre_venda")&&<Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Descontinuar" disabled={emAcao===l.sku} onClick={()=>agir(l.sku,"inativo")}><Ban className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>Descontinuar</TooltipContent></Tooltip>}{l.sugestao==="pronto_para_ativo"&&<Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Promover para Ativo" disabled={emAcao===l.sku} onClick={()=>agir(l.sku,"ativo")}><ArrowUpCircle className="h-3.5 w-3.5"/></Button></TooltipTrigger><TooltipContent>Promover para Ativo</TooltipContent></Tooltip>}</div></TableCell></TableRow>{expandido===l.sku&&(l.qtd_divergencias??0)>0&&<TableRow><TableCell colSpan={colunasVisiveis.length+1} className="bg-muted/30 p-4"><DeParaConciliacao l={l}/></TableCell></TableRow>}</Fragment>)}</TableBody></Table><RodapePaginacao total={recorte.length} pagina={paginaAtual} tamanhoPagina={tamanho} chavePreferencia="mesa-produto-tamanho-pagina" onPagina={setPagina} onTamanhoPagina={setTamanho} /></div>}
  <AlertDialog open={!!confirmSaldo} onOpenChange={o=>!o&&setConfirmSaldo(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Descontinuar com saldo em estoque?</AlertDialogTitle><AlertDialogDescription>O produto <strong>{confirmSaldo?.sku}</strong> ainda tem saldo disponível ({fmtNum(confirmSaldo?.saldo)}). Descontinuar não apaga o saldo — ele passa a ser queima.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={()=>{const sku=confirmSaldo?.sku;setConfirmSaldo(null);if(sku)agir(sku,"inativo",true);}}>Descontinuar mesmo assim</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  <Dialog open={!!faltando} onOpenChange={o=>!o&&setFaltando(null)}><DialogContent><DialogHeader><DialogTitle>Ficha incompleta</DialogTitle><DialogDescription>O produto <strong>{faltando?.sku}</strong> não pode avançar enquanto estes campos estiverem vazios:</DialogDescription></DialogHeader>{chips(faltando?.campos)}<DialogFooter><Button variant="outline" onClick={()=>setFaltando(null)}>Fechar</Button></DialogFooter></DialogContent></Dialog>
  <Dialog open={!!fotoAberta} onOpenChange={o=>!o&&setFotoAberta(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{fotoAberta?.nome}</DialogTitle></DialogHeader>{fotoAberta&&<img src={fotoAberta.url} alt={fotoAberta.nome} className="max-h-[70vh] w-full rounded-md object-contain"/>}</DialogContent></Dialog>
  <Dialog open={!!erroFop} onOpenChange={o=>!o&&setErroFop(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>O FOP recusou a mudança</DialogTitle><DialogDescription>Resposta na íntegra da trava para <strong>{erroFop?.sku}</strong>.</DialogDescription></DialogHeader><pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">{erroFop?.corpo}</pre><DialogFooter><Button variant="outline" onClick={()=>setErroFop(null)}>Fechar</Button></DialogFooter></DialogContent></Dialog>
  </PageShell></TooltipProvider>;
}

function DeParaConciliacao({l}:{l:LinhaUnida}){const divs=new Set(l.divergencias??[]);const dash=(v:unknown)=>v==null||String(v).trim()===""?"—":String(v);const rows=[{r:"EAN",s:l.ean,b:l.bling_gtin,x:l.xpm_ean,sb:"bling_ean_diverge",sx:"xpm_ean_diverge"},{r:"NCM",s:l.ncm,b:l.bling_ncm,x:l.xpm_ncm,sb:"bling_ncm_diverge",sx:"xpm_ncm_diverge"},{r:"Peso",s:l.peso_g!=null?`${fmtNum(l.peso_g)} g`:null,b:null,x:l.xpm_peso_kg!=null?`${fmtNum(l.xpm_peso_kg)} kg`:null,sx:divs.has("xpm_peso_padrao")?"xpm_peso_padrao":"xpm_peso_diverge"},{r:"Ativo",s:l.fase,b:l.bling_ativo==null?null:l.bling_ativo?"ativo":"inativo",x:null,sb:"bling_inativo_com_ativo"}];const val=(v:unknown,slug?:string)=><span className={cn(divs.has(slug??"")&&"text-destructive-strong",!temValor(v)&&"text-muted-foreground")}>{dash(v)}</span>;return <div className="space-y-3"><div className="overflow-hidden rounded-md border bg-background"><table className="w-full text-xs"><thead><tr className="border-b bg-muted text-left"><th className="px-3 py-2 font-medium">Campo</th><th className="px-3 py-2 font-medium">SNCF</th><th className="px-3 py-2 font-medium">Bling</th><th className="px-3 py-2 font-medium">XPM</th></tr></thead><tbody>{rows.map(r=><tr key={r.r} className="border-b last:border-0"><td className="px-3 py-2 text-muted-foreground">{r.r}</td><td className="px-3 py-2">{val(r.s)}</td><td className="px-3 py-2">{val(r.b,r.sb)}</td><td className="px-3 py-2">{val(r.x,r.sx)}</td></tr>)}</tbody></table></div><div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span>Cartório: {val(l.cartorio_estado,divs.has("sem_cartorio")?"sem_cartorio":"cartorio_nao_alocado")}</span><span>Inner: {val(l.cartorio_inner,"cartorio_sem_inner")}</span><span>SKU no cartório: {val(l.cartorio_sku,"cartorio_sku_diverge")}</span></div></div>}
