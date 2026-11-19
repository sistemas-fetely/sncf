/** Endereço de entrega da Venda Direta vindo do cliente: cadastro → último pedido → vazio. */
export interface EnderecoVd { cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string }

const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const txt = (s: unknown) => (s == null ? "" : String(s));

export interface CadastroEndereco { cep?: string | null; logradouro?: string | null; numero?: string | null; endereco_complemento?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null }
export interface EntregaPedido { cep?: unknown; logradouro?: unknown; numero?: unknown; complemento?: unknown; bairro?: unknown; cidade?: unknown; uf?: unknown }

export function enderecoInicialCliente(cad: CadastroEndereco | null | undefined, ultimos: (EntregaPedido | null | undefined)[]): { endereco: EnderecoVd; origem: "cadastro" | "pedido" | null } | null {
  if (cad && dig(cad.cep).length > 0) {
    return { origem: "cadastro", endereco: { cep: dig(cad.cep), logradouro: txt(cad.logradouro), numero: txt(cad.numero), complemento: txt(cad.endereco_complemento), bairro: txt(cad.bairro), cidade: txt(cad.cidade), uf: txt(cad.uf) } };
  }
  const p = ultimos.find((e) => e && dig(e.cep).length > 0);
  if (p) return { origem: "pedido", endereco: { cep: dig(p.cep), logradouro: txt(p.logradouro), numero: txt(p.numero), complemento: txt(p.complemento), bairro: txt(p.bairro), cidade: txt(p.cidade), uf: txt(p.uf) } };
  return null;
}

/** Grava no cadastro só se ele estiver sem CEP e o pedido tiver CEP + logradouro + cidade + UF. */
export function enderecoParaCadastro(cadastroCep: string | null | undefined, e: EnderecoVd) {
  if (dig(cadastroCep).length > 0) return null;
  if (dig(e.cep).length !== 8 || !e.logradouro.trim() || !e.cidade.trim() || !e.uf.trim()) return null;
  return {
    cep: dig(e.cep), logradouro: e.logradouro.trim(), numero: e.numero.trim() || null, endereco_complemento: e.complemento.trim() || null,
    bairro: e.bairro.trim() || null, cidade: e.cidade.trim(), uf: e.uf.trim().toUpperCase().slice(0, 2),
  };
}
