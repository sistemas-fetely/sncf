/**
 * Despesas — registro único de despesas, todas as origens, por competência.
 *
 * Refator (26/07/2026): fonte trocada de `vw_despesas` para `vw_despesas_v2`.
 * Ganhos: dimensão Natureza de Investimento (camada gerencial) e a coluna
 * `estagio` do ciclo de vida da despesa, que substitui o antigo
 * `vinculo_status` (conciliada/pendente).
 *
 * Nota de campo: a v2 não expõe `numero_documento` nem `tipo_documento` —
 * a coluna "Nº doc" foi removida e a busca passou a cobrir CNPJ do fornecedor.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEstagioMeta } from "@/lib/despesas/estagios";

type DespesaV2 = {
  id: string;
  origem_porta: string | null;
  data_competencia: string | null;
  valor: number | null;
  descricao: string | null;
  fornecedor_nome: string | null;
  fornecedor_cnpj: string | null;
  plano_contas_id: string | null;
  plano_codigo: string | null;
  plano_nome: string | null;
  centro_custo_id: string | null;
  centro_codigo: string | null;
  centro_nome: string | null;
  natureza_investimento_id: string | null;
  natureza_codigo: string | null;
  natureza_nome: string | null;
  classificada_por: string | null;
  status_caixa: string | null;
  data_pagamento: string | null;
  documento_id: string | null;
  fatura_lancamento_id: string | null;
  estagio: string | null;
  created_at: string | null;
};

const PAGE_SIZE = 50;
const SEM_NATUREZA = "__sem_natureza__";

const MESES_ABBR = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** Rótulo curto de cada porta de entrada da despesa. */
const ORIGEM_LABEL: Record<string, string> = {
  nf: "NF",
  documento: "Doc",
  cartao: "Cartão",
  extrato: "Extrato",
  manual: "Manual",
};

/** Estágio do ciclo de vida — rótulo e tom do badge. */
const ESTAGIO_META: Record<string, { label: string; className: string }> = {
  completa: {
    label: "completa",
    className: "bg-emerald-600 hover:bg-emerald-600 text-white border-transparent",
  },
  aguardando_pagamento: {
    label: "aguarda pgto",
    className: "bg-blue-50 text-blue-700 border-blue-400",
  },
  sem_documento: {
    label: "sem documento",
    className: "bg-amber-100 text-amber-800 border-amber-400",
  },
  a_classificar: {
    label: "a classificar",
    className: "bg-transparent text-red-600 border-red-400",
  },
};

const ESTAGIO_FILTROS: { value: string; label: string }[] = [
  { value: "completa", label: "Completa" },
  { value: "aguardando_pagamento", label: "Aguarda pagamento" },
  { value: "sem_documento", label: "Sem documento" },
  { value: "a_classificar", label: "A classificar" },
];

function mesLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${MESES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
}

function mesKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function BadgeOrigem({ origem }: { origem: string | null }) {
  if (!origem) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="secondary" className="w-fit font-normal">
      {ORIGEM_LABEL[origem] ?? origem}
    </Badge>
  );
}

function BadgeEstagio({ estagio }: { estagio: string | null }) {
  if (!estagio) return <span className="text-muted-foreground">—</span>;
  const meta = ESTAGIO_META[estagio];
  if (!meta) return <Badge variant="outline">{estagio}</Badge>;
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", meta.className)}>
      {meta.label}
    </Badge>
  );
}

export default function Despesas() {
  const [busca, setBusca] = useState("");
  const [origem, setOrigem] = useState<string>("todas");
  const [mes, setMes] = useState<string>("todos");
  const [plano, setPlano] = useState<string>("todos");
  const [natureza, setNatureza] = useState<string>("todas");
  const [estagio, setEstagio] = useState<string>("todos");
  const [pagina, setPagina] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["vw_despesas_v2"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_despesas_v2")
        .select("*")
        .order("data_competencia", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DespesaV2[];
    },
  });

  const rows = useMemo(() => data ?? [], [data]);

  const origensDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.origem_porta) set.add(r.origem_porta);
    return Array.from(set).sort((a, b) =>
      (ORIGEM_LABEL[a] ?? a).localeCompare(ORIGEM_LABEL[b] ?? b),
    );
  }, [rows]);

  const mesesDisponiveis = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (!r.data_competencia) continue;
      const k = mesKey(r.data_competencia);
      if (!map.has(k)) map.set(k, mesLabel(r.data_competencia));
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  const planosDisponiveis = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (!r.plano_codigo) continue;
      if (!map.has(r.plano_codigo)) {
        map.set(r.plano_codigo, `${r.plano_codigo} — ${r.plano_nome ?? ""}`);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  /** Naturezas presentes nos dados + flag de existência de linhas sem natureza. */
  const naturezasDisponiveis = useMemo(() => {
    const map = new Map<string, string>();
    let temSem = false;
    for (const r of rows) {
      if (!r.natureza_codigo) {
        temSem = true;
        continue;
      }
      if (!map.has(r.natureza_codigo)) {
        map.set(r.natureza_codigo, r.natureza_nome ?? r.natureza_codigo);
      }
    }
    return {
      itens: Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1])),
      temSem,
    };
  }, [rows]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (origem !== "todas" && r.origem_porta !== origem) return false;
      if (mes !== "todos" && (!r.data_competencia || mesKey(r.data_competencia) !== mes)) {
        return false;
      }
      if (plano !== "todos" && r.plano_codigo !== plano) return false;
      if (natureza !== "todas") {
        if (natureza === SEM_NATUREZA) {
          if (r.natureza_codigo) return false;
        } else if (r.natureza_codigo !== natureza) {
          return false;
        }
      }
      if (estagio !== "todos" && r.estagio !== estagio) return false;
      if (q) {
        const hay = [
          r.fornecedor_nome ?? "",
          r.descricao ?? "",
          r.fornecedor_cnpj ?? "",
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, busca, origem, mes, plano, natureza, estagio]);

  /** KPIs sempre sobre o conjunto filtrado. */
  const kpis = useMemo(() => {
    const n = filtradas.length;
    const total = filtradas.reduce((s, r) => s + Number(r.valor || 0), 0);
    const completas = filtradas.filter(
      (r) => r.plano_contas_id && r.centro_custo_id && r.natureza_investimento_id,
    ).length;
    const pagas = filtradas.filter((r) => r.status_caixa === "pago").length;
    const aClassificar = filtradas.filter((r) => r.estagio === "a_classificar");
    return {
      total,
      n,
      pctCompletas: n ? (completas / n) * 100 : 0,
      completas,
      pctPagas: n ? (pagas / n) * 100 : 0,
      pagas,
      aClassificarN: aClassificar.length,
      aClassificarValor: aClassificar.reduce((s, r) => s + Number(r.valor || 0), 0),
    };
  }, [filtradas]);

  // Reset de página quando qualquer filtro muda
  useEffect(() => {
    setPagina(1);
  }, [busca, origem, mes, plano, natureza, estagio]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const paginadas = filtradas.slice(
    (paginaAtual - 1) * PAGE_SIZE,
    paginaAtual * PAGE_SIZE,
  );

  const COLSPAN = 9;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-serif text-foreground">Despesas</h1>
        <p className="text-sm text-muted-foreground">
          Registro único de despesas — todas as origens, por competência.
        </p>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 flex items-start gap-2 text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">Erro ao carregar despesas</div>
              <div className="text-sm opacity-90">{(error as Error).message}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total</div>
            <div className="text-2xl font-serif mt-1">{formatBRL(kpis.total)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {kpis.n} {kpis.n === 1 ? "despesa" : "despesas"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Classificação completa
            </div>
            <div className="text-2xl font-serif mt-1">{kpis.pctCompletas.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">
              {kpis.completas}/{kpis.n} · plano + centro + natureza
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Pagas</div>
            <div className="text-2xl font-serif mt-1">{kpis.pctPagas.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">
              {kpis.pagas}/{kpis.n} · caixa liquidado
            </div>
          </CardContent>
        </Card>
        <Card
          className={cn(
            kpis.aClassificarN > 0 && "border-amber-400 bg-amber-50/50",
          )}
        >
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              A classificar
              {kpis.aClassificarN > 0 && (
                <AlertCircle className="h-3 w-3 text-amber-600" />
              )}
            </div>
            <div
              className={cn(
                "text-2xl font-serif mt-1",
                kpis.aClassificarN > 0 ? "text-amber-700" : "text-emerald-700",
              )}
            >
              {kpis.aClassificarN}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatBRL(kpis.aClassificarValor)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Input
          placeholder="Buscar fornecedor, descrição, CNPJ…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Select value={origem} onValueChange={setOrigem}>
          <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as origens</SelectItem>
            {origensDisponiveis.map((o) => (
              <SelectItem key={o} value={o}>{ORIGEM_LABEL[o] ?? o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger><SelectValue placeholder="Competência" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meses</SelectItem>
            {mesesDisponiveis.map(([k, l]) => (
              <SelectItem key={k} value={k}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={plano} onValueChange={setPlano}>
          <SelectTrigger><SelectValue placeholder="Plano" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os planos</SelectItem>
            {planosDisponiveis.map(([k, l]) => (
              <SelectItem key={k} value={k}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={natureza} onValueChange={setNatureza}>
          <SelectTrigger><SelectValue placeholder="Natureza" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as naturezas</SelectItem>
            {naturezasDisponiveis.itens.map(([k, l]) => (
              <SelectItem key={k} value={k}>{l}</SelectItem>
            ))}
            {naturezasDisponiveis.temSem && (
              <SelectItem value={SEM_NATUREZA}>⚠️ Sem natureza</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Select value={estagio} onValueChange={setEstagio}>
          <SelectTrigger><SelectValue placeholder="Estágio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os estágios</SelectItem>
            {ESTAGIO_FILTROS.map((e) => (
              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competência</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Natureza</TableHead>
                <TableHead>Centro</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Estágio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={COLSPAN} className="text-center text-muted-foreground py-8">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && paginadas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLSPAN} className="text-center text-muted-foreground py-8">
                    Nenhuma despesa encontrada.
                  </TableCell>
                </TableRow>
              )}
              {paginadas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">
                    {r.data_competencia ? formatDateBR(r.data_competencia) : "—"}
                  </TableCell>
                  <TableCell>
                    <BadgeOrigem origem={r.origem_porta} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">{r.fornecedor_nome ?? "—"}</span>
                      {r.fornecedor_cnpj && (
                        <span className="text-[11px] text-muted-foreground">
                          {r.fornecedor_cnpj}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <div className="truncate text-sm" title={r.descricao ?? ""}>
                      {r.descricao ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.plano_codigo ? (
                      <span className="text-sm">
                        {r.plano_codigo} — {r.plano_nome ?? ""}
                      </span>
                    ) : (
                      <Badge variant="outline" className="border-amber-500 text-amber-600">
                        sem plano
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.natureza_nome ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-normal whitespace-nowrap"
                      >
                        {r.natureza_nome}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{r.centro_codigo ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm whitespace-nowrap">
                    {formatBRL(Number(r.valor || 0))}
                  </TableCell>
                  <TableCell>
                    <BadgeEstagio estagio={r.estagio} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Paginação */}
      {filtradas.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {(paginaAtual - 1) * PAGE_SIZE + 1}–
            {Math.min(paginaAtual * PAGE_SIZE, filtradas.length)} de {filtradas.length}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={paginaAtual <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
            >Anterior</Button>
            <span className="text-sm">{paginaAtual} / {totalPaginas}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={paginaAtual >= totalPaginas}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            >Próxima</Button>
          </div>
        </div>
      )}
    </div>
  );
}
