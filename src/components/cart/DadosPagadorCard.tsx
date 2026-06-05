import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { OrderMeta } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Campo {
  label: string;
  value: string | undefined;
}

function CampoCopiavel({ label, value }: Campo) {
  const [copiado, setCopiado] = useState(false);

  if (!value) return null;

  function copiar() {
    navigator.clipboard.writeText(value!).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/50 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value}</p>
      </div>
      <button
        type="button"
        onClick={copiar}
        className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        title={copiado ? "Copiado" : "Copiar"}
      >
        {copiado ? (
          <>
            <Check className="h-3.5 w-3.5" />
            <span>Copiado</span>
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            <span>Copiar</span>
          </>
        )}
      </button>
    </div>
  );
}

interface Props {
  meta: OrderMeta;
}

export function DadosPagadorCard({ meta }: Props) {
  const enderecoCompleto = [
    meta.logradouro,
    meta.numero ? `nº ${meta.numero}` : undefined,
    meta.complemento,
    meta.bairro,
  ]
    .filter(Boolean)
    .join(", ");

  const campos: Campo[] = [
    { label: "Razão Social / Nome", value: meta.cliente },
    { label: "Nome Fantasia", value: meta.nomeFantasia },
    { label: "CNPJ / CPF", value: meta.cnpj },
    { label: "E-mail", value: meta.email },
    { label: "Telefone / Celular", value: meta.telefone },
    { label: "CEP", value: meta.cep },
    { label: "Logradouro e número", value: enderecoCompleto || undefined },
    { label: "Bairro", value: meta.bairro },
    { label: "Cidade", value: meta.municipio },
    { label: "Estado (UF)", value: meta.uf },
  ];

  const camposVisiveis = campos.filter((c) => !!c.value);

  if (camposVisiveis.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Dados do pagador — para cadastro no banco
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        {camposVisiveis.map((c) => (
          <CampoCopiavel key={c.label} label={c.label} value={c.value} />
        ))}
      </CardContent>
    </Card>
  );
}
