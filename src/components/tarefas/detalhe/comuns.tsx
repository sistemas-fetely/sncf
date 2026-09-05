import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePessoasSistema } from "@/hooks/tarefas/useTarefasCatalogos";
import { rotuloStatus, useStatusTarefaDim } from "@/hooks/tarefas/useStatusTarefaDim";

export const SEM_VALOR = "__nenhum__";

/**
 * Rótulo de status SEMPRE da dimensão `tarefa_status_dim`. Enquanto carrega,
 * devolve o próprio código — nunca uma lista fixa de status no front.
 */
export function useStatusRotulo(): (codigo: string) => string {
  const { data } = useStatusTarefaDim();
  return (codigo: string) => rotuloStatus(data, codigo);
}


export const PRIORIDADE_ROTULO: Record<string, string> = {
  baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente",
};

export function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </span>
      {children}
    </div>
  );
}

export function Secao({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Nome de pessoa sempre via v_pessoas_sistema. */
export function useNomePessoa() {
  const { data: pessoas } = usePessoasSistema();
  return (id: string | null | undefined) =>
    (id && pessoas?.find((p) => p.id === id)?.nome) || (id ? "Pessoa fora do catálogo" : "—");
}

interface SeletorPessoaProps {
  valor: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  permiteVazio?: boolean;
  disabled?: boolean;
}

export function SeletorPessoa({
  valor, onChange, placeholder = "Escolher pessoa", permiteVazio = true, disabled,
}: SeletorPessoaProps) {
  const { data: pessoas } = usePessoasSistema();
  return (
    <Select
      value={valor ?? SEM_VALOR}
      disabled={disabled}
      onValueChange={(v) => onChange(v === SEM_VALOR ? null : v)}
    >
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {permiteVazio && <SelectItem value={SEM_VALOR}>— ninguém —</SelectItem>}
        {(pessoas ?? []).map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
