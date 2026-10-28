// Impressão da estação Documentos: janela própria (window.open + print), sem sidebar.
// Todos os dados vêm de `fn_mesa_sp_dados_impressao` (DadosImpressao) — a tela não monta endereço.
import JsBarcode from "jsbarcode";
import type { DadosImpressao, EnderecoImpressao } from "./tipos";

/** Campos do DANFE Simplificado – Etiqueta, lidos do XML pela edge `nf-danfe-etiqueta`. */
export interface DanfeEtiqueta {
  chave_acesso: string; protocolo: string; protocolo_data: string | null;
  tipo_operacao: string | null; tipo_emissao: string | null;
  numero: string | null; serie: string | null; data_emissao: string | null;
  emitente: { nome: string | null; cnpj: string | null; ie: string | null; uf: string | null };
  destinatario: { nome: string | null; documento: string | null; ie: string | null; uf: string | null };
  valor_total: string | null;
}

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
  .danfe{font-size:11px;gap:1.8mm} .danfe h2{font-size:14px;margin:0;text-align:center;border:2px solid #000;padding:1.5mm}
  .danfe .bc svg{width:100%;height:16mm;display:block} .danfe .ch{font-family:monospace;font-size:12px;text-align:center;letter-spacing:.02em}
  .danfe .bx{border:1px solid #000;padding:1.5mm;line-height:1.35} .danfe .vt{font-size:15px;font-weight:bold;text-align:right}
`;

const fmtDoc = (v: string | null) => {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v ?? "—";
};
const fmtDataHora = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

function codigoBarras(chave: string): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, chave, { format: "CODE128C", displayValue: false, margin: 0, height: 60, width: 2 });
  svg.setAttribute("preserveAspectRatio", "none");
  return svg.outerHTML;
}

/** DANFE Simplificado – Etiqueta (NT 2020.004): 1 página por NF, ao final das etiquetas Fetely. Sem telefone. */
function paginaDanfe(n: DanfeEtiqueta): string {
  const grupos = n.chave_acesso.match(/.{1,4}/g)!.join(" ");
  const tp = n.tipo_operacao === "0" ? "0 - Entrada" : n.tipo_operacao === "1" ? "1 - Saída" : "—";
  const cont = n.tipo_emissao && n.tipo_emissao !== "1" ? `<div class="bx"><strong>EMITIDA EM CONTINGÊNCIA</strong> (tpEmis ${esc(n.tipo_emissao)})</div>` : "";
  const valor = n.valor_total != null ? Number(n.valor_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
  return `<section class="et danfe">
    <h2>DANFE SIMPLIFICADO - ETIQUETA</h2>
    <div class="lbl">CHAVE DE ACESSO</div>
    <div class="bc">${codigoBarras(n.chave_acesso)}</div>
    <div class="ch">${esc(grupos)}</div>
    <div class="bx">Protocolo de autorização: <strong>${esc(n.protocolo)}</strong><br>${esc(fmtDataHora(n.protocolo_data))}</div>
    ${cont}
    <div class="bx">Tipo: <strong>${esc(tp)}</strong> · Nº <strong>${esc(n.numero ?? "—")}</strong> · Série <strong>${esc(n.serie ?? "—")}</strong><br>Emissão: ${esc(fmtDataHora(n.data_emissao))}</div>
    <div class="lbl">EMITENTE</div>
    <div class="bx"><strong>${esc(n.emitente.nome ?? "—")}</strong><br>CNPJ ${esc(fmtDoc(n.emitente.cnpj))} · IE ${esc(n.emitente.ie ?? "—")} · UF ${esc(n.emitente.uf ?? "—")}</div>
    <div class="lbl">DESTINATÁRIO</div>
    <div class="bx"><strong>${esc(n.destinatario.nome ?? "—")}</strong><br>${(n.destinatario.documento ?? "").replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ"} ${esc(fmtDoc(n.destinatario.documento))}${n.destinatario.ie ? ` · IE ${esc(n.destinatario.ie)}` : ""} · UF ${esc(n.destinatario.uf ?? "—")}</div>
    <div class="vt">Valor total da NF: ${esc(valor)}</div>
  </section>`;
}

const totalVolumes = (d: DadosImpressao) => Math.max(1, Math.floor(d.volumes ?? 1));

function blocoRemetente(d: DadosImpressao): string {
  const r = d.remetente;
  const linhas = r.completo ? linhasDe(r) : [];
  return `<div class="lbl">REMETENTE</div><div class="rem"><strong>${esc(t(r.nome) || "FETELY")}</strong>
    ${linhas.map((l) => `<br>${esc(l)}`).join("")}${t(r.cep) ? `<br>CEP ${esc(r.cep)}` : ""}${r.completo && t(r.telefone) ? `<br>Tel.: ${esc(r.telefone)}` : ""}</div>`;
}

/** Etiqueta Fetely (Zebra 100×150), uma por volume. Sem telefone nem documento do cliente (dado sensível fora da caixa). */
function etiquetaFetely(d: DadosImpressao, faixa?: string): string {
  const n = totalVolumes(d);
  const dest = d.destinatario;
  const et = (x: number) => `
    <section class="et">
      ${faixa ? `<div class="destaque">${esc(faixa)}</div>` : ""}
      <div class="lbl">DESTINATÁRIO</div>
      <div class="dest"><div class="nome">${esc(dest.nome)}</div>
        ${linhasDe(dest).map(esc).join("<br>")}
        ${t(dest.cep) ? `<div class="cep">CEP ${esc(dest.cep)}</div>` : ""}</div>
      ${blocoRemetente(d)}
      <div class="pe">
        <div>Pedido: <strong>${esc(d.pedido)}</strong></div>
        <div>NF: <strong>${esc(d.nf ?? "—")}</strong></div>
        <div>Modal: <strong>${esc(d.modal ?? "—")}${d.servico_correios ? ` · ${esc(d.servico_correios)}` : ""}</strong></div>
        <div class="vol">Volume ${x} de ${n}</div>
      </div>
    </section>`;
  return Array.from({ length: n }, (_, i) => et(i + 1)).join("");
}

/** Etiqueta de entrega/volume — todos os modais (inclusive Correios, como etiqueta lateral). */
export function imprimirEtiquetaEntrega(d: DadosImpressao, danfe?: DanfeEtiqueta | null): boolean {
  return abrir(`Etiquetas ${d.pedido}`, CSS_ZEBRA, etiquetaFetely(d) + (danfe ? paginaDanfe(danfe) : ""));
}

/** Retirada: mesma etiqueta completa, com faixa "RETIRADA NO BALCÃO" no topo. */
export function imprimirEtiquetaRetirada(d: DadosImpressao, danfe?: DanfeEtiqueta | null): boolean {
  return abrir(`Etiquetas retirada ${d.pedido}`, CSS_ZEBRA, etiquetaFetely(d, "RETIRADA NO BALCÃO") + (danfe ? paginaDanfe(danfe) : ""));
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
