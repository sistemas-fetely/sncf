import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { usePermissoesTela } from "@/hooks/usePermissoesTela";
import { ListaLotesRetorno } from "@/components/regularizacao/ListaLotesRetorno";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { EstagioBadge } from "@/components/pedidos/BadgesPedido";
import { ESTAGIO_LABELS, type EstagioPedido } from "@/types/pedido";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { parseDataPura } from "@/lib/data";
import { Loader2, PackageCheck } from "lucide-react";
import { TransferenciasSemBaixaPainel } from "@/components/estoque/TransferenciasSemBaixaPainel";

interface CentroDestino {
  codigo: string;
  rotulo_curto: string | null;
  nome: string;
}

const schema = z.object({
  destino: z.string().trim().min(1, "Informe o destino da transferência"),
  observacao: z.string().trim(),
  itens: z
    .array(
      z.object({
        sku: z.string().trim().min(1, "Selecione um produto do catálogo"),
        nome: z.string().optional(),
        quantidade: z.coerce.number().int().positive("Quantidade deve ser maior que zero"),
      })
    )
    .min(1, "Adicione ao menos 1 item"),
});

type FormValues = z.infer<typeof schema>;

const VAZIO: FormValues = { destino: "", observacao: "", itens: [{ sku: "", nome: "", quantidade: 1 }] };

interface ProdutoCatalogo {
  sku: string;
  nome_completo: string | null;
  preco_custo: number | null;
}

interface LinhaColada {
  sku: string;
  quantidade: number;
  qtdValida: boolean;
  produto: ProdutoCatalogo | null;
}

/** Combobox de SKU: só aceita SKU vindo de uma seleção real do catálogo. */
function SkuCombobox({
  value,
  nome,
  onSelect,
  invalido,
  ariaLabel,
}: {
  value: string;
  nome?: string;
  onSelect: (p: ProdutoCatalogo) => void;
  invalido?: boolean;
  ariaLabel: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(termo.trim()), 300);
    return () => clearTimeout(t);
  }, [termo]);

  const buscaQ = useQuery({
    queryKey: ["transferencia-busca-sku", debounced],
    enabled: aberto && debounced.length >= 2,
    queryFn: async (): Promise<ProdutoCatalogo[]> => {
      const t = debounced.replace(/[,()%*]/g, " ").trim();
      const { data, error } = await supabase
        .from("sncf_produtos")
        .select("sku, nome_completo, preco_custo")
        .or(`sku.ilike.%${t}%,nome_completo.ilike.%${t}%`)
        .order("sku")
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ProdutoCatalogo[];
    },
  });

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={aberto}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            invalido && "border-destructive"
          )}
        >
          <span className="truncate">{value || "Buscar SKU ou nome…"}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Digite SKU ou nome…" value={termo} onValueChange={setTermo} />
          <CommandList>
            {debounced.length < 2 ? (
              <CommandEmpty>Digite ao menos 2 caracteres.</CommandEmpty>
            ) : buscaQ.isFetching ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : buscaQ.isError ? (
              <p className="p-3 text-sm text-destructive">
                Falha na busca: {(buscaQ.error as Error).message}
              </p>
            ) : (
              <>
                <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                <CommandGroup>
                  {(buscaQ.data ?? []).map((p) => (
                    <CommandItem
                      key={p.sku}
                      value={p.sku}
                      onSelect={() => {
                        onSelect(p);
                        setAberto(false);
                        setTermo("");
                      }}
                    >
                      <Check className={cn("h-4 w-4", value === p.sku ? "opacity-100" : "opacity-0")} />
                      <span className="font-medium tabular-nums">{p.sku}</span>
                      <span className="truncate text-muted-foreground">{p.nome_completo ?? ""}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Quebra o texto colado do Excel: TAB; senão vírgula/;; senão múltiplos espaços. */
function parsearColagem(texto: string): { sku: string; qtdTexto: string }[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => {
      let partes = l.split("\t");
      if (partes.length < 2) partes = l.split(/[,;]/);
      if (partes.length < 2) partes = l.split(/\s{2,}|\s+/);
      return { sku: (partes[0] ?? "").trim(), qtdTexto: (partes.length > 1 ? (partes[1] ?? "") : "").trim() };
    })
    .filter((p) => p.sku.length > 0);
}

interface LinhaSugestao {
  sku: string;
  nome_comercial: string | null;
  situacao: string;
  v90: number | null;
  demanda_dia: number | null;
  disp_destino: number | null;
  em_transito: number | null;
  disp_origem: number | null;
  minimo: number | null;
  oportunidade: number | null;
  teto: number | null;
  multiplo: number | null;
  cauda: boolean | null;
  qtd_sugerida: number | null;
  proxima_carga: string | null;
  origem: string | null;
}

const SITUACAO_LABEL: Record<string, string> = {
  dispara: "Dispara",
  carona: "Carona",
  ok: "OK",
  sem_origem: "Sem saldo na origem",
};

function situacaoBadge(s: string) {
  if (s === "dispara") return <Badge variant="destructive">Dispara</Badge>;
  if (s === "carona") return <Badge variant="default">Carona</Badge>;
  if (s === "sem_origem") return <Badge variant="outline">Sem saldo na origem</Badge>;
  return <Badge variant="secondary">{SITUACAO_LABEL[s] ?? s}</Badge>;
}

/** dd/MM + dia da semana curto, ex.: "03/10 (sex)". */
function fmtCarga(v: string | null): string {
  const d = parseDataPura(v);
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const sem = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return `${dd}/${mm} (${sem})`;
}

/** Destinos válidos para transferência interna: armazéns e showrooms ativos. */
function useCentrosDestino() {
  return useQuery({
    queryKey: ["centros-destino-transferencia"],
    queryFn: async (): Promise<CentroDestino[]> => {
      const { data, error } = await supabase
        .from("centro_distribuicao")
        .select("codigo, rotulo_curto, nome")
        .eq("ativo", true)
        .in("tipo", ["armazem", "showroom"])
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as CentroDestino[];
    },
  });
}

interface TransferenciaRow {
  id: string;
  id_externo: string | null;
  estagio: string | null;
  destino_interno: string | null;
  observacao_pedido: string | null;
  data_pedido: string | null;
  valor_bruto: number | null;
  qtd_itens: number | null;
  qtd_total_pecas: number | null;
  tipo_transferencia: string | null;
  regularizacao_lote_id: string | null;
  regularizacao_lote_codigo: string | null;
  origem_codigo: string | null;
  destino_codigo: string | null;
  orfao: boolean | null;
  canal: string | null;
}

/** Tipo da transferência: física, regularização (sem movimento físico) ou com retorno de remessa (lote). */
function SeloTipo({ t }: { t: TransferenciaRow }) {
  if (t.tipo_transferencia === "com_retorno") {
    const rotulo = `Com retorno${t.regularizacao_lote_codigo ? ` · ${t.regularizacao_lote_codigo}` : ""}`;
    return t.regularizacao_lote_id ? (
      <Link to={`/pedidos/transferencias/retorno/${t.regularizacao_lote_id}`} onClick={(e) => e.stopPropagation()} className="inline-flex">
        <Badge variant="outline" className="whitespace-nowrap text-primary">{rotulo}</Badge>
      </Link>
    ) : <Badge variant="outline" className="whitespace-nowrap">{rotulo}</Badge>;
  }
  if (t.tipo_transferencia === "regularizacao") return <Badge variant="secondary" className="whitespace-nowrap" title="Sem movimento físico">Regularização</Badge>;
  if (t.tipo_transferencia === "fisica") return <Badge variant="outline" className="whitespace-nowrap">Física</Badge>;
  return <span className="text-sm text-muted-foreground">—</span>;
}

/** Estágio da transferência: usa o mesmo selo da Casa dos Pedidos quando é
 *  um estágio canônico; fora da esteira, mostra o valor cru sem fingir cor. */
function SeloEstagio({ estagio }: { estagio: string | null }) {
  if (!estagio) return <span className="text-sm text-muted-foreground">—</span>;
  if (estagio in ESTAGIO_LABELS) {
    return <EstagioBadge estagio={estagio as EstagioPedido} />;
  }
  return <Badge variant="outline">{estagio}</Badge>;
}

export default function TransferenciasInternas() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const permRetorno = usePermissoesTela("tela.regularizacao_estoque");
  const [abaUrl, setAba] = useAbaUrl("transferencias");
  // Aba válida: "retorno" só com permissão; qualquer outra → "transferencias".
  const aba = abaUrl === "retorno" && permRetorno.podeVer ? "retorno" : "transferencias";
  // Compatibilidade: link salvo com ?aba=receber vai para a tela própria.
  useEffect(() => {
    if (abaUrl === "receber") navigate("/vendas/produto/estoque/recebimento-centro", { replace: true });
  }, [abaUrl, navigate]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...VAZIO },
  });
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: "itens" });

  const [modo, setModo] = useState<"item" | "colar" | "sugestao">("item");
  const [textoColado, setTextoColado] = useState("");
  const [textoProcessado, setTextoProcessado] = useState<string | null>(null);
  const [previa, setPrevia] = useState<LinhaColada[] | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [ignoradas, setIgnoradas] = useState(0);
  // Regularização: mercadoria já está fisicamente no destino — pedido nasce em
  // Pré-faturamento (natureza transferencia_regularizacao), sem passar pelo XPM.
  const [regularizacao, setRegularizacao] = useState(false);

  // Modo "Sugestão do motor": seleção por SKU (marcado + quantidade editável).
  const [sugSelecao, setSugSelecao] = useState<Record<string, { marcado: boolean; qtd: number }>>({});
  const [sugMostrarTodos, setSugMostrarTodos] = useState(false);

  const limparColagem = () => {
    setTextoColado("");
    setTextoProcessado(null);
    setPrevia(null);
    setErroPrevia(null);
    setIgnoradas(0);
  };

  const limparSugestao = () => {
    setSugSelecao({});
    setSugMostrarTodos(false);
  };

  const trocarModo = (novo: string) => {
    const m = novo as "item" | "colar" | "sugestao";
    if (m === modo) return;
    setModo(m);
    limparColagem();
    limparSugestao();
    replace(m === "item" ? [{ sku: "", nome: "", quantidade: 1 }] : []);
    form.clearErrors("itens");
  };

  const destinoAtual = form.watch("destino");
  useEffect(() => {
    limparSugestao();
  }, [destinoAtual]);

  const sugestaoQ = useQuery({
    queryKey: ["reposicao-sugerida", destinoAtual],
    enabled: modo === "sugestao" && !!destinoAtual,
    queryFn: async (): Promise<LinhaSugestao[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_reposicao_sugerida")
        .select(
          "sku, nome_comercial, situacao, v90, demanda_dia, disp_destino, em_transito, disp_origem, minimo, oportunidade, teto, multiplo, cauda, qtd_sugerida, proxima_carga, origem"
        )
        .eq("centro", destinoAtual)
        .order("situacao")
        .order("qtd_sugerida", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LinhaSugestao[];
    },
  });

  // Inicializa a seleção quando chegam linhas novas (marcadas as com sugestão > 0).
  const linhasSug = sugestaoQ.data ?? [];
  const chaveSug = linhasSug.map((l) => l.sku).join("|");
  useEffect(() => {
    if (!sugestaoQ.data) return;
    const ini: Record<string, { marcado: boolean; qtd: number }> = {};
    for (const l of sugestaoQ.data) {
      const q = l.qtd_sugerida ?? 0;
      ini[l.sku] = { marcado: q > 0, qtd: q };
    }
    setSugSelecao(ini);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveSug]);

  // FAIL-LOUD: erro da query vira toast (uma vez por erro).
  useEffect(() => {
    if (sugestaoQ.isError) toast.error(formatError(sugestaoQ.error));
  }, [sugestaoQ.isError, sugestaoQ.error]);

  const linhasVisiveis = sugMostrarTodos ? linhasSug : linhasSug.filter((l) => (l.qtd_sugerida ?? 0) > 0);
  const marcadas = linhasSug.filter((l) => sugSelecao[l.sku]?.marcado && (sugSelecao[l.sku]?.qtd ?? 0) > 0);
  const totalPecasSug = linhasSug.reduce((acc, l) => acc + (l.qtd_sugerida ?? 0), 0);
  const resumo = {
    dispara: linhasSug.filter((l) => l.situacao === "dispara").length,
    carona: linhasSug.filter((l) => l.situacao === "carona").length,
    semOrigem: linhasSug.filter((l) => l.situacao === "sem_origem").length,
    pecas: totalPecasSug,
    proximaCarga: linhasSug.find((l) => l.proxima_carga)?.proxima_carga ?? null,
    origem: linhasSug.find((l) => l.origem)?.origem ?? null,
  };

  const usarSugestao = () => {
    if (marcadas.length === 0) return;
    replace(
      marcadas.map((l) => ({
        sku: l.sku,
        nome: l.nome_comercial ?? "",
        quantidade: sugSelecao[l.sku].qtd,
      }))
    );
    form.clearErrors("itens");
    if (!form.getValues("observacao").trim()) {
      form.setValue(
        "observacao",
        `Reposição sugerida pelo motor — carga de ${fmtCarga(resumo.proximaCarga)}`
      );
    }
  };

  const processarColagem = async () => {
    setErroPrevia(null);
    setIgnoradas(0);
    const linhas = parsearColagem(textoColado);
    if (linhas.length === 0) {
      setPrevia(null);
      setTextoProcessado(textoColado);
      replace([]);
      setErroPrevia("Nada para processar: cole ao menos uma linha com SKU e quantidade.");
      return;
    }
    setProcessando(true);
    try {
      // Quantidade vazia ou 0 → linha ignorada (não é erro). Negativa ou não inteira segue erro.
      const comQtd = linhas.map((l) => ({
        ...l,
        q: l.qtdTexto === "" ? null : Number(l.qtdTexto.replace(/\./g, "").replace(",", ".")),
      }));
      const ignoradasLista = comQtd.filter((l) => l.q === null || l.q === 0);
      const consideradas = comQtd.filter((l) => l.q !== null && l.q !== 0);
      setIgnoradas(ignoradasLista.length);
      if (consideradas.length === 0) {
        setPrevia(null);
        setTextoProcessado(textoColado);
        replace([]);
        setErroPrevia("Nada para processar: cole ao menos uma linha com SKU e quantidade.");
        return;
      }
      const skus = Array.from(new Set(consideradas.map((l) => l.sku)));
      const { data, error } = await supabase
        .from("sncf_produtos")
        .select("sku, nome_completo, preco_custo")
        .in("sku", skus);
      if (error) throw error;
      const mapa = new Map((data ?? []).map((p) => [p.sku as string, p as ProdutoCatalogo]));
      const resultado: LinhaColada[] = consideradas.map((l) => {
        const q = l.q as number;
        return {
          sku: l.sku,
          quantidade: q,
          qtdValida: Number.isInteger(q) && q > 0,
          produto: mapa.get(l.sku) ?? null,
        };
      });
      setPrevia(resultado);
      setTextoProcessado(textoColado);
      const tudoOk = resultado.every((r) => r.produto && r.qtdValida);
      replace(
        tudoOk
          ? resultado.map((r) => ({ sku: r.sku, nome: r.produto?.nome_completo ?? "", quantidade: r.quantidade }))
          : []
      );
      form.clearErrors("itens");
    } catch (e) {
      setPrevia(null);
      replace([]);
      setErroPrevia((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setProcessando(false);
    }
  };

  const previaComErro = !!previa?.some((r) => !r.produto || !r.qtdValida);
  const colagemPendente = modo === "colar" && (!previa || textoProcessado !== textoColado || previaComErro);
  const totalPrevia = (previa ?? []).reduce(
    (acc, r) => acc + (r.produto && r.qtdValida ? (r.produto.preco_custo ?? 0) * r.quantidade : 0),
    0
  );

  // Resumo da barra fixa: calculado dos itens atuais do formulário (só os com SKU).
  const itensAtuais = form.watch("itens") ?? [];
  const itensComSku = itensAtuais.filter((i) => i.sku?.trim());
  const totalPecasForm = itensComSku.reduce((acc, i) => acc + (Number(i.quantidade) || 0), 0);
  const previaValida = modo === "colar" && !!previa && !previaComErro && textoProcessado === textoColado;

  const centrosQ = useCentrosDestino();

  const listaQ = useQuery({
    queryKey: ["transferencias-internas"],
    queryFn: async (): Promise<TransferenciaRow[]> => {
      const { data, error } = await supabase
        .from("v_transferencias_internas")
        .select(
          "id, id_externo, estagio, destino_interno, observacao_pedido, data_pedido, valor_bruto, qtd_itens, qtd_total_pecas, tipo_transferencia, regularizacao_lote_id, regularizacao_lote_codigo, origem_codigo, destino_codigo, orfao, canal"
        )
        .order("data_pedido", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TransferenciaRow[];
    },
  });

  const idsLista = (listaQ.data ?? []).map((t) => t.id);
  const recebQ = useQuery({
    queryKey: ["trs-recebimento", idsLista.join("|")],
    enabled: idsLista.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("trs_recebimento")
        .select("pedido_id, data_recebimento, divergencias")
        .in("pedido_id", idsLista);
      if (error) throw error;
      return (data ?? []) as { pedido_id: string; data_recebimento: string; divergencias: unknown[] | null }[];
    },
  });
  useEffect(() => {
    if (recebQ.isError) toast.error(formatError(recebQ.error));
  }, [recebQ.isError, recebQ.error]);
  const recebMap = new Map((recebQ.data ?? []).map((r) => [r.pedido_id, r]));

  const criar = useMutation({
    mutationFn: async (valores: FormValues) => {
      const { data, error } = await supabase.rpc("criar_pedido_transferencia", {
        p_itens: valores.itens.map((i) => ({ sku: i.sku.trim(), quantidade: i.quantidade })),
        p_destino_codigo: valores.destino,
        p_observacao: valores.observacao.trim() ? valores.observacao.trim() : null,
        p_regularizacao: regularizacao,
      });
      if (error) throw error;
      return data as { ok: boolean; id_externo: string; valor_bruto: number };
    },
    onSuccess: (res) => {
      // FAIL-LOUD: a RPC devolve ok=false sem exceção → trata como erro.
      if (!res?.ok) {
        toast.error("A transferência não foi criada. Tente novamente.");
        return;
      }
      toast.success(
        regularizacao
          ? `${res.id_externo} criado — regularização, em Pré-faturamento.`
          : `${res.id_externo} criado — pedido entrou em Pré-Separação.`
      );
      form.reset({ ...VAZIO, itens: modo === "item" ? VAZIO.itens : [] });
      setRegularizacao(false);
      limparColagem();
      limparSugestao();
      qc.invalidateQueries({ queryKey: ["transferencias-internas"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const onSubmit = form.handleSubmit((valores) => criar.mutate(valores));

  return (
    <PageShell>
      <PageHeader
        titulo="Transferências Internas"
        breadcrumb={[{ label: "Operação" }, { label: "Transferências Internas" }]}
        icone={PackageCheck}
        estado="Movimentação entre pontos Fetely — sem cobrança, precificada a custo"
      />

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <TabsList>
          <TabsTrigger value="transferencias">Transferências</TabsTrigger>
          {permRetorno.podeVer && (
            <TabsTrigger value="retorno">Com retorno de remessa</TabsTrigger>
          )}
        </TabsList>
        {permRetorno.podeVer && (
          <TabsContent value="retorno">
            <ListaLotesRetorno />
          </TabsContent>
        )}
        <TabsContent value="transferencias" className="space-y-6">

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova transferência</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="destino" className="text-sm font-medium">
                  Destino
                </label>
                <Controller
                  control={form.control}
                  name="destino"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="destino"
                        className={form.formState.errors.destino ? "border-destructive" : ""}
                      >
                        <SelectValue
                          placeholder={
                            centrosQ.isLoading
                              ? "Carregando destinos…"
                              : "Selecione o destino"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(centrosQ.data ?? []).map((c) => (
                          <SelectItem key={c.codigo} value={c.codigo}>
                            {c.rotulo_curto ?? c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.destino && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.destino.message}
                  </p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={regularizacao}
                    onCheckedChange={setRegularizacao}
                    id="regularizacao"
                    aria-label="Regularização (sem movimento físico)"
                  />
                  <label htmlFor="regularizacao" className="text-sm font-medium">
                    Regularização (sem movimento físico)
                  </label>
                </div>
                {regularizacao && (
                  <p className="text-xs text-warning">
                    A mercadoria já está no destino. O pedido não vai ao XPM e nasce em
                    Pré-faturamento, pronto para a NF 6152. Não use para mercadoria que precisa ser
                    separada.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="observacao" className="text-sm font-medium">
                  Observação <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <Textarea
                  id="observacao"
                  placeholder="Ex.: reposição para campanha de outono"
                  rows={2}
                  {...form.register("observacao")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Itens</p>
                <Tabs value={modo} onValueChange={trocarModo}>
                  <TabsList>
                    <TabsTrigger value="item">Item a item</TabsTrigger>
                    <TabsTrigger value="colar">Colar da planilha</TabsTrigger>
                    <TabsTrigger value="sugestao">Sugestão do motor</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {modo === "sugestao" ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Sugestão calculada pela venda dos últimos 90 dias na região do destino (peso
                    maior nos 30 dias mais recentes). Dispara = abaixo do mínimo; Carona = cabe na
                    mesma carga. Você revisa e ajusta antes de criar.
                  </p>
                  {!destinoAtual ? (
                    <p className="text-sm text-muted-foreground">
                      Escolha o destino para ver a sugestão de reposição.
                    </p>
                  ) : sugestaoQ.isLoading ? (
                    <div className="flex justify-center p-6">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : sugestaoQ.isError ? (
                    <p className="text-sm text-destructive">
                      Falha ao carregar a sugestão: {formatError(sugestaoQ.error)}
                    </p>
                  ) : linhasSug.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma sugestão para este destino (sem parâmetros de reposição ou sem demanda
                      nos últimos 90 dias).
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                        {[
                          { rotulo: "SKUs a disparar", valor: resumo.dispara },
                          { rotulo: "SKUs de carona", valor: resumo.carona },
                          { rotulo: "Sem saldo na origem", valor: resumo.semOrigem },
                          { rotulo: "Peças sugeridas", valor: resumo.pecas },
                          { rotulo: "Próxima carga", valor: fmtCarga(resumo.proximaCarga) },
                          { rotulo: "Origem", valor: resumo.origem ?? "—" },
                        ].map((c) => (
                          <div key={c.rotulo} className="rounded-md border p-2">
                            <p className="text-[11px] text-muted-foreground">{c.rotulo}</p>
                            <p className="text-sm font-medium tabular-nums">{c.valor}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={sugMostrarTodos}
                            onCheckedChange={setSugMostrarTodos}
                            aria-label="Mostrar também os que estão ok"
                          />
                          Mostrar também os que estão ok
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          onClick={usarSugestao}
                          disabled={marcadas.length === 0}
                        >
                          Usar na transferência ({marcadas.length}{" "}
                          {marcadas.length === 1 ? "item" : "itens"} ·{" "}
                          {marcadas.reduce((acc, l) => acc + (sugSelecao[l.sku]?.qtd ?? 0), 0)} peças)
                        </Button>
                      </div>
                      <div className="max-h-[420px] overflow-auto rounded-md border">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-background">
                            <TableRow>
                              <TableHead className="w-8" />
                              <TableHead>SKU</TableHead>
                              <TableHead>Nome</TableHead>
                              <TableHead>Situação</TableHead>
                              <TableHead className="text-right">Vendas 90d</TableHead>
                              <TableHead className="text-right">Demanda/dia</TableHead>
                              <TableHead className="text-right">No destino</TableHead>
                              <TableHead className="text-right">Em trânsito</TableHead>
                              <TableHead className="text-right">Disp. origem</TableHead>
                              <TableHead className="text-right">Mínimo</TableHead>
                              <TableHead className="text-right">Teto</TableHead>
                              <TableHead className="w-24 text-right">Quantidade</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {linhasVisiveis.map((l) => {
                              const sel = sugSelecao[l.sku] ?? { marcado: false, qtd: 0 };
                              const excedeOrigem =
                                l.disp_origem != null && sel.qtd > l.disp_origem;
                              const excedeTeto = l.teto != null && sel.qtd > l.teto;
                              return (
                                <TableRow key={l.sku}>
                                  <TableCell>
                                    <Checkbox
                                      checked={sel.marcado}
                                      onCheckedChange={(v) =>
                                        setSugSelecao((s) => ({
                                          ...s,
                                          [l.sku]: { ...sel, marcado: v === true },
                                        }))
                                      }
                                      aria-label={`Selecionar ${l.sku}`}
                                    />
                                  </TableCell>
                                  <TableCell className="font-mono text-xs tabular-nums">
                                    {l.sku}
                                    {l.cauda && (
                                      <Badge variant="outline" className="ml-1 text-[10px]">
                                        cauda
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="max-w-[220px] truncate text-sm">
                                    {l.nome_comercial ?? "—"}
                                  </TableCell>
                                  <TableCell>{situacaoBadge(l.situacao)}</TableCell>
                                  <TableCell className="text-right tabular-nums text-sm">
                                    {l.v90 ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-sm">
                                    {l.demanda_dia != null ? l.demanda_dia.toFixed(2) : "—"}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-sm">
                                    {l.disp_destino ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-sm">
                                    {l.em_transito ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-sm">
                                    {l.disp_origem ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-sm">
                                    {l.minimo ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-sm">
                                    {l.teto ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Input
                                      type="number"
                                      min={0}
                                      value={sel.qtd}
                                      onChange={(e) =>
                                        setSugSelecao((s) => ({
                                          ...s,
                                          [l.sku]: {
                                            ...sel,
                                            qtd: Math.max(0, Number(e.target.value) || 0),
                                          },
                                        }))
                                      }
                                      className={cn(
                                        "h-8 w-20 text-right tabular-nums",
                                        (excedeOrigem || excedeTeto) && "border-warning"
                                      )}
                                      aria-label={`Quantidade de ${l.sku}`}
                                    />
                                    {excedeOrigem && (
                                      <p className="mt-0.5 text-[10px] text-warning">
                                        Acima do disponível na origem
                                      </p>
                                    )}
                                    {!excedeOrigem && excedeTeto && (
                                      <p className="mt-0.5 text-[10px] text-warning">
                                        Acima do teto
                                      </p>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </div>
              ) : modo === "item" ? (
                <>
                  <div className="space-y-2">
                    {fields.map((field, index) => {
                      const sku = form.watch(`itens.${index}.sku`);
                      const nome = form.watch(`itens.${index}.nome`);
                      const erroSku = form.formState.errors.itens?.[index]?.sku;
                      return (
                        <div key={field.id} className="flex items-start gap-2">
                          <div className="w-full max-w-xs">
                            <SkuCombobox
                              value={sku}
                              nome={nome}
                              invalido={!!erroSku}
                              ariaLabel={`SKU do item ${index + 1}`}
                              onSelect={(p) => {
                                form.setValue(`itens.${index}.sku`, p.sku, { shouldValidate: true });
                                form.setValue(`itens.${index}.nome`, p.nome_completo ?? "");
                              }}
                            />
                            {erroSku && <p className="mt-1 text-xs text-destructive">{erroSku.message}</p>}
                          </div>
                          <div className="w-28">
                            <Input
                              type="number"
                              min={1}
                              placeholder="Qtd."
                              aria-label={`Quantidade do item ${index + 1}`}
                              {...form.register(`itens.${index}.quantidade`)}
                            />
                            {form.formState.errors.itens?.[index]?.quantidade && (
                              <p className="mt-1 text-xs text-destructive">
                                {form.formState.errors.itens[index]?.quantidade?.message}
                              </p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remover item ${index + 1}`}
                            onClick={() => remove(index)}
                            disabled={fields.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {nome && (
                            <p className="self-center truncate text-xs text-muted-foreground">{nome}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {form.formState.errors.itens?.message && (
                    <p className="text-xs text-destructive">{form.formState.errors.itens.message}</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ sku: "", nome: "", quantidade: 1 })}
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar item
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  <Textarea
                    rows={8}
                    value={textoColado}
                    onChange={(e) => setTextoColado(e.target.value)}
                    placeholder="Cole aqui 2 colunas do Excel: SKU e Quantidade, uma linha por item"
                    className="font-mono text-xs"
                    aria-label="Itens colados da planilha"
                  />
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={processarColagem}
                      disabled={processando || !textoColado.trim()}
                    >
                      {processando && <Loader2 className="h-4 w-4 animate-spin" />}
                      Processar
                    </Button>
                    {ignoradas > 0 && previa && (
                      <p className="text-xs text-muted-foreground">
                        {ignoradas} {ignoradas === 1 ? "linha ignorada" : "linhas ignoradas"} (quantidade 0 ou vazia)
                      </p>
                    )}
                    {previa && textoProcessado !== textoColado && (
                      <p className="text-xs text-warning">Texto alterado — clique em Processar de novo.</p>
                    )}
                    {previaComErro && textoProcessado === textoColado && (
                      <p className="text-xs text-destructive">
                        Corrija as linhas em vermelho e processe de novo.
                      </p>
                    )}
                  </div>
                  {erroPrevia && <p className="text-xs text-destructive">{erroPrevia}</p>}
                  {previa && previa.length > 0 && (
                    <div className="max-h-[420px] overflow-y-auto rounded-md border">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-background">
                          <TableRow>
                            <TableHead>SKU</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead className="text-right">Quantidade</TableHead>
                            <TableHead className="text-right">Custo unitário</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previa.map((r, i) => (
                            <TableRow key={`${r.sku}-${i}`} className={!r.produto || !r.qtdValida ? "bg-destructive/5" : ""}>
                              <TableCell className="font-medium tabular-nums">{r.sku}</TableCell>
                              <TableCell className="text-sm">
                                {r.produto ? (
                                  r.produto.nome_completo ?? "—"
                                ) : (
                                  <Badge variant="destructive">SKU não encontrado</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-sm">
                                {r.qtdValida ? (
                                  r.quantidade
                                ) : (
                                  <span className="text-destructive">Quantidade inválida</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-sm">
                                {r.produto ? formatBRL(r.produto.preco_custo) : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-sm">
                                {r.produto && r.qtdValida
                                  ? formatBRL((r.produto.preco_custo ?? 0) * r.quantidade)
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-20 -mx-6 flex items-center justify-between gap-4 border-t bg-background/95 px-6 py-3 backdrop-blur">
              <div className="text-sm text-muted-foreground">
                {regularizacao && (
                  <Badge className="mr-2" variant="secondary">
                    Regularização
                  </Badge>
                )}
                {!destinoAtual && <span className="mr-2 text-warning">Escolha o destino.</span>}
                <span className="font-medium text-foreground">
                  {itensComSku.length} {itensComSku.length === 1 ? "SKU" : "SKUs"} · {totalPecasForm}{" "}
                  {totalPecasForm === 1 ? "peça" : "peças"}
                </span>
                {previaValida && <span> · Total a custo {formatBRL(totalPrevia)}</span>}
              </div>
              <Button type="submit" disabled={criar.isPending || colagemPendente}>
                {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar transferência
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <TransferenciasSemBaixaPainel onLancado={() => listaQ.refetch()} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transferências</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {listaQ.isLoading ? (
            <div className="flex justify-center p-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : listaQ.isError ? (
            <p className="p-6 text-sm text-destructive">
              Falha ao carregar transferências: {(listaQ.error as Error).message}
            </p>
          ) : (listaQ.data ?? []).length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma transferência interna registrada ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Estágio</TableHead>
                  <TableHead className="text-right">Qtd. itens</TableHead>
                  <TableHead className="text-right">Qtd. peças</TableHead>
                  <TableHead className="text-right">Valor (a custo)</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Recebimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(listaQ.data ?? []).map((t) => {
                  const abrir = () => navigate(`/pedidos/${t.id}`);
                  return (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer hover:bg-muted/50"
                      role="link"
                      tabIndex={0}
                      onClick={abrir}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") abrir();
                      }}
                    >
                      <TableCell className="font-medium tabular-nums">
                        <span
                          className="text-primary underline-offset-2 hover:underline"
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            abrir();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              abrir();
                            }
                          }}
                        >
                          {t.id_externo ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell onKeyDown={(e) => e.stopPropagation()}>
                        <SeloTipo t={t} />
                      </TableCell>
                      <TableCell>{t.destino_interno ?? "—"}</TableCell>
                      <TableCell>
                        <SeloEstagio estagio={t.estagio} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {t.qtd_itens ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {t.qtd_total_pecas ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatBRL(t.valor_bruto)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateBR(t.data_pedido)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        {(() => {
                          const rec = recebMap.get(t.id);
                          if (rec) {
                            const n = Array.isArray(rec.divergencias) ? rec.divergencias.length : 0;
                            return (
                              <div className="flex items-center gap-1.5">
                                <Badge variant="secondary">Recebido em {formatDateBR(rec.data_recebimento)}</Badge>
                                {n > 0 && (
                                  <span className="text-xs font-medium text-destructive">
                                    · {n} {n === 1 ? "diferença" : "diferenças"}
                                  </span>
                                )}
                              </div>
                            );
                          }
                          if (t.estagio === "em_transito" || t.estagio === "em_transporte" || t.estagio === "entregue") {
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate("/vendas/produto/estoque/recebimento-centro");
                                }}
                                className="text-xs text-primary underline-offset-2 hover:underline"
                              >
                                Receber no destino
                              </button>
                            );
                          }
                          return <span className="text-sm text-muted-foreground">—</span>;
                        })()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
