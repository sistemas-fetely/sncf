import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Helpers CNAB ─────────────────────────────────────────────────────────────

function zeroLeft(val: string | number, length: number): string {
  return String(val).replace(/\D/g, "").padStart(length, "0").slice(-length);
}

function spaceRight(val: string, length: number): string {
  return (val ?? "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").padEnd(length, " ").slice(0, length);
}

function blanks(n: number): string { return " ".repeat(n); }

function fmtDDMMAA(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return String(d.getDate()).padStart(2, "0") + String(d.getMonth() + 1).padStart(2, "0") + String(d.getFullYear()).slice(-2);
}

function fmtValor(valor: number, length: number): string {
  return String(Math.round(valor * 100)).padStart(length, "0").slice(-length);
}

// ─── Helpers DV ───────────────────────────────────────────────────────────────

function dvMod10(numero: string): number {
  let soma = 0, mult = 2;
  for (const d of [...numero].reverse()) {
    const v = parseInt(d) * mult;
    soma += Math.floor(v / 10) + (v % 10);
    mult = mult === 2 ? 1 : 2;
  }
  return (10 - soma % 10) % 10;
}

function dvGeralMod11(barras43: string): number {
  let soma = 0, mult = 2;
  for (const d of [...barras43].reverse()) {
    soma += parseInt(d) * mult;
    mult = mult < 9 ? mult + 1 : 2;
  }
  const resto = soma % 11;
  return resto <= 1 ? 1 : 11 - resto;
}

function fatorVencimento(vencimentoIso: string): number {
  const base = new Date("2022-05-29T00:00:00");
  const venc = new Date(vencimentoIso + "T00:00:00");
  return Math.round((venc.getTime() - base.getTime()) / 86400000);
}

function montarLinhaDigitavel(
  nossoNumero: string,
  vencimentoIso: string,
  valorCents: number,
  params: Record<string, string>
): { linha: string; barras: string } {
  const agencia  = params.agencia ?? "0005";
  const conta7d  = params.conta_7d ?? "5804446";
  const c1Base   = params.campo1_fixo ?? "422970050";
  const sufixoC3 = params.sufixo_campo3 ?? "2";

  // Campo livre Safra: F(1) + AG(5) + CONTA(9) + NOSSO(9) + SUFIXO(1)
  // c2Base = último dígito da agência 5d + conta 9d (total 10 chars)
  const agencia5d = agencia.padStart(5, "0");
  const conta9d   = conta7d.padStart(9, "0");
  const c2Base    = agencia5d.slice(-1) + conta9d;
  const c3Base = nossoNumero + sufixoC3;

  const dv1 = dvMod10(c1Base);
  const dv2 = dvMod10(c2Base);
  const dv3 = dvMod10(c3Base);

  const fator    = fatorVencimento(vencimentoIso);
  const fatorStr = String(fator).padStart(4, "0");
  const valorStr = String(valorCents).padStart(10, "0");
  const campoLivre = c1Base.slice(4) + c2Base + c3Base;

  const barras43 = "4229" + fatorStr + valorStr + campoLivre;
  const dvGeral  = dvGeralMod11(barras43);
  const barras   = barras43.slice(0, 4) + dvGeral + barras43.slice(4);

  const linha = (
    `${c1Base.slice(0, 5)}.${c1Base.slice(5)}${dv1} ` +
    `${c2Base.slice(0, 5)}.${c2Base.slice(5)}${dv2} ` +
    `${c3Base.slice(0, 5)}.${c3Base.slice(5)}${dv3} ` +
    `${dvGeral} ${fatorStr}${valorStr}`
  );

  return { linha, barras };
}

// ─── Sequencial ───────────────────────────────────────────────────────────────

async function alocarNossoNumero(sb: ReturnType<typeof createClient>): Promise<string> {
  const { data, error } = await sb
    .from("parametros_remessa_safra")
    .select("valor")
    .eq("chave", "nosso_numero_proximo")
    .single();
  if (error || !data) throw new Error("Parâmetro nosso_numero_proximo não encontrado");

  const atual  = parseInt((data as { valor: string }).valor, 10);
  const proximo = atual + 1;

  const { error: updErr } = await sb
    .from("parametros_remessa_safra")
    .update({ valor: String(proximo) })
    .eq("chave", "nosso_numero_proximo");
  if (updErr) throw new Error(`Erro ao incrementar nosso número: ${updErr.message}`);

  return String(atual);
}

async function proximoSequencial(sb: ReturnType<typeof createClient>): Promise<number> {
  const { data } = await sb
    .from("remessas_safra")
    .select("nro_sequencial")
    .order("nro_sequencial", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { nro_sequencial: number } | null)?.nro_sequencial ?? 0) + 1;
}

// ─── Montagem CNAB ────────────────────────────────────────────────────────────

function gerarHeader(params: Record<string, string>, nroSeq: number, hoje: string): string {
  let h = "";
  h += "0"; h += "1"; h += "REMESSA"; h += "01"; h += "COBRANCA";
  h += blanks(7);
  h += params.conta_com_dv;
  h += blanks(6);
  h += spaceRight(params.razao_social_cedente, 30);
  h += "422";
  h += spaceRight("BANCO SAFRA", 11);
  h += blanks(4);
  h += fmtDDMMAA(hoje);
  h += blanks(291);
  h += zeroLeft(nroSeq, 3);
  h += "000001";
  if (h.length !== 400) throw new Error(`Header com ${h.length} chars`);
  return h;
}

// ocorrencia: "01" = remessa entrada | "02" = pedido de baixa
// deno-lint-ignore no-explicit-any
function gerarDetalhe(titulo: any, nossoNumero: string, params: Record<string, string>, nroSeq: number, nroReg: number, ocorrencia = "01"): string {
  const parceiro = titulo.parceiro;
  const docPagador = (parceiro.cnpj ?? parceiro.cpf ?? "").replace(/\D/g, "");
  const tipoInscricaoPagador = docPagador.length === 14 ? "02" : "01";
  const endereco  = [parceiro.logradouro, parceiro.numero].filter(Boolean).join(", ");
  const seuNumero = spaceRight(titulo.numero_titulo ?? "", 10);
  const usoLivre  = spaceRight(titulo.id ?? "", 25);
  const instrucao1 = (params.politica_instrucao_1 ?? "08").padStart(2, "0");
  const instrucao2 = (params.politica_instrucao_2 ?? "16").padStart(2, "0");
  const jurosDia  = zeroLeft(params.juros_mora_dia_centavos ?? "0", 13);
  const dataMulta = (() => {
    const d = new Date(titulo.data_vencimento_atual + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return fmtDDMMAA(d.toISOString().slice(0, 10));
  })();
  const multaPct = (params.multa_percentual ?? "0000").padStart(4, "0").slice(0, 4);

  let d = "";
  d += "1";
  d += "02";
  d += zeroLeft(params.cnpj_cedente, 14);
  d += params.conta_com_dv;
  d += blanks(6);
  d += usoLivre;
  d += nossoNumero.padStart(9, "0");
  d += blanks(30);
  d += "0"; d += "00"; d += " ";
  d += zeroLeft(params.dias_protesto ?? "00", 2);
  d += (params.tipo_carteira ?? "1");
  d += ocorrencia;
  d += seuNumero;
  d += fmtDDMMAA(titulo.data_vencimento_atual);
  d += fmtValor(Number(titulo.valor_bruto), 13);
  d += "422";
  d += zeroLeft(params.agencia ?? "00500", 5);
  d += (params.especie_titulo ?? "01");
  d += "N";
  d += fmtDDMMAA(new Date().toISOString().slice(0, 10));
  d += instrucao1; d += instrucao2;
  d += jurosDia;
  d += "000000"; d += "0000000000000"; d += "0000000000000";
  d += dataMulta; d += multaPct; d += "000";
  d += tipoInscricaoPagador;
  d += zeroLeft(docPagador, 14);
  d += spaceRight(parceiro.razao_social ?? "", 40);
  d += spaceRight(endereco, 40);
  d += spaceRight(parceiro.bairro ?? "", 10);
  d += blanks(2);
  d += zeroLeft(parceiro.cep ?? "", 8);
  d += spaceRight(parceiro.cidade ?? "", 15);
  d += spaceRight(parceiro.uf ?? "", 2);
  d += blanks(30); d += blanks(7);
  d += "422";
  d += zeroLeft(nroSeq, 3);
  d += zeroLeft(nroReg, 6);
  if (d.length !== 400) throw new Error(`Detalhe ${titulo.numero_titulo} com ${d.length} chars`);
  return d;
}

function gerarTrailer(nroSeq: number, qtd: number, total: number, nroRegFinal: number): string {
  let t = "9";
  t += blanks(367);
  t += zeroLeft(qtd, 8);
  t += fmtValor(total, 15);
  t += zeroLeft(nroSeq, 3);
  t += zeroLeft(nroRegFinal, 6);
  if (t.length !== 400) throw new Error(`Trailer com ${t.length} chars`);
  return t;
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
    const callerId = userData.user.id;
    const sb = createClient(supabaseUrl, serviceKey);

    const { data: paramRows, error: paramErr } = await sb.from("parametros_remessa_safra").select("chave, valor");
    if (paramErr) throw new Error(`Erro ao carregar parâmetros: ${paramErr.message}`);
    const params: Record<string, string> = {};
    for (const row of (paramRows ?? []) as { chave: string; valor: string }[]) params[row.chave] = row.valor;

    const body = await req.json();
    const tipo = body.tipo ?? "entrada";

    // ═══════════════════════════════════════════════════════════════
    // BRANCH: BAIXA
    // ═══════════════════════════════════════════════════════════════
    if (tipo === "baixa") {
      const nroSeq = await proximoSequencial(sb);
      const hoje   = new Date().toISOString().slice(0, 10);

      const { data: titulos, error: tErr } = await sb
        .from("titulo_a_receber")
        .select(`
          id, numero_titulo, numero_parcela, total_parcelas,
          valor_bruto, data_vencimento_atual, nosso_numero_seq,
          conta:contas_pagar_receber(
            parceiro:parceiros_comerciais(
              id, razao_social, cnpj, cpf,
              logradouro, numero, bairro, cep, cidade, uf
            )
          )
        `)
        .eq("boleto_status", "baixa_solicitada");

      if (tErr) throw new Error(`Erro ao buscar títulos para baixa: ${tErr.message}`);

      if (!titulos || titulos.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, erro: "Nenhum título com baixa solicitada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // deno-lint-ignore no-explicit-any
      const semNN = (titulos as any[]).filter((t: any) => !t.nosso_numero_seq);
      if (semNN.length > 0) {
        return new Response(
          JSON.stringify({
            ok: false,
            erro: "Títulos sem nosso_numero_seq — não foram registrados pelo sistema",
            // deno-lint-ignore no-explicit-any
            titulos: semNN.map((t: any) => t.numero_titulo),
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const linhas: string[] = [];
      linhas.push(gerarHeader(params, nroSeq, hoje));

      let nroReg    = 2;
      let valorTotal = 0;

      // deno-lint-ignore no-explicit-any
      for (const t of titulos as any[]) {
        linhas.push(gerarDetalhe(
          { ...t, parceiro: t.conta?.parceiro },
          String(t.nosso_numero_seq),
          params, nroSeq, nroReg,
          "02"
        ));
        valorTotal += Number(t.valor_bruto);
        nroReg++;
      }

      // deno-lint-ignore no-explicit-any
      linhas.push(gerarTrailer(nroSeq, (titulos as any[]).length, valorTotal, nroReg));
      const arquivoConteudo = linhas.join("\r\n") + "\r\n";
      const seqFormatado   = String(nroSeq).padStart(3, "0");
      const arquivoNome    = `SAFRAB${seqFormatado}.txt`;

      const { data: remessa, error: remessaErr } = await sb
        .from("remessas_safra")
        .insert({
          nro_sequencial: nroSeq,
          gerado_por:     callerId,
          // deno-lint-ignore no-explicit-any
          qtd_titulos:    (titulos as any[]).length,
          valor_total:    valorTotal,
          status:         "gerada",
          arquivo_nome:   arquivoNome,
          tipo:           "baixa",
        })
        .select("id")
        .single();
      if (remessaErr || !remessa) throw new Error(`Erro ao gravar remessa de baixa: ${remessaErr?.message}`);

      // deno-lint-ignore no-explicit-any
      for (const t of titulos as any[]) {
        const { error: updErr } = await sb
          .from("titulo_a_receber")
          .update({ boleto_status: "baixa_remessa_gerada" })
          .eq("id", t.id);
        if (updErr) throw new Error(`Erro ao atualizar título ${t.id}: ${updErr.message}`);
      }

      return new Response(
        JSON.stringify({
          ok:              true,
          arquivo_conteudo: arquivoConteudo,
          arquivo_nome:    arquivoNome,
          // deno-lint-ignore no-explicit-any
          remessa_id:      (remessa as any).id,
          nro_sequencial:  nroSeq,
          // deno-lint-ignore no-explicit-any
          qtd_titulos:     (titulos as any[]).length,
          valor_total:     valorTotal,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // ═══════════════════════════════════════════════════════════════
    // BRANCH: ENTRADA
    // ═══════════════════════════════════════════════════════════════

    const tituloIds: string[] = Array.isArray(body.titulo_ids) ? body.titulo_ids : [];
    if (tituloIds.length === 0) {
      return new Response(JSON.stringify({ ok: false, erro: "titulo_ids não pode ser vazio" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: titulos, error: titulosErr } = await sb
      .from("titulo_a_receber")
      .select(`id, numero_titulo, numero_parcela, total_parcelas, valor_bruto, data_vencimento_atual, boleto_status, tipo_pagamento,
        conta:contas_pagar_receber(parceiro:parceiros_comerciais(id, razao_social, cnpj, cpf, email, cadastro_incompleto, logradouro, numero, bairro, cep, cidade, uf))`)
      .in("id", tituloIds);
    if (titulosErr) throw new Error(`Erro ao buscar títulos: ${titulosErr.message}`);
    if (!titulos || titulos.length === 0) {
      return new Response(JSON.stringify({ ok: false, erro: "Nenhum título encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const erros: Array<{ titulo_id: string; numero_titulo: string; motivo: string }> = [];
    // deno-lint-ignore no-explicit-any
    for (const t of titulos as any[]) {
      const p = t.conta?.parceiro;
      if (!p) { erros.push({ titulo_id: t.id, numero_titulo: t.numero_titulo, motivo: "Parceiro não encontrado" }); continue; }
      if (p.cadastro_incompleto) erros.push({ titulo_id: t.id, numero_titulo: t.numero_titulo, motivo: "Cadastro incompleto" });
      if (!p.email) erros.push({ titulo_id: t.id, numero_titulo: t.numero_titulo, motivo: "E-mail não cadastrado" });
      if (Number(t.valor_bruto) <= 0) erros.push({ titulo_id: t.id, numero_titulo: t.numero_titulo, motivo: "Valor inválido" });
      const hojeISO = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (t.data_vencimento_atual < hojeISO) erros.push({ titulo_id: t.id, numero_titulo: t.numero_titulo, motivo: "Vencimento no passado" });
      if (t.tipo_pagamento !== "boleto") erros.push({ titulo_id: t.id, numero_titulo: t.numero_titulo, motivo: "Não é boleto" });
      if (t.boleto_status !== "pendente") erros.push({ titulo_id: t.id, numero_titulo: t.numero_titulo, motivo: `Status inválido: ${t.boleto_status}` });
    }
    if (erros.length > 0) {
      return new Response(JSON.stringify({ ok: false, erro: "Títulos com bloqueios", erros }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const nroSeq = await proximoSequencial(sb);
    const hoje   = new Date().toISOString().slice(0, 10);
    const linhas: string[] = [];
    linhas.push(gerarHeader(params, nroSeq, hoje));

    let nroReg    = 2;
    let valorTotal = 0;

    const titulosComNN: Array<{ id: string; nossoNumero: string; linhaDigitavel: string; codigoBarras: string }> = [];

    // deno-lint-ignore no-explicit-any
    for (const t of titulos as any[]) {
      const nossoNumero = await alocarNossoNumero(sb);
      const valorCents  = Math.round(Number(t.valor_bruto) * 100);
      const { linha, barras } = montarLinhaDigitavel(nossoNumero, t.data_vencimento_atual, valorCents, params);

      titulosComNN.push({ id: t.id, nossoNumero, linhaDigitavel: linha, codigoBarras: barras });
      linhas.push(gerarDetalhe({ ...t, parceiro: t.conta?.parceiro }, nossoNumero, params, nroSeq, nroReg));
      valorTotal += Number(t.valor_bruto);
      nroReg++;
    }

    linhas.push(gerarTrailer(nroSeq, titulos.length, valorTotal, nroReg));
    const arquivoConteudo = linhas.join("\r\n") + "\r\n";
    const seqFormatado   = String(nroSeq).padStart(3, "0");
    const arquivoNome    = `SAFRA_${seqFormatado}.txt`;

    const { data: remessa, error: remessaErr } = await sb
      .from("remessas_safra")
      .insert({
        nro_sequencial: nroSeq,
        gerado_por:     callerId,
        qtd_titulos:    titulos.length,
        valor_total:    valorTotal,
        status:         "gerada",
        arquivo_nome:   arquivoNome,
        tipo:           "entrada",
      })
      .select("id").single();
    if (remessaErr || !remessa) throw new Error(`Erro ao gravar remessa: ${remessaErr?.message}`);

    for (const item of titulosComNN) {
      const { error: updErr } = await sb
        .from("titulo_a_receber")
        .update({
          // deno-lint-ignore no-explicit-any
          remessa_safra_id:     (remessa as any).id,
          boleto_status:        "remessa_gerada",
          nosso_numero_seq:     item.nossoNumero,
          linha_digitavel:      item.linhaDigitavel,
          codigo_barras_boleto: item.codigoBarras,
        })
        .eq("id", item.id);
      if (updErr) throw new Error(`Erro ao atualizar título ${item.id}: ${updErr.message}`);
    }

    return new Response(
      // deno-lint-ignore no-explicit-any
      JSON.stringify({ ok: true, arquivo_conteudo: arquivoConteudo, arquivo_nome: arquivoNome, remessa_id: (remessa as any).id, nro_sequencial: nroSeq, qtd_titulos: titulos.length, valor_total: valorTotal }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("gerar-remessa-safra erro fatal", e);
    return new Response(JSON.stringify({ ok: false, erro: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
