import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Save, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useParametros } from "@/hooks/useParametros";
import { useCargos } from "@/hooks/useCargos";

// Schema mínimo — cadastro manual é tolerante, só exige o que o banco exige
const manualSchema = z.object({
  // Dados PJ
  cnpj: z.string().min(14, "CNPJ obrigatório"),
  razao_social: z.string().min(3, "Razão social obrigatória"),
  nome_fantasia: z.string().optional(),
  contato_nome: z.string().min(3, "Nome do contato obrigatório"),
  contato_email: z.string().email("Email válido").optional().or(z.literal("")),
  contato_telefone: z.string().optional(),
  data_nascimento: z.string().optional().or(z.literal("")),

  // Dados corporativos (opcionais)
  email_corporativo: z.string().email().optional().or(z.literal("")),
  telefone_corporativo: z.string().optional(),

  // Classificação (Fase NF-0.A)
  categoria_pj: z.enum(["colaborador", "prestador_servico"]),

  // Contrato
  cargo_id: z.string().optional(),
  tipo_servico: z.string().min(2, "Tipo de serviço obrigatório"),
  departamento: z.string().min(1, "Departamento obrigatório"),
  valor_mensal: z.coerce.number().positive("Valor deve ser positivo"),
  forma_pagamento: z.string().default("transferencia"),
  data_inicio: z.string().min(1, "Data de início obrigatória"),
  data_fim: z.string().optional().or(z.literal("")),
  objeto: z.string().optional(),
  observacoes: z.string().optional(),
  status: z.enum(["ativo", "inativo", "encerrado"]).default("ativo"),
});

type ManualFormData = z.infer<typeof manualSchema>;

export function CadastroManualContratoPJ() {
  const navigate = useNavigate();
  const [salvando, setSalvando] = useState(false);
  const { data: departamentos } = useParametros("departamento");
  const { data: formasPagamento } = useParametros("forma_pagamento");
  const { data: cargos } = useCargos("pj");

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ManualFormData>({
    resolver: zodResolver(manualSchema),
    defaultValues: {
      categoria_pj: "colaborador",
      status: "ativo",
      forma_pagamento: "transferencia",
    },
  });

  const categoriaPJ = watch("categoria_pj");

  async function onSubmit(data: ManualFormData) {
    setSalvando(true);
    try {
      const payload: any = {
        cnpj: data.cnpj.replace(/\D/g, ""),
        razao_social: data.razao_social,
        nome_fantasia: data.nome_fantasia || null,
        contato_nome: data.contato_nome,
        contato_email: data.contato_email || null,
        contato_telefone: data.contato_telefone || null,
        data_nascimento: data.data_nascimento || null,
        email_corporativo: data.email_corporativo || null,
        telefone_corporativo: data.telefone_corporativo || null,
        categoria_pj: data.categoria_pj,
        cargo_id: data.cargo_id || null,
        tipo_servico: data.tipo_servico,
        departamento: data.departamento,
        valor_mensal: data.valor_mensal,
        forma_pagamento: data.forma_pagamento,
        data_inicio: data.data_inicio,
        data_fim: data.data_fim || null,
        objeto: data.objeto || null,
        observacoes: data.observacoes || null,
        status: data.status,
      };

      const { data: inserted, error } = await supabase
        .from("contratos_pj")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      toast.success("Contrato PJ cadastrado manualmente");
      navigate(`/contratos-pj/${inserted.id}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/contratos-pj")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-medium tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" />
            Cadastro manual · Contrato PJ
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Formulário único para casos emergenciais. O wizard padrão é
            preferível para novos contratos.
          </p>
        </div>
      </div>

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>
          <strong>Uso recomendado:</strong> migração de base, correção de
          cadastros antigos, casos excepcionais. O wizard padrão em{" "}
          <code>/contratos-pj/novo</code> valida dados com mais rigor e deve
          ser preferido para contratos novos.
        </AlertDescription>
      </Alert>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Classificação */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Classificação</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Categoria PJ *</Label>
              <Select
                value={categoriaPJ}
                onValueChange={(v) => setValue("categoria_pj", v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="colaborador">
                    Colaborador PJ (relação contínua, time Fetely)
                  </SelectItem>
                  <SelectItem value="prestador_servico">
                    Prestador de serviço (pontual, episódico)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Colaborador = email corporativo + fluxos do time. Prestador =
                relação episódica, sem portal.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Dados PJ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da empresa</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>CNPJ *</Label>
              <Input {...register("cnpj")} placeholder="00.000.000/0000-00" />
              {errors.cnpj && (
                <p className="text-xs text-destructive mt-1">
                  {errors.cnpj.message}
                </p>
              )}
            </div>
            <div>
              <Label>Razão Social *</Label>
              <Input {...register("razao_social")} />
              {errors.razao_social && (
                <p className="text-xs text-destructive mt-1">
                  {errors.razao_social.message}
                </p>
              )}
            </div>
            <div>
              <Label>Nome Fantasia</Label>
              <Input {...register("nome_fantasia")} />
            </div>
            <div>
              <Label>Status *</Label>
              <Select
                value={watch("status")}
                onValueChange={(v) => setValue("status", v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="encerrado">Encerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Contato */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contato (pessoa física)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Nome do contato *</Label>
              <Input {...register("contato_nome")} />
              {errors.contato_nome && (
                <p className="text-xs text-destructive mt-1">
                  {errors.contato_nome.message}
                </p>
              )}
            </div>
            <div>
              <Label>Email de contato</Label>
              <Input type="email" {...register("contato_email")} />
            </div>
            <div>
              <Label>Telefone de contato</Label>
              <Input {...register("contato_telefone")} />
            </div>
            <div>
              <Label>Data de nascimento</Label>
              <Input type="date" {...register("data_nascimento")} />
              <p className="text-[10px] text-muted-foreground mt-1">
                Opcional — para celebrações no Mural Fetely.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Dados corporativos (apenas colaborador) */}
        {categoriaPJ === "colaborador" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados corporativos</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Email corporativo</Label>
                <Input
                  type="email"
                  {...register("email_corporativo")}
                  placeholder="nome@fetely.com.br"
                />
              </div>
              <div>
                <Label>Telefone corporativo</Label>
                <Input {...register("telefone_corporativo")} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contrato */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contrato</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Cargo (opcional)</Label>
              <Select
                value={watch("cargo_id") || ""}
                onValueChange={(v) => setValue("cargo_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cargo" />
                </SelectTrigger>
                <SelectContent>
                  {(cargos || []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de serviço *</Label>
              <Input {...register("tipo_servico")} />
              {errors.tipo_servico && (
                <p className="text-xs text-destructive mt-1">
                  {errors.tipo_servico.message}
                </p>
              )}
            </div>
            <div>
              <Label>Departamento *</Label>
              <Select
                value={watch("departamento") || ""}
                onValueChange={(v) => setValue("departamento", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(departamentos || []).map((d: any) => (
                    <SelectItem key={d.id} value={d.valor}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.departamento && (
                <p className="text-xs text-destructive mt-1">
                  {errors.departamento.message}
                </p>
              )}
            </div>
            <div>
              <Label>Valor mensal (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                {...register("valor_mensal")}
              />
              {errors.valor_mensal && (
                <p className="text-xs text-destructive mt-1">
                  {errors.valor_mensal.message}
                </p>
              )}
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <Select
                value={watch("forma_pagamento")}
                onValueChange={(v) => setValue("forma_pagamento", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(formasPagamento || []).map((fp: any) => (
                    <SelectItem key={fp.id} value={fp.valor}>
                      {fp.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data início *</Label>
              <Input type="date" {...register("data_inicio")} />
              {errors.data_inicio && (
                <p className="text-xs text-destructive mt-1">
                  {errors.data_inicio.message}
                </p>
              )}
            </div>
            <div>
              <Label>Data fim (opcional)</Label>
              <Input type="date" {...register("data_fim")} />
            </div>
            <div className="md:col-span-2">
              <Label>Objeto do contrato</Label>
              <Textarea {...register("objeto")} rows={2} />
            </div>
            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea
                {...register("observacoes")}
                rows={2}
                placeholder="Motivo do cadastro manual, notas internas, etc."
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/contratos-pj")}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={salvando} className="gap-2">
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <Save className="h-3.5 w-3.5" />
            Salvar cadastro manual
          </Button>
        </div>
      </form>
    </div>
  );
}
