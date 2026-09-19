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

/**
 * FICHA-DA-TAREFA (19/09/2026): rótulo em 12px sentence case. O uppercase miúdo
 * de 11px era "letra pequena" — quem preenche precisa ler o rótulo sem esforço.
 */
export function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="block text-xs font-normal text-muted-foreground">{rotulo}</span>
      {children}
    </div>
  );
}

/** Mesmo tratamento do rótulo de Campo, para rótulos soltos dentro de um bloco. */
export function RotuloCampo({ children }: { children: React.ReactNode }) {
  return <span className="block text-xs font-normal text-muted-foreground">{children}</span>;
}

/**
 * Bloco é SUPERFÍCIE, não fio: a página é `background` e cada bloco é `card`.
 * Com border-t o operador não enxergava onde um bloco terminava e o outro começava.
 */
export function Secao({
  titulo, acao, icone, children,
}: {
  titulo: string;
  acao?: React.ReactNode;
  icone?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-medium">
          {icone && <span className="inline-flex h-4 w-4 items-center text-muted-foreground">{icone}</span>}
          {titulo}
        </h3>
        {acao && <div className="text-xs text-muted-foreground">{acao}</div>}
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
      <SelectTrigger className="h-9 text-sm">
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
