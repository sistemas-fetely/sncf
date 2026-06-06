import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

// ─── Geração do código de barras Interleaved 2 of 5 ─────────────────────────
// Padrão bancário brasileiro

const I25_ENCODING: Record<string, string> = {
  "0":"00110","1":"10001","2":"01001","3":"11000","4":"00101",
  "5":"10100","6":"01100","7":"00011","8":"10010","9":"01010",
};

function encodeI25(digits: string): boolean[] {
  const bars: boolean[] = [];
  // Start: 4 barras estreitas alternando barra/espaço
  bars.push(true, false, true, false);
  // Pares de dígitos
  for (let i = 0; i < digits.length; i += 2) {
    const d1 = I25_ENCODING[digits[i]];
    const d2 = I25_ENCODING[digits[i + 1]];
    for (let j = 0; j < 5; j++) {
      bars.push(d1[j] === "1"); // barra
      bars.push(d2[j] === "1"); // espaço
    }
  }
  // Stop: barra larga + 2 estreitas
  bars.push(true, true, false, true);
  return bars;
}

function desenharCodigoBarras(
  page: ReturnType<PDFDocument["addPage"]>,
  codigoBarras: string,
  x: number,
  y: number,
  larguraTotal: number,
  altura: number
): void {
  // Garantir dígitos pares (I25 exige par)
  const digits = codigoBarras.length % 2 === 0 ? codigoBarras : "0" + codigoBarras;
  const bars = encodeI25(digits);

  // Calcular largura por módulo
  const totalModulos = bars.length;
  const modulo = larguraTotal / totalModulos;

  let xAtual = x;
  for (let i = 0; i < bars.length; i++) {
    const ehBarra = i % 2 === 0; // pares = barras, ímpares = espaços
    const largo = bars[i];
    const largura = largo ? modulo * 2.5 : modulo;

    if (ehBarra) {
      page.drawRectangle({
        x: xAtual,
        y,
        width: largura,
        height: altura,
        color: rgb(0, 0, 0),
      });
    }
    xAtual += largura;
  }
}

// ─── Construção do PDF do boleto ─────────────────────────────────────────────

interface DadosBoleto {
  // Beneficiário
  beneficiario_nome: string;
  beneficiario_cnpj: string;
  agencia_cod: string;
  // Pagador
  pagador_nome: string;
  pagador_cnpj: string;
  pagador_endereco: string;
  // Título
  numero_documento: string;
  carteira: string;
  nosso_numero: string;
  data_documento: string;
  data_vencimento: string;
  valor: number;
  especie: string;
  // Código de barras
  codigo_barras: string;
  linha_digitavel: string;
}

async function buildPdf(dados: DadosBoleto): Promise<Uint8Array> {
  const pdf  = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4 portrait
  const { width, height } = page.getSize();

  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const VERDE  = rgb(0.176, 0.290, 0.243); // #2d4a3e
  const PRETO  = rgb(0, 0, 0);
  const CINZA  = rgb(0.4, 0.4, 0.4);
  const BORDA  = rgb(0.7, 0.7, 0.7);
  const BRANCO = rgb(1, 1, 1);

  const mx = 36; // margem esquerda
  const lw = width - mx * 2; // largura útil

  let y = height - 30;

  // ── Header verde ───────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: height - 70, width, height: 70, color: VERDE });
  page.drawText("Fetély.", { x: mx, y: height - 48, size: 22, font: fontBold, color: BRANCO });
  page.drawText("Recibo do Pagador", { x: width - mx - 120, y: height - 30, size: 9, font, color: BRANCO });

  y = height - 90;

  // ── Linha 1: Beneficiário | Nosso Número | Vencimento ──────────
  const col1w = lw * 0.5;
  const col2w = lw * 0.25;
  const col3w = lw * 0.25;

  function drawLabel(lx: number, ly: number, label: string, value: string, w: number) {
    page.drawText(label, { x: lx, y: ly + 13, size: 7, font, color: CINZA });
    page.drawText(value, { x: lx, y: ly, size: 9, font: fontBold, color: PRETO });
    page.drawLine({ start: { x: lx, y: ly - 3 }, end: { x: lx + w - 4, y: ly - 3 }, thickness: 0.3, color: BORDA });
  }

  drawLabel(mx, y, "Beneficiário", dados.beneficiario_nome + "  CNPJ: " + dados.beneficiario_cnpj, col1w);
  drawLabel(mx + col1w, y, "Nosso Número", dados.nosso_numero, col2w);
  drawLabel(mx + col1w + col2w, y, "Vencimento", fmtDateBR(dados.data_vencimento), col3w);

  y -= 32;

  // ── Linha 2: Data doc | Nº doc | Carteira | Agência | Valor ────
  const c = lw / 5;
  drawLabel(mx,         y, "Data do documento", fmtDateBR(dados.data_documento), c);
  drawLabel(mx + c,     y, "Número do documento", dados.numero_documento, c);
  drawLabel(mx + c*2,   y, "Carteira", dados.carteira, c);
  drawLabel(mx + c*3,   y, "Agência/Cód. Beneficiário", dados.agencia_cod, c);
  drawLabel(mx + c*4,   y, "Valor", fmtBRL(dados.valor), c);

  y -= 32;

  // ── Pagador ────────────────────────────────────────────────────
  page.drawText("Pagador", { x: mx, y: y + 13, size: 7, font, color: CINZA });
  page.drawText(dados.pagador_nome + "  CNPJ/CPF: " + dados.pagador_cnpj, { x: mx, y, size: 9, font: fontBold, color: PRETO });
  y -= 16;
  page.drawText(dados.pagador_endereco, { x: mx, y, size: 8, font, color: PRETO });
  y -= 8;
  page.drawLine({ start: { x: mx, y }, end: { x: mx + lw, y }, thickness: 0.3, color: BORDA });

  y -= 14;

  // ── Nota ───────────────────────────────────────────────────────
  page.drawText(
    "Boleto gerado eletronicamente pelo sistema Fetély",
    { x: mx, y, size: 8, font, color: CINZA }
  );

  // ── Linha tracejada ────────────────────────────────────────────
  y -= 20;
  for (let xi = mx; xi < mx + lw; xi += 6) {
    page.drawLine({ start: { x: xi, y }, end: { x: xi + 3, y }, thickness: 0.5, color: BORDA });
  }

  // ════════════════ FICHA DE COMPENSAÇÃO ═══════════════════════
  y -= 24;

  // ── Logo + banco + linha digitável ────────────────────────────
  page.drawText("Safra", { x: mx, y, size: 16, font: fontBold, color: VERDE });
  page.drawText("422-7", { x: mx + 60, y, size: 11, font: fontBold, color: PRETO });
  page.drawText(dados.linha_digitavel, { x: mx + 110, y, size: 10, font: fontBold, color: PRETO });

  y -= 24;
  page.drawLine({ start: { x: mx, y }, end: { x: mx + lw, y }, thickness: 0.5, color: PRETO });
  y -= 18;

  // ── Campos principais ─────────────────────────────────────────
  const cw = lw * 0.6;
  const rw = lw * 0.4;

  drawLabel(mx,      y, "Local de Pagamento", "Pagável em qualquer banco", cw);
  drawLabel(mx + cw, y, "Vencimento", fmtDateBR(dados.data_vencimento), rw);
  y -= 32;

  drawLabel(mx,      y, "Beneficiário", dados.beneficiario_nome + "  CNPJ: " + dados.beneficiario_cnpj, cw);
  drawLabel(mx + cw, y, "Agência/Cód. Beneficiário", dados.agencia_cod, rw);
  y -= 32;

  // ── Grid de campos ─────────────────────────────────────────────
  const g = lw / 6;
  drawLabel(mx,       y, "Data do Doc.", fmtDateBR(dados.data_documento), g);
  drawLabel(mx + g,   y, "Nº do Doc.",   dados.numero_documento, g);
  drawLabel(mx + g*2, y, "Esp. Doc.",    dados.especie, g * 0.5);
  drawLabel(mx + g*2.5, y, "Aceite",     "Não", g * 0.5);
  drawLabel(mx + g*3, y, "Data do Movto.", fmtDateBR(dados.data_documento), g);
  drawLabel(mx + g*4, y, "Nosso Número", dados.nosso_numero, g * 2);
  y -= 32;

  drawLabel(mx,       y, "Data do Oper.", fmtDateBR(dados.data_documento), g);
  drawLabel(mx + g,   y, "Carteira",  dados.carteira, g);
  drawLabel(mx + g*2, y, "Espécie",   "R$", g);
  drawLabel(mx + g*3, y, "Quantidade", "", g);
  drawLabel(mx + g*4, y, "Valor", "", g);
  drawLabel(mx + g*5, y, "(=)Valor do Documento", fmtBRL(dados.valor), g);
  y -= 32;

  // ── Instruções + campos de débito/crédito ─────────────────────
  const instrW = lw * 0.6;
  const debW   = lw * 0.4;

  page.drawText("Instruções", { x: mx, y: y + 13, size: 7, font, color: CINZA });
  page.drawLine({ start: { x: mx, y: y - 3 }, end: { x: mx + instrW - 4, y: y - 3 }, thickness: 0.3, color: BORDA });

  const debitItems = [
    "(-)Desconto/Abatimento",
    "(-)Outras Deduções",
    "(+)Mora/Multa",
    "(+)Outros Acréscimos",
    "(=)Valor Cobrado",
  ];
  let dy = y;
  for (const item of debitItems) {
    page.drawText(item, { x: mx + instrW, y: dy, size: 7, font, color: CINZA });
    page.drawLine({ start: { x: mx + instrW, y: dy - 3 }, end: { x: mx + lw, y: dy - 3 }, thickness: 0.3, color: BORDA });
    dy -= 16;
  }
  y = dy - 8;

  page.drawLine({ start: { x: mx, y }, end: { x: mx + lw, y }, thickness: 0.5, color: PRETO });
  y -= 18;

  // ── Pagador na ficha ──────────────────────────────────────────
  page.drawText("Pagador", { x: mx, y: y + 13, size: 7, font, color: CINZA });
  page.drawText(dados.pagador_nome + "  CNPJ/CPF " + dados.pagador_cnpj, { x: mx + 55, y, size: 9, font: fontBold, color: PRETO });
  y -= 16;
  page.drawText(dados.pagador_endereco, { x: mx, y, size: 8, font, color: PRETO });
  y -= 18;

  page.drawText("Beneficiário Final", { x: mx, y: y + 13, size: 7, font, color: CINZA });
  y -= 20;

  page.drawLine({ start: { x: mx, y }, end: { x: mx + lw, y }, thickness: 0.5, color: PRETO });
  y -= 24;

  // ── Código de barras ──────────────────────────────────────────
  const cbX = mx;
  const cbY = y - 50;
  const cbW = lw;
  const cbH = 50;

  desenharCodigoBarras(page, dados.codigo_barras, cbX, cbY, cbW, cbH);

  // Autenticação
  page.drawText("Autenticação Mecânica", { x: mx + lw - 120, y: cbY - 14, size: 8, font, color: CINZA });
  page.drawText("Ficha de Compensação", { x: mx + lw - 110, y: cbY - 26, size: 7, font, color: CINZA });

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

    const sb = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const tituloId: string = body.titulo_id;
    if (!tituloId) {
      return new Response(JSON.stringify({ ok: false, erro: "titulo_id é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Buscar dados completos do título
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
      return new Response(JSON.stringify({ ok: false, erro: "Título não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // deno-lint-ignore no-explicit-any
    const t = titulo as any;
    const parceiro = t.conta?.parceiro;

    if (!t.nosso_numero_seq || !t.linha_digitavel || !t.codigo_barras_boleto) {
      return new Response(JSON.stringify({ ok: false, erro: "Boleto ainda não tem nosso número gerado. Execute gerar-remessa-safra primeiro." }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parâmetros Safra
    const { data: paramRows } = await sb.from("parametros_remessa_safra").select("chave, valor");
    const params: Record<string, string> = {};
    for (const row of (paramRows ?? []) as { chave: string; valor: string }[]) params[row.chave] = row.valor;

    const enderecoPagador = [
      parceiro?.logradouro,
      parceiro?.numero,
      parceiro?.bairro,
      parceiro?.cidade,
      parceiro?.uf,
      parceiro?.cep,
    ].filter(Boolean).join(", ");

    const dados: DadosBoleto = {
      beneficiario_nome:  "FETELY COMERCIO IMPORTACAO E EXPORTACAO LTDA",
      beneficiario_cnpj:  "63.591.078/0001-48",
      agencia_cod:        "0005/5804446",
      pagador_nome:       parceiro?.razao_social ?? "—",
      pagador_cnpj:       parceiro?.cnpj ?? parceiro?.cpf ?? "—",
      pagador_endereco:   enderecoPagador,
      numero_documento:   `${t.pedido?.id_externo ?? t.numero_titulo}-${String(t.numero_parcela).padStart(2,"0")}`,
      carteira:           params.tipo_carteira ?? "60",
      nosso_numero:       t.nosso_numero_seq,
      data_documento:     t.data_criacao ?? new Date().toISOString().slice(0, 10),
      data_vencimento:    t.data_vencimento_atual,
      valor:              Number(t.valor_bruto),
      especie:            "DM",
      codigo_barras:      t.codigo_barras_boleto,
      linha_digitavel:    t.linha_digitavel,
    };

    const pdfBytes  = await buildPdf(dados);
    const pdfBase64 = bytesToBase64(pdfBytes);

    return new Response(
      JSON.stringify({ ok: true, pdf_base64: pdfBase64, nome_arquivo: `boleto_${t.nosso_numero_seq}.pdf` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("gerar-boleto-pdf erro fatal", e);
    return new Response(JSON.stringify({ ok: false, erro: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});