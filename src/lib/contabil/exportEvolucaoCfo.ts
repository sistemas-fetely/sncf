import ExcelJS from "exceljs";

export interface EvolucaoCfoLinha {
  competencia: string;
  rotulo: string;
  sku: string;
  produto: string | null;
  grupo: string | null;
  ncm: string | null;
  nf_entrada: string | null;
  entrada: number;
  saida: number;
  cmv: number;
  estoque: number;
  valor_nf: number;
  valor_aterrissagem: number;
  custo_nf_unitario: number | null;
  custo_aterrissagem_unitario: number | null;
  icms_aliq: number | null;
  ipi_aliq: number | null;
}

export interface CompetenciaCfo {
  competencia: string;
  rotulo: string;
  status: string;
  valor_custo: number;
  valor_presumido: number | null;
  politica: Record<string, unknown> | null;
}

export interface PosicaoCfoLinha {
  sku: string;
  produto: string | null;
  centro: string | null;
  quantidade: number;
  custo_unitario: number;
  valor_total: number;
  custo_nf_unitario: number | null;
  valor_nf_total: number | null;
  fonte: string;
}

interface PresuncaoCfo {
  nf?: string;
  fornecedor?: string;
  data_chegada?: string | null;
  motivo?: string;
}

interface Parametros {
  dados: EvolucaoCfoLinha[];
  competencias: CompetenciaCfo[];
  posicoesPre: Map<string, PosicaoCfoLinha[]>;
}

interface Resultado {
  arquivo: string;
  competencias: number;
  skus: number;
}

const AZUL = "FF1F3864";
const AZUL_CLARO = "FFD9E2F3";
const BRANCO = "FFFFFFFF";
const CINZA = "FF666666";
const AMBAR = "FFFFF2CC";
const BORDA_AMBAR = "FFBF9000";
const Z_UN = "#,##0";
const Z_RS = "#,##0.00";
const Z_UNIT = "0.000000";
const Z_PCT = "0.00%";
const num = (v: unknown) => Number(v || 0);

const mesExtenso = (competencia: string) => {
  const [ano, mes] = competencia.slice(0, 10).split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(ano, mes - 1, 1)));
  return nome.charAt(0).toUpperCase() + nome.slice(1);
};

const mesNumerico = (competencia: string) => `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
const fmtRs = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtData = (v?: string | null) => v ? v.slice(0, 10).split("-").reverse().join("/") : "—";
const hoje = () => new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

const presuncoesDe = (c: CompetenciaCfo) => {
  const valor = c.politica?.presuncoes;
  return Array.isArray(valor) ? valor as PresuncaoCfo[] : [];
};

function bordaAmbar(): Partial<ExcelJS.Borders> {
  const lado = { style: "thin" as const, color: { argb: BORDA_AMBAR } };
  return { top: lado, left: lado, bottom: lado, right: lado };
}

function aplicarFonte(ws: ExcelJS.Worksheet) {
  ws.eachRow((row) => row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { ...cell.font, name: "Arial" };
  }));
}

function cabecalho(row: ExcelJS.Row) {
  row.height = 30;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    cell.font = { name: "Arial", bold: true, color: { argb: BRANCO } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}

function total(row: ExcelJS.Row) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_CLARO } };
    cell.font = { name: "Arial", bold: true };
  });
}

function titulo(
  ws: ExcelJS.Worksheet,
  nome: string,
  subtitulo: string,
  largura: number,
  avisos: string[],
) {
  for (let linha = 1; linha <= 4; linha += 1) ws.mergeCells(linha, 1, linha, largura);
  ws.getCell("A1").value = nome;
  ws.getCell("A1").font = { name: "Arial", size: 15, bold: true, color: { argb: AZUL } };
  ws.getCell("A2").value = "FETELY COMERCIO IMPORTACAO E EXPORTACAO LTDA · CNPJ 63.591.078/0001-48";
  ws.getCell("A3").value = subtitulo;
  ws.getCell("A4").value = `Emitido em ${hoje()} · fonte: fechamentos contábeis do SNCF`;
  [2, 3, 4].forEach((linha) => {
    ws.getCell(linha, 1).font = { name: "Arial", size: 9, color: { argb: CINZA } };
  });
  let proxima = 5;
  avisos.forEach((aviso) => {
    ws.mergeCells(proxima, 1, proxima, largura);
    const cell = ws.getCell(proxima, 1);
    cell.value = aviso;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMBAR } };
    cell.border = bordaAmbar();
    cell.font = { name: "Arial", size: 9, bold: true };
    cell.alignment = { wrapText: true, vertical: "middle" };
    ws.getRow(proxima).height = 28;
    proxima += 1;
  });
  return proxima + 1;
}

function secao(ws: ExcelJS.Worksheet, linha: number, texto: string, largura: number) {
  ws.mergeCells(linha, 1, linha, largura);
  const cell = ws.getCell(linha, 1);
  cell.value = texto;
  cell.font = { name: "Arial", bold: true, color: { argb: AZUL } };
  return linha + 1;
}

function formatarColuna(ws: ExcelJS.Worksheet, coluna: number, inicio: number, fim: number, formato: string) {
  for (let linha = inicio; linha <= fim; linha += 1) ws.getCell(linha, coluna).numFmt = formato;
}

function baixar(wb: ExcelJS.Workbook, arquivo: string) {
  return wb.xlsx.writeBuffer().then((buffer) => {
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = arquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
}

export async function exportarEvolucaoCfo({ dados, competencias, posicoesPre }: Parametros): Promise<Resultado> {
  if (!dados.length) throw new Error("Nenhuma competência fechada ou pré-fechada");

  const comps = [...new Map(dados.map((linha) => [linha.competencia, linha.rotulo])).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([competencia, rotulo]) => ({ competencia, rotulo: mesExtenso(competencia) || rotulo }));
  const compsIncluidas = comps.map((c) => competencias.find((item) => item.competencia === c.competencia))
    .filter((c): c is CompetenciaCfo => Boolean(c));
  const compsPre = compsIncluidas.filter((c) => c.status === "pre_fechado");
  const temPre = compsPre.length > 0;
  const ultima = comps[comps.length - 1];
  if (!ultima) throw new Error("Nenhuma competência fechada ou pré-fechada");

  const porComp = new Map<string, EvolucaoCfoLinha[]>();
  dados.forEach((linha) => {
    const lista = porComp.get(linha.competencia) ?? [];
    lista.push(linha);
    porComp.set(linha.competencia, lista);
  });
  const resumos = comps.map((c) => {
    const linhas = porComp.get(c.competencia) ?? [];
    const estoque = linhas.reduce((s, l) => s + num(l.estoque), 0);
    const valorNf = linhas.reduce((s, l) => s + num(l.valor_nf), 0);
    const valorAt = linhas.reduce((s, l) => s + num(l.valor_aterrissagem), 0);
    const meta = competencias.find((item) => item.competencia === c.competencia);
    return {
      ...c,
      status: meta?.status === "pre_fechado" ? "Pré-fechado" : "Fechado",
      skus: new Set(linhas.map((l) => l.sku)).size,
      entradas: linhas.reduce((s, l) => s + num(l.entrada), 0),
      saidas: linhas.reduce((s, l) => s + num(l.saida), 0),
      estoque,
      valorNf,
      valorAt,
      icms: valorNf - valorAt,
      icmsPct: valorNf ? (valorNf - valorAt) / valorNf : 0,
      medioNf: estoque ? valorNf / estoque : 0,
      medioAt: estoque ? valorAt / estoque : 0,
      cmv: linhas.reduce((s, l) => s + num(l.cmv), 0),
      snapshot: num(meta?.valor_custo),
    };
  });

  const divergente = resumos.find((r) => Math.abs(r.valorAt - r.snapshot) > 0.01);
  if (divergente) {
    throw new Error(`Export recusado: ${mesNumerico(divergente.competencia)} soma ${fmtRs(divergente.valorAt)} no export e ${fmtRs(divergente.snapshot)} no banco`);
  }

  const avisos = compsPre.flatMap((c) => presuncoesDe(c).map((p) =>
    `PRÉ-FECHAMENTO — ${mesNumerico(c.competencia)} não é definitivo. Inclui ${fmtRs(num(c.valor_presumido))} presumidos: ${p.nf ?? "NF"} ${p.fornecedor ?? "—"} (chegada ${fmtData(p.data_chegada).slice(0, 5)}).`,
  ));
  const wb = new ExcelJS.Workbook();
  wb.creator = "SNCF";
  wb.created = new Date();

  // Resumo Mensal
  const wsResumo = wb.addWorksheet("Resumo Mensal");
  const subtituloResumo = `${comps[0].rotulo} a ${ultima.rotulo} · competências fechadas${temPre ? " e pré-fechadas" : ""}`;
  let linha = titulo(wsResumo, "Resumo Mensal", subtituloResumo, 13, avisos);
  linha = secao(wsResumo, linha, "Posição de estoque nas duas bases de valorização", 13);
  const cabResumo = linha;
  wsResumo.addRow([]);
  wsResumo.getRow(cabResumo).values = [
    "Competência", "Status", "SKUs", "Entradas (un)", "Saídas (un)", "Estoque final (un)",
    "Estoque a Custo NF (R$)", "Estoque a Custo Aterrissagem (R$)", "ICMS creditável (R$)", "ICMS %",
    "Custo médio NF (R$/un)", "Custo médio Aterr. (R$/un)", "CMV do mês (R$)",
  ];
  cabecalho(wsResumo.getRow(cabResumo));
  resumos.forEach((r) => wsResumo.addRow([
    r.rotulo, r.status, r.skus, r.entradas, r.saidas, r.estoque, r.valorNf, r.valorAt,
    r.icms, r.icmsPct, r.medioNf, r.medioAt, r.cmv,
  ]));
  const ultimoResumo = resumos[resumos.length - 1];
  const posicaoRow = wsResumo.addRow([
    `${ultima.rotulo} (posição)`, ultimoResumo.status, ultimoResumo.skus,
    resumos.reduce((s, r) => s + r.entradas, 0), resumos.reduce((s, r) => s + r.saidas, 0),
    ultimoResumo.estoque, ultimoResumo.valorNf, ultimoResumo.valorAt, ultimoResumo.icms, ultimoResumo.icmsPct,
    null, null, resumos.reduce((s, r) => s + r.cmv, 0),
  ]);
  total(posicaoRow);
  const fimResumo = posicaoRow.number;
  [3, 4, 5, 6].forEach((c) => formatarColuna(wsResumo, c, cabResumo + 1, fimResumo, Z_UN));
  [7, 8, 9, 11, 12, 13].forEach((c) => formatarColuna(wsResumo, c, cabResumo + 1, fimResumo, Z_RS));
  formatarColuna(wsResumo, 10, cabResumo + 1, fimResumo, Z_PCT);
  linha = fimResumo + 2;
  linha = secao(wsResumo, linha, "Conferência com o sistema", 5);
  const cabConf = linha;
  wsResumo.getRow(cabConf).values = ["Competência", "Aterrissagem no export", "Snapshot no banco", "Diferença", "Confere"];
  cabecalho(wsResumo.getRow(cabConf));
  resumos.forEach((r) => wsResumo.addRow([r.rotulo, r.valorAt, r.snapshot, r.valorAt - r.snapshot, "✓"]));
  formatarColuna(wsResumo, 2, cabConf + 1, wsResumo.rowCount, Z_RS);
  formatarColuna(wsResumo, 3, cabConf + 1, wsResumo.rowCount, Z_RS);
  formatarColuna(wsResumo, 4, cabConf + 1, wsResumo.rowCount, Z_RS);
  linha = wsResumo.rowCount + 2;
  linha = secao(wsResumo, linha, "Leitura rápida", 13);
  const percentuais = resumos.map((r) => r.icmsPct);
  const leituras = [
    "Custo NF é a base gerencial: valor do produto na NF mais IPI.",
    "Custo de aterrissagem é a base contábil: o mesmo valor com o ICMS creditável excluído.",
    `ICMS creditável variou entre ${Math.min(...percentuais).toLocaleString("pt-BR", { style: "percent", minimumFractionDigits: 2 })} e ${Math.max(...percentuais).toLocaleString("pt-BR", { style: "percent", minimumFractionDigits: 2 })} do estoque no período.`,
    ...resumos.filter((r) => r.cmv === 0).map((r) => `${r.rotulo} não tem CMV: não houve faturamento no mês.`),
    ...competencias.filter((c) => c.status === "aberto" && c.competencia > ultima.competencia).map((c) => `${mesNumerico(c.competencia)} está em aberto e não aparece nesta planilha.`),
    ...compsPre.map((c) => `${mesNumerico(c.competencia)} é pré-fechamento: inclui ${fmtRs(num(c.valor_presumido))} presumidos pela quantidade da NF; o definitivo substituirá este número.`),
  ];
  leituras.forEach((texto) => {
    wsResumo.mergeCells(linha, 1, linha, 13);
    wsResumo.getCell(linha, 1).value = texto;
    wsResumo.getCell(linha, 1).font = { name: "Arial", size: 10 };
    linha += 1;
  });
  wsResumo.columns = [16, 14, 10, 15, 15, 19, 24, 30, 22, 11, 23, 25, 18].map((width) => ({ width }));
  wsResumo.views = [{ state: "frozen", ySplit: cabResumo }];

  // Por Grupo
  const wsGrupo = wb.addWorksheet("Por Grupo");
  const colsGrupo = 1 + comps.length * 3;
  const inicioGrupo = titulo(wsGrupo, "Por Grupo", "Quantidade e valor nas duas bases, mês a mês", colsGrupo, avisos);
  const cabGrupo = wsGrupo.getRow(inicioGrupo);
  cabGrupo.values = ["Grupo", ...comps.flatMap((c) => [`${c.rotulo} — un`, `${c.rotulo} — Custo NF`, `${c.rotulo} — Aterrissagem`])];
  cabecalho(cabGrupo);
  const grupos = [...new Set(dados.map((l) => l.grupo ?? "—"))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  grupos.forEach((grupo) => wsGrupo.addRow([grupo, ...comps.flatMap((c) => {
    const ls = (porComp.get(c.competencia) ?? []).filter((l) => (l.grupo ?? "—") === grupo);
    return [
      ls.reduce((s, l) => s + num(l.estoque), 0),
      ls.reduce((s, l) => s + num(l.valor_nf), 0),
      ls.reduce((s, l) => s + num(l.valor_aterrissagem), 0),
    ];
  })]));
  const totalGrupo = wsGrupo.addRow(["TOTAL", ...comps.flatMap((c) => {
    const ls = porComp.get(c.competencia) ?? [];
    return [ls.reduce((s, l) => s + num(l.estoque), 0), ls.reduce((s, l) => s + num(l.valor_nf), 0), ls.reduce((s, l) => s + num(l.valor_aterrissagem), 0)];
  })]);
  total(totalGrupo);
  comps.forEach((_, i) => {
    formatarColuna(wsGrupo, 2 + i * 3, inicioGrupo + 1, totalGrupo.number, Z_UN);
    formatarColuna(wsGrupo, 3 + i * 3, inicioGrupo + 1, totalGrupo.number, Z_RS);
    formatarColuna(wsGrupo, 4 + i * 3, inicioGrupo + 1, totalGrupo.number, Z_RS);
  });
  wsGrupo.getColumn(1).width = 32;
  for (let c = 2; c <= colsGrupo; c += 1) wsGrupo.getColumn(c).width = 19;
  wsGrupo.views = [{ state: "frozen", xSplit: 1, ySplit: inicioGrupo }];

  // Evolução por SKU
  const wsSku = wb.addWorksheet("Evolução por SKU");
  const bloco = temPre ? 7 : 6;
  const fixas = 9;
  const colsSku = fixas + comps.length * bloco;
  let inicioSku = titulo(wsSku, "Evolução por SKU", "Entrada · Saída · CMV · Estoque · Valor nas duas bases, por competência", colsSku, avisos);
  const faixa = wsSku.getRow(inicioSku);
  faixa.getCell(1).value = "Identificação do produto";
  wsSku.mergeCells(inicioSku, 1, inicioSku, fixas);
  comps.forEach((c, i) => {
    const de = fixas + 1 + i * bloco;
    faixa.getCell(de).value = c.rotulo;
    wsSku.mergeCells(inicioSku, de, inicioSku, de + bloco - 1);
  });
  cabecalho(faixa);
  inicioSku += 1;
  const headerSku = wsSku.getRow(inicioSku);
  headerSku.values = [
    "SKU", "Produto", "Grupo", "NCM", "NF de entrada", "Custo NF unit.", "Custo Aterr. unit.", "ICMS %", "IPI %",
    ...comps.flatMap(() => ["Entrada", "Saída", "CMV (R$)", "Estoque", "Valor NF (R$)", "Valor Aterr. (R$)", ...(temPre ? ["Presumido"] : [])]),
  ];
  cabecalho(headerSku);
  const porCompSku = new Map(dados.map((l) => [`${l.competencia}|${l.sku}`, l]));
  const presumidos = new Map([...posicoesPre.entries()].map(([comp, ls]) => [comp, new Set(ls.filter((l) => l.fonte === "presumido").map((l) => l.sku))]));
  const skus = [...new Set(dados.map((l) => l.sku))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  skus.forEach((sku) => {
    const ref = porCompSku.get(`${ultima.competencia}|${sku}`) ?? dados.find((l) => l.sku === sku);
    if (!ref) return;
    wsSku.addRow([
      sku, ref.produto ?? "", ref.grupo ?? "", ref.ncm ?? "", String(ref.nf_entrada ?? ""),
      ref.custo_nf_unitario == null ? null : num(ref.custo_nf_unitario),
      ref.custo_aterrissagem_unitario == null ? null : num(ref.custo_aterrissagem_unitario),
      ref.icms_aliq == null ? null : num(ref.icms_aliq), ref.ipi_aliq == null ? null : num(ref.ipi_aliq),
      ...comps.flatMap((c) => {
        const l = porCompSku.get(`${c.competencia}|${sku}`);
        return [num(l?.entrada), num(l?.saida), num(l?.cmv), num(l?.estoque), num(l?.valor_nf), num(l?.valor_aterrissagem), ...(temPre ? [presumidos.get(c.competencia)?.has(sku) ? "Sim" : "Não"] : [])];
      }),
    ]);
  });
  const totalSkuValues: (string | number | null)[] = ["TOTAL", null, null, null, null, null, null, null, null];
  comps.forEach((c) => {
    const ls = porComp.get(c.competencia) ?? [];
    totalSkuValues.push(
      ls.reduce((s, l) => s + num(l.entrada), 0), ls.reduce((s, l) => s + num(l.saida), 0),
      ls.reduce((s, l) => s + num(l.cmv), 0), ls.reduce((s, l) => s + num(l.estoque), 0),
      ls.reduce((s, l) => s + num(l.valor_nf), 0), ls.reduce((s, l) => s + num(l.valor_aterrissagem), 0),
      ...(temPre ? [null] : []),
    );
  });
  const totalSku = wsSku.addRow(totalSkuValues);
  total(totalSku);
  formatarColuna(wsSku, 6, inicioSku + 1, totalSku.number, Z_UNIT);
  formatarColuna(wsSku, 7, inicioSku + 1, totalSku.number, Z_UNIT);
  formatarColuna(wsSku, 8, inicioSku + 1, totalSku.number, Z_PCT);
  formatarColuna(wsSku, 9, inicioSku + 1, totalSku.number, Z_PCT);
  comps.forEach((_, i) => {
    const de = fixas + 1 + i * bloco;
    formatarColuna(wsSku, de, inicioSku + 1, totalSku.number, Z_UN);
    formatarColuna(wsSku, de + 1, inicioSku + 1, totalSku.number, Z_UN);
    formatarColuna(wsSku, de + 2, inicioSku + 1, totalSku.number, Z_RS);
    formatarColuna(wsSku, de + 3, inicioSku + 1, totalSku.number, Z_UN);
    formatarColuna(wsSku, de + 4, inicioSku + 1, totalSku.number, Z_RS);
    formatarColuna(wsSku, de + 5, inicioSku + 1, totalSku.number, Z_RS);
  });
  [18, 46, 24, 12, 17, 18, 20, 11, 11].forEach((width, i) => { wsSku.getColumn(i + 1).width = width; });
  for (let c = fixas + 1; c <= colsSku; c += 1) wsSku.getColumn(c).width = 15;
  wsSku.autoFilter = { from: { row: inicioSku, column: 1 }, to: { row: totalSku.number - 1, column: colsSku } };
  wsSku.views = [{ state: "frozen", xSplit: 2, ySplit: inicioSku }];

  // Presunções
  if (temPre) {
    const wsPre = wb.addWorksheet("Presunções");
    const meses = compsPre.map((c) => mesNumerico(c.competencia)).join(", ");
    let inicioPre = titulo(wsPre, `Presunções do Pré-fechamento — ${meses}`, "Mercadoria presumida no snapshot", 8, avisos);
    wsPre.mergeCells(inicioPre, 1, inicioPre, 8);
    wsPre.getCell(inicioPre, 1).value = "Mercadoria com chegada física registrada, ainda sem termo de conferência. O valor considera a quantidade da NF, ao custo de aterrissagem. Nada foi lançado no estoque; o fechamento definitivo substitui estas linhas pela contagem real.";
    wsPre.getCell(inicioPre, 1).alignment = { wrapText: true };
    wsPre.getRow(inicioPre).height = 42;
    inicioPre += 2;
    wsPre.getRow(inicioPre).values = ["SKU", "Produto", "Centro", "Un. na NF", "Custo Aterr. unit. (R$)", "Valor Aterrissagem (R$)", "Custo NF unit. (R$)", "Valor NF (R$)"];
    cabecalho(wsPre.getRow(inicioPre));
    const linhasPre = compsPre.flatMap((c) => (posicoesPre.get(c.competencia) ?? []).filter((l) => l.fonte === "presumido"));
    linhasPre.forEach((l) => wsPre.addRow([l.sku, l.produto ?? "", l.centro ?? "", num(l.quantidade), num(l.custo_unitario), num(l.valor_total), l.custo_nf_unitario == null ? null : num(l.custo_nf_unitario), l.valor_nf_total == null ? null : num(l.valor_nf_total)]));
    const totalPre = wsPre.addRow(["TOTAL", "", "", linhasPre.reduce((s, l) => s + num(l.quantidade), 0), null, linhasPre.reduce((s, l) => s + num(l.valor_total), 0), null, linhasPre.reduce((s, l) => s + num(l.valor_nf_total), 0)]);
    total(totalPre);
    formatarColuna(wsPre, 4, inicioPre + 1, totalPre.number, Z_UN);
    formatarColuna(wsPre, 5, inicioPre + 1, totalPre.number, Z_UNIT);
    formatarColuna(wsPre, 6, inicioPre + 1, totalPre.number, Z_RS);
    formatarColuna(wsPre, 7, inicioPre + 1, totalPre.number, Z_UNIT);
    formatarColuna(wsPre, 8, inicioPre + 1, totalPre.number, Z_RS);
    let meta = totalPre.number + 2;
    compsPre.flatMap((c) => presuncoesDe(c)).forEach((p) => {
      wsPre.mergeCells(meta, 1, meta, 8);
      wsPre.getCell(meta, 1).value = `NF ${p.nf ?? "—"} · ${p.fornecedor ?? "—"} · chegada ${fmtData(p.data_chegada)} · ${p.motivo ?? "—"}`;
      meta += 1;
    });
    wsPre.columns = [18, 46, 22, 14, 24, 24, 22, 18].map((width) => ({ width }));
    wsPre.views = [{ state: "frozen", ySplit: inicioPre }];
  }

  // Critério e Premissas
  const wsCriterio = wb.addWorksheet("Critério e Premissas");
  const inicioCriterio = titulo(wsCriterio, "Critério e Premissas", "Bases de valorização e políticas do fechamento", 2, avisos);
  wsCriterio.getRow(inicioCriterio).values = ["Item", "Tratamento"];
  cabecalho(wsCriterio.getRow(inicioCriterio));
  const recente = [...compsIncluidas].sort((a, b) => b.competencia.localeCompare(a.competencia))[0];
  const tratamentos: [string, string][] = [
    ["Custo NF", "valor do produto na NF + IPI"],
    ["Custo de aterrissagem", "valor do produto na NF − ICMS + IPI"],
    ["Base contábil", "Custo de aterrissagem (ICMS creditável excluído do custo)"],
    ["Base gerencial", "Custo NF (produto + IPI, sem excluir ICMS)"],
    ["Fonte dos números", "Snapshots congelados de cada fechamento contábil"],
    ["Competências incluídas", comps.map((c) => c.rotulo).join(", ")],
  ];
  const rotulosPolitica: Record<string, string> = {
    ipi: "IPI", icms: "ICMS", pis_cofins: "PIS/COFINS", armazenagem: "Armazenagem",
    frete_entrada: "Frete de entrada", competencia_entrada: "Competência de entrada",
  };
  const tecnicas = new Set(["presuncoes", "pre_fechamento", "forcado"]);
  Object.entries(recente?.politica ?? {}).filter(([chave]) => !tecnicas.has(chave)).forEach(([chave, valor]) => {
    const texto = Array.isArray(valor) ? valor.map(String).join(", ") : typeof valor === "object" && valor !== null ? JSON.stringify(valor) : String(valor ?? "");
    tratamentos.push([rotulosPolitica[chave] ?? chave.replaceAll("_", " "), texto]);
  });
  tratamentos.forEach((item) => wsCriterio.addRow(item));
  wsCriterio.columns = [{ width: 34 }, { width: 95 }];
  wsCriterio.views = [{ state: "frozen", ySplit: inicioCriterio }];

  wb.eachSheet(aplicarFonte);
  const arquivo = `Fetely_Estoque_Mensal_CFO_${ultima.competencia.slice(0, 4)}_${ultima.competencia.slice(5, 7)}${temPre ? "_PRE-FECHAMENTO" : ""}.xlsx`;
  await baixar(wb, arquivo);
  return { arquivo, competencias: comps.length, skus: skus.length };
}