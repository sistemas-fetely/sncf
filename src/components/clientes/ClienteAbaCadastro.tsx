/**
 * Cadastro do cliente — leitura, com uma exceção: o papel do parceiro
 * ("Tipo de cadastro", coluna `tipos`) é editável aqui, em multi-seleção.
 * FAIL-LOUD: falha de gravação mostra a mensagem real do banco.
 */
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import {
  TIPOS_PARCEIRO,
  useClienteCadastro,
  useSalvarTiposParceiro,
} from "@/hooks/clientes/useClientePainel";

function Linha({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value || "—"}</span>
    </div>
  );
}

function TipoCadastroCampo({
  parceiroId,
  tipos,
}: {
  parceiroId: string;
  tipos: string[] | null;
}) {
  const { toast } = useToast();
  const salvar = useSalvarTiposParceiro(parceiroId);
  const [selecao, setSelecao] = useState<string[]>(tipos ?? []);

  useEffect(() => {
    setSelecao(tipos ?? []);
  }, [tipos]);

  const original = tipos ?? [];
  const mudou =
    selecao.length !== original.length || selecao.some((t) => !original.includes(t));

  function alternar(valor: string) {
    setSelecao((atual) =>
      atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor],
    );
  }

  async function gravar() {
    try {
      await salvar.mutateAsync(selecao);
      toast({ title: "Tipo de cadastro atualizado" });
    } catch (e) {
      toast({
        title: "Não foi possível gravar o tipo de cadastro",
        description: formatError(e),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">Tipo de cadastro</span>
        {selecao.length === 0 && !mudou && (
          <span className="text-xs text-muted-foreground">Papel não definido</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TIPOS_PARCEIRO.map((t) => {
          const ativo = selecao.includes(t.valor);
          return (
            <button
              key={t.valor}
              type="button"
              onClick={() => alternar(t.valor)}
              disabled={salvar.isPending}
              className="rounded-full disabled:opacity-60"
            >
              <Badge
                variant={ativo ? "default" : "outline"}
                className={cn("cursor-pointer font-normal", !ativo && "text-muted-foreground")}
              >
                {t.rotulo}
              </Badge>
            </button>
          );
        })}
      </div>
      {mudou && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={gravar} disabled={salvar.isPending}>
            {salvar.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            Salvar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelecao(original)}
            disabled={salvar.isPending}
          >
            Cancelar
          </Button>
        </div>
      )}
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
          <TipoCadastroCampo parceiroId={parceiroId} tipos={data.tipos ?? null} />
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
