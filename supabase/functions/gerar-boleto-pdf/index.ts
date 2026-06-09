import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Utilitários ──────────────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fmtBRL(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

function fmtDateBR(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("pt-BR");
}

function dvMod10(numero: string): number {
  let soma = 0, mult = 2;
  for (const d of [...numero].reverse()) {
    const v = parseInt(d) * mult;
    soma += Math.floor(v / 10) + (v % 10);
    mult = mult === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

/** Formata nosso número para exibição: "60/000915566942-DV" */
function formatNossoNumero(carteira: string, seq: string): string {
  const padded = seq.padStart(9, "0");
  const dv = dvMod10(carteira + padded);
  return `${carteira}/${padded}-${dv}`;
}

// ─── Código de barras I25 ─────────────────────────────────────────────────────

const I25: Record<string, string> = {
  "0":"00110","1":"10001","2":"01001","3":"11000","4":"00101",
  "5":"10100","6":"01100","7":"00011","8":"10010","9":"01010",
};

function encodeI25(digits: string): boolean[] {
  const bars: boolean[] = [];
  bars.push(true, false, true, false);
  for (let i = 0; i < digits.length; i += 2) {
    const d1 = I25[digits[i]];
    const d2 = I25[digits[i + 1]];
    for (let j = 0; j < 5; j++) {
      bars.push(d1[j] === "1");
      bars.push(d2[j] === "1");
    }
  }
  bars.push(true, true, false, true);
  return bars;
}

function desenharCodigoBarras(
  page: ReturnType<PDFDocument["addPage"]>,
  codigoBarras: string,
  x: number, y: number, largura: number, altura: number,
): void {
  const digits = codigoBarras.length % 2 === 0 ? codigoBarras : "0" + codigoBarras;
  const bars   = encodeI25(digits);
  const mod    = largura / bars.length;
  let   xAtual = x;
  for (let i = 0; i < bars.length; i++) {
    const w = bars[i] ? mod * 2.5 : mod;
    if (i % 2 === 0) {
      page.drawRectangle({ x: xAtual, y, width: w, height: altura, color: rgb(0,0,0) });
    }
    xAtual += w;
  }
}

// ─── Interface ────────────────────────────────────────────────────────────────

interface DadosBoleto {
  beneficiario_nome: string;
  beneficiario_cnpj: string;
  agencia_cedente:   string;
  carteira:          string;
  nosso_numero_seq:  string;
  pagador_nome:      string;
  pagador_doc:       string;
  pagador_endereco:  string;
  numero_documento:  string;
  data_documento:    string;
  data_vencimento:   string;
  valor:             number;
  linha_digitavel:   string;
  codigo_barras:     string;
  instrucoes:        string[];
}

// ─── Construção do PDF — layout FEBRABAN ──────────────────────────────────────

async function buildPdf(dados: DadosBoleto): Promise<Uint8Array> {
  const pdf  = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();

  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PRETO = rgb(0,    0,    0   );
  const CINZA = rgb(0.40, 0.40, 0.40);
  const BORDA = rgb(0.65, 0.65, 0.65);

  const mx = 36;
  const lw = width - mx * 2;

  const nossoNumFmt = formatNossoNumero(dados.carteira, dados.nosso_numero_seq);

  function vline(x: number, y: number, h: number) {
    page.drawLine({ start: { x, y }, end: { x, y: y + h }, thickness: 0.5, color: BORDA });
  }

  function cell(x: number, yBottom: number, w: number, label: string, value: string, bold = true) {
    page.drawText(label, { x: x + 2, y: yBottom + 2, size: 6, font, color: CINZA });
    if (!value) return;
    let txt = value;
    const maxW = w - 4;
    const fs = 8;
    if (font.widthOfTextAtSize(txt, fs) > maxW) {
      while (txt.length > 4 && font.widthOfTextAtSize(txt + "..", fs) > maxW) {
        txt = txt.slice(0, -1);
      }
      if (txt.length < value.length) txt += "..";
    }
    page.drawText(txt, { x: x + 2, y: yBottom + 11, size: fs, font: bold ? fontBold : font, color: PRETO });
  }

  function drawSection(topY: number): number {
    let y = topY;

    // HEADER: BANCO SAFRA S.A. | 422-7 | linha digitável
    const hdrH = 30, nomeW = 105, codW = 40;
    page.drawLine({ start: { x: mx, y }, end: { x: mx + lw, y }, thickness: 1.2, color: PRETO });
    page.drawLine({ start: { x: mx, y: y - hdrH }, end: { x: mx + lw, y: y - hdrH }, thickness: 0.8, color: PRETO });
    page.drawLine({ start: { x: mx, y: y - hdrH }, end: { x: mx, y }, thickness: 1.2, color: PRETO });
    page.drawLine({ start: { x: mx + lw, y: y - hdrH }, end: { x: mx + lw, y }, thickness: 1.2, color: PRETO });

    page.drawText("BANCO SAFRA S.A.", { x: mx + 4, y: y - 19, size: 9, font: fontBold, color: PRETO });
    vline(mx + nomeW, y - hdrH, hdrH);

    page.drawText("422-7", { x: mx + nomeW + 9, y: y - 20, size: 11, font: fontBold, color: PRETO });
    vline(mx + nomeW + codW, y - hdrH, hdrH);

    const ldSize = 9.5;
    const ldW    = fontBold.widthOfTextAtSize(dados.linha_digitavel, ldSize);
    const ldX    = Math.max(mx + nomeW + codW + 6, mx + lw - ldW - 3);
    page.drawText(dados.linha_digitavel, { x: ldX, y: y - 19, size: ldSize, font: fontBold, color: PRETO });
    y -= hdrH;

    // ROW 1: Local de pagamento | Vencimento
    const r1H = 22, vencW = 95;
    cell(mx, y - r1H, lw - vencW, "Local de Pagamento", "Pagavel em qualquer agencia bancaria ate o vencimento");
    vline(mx + lw - vencW, y - r1H, r1H);
    cell(mx + lw - vencW, y - r1H, vencW, "Vencimento", fmtDateBR(dados.data_vencimento));
    page.drawLine({ start: { x: mx, y: y - r1H }, end: { x: mx + lw, y: y - r1H }, thickness: 0.5, color: PRETO });
    y -= r1H;

    // ROW 2: Beneficiário | Agência/Código Cedente
    const r2H = 22, agW = 120;
    cell(mx, y - r2H, lw - agW, "Beneficiario", dados.beneficiario_nome + "   CNPJ: " + dados.beneficiario_cnpj);
    vline(mx + lw - agW, y - r2H, r2H);
    cell(mx + lw - agW, y - r2H, agW, "Agencia/Codigo do Cedente", dados.agencia_cedente);
    page.drawLine({ start: { x: mx, y: y - r2H }, end: { x: mx + lw, y: y - r2H }, thickness: 0.5, color: PRETO });
    y -= r2H;

    // ROW 3: Data doc | Nº doc | Espécie | Aceite | Data proc | Nosso Número
    const r3H = 22, nnW = 125;
    const w_dd = 62, w_nd = 100, w_es = 42, w_ac = 34;
    const w_dp = lw - nnW - w_dd - w_nd - w_es - w_ac;
    let rx = mx;
    cell(rx, y - r3H, w_dd, "Data do Documento",    fmtDateBR(dados.data_documento));  rx += w_dd; vline(rx, y - r3H, r3H);
    cell(rx, y - r3H, w_nd, "Numero do Documento",  dados.numero_documento);           rx += w_nd; vline(rx, y - r3H, r3H);
    cell(rx, y - r3H, w_es, "Especie Doc.",         "DM");                             rx += w_es; vline(rx, y - r3H, r3H);
    cell(rx, y - r3H, w_ac, "Aceite",               "N");                              rx += w_ac; vline(rx, y - r3H, r3H);
    cell(rx, y - r3H, w_dp, "Data do Processamento", fmtDateBR(dados.data_documento));
    vline(mx + lw - nnW, y - r3H, r3H);
    cell(mx + lw - nnW, y - r3H, nnW, "Nosso Numero", nossoNumFmt);
    page.drawLine({ start: { x: mx, y: y - r3H }, end: { x: mx + lw, y: y - r3H }, thickness: 0.5, color: PRETO });
    y -= r3H;

    // ROW 4: Uso banco | Carteira | Espécie | Qtde | Valor | Valor do documento
    const r4H = 22, valDocW = 110;
    const w_ub = 75, w_ca = 48, w_e2 = 40, w_qt = 55;
    const w_va = lw - valDocW - w_ub - w_ca - w_e2 - w_qt;
    rx = mx;
    cell(rx, y - r4H, w_ub, "Uso do Banco", "");             rx += w_ub; vline(rx, y - r4H, r4H);
    cell(rx, y - r4H, w_ca, "Carteira", dados.carteira);     rx += w_ca; vline(rx, y - r4H, r4H);
    cell(rx, y - r4H, w_e2, "Especie",  "R$");               rx += w_e2; vline(rx, y - r4H, r4H);
    cell(rx, y - r4H, w_qt, "Quantidade", "");                rx += w_qt; vline(rx, y - r4H, r4H);
    cell(rx, y - r4H, w_va, "Valor",     "");
    vline(mx + lw - valDocW, y - r4H, r4H);
    cell(mx + lw - valDocW, y - r4H, valDocW, "(=) Valor do Documento", fmtBRL(dados.valor));
    page.drawLine({ start: { x: mx, y: y - r4H }, end: { x: mx + lw, y: y - r4H }, thickness: 0.5, color: PRETO });
    y -= r4H;

    // ROW 5: Instruções (esq.) | Débito/Crédito (dir.)
    const instrH = 76, instrW = Math.round(lw * 0.62);
    page.drawText("Instrucoes (Texto de responsabilidade do Beneficiario)", {
      x: mx + 2, y: y - 9, size: 6, font, color: CINZA,
    });
    for (let i = 0; i < Math.min(dados.instrucoes.length, 5); i++) {
      page.drawText(dados.instrucoes[i], { x: mx + 2, y: y - 20 - (i * 11), size: 7.5, font, color: PRETO });
    }
    vline(mx + instrW, y - instrH, instrH);
    const subCampos = [
      "(-) Desconto / Abatimentos", "(-) Outras Deducoes",
      "(+) Mora / Multa", "(+) Outros Acrescimos", "(=) Valor Cobrado",
    ];
    const subH = instrH / subCampos.length;
    for (let i = 0; i < subCampos.length; i++) {
      const sy = y - (i * subH);
      page.drawText(subCampos[i], { x: mx + instrW + 2, y: sy - subH + 3, size: 6, font, color: CINZA });
      if (i < subCampos.length - 1) {
        page.drawLine({ start: { x: mx + instrW, y: sy - subH }, end: { x: mx + lw, y: sy - subH }, thickness: 0.4, color: BORDA });
      }
    }
    page.drawLine({ start: { x: mx, y: y - instrH }, end: { x: mx + lw, y: y - instrH }, thickness: 0.5, color: PRETO });
    y -= instrH;

    // ROW 6: Pagador
    const pagH = 32;
    page.drawText("Pagador:", { x: mx + 2, y: y - 9, size: 6, font, color: CINZA });
    page.drawText(dados.pagador_nome + "   CPF/CNPJ: " + dados.pagador_doc, {
      x: mx + 48, y: y - 9, size: 8, font: fontBold, color: PRETO,
    });
    if (dados.pagador_endereco) {
      page.drawText(dados.pagador_endereco, { x: mx + 2, y: y - 22, size: 7, font, color: PRETO });
    }
    page.drawLine({ start: { x: mx, y: y - pagH }, end: { x: mx + lw, y: y - pagH }, thickness: 0.5, color: PRETO });
    y -= pagH;

    return y;
  }

  // ── Layout: Recibo do Sacado + separador + Ficha de Compensação + barcode ──

  const topY = height - 22;

  page.drawText("Recibo do Sacado", { x: mx + lw - 72, y: topY + 4, size: 6.5, font, color: CINZA });
  const reciboBottom = drawSection(topY);

  const sepY = reciboBottom - 11;
  for (let xi = mx; xi < mx + lw; xi += 7) {
    page.drawLine({ start: { x: xi, y: sepY }, end: { x: xi + 4, y: sepY }, thickness: 0.5, color: rgb(0.75,0.75,0.75) });
  }
  page.drawText("Corte aqui", { x: mx, y: sepY + 2, size: 6, font, color: rgb(0.70,0.70,0.70) });

  const fichaTop = sepY - 13;
  page.drawText("Ficha de Compensacao", { x: mx + lw - 86, y: fichaTop + 4, size: 6.5, font, color: CINZA });
  const fichaBottom = drawSection(fichaTop);

  page.drawText("Sacador/Avalista:",    { x: mx + 2,        y: fichaBottom - 9, size: 6, font, color: CINZA });
  page.drawText("Autenticacao Mecanica",{ x: mx + lw - 88,  y: fichaBottom - 9, size: 7, font, color: CINZA });
  page.drawLine({ start: { x: mx, y: fichaBottom - 16 }, end: { x: mx + lw, y: fichaBottom - 16 }, thickness: 0.5, color: PRETO });

  const cbTop = fichaBottom - 76;
  desenharCodigoBarras(page, dados.codigo_barras, mx, cbTop, lw, 50);
  page.drawText("Autenticacao Mecanica", { x: mx + lw - 88, y: cbTop - 12, size: 7, font, color: CINZA });
  page.drawText("Ficha de Compensacao",  { x: mx + lw - 88, y: cbTop - 23, size: 7, font, color: CINZA });

  return await pdf.save();
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey    = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, erro: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const sbUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, erro: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sb   = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const tituloId: string = body.titulo_id;
    if (!tituloId) {
      return new Response(JSON.stringify({ ok: false, erro: "titulo_id e obrigatorio" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: titulo, error: tErr } = await sb
      .from("titulo_a_receber")
      .select(`
        id, numero_titulo, numero_parcela, total_parcelas, valor_bruto,
        data_vencimento_atual, data_criacao, nosso_numero_seq,
        linha_digitavel, codigo_barras_boleto,
        conta:contas_pagar_receber(
          parceiro:parceiros_comerciais(
            razao_social, cnpj, cpf, logradouro, numero, bairro, cidade, uf, cep
          )
        ),
        pedido:pedidos(id_externo)
      `)
      .eq("id", tituloId)
      .single();

    if (tErr || !titulo) {
      return new Response(JSON.stringify({ ok: false, erro: "Titulo nao encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // deno-lint-ignore no-explicit-any
    const t = titulo as any;
    const parceiro = t.conta?.parceiro;

    if (!t.nosso_numero_seq || !t.linha_digitavel || !t.codigo_barras_boleto) {
      return new Response(JSON.stringify({ ok: false, erro: "Boleto sem nosso numero. Execute gerar-remessa-safra primeiro." }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: paramRows } = await sb.from("parametros_remessa_safra").select("chave, valor");
    const params: Record<string, string> = {};
    for (const row of (paramRows ?? []) as { chave: string; valor: string }[]) params[row.chave] = row.valor;

    const agencia        = params.agencia  ?? "0005";
    const conta7d        = params.conta_7d ?? "5804446";
    const agenciaCedente = `${agencia}/${conta7d}`;

    const enderecoPagador = [
      parceiro?.logradouro, parceiro?.numero,
      parceiro?.bairro, parceiro?.cidade,
      parceiro?.uf,     parceiro?.cep,
    ].filter(Boolean).join(", ");

    const instrucoes: string[] = [];
    if (params.instrucao_linha_1) instrucoes.push(params.instrucao_linha_1);
    if (params.instrucao_linha_2) instrucoes.push(params.instrucao_linha_2);
    if (instrucoes.length === 0) {
      const map: Record<string, string> = {
        "08": "Nao receber apos 30 dias do vencimento.",
        "09": "Protestar apos 3 dias do vencimento.",
        "00": "",
      };
      const i1 = map[params.politica_instrucao_1 ?? "00"] ?? "";
      const i2 = map[params.politica_instrucao_2 ?? "00"] ?? "";
      if (i1) instrucoes.push(i1);
      if (i2) instrucoes.push(i2);
    }
    if (instrucoes.length === 0) instrucoes.push("Nao receber apos 30 dias do vencimento.");

    const dados: DadosBoleto = {
      beneficiario_nome: "FETELY COMERCIO IMPORTACAO E EXPORTACAO LTDA",
      beneficiario_cnpj: "63.591.078/0001-48",
      agencia_cedente:   agenciaCedente,
      carteira:          params.tipo_carteira ?? "60",
      nosso_numero_seq:  t.nosso_numero_seq,
      pagador_nome:      parceiro?.razao_social ?? "—",
      pagador_doc:       parceiro?.cnpj ?? parceiro?.cpf ?? "—",
      pagador_endereco:  enderecoPagador,
      numero_documento:  `${t.pedido?.id_externo ?? t.numero_titulo}-${String(t.numero_parcela).padStart(2, "0")}`,
      data_documento:    t.data_criacao ?? new Date().toISOString().slice(0, 10),
      data_vencimento:   t.data_vencimento_atual,
      valor:             Number(t.valor_bruto),
      linha_digitavel:   t.linha_digitavel,
      codigo_barras:     t.codigo_barras_boleto,
      instrucoes,
    };

    const pdfBytes  = await buildPdf(dados);
    const pdfBase64 = bytesToBase64(pdfBytes);

    return new Response(
      JSON.stringify({ ok: true, pdf_base64: pdfBase64, nome_arquivo: `boleto_${t.nosso_numero_seq}.pdf` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    console.error("gerar-boleto-pdf erro fatal", e);
    return new Response(
      JSON.stringify({ ok: false, erro: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
