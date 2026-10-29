import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Endereco = Record<string, unknown> | null | undefined;

const g = (e: Endereco, k: string) => {
  const v = e?.[k];
  return v == null ? "" : String(v).trim();
};

function fmtCep(cep: string) {
  const d = cep.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep;
}

/** Monta as linhas do endereço omitindo campos ausentes (sem vírgula/traço sobrando). */
export function linhasEndereco(e: Endereco) {
  const logradouro = g(e, "logradouro");
  const numero = g(e, "numero");
  const complemento = g(e, "complemento");
  const bairro = g(e, "bairro");
  const cidadeUf = [g(e, "cidade"), g(e, "uf")].filter(Boolean).join("/");
  const cep = g(e, "cep") ? fmtCep(g(e, "cep")) : "";
  const l1Base = [logradouro, numero].filter(Boolean).join(", ");
  const l1 = logradouro ? [l1Base, complemento].filter(Boolean).join(" — ") : "";
  const l2 = [bairro, cidadeUf].filter(Boolean).join(" · ");
  return { completo: !!logradouro, l1, l2, cep, cidadeUf };
}

export function EnderecoEntregaBloco({ endereco, titulo = "Endereço" }: { endereco: Endereco; titulo?: string }) {
  const { completo, l1, l2, cep, cidadeUf } = linhasEndereco(endereco);
  const umaLinha = completo
    ? [l1, l2, cep && `CEP ${cep}`].filter(Boolean).join(" · ")
    : [cidadeUf, cep && `CEP ${cep}`].filter(Boolean).join(" · ");
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(umaLinha);
      toast.success("Endereço copiado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível copiar");
    }
  };

  return (
    <div className="space-y-0.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{titulo}</span>
        {umaLinha && (
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={copiar}
            title="Copiar endereço" aria-label="Copiar endereço">
            <Copy className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {!umaLinha ? (
        <p className="text-muted-foreground">—</p>
      ) : completo ? (
        <div className="text-left leading-relaxed">
          {l1 && <p>{l1}</p>}
          {l2 && <p>{l2}</p>}
          {cep && <p className="font-mono">CEP {cep}</p>}
        </div>
      ) : (
        <div className="text-left leading-relaxed">
          <p>
            {[cidadeUf, cep && `CEP ${cep}`].filter(Boolean).join(" · ")}
          </p>
          <span className="text-[10px] text-muted-foreground">endereço incompleto</span>
        </div>
      )}
    </div>
  );
}
