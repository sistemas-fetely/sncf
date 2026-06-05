import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface Parceiro {
  razao_social?: string | null;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  email?: string | null;
  telefone?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  endereco_complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

function LinhaCopiavel({ label, value }: { label: string; value?: string | null }) {
  const [copiado, setCopiado] = useState(false);

  if (!value) return null;

  function copiar() {
    navigator.clipboard.writeText(value!).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1400);
    });
  }

  return (
    <div className="flex justify-between gap-3 text-sm py-1.5 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right flex items-center gap-1.5">
        {value}
        <button
          type="button"
          onClick={copiar}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Copiar"
        >
          {copiado ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </span>
    </div>
  );
}

export function DadosPagadorCard({ parceiro }: { parceiro: Parceiro }) {
  const logradouro = [
    parceiro.logradouro,
    parceiro.numero ? `nº ${parceiro.numero}` : undefined,
    parceiro.endereco_complemento,
  ].filter(Boolean).join(", ");

  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
        Dados para cadastro no banco
      </p>
      <LinhaCopiavel label="Razão social" value={parceiro.razao_social} />
      <LinhaCopiavel label="Nome fantasia" value={parceiro.nome_fantasia} />
      <LinhaCopiavel label="CNPJ" value={parceiro.cnpj} />
      <LinhaCopiavel label="CPF" value={parceiro.cpf} />
      <LinhaCopiavel label="E-mail" value={parceiro.email} />
      <LinhaCopiavel label="Telefone" value={parceiro.telefone} />
      <LinhaCopiavel label="CEP" value={parceiro.cep} />
      <LinhaCopiavel label="Logradouro" value={logradouro || undefined} />
      <LinhaCopiavel label="Bairro" value={parceiro.bairro} />
      <LinhaCopiavel label="Cidade" value={parceiro.cidade} />
      <LinhaCopiavel label="UF" value={parceiro.uf} />
    </div>
  );
}
