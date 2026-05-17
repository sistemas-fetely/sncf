import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useParametros } from "@/hooks/useParametros";
import { useCargos } from "@/hooks/useCargos";
import { useUnidades } from "@/hooks/useUnidades";
import { SelectDepartamentoHierarquico } from "@/components/shared/SelectDepartamentoHierarquico";
import { SelectGestorPessoa } from "@/components/shared/SelectGestorPessoa";
import type { DadosProfissionaisPJForm } from "@/lib/validations/contrato-pj";

const statusMap: Record<string, string> = {
  rascunho: "Rascunho",
  ativo: "Ativo",
  suspenso: "Suspenso",
  encerrado: "Encerrado",
  renovado: "Renovado",
};

function formatBRL(value: number): string {
  if (!value) return "";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function StepDadosProfissionaisPJ() {
  const { register, setValue, watch, formState: { errors } } = useFormContext<DadosProfissionaisPJForm>();

  const { data: cargos, isLoading: loadingCargos } = useCargos("pj");
  const { data: formasPagamento, isLoading: loadingFormas } = useParametros("forma_pagamento");
  const { data: unidades } = useUnidades();

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">🏢 Dados corporativos</h3>
          <p className="text-xs text-muted-foreground mt-1">
            O <strong>email corporativo</strong> será usado para acesso ao sistema e comunicações oficiais.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="email_corporativo">Email Corporativo *</Label>
            <Input
              id="email_corporativo"
              type="email"
              placeholder="nome.sobrenome@fetely.com.br"
              {...register("email_corporativo" as any)}
            />
            {(errors as any).email_corporativo && (
              <p className="text-xs text-destructive">{(errors as any).email_corporativo.message as string}</p>
            )}
            <p className="text-[11px] text-muted-foreground">Deve ser domínio Fetely configurado em /parametros.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="telefone_corporativo">Telefone Corporativo</Label>
            <Input
              id="telefone_corporativo"
              type="tel"
              value={(watch("telefone_corporativo" as any) as string) || ""}
              readOnly
              disabled
              placeholder="Não preenchido na aba Empresa"
              className="bg-muted/50"
            />
            <p className="text-[11px] text-muted-foreground">
              Definido automaticamente na aba <strong>Empresa</strong> (Celular Corporativo). Não editável aqui.
            </p>
          </div>
        </div>
      </div>

      <h3 className="text-lg font-semibold mb-4">Dados do Contrato</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <Label>Cargo / Tipo de Serviço *</Label>
          {loadingCargos ? (
            <div className="flex items-center h-10"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : (
            <Select
              value={(watch("cargo_id") as string) || ""}
              onValueChange={(id) => {
                const cargoSelecionado = (cargos || []).find((c) => c.id === id);
                setValue("cargo_id", id || null);
                setValue("tipo_servico", cargoSelecionado?.nome || "");
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(cargos || []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {errors.tipo_servico && <p className="text-xs text-destructive mt-1">{errors.tipo_servico.message}</p>}
        </div>
        <div>
          <Label>Departamento *</Label>
          <SelectDepartamentoHierarquico
            valueId={(watch("departamento_id") as string) || null}
            valueTexto={watch("departamento") || ""}
            onChange={(dep) => {
              setValue("departamento_id", dep?.id || null);
              setValue("departamento", dep?.label || "");
            }}
          />
          {errors.departamento && <p className="text-xs text-destructive mt-1">{errors.departamento.message}</p>}
        </div>
        <div>
          <Label>Unidade *</Label>
          <Select
            value={(watch("unidade_id") as string) || ""}
            onValueChange={(v) => setValue("unidade_id", v)}
          >
            <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
            <SelectContent>
              {(unidades || []).map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(errors as any).unidade_id && (
            <p className="text-xs text-destructive mt-1">{(errors as any).unidade_id.message}</p>
          )}
        </div>
        <div className="md:col-span-2 lg:col-span-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Salário Base (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                value={(watch("valor_base" as any) as number | undefined) ?? ""}
                onChange={(e) => {
                  const v = e.target.value === "" ? undefined : Number(e.target.value);
                  setValue("valor_base" as any, v as any);
                  const total = (Number(v) || 0) + (Number(watch("valor_transporte" as any)) || 0) + (Number(watch("valor_beneficios_extras" as any)) || 0);
                  setValue("valor_mensal", total);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Aux. Transporte (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={(watch("valor_transporte" as any) as number | undefined) ?? ""}
                onChange={(e) => {
                  const v = e.target.value === "" ? undefined : Number(e.target.value);
                  setValue("valor_transporte" as any, v as any);
                  const total = (Number(watch("valor_base" as any)) || 0) + (Number(v) || 0) + (Number(watch("valor_beneficios_extras" as any)) || 0);
                  setValue("valor_mensal", total);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Outros Benefícios (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={(watch("valor_beneficios_extras" as any) as number | undefined) ?? ""}
                onChange={(e) => {
                  const v = e.target.value === "" ? undefined : Number(e.target.value);
                  setValue("valor_beneficios_extras" as any, v as any);
                  const total = (Number(watch("valor_base" as any)) || 0) + (Number(watch("valor_transporte" as any)) || 0) + (Number(v) || 0);
                  setValue("valor_mensal", total);
                }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Total: R$ {((Number(watch("valor_base" as any)) || 0) + (Number(watch("valor_transporte" as any)) || 0) + (Number(watch("valor_beneficios_extras" as any)) || 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
          <input type="hidden" {...register("valor_mensal")} />
          {errors.valor_mensal && <p className="text-xs text-destructive mt-1">{errors.valor_mensal.message}</p>}
        </div>
        <div>
          <Label>Forma de Pagamento</Label>
          {loadingFormas ? (
            <div className="flex items-center h-10"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : (
            <Select value={watch("forma_pagamento") || "transferencia"} onValueChange={(v) => setValue("forma_pagamento", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(formasPagamento || []).map((f) => (
                  <SelectItem key={f.id} value={f.valor}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div>
          <Label>Data de Início *</Label>
          <Input type="date" {...register("data_inicio")} />
          {errors.data_inicio && <p className="text-xs text-destructive mt-1">{errors.data_inicio.message}</p>}
        </div>
        <div>
          <Label>Data de Fim</Label>
          <Input type="date" {...register("data_fim")} />
        </div>
        <div>
          <Label>Dia do Vencimento</Label>
          <Input type="number" min="1" max="31" {...register("dia_vencimento")} />
        </div>
        <div>
          <Label>Gestor Direto / Líder</Label>
          <SelectGestorPessoa
            value={(watch("gestor_direto_id") as string) || null}
            onChange={(v) => setValue("gestor_direto_id", v || "")}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Lista de pessoas ativas (CLT + PJ). Sincronizado automaticamente com o organograma.
          </p>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={watch("status") || "rascunho"} onValueChange={(v) => setValue("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(statusMap).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2 pb-1">
          <Switch checked={watch("renovacao_automatica")} onCheckedChange={(v) => setValue("renovacao_automatica", v)} />
          <Label className="cursor-pointer">Renovação automática</Label>
        </div>
      </div>
    </div>
  );
}