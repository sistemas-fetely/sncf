import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Info, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  useDreDespesas, useDreIntegridade, useDreMensal, useDreMeses, useDreRefreshEstado,
  type DreLinhaMes,
} from "@/hooks/useDre";

const fmtBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function rotuloMes(mes: string | null | undefined) {
  if (!mes) return "—";
  const [a, m] = mes.slice(0, 10).split("-");
  const idx = Number(m) - 1;
  return MESES[idx] ? `${MESES[idx]}/${a}` : mes;
}

function fmtDataBR(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function fmtDataHora(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

/** valor exibido: negativo em vermelho e entre parênteses */
function Valor({ v }: { v: number | null | undefined }) {
  const n = Number(v ?? 0);
  if (n < 0) {
    return <span className="text-destructive tabular-nums">({fmtBRL(Math.abs(n))})</span>;
  }
  return <span className="tabular-nums">{fmtBRL(n)}</span>;
}

const CORES_SEV: Record<string, string> = {
  verde: "border-emerald-300 text-emerald-700 bg-emerald-50",
  laranja: "border-amber-300 text-amber-700 bg-amber-50",
  vermelho: "border-destructive/40 text-destructive bg-destructive/10",
};

const CODIGOS_DESTAQUE = new Set(["3", "5", "10", "16"]);

function BlocoErro({ erro }: { erro: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Falha ao carregar</AlertTitle>
      <AlertDescription className="text-xs break-all">
        {(erro as any)?.message ?? String(erro)}
      </AlertDescription>
    </Alert>
  );
}

export default function Dre() {
  const mesesQ = useDreMeses();
  const refreshQ = useDreRefreshEstado();

  const [mes, setMes] = useState<string | null>(null);
  const [mostrarZeradas, setMostrarZeradas] = useState(false);
  const [foraAberto, setForaAberto] = useState(false);
  const [drill, setDrill] = useState<{ codigo: string; label: string; valor: number } | null>(null);

  const meses = mesesQ.data ?? [];

  const mesPadrao = useMemo(() => {
    if (meses.length === 0) return null;
    if (meses.length === 1) return meses[0];
    const hoje = new Date();
    const corrente = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
    return meses.find((m) => m !== corrente) ?? meses[0];
  }, [meses]);

  const mesAtivo = mes ?? mesPadrao;

  const mesAnterior = useMemo(() => {
    if (!mesAtivo) return null;
    const idx = meses.indexOf(mesAtivo);
    return idx >= 0 ? meses[idx + 1] ?? null : null;
  }, [meses, mesAtivo]);

  const linhasQ = useDreMensal(
    [mesAtivo, mesAnterior].filter((m): m is string => !!m),
  );
  const integridadeQ = useDreIntegridade(mesAtivo);

  const dados = linhasQ.data ?? [];

  const doMes = useMemo(
    () => dados.filter((l) => l.mes?.slice(0, 10) === mesAtivo),
    [dados, mesAtivo],
  );

  const anterioresMap = useMemo(() => {
    const m = new Map<string, DreLinhaMes>();
    for (const l of dados) if (l.mes?.slice(0, 10) === mesAnterior) m.set(l.codigo, l);
    return m;
  }, [dados, mesAnterior]);

  const preparar = (linhas: DreLinhaMes[]) =>
    linhas
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((l) => {
        const ant = Number(anterioresMap.get(l.codigo)?.valor ?? 0);
        const atual = Number(l.valor ?? 0);
        const delta = atual - ant;
        const pct = ant !== 0 ? (delta / Math.abs(ant)) * 100 : null;
        return { l, ant, atual, delta, pct };
      })
      .filter((r) => mostrarZeradas || r.atual !== 0 || r.ant !== 0 || r.l.papel === "subtotal");

  const linhasDre = useMemo(
    () => preparar(doMes.filter((l) => !l.codigo.startsWith("90"))),
    [doMes, anterioresMap, mostrarZeradas],
  );

  const linhasFora = useMemo(
    () => preparar(doMes.filter((l) => l.codigo.startsWith("90"))),
    [doMes, anterioresMap, mostrarZeradas],
  );

  const integridade = useMemo(
    () => (integridadeQ.data ?? []).slice().sort((a, b) => a.ord - b.ord),
    [integridadeQ.data],
  );

  const temVermelho = integridade.some((i) => i.severidade === "vermelho");

  const drillQ = useDreDespesas(drill?.codigo ?? null, mesAtivo);

  const somaDrill = useMemo(
    () => (drillQ.data ?? []).reduce((acc, d) => acc + Number(d.valor ?? 0), 0),
    [drillQ.data],
  );
  const drillDivergente =
    !!drill && !drillQ.isLoading && !drillQ.isError &&
    Math.abs(somaDrill - Math.abs(drill.valor)) > 0.01;


  const renderLinha = (r: ReturnType<typeof preparar>[number]) => {
    const { l, ant, atual, delta, pct } = r;
    const subtotal = l.papel === "subtotal";
    const destaque = subtotal && CODIGOS_DESTAQUE.has(l.codigo);
    const clicavel =
      l.papel === "analitica" &&
      (l.fonte === "plano_contas" || l.fonte === "fora_dre") &&
      l.codigo !== "90.10";

    return (
      <TableRow
        key={l.codigo}
        className={cn(
          subtotal && "bg-muted/50 font-semibold",
          clicavel && "cursor-pointer hover:bg-muted/40",
        )}
        onClick={
          clicavel
            ? () => setDrill({ codigo: l.codigo, label: l.label, valor: atual })
            : undefined
        }

      >
        <TableCell className={cn("text-xs text-muted-foreground", destaque && "text-sm")}>
          {l.codigo}
        </TableCell>
        <TableCell className={cn(!subtotal && "pl-8", destaque && "text-base")}>
          <span className="inline-flex items-center gap-1.5">
            {l.label}
            {l.nota && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">{l.nota}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </span>
        </TableCell>
        <TableCell className="text-right"><Valor v={atual} /></TableCell>
        <TableCell className="text-right text-muted-foreground">
          {mesAnterior ? <Valor v={ant} /> : "—"}
        </TableCell>
        <TableCell className="text-right text-xs">
          {mesAnterior ? (
            <span className={cn(delta < 0 ? "text-destructive" : "text-muted-foreground")}>
              <Valor v={delta} />
              {pct !== null && (
                <span className="ml-1 tabular-nums">
                  ({pct > 0 ? "+" : ""}{pct.toFixed(1)}%)
                </span>
              )}
            </span>
          ) : "—"}
        </TableCell>
        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
          {l.exibe_pct_receita && l.pct_receita_liquida != null
            ? `${Number(l.pct_receita_liquida).toFixed(1)}%`
            : "—"}
        </TableCell>
      </TableRow>
    );
  };

  const cabecalho = (
    <TableHeader>
      <TableRow className="text-xs">
        <TableHead className="w-16">Cód.</TableHead>
        <TableHead>Linha</TableHead>
        <TableHead className="text-right">{rotuloMes(mesAtivo)}</TableHead>
        <TableHead className="text-right">{mesAnterior ? rotuloMes(mesAnterior) : "mês anterior"}</TableHead>
        <TableHead className="text-right">Variação</TableHead>
        <TableHead className="text-right">% RL</TableHead>
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">DRE — Demonstração do Resultado</h1>
          <p className="text-xs text-muted-foreground mt-1">
            dados de {fmtDataHora(refreshQ.data?.refreshed_em)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={mesAtivo ?? ""} onValueChange={(v) => setMes(v)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Selecione o mês" />
            </SelectTrigger>
            <SelectContent>
              {meses.map((m) => (
                <SelectItem key={m} value={m}>{rotuloMes(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMostrarZeradas((v) => !v)}
          >
            {mostrarZeradas ? "Ocultar linhas zeradas" : "Mostrar linhas zeradas"}
          </Button>
        </div>
      </div>

      {refreshQ.data?.erro && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro no último refresh da DRE</AlertTitle>
          <AlertDescription className="text-xs break-all">{refreshQ.data.erro}</AlertDescription>
        </Alert>
      )}

      {linhasQ.isError && <BlocoErro erro={linhasQ.error} />}
      {integridadeQ.isError && <BlocoErro erro={integridadeQ.error} />}
      {refreshQ.isError && <BlocoErro erro={refreshQ.error} />}

      {integridade.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {integridade.map((i) => (
            <Badge
              key={`${i.indicador}-${i.ord}`}
              variant="outline"
              className={cn("font-normal", CORES_SEV[i.severidade])}
            >
              {i.label}
              {Number(i.qtd ?? 0) > 0 && <span className="ml-1.5 tabular-nums">· {i.qtd}</span>}
              {Number(i.valor ?? 0) > 0 && (
                <span className="ml-1.5 tabular-nums">· {fmtBRL(i.valor)}</span>
              )}
            </Badge>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Resultado do mês</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {linhasQ.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : linhasDre.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma linha para este mês.
            </div>
          ) : (
            <Table>
              {cabecalho}
              <TableBody>{linhasDre.map(renderLinha)}</TableBody>
            </Table>
          )}
          {temVermelho && (
            <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              resultado incompleto
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <button
            type="button"
            className="flex items-center gap-2 text-left"
            onClick={() => setForaAberto((v) => !v)}
          >
            {foraAberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <CardTitle className="text-base">Fora da DRE (controle)</CardTitle>
          </button>
          <p className="text-xs text-muted-foreground pl-6">
            Valores que passaram por despesas mas não compõem o resultado: compra de estoque,
            CAPEX, guias de imposto e conciliação de folha.
          </p>
        </CardHeader>
        {foraAberto && (
          <CardContent className="pt-0">
            {linhasFora.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma linha de controle neste mês.
              </div>
            ) : (
              <Table>
                {cabecalho}
                <TableBody>{linhasFora.map(renderLinha)}</TableBody>
              </Table>
            )}
          </CardContent>
        )}
      </Card>

      <Sheet open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drill?.label}</SheetTitle>
            <SheetDescription>
              Lançamentos de despesas em {rotuloMes(mesAtivo)}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6">
            {drillQ.isError ? (
              <BlocoErro erro={drillQ.error} />
            ) : drillQ.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (drillQ.data ?? []).length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Nenhum lançamento encontrado.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Competência</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(drillQ.data ?? []).map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-xs">{fmtDataBR(d.data_competencia)}</TableCell>
                      <TableCell className="text-sm">{d.fornecedor_nome ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {d.descricao ?? "—"}
                      </TableCell>
                      <TableCell className="text-right"><Valor v={d.valor} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
