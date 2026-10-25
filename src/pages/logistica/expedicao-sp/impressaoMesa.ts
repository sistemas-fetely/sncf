// Impressão da estação Documentos: janela própria (window.open + print), sem sidebar.
// Todos os dados vêm de `fn_mesa_sp_dados_impressao` (DadosImpressao) — a tela não monta endereço.
import type { DadosImpressao, EnderecoImpressao } from "./tipos";

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const t = (v: string | null | undefined) => (v ?? "").trim();

/** Linhas de endereço (sem nome/telefone/CEP). */
export function linhasDe(e: EnderecoImpressao): string[] {
  const rua = [t(e.logradouro), t(e.numero)].filter(Boolean).join(", ");
  const cidade = [t(e.cidade), t(e.uf)].filter(Boolean).join(" / ");
  return [rua, t(e.complemento), t(e.bairro), cidade].filter(Boolean);
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

const CSS_ZEBRA = `
  @page{size:100mm 150mm;margin:0}
  .et{width:100mm;height:150mm;padding:5mm;page-break-after:always;display:flex;flex-direction:column;gap:2.5mm;font-size:12px;overflow:hidden}
  .et:last-child{page-break-after:auto}
  .lbl{font-size:9px;letter-spacing:.1em;color:#444;border-bottom:1px solid #000;padding-bottom:.5mm}
  .dest{font-size:14px;line-height:1.3} .dest .nome{font-size:17px;font-weight:bold}
  .cep{font-size:22px;font-weight:bold;letter-spacing:.05em;margin-top:1mm}
  .rem{font-size:11px;line-height:1.3}
  .pe{margin-top:auto;border-top:2px solid #000;padding-top:2.5mm;font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:1mm}
  .vol{grid-column:1/-1;font-size:24px;font-weight:bold;margin-top:1mm}
  .destaque{font-size:22px;font-weight:bold;text-align:center;border:3px solid #000;padding:3mm}
  .grande{font-size:22px;font-weight:bold;line-height:1.2}
`;

const totalVolumes = (d: DadosImpressao) => Math.max(1, Math.floor(d.volumes ?? 1));

function blocoRemetente(d: DadosImpressao): string {
  const r = d.remetente;
  const linhas = r.completo ? linhasDe(r) : [];
  return `<div class="lbl">REMETENTE</div><div class="rem"><strong>${esc(t(r.nome) || "FETELY")}</strong>
    ${linhas.map((l) => `<br>${esc(l)}`).join("")}${t(r.cep) ? `<br>CEP ${esc(r.cep)}` : ""}${r.completo && t(r.telefone) ? `<br>Tel.: ${esc(r.telefone)}` : ""}</div>`;
}

/** Etiqueta de entrega/volume (Zebra 100×150), uma por volume. */
export function imprimirEtiquetaEntrega(d: DadosImpressao): boolean {
  const n = totalVolumes(d);
  const dest = d.destinatario;
  const et = (x: number) => `
    <section class="et">
      <div class="lbl">DESTINATÁRIO</div>
      <div class="dest"><div class="nome">${esc(dest.nome)}</div>${linhasDe(dest).map(esc).join("<br>")}
        ${t(dest.cep) ? `<div class="cep">CEP ${esc(dest.cep)}</div>` : ""}
        ${t(dest.telefone) ? `<div>Tel.: ${esc(dest.telefone)}</div>` : ""}</div>
      ${blocoRemetente(d)}
      <div class="pe">
        <div>Pedido: <strong>${esc(d.pedido)}</strong></div>
        <div>NF: <strong>${esc(d.nf ?? "—")}</strong></div>
        <div>Modal: <strong>${esc(d.modal ?? "—")}</strong></div>
        <div class="vol">Volume ${x} de ${n}</div>
      </div>
    </section>`;
  return abrir(`Etiquetas ${d.pedido}`, CSS_ZEBRA, Array.from({ length: n }, (_, i) => et(i + 1)).join(""));
}

/** Etiqueta de retirada no balcão (Zebra 100×150), uma por volume. */
export function imprimirEtiquetaRetirada(d: DadosImpressao): boolean {
  const n = totalVolumes(d);
  const dest = d.destinatario;
  const et = (x: number) => `
    <section class="et">
      <div class="destaque">RETIRADA NO BALCÃO</div>
      <div class="lbl">CLIENTE</div>
      <div class="grande">${esc(dest.nome)}</div>
      ${t(dest.documento) ? `<div>Documento: <strong>${esc(dest.documento)}</strong></div>` : ""}
      ${t(dest.telefone) ? `<div>Tel.: ${esc(dest.telefone)}</div>` : ""}
      <div class="pe">
        <div>Pedido: <strong>${esc(d.pedido)}</strong></div>
        <div>NF: <strong>${esc(d.nf ?? "—")}</strong></div>
        <div class="vol">Volume ${x} de ${n}</div>
      </div>
    </section>`;
  return abrir(`Etiquetas retirada ${d.pedido}`, CSS_ZEBRA, Array.from({ length: n }, (_, i) => et(i + 1)).join(""));
}

const CSS_A4 = `
  @page{size:A4;margin:15mm} h1{font-size:20px;margin:0 0 4px} .sub{font-size:12px;color:#444;margin-bottom:14px}
  .bloco{border:1px solid #000;padding:8px 10px;margin-bottom:12px;font-size:13px;line-height:1.4}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px} th,td{border:1px solid #000;padding:4px 6px;text-align:left} .n{text-align:right}
  .campos{margin-top:18px;font-size:13px} .campo{display:flex;gap:8px;align-items:flex-end;margin-bottom:18px}
  .campo span{white-space:nowrap} .campo i{flex:1;border-bottom:1px solid #000;height:18px}
  .ass{margin-top:40px} footer{margin-top:30px;border-top:1px solid #000;padding-top:6px;font-size:11px;color:#333}
`;

const campos = (rotulos: string[]) =>
  `<div class="campos">${rotulos.map((r) => `<div class="campo${r === "Assinatura" ? " ass" : ""}"><span>${esc(r)}:</span><i></i></div>`).join("")}</div>`;

function rodapeRemetente(d: DadosImpressao): string {
  const r = d.remetente;
  const partes = [t(r.nome), ...(r.completo ? linhasDe(r) : []), t(r.cep) ? `CEP ${t(r.cep)}` : "", r.completo ? t(r.telefone) : ""].filter(Boolean);
  return `<footer>${partes.map(esc).join(" · ")}</footer>`;
}

function blocoDestinatario(d: DadosImpressao, comEndereco: boolean): string {
  const dest = d.destinatario;
  return `<div class="bloco"><strong>${esc(dest.nome)}</strong>
    ${t(dest.documento) ? `<br>Documento: ${esc(dest.documento)}` : ""}
    ${comEndereco ? linhasDe(dest).map((l) => `<br>${esc(l)}`).join("") + (t(dest.cep) ? `<br>CEP ${esc(dest.cep)}` : "") : ""}
    ${t(dest.telefone) ? `<br>Telefone: ${esc(dest.telefone)}` : ""}</div>`;
}

/** Termo de retirada (A4). */
export function imprimirTermoRetirada(d: DadosImpressao): boolean {
  const linhas = d.itens.map((i) => `<tr><td>${esc(i.sku ?? "—")}</td><td>${esc(i.descricao)}</td><td class="n">${esc(i.quantidade)}</td></tr>`).join("");
  const total = d.itens.reduce((s, i) => s + Number(i.quantidade || 0), 0);
  return abrir(`Termo de Retirada ${d.pedido}`, CSS_A4, `
    <h1>Termo de Retirada — Pedido ${esc(d.pedido)}</h1>
    <div class="sub">Emitido em ${esc(new Date().toLocaleString("pt-BR"))}</div>
    ${blocoDestinatario(d, false)}
    <div class="bloco">NF: <strong>${esc(d.nf ?? "—")}</strong> · Volumes: <strong>${esc(d.volumes ?? "—")}</strong></div>
    <table><thead><tr><th>SKU</th><th>Descrição</th><th class="n">Qtd</th></tr></thead>
      <tbody>${linhas}</tbody><tfoot><tr><th colspan="2">Total de peças</th><th class="n">${total}</th></tr></tfoot></table>
    ${campos(["Nome de quem retirou", "Documento (RG/CPF)", "Data/hora", "Assinatura"])}
    ${rodapeRemetente(d)}
  `);
}

/** Comprovante de coleta pela transportadora (A4). */
export function imprimirComprovanteColeta(d: DadosImpressao): boolean {
  const peso = d.peso_kg != null ? `${Number(d.peso_kg).toLocaleString("pt-BR")} kg` : "—";
  return abrir(`Comprovante de Coleta ${d.pedido}`, CSS_A4, `
    <h1>Comprovante de Coleta — Pedido ${esc(d.pedido)}</h1>
    <div class="sub">Emitido em ${esc(new Date().toLocaleString("pt-BR"))}</div>
    ${blocoDestinatario(d, true)}
    <div class="bloco">NF: <strong>${esc(d.nf ?? "—")}</strong> · Volumes: <strong>${esc(d.volumes ?? "—")}</strong> · Peso: <strong>${esc(peso)}</strong></div>
    ${campos(["Transportadora", "Nome do motorista", "Documento", "Placa", "Data/hora", "Assinatura"])}
    ${rodapeRemetente(d)}
  `);
}
