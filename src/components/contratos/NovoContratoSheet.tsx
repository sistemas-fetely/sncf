import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const faseSchema = z.object({
  nome: z.string().min(1, "Nome obrigatório"),
  tipo: z.enum(["unico", "recorrente_com_fim", "recorrente_sem_fim"]),
  valor: z.coerce.number().positive("Valor deve ser positivo"),
  data_inicio: z.string().min(1, "Data obrigatória"),
  data_fim: z.string().optional(),
  dia_vencimento: z.coerce.number().min(1).max(28).default(1),
});

const schema = z.object({
  numero: z.string().min(1, "Número obrigatório"),
  objeto: z.string().min(1, "Objeto obrigatório"),
  parceiro_id: z.string().optional(),
  area: z.enum(["financeiro", "ti", "juridico", "outro"]),
  data_inicio: z.string().min(1, "Data obrigatória"),
  data_fim: z.string().optional(),
  renova_automaticamente: z.boolean().default(false),
  fases: z.array(faseSchema).min(1, "Adicione ao menos uma fase"),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSalvo: () => void;
}

export function NovoContratoSheet({ open, onOpenChange, onSalvo }: Props) {
  const [salvando, setSalvando] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      area: "financeiro",
      renova_automaticamente: false,
      fases: [
        {
          nome: "Mensalidade",
          tipo: "recorrente_sem_fim",
          valor: 0,
          data_inicio: new Date().toISOString().split("T")[0],
          dia_vencimento: 1,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "fases" });

  const { data: parceiros = [] } = useQuery({
    queryKey: ["parceiros-select"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social")
        .order("razao_social");
      return data ?? [];
    },
  });

  async function onSubmit(values: FormData) {
    setSalvando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: contrato, error: errContrato } = await (supabase as any)
        .from("contratos")
        .insert({
          numero: values.numero,
          objeto: values.objeto,
          parceiro_id: values.parceiro_id || null,
          area: values.area,
          data_inicio: values.data_inicio,
          data_fim: values.data_fim || null,
          renova_automaticamente: values.renova_automaticamente,
          status: "ativo",
        })
        .select("id")
        .single();

      if (errContrato) throw errContrato;

      for (let i = 0; i < values.fases.length; i++) {
        const fase = values.fases[i];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: faseData, error: errFase } = await (supabase as any)
          .from("contrato_fases")
          .insert({
            contrato_id: contrato.id,
            nome: fase.nome,
            ordem: i + 1,
            tipo: fase.tipo,
            valor: fase.valor,
            data_inicio: fase.data_inicio,
            data_fim: fase.data_fim || null,
            dia_vencimento: fase.dia_vencimento,
            status: "ativa",
          })
          .select("id")
          .single();

        if (errFase) throw errFase;

        if (fase.tipo === "unico") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).rpc("gerar_parcelas_fase_unica", {
            p_fase_id: faseData.id,
          });
        }
      }

      toast.success("Contrato cadastrado com sucesso!");
      reset();
      onSalvo();
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (e as any)?.message ?? String(e);
      toast.error("Erro ao salvar: " + msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Novo Contrato</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Número *</Label>
              <Input {...register("numero")} placeholder="CTR-2026-001" />
              {errors.numero && (
                <p className="text-xs text-destructive">{errors.numero.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Área *</Label>
              <Select
                defaultValue="financeiro"
                onValueChange={(v) => setValue("area", v as FormData["area"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                  <SelectItem value="ti">TI</SelectItem>
                  <SelectItem value="juridico">Jurídico</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Objeto *</Label>
            <Input {...register("objeto")} placeholder="Descrição do contrato" />
            {errors.objeto && (
              <p className="text-xs text-destructive">{errors.objeto.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Parceiro</Label>
            <Select onValueChange={(v) => setValue("parceiro_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {parceiros.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.razao_social}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Início *</Label>
              <Input type="date" {...register("data_inicio")} />
            </div>
            <div className="space-y-1">
              <Label>Fim (vazio = sem fim)</Label>
              <Input type="date" {...register("data_fim")} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              onCheckedChange={(v) => setValue("renova_automaticamente", v)}
            />
            <Label>Renova automaticamente (alerta 60 dias antes)</Label>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Fases do contrato</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    nome: "",
                    tipo: "recorrente_sem_fim",
                    valor: 0,
                    data_inicio: new Date().toISOString().split("T")[0],
                    dia_vencimento: 1,
                  })
                }
              >
                <Plus className="h-4 w-4 mr-1" /> Adicionar fase
              </Button>
            </div>

            {fields.map((field, idx) => (
              <div key={field.id} className="rounded-lg border p-3 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Fase {idx + 1}</span>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Nome *</Label>
                    <Input {...register(`fases.${idx}.nome`)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo *</Label>
                    <Select
                      defaultValue={watch(`fases.${idx}.tipo`)}
                      onValueChange={(v) =>
                        setValue(
                          `fases.${idx}.tipo`,
                          v as "unico" | "recorrente_com_fim" | "recorrente_sem_fim",
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unico">Único (1 pagamento)</SelectItem>
                        <SelectItem value="recorrente_com_fim">
                          Recorrente com fim
                        </SelectItem>
                        <SelectItem value="recorrente_sem_fim">
                          Recorrente sem fim
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Valor (R$) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      {...register(`fases.${idx}.valor`)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Início *</Label>
                    <Input type="date" {...register(`fases.${idx}.data_inicio`)} />
                  </div>
                  {watch(`fases.${idx}.tipo`) !== "recorrente_sem_fim" && (
                    <div className="space-y-1">
                      <Label>Fim</Label>
                      <Input type="date" {...register(`fases.${idx}.data_fim`)} />
                    </div>
                  )}
                </div>

                {watch(`fases.${idx}.tipo`) !== "unico" && (
                  <div className="space-y-1">
                    <Label>Dia do vencimento</Label>
                    <Input
                      type="number"
                      min={1}
                      max={28}
                      {...register(`fases.${idx}.dia_vencimento`)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar Contrato"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
