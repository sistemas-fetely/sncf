import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const Verde = [45, 90, 39] as [number, number, number];
const Creme = [240, 236, 216] as [number, number, number];
const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface ItemPedido {
  descricao: string;
  sku: string;
  quantidade: number;
  valor_unitario: number;
  subtotal?: number;
}

export interface PedidoPdfData {
  id_externo: string;
  data_pedido: string;
  parceiro_nome: string;
  forma_pagamento: string;
  condicao_pagamento?: string;
  valor_bruto: number;
  /** Valor real do desconto, em reais. Nunca derivado do percentual. */
  desconto_valor: number;
  /** Só para exibir o percentual no rótulo, quando existir. */
  desconto_pct?: number;
  bonus_pix_valor?: number;
  valor_frete?: number;
  /** Resolvido por quem chama (tabela frete_tipos). CIF = false. */
  frete_entra_no_liquido: boolean;
  valor_liquido: number;
  itens: ItemPedido[];
}

/**
 * Confere se os componentes fecham com o valor líquido.
 * Função pura — usada para avisar o operador antes de gerar o documento.
 */
export function conferirTotaisPedido(data: PedidoPdfData) {
  const somaComponentes =
    Number(data.valor_bruto ?? 0) -
    Number(data.desconto_valor ?? 0) -
    Number(data.bonus_pix_valor ?? 0) +
    (data.frete_entra_no_liquido ? Number(data.valor_frete ?? 0) : 0);
  const diferenca = somaComponentes - Number(data.valor_liquido ?? 0);
  return { fecha: Math.abs(diferenca) < 0.01, somaComponentes, diferenca };
}

export function gerarPedidoPdf(data: PedidoPdfData): string {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFillColor(...Verde);
  doc.rect(0, 0, 210, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(22);
  doc.text("Fetély.", 105, 18, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(200, 230, 200);
  doc.text("Confirmação de Pedido", 105, 24, { align: "center" });

  doc.setTextColor(45, 90, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`Pedido ${data.id_externo}`, 14, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(data.data_pedido, 14, 44);

  doc.setFillColor(...Creme);
  doc.roundedRect(14, 48, 182, 30, 3, 3, "F");

  doc.setTextColor(45, 90, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("CLIENTE", 20, 56);
  doc.text("PAGAMENTO", 110, 56);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.text(data.parceiro_nome, 20, 63);
  const pgto = data.condicao_pagamento
    ? `${data.forma_pagamento} · ${data.condicao_pagamento}`
    : data.forma_pagamento;
  doc.text(pgto, 110, 63);

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text("Valor líquido:", 110, 70);
  doc.setTextColor(45, 90, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(fmtBRL.format(data.valor_liquido), 145, 70);

  doc.setTextColor(45, 90, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Itens do Pedido", 14, 88);

  const rows = data.itens.map((it) => [
    it.descricao.length > 50 ? it.descricao.substring(0, 50) + "…" : it.descricao,
    it.sku,
    String(it.quantidade),
    fmtBRL.format(it.valor_unitario),
    fmtBRL.format(it.subtotal ?? it.quantidade * it.valor_unitario),
  ]);

  autoTable(doc, {
    startY: 92,
    head: [["Produto", "SKU", "Qtd", "Unit.", "Subtotal"]],
    body: rows,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: Verde, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 248, 242] },
    columnStyles: {
      0: { cellWidth: 75 },
      1: { cellWidth: 35 },
      2: { halign: "center", cellWidth: 15 },
      3: { halign: "right", cellWidth: 25 },
      4: { halign: "right", cellWidth: 28 },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? 200;
  const resumoY = finalY + 8;

  const linhas: [string, number | null][] = [["Valor bruto:", data.valor_bruto]];
  const descontoValor = Number(data.desconto_valor ?? 0);
  if (descontoValor > 0) {
    const rotulo =
      data.desconto_pct && data.desconto_pct > 0
        ? `Desconto (${data.desconto_pct}%):`
        : "Desconto:";
    linhas.push([rotulo, descontoValor]);
  }
  const bonusPix = Number(data.bonus_pix_valor ?? 0);
  if (bonusPix > 0) {
    linhas.push(["Bônus PIX:", bonusPix]);
  }
  const frete = Number(data.valor_frete ?? 0);
  if (frete > 0) {
    if (data.frete_entra_no_liquido) linhas.push(["Frete:", frete]);
    else linhas.push(["Frete: por conta da Fetely", null]);
  }

  doc.setFillColor(...Creme);
  doc.roundedRect(120, resumoY, 76, linhas.length * 7 + 6, 3, 3, "F");



  let rowY = resumoY + 8;
  doc.setFontSize(9);
  for (const [label, valor] of linhas) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(label, 125, rowY);
    if (valor !== null) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text(fmtBRL.format(Math.abs(valor)), 193, rowY, { align: "right" });
    }
    rowY += 7;
  }

  doc.setFillColor(...Verde);
  doc.rect(120, rowY - 1, 76, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text("Total:", 125, rowY + 6);
  doc.text(fmtBRL.format(data.valor_liquido), 193, rowY + 6, { align: "right" });

  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...Verde);
  doc.rect(0, pageH - 16, 210, 16, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(200, 230, 200);
  doc.text(
    "Fetely Comércio Importação e Exportação Ltda · CNPJ 63.591.078/0001-48 · #celebreoqueimporta",
    105,
    pageH - 6,
    { align: "center" }
  );

  return doc.output("datauristring").split(",")[1];
}
