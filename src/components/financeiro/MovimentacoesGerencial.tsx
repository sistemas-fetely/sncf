import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  AlertCircle,
  ArrowUpRight,
  Layers,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import {
  useMovimentacoesGerencial,
  type MovimentacaoGerencial,
} from "@/hooks/financeiro/useMovimentacoesGerencial";

const SEM_CLASSIFICACAO = "__sem__";

function competenciaAtualISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function labelCompetencia(iso: string): string {
  const [y, m] = iso.split("-");
  const dt = new Date(Number(y), Number(m) - 1, 1);
  return dt.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function opcoesCompetencia(): { value: string; label: string }[] {
  const base = new Date();
  const arr: { value: string; label: string }[] = [];
  for (let i = -6; i <= 3; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    arr.push({ value, label: labelCompetencia(value) });
  }
  return arr;
}

type Agrupamento = "plano" | "centro";

export default function MovimentacoesGerencial() {
  const navigate = useNavigate();
  const [competencia, setCompetencia] = useState<string>(competenciaAtualISO());
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("plano");
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());

  const { data: linhas = [], isLoading } = useMovimentacoesGerencial(competencia, "pagar");

  const totalDespesas = useMemo(
    () => linhas.reduce((s, l) => s + Number(l.valor || 0), 0),
    [linhas],
  );
  const qtd = linhas.length;
  const qtdCompletas = useMemo(
    () => linhas.filter((l) => l.classificacao_completa).length,
    [linhas],
  );
  const pctCompletas = qtd > 0 ? Math.round((qtdCompletas / qtd) * 100) : 100;

  const grupos = useMemo(() => {
    const map = new Map<string, { chave: string; nome: string; linhas: MovimentacaoGerencial[]; subtotal: number }>();
    for (const l of linhas) {
      const chave =
        agrupamento === "plano"
          ? l.plano_contas_id || SEM_CLASSIFICACAO
          : l.centro_custo_id || SEM_CLASSIFICACAO;
      const nome =
        agrupamento === "plano"
          ? l.plano_contas_nome || "Sem classificação"
          : l.centro_custo_nome || "Sem centro de custo";
      const g = map.get(chave) || { chave, nome, linhas: [], subtotal: 0 };
      g.linhas.push(l);
      g.subtotal += Number(l.valor || 0);
      map.set(chave, g);
    }
    // Ordena: "sem" no topo, resto por nome
    return Array.from(map.values()).sort((a, b) => {
      if (a.chave === SEM_CLASSIFICACAO) return -1;
      if (b.chave === SEM_CLASSIFICACAO) return 1;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [linhas, agrupamento]);

  function toggleGrupo(chave: string) {
    setColapsados((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={competencia} onValueChange={setCompetencia}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Competência" />
          </SelectTrigger>
          <SelectContent>
            {opcoesCompetencia().map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-1">
          <Button
            size="sm"
            variant={agrupamento === "plano" ? "default" : "outline"}
            onClick={() => setAgrupamento("plano")}
            className={agrupamento === "plano" ? "bg-admin hover:bg-admin/90" : ""}
          >
            Por Plano de Contas
          </Button>
          <Button
            size="sm"
            variant={agrupamento === "centro" ? "default" : "outline"}
            onClick={() => setAgrupamento("centro")}
            className={agrupamento === "centro" ? "bg-admin hover:bg-admin/90" : ""}
          >
            Por Centro de Custo
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total de despesas</div>
            <div className="text-2xl font-bold font-mono mt-1">{formatBRL(totalDespesas)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{labelCompetencia(competencia)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Lançamentos</div>
            <div className="text-2xl font-bold mt-1">{qtd}</div>
          </CardContent>
        </Card>
        <Card className={cn(pctCompletas < 100 && "border-amber-300 bg-amber-50/50")}>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              Classificação completa
              {pctCompletas < 100 && <AlertCircle className="h-3 w-3 text-amber-600" />}
            </div>
            <div
              className={cn(
                "text-2xl font-bold mt-1",
                pctCompletas < 100 ? "text-amber-700" : "text-emerald-700",
              )}
            >
              {pctCompletas}%
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {qtdCompletas}/{qtd} com plano e centro
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela agrupada */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : linhas.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Layers className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Nenhuma despesa lançada nesta competência.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/administrativo-fetely/nfs-stage")}
              className="gap-2"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              Ir para NFs Stage
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/60">
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>
                  {agrupamento === "plano" ? "Centro de custo" : "Plano de contas"}
                </TableHead>
                <TableHead className="w-24">NF</TableHead>
                <TableHead className="w-28 text-right">Valor</TableHead>
                <TableHead className="w-24">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupos.map((g) => {
                const colapsado = colapsados.has(g.chave);
                const semClass = g.chave === SEM_CLASSIFICACAO;
                return (
                  <>
                    <TableRow
                      key={`h-${g.chave}`}
                      className={cn(
                        "cursor-pointer bg-muted/30 hover:bg-muted/50",
                        semClass && "bg-amber-50/60 hover:bg-amber-100/60",
                      )}
                      onClick={() => toggleGrupo(g.chave)}
                    >
                      <TableCell>
                        {colapsado ? (
                          <ChevronRight className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell colSpan={4} className="font-semibold">
                        <div className="flex items-center gap-2">
                          {semClass && (
                            <Badge
                              variant="outline"
                              className="border-amber-400 text-amber-700 bg-amber-50 gap-1"
                            >
                              <AlertCircle className="h-3 w-3" />
                              Sem classificação
                            </Badge>
                          )}
                          <span>{g.nome}</span>
                          <span className="text-xs text-muted-foreground font-normal">
                            ({g.linhas.length})
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatBRL(g.subtotal)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                    {!colapsado &&
                      g.linhas.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell />
                          <TableCell className="text-sm">
                            {l.fornecedor_cliente || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[320px] truncate">
                            {l.descricao || "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {agrupamento === "plano"
                              ? l.centro_custo_nome || (
                                  <span className="text-muted-foreground italic text-xs">
                                    sem centro
                                  </span>
                                )
                              : l.plano_contas_nome || (
                                  <span className="text-muted-foreground italic text-xs">
                                    sem plano
                                  </span>
                                )}
                          </TableCell>
                          <TableCell className="text-xs">{l.nf_numero || "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatBRL(Number(l.valor || 0))}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {l.status || "—"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
