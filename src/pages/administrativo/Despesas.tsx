import { useMemo, useState } from "react";
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

type Despesa = {
  despesa_id: string;
  origem: "documento" | "extrato_direto";
  tipo_documento: string | null;
  competencia: string;
  fornecedor_nome: string | null;
  fornecedor_cnpj: string | null;
  descricao: string | null;
  valor: number | null;
  plano_contas_id: string | null;
  plano_codigo: string | null;
  plano_nome: string | null;
  centro_custo_id: string | null;
  centro_codigo: string | null;
  centro_nome: string | null;
  classificada: boolean | null;
  vinculo_status: "conciliada" | "pendente";
  stage_id: string | null;
  movimentacao_id: string | null;
  conta_pagar_id: string | null;
  data_vencimento: string | null;
  numero_documento: string | null;
};

const PAGE_SIZE = 50;
const MESES_ABBR = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function mesLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${MESES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
}

function mesKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

export default function Despesas() {
  const [busca, setBusca] = useState("");
  const [origem, setOrigem] = useState<string>("todas");
  const [mes, setMes] = useState<string>("todos");
  const [plano, setPlano] = useState<string>("todos");
  const [status, setStatus] = useState<string>("todos");
  const [pagina, setPagina] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["vw_despesas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_despesas")
        .select("*")
        .order("competencia", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Despesa[];
    },
  });

  const rows = data ?? [];

  const mesesDisponiveis = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (!r.competencia) continue;
      const k = mesKey(r.competencia);
      if (!map.has(k)) map.set(k, mesLabel(r.competencia));
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

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (origem !== "todas" && r.origem !== origem) return false;
      if (mes !== "todos" && (!r.competencia || mesKey(r.competencia) !== mes)) return false;
      if (plano !== "todos" && r.plano_codigo !== plano) return false;
      if (status !== "todos" && r.vinculo_status !== status) return false;
      if (q) {
        const hay = [
          r.fornecedor_nome ?? "",
          r.descricao ?? "",
          r.numero_documento ?? "",
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, busca, origem, mes, plano, status]);

  const kpis = useMemo(() => {
    const total = filtradas.reduce((s, r) => s + Number(r.valor || 0), 0);
    const n = filtradas.length;
    const classif = filtradas.filter(
      (r) => r.plano_contas_id && r.centro_custo_id,
    ).length;
    const conc = filtradas.filter((r) => r.vinculo_status === "conciliada").length;
    const pend = filtradas.filter((r) => r.vinculo_status === "pendente").length;
    return {
      total,
      n,
      pctClassif: n ? (classif / n) * 100 : 0,
      pctConc: n ? (conc / n) * 100 : 0,
      pend,
    };
  }, [filtradas]);

  // Reset página quando filtros mudam
  useMemo(() => {
    setPagina(1);
  }, [busca, origem, mes, plano, status]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const paginadas = filtradas.slice(
    (paginaAtual - 1) * PAGE_SIZE,
    paginaAtual * PAGE_SIZE,
  );

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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total</div>
            <div className="text-2xl font-serif mt-1">{formatBRL(kpis.total)}</div>
            <div className="text-xs text-muted-foreground mt-1">{kpis.n} despesas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Classificação completa</div>
            <div className="text-2xl font-serif mt-1">{kpis.pctClassif.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">plano + centro</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Conciliadas</div>
            <div className="text-2xl font-serif mt-1">{kpis.pctConc.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">com vínculo bancário</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Pendentes de vínculo</div>
            <div className="text-2xl font-serif mt-1">{kpis.pend}</div>
            <div className="text-xs text-muted-foreground mt-1">sem conciliação</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <Input
          placeholder="Buscar fornecedor, descrição, nº doc…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Select value={origem} onValueChange={setOrigem}>
          <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as origens</SelectItem>
            <SelectItem value="documento">Documento</SelectItem>
            <SelectItem value="extrato_direto">Extrato direto</SelectItem>
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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="conciliada">Conciliada</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
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
                <TableHead>Nº doc</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Centro</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
              )}
              {!isLoading && paginadas.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhuma despesa encontrada.</TableCell></TableRow>
              )}
              {paginadas.map((r) => (
                <TableRow key={r.despesa_id}>
                  <TableCell className="whitespace-nowrap">{formatDateBR(r.competencia)}</TableCell>
                  <TableCell>
                    {r.origem === "documento" ? (
                      <div className="flex flex-col gap-0.5">
                        {r.tipo_documento && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.tipo_documento}</span>
                        )}
                        <Badge variant="secondary" className="w-fit">Documento</Badge>
                      </div>
                    ) : (
                      <Badge variant="outline" className="w-fit">Extrato</Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{r.numero_documento ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">{r.fornecedor_nome ?? "—"}</span>
                      {r.fornecedor_cnpj && (
                        <span className="text-[11px] text-muted-foreground">{r.fornecedor_cnpj}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <div className="truncate text-sm" title={r.descricao ?? ""}>{r.descricao ?? "—"}</div>
                  </TableCell>
                  <TableCell>
                    {r.plano_codigo ? (
                      <span className="text-sm">{r.plano_codigo} — {r.plano_nome ?? ""}</span>
                    ) : (
                      <Badge variant="outline" className="border-amber-500 text-amber-600">sem plano</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{r.centro_codigo ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm whitespace-nowrap">{formatBRL(Number(r.valor || 0))}</TableCell>
                  <TableCell>
                    {r.vinculo_status === "conciliada" ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">conciliada</Badge>
                    ) : (
                      <Badge variant="outline">pendente</Badge>
                    )}
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
            {(paginaAtual - 1) * PAGE_SIZE + 1}–{Math.min(paginaAtual * PAGE_SIZE, filtradas.length)} de {filtradas.length}
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
