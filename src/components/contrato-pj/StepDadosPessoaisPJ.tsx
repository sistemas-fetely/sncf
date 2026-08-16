import { useFormContext } from "react-hook-form";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";
import { fetchCep } from "@/lib/viacep";
import { FotoUpload } from "@/components/FotoUpload";
import type { DadosPessoaisPJForm } from "@/lib/validations/contrato-pj";

function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatTelefone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.replace(/^(\d{0,2})/, "($1");
  if (digits.length <= 6) return digits.replace(/^(\d{2})(\d{0,4})/, "($1) $2");
  if (digits.length <= 10) return digits.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  return digits.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

const UF_LIST = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

export function StepDadosPessoaisPJ() {
  const { register, formState: { errors }, setValue, watch } = useFormContext<DadosPessoaisPJForm>();
  const [loadingCep, setLoadingCep] = useState(false);

  const handleCNPJChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCNPJ(e.target.value);
    setValue("cnpj", formatted, { shouldValidate: true });
  };

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
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Dados Pessoais do Prestador</h3>
        <div className="flex flex-col md:flex-row gap-6 mb-4">
          <FotoUpload
            value={watch("foto_url")}
            onChange={(url) => setValue("foto_url", url || "")}
            folder="fotos-pj"
          />
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="md:col-span-2 lg:col-span-3">
            <Label htmlFor="contato_nome">Nome Completo *</Label>
            <Input id="contato_nome" {...register("contato_nome")} placeholder="Nome do responsável" />
            {errors.contato_nome && <p className="text-xs text-destructive mt-1">{errors.contato_nome.message}</p>}
          </div>
          <div>
            <Label htmlFor="cpf">CPF</Label>
            <Input id="cpf" {...register("cpf")} placeholder="000.000.000-00" />
          </div>
          <div>
            <Label htmlFor="rg">RG</Label>
            <Input id="rg" {...register("rg")} placeholder="Número do RG" />
          </div>
          <div>
            <Label htmlFor="orgao_emissor">Órgão Emissor</Label>
            <Input id="orgao_emissor" {...register("orgao_emissor")} placeholder="SSP/SP" />
          </div>
          <div>
            <Label htmlFor="data_nascimento">Data de Nascimento</Label>
            <Input id="data_nascimento" type="date" {...register("data_nascimento")} />
          </div>
          <div>
            <Label>Gênero</Label>
            <Select value={watch("genero") || ""} onValueChange={(v) => setValue("genero", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="masculino">Masculino</SelectItem>
                <SelectItem value="feminino">Feminino</SelectItem>
                <SelectItem value="nao_binario">Não-binário</SelectItem>
                <SelectItem value="prefiro_nao_informar">Prefiro não informar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Estado Civil</Label>
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
          </div>
          <div>
            <Label htmlFor="nacionalidade">Nacionalidade</Label>
            <Input id="nacionalidade" {...register("nacionalidade")} />
          </div>
          <div>
            <Label>Etnia</Label>
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
          </div>
          <div>
            <Label htmlFor="nome_mae">Nome da Mãe</Label>
            <Input id="nome_mae" {...register("nome_mae")} />
          </div>
          <div>
            <Label htmlFor="nome_pai">Nome do Pai</Label>
            <Input id="nome_pai" {...register("nome_pai")} />
          </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4">Endereço</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="cep">CEP</Label>
            <div className="flex gap-2">
              <Input id="cep" {...register("cep")} placeholder="00000-000" />
              <Button type="button" variant="outline" size="icon" onClick={handleCepSearch} disabled={loadingCep}>
                {loadingCep ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="lg:col-span-2">
            <Label htmlFor="logradouro">Logradouro</Label>
            <Input id="logradouro" {...register("logradouro")} />
          </div>
          <div>
            <Label htmlFor="numero">Número</Label>
            <Input id="numero" {...register("numero")} />
          </div>
          <div>
            <Label htmlFor="complemento">Complemento</Label>
            <Input id="complemento" {...register("complemento")} />
          </div>
          <div>
            <Label htmlFor="bairro">Bairro</Label>
            <Input id="bairro" {...register("bairro")} />
          </div>
          <div>
            <Label htmlFor="cidade">Cidade</Label>
            <Input id="cidade" {...register("cidade")} />
          </div>
          <div>
            <Label>UF</Label>
            <Select value={watch("uf") || ""} onValueChange={(v) => setValue("uf", v)}>
              <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>
                {UF_LIST.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-4">
          <h3 className="text-lg font-medium">Contato</h3>
          <p className="text-xs text-muted-foreground mt-1">
            <strong>Email:</strong> contato oficial do CNPJ (para NFs, cobranças).{" "}
            <strong>Email Pessoal:</strong> privado, para contato humano e backup.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="contato_telefone">Telefone</Label>
            <Input
              id="contato_telefone"
              value={watch("contato_telefone") || ""}
              onChange={(e) => setValue("contato_telefone", formatTelefone(e.target.value), { shouldValidate: true })}
              placeholder="(00) 00000-0000"
              maxLength={15}
              inputMode="tel"
            />
          </div>
          <div>
            <Label htmlFor="contato_email">Email</Label>
            <Input id="contato_email" type="email" {...register("contato_email")} placeholder="email@empresa.com" />
            {errors.contato_email && <p className="text-xs text-destructive mt-1">{errors.contato_email.message}</p>}
          </div>
          <div>
            <Label htmlFor="email_pessoal">Email Pessoal</Label>
            <Input id="email_pessoal" type="email" {...register("email_pessoal")} placeholder="email@pessoal.com" />
          </div>
          <div>
            <Label htmlFor="telefone">Telefone Pessoal</Label>
            <Input
              id="telefone"
              value={watch("telefone") || ""}
              onChange={(e) => setValue("telefone", formatTelefone(e.target.value), { shouldValidate: true })}
              placeholder="(00) 00000-0000"
              maxLength={15}
              inputMode="tel"
            />
          </div>
          <div>
            <Label htmlFor="contato_emergencia_nome">Contato de Emergência</Label>
            <Input id="contato_emergencia_nome" {...register("contato_emergencia_nome")} placeholder="Nome" />
          </div>
          <div>
            <Label htmlFor="contato_emergencia_telefone">Telefone Emergência</Label>
            <Input
              id="contato_emergencia_telefone"
              value={watch("contato_emergencia_telefone") || ""}
              onChange={(e) => setValue("contato_emergencia_telefone", formatTelefone(e.target.value), { shouldValidate: true })}
              placeholder="(00) 00000-0000"
              maxLength={15}
              inputMode="tel"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4">Dados da Empresa</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="cnpj">CNPJ *</Label>
            <Input
              id="cnpj"
              value={watch("cnpj") || ""}
              onChange={handleCNPJChange}
              placeholder="00.000.000/0000-00"
              maxLength={18}
            />
            {errors.cnpj && <p className="text-xs text-destructive mt-1">{errors.cnpj.message}</p>}
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="razao_social">Razão Social *</Label>
            <Input id="razao_social" {...register("razao_social")} />
            {errors.razao_social && <p className="text-xs text-destructive mt-1">{errors.razao_social.message}</p>}
          </div>
          <div>
            <Label htmlFor="nome_fantasia">Nome Fantasia</Label>
            <Input id="nome_fantasia" {...register("nome_fantasia")} />
          </div>
          <div>
            <Label htmlFor="inscricao_municipal">Inscrição Municipal</Label>
            <Input id="inscricao_municipal" {...register("inscricao_municipal")} />
          </div>
          <div>
            <Label htmlFor="inscricao_estadual">Inscrição Estadual</Label>
            <Input id="inscricao_estadual" {...register("inscricao_estadual")} />
          </div>
        </div>
      </div>
    </div>
  );
}
