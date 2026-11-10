/** A troca individual refaz documentos; agência é uma escolha explícita. */
export function transportadoraNfDiverge(modalAtual: string | null, modalNf: string | null): boolean {
  return !!modalAtual && modalAtual !== (modalNf ?? "TRANSPORTADORA");
}

export function acaoModalDespacho(args: { atual: string | null; escolhido: string | null; correios: boolean; jaPostei: boolean }) {
  if (args.correios && args.jaPostei) return "agencia" as const;
  if (args.atual && args.escolhido && args.atual !== args.escolhido) return "trocar" as const;
  if (args.correios) return "rastreio" as const;
  return "despachar" as const;
}

export async function executarAcaoModalMesa(acao: ReturnType<typeof acaoModalDespacho>, trocou: boolean, passos: {
  trocar: () => Promise<void>; agencia: () => Promise<void>; despachar: () => void; documentos: () => void;
}) {
  if (trocou) await passos.trocar();
  if (acao === "trocar") { passos.documentos(); return; }
  if (acao === "agencia") await passos.agencia();
  if (acao !== "rastreio") passos.despachar();
}