import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DocumentosForm } from "@/lib/validations/colaborador-clt";

const UF_LIST = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

export function StepDocumentos() {
  const { register, setValue, watch } = useFormContext<DocumentosForm>();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">PIS/PASEP e CTPS</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="pis_pasep">PIS/PASEP</Label>
            <Input id="pis_pasep" {...register("pis_pasep")} placeholder="000.00000.00-0" />
          </div>
          <div>
            <Label htmlFor="ctps_numero">CTPS Número</Label>
            <Input id="ctps_numero" {...register("ctps_numero")} />
          </div>
          <div>
            <Label htmlFor="ctps_serie">CTPS Série</Label>
            <Input id="ctps_serie" {...register("ctps_serie")} />
          </div>
          <div>
            <Label>CTPS UF</Label>
            <Select value={watch("ctps_uf") || ""} onValueChange={(v) => setValue("ctps_uf", v)}>
              <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>
                {UF_LIST.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

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
