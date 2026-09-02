import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Valores EXATOS — o banco tem CHECK em pj_regime_tributario.
export const REGIMES_TRIBUTARIOS = ["MEI", "Simples Nacional", "Lucro Presumido", "Lucro Real"] as const;

function mascaraCpf(v: string) {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

interface Props {
  regimeTributario: string;
  municipioNfse: string;
  emiteNfse: boolean;
  representanteNome: string;
  representanteCpf: string;
  onChange: (patch: {
    pj_regime_tributario?: string;
    pj_municipio_nfse?: string;
    pj_emite_nfse?: boolean;
    pj_representante_nome?: string;
    pj_representante_cpf?: string;
  }) => void;
}

export default function VinculoPJCadastroSection({
  regimeTributario, municipioNfse, emiteNfse, representanteNome, representanteCpf, onChange,
}: Props) {
  return (
    <div className="border-t pt-4">
      <h3 className="font-medium text-sm mb-3">Fiscal e representação (PJ)</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Regime tributário</Label>
          <Select value={regimeTributario} onValueChange={(v) => onChange({ pj_regime_tributario: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {REGIMES_TRIBUTARIOS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Município de emissão da NFS-e</Label>
          <Input value={municipioNfse} onChange={(e) => onChange({ pj_municipio_nfse: e.target.value })} />
        </div>

        <div>
          <Label className="mb-2 block">Emite NFS-e no município</Label>
          <div className="flex items-center gap-2">
            <Switch checked={emiteNfse} onCheckedChange={(v) => onChange({ pj_emite_nfse: v })} />
            <span className="text-sm">{emiteNfse ? "Sim" : "Não"}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Sem isso não há como pagar.</p>
        </div>

        <div className="md:col-span-2">
          <Label>Representante legal — nome</Label>
          <Input value={representanteNome} onChange={(e) => onChange({ pj_representante_nome: e.target.value })} />
        </div>

        <div>
          <Label>Representante legal — CPF</Label>
          <Input
            value={representanteCpf}
            onChange={(e) => onChange({ pj_representante_cpf: mascaraCpf(e.target.value) })}
            placeholder="000.000.000-00"
          />
        </div>
      </div>
    </div>
  );
}
