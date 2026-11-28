import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEstadoTela } from "@/lib/navegacao";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { Indicador } from "@/components/shared/Indicador";
import { RodapePaginacao } from "@/components/tabela/RodapePaginacao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  cardsVisao, contagemEstados, freteSobreFaturamento, listaVisao, matrizVisao, periodoAtalho,
  type EstadoPagamento, type FaturaCusto, type Lente,
} from "@/lib/logistica/visaoCusto";

const ATALHOS = [
  { v: "mes", l: "Mês atual" }, { v: "mes_anterior", l: "Mês anterior" }, { v: "3m", l: "Últimos 3 meses" }, { v: "ano", l: "Ano" },
];
const ESTADOS: Record<EstadoPagamento, { l: string; c: string }> = {
  pago: { l: "Pago", c: "border-success/40 bg-success/10 text-success" },
  pago_sem_conciliar: { l: "Pago · falta conciliar", c: "border-warning/40 bg-warning/10 text-warning" },
  pago_sem_titulo: { l: "Pago · sem título", c: "border-warning/40 bg-warning/10 text-warning" },
  vencido: { l: "Vencido", c: "border-transparent bg-destructive text-destructive-foreground" },
  a_vencer: { l: "A vencer", c: "border-transparent bg-muted text-muted-foreground" },
  sem_titulo: { l: "Sem título", c: "" },
  cancelado: { l: "Cancelado", c: "border-transparent bg-muted text-muted-foreground line-through" },
};
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const ddmm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");

export function VisaoCustoFrete({ transportadoraId }: { transportadoraId: string | null }) {
  const qc = useQueryClient();
  const [nav, setNav] = useEstadoTela(
    { atalho: "3m", de: "", ate: "", lente: "caixa", estado: "", cel_t: "", cel_m: "", pagina: 1 },
    { prefixo: "custo" },
  );
  const [tamanho, setTamanho] = useState(20);
  const [confirmar, setConfirmar] = useState<FaturaCusto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const lente = (nav.lente === "competencia" ? "competencia" : "caixa") as Lente;
  const periodo = nav.de && nav.ate ? { de: nav.de, ate: nav.ate } : periodoAtalho(nav.atalho);
  const geral = transportadoraId == null;

  const q = useQuery({
    queryKey: ["visao-custo-frete", transportadoraId],
    queryFn: async () => {
      const out: FaturaCusto[] = [];
      for (let de = 0; ; de += 1000) {
        let b = (supabase as any).from("vw_logistica_custo_fatura").select("*").range(de, de + 999);
        if (transportadoraId) b = b.eq("transportadora_id", transportadoraId);
        const { data, error } = await b;
        if (error) throw new Error(error.message);
        out.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      return out;
    },
  });
  const rec = useQuery({
    queryKey: ["visao-custo-faturamento"],
    enabled: lente === "competencia",
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("vw_faturamento_mensal").select("mes, receita_total");
      if (error) throw new Error(error.message);
      return (data ?? []) as { mes: string; receita_total: number | null }[];
    },
  });

  const fs = q.data ?? [];
  const cards = useMemo(() => cardsVisao(fs, lente, periodo), [fs, lente, periodo.de, periodo.ate]); // eslint-disable-line react-hooks/exhaustive-deps
  const matriz = useMemo(() => matrizVisao(fs, lente, periodo), [fs, lente, periodo.de, periodo.ate]); // eslint-disable-line react-hooks/exhaustive-deps
  const celula = nav.cel_t && nav.cel_m ? { transportadoraId: nav.cel_t, mes: nav.cel_m } : null;
  const listaBase = useMemo(() => listaVisao(fs, lente, periodo, celula), [fs, lente, periodo.de, periodo.ate, nav.cel_t, nav.cel_m]); // eslint-disable-line react-hooks/exhaustive-deps
  const contagem = contagemEstados(listaBase);
  const lista = nav.estado ? listaBase.filter((f) => f.estado_pagamento === nav.estado) : listaBase;
  const pagina = lista.slice((nav.pagina - 1) * tamanho, nav.pagina * tamanho);
  const pct = lente === "competencia" ? freteSobreFaturamento(cards.cobrado, rec.data ?? [], periodo) : null;
  const nomeCel = celula ? matriz.linhas.find((l) => l.id === celula.transportadoraId)?.nome ?? "" : "";

  async function conciliar(f: FaturaCusto) {
    setSalvando(true);
    try {
      const { data, error } = await supabase.rpc("confirmar_match_despesa" as any, { p_mov_id: f.sugestao_mov_id, p_cpr_id: f.conta_pagar_id } as any);
      if (error) throw new Error(error.message);
      const r = data as { ok?: boolean; erro?: string } | null;
      if (r && r.ok === false) throw new Error(r.erro ?? "Não foi possível conciliar");
      toast.success(`Fatura ${f.numero_fatura ?? ""} conciliada`);
      setConfirmar(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["visao-custo-frete"] }),
        qc.invalidateQueries({ queryKey: ["faturas-frete", transportadoraId] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setSalvando(false); }
  }

  const sub = (de: string) => `mais antiga ${ddmm(de)}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {ATALHOS.map((a) => (
          <Button key={a.v} size="sm" variant={!nav.de && nav.atalho === a.v ? "default" : "outline"}
            onClick={() => setNav({ atalho: a.v, de: "", ate: "", pagina: 1, cel_t: "", cel_m: "" })}>{a.l}</Button>
        ))}
        <Input type="date" className="h-8 w-36 text-xs" aria-label="De" value={periodo.de}
          onChange={(e) => setNav({ de: e.target.value, ate: periodo.ate, pagina: 1 })} />
        <Input type="date" className="h-8 w-36 text-xs" aria-label="Até" value={periodo.ate}
          onChange={(e) => setNav({ de: periodo.de, ate: e.target.value, pagina: 1 })} />
        <div className="ml-auto inline-flex rounded-md border p-0.5">
          {(["caixa", "competencia"] as Lente[]).map((l) => (
            <Button key={l} size="sm" variant={lente === l ? "secondary" : "ghost"} className="h-7"
              onClick={() => setNav({ lente: l, pagina: 1, cel_t: "", cel_m: "" })}>{l === "caixa" ? "Caixa" : "Competência"}</Button>
          ))}
        </div>
      </div>

      {q.isError && <div className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">Erro ao carregar: {(q.error as Error).message}</div>}
      {q.isLoading ? <Skeleton className="h-24 w-full" /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {lente === "caixa" ? <>
            <Indicador titulo="Pago" valor={formatBRL(cards.pago)} subtexto={`${cards.pagoFaturas} fatura(s)`} />
            <Indicador titulo="Pago sem conciliar" valor={formatBRL(cards.pagoSemConciliar)} alerta={cards.pagoSemConciliar > 0} subtexto="débito no extrato, falta conciliar/título" />
            <Indicador titulo="Total saído" valor={formatBRL(cards.totalSaido)} />
          </> : <>
            <Indicador titulo="Cobrado" valor={formatBRL(cards.cobrado)} />
            <Indicador titulo="Frete / faturamento" valor={pct == null ? "—" : `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} subtexto={rec.isError ? `Erro: ${(rec.error as Error).message}` : undefined} />
          </>}
          <Indicador titulo="A vencer" valor={formatBRL(cards.aVencer)} />
          <div className={cn(cards.vencido > 0 && "[&>div]:border-destructive/40 [&>div>div:nth-child(2)]:text-destructive")}>
            <Indicador titulo="Vencido" valor={formatBRL(cards.vencido)} subtexto={cards.vencidoMaisAntiga ? sub(cards.vencidoMaisAntiga) : undefined} />
          </div>
          <Indicador titulo="Sem título" valor={formatBRL(cards.semTitulo)} subtexto="fatura sem conta a pagar" />
        </div>
      )}

      {!q.isLoading && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr><th className="p-2 text-left">Transportadora</th>
                {matriz.meses.map((m) => <th key={m} className="p-2 text-right whitespace-nowrap">{rotuloMes(m)}</th>)}
                <th className="p-2 text-right">Total</th></tr>
            </thead>
            <tbody>
              {matriz.linhas.length === 0 && <tr><td colSpan={matriz.meses.length + 2} className="p-4 text-center text-muted-foreground">Nada no período</td></tr>}
              {matriz.linhas.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2 whitespace-nowrap">{l.nome}</td>
                  {matriz.meses.map((m) => {
                    const ativo = celula?.transportadoraId === l.id && celula.mes === m;
                    return <td key={m} className="p-1 text-right tabular-nums">
                      {l.celulas[m] ? <button type="button" className={cn("rounded px-1 hover:bg-muted", ativo && "bg-primary/10 font-medium")}
                        onClick={() => setNav({ cel_t: l.id, cel_m: m, pagina: 1 })}>{formatBRL(l.celulas[m])}</button> : <span className="text-muted-foreground">—</span>}
                    </td>;
                  })}
                  <td className="p-2 text-right font-medium tabular-nums">{formatBRL(l.total)}</td>
                </tr>
              ))}
            </tbody>
            {matriz.linhas.length > 1 && <tfoot className="border-t font-medium"><tr><td className="p-2">Total</td>
              {matriz.meses.map((m) => <td key={m} className="p-2 text-right tabular-nums">{formatBRL(matriz.colunas[m] ?? 0)}</td>)}
              <td className="p-2 text-right tabular-nums">{formatBRL(matriz.total)}</td></tr></tfoot>}
          </table>
        </div>
      )}

      {!q.isLoading && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {celula && <Badge variant="outline" className="gap-1">Filtro: {nomeCel} · {rotuloMes(celula.mes)}
              <button type="button" aria-label="Limpar filtro" onClick={() => setNav({ cel_t: "", cel_m: "", pagina: 1 })}><X className="h-3 w-3" /></button></Badge>}
            <Button size="sm" variant={!nav.estado ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setNav({ estado: "", pagina: 1 })}>Todas ({listaBase.length})</Button>
            {(Object.keys(ESTADOS) as EstadoPagamento[]).filter((e) => contagem[e]).map((e) => (
              <Button key={e} size="sm" variant={nav.estado === e ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setNav({ estado: e, pagina: 1 })}>{ESTADOS[e].l} ({contagem[e]})</Button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground"><tr>
                {geral && <th className="p-2 text-left">Transportadora</th>}
                <th className="p-2 text-left">Fatura nº</th><th className="p-2 text-left">Emissão</th><th className="p-2 text-left">Vencimento</th>
                <th className="p-2 text-right">Valor</th><th className="p-2 text-left">Pago em</th><th className="p-2 text-left">Estado</th><th className="p-2 text-right">Ação</th>
              </tr></thead>
              <tbody>
                {pagina.length === 0 && <tr><td colSpan={geral ? 8 : 7} className="p-4 text-center text-muted-foreground">Nenhuma fatura</td></tr>}
                {pagina.map((f) => (
                  <tr key={f.fatura_id} className="border-t align-top">
                    {geral && <td className="p-2 whitespace-nowrap">{f.transportadora ?? "—"}</td>}
                    <td className="p-2">{f.numero_fatura ?? "—"}</td>
                    <td className="p-2">{formatDateBR(f.data_emissao)}</td>
                    <td className="p-2">{formatDateBR(f.data_vencimento)}</td>
                    <td className="p-2 text-right tabular-nums">{formatBRL(f.valor_total)}</td>
                    <td className="p-2">{f.data_pagamento ? formatDateBR(f.data_pagamento) : "—"}</td>
                    <td className="p-2">
                      <Badge variant="outline" className={cn("font-normal", ESTADOS[f.estado_pagamento]?.c)}>{ESTADOS[f.estado_pagamento]?.l ?? f.estado_pagamento}</Badge>
                      {(f.estado_pagamento === "pago_sem_conciliar" || f.estado_pagamento === "pago_sem_titulo") && f.sugestao_mov_data && (
                        <div className="mt-0.5 text-muted-foreground">débito {ddmm(f.sugestao_mov_data)} · {f.sugestao_mov_descricao ?? ""}</div>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {f.estado_pagamento === "pago_sem_conciliar" && f.sugestao_mov_id && f.conta_pagar_id && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmar(f)}>Conciliar</Button>
                      )}
                      {f.estado_pagamento === "pago_sem_titulo" && (
                        <Tooltip><TooltipTrigger asChild><span className="cursor-help text-muted-foreground">—</span></TooltipTrigger>
                          <TooltipContent>Criar o título em Contas a Pagar</TooltipContent></Tooltip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <RodapePaginacao total={lista.length} pagina={nav.pagina} tamanhoPagina={tamanho}
            onPagina={(p) => setNav({ pagina: p })} onTamanhoPagina={(n) => { setTamanho(n); setNav({ pagina: 1 }); }} />
        </div>
      )}

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && !salvando && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conciliar fatura</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar && `Ligar o débito de ${formatBRL(confirmar.saldo)} de ${ddmm(confirmar.sugestao_mov_data)} (${confirmar.sugestao_mov_descricao ?? ""}) à fatura nº ${confirmar.numero_fatura ?? ""}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={salvando} onClick={(e) => { e.preventDefault(); if (confirmar) void conciliar(confirmar); }}>
              {salvando ? "Conciliando…" : "Conciliar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
