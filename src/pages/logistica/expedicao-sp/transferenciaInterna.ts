export const ehTransferenciaMesa = (canal: string | null | undefined) => canal?.toLowerCase() === "interno";
export const saidaSiteSp = (origem: string) => origem === "SITE-SP";
export const finalidadeSaidaSite = (codigo: string) => ["mostruario_showroom", "venda_fora", "outros"].includes(codigo);
export function estagioTiMesa(t: { canal: string | null; estagio: string | null; recebido_em: string | null }) {
  if (!ehTransferenciaMesa(t.canal)) return null;
  // recebido_em na view é também a entrada na fila; não prova entrega enquanto pendente.
  if (["pre_separacao", "em_separacao"].includes(t.estagio ?? "")) return "Mesa SP";
  return t.recebido_em ? "Entregue" : null;
}
export interface EntregaTransferencia { ok: boolean; id_externo: string; origem: string; destino: string; itens: number; pecas: number }
export const mensagemEntregaTi = (r: EntregaTransferencia) => `${r.id_externo} entregue no ${r.destino} — ${r.itens} SKUs / ${r.pecas} kits`;