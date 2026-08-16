import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useForm, FormProvider, useFieldArray, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, AlertTriangle, Clock, ChevronLeft, ChevronRight,
  Users, Plus, Trash2, Search, Upload, Briefcase, Building2, CalendarDays,
  MessageSquare, Shield, Save,
} from "lucide-react";
import StepUploadDocumentos from "@/components/cadastro-publico/StepUploadDocumentos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { fetchCep } from "@/lib/viacep";
import { format, parseISO } from "date-fns";

// ─── Constants ───────────────────────────────────────────────────────
const UF_LIST = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const bancos = [
  { codigo: "001", nome: "Banco do Brasil" }, { codigo: "033", nome: "Santander" },
  { codigo: "104", nome: "Caixa Econômica" }, { codigo: "237", nome: "Bradesco" },
  { codigo: "341", nome: "Itaú Unibanco" }, { codigo: "077", nome: "Inter" },
  { codigo: "260", nome: "Nubank" }, { codigo: "336", nome: "C6 Bank" },
  { codigo: "290", nome: "PagSeguro" }, { codigo: "380", nome: "PicPay" },
  { codigo: "756", nome: "Sicoob" }, { codigo: "422", nome: "Safra" },
];
const parentescos = ["Cônjuge", "Companheiro(a)", "Filho(a)", "Enteado(a)", "Pai", "Mãe", "Irmão(ã)", "Avô(ó)", "Outro"];

// ─── Schemas (per-step for validation) ───────────────────────────────
const step1Schema = z.object({
  nome_completo: z.string().min(3, "Nome deve ter pelo menos 3 caracteres").max(200),
  cpf: z.string().min(11, "CPF é obrigatório"),
  rg: z.string().min(1, "RG é obrigatório"),
  orgao_emissor: z.string().min(1, "Órgão Emissor é obrigatório"),
  data_nascimento: z.string().min(1, "Data de nascimento é obrigatória"),
  genero: z.string().min(1, "Gênero é obrigatório"),
  estado_civil: z.string().min(1, "Estado civil é obrigatório"),
  nacionalidade: z.string().min(1, "Nacionalidade é obrigatória").default("Brasileira"),
  etnia: z.string().min(1, "Etnia é obrigatória"),
  nome_mae: z.string().optional().or(z.literal("")),
  nome_pai: z.string().optional().or(z.literal("")),
  telefone: z.string().min(1, "Telefone é obrigatório"),
  email_pessoal: z.string().email("Email inválido"),
  contato_emergencia_nome: z.string().min(1, "Contato de emergência é obrigatório"),
  contato_emergencia_telefone: z.string().min(1, "Telefone de emergência é obrigatório"),
});

const step2Schema = z.object({
  cep: z.string().min(1, "CEP é obrigatório"),
  logradouro: z.string().min(1, "Logradouro é obrigatório"),
  numero: z.string().min(1, "Número é obrigatório"),
  complemento: z.string().optional().or(z.literal("")),
  bairro: z.string().min(1, "Bairro é obrigatório"),
  cidade: z.string().min(1, "Cidade é obrigatória"),
  uf: z.string().min(1, "UF é obrigatória"),
});

const step3CltSchema = z.object({
  pis_pasep: z.string().min(1, "PIS/PASEP é obrigatório"),
  ctps_numero: z.string().min(1, "Número da CTPS é obrigatório"),
  ctps_serie: z.string().min(1, "Série da CTPS é obrigatória"),
  ctps_uf: z.string().min(1, "UF da CTPS é obrigatória"),
  titulo_eleitor: z.string().optional().or(z.literal("")),
  zona_eleitoral: z.string().optional().or(z.literal("")),
  secao_eleitoral: z.string().optional().or(z.literal("")),
  cnh_numero: z.string().optional().or(z.literal("")),
  cnh_categoria: z.string().optional().or(z.literal("")),
  cnh_validade: z.string().optional().or(z.literal("")),
  certificado_reservista: z.string().optional().or(z.literal("")),
});

const step3PjSchema = z.object({
  cnpj: z.string().min(14, "CNPJ é obrigatório"),
  razao_social: z.string().min(2, "Razão Social é obrigatória"),
  nome_fantasia: z.string().optional().or(z.literal("")),
  inscricao_municipal: z.string().optional().or(z.literal("")),
  inscricao_estadual: z.string().optional().or(z.literal("")),
});

const step4Schema = z.object({
  banco_nome: z.string().min(1, "Banco é obrigatório"),
  banco_codigo: z.string().min(1, "Código do banco é obrigatório"),
  agencia: z.string().min(1, "Agência é obrigatória"),
  conta: z.string().min(1, "Conta é obrigatória"),
  tipo_conta: z.string().default("corrente"),
  chave_pix: z.string().min(1, "Chave PIX é obrigatória"),
});

const dependenteSchema = z.object({
  nome_completo: z.string().min(3, "Nome é obrigatório"),
  cpf: z.string().optional().or(z.literal("")),
  data_nascimento: z.string().min(1, "Data é obrigatória"),
  parentesco: z.string().min(1, "Parentesco é obrigatório"),
  incluir_irrf: z.boolean().default(false),
  incluir_plano_saude: z.boolean().default(false),
});

// Full combined schema (loose — validation done per-step)
const fullSchema = step1Schema
  .merge(step2Schema)
  .merge(step3CltSchema)
  .merge(step3PjSchema)
  .merge(step4Schema)
  .extend({
    dependentes: z.array(dependenteSchema).default([]),
    // PJ-specific personal fields
    contato_nome: z.string().optional().or(z.literal("")),
    contato_telefone: z.string().optional().or(z.literal("")),
    contato_email: z.string().optional().or(z.literal("")),
    // LGPD
    lgpd_aceito: z.boolean().default(false),
    lgpd_aceito_em: z.string().optional().or(z.literal("")),
    lgpd_versao: z.string().optional().or(z.literal("")),
  })
  .partial(); // Make all optional at form level; we validate per-step

type FormData = z.infer<typeof fullSchema>;

// ─── Convite interface ───────────────────────────────────────────────
interface ConviteData {
  id: string;
  token: string;
  tipo: string;
  nome: string;
  email: string;
  cargo: string | null;
  departamento: string | null;
  status: string;
  expira_em: string;
  criado_por: string | null;
  dados_preenchidos: Record<string, any> | null;
  data_inicio_prevista: string | null;
  observacoes_colaborador: string | null;
}

// ─── Step Components ─────────────────────────────────────────────────

function StepDadosPessoais({ isClt }: { isClt: boolean }) {
  const { register, setValue, watch, formState: { errors } } = useFormContext<FormData>();
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Preencha seus dados pessoais abaixo.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Label>Nome Completo *</Label>
          <Input {...register(isClt ? "nome_completo" : "contato_nome")} />
          {(errors as any)[isClt ? "nome_completo" : "contato_nome"] && <p className="text-xs text-destructive mt-1">{(errors as any)[isClt ? "nome_completo" : "contato_nome"]?.message}</p>}
        </div>
        <div>
          <Label>CPF *</Label>
          <Input {...register("cpf")} placeholder="000.000.000-00" />
          {errors.cpf && <p className="text-xs text-destructive mt-1">{errors.cpf.message}</p>}
        </div>
        <div>
          <Label>RG *</Label>
          <Input {...register("rg")} />
          {errors.rg && <p className="text-xs text-destructive mt-1">{errors.rg.message}</p>}
        </div>
        <div>
          <Label>Órgão Emissor *</Label>
          <Input {...register("orgao_emissor")} />
          {errors.orgao_emissor && <p className="text-xs text-destructive mt-1">{errors.orgao_emissor.message}</p>}
        </div>
        <div>
          <Label>Data de Nascimento *</Label>
          <Input type="date" {...register("data_nascimento")} />
          {errors.data_nascimento && <p className="text-xs text-destructive mt-1">{errors.data_nascimento.message}</p>}
        </div>
        <div>
          <Label>Gênero *</Label>
          <Select value={watch("genero") || ""} onValueChange={(v) => setValue("genero", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="masculino">Masculino</SelectItem>
              <SelectItem value="feminino">Feminino</SelectItem>
              <SelectItem value="nao_binario">Não-binário</SelectItem>
              <SelectItem value="prefiro_nao_informar">Prefiro não informar</SelectItem>
            </SelectContent>
          </Select>
          {errors.genero && <p className="text-xs text-destructive mt-1">{errors.genero.message}</p>}
        </div>
        <div>
          <Label>Estado Civil *</Label>
          <Select value={watch("estado_civil") || ""} onValueChange={(v) => setValue("estado_civil", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="solteiro">Solteiro(a)</SelectItem>
              <SelectItem value="casado">Casado(a)</SelectItem>
              <SelectItem value="divorciado">Divorciado(a)</SelectItem>
              <SelectItem value="viuvo">Viúvo(a)</SelectItem>
              <SelectItem value="uniao_estavel">União Estável</SelectItem>
            </SelectContent>
          </Select>
          {errors.estado_civil && <p className="text-xs text-destructive mt-1">{errors.estado_civil.message}</p>}
        </div>
        <div>
          <Label>Nacionalidade *</Label>
          <Input {...register("nacionalidade")} />
          {errors.nacionalidade && <p className="text-xs text-destructive mt-1">{errors.nacionalidade.message}</p>}
        </div>
        <div>
          <Label>Etnia *</Label>
          <Select value={watch("etnia") || ""} onValueChange={(v) => setValue("etnia", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="branca">Branca</SelectItem>
              <SelectItem value="preta">Preta</SelectItem>
              <SelectItem value="parda">Parda</SelectItem>
              <SelectItem value="amarela">Amarela</SelectItem>
              <SelectItem value="indigena">Indígena</SelectItem>
              <SelectItem value="prefiro_nao_informar">Prefiro não informar</SelectItem>
            </SelectContent>
          </Select>
          {errors.etnia && <p className="text-xs text-destructive mt-1">{errors.etnia.message}</p>}
        </div>
        <div><Label>Nome da Mãe</Label><Input {...register("nome_mae")} /></div>
        <div><Label>Nome do Pai</Label><Input {...register("nome_pai")} /></div>
        <div>
          <Label>Telefone *</Label>
          <Input {...register(isClt ? "telefone" : "contato_telefone")} placeholder="(00) 00000-0000" />
          {(errors as any)[isClt ? "telefone" : "contato_telefone"] && <p className="text-xs text-destructive mt-1">{(errors as any)[isClt ? "telefone" : "contato_telefone"]?.message}</p>}
        </div>
        <div>
          <Label>Email Pessoal *</Label>
          <Input type="email" {...register(isClt ? "email_pessoal" : "contato_email")} />
          {(errors as any)[isClt ? "email_pessoal" : "contato_email"] && <p className="text-xs text-destructive mt-1">{(errors as any)[isClt ? "email_pessoal" : "contato_email"]?.message}</p>}
        </div>
        <div>
          <Label>Contato de Emergência (nome) *</Label>
          <Input {...register("contato_emergencia_nome")} placeholder="Nome do contato" />
          {errors.contato_emergencia_nome && <p className="text-xs text-destructive mt-1">{errors.contato_emergencia_nome.message}</p>}
        </div>
        <div>
          <Label>Contato de Emergência (telefone) *</Label>
          <Input {...register("contato_emergencia_telefone")} placeholder="(00) 00000-0000" />
          {errors.contato_emergencia_telefone && <p className="text-xs text-destructive mt-1">{errors.contato_emergencia_telefone.message}</p>}
        </div>
      </div>
    </div>
  );
}

function StepEndereco() {
  const { register, setValue, watch, formState: { errors } } = useFormContext<FormData>();
  const [loadingCep, setLoadingCep] = useState(false);
  const handleCepSearch = async () => {
    const cep = watch("cep");
    if (!cep) return;
    setLoadingCep(true);
    const data = await fetchCep(cep);
    if (data) {
      setValue("logradouro", data.logradouro);
      setValue("bairro", data.bairro);
      setValue("cidade", data.localidade);
      setValue("uf", data.uf);
      if (data.complemento) setValue("complemento", data.complemento);
    }
    setLoadingCep(false);
  };
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Informe seu endereço atual. Use o botão de busca para preencher automaticamente pelo CEP.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>CEP *</Label>
          <div className="flex gap-2">
            <Input {...register("cep")} placeholder="00000-000" />
            <Button type="button" variant="outline" size="icon" onClick={handleCepSearch} disabled={loadingCep}>
              {loadingCep ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {errors.cep && <p className="text-xs text-destructive mt-1">{errors.cep.message}</p>}
        </div>
        <div><Label>Logradouro *</Label><Input {...register("logradouro")} />{errors.logradouro && <p className="text-xs text-destructive mt-1">{errors.logradouro.message}</p>}</div>
        <div><Label>Número *</Label><Input {...register("numero")} />{errors.numero && <p className="text-xs text-destructive mt-1">{errors.numero.message}</p>}</div>
        <div><Label>Complemento</Label><Input {...register("complemento")} /></div>
        <div><Label>Bairro *</Label><Input {...register("bairro")} />{errors.bairro && <p className="text-xs text-destructive mt-1">{errors.bairro.message}</p>}</div>
        <div><Label>Cidade *</Label><Input {...register("cidade")} />{errors.cidade && <p className="text-xs text-destructive mt-1">{errors.cidade.message}</p>}</div>
        <div>
          <Label>UF *</Label>
          <Select value={watch("uf") || ""} onValueChange={(v) => setValue("uf", v)}>
            <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
            <SelectContent>{UF_LIST.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
          </Select>
          {errors.uf && <p className="text-xs text-destructive mt-1">{errors.uf.message}</p>}
        </div>
      </div>
    </div>
  );
}

function StepDocumentosCLT() {
  const { register, setValue, watch, formState: { errors } } = useFormContext<FormData>();
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Informe os dados dos seus documentos trabalhistas.</p>
      <div>
        <h4 className="text-base font-medium mb-3">PIS/PASEP e CTPS</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><Label>PIS/PASEP *</Label><Input {...register("pis_pasep")} />{errors.pis_pasep && <p className="text-xs text-destructive mt-1">{errors.pis_pasep.message}</p>}</div>
          <div><Label>CTPS Número *</Label><Input {...register("ctps_numero")} />{errors.ctps_numero && <p className="text-xs text-destructive mt-1">{errors.ctps_numero.message}</p>}</div>
          <div><Label>CTPS Série *</Label><Input {...register("ctps_serie")} />{errors.ctps_serie && <p className="text-xs text-destructive mt-1">{errors.ctps_serie.message}</p>}</div>
          <div>
            <Label>CTPS UF *</Label>
            <Select value={watch("ctps_uf") || ""} onValueChange={(v) => setValue("ctps_uf", v)}>
              <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>{UF_LIST.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
            </Select>
            {errors.ctps_uf && <p className="text-xs text-destructive mt-1">{errors.ctps_uf.message}</p>}
          </div>
        </div>
      </div>
      <div>
        <h4 className="text-base font-medium mb-3">Título de Eleitor (opcional)</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><Label>Número</Label><Input {...register("titulo_eleitor")} /></div>
          <div><Label>Zona</Label><Input {...register("zona_eleitoral")} /></div>
          <div><Label>Seção</Label><Input {...register("secao_eleitoral")} /></div>
        </div>
      </div>
      <div>
        <h4 className="text-base font-medium mb-3">CNH (opcional)</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><Label>Número</Label><Input {...register("cnh_numero")} /></div>
          <div>
            <Label>Categoria</Label>
            <Select value={watch("cnh_categoria") || ""} onValueChange={(v) => setValue("cnh_categoria", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{["A","B","AB","C","D","E"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Validade</Label><Input type="date" {...register("cnh_validade")} /></div>
        </div>
      </div>
      <div>
        <h4 className="text-base font-medium mb-3">Certificado de Reservista (opcional)</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><Label>Número</Label><Input {...register("certificado_reservista")} /></div>
        </div>
      </div>
    </div>
  );
}

function StepDocumentosPJ() {
  const { register, setValue, watch, formState: { errors } } = useFormContext<FormData>();
  const formatCNPJ = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    return digits.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  };
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Informe os dados da sua empresa e documentos pessoais.</p>
      <div>
        <h4 className="text-base font-medium mb-3">Dados da Empresa</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>CNPJ *</Label>
            <Input value={watch("cnpj") || ""} onChange={(e) => setValue("cnpj", formatCNPJ(e.target.value), { shouldValidate: true })} maxLength={18} />
            {errors.cnpj && <p className="text-xs text-destructive mt-1">{errors.cnpj.message}</p>}
          </div>
          <div><Label>Razão Social *</Label><Input {...register("razao_social")} />{errors.razao_social && <p className="text-xs text-destructive mt-1">{errors.razao_social.message}</p>}</div>
          <div><Label>Nome Fantasia</Label><Input {...register("nome_fantasia")} /></div>
          <div><Label>Inscrição Municipal</Label><Input {...register("inscricao_municipal")} /></div>
        </div>
      </div>
    </div>
  );
}

function StepBancarios() {
  const { register, setValue, watch, formState: { errors } } = useFormContext<FormData>();
  const handleBancoChange = (codigo: string) => {
    const banco = bancos.find(b => b.codigo === codigo);
    setValue("banco_codigo", codigo);
    setValue("banco_nome", banco?.nome || "");
  };
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Informe seus dados bancários para recebimento de pagamento.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Banco *</Label>
          <Select value={watch("banco_codigo") || ""} onValueChange={handleBancoChange}>
            <SelectTrigger><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
            <SelectContent>{bancos.map(b => <SelectItem key={b.codigo} value={b.codigo}>{b.codigo} - {b.nome}</SelectItem>)}</SelectContent>
          </Select>
          {errors.banco_codigo && <p className="text-xs text-destructive mt-1">{String(errors.banco_codigo.message)}</p>}
        </div>
        <div><Label>Agência *</Label><Input {...register("agencia")} placeholder="0000" />{errors.agencia && <p className="text-xs text-destructive mt-1">{String(errors.agencia.message)}</p>}</div>
        <div><Label>Conta *</Label><Input {...register("conta")} placeholder="00000-0" />{errors.conta && <p className="text-xs text-destructive mt-1">{String(errors.conta.message)}</p>}</div>
        <div>
          <Label>Tipo de Conta *</Label>
          <Select value={watch("tipo_conta") || "corrente"} onValueChange={(v) => setValue("tipo_conta", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="corrente">Conta Corrente</SelectItem>
              <SelectItem value="poupanca">Conta Poupança</SelectItem>
              <SelectItem value="salario">Conta Salário</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Chave PIX *</Label>
          <Input {...register("chave_pix")} placeholder="CPF, email, telefone ou chave aleatória" />
          {errors.chave_pix && <p className="text-xs text-destructive mt-1">{String(errors.chave_pix.message)}</p>}
        </div>
      </div>
    </div>
  );
}

function StepDependentes() {
  const { register, control, setValue, watch } = useFormContext<FormData>();
  const { fields, append, remove } = useFieldArray({ control, name: "dependentes" });
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Cadastre seus dependentes (opcional). Você pode pular esta etapa.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => append({ nome_completo: "", cpf: "", data_nascimento: "", parentesco: "", incluir_irrf: false, incluir_plano_saude: false })} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>
      {fields.length === 0 && (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <Users className="h-10 w-10 mb-3" /><p className="text-sm">Nenhum dependente cadastrado</p><p className="text-xs">Clique em "Adicionar" para incluir ou avance para a próxima etapa</p>
        </CardContent></Card>
      )}
      {fields.map((field, index) => (
        <Card key={field.id}><CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Dependente {index + 1}</span>
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-destructive h-8 w-8"><Trash2 className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Label>Nome *</Label><Input {...register(`dependentes.${index}.nome_completo`)} /></div>
            <div><Label>CPF</Label><Input {...register(`dependentes.${index}.cpf`)} /></div>
            <div><Label>Data Nascimento *</Label><Input type="date" {...register(`dependentes.${index}.data_nascimento`)} /></div>
            <div>
              <Label>Parentesco *</Label>
              <Select value={watch(`dependentes.${index}.parentesco`) || ""} onValueChange={(v) => setValue(`dependentes.${index}.parentesco`, v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{parentescos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-6 sm:col-span-2">
              <div className="flex items-center gap-2">
                <Checkbox id={`irrf-${index}`} checked={watch(`dependentes.${index}.incluir_irrf`) || false} onCheckedChange={(v) => setValue(`dependentes.${index}.incluir_irrf`, !!v)} />
                <Label htmlFor={`irrf-${index}`} className="text-sm font-normal">Incluir no IRRF</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id={`saude-${index}`} checked={watch(`dependentes.${index}.incluir_plano_saude`) || false} onCheckedChange={(v) => setValue(`dependentes.${index}.incluir_plano_saude`, !!v)} />
                <Label htmlFor={`saude-${index}`} className="text-sm font-normal">Plano de Saúde</Label>
              </div>
            </div>
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}

function StepLGPD({ lgpdAceito, onAccept }: { lgpdAceito: boolean; onAccept: (v: boolean) => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="text-base font-medium">Termo de Consentimento LGPD</h3>
      </div>
      <div className="rounded-lg border bg-muted/30 p-4 max-h-[400px] overflow-y-auto text-sm leading-relaxed space-y-3">
        <p className="font-medium">TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS</p>
        <p>Em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD), declaro que autorizo a <strong>Fetely Tecnologia LTDA</strong> ("Controladora") a coletar, armazenar, utilizar e processar os dados pessoais por mim fornecidos neste formulário de pré-cadastro.</p>

        <p className="font-medium mt-4">1. Finalidade do Tratamento</p>
        <p>Os dados pessoais coletados serão utilizados exclusivamente para as seguintes finalidades:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Processo de admissão e gestão do contrato de trabalho (CLT) ou prestação de serviços (PJ);</li>
          <li>Cumprimento de obrigações legais e regulatórias trabalhistas, previdenciárias e fiscais;</li>
          <li>Cadastro em sistemas internos de gestão de pessoas;</li>
          <li>Administração de benefícios, folha de pagamento e férias;</li>
          <li>Comunicação interna e contato de emergência;</li>
          <li>Geração de relatórios gerenciais internos (anonimizados quando possível).</li>
        </ul>

        <p className="font-medium mt-4">2. Dados Coletados</p>
        <p>Serão coletados dados pessoais, incluindo mas não se limitando a: nome completo, CPF, RG, data de nascimento, endereço, telefone, e-mail, dados bancários, documentos trabalhistas (CTPS, PIS/PASEP), dados de dependentes e fotografias para fins de identificação.</p>

        <p className="font-medium mt-4">3. Compartilhamento</p>
        <p>Os dados poderão ser compartilhados com: órgãos governamentais para cumprimento de obrigações legais; operadoras de benefícios (plano de saúde, vale-transporte, vale-refeição); instituições financeiras para processamento de pagamentos; e contadores/auditores externos, sempre sob sigilo contratual.</p>

        <p className="font-medium mt-4">4. Armazenamento e Segurança</p>
        <p>Os dados serão armazenados em servidores seguros com criptografia e controle de acesso, pelo período necessário ao cumprimento das finalidades descritas ou conforme exigido por legislação aplicável.</p>

        <p className="font-medium mt-4">5. Direitos do Titular</p>
        <p>Em conformidade com a LGPD, você pode exercer os seguintes direitos a qualquer momento, mediante solicitação formal ao setor de RH:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Confirmação da existência de tratamento;</li>
          <li>Acesso aos dados;</li>
          <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>Anonimização, bloqueio ou eliminação de dados desnecessários;</li>
          <li>Portabilidade dos dados;</li>
          <li>Revogação do consentimento.</li>
        </ul>

        <p className="font-medium mt-4">6. Revogação</p>
        <p>O consentimento aqui concedido pode ser revogado a qualquer momento, sem prejuízo da legalidade do tratamento realizado anteriormente. A revogação pode ser solicitada pelo e-mail do setor de Recursos Humanos.</p>

        <p className="text-xs text-muted-foreground mt-4">Versão 1.0 — Abril 2026</p>
      </div>

      <div className="flex items-start gap-3 pt-2">
        <Checkbox
          id="lgpd-aceite"
          checked={lgpdAceito}
          onCheckedChange={(v) => onAccept(!!v)}
        />
        <Label htmlFor="lgpd-aceite" className="text-sm leading-snug cursor-pointer">
          Li e aceito os termos de uso e política de privacidade acima. Autorizo o tratamento dos meus dados pessoais conforme descrito neste termo. <span className="text-destructive">*</span>
        </Label>
      </div>
      {!lgpdAceito && (
        <p className="text-xs text-muted-foreground">Você precisa aceitar o termo para enviar a ficha de cadastro.</p>
      )}
    </div>
  );
}

// ─── Step definitions ────────────────────────────────────────────────
const CLT_STEPS = [
  { label: "Dados Pessoais", icon: Users },
  { label: "Endereço", icon: Building2 },
  { label: "Documentos", icon: Briefcase },
  { label: "Dados Bancários", icon: Building2 },
  { label: "Dependentes", icon: Users },
  { label: "Upload de Documentos", icon: Upload },
  { label: "Termo LGPD", icon: Shield },
];

const PJ_STEPS = [
  { label: "Dados Pessoais", icon: Users },
  { label: "Endereço", icon: Building2 },
  { label: "Dados da Empresa", icon: Briefcase },
  { label: "Dados Bancários", icon: Building2 },
  { label: "Dependentes", icon: Users },
  { label: "Upload de Documentos", icon: Upload },
  { label: "Termo LGPD", icon: Shield },
];

// ─── Main Component ──────────────────────────────────────────────────
export default function CadastroPublico() {
  const { token } = useParams<{ token: string }>();
  const [convite, setConvite] = useState<ConviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ key: string; name: string; url: string }[]>([]);
  const [lgpdAceito, setLgpdAceito] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const isClt = convite?.tipo === "clt";
  const steps = isClt ? CLT_STEPS : PJ_STEPS;

  const methods = useForm<FormData>({
    defaultValues: {
      nacionalidade: "Brasileira",
      tipo_conta: "corrente",
      dependentes: [],
    },
  });

  // Auto-save logic
  const autoSave = useCallback(async () => {
    if (!convite || submitted) return;
    setAutoSaving(true);
    try {
      const formData = methods.getValues();
      const dataWithDocs = { ...formData, documentos_upload: uploadedFiles, lgpd_aceito: lgpdAceito };
      // Auto-save: salva dados parciais sem mudar status e sem disparar e-mail
      await supabase.rpc("autosave_convite_cadastro", {
        _token: convite.token,
        _dados: dataWithDocs as any,
      });
    } catch {
      // Silent fail for auto-save
    } finally {
      setAutoSaving(false);
    }
  }, [convite, submitted, methods, uploadedFiles, lgpdAceito]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(autoSave, 5000);
  }, [autoSave]);

  // Watch form changes for auto-save
  useEffect(() => {
    const subscription = methods.watch(() => scheduleAutoSave());
    return () => subscription.unsubscribe();
  }, [methods, scheduleAutoSave]);

  // Fetch convite
  useEffect(() => {
    if (!token) { setError("Token inválido"); setLoading(false); return; }
    const fetchConvite = async () => {
      const { data, error: err } = await supabase.rpc("get_convite_by_token", { _token: token });
      if (err || !data) { setError("Convite não encontrado"); setLoading(false); return; }

      const conviteData = data as unknown as ConviteData;

      if (conviteData.status === "cancelado") { setError("Este convite foi cancelado."); setLoading(false); return; }
      

      setConvite(conviteData);

      // Pre-fill with saved data
      if (conviteData.dados_preenchidos && (conviteData.status === "preenchido" || conviteData.status === "devolvido")) {
        const saved = conviteData.dados_preenchidos as Record<string, any>;
        if (saved.documentos_upload && Array.isArray(saved.documentos_upload)) {
          setUploadedFiles(saved.documentos_upload);
        }
        if (saved.lgpd_aceito) setLgpdAceito(true);
        Object.entries(saved).forEach(([key, value]) => {
          if (key === "documentos_upload" || key === "lgpd_aceito") return;
          if (key === "dependentes" && Array.isArray(value)) {
            methods.setValue("dependentes", value);
          } else {
            methods.setValue(key as any, value);
          }
        });
      } else {
        // Pre-fill name/email from invite
        if (conviteData.tipo === "clt") {
          methods.setValue("nome_completo", conviteData.nome);
          methods.setValue("email_pessoal", conviteData.email);
        } else {
          methods.setValue("contato_nome", conviteData.nome);
          methods.setValue("contato_email", conviteData.email);
        }
      }
      setLoading(false);
    };
    fetchConvite();
  }, [token]);

  // Validation per step
  const getFieldsForStep = (s: number): string[] => {
    if (isClt) {
      switch (s) {
        case 0: return ["nome_completo", "cpf", "rg", "orgao_emissor", "data_nascimento", "genero", "estado_civil", "nacionalidade", "etnia", "telefone", "email_pessoal", "contato_emergencia_nome", "contato_emergencia_telefone"];
        case 1: return ["cep", "logradouro", "numero", "bairro", "cidade", "uf"];
        case 2: return ["pis_pasep", "ctps_numero", "ctps_serie", "ctps_uf"];
        case 3: return ["banco_codigo", "banco_nome", "agencia", "conta", "chave_pix"];
        default: return [];
      }
    } else {
      switch (s) {
        case 0: return ["contato_nome", "cpf", "rg", "orgao_emissor", "data_nascimento", "genero", "estado_civil", "nacionalidade", "etnia", "contato_telefone", "contato_email", "contato_emergencia_nome", "contato_emergencia_telefone"];
        case 1: return ["cep", "logradouro", "numero", "bairro", "cidade", "uf"];
        case 2: return ["cnpj", "razao_social"];
        case 3: return ["banco_codigo", "banco_nome", "agencia", "conta", "chave_pix"];
        default: return [];
      }
    }
  };

  const handleNext = async () => {
    const fieldsToValidate = getFieldsForStep(step);
    if (fieldsToValidate.length > 0) {
      const valid = await methods.trigger(fieldsToValidate as any);
      if (!valid) {
        toast.error("Preencha os campos obrigatórios antes de avançar.");
        return;
      }
    }
    if (step < steps.length - 1) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSaveLater = async () => {
    if (!convite) return;
    setAutoSaving(true);
    try {
      const formData = methods.getValues();
      const dataWithDocs = { ...formData, documentos_upload: uploadedFiles, lgpd_aceito: lgpdAceito };
      await supabase.rpc("submit_convite_cadastro", {
        _token: convite.token,
        _dados: dataWithDocs as any,
      });
      toast.success("Dados salvos! Você pode continuar depois usando o mesmo link.");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setAutoSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!convite) return;

    // Validate LGPD
    if (!lgpdAceito) {
      toast.error("Você precisa aceitar o Termo LGPD para enviar o cadastro.");
      return;
    }

    // Validate required uploads
    const requiredUploads = isClt ? ["foto_rosto", "rg_cnh_frente"] : ["foto_rosto", "rg_cnh_frente", "contrato_social"];
    const missing = requiredUploads.filter(key => !uploadedFiles.find(f => f.key === key));
    if (missing.length > 0) {
      const labels = isClt ? "Foto de Rosto e RG/CNH (Frente)" : "Foto de Rosto, RG/CNH (Frente) e Contrato Social";
      toast.error(`Envie os documentos obrigatórios: ${labels}.`);
      return;
    }

    setSubmitting(true);
    try {
      const formData = methods.getValues();
      const dataWithDocs = {
        ...formData,
        documentos_upload: uploadedFiles,
        lgpd_aceito: true,
        lgpd_aceito_em: new Date().toISOString(),
        lgpd_versao: "1.0",
      };

      const { error: rpcErr } = await supabase.rpc("submit_convite_cadastro", {
        _token: convite.token,
        _dados: dataWithDocs as any,
      });
      if (rpcErr) throw rpcErr;

      setSubmitted(true);
      toast.success("Cadastro enviado com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao enviar: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-medium mb-2">Link Indisponível</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-success mb-4" />
            <h2 className="text-xl font-medium mb-2">Cadastro Enviado!</h2>
            <p className="text-muted-foreground mb-4">
              Obrigado, {convite?.nome}! Sua ficha foi enviada com sucesso.
            </p>
            <p className="text-sm text-muted-foreground">
              O RH entrará em contato em breve com os próximos passos.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = ((step + 1) / steps.length) * 100;
  const expiresAt = convite ? new Date(convite.expira_em) : null;
  const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
  const isLastStep = step === steps.length - 1;

  // Upload step is step 5 (index 5)
  const uploadStep = 5;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-5 px-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-lg font-medium">Fetely — Pré-Cadastro</h1>
          <p className="text-primary-foreground/80 text-sm mt-1">
            Olá, {convite?.nome}! Complete seu cadastro abaixo.
          </p>
          <div className="flex items-center gap-2 mt-2 text-primary-foreground/70 text-xs">
            {autoSaving && (
              <span className="ml-auto flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Welcome card with read-only invite data */}
        {step === 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-medium text-primary flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Informações da Vaga
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {convite?.cargo && (
                  <div>
                    <span className="text-xs text-muted-foreground">Cargo</span>
                    <p className="font-medium">{convite.cargo}</p>
                  </div>
                )}
                {convite?.departamento && (
                  <div>
                    <span className="text-xs text-muted-foreground">Departamento</span>
                    <p className="font-medium">{convite.departamento}</p>
                  </div>
                )}
                <div>
                  <span className="text-xs text-muted-foreground">Tipo</span>
                  <p className="font-medium">{convite?.tipo === "clt" ? "CLT" : "PJ"}</p>
                </div>
                {convite?.data_inicio_prevista && (
                  <div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Início Previsto</span>
                    <p className="font-medium">{format(parseISO(convite.data_inicio_prevista), "dd/MM/yyyy")}</p>
                  </div>
                )}
              </div>
              {convite?.observacoes_colaborador && (
                <div className="border-t pt-2 mt-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><MessageSquare className="h-3 w-3" /> Observações do RH</span>
                  <p className="text-sm">{convite.observacoes_colaborador}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Banner de devolução */}
        {convite?.status === "devolvido" && (convite as any)?.dados_preenchidos?._comentario_rh && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" />
              <p className="font-medium text-warning text-sm">Cadastro devolvido para ajustes</p>
            </div>
            <p className="text-sm text-warning leading-relaxed">
              {(convite as any).dados_preenchidos._comentario_rh}
            </p>
            {(convite as any).dados_preenchidos._devolvido_em && (
              <p className="text-xs text-warning mt-2">
                Devolvido em {new Date((convite as any).dados_preenchidos._devolvido_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        )}

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Passo {step + 1} de {steps.length}: {steps[step].label}</span>
            <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Form */}
        <FormProvider {...methods}>
          <form onSubmit={(e) => e.preventDefault()}>
            <Card>
              <CardContent className="p-4 sm:p-6">
                {step === 0 && <StepDadosPessoais isClt={isClt} />}
                {step === 1 && <StepEndereco />}
                {step === 2 && (isClt ? <StepDocumentosCLT /> : <StepDocumentosPJ />)}
                {step === 3 && <StepBancarios />}
                {step === 4 && <StepDependentes />}
                {step === uploadStep && (
                  <StepUploadDocumentos
                    tipo={isClt ? "clt" : "pj"}
                    token={convite?.token || ""}
                    uploadedFiles={uploadedFiles}
                    onFilesChange={(files) => { setUploadedFiles(files); scheduleAutoSave(); }}
                  />
                )}
                {isLastStep && (
                  <StepLGPD lgpdAceito={lgpdAceito} onAccept={setLgpdAceito} />
                )}
              </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex flex-col gap-3 mt-4">
              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" onClick={() => { setStep(Math.max(0, step - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={step === 0} className="gap-2">
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </Button>
                {!isLastStep ? (
                  <Button type="button" onClick={handleNext} className="gap-2">
                    Próximo <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" onClick={handleSubmit} disabled={submitting || !lgpdAceito} className="gap-2">
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Enviar Cadastro
                  </Button>
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={handleSaveLater} className="gap-2 text-muted-foreground mx-auto">
                <Save className="h-4 w-4" /> Salvar e continuar depois
              </Button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
}
