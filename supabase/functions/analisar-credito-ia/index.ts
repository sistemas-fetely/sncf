// Edge function: analisar-credito-ia
// Análise consolidada de crédito pra Joseph decidir.
// Monta contexto rico (pedido + parceiro + KPIs + scores + histórico) e chama Claude Sonnet.
// Grava resultado em analises_credito.analise_ia_json.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é o analista de crédito da Fetely, marca brasileira de descartáveis premium para celebrações (linha Lumier de velas e linha Célébrée de mesa). Analisa pedidos B2B de atacado.

PRINCÍPIOS FETELY (invioláveis):
1. Sistema sugere, humano decide — você NUNCA recusa automaticamente. Mesmo casos críticos viram "sugiro reprovar com motivo X".
2. Conservador na largada — cliente novo sem histórico = "aprovar com ressalva" ou "à vista".
3. Doutrina Petróleo — todo dado tem fonte; cite a fonte na justificativa (Serasa diz X, histórico interno mostra Y, etc.).
4. Tom humano, claro, sem corporativês. Português brasileiro.

OS 4 PERFIS DE CRÉDITO (que a IA pode sugerir):
- novo_entrada: cliente novo, sem histórico, baixo risco aparente. Default R$ 5k, 30 dias, [boleto, pix, cartao].
- novo_qualificado: cliente novo com sinais positivos (Serasa limpo, capital adequado). Default R$ 10k, 60 dias, [boleto, pix, cartao].
- recorrente_bom_pagador: ≥3 análises aprovadas, atraso médio ≤5 dias, sem vencidos. Default R$ 25k, 90 dias, [boleto, pix, cartao].
- premium: cliente estratégico, sob negociação caso a caso. KA Parceiro/Família entram aqui.

IMPORTANTE: bandeira_vermelha é um flag MANUAL do cadastro — a IA NUNCA sugere isso como perfil.

REGRAS DE PONDERAÇÃO:
- Bandeira vermelha ativa: alerta forte na justificativa, mas pondere razão e atualidade. Não é veto automático.
- Cooldown (reprovação <90 dias): pondere motivo anterior. Calote = reprovar de novo. "Valor alto sem histórico" + valor menor agora = à vista.
- Grupo econômico com vencidos: alerta visual, decisão humana fica contextual. Não bloqueie por isso sozinho.
- NUNCA retorne perfil_aplicado = bandeira_vermelha. Para casos de risco alto (valor elevado, bureau ruim, flag manual ativo), use um perfil conservador (ex.: novo_entrada) E a decisao_sugerida apropriada (reprovar, aprovar_com_ressalva ou somente à vista). O perfil reflete o relacionamento; o risco vai na decisão e na justificativa, não no perfil.

CONFIANÇA (0-100):
- ≥85: caso claro, sinais coerentes (Serasa limpo + sem vencidos + valor compatível)
- 70-84: caso comum, sugestão padrão
- 50-69: caso complexo, sinais conflitantes — sinalize na justificativa
- <50: dados insuficientes — sugira devolver_analise pra mais info

DECISÃO SUGERIDA pode ser:
- aprovar: caminho feliz
- aprovar_com_ressalva: aprovação com condição limitada (motivo obrigatório)
- reprovar: motivo obrigatório
- devolver_analise: faltou anexo, contexto incompleto
- devolver_entrada: dado errado no payload (CNPJ não bate, valor inconsistente)

OUTPUT: JSON válido, sem markdown, sem texto fora do JSON.

REGRA: validade_ate é calculada pelo banco automaticamente (now() + 90 dias na aprovação). Sempre retorne null nesse campo.

ESTRUTURA OBRIGATÓRIA:
{
  "resumo": "3-5 linhas em prosa humana resumindo o caso",
  "pontos_atencao": [
    { "texto": "item curto", "tipo": "<um dos tipos abaixo>", "valor": number | null }
  ],
  "sugestao": {
    "perfil_aplicado": "novo_entrada"|"novo_qualificado"|"recorrente_bom_pagador"|"premium",
    "limite_concedido": number,
    "prazo_max_dias": int,
    "formas_aceitas": ["boleto","pix","cartao"],
    "parecer_final": "2-3 frases pro lojista (Joseph adapta antes de enviar)",
    "ressalva": string | null,
    "validade_ate": null
  },
  "decisao_sugerida": "aprovar"|"aprovar_com_ressalva"|"reprovar"|"devolver_analise"|"devolver_entrada",
  "justificativa": "1-2 parágrafos citando fontes específicas",
  "confianca": int  // 0-100
}

TIPOS DE PONTO DE ATENÇÃO (obrigatório escolher um):
- divida_interna_vencida: cliente deve à Fetely e está vencido HOJE. Só use se a linha "DÍVIDA VENCIDA HOJE" for maior que zero ou se houver título com status "atrasado". "valor" = o valor vencido.
- historico_atraso: cliente pagou com atraso no passado, mas está quitado. Não é dívida. "valor" = null ou o valor do título.
- exposicao_credito: soma em aberto, limite, concentração. "valor" = o montante.
- bureau: qualquer coisa vinda de Serasa/BVG — inclusive dívida EXTERNA. Dívida no bureau NUNCA é divida_interna_vencida. "valor" = o valor do bureau.
- valor_pedido: algo sobre os valores deste pedido. "valor" = o valor citado.
- cadastro: dado faltante ou inconsistente no cadastro. "valor" = null.
- outro: o que não couber acima.

REGRA DURA: não classifique como divida_interna_vencida nada que venha do bureau, nem valor já pago, nem atraso histórico já quitado. O sistema confere isso automaticamente e rebaixa a análise quando não bate.`;

interface AnalisarRequest {
  analise_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const body = (await req.json()) as AnalisarRequest;
    const { analise_id } = body;

    if (!analise_id) {
      return new Response(
        JSON.stringify({ error: "analise_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1) Análise + pedido + parceiro
    const { data: analise, error: aErr } = await (supabase as any)
      .from("analises_credito")
      .select(`
        id, estagio_atual, status_final, perfil_aplicado, limite_concedido, prazo_max_dias,
        criado_em, analise_anterior_id,
        pedido:pedidos(id, id_externo, data_pedido, valor_bruto, valor_liquido, desconto_pct,
          valor_frete, acrescimo_ie_valor, acrescimo_ie_pct, desconto_celebra_valor, bonus_pix_valor,
          condicao_solicitada, forma_solicitada, vendedor, origem, itens_json),
        parceiro:parceiros_comerciais(id, cnpj, razao_social, nome_fantasia, cep, logradouro,
          cidade, uf, telefone, email, cadastro_incompleto, bandeira_vermelha,
          bandeira_vermelha_motivo, bandeira_vermelha_em, grupo_economico_id, nivel_programa,
          categoria_ka, perfil_credito, contexto_bureau)
      `)
      .eq("id", analise_id)
      .single();

    if (aErr || !analise) {
      console.error("Erro buscando análise:", aErr, "analise:", analise);
      return new Response(
        JSON.stringify({ error: "Análise não encontrada", details: aErr?.message || aErr }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parceiroId = analise.parceiro?.id;
    const grupoId = analise.parceiro?.grupo_economico_id;

    // 2) KPIs financeiros do cliente
    const { data: kpis } = await (supabase as any)
      .from("v_credito_resumo_financeiro")
      .select("*")
      .eq("parceiro_id", parceiroId)
      .single();

    // 3) KPIs do grupo (se houver)
    let kpisGrupo = null;
    if (grupoId) {
      const { data: kg } = await (supabase as any)
        .from("v_credito_resumo_financeiro_grupo")
        .select("*")
        .eq("grupo_economico_id", grupoId)
        .single();
      kpisGrupo = kg;
    }

    // 4) Sócios
    const { data: socios } = await (supabase as any)
      .from("socios_parceiro")
      .select("cpf_cnpj, nome, participacao_pct, qualificacao")
      .eq("parceiro_id", parceiroId)
      .is("desligado_em", null);

    // 5) Scores bureau desta análise
    const { data: scores } = await (supabase as any)
      .from("analise_credito_scores")
      .select("fonte, data_consulta, score_numerico, score_categorico, flag_pefin, flag_refin, flag_protestos, flag_falencia_rj, flag_acoes_judiciais, flag_cheque_devolvido, flag_divida_vencida, total_dividas")
      .eq("analise_id", analise_id);

    // 6) Análises anteriores deste parceiro
    const { data: anteriores } = await (supabase as any)
      .from("analises_credito")
      .select("id, status_final, perfil_aplicado, limite_concedido, prazo_max_dias, decidido_em, parecer_final")
      .eq("parceiro_id", parceiroId)
      .neq("id", analise_id)
      .not("status_final", "is", null)
      .order("decidido_em", { ascending: false })
      .limit(10);

    // 7) Cooldown — última análise reprovada <90 dias
    const cooldownAtivo = (anteriores || []).find((a: any) => {
      if (a.status_final !== "reprovado") return false;
      if (!a.decidido_em) return false;
      const dias = (Date.now() - new Date(a.decidido_em).getTime()) / 86400000;
      return dias < 90;
    });

    // 8) Títulos do cliente — fonte única da verdade sobre dívida
    const { data: titulos } = await (supabase as any)
      .from("vw_titulos_cobranca")
      .select("numero_titulo, numero_parcela, total_parcelas, pedido_id_externo, valor_efetivo, data_vencimento_atual, data_pagamento, data_pagamento_banco, status_gestao")
      .eq("parceiro_id", parceiroId)
      .order("data_vencimento_atual", { ascending: false })
      .limit(40);

    const listaTitulos = (titulos || []) as any[];

    const num = (v: any) => Number(v ?? 0) || 0;
    const valorBruto = num(analise.pedido?.valor_bruto);
    const valorLiquido = num(analise.pedido?.valor_liquido);
    const valorFrete = num(analise.pedido?.valor_frete);
    const acrescimoIe = num(analise.pedido?.acrescimo_ie_valor);
    const descontoPct = num(analise.pedido?.desconto_pct);
    const descontoRS = descontoPct > 0 ? (valorBruto * descontoPct) / 100 : 0;

    const blocoTitulos = listaTitulos.length > 0
      ? listaTitulos
          .map((t: any) => {
            const liq = t.data_pagamento_banco || t.data_pagamento;
            return `- ${t.numero_titulo} ${t.numero_parcela ?? "?"}/${t.total_parcelas ?? "?"} · pedido ${t.pedido_id_externo ?? "—"} · R$ ${num(t.valor_efetivo)} · vence ${t.data_vencimento_atual} · ${t.status_gestao}${liq ? ` · quitado em ${liq}` : ""}`;
          })
          .join("\n")
      : "Cliente sem títulos emitidos.";

    const titulosAtrasados = listaTitulos.filter(
      (t: any) => t.status_gestao === "atrasado"
    ).length;

    const fatos = {
      vencidos: num(kpis?.vencidos),
      a_vencer: num(kpis?.a_vencer),
      em_aberto: num(kpis?.em_aberto),
      pago: num(kpis?.pago),
      atraso_medio: num(kpis?.atraso_medio_dias),
      vencidos_grupo: num(kpisGrupo?.vencidos),
      valor_bruto: valorBruto,
      valor_liquido: valorLiquido,
      valor_frete: valorFrete,
      acrescimo_ie_valor: acrescimoIe,
      titulos_atrasados: titulosAtrasados,
      valores_payload: [
        valorBruto,
        valorLiquido,
        valorFrete,
        acrescimoIe,
        descontoRS,
        num(kpis?.vencidos),
        num(kpis?.a_vencer),
        num(kpis?.em_aberto),
        num(kpis?.pago),
        num(kpis?.maior_compra),
        num(kpisGrupo?.em_aberto),
        num(kpisGrupo?.vencidos),
        ...listaTitulos.map((t: any) => num(t.valor_efetivo)),
        ...(scores || []).map((s: any) => num(s.total_dividas)),
        ...(anteriores || []).map((a: any) => num(a.limite_concedido)),
      ].filter((v: number) => v > 0),
    };

    // Monta user prompt com contexto completo
    const userPrompt = `Analise esta análise de crédito.

PEDIDO:
- Mercadoria (valor bruto): R$ ${valorBruto}
- Desconto aplicado: ${descontoPct > 0 ? `R$ ${descontoRS.toFixed(2)} (${descontoPct}%)` : "nenhum"}
- Frete (pago pelo cliente): R$ ${valorFrete}
- Acréscimo sem inscrição estadual: R$ ${acrescimoIe}
- TOTAL A PAGAR (valor líquido): R$ ${valorLiquido}
- Confira: mercadoria − desconto + frete + acréscimo = total. Líquido MAIOR que bruto é normal quando há frete ou acréscimo — NÃO é inconsistência.
- Condição solicitada: ${analise.pedido?.condicao_solicitada}
- Forma solicitada: ${analise.pedido?.forma_solicitada}
- Vendedor: ${analise.pedido?.vendedor || "—"}
- Origem: ${analise.pedido?.origem || "—"}

CLIENTE:
- CNPJ: ${analise.parceiro?.cnpj}
- Razão social: ${analise.parceiro?.razao_social}
- Nome fantasia: ${analise.parceiro?.nome_fantasia || "—"}
- Cidade/UF: ${analise.parceiro?.cidade || "—"}/${analise.parceiro?.uf || "—"}
- Cadastro completo: ${analise.parceiro?.cadastro_incompleto ? "NÃO" : "sim"}
- Sócios: ${JSON.stringify(socios || [])}
- Contexto bureau (histórico): ${JSON.stringify(analise.parceiro?.contexto_bureau || {})}

ESTADO ATUAL DO CLIENTE:
- Perfil de crédito atual: ${analise.parceiro?.perfil_credito}
- Nível de programa (silencioso): ${analise.parceiro?.nivel_programa}
- Categoria KA: ${analise.parceiro?.categoria_ka || "—"}
- Bandeira vermelha: ${analise.parceiro?.bandeira_vermelha ? `ATIVA — motivo: "${analise.parceiro?.bandeira_vermelha_motivo}"` : "não"}
- Cooldown ativo: ${cooldownAtivo ? `SIM — análise anterior reprovada em ${cooldownAtivo.decidido_em} com parecer: "${cooldownAtivo.parecer_final || "—"}"` : "não"}

KPIs FINANCEIROS DO CLIENTE:
${kpis ? `
- DÍVIDA VENCIDA HOJE (em atraso, não pago): R$ ${num(kpis.vencidos)}
- A vencer (em aberto, ainda dentro do prazo): R$ ${num(kpis.a_vencer)}
- Total em aberto (vencido + a vencer): R$ ${num(kpis.em_aberto)}
- JÁ PAGO E QUITADO no histórico (isto NÃO é dívida): R$ ${num(kpis.pago)}
- Maior compra já feita: R$ ${num(kpis.maior_compra)}
- Última compra em: ${kpis.ultima_compra_em || "—"}
- Atraso médio nos pagamentos já feitos: ${Math.round(num(kpis.atraso_medio_dias))} dias
ATENÇÃO: se DÍVIDA VENCIDA HOJE for R$ 0, o cliente NÃO tem débito vencido. Não descreva valores já pagos como dívida.` : "Sem dados financeiros (cliente novo)"}

GRUPO ECONÔMICO:
${kpisGrupo ? `
- Nome: ${kpisGrupo.grupo_nome}
- Parceiros no grupo: ${kpisGrupo.qtd_parceiros}
- DÍVIDA VENCIDA HOJE do grupo (em atraso, não pago): R$ ${num(kpisGrupo.vencidos)}
- Total em aberto do grupo (vencido + a vencer): R$ ${num(kpisGrupo.em_aberto)}
- Atraso médio do grupo nos pagamentos já feitos: ${Math.round(num(kpisGrupo.atraso_medio_dias))} dias` : "Sem grupo econômico detectado"}

TÍTULOS DO CLIENTE (fonte única da verdade sobre dívida — use estas linhas, não infira):
${blocoTitulos}
Legenda dos status: a_vencer/vence_hoje = em aberto no prazo · atrasado = DÍVIDA VENCIDA · aguarda_liquidacao = pago sem confirmação bancária · pago/pago_com_atraso/pago_judicial = QUITADO, não é dívida · baixado_por_perda = prejuízo assumido · devolvido/cancelado = sem efeito financeiro.

SCORES BUREAU ANEXADOS (extraídos por IA dos PDFs):
${(scores || []).length > 0 ? JSON.stringify(scores) : "Nenhum bureau anexado nesta análise"}

ANÁLISES ANTERIORES DESTE CLIENTE:
${(anteriores || []).length > 0 ? JSON.stringify(anteriores) : "Cliente novo na Fetely"}

Gere a análise estruturada em JSON conforme instruído no system prompt.`;

    // Chama Claude Sonnet via Lovable AI Gateway
    const MODELO_PRIMARIO = "anthropic/claude-sonnet-4-5";
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODELO_PRIMARIO,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text().catch(() => "");
      console.error("Claude error:", aiResp.status, errorText);
      const fallbackInfo = {
        primario: MODELO_PRIMARIO,
        status: aiResp.status,
        erro: String(errorText).slice(0, 300),
        em: new Date().toISOString(),
      };
      // Fallback: tenta Gemini Pro se Claude não tá disponível
      const fallbackResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!fallbackResp.ok) {
        return new Response(
          JSON.stringify({ error: `IA indisponível (Claude ${aiResp.status}, Gemini fallback ${fallbackResp.status})` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const fbData = await fallbackResp.json();
      return await processarRespostaIA(fbData, analise_id, supabase, corsHeaders, "gemini-pro-fallback", fatos, fallbackInfo);
    }

    const aiData = await aiResp.json();
    return await processarRespostaIA(aiData, analise_id, supabase, corsHeaders, "claude-sonnet-4-5", fatos, null);
  } catch (e) {
    console.error("analisar-credito-ia error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

interface FatosCredito {
  vencidos: number;
  a_vencer: number;
  em_aberto: number;
  pago: number;
  atraso_medio: number;
  vencidos_grupo: number;
  valor_bruto: number;
  valor_liquido: number;
  valor_frete: number;
  acrescimo_ie_valor: number;
  titulos_atrasados: number;
  valores_payload: number[];
}

const PERFIS_VALIDOS = [
  "novo_entrada",
  "novo_qualificado",
  "recorrente_bom_pagador",
  "premium",
];
const DECISOES_VALIDAS = [
  "aprovar",
  "aprovar_com_ressalva",
  "reprovar",
  "devolver_analise",
  "devolver_entrada",
];

const RE_MOEDA_UNUSED_PLACEHOLDER = undefined;
const RE_MOEDA = /r\$\s*([\d.]*\d(?:,\d{1,2})?)/g;

function parseMoedaBr(bruto: string): number {
  const limpo = bruto.replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : NaN;
}

function extrairMoedas(texto: string): number[] {
  const out: number[] = [];
  RE_MOEDA.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_MOEDA.exec(texto)) !== null) {
    const v = parseMoedaBr(m[1]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

function fmtBr(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface PontoAtencaoNorm {
  texto: string;
  tipo: string | null;
  valor: number | null;
}

function normalizarPontos(bruto: unknown): PontoAtencaoNorm[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.map((item: any) => {
    if (typeof item === "string") return { texto: item, tipo: null, valor: null };
    const valor = Number(item?.valor);
    return {
      texto: typeof item?.texto === "string" ? item.texto : "",
      tipo: typeof item?.tipo === "string" && item.tipo.length > 0 ? item.tipo : null,
      valor: Number.isFinite(valor) ? valor : null,
    };
  });
}

function validarSaidaIA(
  analiseIA: any,
  fatos: FatosCredito
): { contradicoes: string[]; cifras_orfas: number[]; pontos_sem_tipo: number } {
  const contradicoes: string[] = [];
  const cifras_orfas: number[] = [];

  const pontos = normalizarPontos(analiseIA?.pontos_atencao);
  const pontos_sem_tipo = pontos.filter((p) => !p.tipo).length;

  const partes = [
    analiseIA?.resumo,
    analiseIA?.justificativa,
    analiseIA?.sugestao?.parecer_final,
    analiseIA?.sugestao?.ressalva,
    ...pontos.map((p) => p.texto),
  ].filter((p: any) => typeof p === "string" && p.length > 0);
  const alvo = partes.join(" \n ").toLowerCase();

  // T1/T2 — checagem no campo tipado
  for (const p of pontos) {
    if (p.tipo !== "divida_interna_vencida") continue;
    if (fatos.vencidos === 0 && fatos.titulos_atrasados === 0) {
      contradicoes.push(
        `Ponto marcado como dívida interna vencida, mas o cliente tem R$ 0 vencidos e nenhum título atrasado: "${p.texto}"`
      );
    }
    if (typeof p.valor === "number" && Math.abs(p.valor - fatos.vencidos) > 0.01) {
      let msg = `Valor apontado como dívida interna vencida (R$ ${fmtBr(p.valor)}) não corresponde ao vencido real (R$ ${fmtBr(fatos.vencidos)}).`;
      if (fatos.pago > 0 && Math.abs(p.valor - fatos.pago) <= 0.01) {
        msg += " — esse valor é o total JÁ PAGO pelo cliente.";
      }
      contradicoes.push(msg);
    }
  }

  // R3 — falsa inconsistência de valores
  const falsaInconsistencia = /(líquido|liquido)[\s\S]{0,40}bruto/.test(alvo);
  if (
    falsaInconsistencia &&
    Math.abs(
      fatos.valor_liquido - fatos.valor_bruto - (fatos.valor_frete + fatos.acrescimo_ie_valor)
    ) <= 0.01
  ) {
    contradicoes.push(
      "Texto aponta inconsistência entre líquido e bruto, mas a diferença é exatamente frete + acréscimo."
    );
  }

  // R4 — cifras órfãs
  const conhecidos = fatos.valores_payload;
  const bate = (v: number) => {
    if (conhecidos.some((c) => Math.abs(c - v) <= 0.01)) return true;
    for (let i = 0; i < conhecidos.length; i++) {
      for (let j = i + 1; j < conhecidos.length; j++) {
        if (Math.abs(conhecidos[i] + conhecidos[j] - v) <= 0.01) return true;
      }
    }
    return false;
  };
  for (const v of extrairMoedas(alvo)) {
    if (v === 0) continue;
    if (!bate(v) && !cifras_orfas.some((o) => Math.abs(o - v) <= 0.01)) cifras_orfas.push(v);
  }

  // Validações estruturais básicas
  const perfil = analiseIA?.sugestao?.perfil_aplicado;
  if (perfil === "bandeira_vermelha") {
    contradicoes.push("perfil_aplicado = bandeira_vermelha não é permitido para a IA.");
  } else if (!PERFIS_VALIDOS.includes(perfil)) {
    contradicoes.push(`perfil_aplicado inválido: "${perfil}".`);
  }
  if (!DECISOES_VALIDAS.includes(analiseIA?.decisao_sugerida)) {
    contradicoes.push(`decisao_sugerida inválida: "${analiseIA?.decisao_sugerida}".`);
  }
  const conf = Number(analiseIA?.confianca);
  if (!Number.isFinite(conf) || conf < 0 || conf > 100) {
    contradicoes.push(`confianca fora da faixa 0-100: "${analiseIA?.confianca}".`);
  }

  return { contradicoes, cifras_orfas };
}

async function processarRespostaIA(
  aiData: any,
  analise_id: string,
  supabase: any,
  corsHeaders: Record<string, string>,
  modeloUsado: string,
  fatos: FatosCredito,
  fallbackInfo: { primario: string; status: number; erro: string; em: string } | null
): Promise<Response> {
  let raw = aiData?.choices?.[0]?.message?.content ?? "";
  let jsonStr = String(raw).trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  const firstBrace = jsonStr.indexOf("{");
  const lastBrace = jsonStr.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);

  let analiseIA;
  try {
    analiseIA = JSON.parse(jsonStr);
  } catch (e) {
    console.error("Erro parsing JSON IA:", e, "raw:", raw);
    return new Response(
      JSON.stringify({ error: "IA retornou JSON inválido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validação determinística — SISTEMA SUGERE / HUMANO DECIDE: nunca descarta, só carimba.
  const confiancaOriginal = Number(analiseIA?.confianca ?? 0);
  const { contradicoes, cifras_orfas } = validarSaidaIA(analiseIA, fatos);

  if (contradicoes.length > 0) {
    console.warn("Validação IA encontrou contradições:", analise_id, contradicoes);
    analiseIA.confianca = Math.min(Number(analiseIA.confianca ?? 0) || 0, 40);
    if (!Array.isArray(analiseIA.pontos_atencao)) analiseIA.pontos_atencao = [];
    analiseIA.pontos_atencao.unshift(
      "⚠ VERIFICAÇÃO AUTOMÁTICA: esta análise contradiz os dados do sistema. Confira antes de decidir."
    );
  } else if (cifras_orfas.length > 0) {
    console.warn("Validação IA encontrou cifras órfãs:", analise_id, cifras_orfas);
    analiseIA.confianca = Math.min(Number(analiseIA.confianca ?? 0) || 0, 70);
  }

  const iaJson: Record<string, unknown> = {
    ...analiseIA,
    _modelo: modeloUsado,
    _validacao: {
      contradicoes,
      cifras_orfas,
      confianca_original: confiancaOriginal,
      validado_em: new Date().toISOString(),
    },
  };
  if (fallbackInfo) iaJson._fallback = fallbackInfo;

  // Grava em analises_credito
  const { error: updErr } = await supabase
    .from("analises_credito")
    .update({
      analise_ia_json: iaJson,
      analise_ia_resumo: analiseIA.resumo,
      analise_ia_confianca: analiseIA.confianca,
      analise_ia_processada_em: new Date().toISOString(),
    })
    .eq("id", analise_id);

  if (updErr) {
    console.error("Erro gravando análise IA:", updErr);
    return new Response(
      JSON.stringify({ error: `Erro persistindo: ${updErr.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      analise_id,
      modelo: modeloUsado,
      analise_ia: iaJson,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
