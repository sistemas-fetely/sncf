import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  dados: Record<string, any>;
  editing: boolean;
  updateField: (key: string, value: any) => void;
}

export function ConviteDadosEmpresaCLT({ dados, editing, updateField }: Props) {
  const renderField = (label: string, key: string, type = "text", placeholder = "") => (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        <Input
          type={type}
          value={dados[key] || ""}
          onChange={(e) => updateField(key, e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <p className="text-sm font-medium">{dados[key] || "—"}</p>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Informações da Empresa</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {renderField("Email Corporativo", "email_corporativo", "email", "colaborador@empresa.com.br")}
          {renderField("Ramal", "ramal", "text", "Ex: 2045")}
          {renderField("Data de Integração", "data_integracao", "date")}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Acessos a sistemas e equipamentos podem ser configurados após a criação do cadastro.
        </p>

        {/* Provisionamento */}
        {dados._convite_dados_contratacao && (
          <div className="mt-6 pt-4 border-t space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Provisionamento (definido na contratação)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Email Corporativo</p>
                <p className="text-sm font-medium">{dados._convite_dados_contratacao.email_corporativo ? dados._convite_dados_contratacao.email_corporativo_formato || "Sim — formato a definir" : "Não solicitado"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Celular Corporativo</p>
                <p className="text-sm font-medium">{dados._convite_dados_contratacao.celular_corporativo ? "Sim — aparelho + linha" : "Não solicitado"}</p>
              </div>
            </div>
            {dados._convite_dados_contratacao.sistemas_ids?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Sistemas</p>
                <div className="flex flex-wrap gap-1.5">
                  {dados._convite_dados_contratacao.sistemas_ids.map((s: string) => (
                    <span key={s} className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {dados._convite_dados_contratacao.equipamentos?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Equipamentos</p>
                <div className="flex flex-wrap gap-1.5">
                  {dados._convite_dados_contratacao.equipamentos.map((eq: any, i: number) => (
                    <span key={i} className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">{eq.quantidade}x {eq.tipo}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
