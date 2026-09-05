/** Cadastro do cliente — somente leitura. */
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useClienteCadastro } from "@/hooks/clientes/useClientePainel";

function Linha({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value || "—"}</span>
    </div>
  );
}

export function ClienteAbaCadastro({ parceiroId }: { parceiroId: string }) {
  const { data, isLoading, isError, error } = useClienteCadastro(parceiroId);

  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" /> carregando
      </p>
    );
  }

  if (isError) {
    return (
      <p className="text-xs text-destructive">
        {(error as any)?.message ?? "Falha ao carregar o cadastro."}
      </p>
    );
  }

  if (!data) return <p className="text-xs text-muted-foreground">Cliente não encontrado.</p>;

  const endereco =
    [data.logradouro, data.numero, data.bairro].filter(Boolean).join(", ") +
    ([data.cidade, data.uf].filter(Boolean).length
      ? ` — ${[data.cidade, data.uf].filter(Boolean).join("/")}`
      : "") +
    (data.cep ? ` · CEP ${data.cep}` : "");

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Identificação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Linha label="Razão social" value={data.razao_social} />
          <Linha label="Nome fantasia" value={data.nome_fantasia} />
          <Linha label="CNPJ" value={data.cnpj} />
          <Linha label="CPF" value={data.cpf} />
          <Linha
            label="Inscrição estadual"
            value={data.isento_ie ? "Isento" : data.inscricao_estadual}
          />
          <Linha label="Situação" value={data.ativo === false ? "Inativo" : "Ativo"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Contato e endereço</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Linha label="Telefone" value={data.telefone} />
          <Linha label="E-mail" value={data.email} />
          <Linha label="Endereço" value={endereco.trim() || null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Comercial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Linha label="Programa de parceiros" value={data.nivel_programa} />
          <Linha label="Perfil de crédito" value={data.perfil_credito} />
        </CardContent>
      </Card>
    </div>
  );
}
