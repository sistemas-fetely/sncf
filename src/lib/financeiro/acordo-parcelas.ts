/** Helpers puros do modal "Criar acordo". A verdade é a RPC `renegociar_acordo`. */

export interface ParcelaAcordo {
  valor: string;
  data_vencimento: string;
}

/** Soma `dias` a uma data ISO (YYYY-MM-DD), em UTC. */
export function somarDiasISO(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Divide o saldo em `n` partes iguais; a diferença de centavos fica na última. */
export function dividirSaldo(
  saldo: number,
  n: number,
  primeiroVencimento: string,
  intervaloDias: number,
): ParcelaAcordo[] {
  if (!(n >= 1) || !(saldo > 0) || !primeiroVencimento) return [];
  const totalCent = Math.round(saldo * 100);
  const base = Math.floor(totalCent / n);
  return Array.from({ length: n }, (_, i) => {
    const cent = i === n - 1 ? totalCent - base * (n - 1) : base;
    return {
      valor: (cent / 100).toFixed(2),
      data_vencimento: somarDiasISO(primeiroVencimento, i * intervaloDias),
    };
  });
}

export type RotuloAjuste = "Acréscimo" | "Desconto" | "Sem ajuste";

export function ajusteDoAcordo(saldo: number, soma: number): { valor: number; rotulo: RotuloAjuste } {
  const valor = Math.round((soma - saldo) * 100) / 100;
  if (valor > 0) return { valor, rotulo: "Acréscimo" };
  if (valor < 0) return { valor, rotulo: "Desconto" };
  return { valor: 0, rotulo: "Sem ajuste" };
}
