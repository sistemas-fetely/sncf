import { useFormContext } from "react-hook-form";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";
import { fetchCep } from "@/lib/viacep";
import { FotoUpload } from "@/components/FotoUpload";
import type { DadosPessoaisForm } from "@/lib/validations/colaborador-clt";

const UF_LIST = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

export function StepDadosPessoais() {
  const { register, setValue, formState: { errors }, watch } = useFormContext<DadosPessoaisForm>();
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
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Informações Pessoais</h3>
        <div className="flex flex-col md:flex-row gap-6 mb-4">
          <FotoUpload
            value={watch("foto_url")}
            onChange={(url) => setValue("foto_url", url || "")}
            folder="fotos-clt"
          />
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="md:col-span-2 lg:col-span-3">
            <Label htmlFor="nome_completo">Nome Completo *</Label>
            <Input id="nome_completo" {...register("nome_completo")} placeholder="Nome completo do colaborador" />
            {errors.nome_completo && <p className="text-xs text-destructive mt-1">{errors.nome_completo.message}</p>}
          </div>
          <div>
            <Label htmlFor="cpf">CPF *</Label>
            <Input id="cpf" {...register("cpf")} placeholder="000.000.000-00" />
            {errors.cpf && <p className="text-xs text-destructive mt-1">{errors.cpf.message}</p>}
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
            <Label htmlFor="data_nascimento">Data de Nascimento *</Label>
            <Input id="data_nascimento" type="date" {...register("data_nascimento")} />
            {errors.data_nascimento && <p className="text-xs text-destructive mt-1">{errors.data_nascimento.message}</p>}
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
            {errors.cep && <p className="text-xs text-destructive mt-1">{errors.cep.message}</p>}
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
          <h3 className="text-lg font-medium">Dados pessoais de contato</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Uso privado — para contato pessoal, emergências e comunicações não oficiais.
            Estes dados <strong>não</strong> são usados para acesso ao sistema.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="telefone">Telefone</Label>
            <Input id="telefone" {...register("telefone")} placeholder="(00) 00000-0000" />
          </div>
          <div>
            <Label htmlFor="email_pessoal">Email Pessoal</Label>
            <Input id="email_pessoal" type="email" {...register("email_pessoal")} placeholder="email@pessoal.com" />
            {errors.email_pessoal && <p className="text-xs text-destructive mt-1">{errors.email_pessoal.message}</p>}
          </div>
          <div>
            <Label htmlFor="contato_emergencia_nome">Contato de Emergência</Label>
            <Input id="contato_emergencia_nome" {...register("contato_emergencia_nome")} placeholder="Nome" />
          </div>
          <div>
            <Label htmlFor="contato_emergencia_telefone">Telefone Emergência</Label>
            <Input id="contato_emergencia_telefone" {...register("contato_emergencia_telefone")} placeholder="(00) 00000-0000" />
          </div>
        </div>
      </div>
    </div>
  );
}
