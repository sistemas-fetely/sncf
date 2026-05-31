import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useSalvarRegraCadencia } from "@/hooks/credito/useSalvarRegraCadencia";
import type { RegraCadencia } from "@/types/credito";

const PERFIS = [
  { value: "novo_entrada", label: "Novo (entrada)" },
  { value: "novo_qualificado", label: "Novo qualificado" },
  { value: "recorrente_bom_pagador", label: "Recorrente bom pagador" },
  { value: "premium", label: "Premium" },
  { value: "bandeira_vermelha", label: "Bandeira vermelha" },
];

const schema = z
  .object({
    nome: z.string().min(1, "Nome obrigatório").max(120),
    descricao: z.string().max(500).optional(),
    ordem: z.coerce.number().int().min(1, "Ordem ≥ 1"),
    ativa: z.boolean(),
    perfil_in: z.array(z.string()),
    valor_max: z
      .union([z.coerce.number().positive(), z.literal("").transform(() => undefined)])
      .optional(),
    sem_bandeira: z.boolean(),
    titulos_pagos_no_prazo_min: z
      .union([z.coerce.number().int().min(0), z.literal("").transform(() => undefined)])
      .optional(),
    parecer_template: z.string().max(2000).optional(),
  })
  .refine(
    (v) =>
      (v.perfil_in && v.perfil_in.length > 0) ||
      v.valor_max !== undefined ||
      v.sem_bandeira === true ||
      v.titulos_pagos_no_prazo_min !== undefined,
    { message: "Defina pelo menos 1 critério", path: ["perfil_in"] },
  );

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regra?: RegraCadencia | null;
}

export function RegraCadenciaDialog({ open, onOpenChange, regra }: Props) {
  const salvar = useSalvarRegraCadencia();
  const [perfis, setPerfis] = useState<string[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: "",
      descricao: "",
      ordem: 100,
      ativa: true,
      perfil_in: [],
      valor_max: undefined,
      sem_bandeira: false,
      titulos_pagos_no_prazo_min: undefined,
      parecer_template: "",
    },
  });

  useEffect(() => {
    if (open) {
      const c = regra?.criterio ?? {};
      const initialPerfis = c.perfil_in ?? [];
      setPerfis(initialPerfis);
      form.reset({
        nome: regra?.nome ?? "",
        descricao: regra?.descricao ?? "",
        ordem: regra?.ordem ?? 100,
        ativa: regra?.ativa ?? true,
        perfil_in: initialPerfis,
        valor_max: c.valor_max,
        sem_bandeira: c.sem_bandeira ?? false,
        titulos_pagos_no_prazo_min: c.titulos_pagos_no_prazo_min,
        parecer_template: regra?.parecer_template ?? "",
      });
    }
  }, [open, regra, form]);

  const togglePerfil = (v: string) => {
    const next = perfis.includes(v) ? perfis.filter((p) => p !== v) : [...perfis, v];
    setPerfis(next);
    form.setValue("perfil_in", next, { shouldValidate: true });
  };

  const onSubmit = (values: FormValues) => {
    const criterio: Record<string, unknown> = {};
    if (values.perfil_in.length > 0) criterio.perfil_in = values.perfil_in;
    if (values.valor_max !== undefined) criterio.valor_max = values.valor_max;
    if (values.sem_bandeira) criterio.sem_bandeira = true;
    if (values.titulos_pagos_no_prazo_min !== undefined)
      criterio.titulos_pagos_no_prazo_min = values.titulos_pagos_no_prazo_min;

    salvar.mutate(
      {
        id: regra?.id,
        dados: {
          nome: values.nome,
          descricao: values.descricao || undefined,
          ordem: values.ordem,
          ativa: values.ativa,
          criterio: criterio as never,
          parecer_template: values.parecer_template || undefined,
        },
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{regra ? "Editar regra" : "Nova regra de cadência"}</DialogTitle>
          <DialogDescription>
            Regras ativas são avaliadas em ordem crescente. A primeira que casar pré-aprova a análise.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_auto] gap-4 items-end">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Recorrente até R$ 10k" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ordem"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ordem</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ativa"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel>Ativa</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Para que serve essa regra" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Critérios</h3>

              <FormField
                control={form.control}
                name="perfil_in"
                render={() => (
                  <FormItem>
                    <FormLabel>Perfis aceitos</FormLabel>
                    <div className="flex flex-wrap gap-2">
                      {PERFIS.map((p) => {
                        const active = perfis.includes(p.value);
                        return (
                          <Badge
                            key={p.value}
                            variant={active ? "default" : "outline"}
                            className="cursor-pointer select-none"
                            onClick={() => togglePerfil(p.value)}
                          >
                            {p.label}
                          </Badge>
                        );
                      })}
                    </div>
                    <FormDescription>Vazio = qualquer perfil</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="valor_max"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor máximo (R$)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="Ex: 10000"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="titulos_pagos_no_prazo_min"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mín. títulos pagos no prazo</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          placeholder="Ex: 3"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="sem_bandeira"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Exigir sem bandeira vermelha</FormLabel>
                      <FormDescription>Só pré-aprova clientes sem bandeira ativa</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <Separator />
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Defaults da decisão</h3>
              <FormField
                control={form.control}
                name="parecer_template"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parecer template</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={4}
                        placeholder="Ex: Pré-aprovado por histórico recorrente sem ocorrências..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvar.isPending}>
                {salvar.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
