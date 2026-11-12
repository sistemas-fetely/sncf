export type EnderecoEntregaVD = Record<"cep" | "logradouro" | "numero" | "complemento" | "bairro" | "cidade" | "uf", string>;

export function camposEnderecoEntrega(endereco: Record<string, unknown> | null | undefined): EnderecoEntregaVD {
  const campo = (chave: string) => String(endereco?.[chave] ?? "");
  return { cep: campo("cep"), logradouro: campo("logradouro"), numero: campo("numero"), complemento: campo("complemento"), bairro: campo("bairro"), cidade: campo("cidade"), uf: campo("uf") };
}

export function podeExibirCorrecaoEndereco(pedido: {
  modal: string | null; endereco_entrega?: Record<string, unknown> | null;
  estagio?: string | null; situacao?: string | null; cancelado_em?: string | null;
}, devolvido = false) {
  const finais = ["cancelado", "entregue", "encerrado", "devolvido"];
  return pedido.modal !== "retirada" && !!pedido.endereco_entrega && Object.keys(pedido.endereco_entrega).length > 0
    && !pedido.cancelado_em && !devolvido && !finais.includes(pedido.estagio ?? "") && !finais.includes(pedido.situacao ?? "");
}

export const motivoCorrecaoPreenchido = (motivo: string) => motivo.trim().length >= 3;
export const cepEntregaDiferente = (original: string, atual: string) => original.replace(/\D/g, "") !== atual.replace(/\D/g, "");