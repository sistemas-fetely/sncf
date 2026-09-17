import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CabecalhoOrdenavel,
  DirecaoOrdenacao,
  LINHA_CABECALHO_COLADO,
  LINHA_CABECALHO_COLADO_NIVEL2,
} from "@/components/tabela/CabecalhoOrdenavel";
import { Search, Loader2, AlertTriangle, ChevronRight } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { formatCNPJ } from "@/lib/cnpj";
import { useKpiConsignado, type KpiConsignadoRow } from "./consignado/VisaoConsignado";

import { PageShell } from "@/components/layout/PageShell";
import { PainelGeralConsignados } from "./consignado/PainelGeralConsignados";
interface ParceiroConsignado {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
}

interface ContaCorrenteRow {
  parceiro_id: string;
  cnpj: string | null;
  nome: string | null;
  documentado: number | null;
  n_titulos: number | null;
  pago: number | null;
  n_pagamentos: number | null;
  saldo_devedor: number | null;
  ultimo_pagamento: string | null;
  haver_disponivel: number | null;
}

export function useParceirosConsignados() {
  return useQuery({
    queryKey: ["consignados-parceiros"],
    queryFn: async (): Promise<ParceiroConsignado[]> => {
      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social, nome_fantasia, cnpj")
        .eq("regime_consignado", true)
        .eq("ativo", true)
        .order("razao_social");
      if (error) throw error;
      return (data ?? []) as ParceiroConsignado[];
    },
  });
}

export function useContaCorrenteCliente(parceiroId?: string) {
  return useQuery({
    queryKey: ["consignados-conta-corrente", parceiroId ?? "todos"],
    queryFn: async (): Promise<ContaCorrenteRow[]> => {
      let q = (supabase as any).from("vw_conta_corrente_cliente").select("*");
      if (parceiroId) q = q.eq("parceiro_id", parceiroId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ContaCorrenteRow[];
    },
  });
}

const num = (v: unknown) => Number(v ?? 0);
const pct = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const qtd = (v: unknown) => num(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

type ColunaConsignado =
  | "parceiro" | "documentado" | "pago" | "saldo" | "ultimo_pagamento"
  | "giro" | "margem" | "capital_parado" | "ritmo" | "meses" | "ciclos";

type OrdenacaoConsignado = { coluna: ColunaConsignado; dir: DirecaoOrdenacao } | null;

/** Primeiro clique: nome sobe, data e numero descem. */
const DIR_INICIAL_CONSIGNADO: Record<ColunaConsignado, DirecaoOrdenacao> = {
  parceiro: "asc", documentado: "desc", pago: "desc", saldo: "desc",
  ultimo_pagamento: "desc", giro: "desc", margem: "desc",
  capital_parado: "desc", ritmo: "desc", meses: "desc", ciclos: "desc",
};

/** CasaHeader = 4rem. Mesmo numero que ancora o `top-16` do bloco de KPIs. */
const ALTURA_CASA_HEADER = 64;

export default function Consignados({ embutido = false }: { embutido?: boolean } = {}) {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [ordenacao, setOrdenacao] = useState<OrdenacaoConsignado>(null);

  const ordenarPor = (coluna: ColunaConsignado) => {
    setOrdenacao((atual) => {
      if (!atual || atual.coluna !== coluna) return { coluna, dir: DIR_INICIAL_CONSIGNADO[coluna] };
      const invertida: DirecaoOrdenacao = atual.dir === "asc" ? "desc" : "asc";
      // Fechou o ciclo: volta a ordem da consulta (razao social).
      return invertida === DIR_INICIAL_CONSIGNADO[coluna] ? null : { coluna, dir: invertida };
    });
  };
  const parceirosQ = useParceirosConsignados();
  const contaQ = useContaCorrenteCliente();
  const kpiQ = useKpiConsignado();

  const saldoPorParceiro = useMemo(() => {
    const m = new Map<string, ContaCorrenteRow>();
    for (const r of contaQ.data ?? []) m.set(r.parceiro_id, r);
    return m;
  }, [contaQ.data]);

  const kpiPorParceiro = useMemo(() => {
    const m = new Map<string, KpiConsignadoRow>();
    for (const r of kpiQ.data ?? []) m.set(r.parceiro_id, r);
    return m;
  }, [kpiQ.data]);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (parceirosQ.data ?? []).filter((p) =>
      !termo ||
      p.razao_social?.toLowerCase().includes(termo) ||
      (p.nome_fantasia ?? "").toLowerCase().includes(termo) ||
      (p.cnpj ?? "").replace(/\D/g, "").includes(termo.replace(/\D/g, ""))
    );
  }, [parceirosQ.data, busca]);

  // TOPO-COLADO-SE-MEDE, duas vezes: os KPIs seguram o 1o nivel do cabecalho e
  // a linha de grupo segura o 2o. Nenhuma das duas alturas e fixa.
  const kpisRef = useRef<HTMLDivElement>(null);
  const grupoRef = useRef<HTMLTableRowElement>(null);
  const [alturaKpis, setAlturaKpis] = useState(0);
  const [alturaGrupo, setAlturaGrupo] = useState(0);

  useEffect(() => {
    const alvos: [Element | null, (n: number) => void][] = [
      [kpisRef.current, setAlturaKpis],
      [grupoRef.current, setAlturaGrupo],
    ];
    const ro = new ResizeObserver(() => {
      for (const [el, set] of alvos) if (el) set((el as HTMLElement).offsetHeight);
    });
    for (const [el, set] of alvos) {
      if (!el) continue;
      set((el as HTMLElement).offsetHeight);
      ro.observe(el);
    }
    return () => ro.disconnect();
  }, [parceirosQ.isLoading, linhas.length, embutido]);

  // Embutida em outra tela, esta lista nao manda no topo: sem cola.
  const topoColado = embutido ? undefined : ALTURA_CASA_HEADER + alturaKpis;

  // VAZIO-VAI-PRO-FIM: celula sem dado nunca ganha primeiro lugar, nos dois sentidos.
  const linhasOrdenadas = useMemo(() => {
    if (!ordenacao) return linhas;
    const dir = ordenacao.dir === "asc" ? 1 : -1;
    const valorDe = (p: ParceiroConsignado): string | number | null => {
      const cc = saldoPorParceiro.get(p.id);
      const kpi = kpiPorParceiro.get(p.id);
      const semCiclo = !kpi || num(kpi.n_ciclos) === 0;
      switch (ordenacao.coluna) {
        case "parceiro": return p.razao_social || null;
        case "documentado": return cc?.documentado ?? null;
        case "pago": return cc?.pago ?? null;
        case "saldo": return cc?.saldo_devedor ?? null;
        case "ultimo_pagamento": {
          const t = cc?.ultimo_pagamento ? Date.parse(cc.ultimo_pagamento) : NaN;
          return Number.isNaN(t) ? null : t;
        }
        case "giro": return kpi ? num(kpi.giro_pct) : null;
        case "margem": return semCiclo ? null : num(kpi!.margem_pct);
        case "capital_parado": return kpi ? num(kpi.capital_parado) : null;
        case "ritmo": return semCiclo ? null : num(kpi!.ritmo_packs_semana);
        case "meses": return semCiclo ? null : num(kpi!.semanas_para_escoar) / 4.345;
        case "ciclos": return kpi ? num(kpi.n_ciclos) : null;
        default: return null;
      }
    };
    return [...linhas].sort((a, b) => {
      const va = valorDe(a);
      const vb = valorDe(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * dir;
      }
      return (Number(va) - Number(vb)) * dir;
    });
  }, [linhas, ordenacao, saldoPorParceiro, kpiPorParceiro]);

  const estiloTopo = {
    "--fila-topo-colado": topoColado != null ? `${topoColado}px` : undefined,
    "--fila-topo-colado-2": topoColado != null ? `${topoColado + alturaGrupo}px` : undefined,
  } as CSSProperties;


  const isError = parceirosQ.isError || contaQ.isError;

  const conteudo = (
    <>
      {!embutido && (
        <CasaPageHeader
          breadcrumb={[{ label: "Comercial" }, { label: "Consignados" }]}
          title="Consignados"
          subtitle="Parceiros em regime de conta corrente"
        />
      )}


      {isError && (
        <Card className="mb-4 border-destructive">
          <CardContent className="p-4 flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Falha ao carregar dados: {(parceirosQ.error as Error)?.message ?? (contaQ.error as Error)?.message}
          </CardContent>
        </Card>
      )}

      <PainelGeralConsignados />

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar parceiro ou CNPJ..."
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {parceirosQ.isLoading ? (
            <div className="p-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : linhas.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhum parceiro em regime de conta corrente.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="align-bottom">
                      Parceiro
                    </TableHead>
                    <TableHead colSpan={4} className="text-center border-b">
                      Dinheiro
                    </TableHead>
                    <TableHead colSpan={6} className="text-center border-b">
                      Negócio
                    </TableHead>
                    <TableHead rowSpan={2} className="w-8" />
                  </TableRow>
                  <TableRow>
                    <TableHead className="text-right">Documentado</TableHead>
                    <TableHead className="text-right">Pago</TableHead>
                    <TableHead className="text-right">Saldo devedor</TableHead>
                    <TableHead>Último pagamento</TableHead>
                    <TableHead className="text-right">Giro %</TableHead>
                    <TableHead className="text-right">Margem %</TableHead>
                    <TableHead className="text-right">Capital parado</TableHead>
                    <TableHead className="text-right">Ritmo/semana</TableHead>
                    <TableHead className="text-right">Meses p/ escoar</TableHead>
                    <TableHead className="text-right">Ciclos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((p) => {
                    const cc = saldoPorParceiro.get(p.id);
                    const saldo = Number(cc?.saldo_devedor ?? 0);
                    const kpi = kpiPorParceiro.get(p.id);
                    const semCiclo = !kpi || num(kpi.n_ciclos) === 0;
                    const fantasia = p.nome_fantasia?.trim() ?? "";
                    const fantasiaDistinta =
                      fantasia !== "" && fantasia.toLowerCase() !== p.razao_social?.toLowerCase();
                    return (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/comercial/consignados/${p.id}`)}
                      >
                        <TableCell className="font-medium">
                          {p.razao_social}
                          {(fantasiaDistinta || p.cnpj) && (
                            <span className="block text-xs text-muted-foreground">
                              {fantasiaDistinta && <span>{p.nome_fantasia}</span>}
                              {fantasiaDistinta && p.cnpj && <span> · </span>}
                              {p.cnpj && <span className="tabular-nums">{formatCNPJ(p.cnpj)}</span>}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{formatBRL(cc?.documentado)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{formatBRL(cc?.pago)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Badge
                            variant="outline"
                            className={saldo > 0 ? "border-warning/40 text-warning" : "text-muted-foreground"}
                          >
                            {formatBRL(saldo)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateBR(cc?.ultimo_pagamento)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {kpi ? pct(num(kpi.giro_pct)) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {semCiclo ? "—" : pct(num(kpi!.margem_pct))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {kpi ? formatBRL(kpi.capital_parado) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {semCiclo ? "—" : `${qtd(kpi!.ritmo_packs_semana)} packs`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {semCiclo
                            ? "—"
                            : (num(kpi!.semanas_para_escoar) / 4.345).toLocaleString("pt-BR", {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {kpi ? num(kpi.n_ciclos) : "—"}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );

  if (embutido) return <div className="space-y-6">{conteudo}</div>;
  return <PageShell className="md:p-8">{conteudo}</PageShell>;
}
