export function agruparMensagens(mensagens: (string | null | undefined)[], limite = 5): string {
  const grupos = new Map<string, number>();
  for (const mensagem of mensagens) {
    const texto = mensagem?.trim() || "Erro sem mensagem.";
    grupos.set(texto, (grupos.get(texto) ?? 0) + 1);
  }
  const lista = [...grupos];
  return [...lista.slice(0, limite).map(([texto, n]) => `${n} ${n === 1 ? "célula" : "células"}: ${texto}`),
    ...(lista.length > limite ? [`+${lista.length - limite} outros motivos`] : [])].join("; ");
}

export class ErroCatalogo extends Error {
  constructor(mensagem: string, public status: number, public codigo?: string) { super(mensagem); }
}

export function deveAtualizarLeitura(erro: unknown): boolean {
  return erro instanceof ErroCatalogo && erro.status === 409 &&
    ["leitura_em_andamento", "leitura_mais_nova"].includes(erro.codigo ?? "");
}