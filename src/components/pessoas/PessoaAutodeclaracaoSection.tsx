import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const LEGENDA_AUTODECLARACAO =
  "Autodeclaração — preencher apenas com o que a pessoa informou. Não preencher por dedução.";

// Valores EXATOS — o banco tem CHECK em pcd_tipo e tamanho_camiseta.
export const ETNIAS = ["Branca", "Preta", "Parda", "Amarela", "Indígena", "Prefiro não informar"] as const;
export const PCD_TIPOS = ["Não", "Física", "Auditiva", "Visual", "Intelectual", "Múltipla", "Reabilitado INSS"] as const;
export const TAMANHOS_CAMISETA = ["PP", "P", "M", "G", "GG", "XGG"] as const;

interface Props {
  etnia: string;
  pcdTipo: string;
  tamanhoCamiseta: string;
  onChange: (patch: { etnia?: string; pcd_tipo?: string; tamanho_camiseta?: string }) => void;
}

export default function PessoaAutodeclaracaoSection({ etnia, pcdTipo, tamanhoCamiseta, onChange }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle>Autodeclaração e uniforme</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Cor / raça</Label>
          <Select value={etnia} onValueChange={(v) => onChange({ etnia: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {ETNIAS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">{LEGENDA_AUTODECLARACAO}</p>
        </div>

        <div>
          <Label>Pessoa com deficiência</Label>
          <Select value={pcdTipo} onValueChange={(v) => onChange({ pcd_tipo: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {PCD_TIPOS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">{LEGENDA_AUTODECLARACAO}</p>
        </div>

        <div>
          <Label>Tamanho de camiseta</Label>
          <Select value={tamanhoCamiseta} onValueChange={(v) => onChange({ tamanho_camiseta: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {TAMANHOS_CAMISETA.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
