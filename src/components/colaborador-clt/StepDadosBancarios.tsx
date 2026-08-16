import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DadosBancariosForm } from "@/lib/validations/colaborador-clt";

const bancos = [
  { codigo: "001", nome: "Banco do Brasil" },
  { codigo: "033", nome: "Santander" },
  { codigo: "104", nome: "Caixa Econômica" },
  { codigo: "237", nome: "Bradesco" },
  { codigo: "341", nome: "Itaú Unibanco" },
  { codigo: "356", nome: "Banco Real" },
  { codigo: "389", nome: "Mercantil do Brasil" },
  { codigo: "399", nome: "HSBC" },
  { codigo: "422", nome: "Safra" },
  { codigo: "745", nome: "Citibank" },
  { codigo: "756", nome: "Sicoob" },
  { codigo: "077", nome: "Inter" },
  { codigo: "260", nome: "Nubank" },
  { codigo: "290", nome: "PagSeguro" },
  { codigo: "380", nome: "PicPay" },
  { codigo: "336", nome: "C6 Bank" },
];

export function StepDadosBancarios() {
  const { register, setValue, watch } = useFormContext<DadosBancariosForm>();

  const handleBancoChange = (codigo: string) => {
    const banco = bancos.find(b => b.codigo === codigo);
    setValue("banco_codigo", codigo);
    setValue("banco_nome", banco?.nome || "");
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium mb-4">Dados Bancários</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <Label>Banco</Label>
          <Select value={watch("banco_codigo") || ""} onValueChange={handleBancoChange}>
            <SelectTrigger><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
            <SelectContent>
              {bancos.map(b => (
                <SelectItem key={b.codigo} value={b.codigo}>{b.codigo} - {b.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="agencia">Agência</Label>
          <Input id="agencia" {...register("agencia")} placeholder="0000" />
        </div>
        <div>
          <Label htmlFor="conta">Conta</Label>
          <Input id="conta" {...register("conta")} placeholder="00000-0" />
        </div>
        <div>
          <Label>Tipo de Conta</Label>
          <Select value={watch("tipo_conta") || "corrente"} onValueChange={(v) => setValue("tipo_conta", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="corrente">Conta Corrente</SelectItem>
              <SelectItem value="poupanca">Conta Poupança</SelectItem>
              <SelectItem value="salario">Conta Salário</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="chave_pix">Chave PIX</Label>
          <Input id="chave_pix" {...register("chave_pix")} placeholder="CPF, email, telefone ou chave aleatória" />
        </div>
      </div>
    </div>
  );
}
