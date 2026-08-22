import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  ArrowLeft,
  Download,
  Landmark,
  Search,
  X,
  AlertTriangle,
  FileSearch,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import {
  SortableTableHead,
  ordenarPor,
  type SortState,
} from "@/components/shared/SortableTableHead";
import { FiltroMultiSelect } from "@/components/financeiro/FiltroMultiSelect";
import { ExtratoLinhaSheet } from "@/components/financeiro/ExtratoLinhaSheet";
import {
  useExtratoConta,
  useExtratoContaOpcoes,
  type ExtratoLinha,
} from "@/hooks/useExtratoConta";

/**
 * SALDO CORRIDO — desligado nesta versão.
 * A coluna está implementada, mas o dado de `saldo_corrido` só passa a ser
 * confiável depois da reimportação completa dos extratos. Até lá não pode
 * aparecer para o usuário. Ligar apenas quando a reimportação estiver concluída.
 */
const SALDO_CORRIDO_ATIVO = false;

type Preset = "este_mes" | "mes_passado" | "90_dias" | "este_ano" | "tudo";
type ColunaSort = "data" | "valor";

const PRESETS: { valor: Preset; label: string }[] = [
  { valor: "este_mes", label: "Este mês" },
  { valor: "mes_passado", label: "Mês passado" },
  { valor: "90_dias", label: "Últimos 90 dias" },
  { valor: "este_ano", label: "Este ano" },
  { valor: "tudo", label: "Tudo" },
];

const PAGINA = 100;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function intervaloPreset(p: Preset): { inicio: string | null; fim: string | null } {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  if (p === "este_mes")
    return { inicio: iso(new Date(ano, mes, 1)), fim: iso(new Date(ano, mes + 1, 0)) };
  if (p === "mes_passado")
    return { inicio: iso(new Date(ano, mes - 1, 1)), fim: iso(new Date(ano, mes, 0)) };
  if (p === "90_dias") {
    const de = new Date(hoje);
    de.setDate(de.getDate() - 90);
    return { inicio: iso(de), fim: iso(hoje) };
  }
  if (p === "este_ano")
    return { inicio: iso(new Date(ano, 0, 1)), fim: iso(new Date(ano, 11, 31)) };
  return { inicio: null, fim: null };
}

export default function ExtratoConta() {
  const { contaId } = useParams<{ contaId: string }>();
  const navigate = useNavigate();

  const [preset, setPreset] = useState<Preset>("este_mes");
  const [dataInicio, setDataInicio] = useState<string>(
    () => intervaloPreset("este_mes").inicio ?? "",
  );
  const [dataFim, setDataFim] = useState<string>(
    () => intervaloPreset("este_mes").fim ?? "",
  );
  const [busca, setBusca] = useState("");
  const [sentido, setSentido] = useState<"todos" | "entrada" | "saida">("todos");
  const [meios, setMeios] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [origens, setOrigens] = useState<string[]>([]);
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [conciliado, setConciliado] = useState<"todos" | "sim" | "nao">("todos");
  const [mostrarDescartadas, setMostrarDescartadas] = useState(false);
  const [sort, setSort] = useState<SortState<ColunaSort> | null>({
    column: "data",
    direction: "desc",
  });
  const [pagina, setPagina] = useState(1);
  const [detalhe, setDetalhe] = useState<ExtratoLinha | null>(null);

  const filtrosServidor = useMemo(
    () => ({
      dataInicio: dataInicio || null,
      dataFim: dataFim || null,
      busca,
      sentido,
      conciliado,
    }),
    [dataInicio, dataFim, busca, sentido, conciliado],
  );

  const { data: linhas, isLoading, isError, error } = useExtratoConta(
    contaId,
    filtrosServidor,
  );
  const { data: opcoes } = useExtratoContaOpcoes(contaId);

  function aplicarPreset(p: Preset) {
    setPreset(p);
    const { inicio, fim } = intervaloPreset(p);
    setDataInicio(inicio ?? "");
    setDataFim(fim ?? "");
    setPagina(1);
  }

  const filtroAtivo =
    preset !== "este_mes" ||
    !!busca ||
    sentido !== "todos" ||
    meios.length > 0 ||
    classes.length > 0 ||
    origens.length > 0 ||
    !!valorMin ||
    !!valorMax ||
    conciliado !== "todos";

  function limparFiltros() {
    setBusca("");
    setSentido("todos");
    setMeios([]);
    setClasses([]);
    setOrigens([]);
    setValorMin("");
    setValorMax("");
    setConciliado("todos");
    aplicarPreset("este_mes");
  }

  // Filtros locais (multiselects + faixa de valor).
  const base = useMemo(() => {
    const min = valorMin ? Number(valorMin.replace(",", ".")) : null;
    const max = valorMax ? Number(valorMax.replace(",", ".")) : null;
    return (linhas || []).filter((l) => {
      if (meios.length && !(l.tipo_meio && meios.includes(l.tipo_meio))) return false;
      if (classes.length && !(l.classe && classes.includes(l.classe))) return false;
      if (origens.length && !(l.origem && origens.includes(l.origem))) return false;
      const abs = Number(l.valor_abs ?? Math.abs(Number(l.valor || 0)));
      if (min !== null && !Number.isNaN(min) && abs < min) return false;
      if (max !== null && !Number.isNaN(max) && abs > max) return false;
      return true;
    });
  }, [linhas, meios, classes, origens, valorMin, valorMax]);

  const descartadasCount = base.filter((l) => l.descartada).length;

  const visiveis = useMemo(() => {
    const lista = mostrarDescartadas ? base : base.filter((l) => !l.descartada);
    return ordenarPor(lista, sort, {
      data: (l) => l.data_hora || l.data_transacao || null,
      valor: (l) => Number(l.valor_abs ?? Math.abs(Number(l.valor || 0))),
    });
  }, [base, mostrarDescartadas, sort]);

  // Totais: só conta_no_saldo = true, nunca descartadas.
  const totais = useMemo(() => {
    const elegiveis = base.filter((l) => l.conta_no_saldo === true && !l.descartada);
    let entradas = 0;
    let saidas = 0;
    for (const l of elegiveis) {
      const abs = Number(l.valor_abs ?? Math.abs(Number(l.valor || 0)));
      if (l.sentido === "entrada") entradas += abs;
      else saidas += abs;
    }
    return { entradas, saidas, liquido: entradas - saidas };
  }, [base]);

  const paginadas = visiveis.slice(0, pagina * PAGINA);

  const ultimo = opcoes?.ultimoLancamento ?? null;
  const defasado = useMemo(() => {
    if (!ultimo) return false;
    const d = new Date(ultimo + "T00:00:00");
    return (Date.now() - d.getTime()) / 86400000 > 7;
  }, [ultimo]);

  const nomeConta = opcoes?.contaNome || linhas?.[0]?.conta_nome || "Conta";

  function exportarCsv() {
    if (visiveis.length === 0) {
      toast.error("Nada para exportar com os filtros atuais.");
      return;
    }
    const cols: (keyof ExtratoLinha)[] = [
      "data_transacao",
      "data_hora",
      "descricao",
      "contraparte_nome",
      "contraparte_documento",
      "tipo_meio",
      "classe",
      "origem",
      "sentido",
      "valor",
      "valor_abs",
      "conciliado",
      "plano_contas_nome",
      "referencia_pedido",
      "conta_no_saldo",
      "descartada",
    ];
    const esc = (v: unknown) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      cols.join(";"),
      ...visiveis.map((l) => cols.map((c) => esc(l[c])).join(";")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extrato-${nomeConta.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageShell>
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 -ml-2 h-7 text-muted-foreground"
            onClick={() => navigate("/administrativo/caixa-banco/contas")}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Contas bancárias
          </Button>
          <h1 className="text-2xl font-medium flex items-center gap-2">
            <Landmark className="h-6 w-6 text-admin" />
            {nomeConta}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Extrato da conta · somente leitura</span>
            {ultimo && <span>· último lançamento em {formatDateBR(ultimo)}</span>}
            {defasado && (
              <Badge
                variant="outline"
                className="gap-1 border-warning text-warning text-[10px]"
              >
                <AlertTriangle className="h-3 w-3" />
                extrato defasado — última importação em {formatDateBR(ultimo)}
              </Badge>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={exportarCsv}>
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Números grandes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Entradas
            </p>
            <p className="text-2xl font-medium text-success">{formatBRL(totais.entradas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Saídas
            </p>
            <p className="text-2xl font-medium text-destructive">{formatBRL(totais.saidas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Líquido
            </p>
            <p className="text-2xl font-medium">{formatBRL(totais.liquido)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.valor}
                size="sm"
                variant={preset === p.valor ? "secondary" : "ghost"}
                className="h-7 text-xs"
                onClick={() => aplicarPreset(p.valor)}
              >
                {p.label}
              </Button>
            ))}
            <div className="flex items-center gap-1.5 ml-auto">
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value);
                  setPreset("tudo");
                }}
                className="h-8 w-[9.5rem]"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => {
                  setDataFim(e.target.value);
                  setPreset("tudo");
                }}
                className="h-8 w-[9.5rem]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPagina(1);
                }}
                placeholder="Buscar descrição, contraparte, documento ou pedido"
                className="h-8 pl-8"
              />
            </div>

            <Tabs
              value={sentido}
              onValueChange={(v) => {
                setSentido(v as typeof sentido);
                setPagina(1);
              }}
            >
              <TabsList className="h-8">
                <TabsTrigger value="todos" className="text-xs px-3">Tudo</TabsTrigger>
                <TabsTrigger value="entrada" className="text-xs px-3">Entradas</TabsTrigger>
                <TabsTrigger value="saida" className="text-xs px-3">Saídas</TabsTrigger>
              </TabsList>
            </Tabs>

            <FiltroMultiSelect
              label="Meio"
              opcoes={opcoes?.meios || []}
              selecionados={meios}
              onChange={(v) => { setMeios(v); setPagina(1); }}
              className="h-8"
            />
            <FiltroMultiSelect
              label="Classe"
              opcoes={opcoes?.classes || []}
              selecionados={classes}
              onChange={(v) => { setClasses(v); setPagina(1); }}
              className="h-8"
            />
            <FiltroMultiSelect
              label="Origem"
              opcoes={opcoes?.origens || []}
              selecionados={origens}
              onChange={(v) => { setOrigens(v); setPagina(1); }}
              className="h-8"
            />

            <div className="flex items-center gap-1.5">
              <Input
                value={valorMin}
                onChange={(e) => setValorMin(e.target.value)}
                inputMode="decimal"
                placeholder="mín"
                className="h-8 w-20"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                value={valorMax}
                onChange={(e) => setValorMax(e.target.value)}
                inputMode="decimal"
                placeholder="máx"
                className="h-8 w-20"
              />
            </div>

            <Select
              value={conciliado}
              onValueChange={(v) => {
                setConciliado(v as typeof conciliado);
                setPagina(1);
              }}
            >
              <SelectTrigger className="h-8 w-[9.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Conciliado: tudo</SelectItem>
                <SelectItem value="sim">Conciliado: sim</SelectItem>
                <SelectItem value="nao">Conciliado: não</SelectItem>
              </SelectContent>
            </Select>

            {filtroAtivo && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={limparFiltros}
              >
                <X className="h-3.5 w-3.5" />
                Limpar filtros
              </Button>
            )}
          </div>

          {descartadasCount > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <Switch
                id="mostrar-descartadas"
                checked={mostrarDescartadas}
                onCheckedChange={setMostrarDescartadas}
              />
              <Label
                htmlFor="mostrar-descartadas"
                className="text-xs text-muted-foreground font-normal"
              >
                {descartadasCount} {descartadasCount === 1 ? "linha descartada" : "linhas descartadas"} · mostrar descartadas
              </Label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela */}
      {isError ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm font-medium">Não foi possível carregar o extrato.</p>
            <p className="text-xs text-muted-foreground">
              {(error as Error)?.message}
            </p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <FileSearch className="h-9 w-9 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">
              Nenhum lançamento nesta conta {dataInicio || dataFim ? "no período selecionado" : "com os filtros atuais"}.
            </p>
            <p className="text-xs text-muted-foreground">
              Tente ampliar o período — o atalho “Tudo” mostra o extrato completo da conta.
            </p>
            <Button variant="outline" size="sm" onClick={() => aplicarPreset("tudo")}>
              Ver tudo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead column="data" sort={sort} onSort={setSort} className="w-[6.5rem]">
                    Data
                  </SortableTableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Contraparte</TableHead>
                  <TableHead className="w-[8rem]">Meio</TableHead>
                  <TableHead className="w-[9rem]">Classe</TableHead>
                  <SortableTableHead column="valor" sort={sort} onSort={setSort} align="right" className="w-[8.5rem]">
                    Valor
                  </SortableTableHead>
                  {SALDO_CORRIDO_ATIVO && (
                    <TableHead className="text-right w-[9rem]">Saldo corrido</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginadas.map((l) => {
                  const abs = Number(l.valor_abs ?? Math.abs(Number(l.valor || 0)));
                  const risco = !!l.descartada;
                  return (
                    <TableRow
                      key={l.id}
                      onClick={() => setDetalhe(l)}
                      className={
                        "cursor-pointer " +
                        (risco ? "text-muted-foreground line-through opacity-70" : "")
                      }
                    >
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDateBR(l.data_transacao)}
                      </TableCell>
                      <TableCell className="text-sm max-w-[22rem]">
                        <div className="truncate">{l.descricao || "—"}</div>
                        {l.referencia_pedido && (
                          <div className="text-[10px] text-muted-foreground">
                            Pedido {l.referencia_pedido}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-[16rem]">
                        <div className="truncate">{l.contraparte_nome || "—"}</div>
                      </TableCell>
                      <TableCell className="text-xs">{l.tipo_meio || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {l.classe && (
                            <Badge variant="outline" className="text-[10px]">
                              {l.classe}
                            </Badge>
                          )}
                          {l.conciliado && (
                            <Badge variant="secondary" className="text-[10px]">
                              Conciliado
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell
                        className={
                          "text-right font-medium tabular-nums " +
                          (risco
                            ? ""
                            : l.sentido === "entrada"
                              ? "text-success"
                              : "text-destructive")
                        }
                      >
                        {l.sentido === "saida" ? "-" : ""}
                        {formatBRL(abs)}
                      </TableCell>
                      {SALDO_CORRIDO_ATIVO && (
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                          {l.saldo_corrido != null ? formatBRL(Number(l.saldo_corrido)) : "—"}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between gap-3 border-t p-3">
              <p className="text-xs text-muted-foreground">
                Mostrando {paginadas.length} de {visiveis.length} lançamentos
              </p>
              {paginadas.length < visiveis.length && (
                <Button variant="outline" size="sm" onClick={() => setPagina((p) => p + 1)}>
                  Carregar mais
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <ExtratoLinhaSheet linha={detalhe} onClose={() => setDetalhe(null)} />
    </PageShell>
  );
}
