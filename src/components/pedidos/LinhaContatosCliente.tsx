import { Phone, Wallet, Copy } from "lucide-react";
import { toast } from "sonner";

/**
 * Linha de contatos do cliente no cabeçalho do pedido.
 * DOUTRINA VAZIO-NAO-RENDERIZA: slot sem valor não vira rótulo nem traço.
 * `contatos.financeiro` está vazio em quase toda a base — a ausência é silenciosa.
 */

type Contatos = {
  contato?: { nome?: string | null; email?: string | null; telefone?: string | null; whatsapp?: string | null } | null;
  financeiro?: { nome?: string | null; email?: string | null; telefone?: string | null } | null;
} | null;

const primeiroNaoVazio = (...vals: (string | null | undefined)[]) => {
  for (const v of vals) {
    const s = (v ?? "").trim();
    if (s) return s;
  }
  return null;
};

const formatarTelefone = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
};

function Slot({
  rotulo,
  icone,
  valor,
  valorCompleto,
  tipo,
}: {
  rotulo: string;
  icone: React.ReactNode;
  valor: string;
  valorCompleto: string;
  tipo: "tel" | "email";
}) {
  const digitos = valor.replace(/\D/g, "");
  const href = tipo === "tel" ? `tel:${digitos}` : `mailto:${valor}`;
  const exibido = tipo === "tel" ? formatarTelefone(valor) : valor;

  return (
    <span className="group inline-flex items-center gap-1.5" title={valorCompleto}>
      {icone}
      <span className="text-[13px] text-muted-foreground">{rotulo}</span>
      <a href={href} className="text-[13px] text-foreground hover:text-primary">
        {exibido}
      </a>
      <button
        type="button"
        aria-label={`Copiar ${rotulo}`}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        onClick={() => {
          navigator.clipboard.writeText(valor);
          toast("Copiado");
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export function LinhaContatosCliente({
  telefone,
  email,
  email_cobranca,
  contatos,
}: {
  telefone?: string | null;
  email?: string | null;
  email_cobranca?: string | null;
  contatos?: Contatos | unknown;
}) {
  const c = (contatos ?? null) as Contatos;

  const comercialRaw = primeiroNaoVazio(c?.contato?.telefone, telefone);
  const cobrancaRaw = primeiroNaoVazio(c?.financeiro?.telefone, c?.financeiro?.email, email_cobranca, email);
  const cobrancaEhTelefone = !!primeiroNaoVazio(c?.financeiro?.telefone);

  if (!comercialRaw && !cobrancaRaw) return null;

  // Alguns registros têm dois números em " / " — exibe o primeiro, guarda tudo no title.
  const primeiroValor = (s: string) => s.split("/")[0].trim();

  return (
    <>
      <div className="border-t border-border/50 my-3" />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
        {comercialRaw && (
          <Slot
            rotulo="Comercial"
            icone={<Phone className="h-3.5 w-3.5 text-muted-foreground" />}
            valor={primeiroValor(comercialRaw)}
            valorCompleto={comercialRaw}
            tipo="tel"
          />
        )}
        {cobrancaRaw && (
          <Slot
            rotulo="Cobrança"
            icone={<Wallet className="h-3.5 w-3.5 text-muted-foreground" />}
            valor={cobrancaEhTelefone ? primeiroValor(cobrancaRaw) : cobrancaRaw}
            valorCompleto={cobrancaRaw}
            tipo={cobrancaEhTelefone ? "tel" : "email"}
          />
        )}
      </div>
    </>
  );
}
