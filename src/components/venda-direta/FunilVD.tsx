import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Ban, ChevronRight, Circle, FileText, ListOrdered, Package, PackageCheck, PauseCircle, Truck, Wallet,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { EstadoSelo } from "@/components/ui/selo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type TomEtapa = "neutro" | "espera" | "acao" | "alerta" | "critico" | "sucesso" | "muted";
export interface VdFase { codigo: string; rotulo: string; descricao: string | null; icone: string | null; ordem: number; fora_do_fluxo: boolean; terminal: boolean }
export interface VdEtapa { codigo: string; fase_codigo: string; rotulo: string; responsavel_codigo: string | null; proxima_acao: string | null; tom: TomEtapa | null; ordem: number }
export interface VdResponsavel { codigo: string; rotulo: string; acao_equipe: boolean; ordem: number }
export interface Marcos {
  criado_em?: string | null; pago_em?: string | null; bling_em?: string | null; bling_numero?: string | number | null;
  nf_em?: string | null; nf_numero?: string | number | null; puxado_em?: string | null; embalado_em?: string | null;
  despachado_em?: string | null; entregue_em?: string | null; cancelado_em?: string | null;
}
/** Colunas de classificação vindas de vw_venda_direta_gestao — a tela só desenha. */
export interface ClassificacaoVD {
  etapa: string | null; etapa_rotulo: string | null; fase: string | null; fase_rotulo: string | null;
  responsavel: string | null; responsavel_rotulo: string | null; acao_equipe: boolean | null;
  proxima_acao: string | null; etapa_tom: TomEtapa | null; etapa_detalhe: string | null;
  alertas: string[] | null; marcos: Marcos | null;
}

export type FiltroVD = { tipo: "fase" | "etapa" | "alerta"; codigo: string };
export const ALERTA_FALTA = "falta_site_sp";
export const FASE_FORA = "fora_do_fluxo";

const ICONES: Record<string, LucideIcon> = {
  wallet: Wallet, "file-text": FileText, "list-ordered": ListOrdered, package: Package, truck: Truck,
  "package-check": PackageCheck, "alert-triangle": AlertTriangle, ban: Ban,
};
export const iconeFase = (nome: string | null | undefined) => (nome && ICONES[nome]) || Circle;

export const estadoDoTom = (t: TomEtapa | null | undefined): EstadoSelo =>
  t === "critico" ? "destructive" : t === "alerta" ? "warning" : t === "sucesso" ? "success" : t === "acao" ? "info" : "muted";

export const naoMapeada = (l: Pick<ClassificacaoVD, "etapa" | "etapa_rotulo">) => !l.etapa || l.etapa === "outro" || !l.etapa_rotulo;
export const temAlerta = (l: Pick<ClassificacaoVD, "alertas">, a: string) => Array.isArray(l.alertas) && l.alertas.includes(a);

export function useDimensoesVD() {
  return useQuery({
    queryKey: ["vd-dimensoes"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [f, e, r] = await Promise.all([
        supabase.from("vd_fase" as never).select("*").order("ordem"),
        supabase.from("vd_etapa" as never).select("*").order("ordem"),
        supabase.from("vd_responsavel" as never).select("*").order("ordem"),
      ]);
      if (f.error) throw f.error;
      if (e.error) throw e.error;
      if (r.error) throw r.error;
      return {
        fases: (f.data ?? []) as unknown as VdFase[],
        etapas: (e.data ?? []) as unknown as VdEtapa[],
        responsaveis: new Map(((r.data ?? []) as unknown as VdResponsavel[]).map((x) => [x.codigo, x])),
      };
    },
  });
}

const igual = (a: FiltroVD | null, b: FiltroVD) => !!a && a.tipo === b.tipo && a.codigo === b.codigo;

export function FunilVD({ linhas, fases, etapas, responsaveis, filtro, onFiltro }: {
  linhas: ClassificacaoVD[];
  fases: VdFase[];
  etapas: VdEtapa[];
  responsaveis: Map<string, VdResponsavel>;
  filtro: FiltroVD | null;
  onFiltro: (f: FiltroVD) => void;
}) {
  const fluxo = fases.filter((f) => !f.fora_do_fluxo && f.codigo !== "cancelado").sort((a, b) => a.ordem - b.ordem);
  const porEtapa = (fase: string) =>
    etapas.filter((e) => e.fase_codigo === fase)
      .map((e) => ({ e, n: linhas.filter((l) => l.fase === fase && l.etapa === e.codigo).length }))
      .filter((x) => x.n > 0);
  const respRotulo = (e: VdEtapa) => (e.responsavel_codigo && responsaveis.get(e.responsavel_codigo)?.rotulo) || "—";
  const fora = porEtapa(FASE_FORA);
  const totalFora = linhas.filter((l) => l.fase === FASE_FORA).length;
  const faseFora = fases.find((f) => f.codigo === FASE_FORA);

  return (
    <div className="flex min-w-0 flex-col gap-2 2xl:flex-row 2xl:items-stretch">
      <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-stretch">
        {fluxo.map((fase, i) => {
          const daFase = linhas.filter((l) => l.fase === fase.codigo);
          const n = daFase.length;
          const presentes = porEtapa(fase.codigo);
          const equipe = daFase.some((l) => l.acao_equipe);
          const sucesso = fase.terminal;
          const ativo = igual(filtro, { tipo: "fase", codigo: fase.codigo });
          const zerado = n === 0 && !ativo;
          const espera = n > 0 && !equipe && !sucesso;
          const falta = daFase.filter((l) => temAlerta(l, ALERTA_FALTA)).length;
          const Icon = iconeFase(fase.icone);
          const rotulo = fase.codigo === "entregue" ? `${fase.rotulo} · 30 dias` : fase.rotulo;
          const card = (
            <div
              role="button" tabIndex={0}
              onClick={() => onFiltro({ tipo: "fase", codigo: fase.codigo })}
              onKeyDown={(e) => e.key === "Enter" && onFiltro({ tipo: "fase", codigo: fase.codigo })}
              className={cn(
                "relative flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 rounded-md border bg-card px-3 py-2 transition-all gold-border-hover",
                ativo ? "gold-border bg-gold-soft shadow-sm"
                  : espera ? "border-border border-dashed"
                  : equipe ? "border-border border-l-4 border-l-primary"
                  : "border-border",
              )}
            >
              <div className={cn("flex items-center gap-1.5 pr-8 text-[10px] font-medium uppercase tracking-wide", zerado ? "text-muted-foreground/60" : "text-muted-foreground")}>
                <Icon className={cn("h-4 w-4 shrink-0", zerado ? "text-muted-foreground/60" : sucesso ? "text-success" : espera ? "text-muted-foreground" : "text-foreground")} />
                <span className="truncate">{rotulo}</span>
              </div>
              <div className={cn("text-2xl font-medium tabular-nums leading-tight",
                zerado ? "text-muted-foreground/60" : espera ? "text-muted-foreground" : sucesso ? "text-success-strong" : "text-foreground")}>{n}</div>
              {presentes.map(({ e, n: ne }) => {
                const at = igual(filtro, { tipo: "etapa", codigo: e.codigo });
                return (
                  <button key={e.codigo} type="button"
                    onClick={(ev) => { ev.stopPropagation(); onFiltro({ tipo: "etapa", codigo: e.codigo }); }}
                    className={cn("rounded-sm text-left text-[11px] leading-snug text-muted-foreground hover:text-foreground hover:underline", at && "gold-border bg-gold-soft px-1 text-foreground")}>
                    <span className="tabular-nums">{ne}</span> {e.rotulo} {respRotulo(e) !== "—" && <span className="text-[10px] text-muted-foreground/80">· {respRotulo(e)}</span>}
                  </button>
                );
              })}
              {equipe && <div className="text-[10px] font-medium text-primary">Ação da equipe</div>}
              {espera && <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><PauseCircle className="h-3 w-3" />em espera</div>}
              {falta > 0 && (
                <div className="absolute right-1 top-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button"
                        onClick={(ev) => { ev.stopPropagation(); onFiltro({ tipo: "alerta", codigo: ALERTA_FALTA }); }}
                        className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          igual(filtro, { tipo: "alerta", codigo: ALERTA_FALTA }) ? "gold-border bg-gold-soft" : "bg-destructive text-destructive-foreground")}>
                        <AlertTriangle className="h-2.5 w-2.5" />{falta}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Falta no Site SP</TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>
          );
          return (
            <Fragment key={fase.codigo}>
              {i > 0 && <ChevronRight className="hidden h-4 w-4 shrink-0 self-center text-muted-foreground md:block" aria-hidden="true" />}
              {fase.descricao ? (
                <Tooltip><TooltipTrigger asChild>{card}</TooltipTrigger><TooltipContent className="max-w-xs">{fase.descricao}</TooltipContent></Tooltip>
              ) : card}
            </Fragment>
          );
        })}
      </div>
      <div className="hidden w-px shrink-0 bg-border 2xl:block" aria-hidden="true" />
      <div className="flex flex-col gap-1 2xl:w-56 2xl:shrink-0">
        <button type="button" onClick={() => onFiltro({ tipo: "fase", codigo: FASE_FORA })}
          className={cn("rounded-sm text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground",
            igual(filtro, { tipo: "fase", codigo: FASE_FORA }) && "gold-border bg-gold-soft px-1")}>
          {faseFora?.rotulo ?? FASE_FORA} · <span className="tabular-nums">{totalFora}</span>
        </button>
        {fora.length === 0 ? (
          <div className="rounded-md border bg-card px-2 py-1.5 text-xs text-muted-foreground/60">Nada fora do fluxo</div>
        ) : (
          <div className="flex flex-wrap gap-1 2xl:flex-col 2xl:flex-nowrap">
            {fora.map(({ e, n }) => {
              const ativo = igual(filtro, { tipo: "etapa", codigo: e.codigo });
              return (
                <button key={e.codigo} type="button" onClick={() => onFiltro({ tipo: "etapa", codigo: e.codigo })}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md border bg-card px-2 py-1 text-left text-xs transition-all gold-border-hover",
                    ativo ? "gold-border bg-gold-soft shadow-sm"
                      : e.tom === "critico" ? "border-border border-l-4 border-l-destructive text-destructive-strong"
                      : e.tom === "alerta" ? "border-border border-l-4 border-l-warning text-warning-strong"
                      : e.tom === "acao" ? "border-border border-l-4 border-l-primary"
                      : e.tom === "espera" ? "border-border border-dashed text-muted-foreground"
                      : "border-border",
                  )}>
                  <span className="min-w-0">
                    <span className="block leading-snug">{e.rotulo}</span>
                    <span className="block text-[10px] text-muted-foreground">{respRotulo(e)}</span>
                  </span>
                  <span className="text-base font-medium tabular-nums">{n}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
