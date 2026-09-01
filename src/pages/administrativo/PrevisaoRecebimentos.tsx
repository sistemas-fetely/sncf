import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertTriangle, ArrowDownToLine } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import { hojeISO, fmtData, parseDataPura } from "@/lib/data";
import { cn } from "@/lib/utils";

/* ---------------- tipos ---------------- */

type Camada = "firme" | "em_registro" | "promessa" | "sem_prova" | "condicional";
type Instrumento = "boleto" | "cartao" | "pix" | "conta_corrente" | "haver";

interface FluxoLinha {
  origem_id: string;
  origem: "titulo" | "provisao";
  numero_titulo: string | null;
  pedido_id: string;
  parceiro_id: string | null;
  cliente: string | null;
  instrumento: Instrumento;
  qualidade: Camada;
  dia: string;
  dia_caixa: string;
  eh_atrasado: boolean;
  data_vencimento_atual: string | null;
  conta_bancaria_id: string | null;
  conta_nome: string | null;
  conta_cor: string | null;
  valor_bruto: number;
  taxa_prevista: number;
  valor_liquido: number;
  taxa_ausente: boolean;
}

interface ContaBancaria {
  id: string;
  nome_exibicao: string | null;
  cor: string | null;
  ativo: boolean | null;
}

interface Coluna {
  id: string; // uuid ou "__sem_conta__"
  nome: string;
  cor: string | null;
}

interface LinhaGrade {
  chave: string; // "__atrasado__" ou dia_caixa
  rotulo: string;
  atrasado: boolean;
  fimDeSemana: boolean;
  mes: string | null; // rótulo de mês quando muda
  porConta: Record<string, number>;
  total: number;
  acumulado: number;
  linhas: FluxoLinha[];
}

const SEM_CONTA = "__sem_conta__";
const NUM = "tabular-nums";

const CAMADAS: { id: Camada; rotulo: string; descricao: string }[] = [
  {
    id: "firme",
    rotulo: "Firme",
    descricao:
      "Boleto registrado no banco ou cartão com autorização capturada. Instrumento que força o pagamento.",
  },
  {
    id: "em_registro",
    rotulo: "Em registro",
    descricao:
      "Boleto enviado na remessa, retorno do banco ainda não confirmou o registro.",
  },
  {
    id: "promessa",
    rotulo: "Promessa",
    descricao:
      "PIX a prazo — tem vencimento combinado, mas nenhum instrumento cobra sozinho. Depende de régua.",
  },
  {
    id: "sem_prova",
    rotulo: "Sem prova",
    descricao:
      "Cartão faturado sem NSU gravado. Não é dúvida comercial, é pendência de dado nossa.",
  },
  {
    id: "condicional",
    rotulo: "Condicional",
    descricao: "Provisão pré-NF. Só vira caixa se a nota for emitida.",
  },
];

const ROTULO_CAMADA: Record<Camada, string> = {
  firme: "Firme",
  em_registro: "Em registro",
  promessa: "Promessa",
  sem_prova: "Sem prova",
  condicional: "Condicional",
};

const ROTULO_INSTRUMENTO: Record<Instrumento, string> = {
  boleto: "Boleto",
  cartao: "Cartão",
  pix: "PIX",
  conta_corrente: "Conta corrente",
  haver: "Haver",
};

function somaLiquido(rows: FluxoLinha[]): number {
  return rows.reduce((acc, r) => acc + Number(r.valor_liquido || 0), 0);
}

function diaSemanaCurto(iso: string): string {
  const d = parseDataPura(iso);
  if (!d) return "";
  return d
    .toLocaleDateString("pt-BR", { weekday: "short" })
    .replace(".", "")
    .toLowerCase();
}

function ehFimDeSemana(iso: string): boolean {
  const d = parseDataPura(iso);
  if (!d) return false;
  const w = d.getDay();
  return w === 0 || w === 6;
}

function rotuloMes(iso: string): string {
  const d = parseDataPura(iso);
  if (!d) return "";
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function somarDias(iso: string, dias: number): string {
  const d = parseDataPura(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + dias);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function quebraPorInstrumento(rows: FluxoLinha[]): string[] {
  const ordem: Instrumento[] = ["boleto", "cartao", "pix"];
  const out: string[] = [];
  for (const i of ordem) {
    const v = somaLiquido(rows.filter((r) => r.instrumento === i));
    if (v > 0) out.push(`${ROTULO_INSTRUMENTO[i]} ${formatBRL(v)}`);
  }
  return out;
}

/* ---------------- página ---------------- */

export default function PrevisaoRecebimentos() {
  const [camadas, setCamadas] = useState<Camada[]>(["firme"]);
  const [instr, setInstr] = useState<string>("todos");
  const [diaAberto, setDiaAberto] = useState<LinhaGrade | null>(null);

  const hoje = hojeISO();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["fluxo-caixa-recebiveis-diario"],
    queryFn: async (): Promise<FluxoLinha[]> => {
      const { data, error } = await supabase
        .from("vw_fluxo_caixa_recebiveis_diario")
        .select("*");
      if (error) throw error;
      return (data ?? []) as unknown as FluxoLinha[];
    },
  });

  const { data: contas } = useQuery({
    queryKey: ["contas-bancarias-ativas-fluxo"],
    queryFn: async (): Promise<ContaBancaria[]> => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao, cor, ativo")
        .eq("ativo", true);
      if (error) throw error;
      return (data ?? []) as ContaBancaria[];
    },
  });

  const todas = rows ?? [];

  const visiveis = useMemo(() => {
    return todas.filter((r) => {
      if (!camadas.includes(r.qualidade)) return false;
      if (instr === "todos") return true;
      if (instr === "outros")
        return !["boleto", "cartao", "pix"].includes(r.instrumento);
      return r.instrumento === instr;
    });
  }, [todas, camadas, instr]);

  const totalPorCamada = useMemo(() => {
    const map = {} as Record<Camada, number>;
    for (const c of CAMADAS) map[c.id] = 0;
    for (const r of todas) {
      map[r.qualidade] = (map[r.qualidade] ?? 0) + Number(r.valor_liquido || 0);
    }
    return map;
  }, [todas]);

  const colunas = useMemo<Coluna[]>(() => {
    const usados = new Set(visiveis.map((r) => r.conta_bancaria_id ?? SEM_CONTA));
    const ativas = (contas ?? [])
      .filter((c) => usados.has(c.id))
      .map<Coluna>((c) => ({
        id: c.id,
        nome: c.nome_exibicao || "Conta",
        cor: c.cor,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    // contas presentes nos dados que não vieram na lista de ativas
    const conhecidas = new Set(ativas.map((c) => c.id));
    const extras = new Map<string, Coluna>();
    for (const r of visiveis) {
      if (!r.conta_bancaria_id) continue;
      if (conhecidas.has(r.conta_bancaria_id)) continue;
      if (extras.has(r.conta_bancaria_id)) continue;
      extras.set(r.conta_bancaria_id, {
        id: r.conta_bancaria_id,
        nome: r.conta_nome || "Conta",
        cor: r.conta_cor,
      });
    }
    const lista = [...ativas, ...[...extras.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))];

    if (usados.has(SEM_CONTA)) {
      lista.push({ id: SEM_CONTA, nome: "Sem conta definida", cor: null });
    }
    return lista;
  }, [visiveis, contas]);

  const grade = useMemo<LinhaGrade[]>(() => {
    const atrasadas = visiveis.filter((r) => r.eh_atrasado);
    const futuras = visiveis.filter((r) => !r.eh_atrasado);

    const porDia = new Map<string, FluxoLinha[]>();
    for (const r of futuras) {
      const k = r.dia_caixa;
      const arr = porDia.get(k);
      if (arr) arr.push(r);
      else porDia.set(k, [r]);
    }

    const montar = (
      chave: string,
      rotulo: string,
      linhas: FluxoLinha[],
      atrasado: boolean,
      fimDeSemana: boolean,
    ): LinhaGrade => {
      const porConta: Record<string, number> = {};
      for (const r of linhas) {
        const k = r.conta_bancaria_id ?? SEM_CONTA;
        porConta[k] = (porConta[k] ?? 0) + Number(r.valor_liquido || 0);
      }
      return {
        chave,
        rotulo,
        atrasado,
        fimDeSemana,
        mes: null,
        porConta,
        total: somaLiquido(linhas),
        acumulado: 0,
        linhas,
      };
    };

    const out: LinhaGrade[] = [];
    if (atrasadas.length > 0) {
      out.push(montar("__atrasado__", "Atrasado — até hoje", atrasadas, true, false));
    }

    const dias = [...porDia.keys()].sort((a, b) => a.localeCompare(b));
    let mesAtual = out.length > 0 ? null : null;
    for (const d of dias) {
      const linha = montar(
        d,
        `${diaSemanaCurto(d)}, ${fmtData(d).slice(0, 5)}`,
        porDia.get(d) ?? [],
        false,
        ehFimDeSemana(d),
      );
      const mes = d.slice(0, 7);
      if (mes !== mesAtual) {
        linha.mes = rotuloMes(d);
        mesAtual = mes;
      }
      out.push(linha);
    }

    let acc = 0;
    for (const l of out) {
      acc += l.total;
      l.acumulado = acc;
    }
    return out;
  }, [visiveis]);

  const totaisColuna = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of colunas) map[c.id] = 0;
    for (const r of visiveis) {
      const k = r.conta_bancaria_id ?? SEM_CONTA;
      map[k] = (map[k] ?? 0) + Number(r.valor_liquido || 0);
    }
    return map;
  }, [visiveis, colunas]);

  const totalVisao = useMemo(() => somaLiquido(visiveis), [visiveis]);

  const atrasadas = useMemo(() => visiveis.filter((r) => r.eh_atrasado), [visiveis]);
  const em30 = useMemo(() => {
    const lim = somarDias(hoje, 30);
    return visiveis.filter((r) => r.dia_caixa >= hoje && r.dia_caixa <= lim);
  }, [visiveis, hoje]);
  const em90 = useMemo(() => {
    const lim = somarDias(hoje, 90);
    return visiveis.filter((r) => r.dia_caixa >= hoje && r.dia_caixa <= lim);
  }, [visiveis, hoje]);

  const semTaxa = useMemo(() => visiveis.filter((r) => r.taxa_ausente), [visiveis]);

  const foraDaVisao = useMemo(
    () =>
      CAMADAS.filter((c) => !camadas.includes(c.id) && (totalPorCamada[c.id] ?? 0) > 0),
    [camadas, totalPorCamada],
  );

  function toggleCamada(c: Camada) {
    setCamadas((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  const cards = [
    { titulo: "Atrasado", rows: atrasadas, destaque: true },
    { titulo: "Próximos 30 dias", rows: em30, destaque: false },
    { titulo: "Próximos 90 dias", rows: em90, destaque: false },
    { titulo: "Total na visão", rows: visiveis, destaque: false },
  ];

  return (
    <TooltipProvider>
      <PageShell>
        <PageHeader
          titulo="Fluxo de Recebimentos"
          icone={ArrowDownToLine}
          estado="Quanto entra, em que dia, em qual conta. Valor líquido de taxa de adquirente."
        />

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          {CAMADAS.map((c) => {
            const ativo = camadas.includes(c.id);
            return (
              <Tooltip key={c.id}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant={ativo ? "default" : "outline"}
                    onClick={() => toggleCamada(c.id)}
                    className="h-8"
                  >
                    <span>{c.rotulo}</span>
                    <span className={cn("ml-2 text-xs opacity-80", NUM)}>
                      {formatBRL(totalPorCamada[c.id] ?? 0)}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  {c.descricao}
                </TooltipContent>
              </Tooltip>
            );
          })}

          <div className="ml-auto">
            <Select value={instr} onValueChange={setInstr}>
              <SelectTrigger className="h-8 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os instrumentos</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="cartao">Cartão</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Cartões */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => {
            const quebra = quebraPorInstrumento(c.rows);
            return (
              <Card key={c.titulo} className="card-shadow">
                <CardContent className="p-4 space-y-1">
                  <p className="text-xs text-muted-foreground">{c.titulo}</p>
                  <p
                    className={cn(
                      "text-2xl font-normal",
                      NUM,
                      c.destaque && somaLiquido(c.rows) > 0 ? "text-destructive" : "",
                    )}
                  >
                    {formatBRL(somaLiquido(c.rows))}
                  </p>
                  <p className={cn("text-[11px] text-muted-foreground", NUM)}>
                    {quebra.length > 0 ? quebra.join(" · ") : "—"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Pendência de dado */}
        {semTaxa.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>
              {semTaxa.length} título(s) de cartão sem taxa de adquirente prevista —{" "}
              <span className={NUM}>{formatBRL(somaLiquido(semTaxa))}</span> entrando
              bruto.
            </span>
          </div>
        )}

        {/* Grade */}
        {isLoading ? (
          <Card>
            <CardContent className="space-y-2 p-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : grade.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              <p>Nenhum recebível nas camadas selecionadas.</p>
              <p className="mt-1 text-xs">
                Tente ligar outras camadas acima — em registro, promessa ou condicional.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table containerClassName="max-h-[70vh] overflow-auto">
                <TableHeader className="sticky top-0 z-20 bg-card">
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 bg-card">Dia</TableHead>
                    {colunas.map((c) => (
                      <TableHead
                        key={c.id}
                        className="whitespace-nowrap text-right"
                        style={
                          c.cor
                            ? { boxShadow: `inset 0 -2px 0 0 ${c.cor}` }
                            : undefined
                        }
                      >
                        {c.nome}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Acumulado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grade.map((l) => (
                    <>
                      {l.mes && (
                        <TableRow key={`mes-${l.chave}`} className="hover:bg-transparent">
                          <TableCell
                            colSpan={colunas.length + 3}
                            className="bg-muted/40 py-1 text-[11px] uppercase tracking-wide text-muted-foreground"
                          >
                            {l.mes}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow
                        key={l.chave}
                        onClick={() => setDiaAberto(l)}
                        className={cn(
                          "cursor-pointer",
                          l.atrasado && "bg-destructive/5 hover:bg-destructive/10",
                        )}
                      >
                        <TableCell
                          className={cn(
                            "sticky left-0 z-10 whitespace-nowrap bg-card",
                            l.atrasado && "bg-destructive/5 font-medium text-destructive",
                            l.fimDeSemana && "text-muted-foreground",
                          )}
                        >
                          <span className="flex items-center gap-1.5">
                            {l.atrasado && <AlertTriangle className="h-3.5 w-3.5" />}
                            {l.rotulo}
                          </span>
                        </TableCell>
                        {colunas.map((c) => {
                          const v = l.porConta[c.id];
                          return (
                            <TableCell
                              key={c.id}
                              className={cn("text-right", NUM)}
                            >
                              {v ? (
                                formatBRL(v)
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell className={cn("text-right font-medium", NUM)}>
                          {formatBRL(l.total)}
                        </TableCell>
                        <TableCell
                          className={cn("text-right text-muted-foreground", NUM)}
                        >
                          {formatBRL(l.acumulado)}
                        </TableCell>
                      </TableRow>
                    </>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="sticky left-0 z-10">Total</TableCell>
                    {colunas.map((c) => (
                      <TableCell key={c.id} className={cn("text-right", NUM)}>
                        {formatBRL(totaisColuna[c.id] ?? 0)}
                      </TableCell>
                    ))}
                    <TableCell className={cn("text-right font-medium", NUM)}>
                      {formatBRL(totalVisao)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Fora da visão */}
        {foraDaVisao.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Fora da visão atual:{" "}
            {foraDaVisao
              .map(
                (c) =>
                  `${formatBRL(totalPorCamada[c.id] ?? 0)} (${c.rotulo.toLowerCase()})`,
              )
              .join(", ")}
          </p>
        )}

        {/* Detalhe do dia */}
        <Sheet open={!!diaAberto} onOpenChange={(v) => !v && setDiaAberto(null)}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
            {diaAberto && (
              <>
                <SheetHeader>
                  <SheetTitle className="text-base">{diaAberto.rotulo}</SheetTitle>
                  <SheetDescription>
                    {diaAberto.linhas.length} recebível(is) ·{" "}
                    {formatBRL(diaAberto.total)} líquido
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-4 space-y-2">
                  {[...diaAberto.linhas]
                    .sort((a, b) => Number(b.valor_liquido) - Number(a.valor_liquido))
                    .map((r) => (
                      <div
                        key={`${r.origem}-${r.origem_id}`}
                        className="rounded-md border p-3 text-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {r.cliente || "Cliente não informado"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {r.numero_titulo || "sem número"} ·{" "}
                              {ROTULO_INSTRUMENTO[r.instrumento]} · vence{" "}
                              {fmtData(r.data_vencimento_atual)}
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {ROTULO_CAMADA[r.qualidade]}
                          </Badge>
                        </div>
                        <div
                          className={cn(
                            "mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground",
                            NUM,
                          )}
                        >
                          <div>
                            <p className="text-[10px] uppercase">Bruto</p>
                            <p>{formatBRL(r.valor_bruto)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase">Taxa prevista</p>
                            <p className="flex items-center gap-1">
                              {formatBRL(r.taxa_prevista)}
                              {r.taxa_ausente && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="h-3 w-3 text-warning" />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs text-xs">
                                    Taxa de adquirente não prevista — o valor está
                                    entrando bruto
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase">Líquido</p>
                            <p className="font-medium text-foreground">
                              {formatBRL(r.valor_liquido)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </PageShell>
    </TooltipProvider>
  );
}
