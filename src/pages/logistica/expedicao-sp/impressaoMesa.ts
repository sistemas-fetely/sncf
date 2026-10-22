// Impressão da estação Documentos: janela própria (window.open + print), sem sidebar.
// Padrão já usado na casa para impressões avulsas; não exige rota nova.
import type { EmbalagemRegistrada, ItemPedidoMesa, PedidoMesa } from "./tipos";

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function campo(e: Record<string, unknown>, ...chaves: string[]): string | null {
  for (const k of chaves) {
    const v = e[k];
    if ((typeof v === "string" && v.trim() !== "") || typeof v === "number") return String(v).trim();
  }
  return null;
}

/** Linhas do endereço a partir do Json de entrega (sem contrato único: tenta chaves conhecidas). */
export function linhasEndereco(endereco: unknown): { linhas: string[]; telefone: string | null; nome: string | null } {
  if (!endereco || typeof endereco !== "object") return { linhas: [], telefone: null, nome: null };
  const e = endereco as Record<string, unknown>;
  const rua = [campo(e, "logradouro", "endereco", "address1", "rua", "street"), campo(e, "numero", "number")].filter(Boolean).join(", ");
  const compl = campo(e, "complemento", "address2");
  const bairro = campo(e, "bairro", "district", "neighborhood");
  const cidade = [campo(e, "cidade", "municipio", "city"), campo(e, "uf", "estado", "province_code", "state")].filter(Boolean).join(" / ");
  const cep = campo(e, "cep", "zip", "postal_code", "zipcode");
  return {
    linhas: [rua, compl, bairro, cidade, cep ? `CEP ${cep}` : null].filter((l): l is string => !!l && l.trim() !== ""),
    telefone: campo(e, "telefone", "phone", "celular", "fone"),
    nome: campo(e, "nome", "name", "destinatario"),
  };
}

function abrir(titulo: string, css: string, corpo: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0}
    ${css}</style></head><body>${corpo}<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
  return true;
}

export function imprimirRomaneio(p: {
  pedido: PedidoMesa; itens: ItemPedidoMesa[]; embalagem: EmbalagemRegistrada | null; modalNome: string | null;
}): boolean {
  const end = linhasEndereco(p.pedido.endereco_entrega);
  const linhas = p.itens.map((i) => `<tr><td>${esc(i.sku ?? "—")}</td><td>${esc(i.descricao)}</td><td class="n">${esc(i.quantidade)}</td></tr>`).join("");
  const total = p.itens.reduce((s, i) => s + i.quantidade, 0);
  return abrir(`Romaneio ${p.pedido.id_externo}`, `
    @page{size:A4;margin:15mm} h1{font-size:20px;margin:0 0 4px} .sub{font-size:12px;color:#444;margin-bottom:16px}
    .bloco{border:1px solid #000;padding:8px 10px;margin-bottom:12px;font-size:13px;line-height:1.4}
    table{width:100%;border-collapse:collapse;font-size:12px} th,td{border:1px solid #000;padding:4px 6px;text-align:left} .n{text-align:right}
  `, `
    <h1>Romaneio · ${esc(p.pedido.id_externo)}</h1>
    <div class="sub">Emitido em ${esc(new Date().toLocaleString("pt-BR"))}</div>
    <div class="bloco"><strong>${esc(p.pedido.cliente_nome ?? end.nome ?? "Cliente")}</strong><br>
      ${end.linhas.map(esc).join("<br>")}${end.telefone ? `<br>Telefone: ${esc(end.telefone)}` : ""}</div>
    <div class="bloco">Modal: ${esc(p.modalNome ?? p.embalagem?.modal ?? "—")} ·
      Volumes: ${esc(p.embalagem?.volumes ?? "—")} · Peso: ${p.embalagem?.peso_kg != null ? `${esc(p.embalagem.peso_kg.toLocaleString("pt-BR"))} kg` : "—"}</div>
    <table><thead><tr><th>SKU</th><th>Descrição</th><th class="n">Qtd</th></tr></thead>
      <tbody>${linhas}</tbody><tfoot><tr><th colspan="2">Total de peças</th><th class="n">${total}</th></tr></tfoot></table>
  `);
}

export function imprimirEtiquetas(p: {
  pedido: PedidoMesa; volumes: number; nfNumero: string | null;
}): boolean {
  const end = linhasEndereco(p.pedido.endereco_entrega);
  const n = Math.max(1, p.volumes);
  const etiqueta = (x: number) => `
    <section class="et">
      <div class="lbl">DESTINATÁRIO</div>
      <div class="dest"><strong>${esc(p.pedido.cliente_nome ?? end.nome ?? "")}</strong><br>${end.linhas.map(esc).join("<br>")}
        ${end.telefone ? `<br>Tel.: ${esc(end.telefone)}` : ""}</div>
      <div class="lbl">REMETENTE</div><div>FETELY — Matriz SP</div>
      <div class="pe">
        <div>NF: <strong>${esc(p.nfNumero ?? "—")}</strong></div>
        <div>Pedido: <strong>${esc(p.pedido.id_externo)}</strong></div>
        <div class="vol">Volume ${x} de ${n}</div>
      </div>
    </section>`;
  return abrir(`Etiquetas ${p.pedido.id_externo}`, `
    @page{size:100mm 150mm;margin:0} .et{width:100mm;height:150mm;padding:6mm;page-break-after:always;display:flex;flex-direction:column;gap:3mm;font-size:12px}
    .et:last-child{page-break-after:auto} .lbl{font-size:9px;letter-spacing:.1em;color:#444;border-bottom:1px solid #000}
    .dest{font-size:14px;line-height:1.35} .pe{margin-top:auto;border-top:2px solid #000;padding-top:3mm;font-size:13px}
    .vol{font-size:22px;font-weight:bold;margin-top:2mm}
  `, Array.from({ length: n }, (_, i) => etiqueta(i + 1)).join(""));
}
