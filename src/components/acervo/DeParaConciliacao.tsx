import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fmtDataHora } from "@/lib/data";

/**
 * DE-PARA DA CONCILIAÇÃO — componente compartilhado (23/09/2026).
 *
 * Nasceu dentro da MesaProduto.tsx e saiu de lá inteiro, sem mudar comportamento,
 * quando a Conciliação de Cadastro virou tela própria: as duas telas abrem a mesma
 * linha expandida, então o bloco precisa morar num lugar só.
 */

// CONCILIAÇÃO 360 — fonte única `vw_produto_conciliacao_360`.
export type ConcLinha = {
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

export type CardBling = {
  sku: string; bling_id: string; nome_bling: string | null; card_ativo: boolean | null;
  estoque_atual: number | null; preco_venda: number | null; updated_at: string | null;
  nome_bate_catalogo: boolean | null; nome_legado: boolean | null; e_canonico: boolean | null;
  escolhido_por: string | null; motivo_canonico: string | null; n_candidatos: number | null;
  ja_foi_usado: boolean | null; n_envios: number | null; ultimo_envio: string | null;
};

// DIVERGÊNCIA POR CONSEQUÊNCIA — nome, consequência, o que fazer e onde resolver
// vêm de `divergencia_regra`; nome, descrição e gravidade do impacto vêm de
// `divergencia_impacto_dim`. Slug sem regra cadastrada aparece cru.
export type ImpactoDim = { slug: string; nome: string; descricao: string | null; gravidade: number | null; ordem: number | null };
export type RegraDiv = {
  slug: string; nome: string; sistema: string | null; impacto: string | null;
  consequencia: string | null; o_que_fazer: string | null; onde_resolver: string | null; ordem: number | null;
  rota_resolver?: string | null; campo_matriz?: string | null; campo_destino?: string | null;
};

/** Tom do chip pela gravidade do impacto — nada de "crítico/atenção" escrito aqui. */
export const tomGravidade = (g: number | null | undefined) =>
  (g ?? 0) >= 90 ? "border-destructive/40 bg-destructive/10 text-destructive-strong"
  : (g ?? 0) >= 60 ? "border-warning/40 bg-warning/10 text-warning-strong"
  : "";

export const temValor = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
export const fmtNum = (v: number | null | undefined) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "0";
export const fmtMoeda = (v: number | null | undefined) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null;

type LinhaDePara = Partial<ConcLinha> & Record<string, unknown> & { sku: string };

export function DeParaConciliacao({ l, regras, impactos }: { l: LinhaDePara; regras: Map<string, RegraDiv>; impactos: Map<string, ImpactoDim> }) {
  const divs = new Set(l.divergencias ?? []);
  const dash = (v: unknown) => v == null || String(v).trim() === "" ? "—" : String(v);
  const rows = [
    { r:"EAN", s:l.ean, b:l.bling_gtin, x:l.xpm_ean, y:l.barcode_shopify, sb:"bling_ean_diverge", sx:"xpm_ean_diverge", sy:"shopify_barcode_diverge" },
    { r:"NCM", s:l.ncm, b:l.bling_ncm, x:l.xpm_ncm, y:null, sb:"bling_ncm_diverge", sx:"xpm_ncm_diverge" },
    { r:"Nome", s:l.nome_comercial, b:l.bling_nome, x:null, y:null, sb:"bling_nome_diverge" },
    { r:"Marca", s:l.marca, b:l.bling_marca, x:null, y:null, sb:"bling_marca_diverge" },
    { r:"Preço", s:fmtMoeda(l.preco_varejo), b:fmtMoeda(l.bling_preco), x:null, y:fmtMoeda(l.preco_shopify), sb:"bling_preco_diverge", sy:"shopify_preco_diverge" },
    { r:"Peso", s:l.peso_g != null ? `${fmtNum(l.peso_g)} g` : null, b:null, x:l.xpm_peso_kg != null ? `${fmtNum(l.xpm_peso_kg)} kg` : null, y:null, sx:divs.has("xpm_peso_padrao") ? "xpm_peso_padrao" : "xpm_peso_diverge" },
    { r:"Ativo", s:l.fase, b:l.bling_ativo == null ? null : l.bling_ativo ? "ativo" : "inativo", x:null, y:l.no_shopify == null ? null : l.no_shopify ? (l.ativo_shopify ? "ativo" : "inativo") : "não existe", sb:"bling_inativo_com_ativo", sy:divs.has("sem_shopify") ? "sem_shopify" : undefined },
  ] as { r:string; s:unknown; b:unknown; x:unknown; y:unknown; sb?:string; sx?:string; sy?:string }[];
  const val = (v: unknown, slug?: string) => <span className={cn(divs.has(slug ?? "") && "text-destructive-strong", !temValor(v) && "text-muted-foreground")}>{dash(v)}</span>;
  // ROTEIRO-ANTES-DO-DIAGNÓSTICO: o que fazer com cada divergência, ordenado pela
  // gravidade do impacto. Slug sem regra cadastrada aparece cru, sem inventar texto.
  const roteiro = [...(l.divergencias ?? [])].map(slug => ({ slug, r: regras.get(slug) ?? null })).map(x => ({ ...x, imp: x.r?.impacto ? impactos.get(x.r.impacto) ?? null : null })).sort((a, b) => (b.imp?.gravidade ?? 0) - (a.imp?.gravidade ?? 0));
  return <div className="space-y-3">
    {roteiro.length > 0 && <div className="overflow-hidden rounded-md border bg-background">
      <div className="border-b bg-muted px-3 py-2 text-xs font-medium">O que fazer</div>
      <ul className="divide-y">{roteiro.map(x => <li key={x.slug} className="space-y-0.5 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{x.r?.nome ?? x.slug}</span>{x.imp && <Badge variant="outline" className={cn("font-normal", tomGravidade(x.imp.gravidade))}>{x.imp.nome}</Badge>}</div>
        {x.r?.consequencia && <p className="text-muted-foreground">{x.r.consequencia}</p>}
        {x.r?.o_que_fazer && <p>{x.r.o_que_fazer}</p>}
        {x.r?.onde_resolver && <p className="text-muted-foreground">resolve-se no {x.r.onde_resolver}</p>}
      </li>)}</ul>
    </div>}
    <div className="overflow-hidden rounded-md border bg-background"><table className="w-full text-xs"><thead><tr className="border-b bg-muted text-left"><th className="px-3 py-2 font-medium">Campo</th><th className="px-3 py-2 font-medium">SNCF</th><th className="px-3 py-2 font-medium">Bling</th><th className="px-3 py-2 font-medium">XPM</th><th className="px-3 py-2 font-medium">Shopify</th></tr></thead><tbody>{rows.map(r => <tr key={r.r} className="border-b last:border-0"><td className="px-3 py-2 text-muted-foreground">{r.r}</td><td className="px-3 py-2">{val(r.s)}</td><td className="px-3 py-2">{val(r.b, r.sb)}</td><td className="px-3 py-2">{val(r.x, r.sx)}</td><td className="px-3 py-2">{val(r.y, r.sy)}</td></tr>)}</tbody></table></div>
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span>Cartório: {val(l.cartorio_estado, divs.has("sem_cartorio") ? "sem_cartorio" : "cartorio_nao_alocado")}</span><span>Inner: {val(l.cartorio_inner, "cartorio_sem_inner")}</span><span>SKU no cartório: {val(l.cartorio_sku, "cartorio_sku_diverge")}</span>{temValor(l.handle) && <span>Handle Shopify: {val(l.handle)}</span>}{l.variantes_shopify != null && <span>Variantes Shopify: {val(fmtNum(l.variantes_shopify))}</span>}</div>
    {(l.bling_n_cards ?? 0) > 1 && <CardsBling sku={l.sku} motivo={l.bling_canonico_motivo ?? null} por={l.bling_canonico_por ?? null} />}
  </div>;
}

// CARDS NO BLING (22/09/2026) — somente leitura. Excluir/mesclar card com estoque e histórico
// de nota é operação do Flavio dentro do Bling, olho a olho.
export function CardsBling({ sku, motivo, por }: { sku: string; motivo: string | null; por: string | null }) {
  const q = useQuery({ queryKey: ["mesa-produto-cards-bling", sku], queryFn: async () => { const { data, error } = await supabase.from("vw_bling_card_360" as never).select("*").eq("sku", sku); if (error) throw error; return (data ?? []) as CardBling[]; } });
  const cards = useMemo(() => [...(q.data ?? [])].sort((a, b) => Number(b.e_canonico) - Number(a.e_canonico) || Number(b.estoque_atual ?? 0) - Number(a.estoque_atual ?? 0)), [q.data]);
  return <div className="space-y-2">
    <div className="flex flex-wrap items-baseline gap-2"><span className="text-xs font-medium">Cards no Bling</span><span className="text-xs text-muted-foreground">{cards.length} cadastros para o mesmo SKU{motivo ? ` · canônico escolhido por ${por === "manual" ? "escolha manual" : "regra"}: ${motivo}` : ""}</span></div>
    {q.isLoading ? <Skeleton className="h-16 w-full" /> : q.error ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Não foi possível carregar os cards do Bling. Detalhe: {(q.error as Error).message}</AlertDescription></Alert> : cards.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum card encontrado.</p> :
    <div className="overflow-hidden rounded-md border bg-background"><table className="w-full text-xs"><thead><tr className="border-b bg-muted text-left"><th className="px-3 py-2 font-medium">ID no Bling</th><th className="px-3 py-2 font-medium">Nome no Bling</th><th className="px-3 py-2 font-medium">Situação</th><th className="px-3 py-2 text-right font-medium">Estoque</th><th className="px-3 py-2 text-right font-medium">Preço</th><th className="px-3 py-2 font-medium">Atualizado</th><th className="px-3 py-2 font-medium">Marcas</th></tr></thead><tbody>{cards.map(c => <tr key={c.bling_id} className={cn("border-b last:border-0", !c.e_canonico && "text-muted-foreground")}><td className="px-3 py-2 tabular-nums">{c.bling_id}</td><td className="px-3 py-2">{c.nome_bling ?? "—"}</td><td className="px-3 py-2">{c.card_ativo == null ? "—" : c.card_ativo ? "ativo" : "inativo"}</td><td className="px-3 py-2 text-right tabular-nums">{fmtNum(c.estoque_atual)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtMoeda(c.preco_venda) ?? "—"}</td><td className="px-3 py-2">{fmtDataHora(c.updated_at)}</td><td className="px-3 py-2"><div className="flex flex-wrap gap-1">
      {c.e_canonico && <Tooltip><TooltipTrigger asChild><Badge className="font-normal">Canônico</Badge></TooltipTrigger><TooltipContent className="max-w-xs">é este que o sistema usa para enviar pedido e emitir nota</TooltipContent></Tooltip>}
      {c.ja_foi_usado && <Tooltip><TooltipTrigger asChild><Badge variant="secondary" className="font-normal">Já usado</Badge></TooltipTrigger><TooltipContent className="max-w-xs">{fmtNum(c.n_envios)} envio(s) · último em {fmtDataHora(c.ultimo_envio)}</TooltipContent></Tooltip>}
      {c.nome_legado && <Tooltip><TooltipTrigger asChild><Badge variant="outline" className="font-normal">Nome legado</Badge></TooltipTrigger><TooltipContent className="max-w-xs">nome no padrão antigo</TooltipContent></Tooltip>}
    </div></td></tr>)}</tbody></table></div>}
  </div>;
}
