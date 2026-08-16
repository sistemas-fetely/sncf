import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle } from "lucide-react";
import type { DocumentosPJForm } from "@/lib/validations/contrato-pj";

const UF_LIST = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

export function StepDocumentosPJ() {
  const { register, setValue, watch } = useFormContext<DocumentosPJForm>();
  const contratoAssinado = watch("contrato_assinado");

  return (
    <div className="space-y-6">
      {/* Status do Contrato */}
      <div>
        <h3 className="text-lg font-medium mb-4">Contrato de Trabalho</h3>
        <div className="border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {contratoAssinado ? (
                <CheckCircle className="h-5 w-5 text-success" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-warning" />
              )}
              <div>
                <p className="font-medium text-sm">Status do Contrato</p>
                <p className="text-xs text-muted-foreground">
                  {contratoAssinado
                    ? "Contrato assinado e vigente"
                    : "Contrato pendente de assinatura — será exibido nas tarefas pendentes do Dashboard"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={contratoAssinado}
                onCheckedChange={(v) => setValue("contrato_assinado", v)}
              />
              <Badge variant={contratoAssinado ? "default" : "secondary"}>
                {contratoAssinado ? "Assinado" : "Pendente"}
              </Badge>
            </div>
          </div>

          <div>
            <Label htmlFor="objeto">Objeto do Contrato</Label>
            <Textarea id="objeto" {...register("objeto")} placeholder="Descrição do escopo dos serviços..." rows={3} />
          </div>
          <div>
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" {...register("observacoes")} rows={2} />
          </div>
        </div>
      </div>

      {/* Título de Eleitor */}
      <div>
        <h3 className="text-lg font-medium mb-4">Título de Eleitor</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="titulo_eleitor">Número do Título</Label>
            <Input id="titulo_eleitor" {...register("titulo_eleitor")} />
          </div>
          <div>
            <Label htmlFor="zona_eleitoral">Zona Eleitoral</Label>
            <Input id="zona_eleitoral" {...register("zona_eleitoral")} />
          </div>
          <div>
            <Label htmlFor="secao_eleitoral">Seção Eleitoral</Label>
            <Input id="secao_eleitoral" {...register("secao_eleitoral")} />
          </div>
        </div>
      </div>

      {/* CNH */}
      <div>
        <h3 className="text-lg font-medium mb-4">CNH</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="cnh_numero">Número da CNH</Label>
            <Input id="cnh_numero" {...register("cnh_numero")} />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={watch("cnh_categoria") || ""} onValueChange={(v) => setValue("cnh_categoria", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {["A", "B", "AB", "C", "D", "E"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="cnh_validade">Validade</Label>
            <Input id="cnh_validade" type="date" {...register("cnh_validade")} />
          </div>
        </div>
      </div>

      {/* Certificado de Reservista */}
      <div>
        <h3 className="text-lg font-medium mb-4">Certificado de Reservista</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="certificado_reservista">Número do Certificado</Label>
            <Input id="certificado_reservista" {...register("certificado_reservista")} />
          </div>
        </div>
      </div>
    </div>
  );
}
