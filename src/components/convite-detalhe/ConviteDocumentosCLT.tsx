import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UF_LIST } from "./constants";

interface Props {
  dados: Record<string, any>;
  editing: boolean;
  updateField: (key: string, value: any) => void;
}

export function ConviteDocumentosCLT({ dados, editing, updateField }: Props) {
  const Field = ({ label, value }: { label: string; value: any }) => (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );

  if (!editing) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Documentos</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">PIS/PASEP e CTPS</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="PIS/PASEP" value={dados.pis_pasep} />
              <Field label="CTPS Número" value={dados.ctps_numero} />
              <Field label="CTPS Série" value={dados.ctps_serie} />
              <Field label="CTPS UF" value={dados.ctps_uf} />
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Título de Eleitor</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Número do Título" value={dados.titulo_eleitor} />
              <Field label="Zona Eleitoral" value={dados.zona_eleitoral} />
              <Field label="Seção Eleitoral" value={dados.secao_eleitoral} />
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">CNH</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Número da CNH" value={dados.cnh_numero} />
              <Field label="Categoria" value={dados.cnh_categoria} />
              <Field label="Validade" value={dados.cnh_validade} />
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Certificado de Reservista</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Número do Certificado" value={dados.certificado_reservista} />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Documentos</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">PIS/PASEP e CTPS</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">PIS/PASEP</Label>
              <Input className="h-9" value={dados.pis_pasep || ""} onChange={(e) => updateField("pis_pasep", e.target.value)} placeholder="000.00000.00-0" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">CTPS Número</Label>
              <Input className="h-9" value={dados.ctps_numero || ""} onChange={(e) => updateField("ctps_numero", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">CTPS Série</Label>
              <Input className="h-9" value={dados.ctps_serie || ""} onChange={(e) => updateField("ctps_serie", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">CTPS UF</Label>
              <Select value={dados.ctps_uf || ""} onValueChange={(v) => updateField("ctps_uf", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>{UF_LIST.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Título de Eleitor</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Número do Título</Label>
              <Input className="h-9" value={dados.titulo_eleitor || ""} onChange={(e) => updateField("titulo_eleitor", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Zona Eleitoral</Label>
              <Input className="h-9" value={dados.zona_eleitoral || ""} onChange={(e) => updateField("zona_eleitoral", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Seção Eleitoral</Label>
              <Input className="h-9" value={dados.secao_eleitoral || ""} onChange={(e) => updateField("secao_eleitoral", e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">CNH</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Número da CNH</Label>
              <Input className="h-9" value={dados.cnh_numero || ""} onChange={(e) => updateField("cnh_numero", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Categoria</Label>
              <Select value={dados.cnh_categoria || ""} onValueChange={(v) => updateField("cnh_categoria", v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {["A", "B", "AB", "C", "D", "E"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Validade</Label>
              <Input type="date" className="h-9" value={dados.cnh_validade || ""} onChange={(e) => updateField("cnh_validade", e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Certificado de Reservista</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Número do Certificado</Label>
              <Input className="h-9" value={dados.certificado_reservista || ""} onChange={(e) => updateField("certificado_reservista", e.target.value)} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
