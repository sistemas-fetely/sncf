import { Controller, useFieldArray, useForm } from "react-hook-form";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Loader2, PackageCheck } from "lucide-react";

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
      return { sku: (partes[0] ?? "").trim(), qtdTexto: (partes[partes.length > 1 ? 1 : 0] ?? "").trim() };
    })
    .filter((p) => p.sku.length > 0);
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

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...VAZIO },
  });
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: "itens" });

  const [modo, setModo] = useState<"item" | "colar">("item");
  const [textoColado, setTextoColado] = useState("");
  const [textoProcessado, setTextoProcessado] = useState<string | null>(null);
  const [previa, setPrevia] = useState<LinhaColada[] | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);

  const limparColagem = () => {
    setTextoColado("");
    setTextoProcessado(null);
    setPrevia(null);
    setErroPrevia(null);
  };

  const trocarModo = (novo: string) => {
    const m = novo as "item" | "colar";
    if (m === modo) return;
    setModo(m);
    limparColagem();
    replace(m === "item" ? [{ sku: "", nome: "", quantidade: 1 }] : []);
    form.clearErrors("itens");
  };

  const processarColagem = async () => {
    setErroPrevia(null);
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
      const skus = Array.from(new Set(linhas.map((l) => l.sku)));
      const { data, error } = await supabase
        .from("sncf_produtos")
        .select("sku, nome_completo, preco_custo")
        .in("sku", skus);
      if (error) throw error;
      const mapa = new Map((data ?? []).map((p) => [p.sku as string, p as ProdutoCatalogo]));
      const resultado: LinhaColada[] = linhas.map((l) => {
        const q = Number(l.qtdTexto.replace(/\./g, "").replace(",", "."));
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

  const centrosQ = useCentrosDestino();

  const listaQ = useQuery({
    queryKey: ["transferencias-internas"],
    queryFn: async (): Promise<TransferenciaRow[]> => {
      const { data, error } = await supabase
        .from("v_transferencias_internas")
        .select(
          "id, id_externo, estagio, destino_interno, observacao_pedido, data_pedido, valor_bruto, qtd_itens, qtd_total_pecas"
        )
        .order("data_pedido", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TransferenciaRow[];
    },
  });

  const criar = useMutation({
    mutationFn: async (valores: FormValues) => {
      const { data, error } = await supabase.rpc("criar_pedido_transferencia", {
        p_itens: valores.itens.map((i) => ({ sku: i.sku.trim(), quantidade: i.quantidade })),
        p_destino_codigo: valores.destino,
        p_observacao: valores.observacao.trim() ? valores.observacao.trim() : null,
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
      toast.success(`${res.id_externo} criado — pedido entrou em Pré-Separação.`);
      form.reset({ ...VAZIO, itens: modo === "item" ? VAZIO.itens : [] });
      limparColagem();
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
                  </TabsList>
                </Tabs>
              </div>

              {modo === "item" ? (
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
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
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
                          <TableRow>
                            <TableCell colSpan={4} className="text-right text-sm font-medium">
                              Total
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium">
                              {formatBRL(totalPrevia)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={criar.isPending || colagemPendente}>
                {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar transferência
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

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
                  <TableHead>Destino</TableHead>
                  <TableHead>Estágio</TableHead>
                  <TableHead className="text-right">Qtd. itens</TableHead>
                  <TableHead className="text-right">Qtd. peças</TableHead>
                  <TableHead className="text-right">Valor (a custo)</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(listaQ.data ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium tabular-nums">{t.id_externo ?? "—"}</TableCell>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
