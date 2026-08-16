import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  dados: Record<string, any>;
  editing: boolean;
  updateField: (key: string, value: any) => void;
}

const UF_LIST = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

export function ConviteDadosPessoaisPJ({ dados, editing, updateField }: Props) {
  const Field = ({ label, value }: { label: string; value: any }) => (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );

  if (!editing) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Dados Pessoais</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Identificação</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3"><Field label="Nome Completo" value={dados.contato_nome} /></div>
              <Field label="CPF" value={dados.cpf} />
              <Field label="RG" value={dados.rg} />
              <Field label="Órgão Emissor" value={dados.orgao_emissor} />
              <Field label="Data de Nascimento" value={dados.data_nascimento} />
              <Field label="Gênero" value={dados.genero} />
              <Field label="Estado Civil" value={dados.estado_civil} />
              <Field label="Nacionalidade" value={dados.nacionalidade} />
              <Field label="Etnia" value={dados.etnia} />
              <Field label="Nome da Mãe" value={dados.nome_mae} />
              <Field label="Nome do Pai" value={dados.nome_pai} />
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Endereço</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="CEP" value={dados.cep} />
              <div className="md:col-span-2"><Field label="Logradouro" value={dados.logradouro} /></div>
              <Field label="Número" value={dados.numero} />
              <Field label="Complemento" value={dados.complemento} />
              <Field label="Bairro" value={dados.bairro} />
              <Field label="Cidade" value={dados.cidade} />
              <Field label="UF" value={dados.uf} />
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Contato</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Telefone" value={dados.contato_telefone || dados.telefone} />
              <Field label="Email" value={dados.contato_email} />
              <Field label="Email Pessoal" value={dados.email_pessoal} />
              <Field label="Contato Emergência" value={dados.contato_emergencia_nome} />
              <Field label="Telefone Emergência" value={dados.contato_emergencia_telefone} />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Dados Pessoais</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Identificação</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2 lg:col-span-3">
              <Label className="text-xs text-muted-foreground">Nome Completo *</Label>
              <Input className="h-9" value={dados.contato_nome || ""} onChange={(e) => updateField("contato_nome", e.target.value)} placeholder="Nome do responsável" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">CPF</Label>
              <Input className="h-9" value={dados.cpf || ""} onChange={(e) => updateField("cpf", e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">RG</Label>
              <Input className="h-9" value={dados.rg || ""} onChange={(e) => updateField("rg", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Órgão Emissor</Label>
              <Input className="h-9" value={dados.orgao_emissor || ""} onChange={(e) => updateField("orgao_emissor", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Data de Nascimento</Label>
              <Input className="h-9" type="date" value={dados.data_nascimento || ""} onChange={(e) => updateField("data_nascimento", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Gênero</Label>
              <Select value={dados.genero || ""} onValueChange={(v) => updateField("genero", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="feminino">Feminino</SelectItem>
                  <SelectItem value="nao_binario">Não-binário</SelectItem>
                  <SelectItem value="prefiro_nao_informar">Prefiro não informar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Estado Civil</Label>
              <Select value={dados.estado_civil || ""} onValueChange={(v) => updateField("estado_civil", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
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
              <Label className="text-xs text-muted-foreground">Nacionalidade</Label>
              <Input className="h-9" value={dados.nacionalidade || ""} onChange={(e) => updateField("nacionalidade", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Etnia</Label>
              <Select value={dados.etnia || ""} onValueChange={(v) => updateField("etnia", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
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
              <Label className="text-xs text-muted-foreground">Nome da Mãe</Label>
              <Input className="h-9" value={dados.nome_mae || ""} onChange={(e) => updateField("nome_mae", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Nome do Pai</Label>
              <Input className="h-9" value={dados.nome_pai || ""} onChange={(e) => updateField("nome_pai", e.target.value)} />
            </div>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Endereço</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">CEP</Label>
              <Input className="h-9" value={dados.cep || ""} onChange={(e) => updateField("cep", e.target.value)} placeholder="00000-000" />
            </div>
            <div className="lg:col-span-2">
              <Label className="text-xs text-muted-foreground">Logradouro</Label>
              <Input className="h-9" value={dados.logradouro || ""} onChange={(e) => updateField("logradouro", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Número</Label>
              <Input className="h-9" value={dados.numero || ""} onChange={(e) => updateField("numero", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Complemento</Label>
              <Input className="h-9" value={dados.complemento || ""} onChange={(e) => updateField("complemento", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Bairro</Label>
              <Input className="h-9" value={dados.bairro || ""} onChange={(e) => updateField("bairro", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Cidade</Label>
              <Input className="h-9" value={dados.cidade || ""} onChange={(e) => updateField("cidade", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">UF</Label>
              <Select value={dados.uf || ""} onValueChange={(v) => updateField("uf", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  {UF_LIST.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Contato</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Telefone</Label>
              <Input className="h-9" value={dados.contato_telefone || ""} onChange={(e) => updateField("contato_telefone", e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input className="h-9" type="email" value={dados.contato_email || ""} onChange={(e) => updateField("contato_email", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Email Pessoal</Label>
              <Input className="h-9" type="email" value={dados.email_pessoal || ""} onChange={(e) => updateField("email_pessoal", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Telefone Pessoal</Label>
              <Input className="h-9" value={dados.telefone || ""} onChange={(e) => updateField("telefone", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Contato Emergência</Label>
              <Input className="h-9" value={dados.contato_emergencia_nome || ""} onChange={(e) => updateField("contato_emergencia_nome", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Telefone Emergência</Label>
              <Input className="h-9" value={dados.contato_emergencia_telefone || ""} onChange={(e) => updateField("contato_emergencia_telefone", e.target.value)} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
