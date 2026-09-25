import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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
        sku: z.string().trim().min(1, "Informe o SKU"),
        quantidade: z.coerce.number().int().positive("Quantidade deve ser maior que zero"),
      })
    )
    .min(1, "Adicione ao menos 1 item"),
});

type FormValues = z.infer<typeof schema>;

const VAZIO: FormValues = { destino: "", observacao: "", itens: [{ sku: "", quantidade: 1 }] };

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
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "itens" });

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
      form.reset({ ...VAZIO });
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
              <p className="text-sm font-medium">Itens</p>
              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-start gap-2">
                    <div className="w-full max-w-xs">
                      <Input
                        placeholder="SKU"
                        aria-label={`SKU do item ${index + 1}`}
                        {...form.register(`itens.${index}.sku`)}
                      />
                      {form.formState.errors.itens?.[index]?.sku && (
                        <p className="mt-1 text-xs text-destructive">
                          {form.formState.errors.itens[index]?.sku?.message}
                        </p>
                      )}
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
                  </div>
                ))}
              </div>
              {form.formState.errors.itens?.message && (
                <p className="text-xs text-destructive">{form.formState.errors.itens.message}</p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ sku: "", quantidade: 1 })}
              >
                <Plus className="h-4 w-4" />
                Adicionar item
              </Button>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={criar.isPending}>
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
