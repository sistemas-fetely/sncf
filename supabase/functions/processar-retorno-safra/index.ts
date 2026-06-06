import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBRL(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

function formatDateBR(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("pt-BR");
}

// ─── Parser do retorno CNAB 400 ─────────────────────────────────────────────

interface LinhaRetorno {
  tipo: string;           // pos 001
  ocorrencia: string;     // pos 109-110
  seuNumero: string;      // pos 111-120 (numero_titulo da empresa)
  nossoNumero: string;    // pos 063-071
  motivoRejeicao: string; // pos 105-107
  valor: number;          // pos 127-139
}

function parseLinha(linha: string): LinhaRetorno | null {
  if (linha.length < 400) return null;
  const tipo = linha[0];
  if (tipo !== "1") return null; // só detalhes

  const nossoNumero  = linha.substring(62, 71).trim();
  const motivoRejeicao = linha.substring(104, 107).trim();
  const ocorrencia   = linha.substring(108, 110).trim();
  const seuNumero    = linha.substring(110, 120).trim();
  const valorCentavos = parseInt(linha.substring(126, 139).trim(), 10);
  const valor        = isNaN(valorCentavos) ? 0 : valorCentavos / 100;

  return { tipo, ocorrencia, seuNumero, nossoNumero, motivoRejeicao, valor };
}

// Códigos de ocorrência do retorno Safra
const OCORRENCIA_CONFIRMADA = "02"; // entrada confirmada
const OCORRENCIAS_REJEICAO = ["03", "15", "16", "17"]; // motivos comuns de rejeição

// Mapa simplificado de motivos de rejeição Safra
const MOTIVOS_REJEICAO: Record<string, string> = {
  "001": "Código do banco inválido",
  "004": "Código de movimento inválido",
  "007": "Agência/conta inválida",
  "008": "Nosso número inválido",
  "010": "Carteira não cadastrada",
  "015": "CNPJ/CPF do pagador inválido",
  "016": "Agência cobradora inválida",
  "017": "CEP do pagador inválido",
  "018": "Data de vencimento inválida",
  "021": "Espécie inválida",
  "022": "Data de emissão inválida",
  "060": "Movimento inválido para carteira",
};

function descricaoRejeicao(codigo: string): string {
  return MOTIVOS_REJEICAO[codigo] ?? `Código de rejeição ${codigo}`;
}

// ─── Handler principal ───────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey    = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Autenticação
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, erro: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sbUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, erro: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // Input
    const body = await req.json();
    const arquivoConteudo: string = body.arquivo_conteudo ?? "";
    if (!arquivoConteudo) {
      return new Response(JSON.stringify({ ok: false, erro: "arquivo_conteudo é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Parsear linhas do arquivo de retorno
    const linhas = arquivoConteudo.split(/\r?\n/).filter((l) => l.length >= 400);
    const detalhes = linhas.map(parseLinha).filter((l): l is LinhaRetorno => l !== null);

    if (detalhes.length === 0) {
      return new Response(JSON.stringify({ ok: false, erro: "Nenhuma linha de detalhe encontrada no arquivo" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Identificar remessa pelo nro_sequencial do header (pos 392-394)
    const headerLinha = linhas.find((l) => l[0] === "0");
    let remessaId: string | null = null;
    if (headerLinha && headerLinha.length >= 394) {
      const nroSeqArquivo = parseInt(headerLinha.substring(391, 394).trim(), 10);
      if (!isNaN(nroSeqArquivo)) {
        const { data: remessa } = await sb
          .from("remessas_safra")
          .select("id")
          .eq("nro_sequencial", nroSeqArquivo)
          .maybeSingle();
        remessaId = (remessa as { id: string } | null)?.id ?? null;
      }
    }

    // 3. Processar cada detalhe
    let confirmados = 0;
    let rejeitados = 0;
    let emailsEnviados = 0;
    const detalhesRejeicao: Array<{
      numero_titulo: string;
      parceiro_nome: string;
      codigo_rejeicao: string;
      motivo: string;
    }> = [];

    for (const linha of detalhes) {
      // Buscar título pelo seuNumero (numero_titulo)
      const { data: titulo, error: tErr } = await sb
        .from("titulo_a_receber")
        .select(`
          id, numero_titulo, numero_parcela, total_parcelas,
          valor_bruto, data_vencimento_atual, boleto_status,
          conta:contas_pagar_receber(
            parceiro:parceiros_comerciais(
              razao_social, email
            )
          )
        `)
        .eq("numero_titulo", linha.seuNumero)
        .maybeSingle();

      if (tErr || !titulo) {
        console.warn(`[retorno-safra] Título não encontrado: seuNumero=${linha.seuNumero}`);
        continue;
      }

      // deno-lint-ignore no-explicit-any
      const tAny = titulo as any;
      const parceiro = tAny.conta?.parceiro;

      if (linha.ocorrencia === OCORRENCIA_CONFIRMADA) {
        // Confirmar registro
        await sb
          .from("titulo_a_receber")
          .update({
            nosso_numero_safra: linha.nossoNumero,
            boleto_status: "registrado",
          })
          .eq("id", tAny.id);

        confirmados++;

        // Disparar e-mail via send-transactional-email
        if (parceiro?.email) {
          try {
            const emailResp = await fetch(
              `${supabaseUrl}/functions/v1/send-transactional-email`,
              {
                method: "POST",
                headers: {
                  Authorization: authHeader,
                  "Content-Type": "application/json",
                  apikey: anonKey,
                },
                body: JSON.stringify({
                  templateName: "boleto-safra",
                  recipientEmail: parceiro.email,
                  idempotencyKey: `boleto-${tAny.id}-${linha.nossoNumero}`,
                  templateData: {
                    parceiro_nome:   parceiro.razao_social ?? "—",
                    numero_parcela:  String(tAny.numero_parcela),
                    total_parcelas:  String(tAny.total_parcelas),
                    valor:           formatBRL(Number(tAny.valor_bruto)),
                    vencimento:      formatDateBR(tAny.data_vencimento_atual),
                    linha_digitavel: `Nosso Número: ${linha.nossoNumero}`,
                    pedido_id_externo: tAny.pedido_id ?? "—",
                  },
                }),
              }
            );

            if (emailResp.ok) {
              // Registrar timestamp de envio
              await sb
                .from("titulo_a_receber")
                .update({ boleto_enviado_em: new Date().toISOString() })
                .eq("id", tAny.id);
              emailsEnviados++;
            } else {
              console.error(`[retorno-safra] Falha ao enviar email título ${tAny.id}`, await emailResp.text());
            }
          } catch (emailErr) {
            console.error(`[retorno-safra] Erro email título ${tAny.id}`, emailErr);
          }
        }

      } else if (OCORRENCIAS_REJEICAO.includes(linha.ocorrencia) || linha.motivoRejeicao !== "000") {
        // Registrar rejeição
        await sb
          .from("titulo_a_receber")
          .update({
            boleto_status: "rejeitado",
            boleto_codigo_rejeicao: linha.motivoRejeicao,
          })
          .eq("id", tAny.id);

        rejeitados++;
        detalhesRejeicao.push({
          numero_titulo: tAny.numero_titulo,
          parceiro_nome: parceiro?.razao_social ?? "—",
          codigo_rejeicao: linha.motivoRejeicao,
          motivo: descricaoRejeicao(linha.motivoRejeicao),
        });
      }
    }

    // 4. Atualizar status da remessa
    if (remessaId) {
      const novoStatus = rejeitados > 0 ? "com_rejeicoes" : "processada";
      await sb
        .from("remessas_safra")
        .update({
          status: novoStatus,
          retorno_processado_em: new Date().toISOString(),
        })
        .eq("id", remessaId);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        confirmados,
        rejeitados,
        emails_enviados: emailsEnviados,
        detalhes_rejeicao: detalhesRejeicao,
        remessa_id: remessaId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("processar-retorno-safra erro fatal", e);
    return new Response(
      JSON.stringify({ ok: false, erro: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
