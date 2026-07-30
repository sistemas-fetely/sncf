import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useResolverCadastro, useCentrosCusto, usePessoas, useSolicitacao,
} from "@/hooks/useReembolso";

interface Props {
  solicitacaoId: string;
  regraCodigo: string;
  campoCadastro: string;
  mensagemResolucao: string | null;
  vinculoId: string;
}

const CAMPOS_CONHECIDOS = [
  "email_corporativo",
  "chave_pix",
  "gestor_pessoa_id",
  "contrato_preve_reembolso",
  "centro_custo_id",
];

export default function ResolverCadastroInline({
  solicitacaoId,
  regraCodigo,
  campoCadastro,
  mensagemResolucao,
  vinculoId,
}: Props) {
  const [texto, setTexto] = useState("");
  const [booleano, setBooleano] = useState(true);
  const resolver = useResolverCadastro();
  const centrosQ = useCentrosCusto();
  const pessoasQ = usePessoas();
  const solicitacaoQ = useSolicitacao(solicitacaoId);
  const pessoaIdDoVinculo = solicitacaoQ.data?.vinculo?.pessoa_id ?? null;

  if (!CAMPOS_CONHECIDOS.includes(campoCadastro)) {
    return (
      <p className="text-xs text-muted-foreground mt-2">
        Esta pendência não tem resolução inline nesta versão.
      </p>
    );
  }

  const valorAtual = campoCadastro === "contrato_preve_reembolso" ? String(booleano) : texto.trim();
  const podeResolver = campoCadastro === "contrato_preve_reembolso" || valorAtual.length > 0;

  async function aoResolver() {
    try {
      const resultado = await resolver.mutateAsync({
        solicitacaoId,
        regraCodigo,
        valor: valorAtual,
      });
      const restantes = resultado?.apontamentos_restantes ?? 0;
      toast.success(
        restantes > 0
          ? `Pendência resolvida. Faltam ${restantes}.`
          : "Pendência resolvida. Não sobrou nenhuma.",
      );
      setTexto("");
    } catch {
      // erro já exibido pelo hook (toast com a mensagem do banco)
    }
  }

  return (
    <div className="mt-3 rounded-md border bg-muted/40 p-3 space-y-2">
      {mensagemResolucao && (
        <p className="text-xs text-muted-foreground">{mensagemResolucao}</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1 space-y-1">
          {campoCadastro === "email_corporativo" && (
            <>
              <Label className="text-xs">E-mail corporativo</Label>
              <Input
                type="email"
                value={texto}
                placeholder="nome@fetely.com.br"
                onChange={(e) => setTexto(e.target.value)}
              />
            </>
          )}

          {campoCadastro === "chave_pix" && (
            <>
              <Label className="text-xs">Chave PIX</Label>
              <Input
                value={texto}
                placeholder="CPF, CNPJ, e-mail, telefone ou aleatória"
                onChange={(e) => setTexto(e.target.value)}
              />
            </>
          )}

          {campoCadastro === "gestor_pessoa_id" && (
            <>
              <Label className="text-xs">Gestor</Label>
              <Select value={texto} onValueChange={setTexto}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o gestor" />
                </SelectTrigger>
                <SelectContent>
                  {(pessoasQ.data ?? [])
                    .filter((p) => p.id !== pessoaIdDoVinculo)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome_completo ?? p.id}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </>
          )}

          {campoCadastro === "centro_custo_id" && (
            <>
              <Label className="text-xs">Centro de custo</Label>
              <Select value={texto} onValueChange={setTexto}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o centro de custo" />
                </SelectTrigger>
                <SelectContent>
                  {(centrosQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.codigo} · {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {campoCadastro === "contrato_preve_reembolso" && (
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={booleano} onCheckedChange={setBooleano} />
              <Label className="text-xs">
                {booleano ? "Contrato prevê reembolso" : "Contrato não prevê reembolso"}
              </Label>
            </div>
          )}
        </div>

        <Button
          size="sm"
          onClick={aoResolver}
          disabled={!podeResolver || resolver.isPending}
          data-vinculo={vinculoId}
        >
          {resolver.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Resolver
        </Button>
      </div>
    </div>
  );
}
