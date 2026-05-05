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
import { Plus, Trash2, FileUp, Loader2 } from "lucide-react";
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
  const [extraindo, setExtraindo] = useState(false);

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

  async function handleUploadPDF(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtraindo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await supabase.functions.invoke("parse-contrato-pdf", {
        body: formData,
      });

      if (res.error) throw new Error(res.error.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dados = res.data as any;

      if (dados.objeto) setValue("objeto", dados.objeto);
      if (dados.area) setValue("area", dados.area);
      if (dados.data_inicio) setValue("data_inicio", dados.data_inicio);
      if (dados.data_fim) setValue("data_fim", dados.data_fim ?? "");
      if (dados.fornecedor_cnpj) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: parceiro } = await (supabase as any)
          .from("parceiros_comerciais")
          .select("id")
          .eq("cnpj", String(dados.fornecedor_cnpj).replace(/\D/g, ""))
          .maybeSingle();
        if (parceiro?.id) setValue("parceiro_id", parceiro.id);
      }

      if (dados.fases && Array.isArray(dados.fases) && dados.fases.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fasesFormatadas = dados.fases.map((f: any) => ({
          nome: f.nome ?? "Fase",
          tipo: f.tipo ?? "recorrente_sem_fim",
          valor: f.valor ?? 0,
          data_inicio: f.data_inicio ?? dados.data_inicio ?? new Date().toISOString().split("T")[0],
          data_fim: f.data_fim ?? "",
          dia_vencimento: f.dia_vencimento ?? dados.dia_vencimento ?? 1,
        }));
        setValue("fases", fasesFormatadas);
      } else if (dados.valor_parcela) {
        setValue("fases", [{
          nome: "Mensalidade",
          tipo: dados.tipo_contrato ?? "recorrente_sem_fim",
          valor: dados.valor_parcela,
          data_inicio: dados.data_inicio ?? new Date().toISOString().split("T")[0],
          data_fim: dados.data_fim ?? "",
          dia_vencimento: dados.dia_vencimento ?? 1,
        }]);
      }

      if (dados.resumo) {
        toast.info(`IA: ${dados.resumo}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao ler PDF: " + msg);
    } finally {
      setExtraindo(false);
      const input = document.getElementById("contrato-pdf-input") as HTMLInputElement | null;
      if (input) input.value = "";
    }
  }

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
          {/* Upload PDF */}
          <div
            className="rounded-lg border-2 border-dashed p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => !extraindo && document.getElementById("contrato-pdf-input")?.click()}
          >
            <input
              id="contrato-pdf-input"
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleUploadPDF}
              disabled={extraindo}
            />
            {extraindo ? (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Lendo contrato com IA...
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <FileUp className="h-4 w-4" />
                Subir PDF do contrato para preencher automaticamente
              </div>
            )}
          </div>

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
