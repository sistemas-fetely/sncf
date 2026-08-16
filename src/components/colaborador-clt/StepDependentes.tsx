import { useFieldArray, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { DependentesForm } from "@/lib/validations/colaborador-clt";

const parentescos = [
  "Cônjuge", "Companheiro(a)", "Filho(a)", "Enteado(a)",
  "Pai", "Mãe", "Irmão(ã)", "Avô(ó)", "Outro",
];

export function StepDependentes() {
  const { register, control, setValue, watch, formState: { errors } } = useFormContext<DependentesForm>();
  const { fields, append, remove } = useFieldArray({ control, name: "dependentes" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Dependentes</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ nome_completo: "", cpf: "", data_nascimento: "", parentesco: "", incluir_irrf: false, incluir_plano_saude: false })}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>

      {fields.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Users className="h-10 w-10 mb-3" />
            <p className="text-sm">Nenhum dependente cadastrado</p>
            <p className="text-xs">Clique em "Adicionar" para incluir dependentes</p>
          </CardContent>
        </Card>
      )}

      {fields.map((field, index) => (
        <Card key={field.id}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-muted-foreground">Dependente {index + 1}</span>
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-destructive h-8 w-8">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="md:col-span-2 lg:col-span-3">
                <Label>Nome Completo *</Label>
                <Input {...register(`dependentes.${index}.nome_completo`)} />
                {errors.dependentes?.[index]?.nome_completo && (
                  <p className="text-xs text-destructive mt-1">{errors.dependentes[index]?.nome_completo?.message}</p>
                )}
              </div>
              <div>
                <Label>CPF</Label>
                <Input {...register(`dependentes.${index}.cpf`)} placeholder="000.000.000-00" />
              </div>
              <div>
                <Label>Data de Nascimento *</Label>
                <Input type="date" {...register(`dependentes.${index}.data_nascimento`)} />
                {errors.dependentes?.[index]?.data_nascimento && (
                  <p className="text-xs text-destructive mt-1">{errors.dependentes[index]?.data_nascimento?.message}</p>
                )}
              </div>
              <div>
                <Label>Parentesco *</Label>
                <Select
                  value={watch(`dependentes.${index}.parentesco`) || ""}
                  onValueChange={(v) => setValue(`dependentes.${index}.parentesco`, v)}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {parentescos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.dependentes?.[index]?.parentesco && (
                  <p className="text-xs text-destructive mt-1">{errors.dependentes[index]?.parentesco?.message}</p>
                )}
              </div>
              <div className="flex items-center gap-6 md:col-span-2 lg:col-span-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`irrf-${index}`}
                    checked={watch(`dependentes.${index}.incluir_irrf`) || false}
                    onCheckedChange={(v) => setValue(`dependentes.${index}.incluir_irrf`, !!v)}
                  />
                  <Label htmlFor={`irrf-${index}`} className="text-sm font-normal">Incluir no IRRF</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`saude-${index}`}
                    checked={watch(`dependentes.${index}.incluir_plano_saude`) || false}
                    onCheckedChange={(v) => setValue(`dependentes.${index}.incluir_plano_saude`, !!v)}
                  />
                  <Label htmlFor={`saude-${index}`} className="text-sm font-normal">Incluir no Plano de Saúde</Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
