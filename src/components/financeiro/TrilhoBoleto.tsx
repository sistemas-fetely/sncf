import {
  MARCOS,
  MARCO_NOME,
  MARCO_COR_ATUAL,
  MARCO_ORDEM,
  resumirTrilho,
  type ItemTrilho,
} from "@/lib/financeiro/marcos-boleto";

/**
 * Fita C · E · R · B — onde o boleto está na vida dele com o banco.
 *
 * Substitui as bolinhas de status. Bolinha dizia QUAL estado; a fita diz
 * ONDE no caminho, o que já passou e o que falta. Letra em vez de cor porque
 * cor sozinha exige legenda e some em tela cinza.
 *
 * Não responde "o que fazer" — isso é o badge de atenção, que fica ao lado.
 */
export function TrilhoBoleto({
  itens,
  hojeIso,
  mostrarContador = true,
}: {
  itens: ItemTrilho[];
  hojeIso: string;
  /** Linha unitária (1 título) não precisa de "n/total". */
  mostrarContador?: boolean;
}) {
  const r = resumirTrilho(itens, hojeIso);
  if (!r) return null;

  const ordemAtual = MARCO_ORDEM[r.marcoAtual];
  const legenda = r.encerrado
    ? "Título encerrado"
    : `${MARCO_NOME[r.marcoAtual]} — ${r.descricao}` +
      (r.total > 1 ? ` (${r.qtdNoMarco} de ${r.total})` : "");

  return (
    <span
      className={`flex shrink-0 items-center gap-[3px] ${r.encerrado ? "opacity-50" : ""}`}
      title={legenda}
    >
      {MARCOS.map((m) => {
        const ordem = MARCO_ORDEM[m];
        const atual = ordem === ordemAtual && !r.encerrado;
        const cumprido = ordem < ordemAtual || r.encerrado;

        let cls: string;
        if (atual && r.alerta) cls = "bg-destructive/10 text-destructive border-destructive/40";
        else if (atual && r.emCurso) cls = `${MARCO_COR_ATUAL[m]} border-dashed`;
        else if (atual) cls = MARCO_COR_ATUAL[m];
        else if (cumprido) cls = "bg-muted text-muted-foreground border-transparent";
        else cls = "text-muted-foreground/60 border-dashed border-muted-foreground/40";

        return (
          <span
            key={m}
            aria-label={MARCO_NOME[m]}
            className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[3px] border font-mono text-[10px] leading-none ${cls}`}
          >
            {m}
          </span>
        );
      })}
      {mostrarContador && r.total > 1 && !r.encerrado && (
        <span className="ml-[2px] font-mono text-[10px] text-muted-foreground">
          {r.qtdNoMarco}/{r.total}
        </span>
      )}
    </span>
  );
}
