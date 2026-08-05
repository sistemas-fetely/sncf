import type { KpiFinanceiro } from "@/types/credito";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  kpis: KpiFinanceiro | null;
}

/**
 * Quebra explicita do "Em aberto": quanto vem de titulo ainda nao faturado.
 *
 * A obrigacao do cliente nasce no pedido, nao na NF — por isso titulo sem NF
 * conta como exposicao. Mas a lista de titulos das telas vem de `vw_recebivel_b2b`,
 * que exige NF. Sem esta linha, card e lista se contradizem.
 *
 * Nao renderiza nada quando tudo esta faturado.
 */
export function AvisoNaoFaturado({ kpis }: Props) {
  const qtd = kpis?.qtd_sem_nf ?? 0;
  if (!kpis || qtd <= 0) return null;

  const valor = Number(kpis.em_aberto_sem_nf ?? 0);

  return (
    <p className="text-xs text-muted-foreground pl-3 -mt-1 leading-snug">
      dos quais {fmtBRL.format(valor)} não faturados
      <span className="opacity-70">
        {" "}({qtd} {qtd === 1 ? "título sem NF" : "títulos sem NF"})
      </span>
    </p>
  );
}
