// Gerador do "Resumo NF-e" (PDF legível a partir do XML v4.00, modelo 55).
// Compartilhado por gerar-resumo-nfe-pdf e pelo cache de NFs do pacote do contador
// (fallback quando o Bling recusa o DANFE oficial).
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";

/** Fontes padrão do pdf-lib só codificam WinAnsi: troca travessões/setas, remove controles e o resto vira "?". */
export function paraWinAnsi(s: string): string {
  return String(s ?? "")
    .replace(/[\u2010-\u2015\u2212\u2190-\u21FF\u27F5-\u27FF]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function sanitizarProfundo<T>(v: T): T {
  if (typeof v === "string") return paraWinAnsi(v) as unknown as T;
  if (Array.isArray(v)) return v.map(sanitizarProfundo) as unknown as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitizarProfundo(x)])) as T;
  return v;
}

function desenhar(page: any, texto: string, opts: any) {
  page.drawText(paraWinAnsi(texto), opts);
}

export interface NFeParsed {
  chave: string;
  numero: string;
  serie: string;
  dhEmi: string;
  natOp: string;
  emit: Parte;
  dest: Parte;
  itens: Item[];
  totais: Totais;
}

export interface Parte {
  cnpjCpf: string;
  nome: string;
  ie: string;
  endereco: string;
}

export interface Item {
  nItem: string;
  cProd: string;
  xProd: string;
  ncm: string;
  cfop: string;
  qCom: string;
  vUnCom: string;
  vProd: string;
}

export interface Totais {
  vBC: string;
  vICMS: string;
  vIPI: string;
  vProd: string;
  vFrete: string;
  vNF: string;
}

// ----- XML parsing -----
export function parseNFe(xml: string): NFeParsed {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: true,
  });

  let parsed: any;
  try {
    parsed = parser.parse(xml);
  } catch (e) {
    throw new Error(`malformado (${e instanceof Error ? e.message : String(e)})`);
  }

  // NFe pode vir embrulhada em nfeProc ou direta
  const nfeRoot = parsed?.nfeProc?.NFe ?? parsed?.NFe;
  if (!nfeRoot) {
    // detecta NFC-e/CT-e/MDF-e
    if (parsed?.cteProc || parsed?.CTe) {
      throw new Error("documento é CT-e, não NF-e");
    }
    if (parsed?.mdfeProc || parsed?.MDFe) {
      throw new Error("documento é MDF-e, não NF-e");
    }
    throw new Error("estrutura não reconhecida como NFe v4.00");
  }

  const infNFe = nfeRoot.infNFe;
  if (!infNFe) throw new Error("infNFe ausente");

  // Chave: atributo Id="NFe<44 digitos>"
  const idAttr: string = infNFe["@_Id"] ?? "";
  const chave = idAttr.replace(/^NFe/, "");
  if (chave.length !== 44) {
    throw new Error(`chave de acesso inválida (${chave.length} dígitos)`);
  }

  const ide = infNFe.ide ?? {};
  const mod = String(ide.mod ?? "");
  if (mod && mod !== "55") {
    throw new Error(
      `modelo ${mod} não suportado (esperado 55 — NF-e). NFC-e (65) requer DANFE específico.`,
    );
  }

  const emit = parseParte(infNFe.emit);
  const dest = parseParte(infNFe.dest);

  // det pode ser objeto único ou array
  const detRaw = infNFe.det;
  const detArr = Array.isArray(detRaw) ? detRaw : detRaw ? [detRaw] : [];
  const itens: Item[] = detArr.map((d: any) => {
    const prod = d.prod ?? {};
    return {
      nItem: String(d["@_nItem"] ?? ""),
      cProd: String(prod.cProd ?? ""),
      xProd: String(prod.xProd ?? ""),
      ncm: String(prod.NCM ?? ""),
      cfop: String(prod.CFOP ?? ""),
      qCom: String(prod.qCom ?? ""),
      vUnCom: String(prod.vUnCom ?? ""),
      vProd: String(prod.vProd ?? ""),
    };
  });

  const tot = infNFe.total?.ICMSTot ?? {};
  const totais: Totais = {
    vBC: String(tot.vBC ?? "0.00"),
    vICMS: String(tot.vICMS ?? "0.00"),
    vIPI: String(tot.vIPI ?? "0.00"),
    vProd: String(tot.vProd ?? "0.00"),
    vFrete: String(tot.vFrete ?? "0.00"),
    vNF: String(tot.vNF ?? "0.00"),
  };

  return {
    chave,
    numero: String(ide.nNF ?? ""),
    serie: String(ide.serie ?? ""),
    dhEmi: String(ide.dhEmi ?? ide.dEmi ?? ""),
    natOp: String(ide.natOp ?? ""),
    emit,
    dest,
    itens,
    totais,
  };
}

function parseParte(node: any): Parte {
  if (!node) return { cnpjCpf: "", nome: "", ie: "", endereco: "" };
  const cnpj = node.CNPJ ? String(node.CNPJ) : node.CPF ? String(node.CPF) : "";
  const ender = node.enderEmit ?? node.enderDest ?? {};
  const enderecoPartes = [
    ender.xLgr,
    ender.nro && `nº ${ender.nro}`,
    ender.xCpl,
    ender.xBairro,
    ender.xMun && ender.UF && `${ender.xMun}/${ender.UF}`,
    ender.CEP && `CEP ${formatarCep(String(ender.CEP))}`,
  ].filter(Boolean);
  return {
    cnpjCpf: cnpj ? formatarCnpjCpf(cnpj) : "",
    nome: String(node.xNome ?? ""),
    ie: String(node.IE ?? ""),
    endereco: enderecoPartes.join(", "),
  };
}

function formatarCnpjCpf(v: string): string {
  const d = v.replace(/\D/g, "");
  if (d.length === 14) {
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (d.length === 11) {
    return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return v;
}

function formatarCep(v: string): string {
  const d = v.replace(/\D/g, "");
  return d.length === 8 ? d.replace(/^(\d{5})(\d{3})$/, "$1-$2") : v;
}

function formatarChave(chave: string): string {
  // grupos de 4
  return chave.match(/.{1,4}/g)?.join(" ") ?? chave;
}

function formatarDataHora(iso: string): string {
  // dhEmi é tipicamente "2026-04-30T15:30:00-03:00"
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

function formatarBRL(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarNum(v: string, casas = 4): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: casas,
  });
}

// ----- PDF generation -----
export async function buildPdf(nfeBruto: NFeParsed): Promise<Uint8Array> {
  const nfe = sanitizarProfundo(nfeBruto);
  const pdf = await PDFDocument.create();
  // A4 em points: 595 x 842
  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const colorText = rgb(0.1, 0.1, 0.1);
  const colorMuted = rgb(0.4, 0.4, 0.4);
  const colorAccent = rgb(0.12, 0.35, 0.7);
  const colorWarn = rgb(0.7, 0.35, 0.1);
  const colorHeaderBg = rgb(0.93, 0.95, 0.98);
  const colorBorder = rgb(0.75, 0.78, 0.82);

  const margin = 32;
  let y = height - margin;

  // ===== HEADER (caixa com fundo cinza claro) =====
  const headerH = 64;
  page.drawRectangle({
    x: margin,
    y: y - headerH,
    width: width - 2 * margin,
    height: headerH,
    color: colorHeaderBg,
    borderColor: colorBorder,
    borderWidth: 0.5,
  });
  desenhar(page, "RESUMO NF-e", {
    x: margin + 12,
    y: y - 22,
    size: 18,
    font: fontBold,
    color: colorAccent,
  });
  desenhar(page, "Gerado automaticamente a partir do XML", {
    x: margin + 12,
    y: y - 38,
    size: 9,
    font: font,
    color: colorMuted,
  });
  desenhar(page, 
    "Este documento NÃO substitui o DANFE oficial. XML original disponível no sistema.",
    {
      x: margin + 12,
      y: y - 52,
      size: 8,
      font: fontItalic,
      color: colorWarn,
    },
  );
  y -= headerH + 16;

  // ===== Bloco NF =====
  const linha = (label: string, val: string, x: number, yPos: number, labelW = 70) => {
    desenhar(page, label, { x, y: yPos, size: 8, font: fontBold, color: colorMuted });
    desenhar(page, val || "—", { x: x + labelW, y: yPos, size: 9, font, color: colorText });
  };

  drawBoxTitle(page, fontBold, "DADOS DA NOTA FISCAL", margin, y, width - 2 * margin, colorAccent);
  y -= 18;
  linha("Número:", `${nfe.numero} / Série ${nfe.serie || "—"}`, margin + 6, y, 50);
  linha("Emissão:", formatarDataHora(nfe.dhEmi), margin + 230, y, 50);
  y -= 14;
  linha("Natureza:", nfe.natOp, margin + 6, y, 60);
  y -= 14;
  desenhar(page, "Chave de acesso:", {
    x: margin + 6,
    y,
    size: 8,
    font: fontBold,
    color: colorMuted,
  });
  desenhar(page, formatarChave(nfe.chave), {
    x: margin + 6,
    y: y - 12,
    size: 9,
    font,
    color: colorText,
  });
  y -= 24;

  // ===== Emitente / Destinatário lado a lado =====
  y -= 8;
  const colW = (width - 2 * margin - 12) / 2;
  const blocoTopo = y;
  drawBoxTitle(page, fontBold, "EMITENTE", margin, y, colW, colorAccent);
  drawBoxTitle(page, fontBold, "DESTINATÁRIO", margin + colW + 12, y, colW, colorAccent);
  y -= 18;
  const yEmit = renderParte(page, font, fontBold, nfe.emit, margin + 6, y, colW - 12, colorText, colorMuted);
  const yDest = renderParte(
    page,
    font,
    fontBold,
    nfe.dest,
    margin + colW + 18,
    y,
    colW - 12,
    colorText,
    colorMuted,
  );
  y = Math.min(yEmit, yDest) - 12;

  // ===== Tabela de itens =====
  drawBoxTitle(page, fontBold, "ITENS", margin, y, width - 2 * margin, colorAccent);
  y -= 18;

  // Colunas: # | Descrição | NCM | CFOP | Qtd | Vlr unit | Vlr total
  const cols = [
    { label: "#", x: margin + 4, w: 22, align: "left" as const },
    { label: "Descrição", x: margin + 26, w: 220, align: "left" as const },
    { label: "NCM", x: margin + 248, w: 50, align: "left" as const },
    { label: "CFOP", x: margin + 300, w: 38, align: "left" as const },
    { label: "Qtd", x: margin + 340, w: 50, align: "right" as const },
    { label: "Vlr unit", x: margin + 392, w: 70, align: "right" as const },
    { label: "Vlr total", x: margin + 464, w: 67, align: "right" as const },
  ];

  // Header tabela
  page.drawRectangle({
    x: margin,
    y: y - 2,
    width: width - 2 * margin,
    height: 14,
    color: colorHeaderBg,
  });
  for (const c of cols) {
    drawAligned(page, c.label, c.x, y + 2, c.w, c.align, fontBold, 8, colorMuted);
  }
  y -= 14;
  page.drawLine({
    start: { x: margin, y: y + 2 },
    end: { x: width - margin, y: y + 2 },
    thickness: 0.5,
    color: colorBorder,
  });
  y -= 4; // gap após a linha pra não cortar primeiro item

  // Linhas
  const minY = 140; // reserva pra totais + footer
  let truncadoCount = 0;
  for (const item of nfe.itens) {
    if (y < minY) {
      truncadoCount = nfe.itens.length - nfe.itens.indexOf(item);
      break;
    }
    const desc = truncar(item.xProd, 48);
    const valores = [
      item.nItem,
      desc,
      item.ncm,
      item.cfop,
      formatarNum(item.qCom, 4),
      formatarBRL(item.vUnCom),
      formatarBRL(item.vProd),
    ];
    for (let i = 0; i < cols.length; i++) {
      drawAligned(page, valores[i], cols[i].x, y, cols[i].w, cols[i].align, font, 8, colorText);
    }
    y -= 12;
  }

  if (truncadoCount > 0) {
    desenhar(page, `… e mais ${truncadoCount} item(ns) — ver XML original`, {
      x: margin + 4,
      y,
      size: 8,
      font: fontItalic,
      color: colorWarn,
    });
    y -= 12;
  }

  y -= 10;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: colorBorder,
  });
  y -= 16;

  // ===== Totais (alinhado direita) =====
  drawBoxTitle(page, fontBold, "TOTAIS", margin, y, width - 2 * margin, colorAccent);
  y -= 18;

  const totais: Array<[string, string, boolean]> = [
    ["BC ICMS", formatarBRL(nfe.totais.vBC), false],
    ["Vlr ICMS", formatarBRL(nfe.totais.vICMS), false],
    ["Vlr IPI", formatarBRL(nfe.totais.vIPI), false],
    ["Vlr produtos", formatarBRL(nfe.totais.vProd), false],
    ["Vlr frete", formatarBRL(nfe.totais.vFrete), false],
    ["VALOR TOTAL DA NF", formatarBRL(nfe.totais.vNF), true],
  ];

  const totXLabel = width - margin - 200;
  const totXVal = width - margin - 6;
  for (const [label, val, destaque] of totais) {
    const f = destaque ? fontBold : font;
    const sz = destaque ? 11 : 9;
    const c = destaque ? colorAccent : colorText;
    desenhar(page, label + ":", { x: totXLabel, y, size: sz, font: f, color: c });
    drawAligned(page, val, totXLabel, y, totXVal - totXLabel, "right", f, sz, c);
    y -= destaque ? 16 : 13;
  }

  // ===== Footer =====
  const footerY = 40;
  page.drawLine({
    start: { x: margin, y: footerY + 28 },
    end: { x: width - margin, y: footerY + 28 },
    thickness: 0.5,
    color: colorBorder,
  });
  desenhar(page, "Chave NFe: " + formatarChave(nfe.chave), {
    x: margin,
    y: footerY + 16,
    size: 7,
    font,
    color: colorMuted,
  });
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  desenhar(page, `Gerado em ${agora}`, {
    x: margin,
    y: footerY + 4,
    size: 7,
    font,
    color: colorMuted,
  });
  drawAligned(
    page,
    "Resumo NF-e Fetely v1",
    margin,
    footerY + 4,
    width - 2 * margin,
    "right",
    fontBold,
    7,
    colorMuted,
  );

  return await pdf.save();
}

function drawBoxTitle(
  page: any,
  font: any,
  title: string,
  x: number,
  y: number,
  w: number,
  color: any,
) {
  page.drawRectangle({
    x,
    y: y - 2,
    width: w,
    height: 14,
    color: rgb(0.93, 0.95, 0.98),
  });
  desenhar(page, title, {
    x: x + 6,
    y: y + 2,
    size: 8,
    font,
    color,
  });
}

function renderParte(
  page: any,
  font: any,
  fontBold: any,
  parte: Parte,
  x: number,
  y: number,
  w: number,
  colorText: any,
  colorMuted: any,
): number {
  const linhas = [
    { label: "Razão social:", val: parte.nome },
    { label: "CNPJ/CPF:", val: parte.cnpjCpf },
    { label: "IE:", val: parte.ie },
    { label: "Endereço:", val: parte.endereco },
  ];
  let yLocal = y;
  for (const l of linhas) {
    desenhar(page, l.label, { x, y: yLocal, size: 7, font: fontBold, color: colorMuted });
    yLocal -= 9;
    const linhasTexto = wrapText(l.val || "—", w, font, 8);
    for (const lt of linhasTexto) {
      desenhar(page, lt, { x, y: yLocal, size: 8, font, color: colorText });
      yLocal -= 10;
    }
    yLocal -= 2;
  }
  return yLocal;
}

function wrapText(bruto: string, maxWidth: number, font: any, size: number): string[] {
  const text = paraWinAnsi(bruto);
  if (!text) return ["-"];
  const palavras = text.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    const w = font.widthOfTextAtSize(tentativa, size);
    if (w > maxWidth && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = tentativa;
    }
  }
  if (atual) linhas.push(atual);
  // limita a 3 linhas
  if (linhas.length > 3) {
    return [...linhas.slice(0, 2), linhas[2].slice(0, 50) + "…"];
  }
  return linhas;
}

function drawAligned(
  page: any,
  text: string,
  x: number,
  y: number,
  w: number,
  align: "left" | "right" | "center",
  font: any,
  size: number,
  color: any,
) {
  const t = paraWinAnsi(text ?? "");
  const tw = font.widthOfTextAtSize(t, size);
  let drawX = x;
  if (align === "right") drawX = x + w - tw;
  else if (align === "center") drawX = x + (w - tw) / 2;
  desenhar(page, t, { x: drawX, y, size, font, color });
}

function truncar(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}


/** XML → PDF em um passo. Lança com mensagem clara se o XML não for NF-e 55. */
export async function gerarResumoNfePdf(xml: string): Promise<Uint8Array> {
  return await buildPdf(parseNFe(xml));
}
