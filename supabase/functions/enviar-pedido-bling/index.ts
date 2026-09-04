// Edge Function: enviar-pedido-bling
// F-3.3 — POST /pedidos/vendas no Bling a partir de pedido em pre_faturado.
// v2: suporte a remessas — lazy /01 automática + split explícito via remessa_id.
// Idempotente via pedido_remessa.bling_pedido_id. Log em bling_envios_log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import {
  resolverLinkPdfFresco,
  baixarPdfValidado,
  validarXmlNf,
  NfAnexoError,
} from "../_shared/bling/nf-anexo.ts";
import { exigirAcao } from "../_shared/permissao-acao.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ok = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
const err = (msg: string, status = 400) =>
  new Response(JSON.stringify({ sucesso: false, erro: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();
  // Compensação de remessa órfã acessível pelo catch externo (erro inesperado antes do POST).
  let cleanupRemessaOrfa: (() => Promise<void>) | null = null;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth
    const auth = req.headers.get("Authorization");
    if (!auth) return err("Não autorizado", 401);
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      auth.replace("Bearer ", ""),
    );
    if (userErr || !userData.user) return err("Não autorizado", 401);
    const userId = userData.user.id;

    // Role: super_admin, admin_rh, sops
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const rolesArr = (roles || []).map((r: any) => String(r.role));
    const ehSuperAdmin = rolesArr.includes("super_admin");
    const allowed = rolesArr.some((r) => ["super_admin", "admin_rh", "sops"].includes(r));
    if (!allowed) return err("Sem permissão (sops, admin_rh ou super_admin)", 403);

    // Input
    const body = await req.json().catch(() => ({}));
    const pedido_id = body?.pedido_id;
    let remessa_id_input: string | null = body?.remessa_id ?? null;
    if (!pedido_id) return err("pedido_id obrigatório");

    // Permissão nominal de AÇÃO (DIMENSAO-VIA-TABELA), por cima do papel.
    // Vale para os caminhos que EMPURRAM pedido pro Bling (envio e reenvio);
    // a coleta de anexos de NF (`anexos_nf`) é leitura e segue liberada.
    if (body?.acao !== "anexos_nf") {
      const guardaAcao = await exigirAcao(
        supabase,
        auth,
        "acao.enviar_bling",
        "enviar pedido pro Bling",
      );
      if (!guardaAcao.ok) return err(guardaAcao.erro ?? "Sem permissão", guardaAcao.status);
    }

    // ── Branch: anexos_nf ────────────────────────────────────────────────
    // Coleta PDF + XML das NFs de saída autorizadas do pedido e retorna
    // como anexos base64 para serem enviados via send-transactional-email.
    // NÃO encosta na lógica de remessa/estágio.
    if (body?.acao === "anexos_nf") {
      const { data: pedidoNf, error: pedidoNfErr } = await supabase
        .from("pedidos")
        .select("id, id_externo, nf_numero")
        .eq("id", pedido_id)
        .maybeSingle();
      if (pedidoNfErr || !pedidoNf) return err("Pedido não encontrado", 404);

      const orFilter = pedidoNf.nf_numero
        ? `pedido_venda_id.eq.${pedido_id},numero.eq.${pedidoNf.nf_numero}`
        : `pedido_venda_id.eq.${pedido_id}`;

      const { data: nfs, error: nfsErr } = await supabase
        .from("nfs_emitidas")
        .select("id, numero, bling_id, pdf_url, xml_url, tipo, situacao")
        .or(orFilter)
        .eq("tipo", "saida")
        .eq("situacao", "autorizada");
      if (nfsErr) return err(`Falha ao buscar NFs: ${nfsErr.message}`, 500);
      if (!nfs || nfs.length === 0) {
        return err("Sem NF de saída autorizada para este pedido", 422);
      }

      // base64 chunked (evita stack overflow para PDFs grandes)
      const toBase64 = (bytes: Uint8Array): string => {
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(
            null,
            Array.from(bytes.subarray(i, i + chunk)) as any,
          );
        }
        return btoa(binary);
      };

      const attachments: { filename: string; content: string }[] = [];
      const nf_numeros: string[] = [];

      for (const nf of nfs) {
        const rotulo = nf.numero ?? nf.bling_id ?? nf.id;

        // FAIL-LOUD: qualquer falha de resolução/validação aborta o ramo inteiro.
        // Mandar nota fiscal falsa (página de Validação de Acesso do Bling com
        // nome de PDF) é pior do que não mandar e-mail nenhum.
        let resolvido;
        let pdfBytes: Uint8Array;
        try {
          resolvido = await resolverLinkPdfFresco(supabase, null, nf as any);
          pdfBytes = await baixarPdfValidado(resolvido.url, resolvido.origem, {
            nf_id: nf.id,
            numero: nf.numero,
          });
        } catch (e) {
          const msg = (e as Error).message || String(e);
          const status = e instanceof NfAnexoError ? e.status : 502;
          console.error(`[anexos_nf] PDF da NF ${rotulo} reprovado`, {
            nf_id: nf.id,
            bling_id: nf.bling_id,
            erro: msg,
            extra: e instanceof NfAnexoError ? e.extra : null,
          });
          return err(`Anexo da NF ${rotulo} não pôde ser validado: ${msg}`, status);
        }

        attachments.push({
          filename: `NF_${nf.numero ?? nf.bling_id}.pdf`,
          content: toBase64(pdfBytes),
        });
        console.log("[anexos_nf] PDF validado", {
          nf_numero: nf.numero,
          nf_id: nf.id,
          bytes: pdfBytes.byteLength,
          origem_link: resolvido.origem,
        });

        // XML (sempre que houver) — validado antes de anexar.
        const xmlVal = resolvido.xml;
        if (xmlVal) {
          let xmlText: string;
          try {
            if (xmlVal.startsWith("http")) {
              const xmlResp = await fetch(xmlVal);
              if (!xmlResp.ok) {
                throw new NfAnexoError(
                  502,
                  `Falha ao baixar XML da NF ${rotulo}: HTTP ${xmlResp.status}`,
                );
              }
              xmlText = validarXmlNf(await xmlResp.text(), { nf_id: nf.id });
            } else {
              xmlText = validarXmlNf(xmlVal, { nf_id: nf.id });
            }
          } catch (e) {
            const msg = (e as Error).message || String(e);
            const status = e instanceof NfAnexoError ? e.status : 502;
            console.error(`[anexos_nf] XML da NF ${rotulo} reprovado`, {
              nf_id: nf.id,
              erro: msg,
            });
            return err(`XML da NF ${rotulo} não pôde ser validado: ${msg}`, status);
          }

          const xmlBytes = new TextEncoder().encode(xmlText);
          attachments.push({
            filename: `NF_${nf.numero ?? nf.bling_id}.xml`,
            content: toBase64(xmlBytes),
          });
          console.log("[anexos_nf] XML validado", {
            nf_numero: nf.numero,
            nf_id: nf.id,
            bytes: xmlBytes.byteLength,
          });
        }

        if (nf.numero) nf_numeros.push(nf.numero);
      }

      return ok({ sucesso: true, attachments, nf_numeros });

    }
    // ── fim branch anexos_nf ─────────────────────────────────────────────



    // 1. Pedido
    const { data: pedido, error: pedErr } = await supabase
      .from("pedidos")
      .select("*")
      .eq("id", pedido_id)
      .maybeSingle();
    if (pedErr || !pedido) return err("Pedido não encontrado", 404);

    // Guard de estágio. Os estágios permitidos refletem a evolução do desenho de envio:
    //   pre_separacao   — envio inicial (comportamento atual, será aposentado).
    //   em_separacao    — envio de remessa adicional (/02+) em split.
    //   pre_faturamento — destino do desenho novo: frente FATURAMENTO-NASCE-NO-SNCF, o pedido
    //                     desce ao Bling tarde e completo, depois que a XPM devolve peso e volume reais.
    //
    // Contexto da mudança (02/09/2026): hoje o envio acontece em pre_separacao, minutos depois de
    // a XPM criar a expedição. No PED-2164 foram 6 minutos (expedição 11:23, envio 11:29, próximo
    // tick do sync 11:33). Medido: em 100 pedidos com expedição na XPM, o SNCF sabia peso e volume
    // antes do envio ao Bling em ZERO deles, mesmo com sync a cada 15 minutos. Não é falta de dado
    // nem lentidão de sync — é o envio ser cedo demais.
    //
    // Sem pre_faturamento nesta lista, a trava 4a-ter (portão via fn_pedido_portao_liberado) é
    // inalcançável do único lugar onde deveria valer: o envio é recusado por estágio antes de
    // qualquer checagem de portão.
    const estagiosPermitidos = ["pre_separacao", "em_separacao", "pre_faturamento"];
    if (!estagiosPermitidos.includes(pedido.estagio)) {
      return err(`Pedido em estágio "${pedido.estagio}" — envio não permitido neste estágio`);
    }

    // ── Branch: reenviar ─────────────────────────────────────────────────
    // Reenvio ao Bling APÓS cancelamento LÁ. Prepara (cancela a tentativa vigente
    // preservando o id morto + cria a tentativa seguinte) e cai no fluxo normal
    // de envio com a remessa nova. Exclusivo de super_admin.
    // REENVIO-SEGUE-O-ENVIO (28/08/2026): o reenvio vale nos mesmos estagios do envio
    // normal. Restrito a em_separacao, pedido devolvido para Cobranca, corrigido e
    // descido de volta ficava sem saida: "Enviar pro Bling" exige !bling_id_destino e
    // o reenvio exigia em_separacao. Cobranca segue barrada pelo guard de estagio acima.
    if (body?.acao === "reenviar") {
      if (!ehSuperAdmin) return err("Reenvio ao Bling é exclusivo de super_admin", 403);
      if (pedido.estagio !== "em_separacao" && pedido.estagio !== "pre_separacao") {
        return err(`Reenvio só em "Pré-separação" ou "Em separação" — pedido está em "${pedido.estagio}"`, 409);
      }
      if (!pedido.bling_id_destino) {
        return err("Pedido ainda não tem id do Bling — use o envio normal, não o reenvio", 409);
      }
      const motivo: string = String(body?.motivo ?? "").trim();
      if (!motivo) return err("Motivo obrigatório para reenviar", 400);

      // AVISO, NÃO BLOQUEIO — SISTEMA SUGERE / HUMANO DECIDE.
      // Reenviar um pedido que NÃO foi cancelado no Bling cria pedido DUPLICADO lá.
      if (!body?.confirmar_nao_cancelado) {
        let situacaoAviso: string | null = null;
        try {
          const { data: cfgChk } = await supabase
            .from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
          if (!cfgChk?.access_token) throw new Error("Bling não conectado");

          const tk = await ensureFreshToken(supabase, cfgChk);
          const cli = makeBlingClient(supabase, cfgChk, tk);

          // TRÊS RESPOSTAS POSSÍVEIS, NÃO DUAS.
          // (a) pedido existe e está Cancelado  → reenvio liberado
          // (b) pedido NÃO EXISTE MAIS (404)    → reenvio liberado — não há o que duplicar
          // (c) pedido existe em outra situação → avisa e pede confirmação
          // O código antigo só conhecia (a) e (c): o 404 caía no catch genérico e virava
          // "situação não verificada", disparando o aviso de duplicata justamente no caminho
          // MAIS seguro. Foi o que travou o reenvio do PED-2147 (excluído no Bling, 17/08).
          let resSit: any = null;
          let ausenteNoBling = false;
          try {
            resSit = await cli.get(`/pedidos/vendas/${pedido.bling_id_destino}`);
          } catch (eGet) {
            const msgGet = (eGet as Error).message ?? "";
            // Só 404 + RESOURCE_NOT_FOUND libera. Qualquer outro erro (401, 429, 5xx, rede)
            // continua sendo "não verificada" — não confundir "não existe" com "não consegui olhar".
            const ehAusente = /\b404\b/.test(msgGet)
              && /RESOURCE_NOT_FOUND|encontrado|encontrada/i.test(msgGet);
            if (!ehAusente) throw eGet;
            ausenteNoBling = true;
          }

          if (ausenteNoBling) {
            console.log("[reenviar] pedido ausente no Bling (404) — excluído lá, reenvio liberado", {
              pedido_id, bling_id: String(pedido.bling_id_destino),
            });
            situacaoAviso = null; // libera: segue direto pro reenviar_pedido_bling
          } else {
            const sitId = Number(resSit?.data?.situacao?.id ?? resSit?.data?.situacao?.valor ?? 0);

            // DIMENSÃO VIA TABELA: o id de "Cancelado" vem de bling_situacoes, nunca hardcode.
            const { data: sitCancelado } = await supabase
              .from("bling_situacoes").select("bling_situacao_id")
              .eq("modulo_nome", "Vendas").eq("nome", "Cancelado").maybeSingle();
            if (!sitCancelado?.bling_situacao_id) throw new Error("Situação 'Cancelado' ausente em bling_situacoes");

            if (sitId && sitId !== Number(sitCancelado.bling_situacao_id)) {
              const { data: sitAtual } = await supabase
                .from("bling_situacoes").select("nome")
                .eq("modulo_nome", "Vendas").eq("bling_situacao_id", sitId).maybeSingle();
              situacaoAviso = sitAtual?.nome ?? `situação ${sitId}`;
            }
          }
        } catch (e) {
          // Não conseguir OLHAR não é permissão para reenviar no escuro. Mensagem enxuta:
          // o JSON cru do Bling ia inteiro para a tela do usuário (PED-2147).
          const bruto = (e as Error).message ?? String(e);
          const enxuto = bruto.length > 160 ? `${bruto.slice(0, 160)}…` : bruto;
          situacaoAviso = `não verificada (${enxuto})`;
        }


        if (situacaoAviso) {
          return new Response(JSON.stringify({
            sucesso: false,
            requer_confirmacao: true,
            situacao_atual: situacaoAviso,
            bling_id: String(pedido.bling_id_destino),
            erro: `O pedido ${pedido.bling_id_destino} não consta cancelado no Bling (situação: ${situacaoAviso}). Reenviar agora pode criar um pedido DUPLICADO lá.`,
          }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      const { data: prep, error: prepErr } = await supabase.rpc("reenviar_pedido_bling" as string, {
        p_pedido_id: pedido_id,
        p_motivo: motivo,
        p_ator: userId,
      });
      if (prepErr) return err(`Falha ao preparar reenvio: ${prepErr.message}`, 500);
      if (!prep?.ok) return err(String(prep?.erro ?? "Falha ao preparar reenvio"), 409);

      // Segue o fluxo normal de envio, agora apontando pra tentativa nova.
      remessa_id_input = String(prep.remessa_id);
    }
    // ── fim branch reenviar ──────────────────────────────────────────────

    // ── Gate por TIPO de envio (03/09/2026) — FATURAMENTO-NASCE-NO-SNCF, Fatia A ──
    // O guard acima aceita os tres estagios porque o REENVIO precisa deles
    // (REENVIO-SEGUE-O-ENVIO). Aqui, fora do reenvio, a porta fecha por tipo:
    //   envio INICIAL (lazy /01, sem remessa_id) -> so pre_faturamento.
    //     Medido em 03/09: 100% dos pedidos B2B dos ultimos 30 dias desceram ao Bling em
    //     pre_separacao, 3-12s depois da XPM, sem peso/volume reais. O comentario "sera
    //     aposentado" acima ficou 2 semanas sem aposentar. CONCESSAO-QUE-NAO-TRANCA-E-MENTIRA:
    //     a trava real e esta, nao o botao que some da tela.
    //   remessa EXPLICITA (split /02+, remessa_id informado) -> em_separacao ou pre_faturamento.
    if (body?.acao !== "reenviar") {
      if (!remessa_id_input && pedido.estagio !== "pre_faturamento") {
        return err(
          `Envio inicial ao Bling so em pre_faturamento (pedido em "${pedido.estagio}"). ` +
          `Empurre pra XPM primeiro; o Bling recebe depois que a expedicao for conferida.`,
          409,
        );
      }
      if (remessa_id_input && pedido.estagio === "pre_separacao") {
        return err(
          `Remessa dividida so em em_separacao ou pre_faturamento (pedido em "pre_separacao").`,
          409,
        );
      }
    }

    // 1b. Remessa: usa a fornecida ou cria lazy /01
    let remessa: any = null;
    // Guarda o id da remessa criada NESTA chamada (nunca de remessa preexistente),
    // para permitir a compensação em qualquer caminho de erro antes do POST.
    let remessaCriadaNestaChamada: string | null = null;


    if (remessa_id_input) {
      // Remessa explícita (split)
      const { data: rem } = await supabase
        .from("pedido_remessa")
        .select("*")
        .eq("id", remessa_id_input)
        .eq("pedido_id", pedido_id)
        .maybeSingle();

      if (!rem) return err("Remessa não encontrada ou não pertence a este pedido", 404);
      if (rem.bling_pedido_id) return err(`Remessa já enviada ao Bling (id ${rem.bling_pedido_id})`, 409);
      if (rem.status === "cancelada") return err("Remessa cancelada — não pode ser enviada", 409);
      remessa = rem;
    } else {
      // Lazy: verifica idempotência via bling_id_destino
      if (pedido.bling_id_destino) {
        return err(`Pedido já enviado pro Bling (id ${pedido.bling_id_destino})`, 409);
      }

      // Guardrail remessas existentes — FAIL-LOUD: se já existem remessas manuais
      // não-canceladas, não cria lazy por cima. Selecione explicitamente via remessa_id.
      const { data: remessasExistentes } = await supabase
        .from("pedido_remessa")
        .select("id, sequencia, status, bling_pedido_id")
        .eq("pedido_id", pedido_id)
        .neq("status", "cancelada");

      if (remessasExistentes && remessasExistentes.length > 0) {
        const lista = remessasExistentes
          .map((r: any) => `seq ${r.sequencia} (${r.status}${r.bling_pedido_id ? ` — Bling ${r.bling_pedido_id}` : ""})`)
          .join(", ");
        return err(
          `Pedido já possui ${remessasExistentes.length} remessa(s) ativa(s): ${lista}. ` +
          `Selecione uma remessa específica para enviar ao invés de criar nova automaticamente.`,
          409,
        );
      }

      // FAIL-LOUD SEM DEIXAR RASTRO — a remessa e um efeito colateral persistente.
      // Cria-la antes dos guardrails fazia toda tentativa falha deixar uma remessa orfa,
      // que na tentativa seguinte disparava o guardrail de "remessa ja existente" e
      // travava o pedido para sempre (PED-2116, 08/08). Remessa nasce so quando o envio
      // esta garantido, ou e desfeita no mesmo request se algo falhar antes do POST.
      //
      // CAMINHO ADOTADO: COMPENSAÇÃO (não reordenação). Motivo técnico: os itens do POST
      // vêm de `remessa.itens_json`, logo a remessa PRECISA existir antes da montagem e
      // validação dos itens. Toda saída de erro entre a criação e o POST passa por
      // `falhaLimpando()`, que apaga a remessa criada nesta chamada. Remessa preexistente
      // nunca é apagada, e nada é apagado depois que o POST foi efetivamente enviado.
      const { data: rpcResult, error: rpcErr } = await supabase.rpc("criar_remessa" as string, {
        p_pedido_id: pedido_id,
        p_status: "pronta_para_envio",
        p_observacao: "Remessa /01 criada automaticamente no envio ao Bling",
      });
      if (rpcErr || !rpcResult?.remessa_id) {
        return err(`Falha ao criar remessa /01: ${rpcErr?.message ?? "sem remessa_id"}`, 500);
      }
      remessaCriadaNestaChamada = rpcResult.remessa_id as string;

      const { data: rem } = await supabase
        .from("pedido_remessa")
        .select("*")
        .eq("id", rpcResult.remessa_id)
        .maybeSingle();
      if (!rem) {
        await supabase.from("pedido_remessa").delete().eq("id", rpcResult.remessa_id);
        remessaCriadaNestaChamada = null;
        return err("Remessa /01 criada mas não encontrada", 500);
      }
      remessa = rem;
    }

    // Compensação: apaga a remessa criada nesta chamada antes de devolver o erro.
    const limparRemessaOrfa = async () => {
      if (!remessaCriadaNestaChamada) return;
      const id = remessaCriadaNestaChamada;
      remessaCriadaNestaChamada = null;
      try {
        await supabase.from("pedido_remessa").delete().eq("id", id).is("bling_pedido_id", null);
      } catch (e) {
        console.error("[enviar-pedido-bling] falha ao limpar remessa órfã", id, e);
      }
    };
    const falhaLimpando = async (msg: string, status = 400) => {
      await limparRemessaOrfa();
      return err(msg, status);
    };
    cleanupRemessaOrfa = limparRemessaOrfa;


    // Código e valor da remessa
    const remessaCodigo = remessa?.codigo_bling as string | null;
    if (!remessaCodigo || remessaCodigo.trim() === "") {
      return await falhaLimpando(
        `remessa ${remessa.id} sem codigo_bling — ponte com o Bling indefinida, envio abortado`,
        500,
      );
    }
    const remessaValor = Number(remessa.valor_remessa ?? pedido.valor_liquido);



    // 2. Parceiro (cliente)
    const { data: parceiro } = await supabase
      .from("parceiros_comerciais")
      .select("id, bling_id, razao_social, cnpj")
      .eq("id", pedido.parceiro_id)
      .maybeSingle();
    if (!parceiro?.bling_id) {
      return await falhaLimpando("Parceiro sem bling_id — sincronize o parceiro no Bling antes", 409);
    }

    // 2b. Transportadora (opcional)
    let blingTransportadoraId: number | null = null;
    let transpCnpj: string | null = null;
    let transpNome: string | null = null;
    if (pedido.transportadora_id) {
      const { data: transp } = await supabase
        .from("parceiros_comerciais")
        .select("bling_id, razao_social, cnpj")
        .eq("id", pedido.transportadora_id)
        .maybeSingle();
      if (transp?.bling_id) blingTransportadoraId = Number(transp.bling_id);
      transpCnpj = transp?.cnpj ?? null;
      transpNome = transp?.razao_social ?? null;
    }

    // 3. Forma de pagamento
    const { data: forma } = await supabase
      .from("formas_pagamento")
      .select("id, codigo, nome, bling_id_forma_pagamento")
      .eq("codigo", pedido.forma_solicitada)
      .maybeSingle();
    if (!forma) {
      return await falhaLimpando(`Forma de pagamento "${pedido.forma_solicitada}" não encontrada em formas_pagamento`, 409);
    }

    // 4. Títulos (sempre do pedido — cobrança não fragmenta por remessa em v1)
    // 4a. LASTRO — fonte única da pergunta "este pedido tem recebível?".
    // O guardrail antigo era "geraTitulo && titulos.length === 0 → bloqueia", que só
    // conhecia dois mundos. Existem CINCO estados legítimos com zero linhas de cobrança
    // (natureza sem cobrança, provisão prevista, título vivo, haver aplicado integral,
    // cobertura por família) e apenas UM ilegítimo (cobrança não configurada).
    // fn_pedido_tem_lastro é o juiz único — a mesma função é consumida por
    // fn_destino_pos_estoque e pela vw_pedido_situacao_financeira. Doutrina LASTRO-E-VINCULO.
    const { data: lastroRpc, error: lastroErr } = await supabase
      .rpc("fn_pedido_tem_lastro", { p_pedido_id: pedido_id });
    if (lastroErr) {
      return await falhaLimpando(`Falha ao avaliar o lastro do pedido: ${lastroErr.message}`, 500);
    }
    const lastro = (lastroRpc ?? {}) as {
      tem_lastro?: boolean; fonte?: string; porque?: string;
      falta?: number; valor_coberto?: number; valor_devido?: number;
    };
    if (!lastro.tem_lastro) {
      return await falhaLimpando(
        `${lastro.porque ?? "Pedido sem lastro."} ` +
        `Confirme o portão na aba Primeiro Pagamento ou materialize a cobrança antes de enviar ao Bling.`,
        409,
      );
    }

    // 4a-bis. PLANO-COBRE-O-PEDIDO (28/08/2026): ter lastro é ter vínculo, não ter
    // valor suficiente. `fn_pedido_tem_lastro` diz que existe plano; `falta` diz se
    // ele cobre. Sem esta trava, editar itens e esquecer de remontar o plano fazia a
    // NF sair pelo valor novo e o título nascer pelo valor velho — furo silencioso,
    // porque o título nasce da provisão (fn_faturar_pedido), nunca do valor do pedido.
    const faltaCobranca = Number(lastro.falta ?? 0);
    if (faltaCobranca > 0.05) {
      return await falhaLimpando(
        `Plano de cobrança não cobre o pedido: faltam R$ ${faltaCobranca.toFixed(2)} ` +
        `de R$ ${Number(lastro.valor_devido ?? 0).toFixed(2)} (coberto R$ ${Number(lastro.valor_coberto ?? 0).toFixed(2)}, ` +
        `fonte: ${lastro.fonte ?? "desconhecida"}). ` +
        `Remonte o plano de pagamento em Cobrança antes de enviar ao Bling.`,
        409,
      );
    }

    // 4a-ter. PORTÃO PAGO — segunda pergunta ortogonal ao lastro.
    // lastro = existe recebível vinculado e ele cobre o pedido? (fn_pedido_tem_lastro)
    // portão = o dinheiro que tinha que vir ANTES já veio? (fn_pedido_portao_liberado)
    // PORTÃO-NÃO-É-INSTRUMENTO: a unidade é a linha do plano (provisao_recebimento.eh_portao),
    // qualquer meio; o instrumento só diz onde a prova aparece.
    // Não exige nível de prova: pago_em basta; nível de prova é eixo da Mesa de Cobrança.
    const { data: portaoRpc, error: portaoErr } = await supabase
      .rpc("fn_pedido_portao_liberado", { p_pedido_id: pedido_id });
    if (portaoErr) {
      return await falhaLimpando(`Falha ao avaliar o portão do pedido: ${portaoErr.message}`, 500);
    }
    const portao = (portaoRpc ?? {}) as {
      liberado?: boolean; fonte?: string; porque?: string;
      linhas_abertas?: number; valor_aberto?: number;
      linhas_portao_total?: number;
    };
    if (portao.liberado !== true) {
      return await falhaLimpando(
        `${portao.porque ?? "Portão do pedido não está liberado."} ` +
        `Confirme o pagamento na aba Primeiro Pagamento antes de enviar ao Bling.`,
        409,
      );
    }

    console.log("[enviar-pedido-bling] lastro OK", {
      pedido_id, fonte: lastro.fonte, porque: lastro.porque,
      valor_devido: lastro.valor_devido, valor_coberto: lastro.valor_coberto,
      portao_fonte: portao.fonte, portao_linhas_portao_total: portao.linhas_portao_total,
    });

    // Nao existe trava de "dinheiro antes da NF". A condicao pix_faturamento e credito
    // a prazo aprovado na analise: o cliente paga contra a NF, com data de vencimento, e
    // se nao pagar o titulo vence e entra na regua de cobranca — mesma mecanica do boleto.
    // Lastro (4a) e portao (4a-ter) sao as duas perguntas ortogonais que este envio faz
    // sobre recebivel.



    const { data: titulosRpc } = await supabase
      .rpc("fn_plano_recebimento_pedido", { p_pedido_id: pedido_id });
    // Blindagem: RPC com erro devolve null. Sem isso, titulos.reduce() abaixo estoura.
    const titulos: any[] = Array.isArray(titulosRpc) ? titulosRpc : [];

    // 5. Itens da remessa (formato normalizado: {descricao, sku, quantidade, valor_unitario})
    const itens: any[] = Array.isArray(remessa.itens_json) ? remessa.itens_json : [];

    // 5b. Guardrail SKU — FAIL-LOUD: item sem SKU chegaria ao Bling como avulso
    // (sem produto.id e sem código), gerando aviso amarelo ⚠️. Corrija o catálogo.
    const itensSemSku = itens.filter((it: any) => !it.sku || String(it.sku).trim() === "");
    if (itensSemSku.length > 0) {
      const nomes = itensSemSku
        .map((it: any) => it.descricao ?? "(sem descrição)")
        .join(" | ");
      return await falhaLimpando(
        `${itensSemSku.length} item(s) sem SKU — corrija o catálogo antes de enviar ao Bling: ${nomes}`,
        409,
      );
    }

    // 6. Config Bling
    const { data: cfg } = await supabase
      .from("integracoes_config")
      .select("*")
      .eq("sistema", "bling")
      .maybeSingle();
    if (!cfg || !cfg.access_token) {
      return await falhaLimpando("Bling não conectado — fazer OAuth via /administrativo/bling", 503);
    }

    const freshToken = await ensureFreshToken(supabase, cfg);
    const client = makeBlingClient(supabase, cfg, freshToken);

    // 7. ID da forma de pagamento — FAIL-LOUD.
    // Fonte única: formas_pagamento.bling_id_forma_pagamento (ID do cadastro DO BLING,
    // 7-8 dígitos). O lookup dinâmico por palavra-chave em /formas-pagamentos foi
    // REMOVIDO: casar "descrição parecida" é fallback silencioso e pode faturar com a
    // forma errada. Sem ID válido no cadastro, o envio é barrado antes de qualquer POST.
    const abortarForma = async (msg: string) => {
      await supabase.from("bling_envios_log").insert({
        pedido_id,
        enviado_por: userId,
        payload_enviado: null,
        resposta_status: null,
        resposta_body: null,
        bling_id_retornado: null,
        sucesso: false,
        erro_msg: msg,
        duracao_ms: Date.now() - t0,
      });
      await supabase.from("pedidos").update({ bling_envio_erro: msg }).eq("id", pedido_id);
      return await falhaLimpando(msg, 409);
    };

    const blingFormaIdBruto = forma.bling_id_forma_pagamento ?? null;

    if (blingFormaIdBruto === null || blingFormaIdBruto === undefined) {
      return await abortarForma(
        `A forma de pagamento "${forma.nome}" não tem cadastro correspondente no Bling. ` +
        `Cadastre a forma no Bling e preencha o ID em Formas de Pagamento antes de enviar este pedido.`,
      );
    }

    const blingFormaId = Number(blingFormaIdBruto);

    // Limiar 1000: todo ID real da conta Bling da Fetély tem 7-8 dígitos; todo código
    // legado de TIPO de pagamento da NFe (1, 2, 18, 99...) é menor que 100.
    if (!Number.isFinite(blingFormaId) || blingFormaId < 1000) {
      return await abortarForma(
        `A forma de pagamento "${forma.nome}" está com um ID inválido no cadastro (${blingFormaIdBruto}) — ` +
        `esse número é código de tipo de pagamento, não ID de forma de pagamento do Bling. ` +
        `Corrija em Formas de Pagamento antes de enviar.`,
      );
    }


    // 7.5 Canal/Loja Fetely
    let blingLojaId: number | null = (cfg.config as any)?.loja_bling_id ?? null;
    if (!blingLojaId) {
      for (const endpoint of ["/canais-venda", "/lojas"]) {
        try {
          const resp = await client.get(endpoint);
          const lista = resp?.data ?? resp?.items ?? (Array.isArray(resp) ? resp : []);
          const found = Array.isArray(lista)
            ? lista.find((l: any) =>
                (l.descricao || l.nome || l.situacao || "").toLowerCase().includes("fetely")
              )
            : null;
          if (found?.id) {
            blingLojaId = found.id;
            const newConfig = { ...((cfg.config as any) || {}), loja_bling_id: found.id };
            await supabase.from("integracoes_config").update({ config: newConfig }).eq("id", cfg.id);
            break;
          }
        } catch (_) { /* tenta próximo endpoint */ }
      }
    }

    // 8. Parcelas — rateadas proporcional ao valor da remessa.
    // Remessa única: fator = 1 (remessaValor = soma do plano) → parcelas intactas.
    // Remessa dividida: fator < 1 → cada parcela escala na mesma proporção, mantendo datas e nº de parcelas.
    //
    // PORTAO-SAI-DO-ARRAY (03/09/2026, decisao Flavio). Linha de portao e dinheiro que JA ENTROU
    // (PIX antecipado, cartao capturado). Nao e divida do cliente: duplicata no Bling em nome dele
    // nunca seria baixada la (ruido de conciliacao) e, no cartao parcelado, cobraria o cliente por
    // um recebivel que e contra a ADQUIRENTE (PED-2191: 3 parcelas 0/30/60 todas capturadas em
    // 02/09; o plano dizia 01/10 e 31/10). O recibo fica no SNCF; a perna da adquirente vive em
    // safrapay_liquidacao. `parcelas: []` com total>0 ja provado contra o Bling (PED-2114, PED-2066).
    //
    // O FATOR e calculado contra o PLANO COMPLETO (portao incluido): se fosse contra o que sobra,
    // as parcelas a prazo seriam INFLADAS para cobrir o que o cliente ja pagou. Medido: entrada de
    // cartao e 25-33% do plano nos pedidos mistos.
    const somaPlano = parseFloat(
      titulos.reduce((s: number, t: any) => s + Number(t.valor_bruto), 0).toFixed(2),
    );
    const fatorRemessa = somaPlano > 0
      ? parseFloat((remessaValor / somaPlano).toFixed(6))
      : 1;

    const titulosAPrazo = titulos.filter((t: any) => !t.eh_portao);
    const valorPortaoPlano = parseFloat(
      titulos.filter((t: any) => t.eh_portao)
        .reduce((s: number, t: any) => s + Number(t.valor_bruto), 0).toFixed(2),
    );

    // Data: `data_vencimento_efetiva` = ANCORA declarada no pre-faturamento (fn_declarar_ancora_
    // faturamento) ou, no titulo, o recalculo com ancora na NF. Fallback na planejada so para
    // contrato antigo. ANCORA-E-DECLARADA-NO-PRE-FATURAMENTO: a data que desce e a que o humano
    // decidiu, nao a que a Cobranca chutou dias antes (medido: 27 de 39 planejadas ja vencidas).
    const blingParcelas = titulosAPrazo.map((t: any) => ({
      dataVencimento: t.data_vencimento_efetiva ?? t.data_vencimento_original,
      valor: parseFloat((Number(t.valor_bruto) * fatorRemessa).toFixed(2)),
      formaPagamento: { id: Number(blingFormaId) },
    }));

    // Ajuste de centavo: soma exata = fracao A PRAZO da remessa (nao remessaValor inteiro —
    // o portao nao esta no array e nao pode ser "compensado" na ultima duplicata).
    const alvoAPrazo = parseFloat(
      (titulosAPrazo.reduce((s: number, t: any) => s + Number(t.valor_bruto), 0) * fatorRemessa).toFixed(2),
    );
    const somaParcelas = blingParcelas.reduce((s, p) => s + p.valor, 0);
    const diff = parseFloat((alvoAPrazo - somaParcelas).toFixed(2));
    if (Math.abs(diff) >= 0.01 && blingParcelas.length > 0) {
      blingParcelas[blingParcelas.length - 1].valor = parseFloat(
        (blingParcelas[blingParcelas.length - 1].valor + diff).toFixed(2),
      );
    }

    // TOTAL — SEMPRE o valor da remessa. Antes derivava da soma das parcelas quando havia
    // parcelas; com o portao fora do array isso faria a NF sair por valor MENOR que a venda
    // (erro fiscal, nao ruido). O total e fato da venda; as parcelas sao so a parte a receber.
    const temParcelas = blingParcelas.length > 0;
    const totalExato = remessaValor;
    console.log("[parcelas] plano", {
      linhas_plano: titulos.length, linhas_a_prazo: titulosAPrazo.length,
      valor_portao_plano: valorPortaoPlano, fator: fatorRemessa,
      total: totalExato, soma_parcelas_enviadas: alvoAPrazo, tem_parcelas: temParcelas,
    });

    // 9. Sync de produtos: cache → Bling GET → Bling POST (auto-cadastro)
    const stripQtdSuffix = (d: string) =>
      (d || "").replace(/\s*\(\d+\s*un\.?\)\s*$/i, "").trim();

    const skusComCodigo = [...new Set(
      itens.map((it: any) => it.sku).filter(Boolean)
    )] as string[];

    const { data: cachedRows } = skusComCodigo.length > 0
      ? await supabase
          .from("bling_produtos_cache")
          .select("sku, bling_produto_id")
          .in("sku", skusComCodigo)
      : { data: [] };

    const cacheMap: Record<string, number> = {};
    for (const row of (cachedRows || [])) {
      cacheMap[row.sku] = row.bling_produto_id;
    }

    const novosCacheEntries: { sku: string; bling_produto_id: number; nome: string }[] = [];

    for (const it of itens) {
      if (!it.sku || cacheMap[it.sku]) continue;

      const nome = stripQtdSuffix(it.descricao);

      let blingProdId: number | null = null;
      const skuTrim = String(it.sku).trim();

      // Catálogo Bling é 100% plano (sem variação) e os nomes são genéricos/repetidos.
      // Casar por nome ou caçar "produto pai" é furada — pode resolver para o produto ERRADO.
      // O único campo confiável é o CÓDIGO. trim() dos dois lados: há código gravado com tab invisível.
      const acharPorCodigo = async (): Promise<number | null> => {
        // 1) filtro exato por código (Bling v3 aceita ?codigo=)
        try {
          const r = await client.get(`/produtos?codigo=${encodeURIComponent(skuTrim)}&limite=100`);
          const m = (r?.data || []).find((p: any) => String(p.codigo || "").trim() === skuTrim);
          if (m?.id) return m.id;
        } catch (_) {}
        // 2) fallback: busca por critério de código
        try {
          const r = await client.get(`/produtos?criterio=2&q=${encodeURIComponent(skuTrim)}&limite=100`);
          const m = (r?.data || []).find((p: any) => String(p.codigo || "").trim() === skuTrim);
          if (m?.id) return m.id;
        } catch (_) {}
        return null;
      };

      blingProdId = await acharPorCodigo();

      // NÃO cria produto no Bling. O "cria-se-não-acha" gerava lixo/duplicata no catálogo.
      // Se não achou pelo código (acharPorCodigo acima), deixa não-resolvido → o guardrail
      // FAIL-LOUD abaixo bloqueia o envio e lista o SKU pra correção manual. A cache completa
      // (sincronizar-cache-bling, cron diário) cobre os ativos; produto novo entra em até 24h.

      if (blingProdId) {
        cacheMap[it.sku] = blingProdId;
        novosCacheEntries.push({ sku: it.sku, bling_produto_id: blingProdId, nome });
      }
    }

if (novosCacheEntries.length > 0) {
  supabase
    .from("bling_produtos_cache")
    .upsert(novosCacheEntries, { onConflict: "sku" })
    .then(() => {})
    .catch(() => {});
}

// Guardrail pós-sync — FAIL-LOUD: produtos com SKU que não foram resolvidos
// (não encontrados nem criados no Bling) iriam como avulsos sem código.
// Bloqueamos o envio e listamos os produtos para correção manual.
const itensSemProdutoBling = itens.filter(
  (it: any) => it.sku && !cacheMap[it.sku]
);
if (itensSemProdutoBling.length > 0) {
  const nomes = itensSemProdutoBling
    .map((it: any) => `${it.descricao ?? "(sem descrição)"} [${it.sku}]`)
    .join(" | ");
  return await falhaLimpando(
    `${itensSemProdutoBling.length} produto(s) não encontrado(s) nem criado(s) no Bling — ` +
    `verifique os logs do Bling e cadastre manualmente antes de reenviar: ${nomes}`,
    409,
  );
}

// 9d. Monta itens com produto.id (catálogo) ou fallback avulso
    // Frete da REMESSA (rateado na divisão) quando existir; senão o do pedido.
    // remessa.valor_frete = NULL em remessa não-dividida → usa pedido.valor_frete (comportamento original).
    const freteBase = remessa.valor_frete != null
      ? Number(remessa.valor_frete)
      : Number(pedido.valor_frete ?? 0);
    const valorFrete = freteBase > 0 ? freteBase : 0;

    const baseItens = valorFrete > 0
      ? Math.max(0, remessaValor - valorFrete)
      : remessaValor;

    // Soma real dos itens_json — denominador correto para o ajusteFator.
    // Usar pedido.valor_bruto era incorreto: quando o desconto master é aplicado
    // só no total (não por linha), valor_bruto = valor_liquido e ajusteFator = 1,
    // mas a soma dos itens pode ser maior — causando diff enorme e preço negativo
    // no último item. A soma real dos itens é sempre o denominador certo.
    const somaItensJson = parseFloat(
      itens.reduce((s: number, it: any) =>
        s + Number(it.valor_unitario) * Number(it.quantidade), 0
      ).toFixed(2)
    );

    // AJUSTE-FATOR-SIMETRICO: o fator encolhe (desconto no total) e tambem amplia
    // (acrescimo fiscal por situacao de IE; frete rateado em remessa filha). Antes ele
    // travava em 1 quando a base era maior que a soma dos itens, e o guard de R$ 5,00
    // derrubava o envio. O acrescimo e preco de mercadoria: rateia no unitario.
    const ajusteFator =
      somaItensJson > 0
        ? parseFloat((baseItens / somaItensJson).toFixed(6))
        : 1;

    // Trava de sanidade: fator fora desta faixa nao e desconto nem acrescimo, e erro
    // de origem (itens_json com preco errado, remessa com valor incoerente). FAIL-LOUD
    // antes de mandar preco distorcido para a NF.
    if (ajusteFator < 0.5 || ajusteFator > 1.5) {
      return await falhaLimpando(
        `Fator de ajuste fora da faixa aceitavel (${ajusteFator}): base dos itens ` +
        `R$ ${baseItens.toFixed(2)} contra soma dos itens R$ ${somaItensJson.toFixed(2)}. ` +
        `Corrija a origem dos precos antes de reenviar.`,
        409,
      );
    }

    const rawItens = itens.length > 0
      ? itens.map((it: any) => {
          const blingProdId = it.sku ? cacheMap[it.sku] : null;
          const qty = Number(it.quantidade);
          const lineTotal = parseFloat((Number(it.valor_unitario) * qty * ajusteFator).toFixed(2));
          // O codigo do item e o unico ancoradouro conferivel entre o pedido no Bling,
          // a etiqueta fisica e a lista de separacao. Sem ele a linha sai so com descricao
          // livre e o separador nao tem contra o que conferir (causa do PED-2122).
          // A descricao continua sendo enviada de proposito: o nome do cadastro no Bling
          // ainda esta contaminado (877 ativos com "contem Xun.", 72 com "cor ,") e sairia
          // na NF. Parar de enviar descricao so depois do saneamento do cadastro no Bling.
          return {
            descricao: stripQtdSuffix(it.descricao),
            ...(it.sku ? { codigo: String(it.sku).trim() } : {}),
            ...(blingProdId ? { produto: { id: blingProdId } } : {}),
            unidade: "UN",
            quantidade: qty,
            valor: parseFloat((lineTotal / qty).toFixed(4)),
          };
        })
      : null;

    const totalProdutosCalc = rawItens
      ? parseFloat(
          rawItens
            .reduce((s, it) => s + parseFloat((it.valor * it.quantidade).toFixed(2)), 0)
            .toFixed(2),
        )
      : totalExato;

    const totalProdutosPayload = rawItens
      ? parseFloat((totalExato - valorFrete).toFixed(2))
      : totalExato;

    const diffItens = parseFloat((totalProdutosPayload - totalProdutosCalc).toFixed(2));

    // Guardrail diff — FAIL-LOUD: diferença > R$ 5,00 indica inconsistência
    // real nos preços (ex: itens_json com preço tabela vs valor_liquido com desconto).
    // Se silenciado, a diferença cai inteira no último item gerando preço negativo.
    // Corrija a origem dos preços em itens_json antes de reenviar.
    if (Math.abs(diffItens) > 5.00) {
      return await falhaLimpando(
        `Inconsistência de valor: diferença de R$ ${Math.abs(diffItens).toFixed(2)} entre ` +
        `soma dos itens (R$ ${totalProdutosCalc.toFixed(2)}) e valor do pedido ` +
        `(R$ ${totalProdutosPayload.toFixed(2)}). ` +
        `Verifique os preços nos itens_json da remessa — provável uso de preço tabela onde se espera preço descontado.`,
        409,
      );
    }

    // Ajuste de centavos de arredondamento (|diff| <= R$ 5,00): aplica no último item
    if (Math.abs(diffItens) >= 0.01 && rawItens && rawItens.length > 0) {
      const last = rawItens[rawItens.length - 1];
      const valorLinhaAjustado = parseFloat(
        (last.valor * last.quantidade + diffItens).toFixed(2)
      );
      last.valor = parseFloat((valorLinhaAjustado / last.quantidade).toFixed(4));
    }

    const blingItens = rawItens ?? [{
      descricao: `Pedido FOP #${remessaCodigo}`,
      quantidade: 1,
      valor: totalExato,
    }];

    const obsPartes: string[] = [];
    if (transpNome) obsPartes.push(`Transportadora: ${transpNome}${transpCnpj ? ` | CNPJ: ${transpCnpj}` : ""}`);
    if (valorFrete > 0) obsPartes.push(`Frete ${pedido.frete_tipo || ""}${pedido.frete_tipo ? ":" : ""} R$ ${valorFrete.toFixed(2)}`);
    const obsInternas = obsPartes.length > 0 ? obsPartes.join(" | ") : undefined;

    // Bling exige dataSaida para gerar o parcelamento (erro code 14 / element dataSaida).
    // A saída não pode ser retroativa: usa a data do pedido só quando não for passada.
    const hojeISO = new Date().toISOString().slice(0, 10);
    const dataSaida = (pedido.data_pedido && String(pedido.data_pedido) > hojeISO)
      ? String(pedido.data_pedido)
      : hojeISO;

    const payload: Record<string, any> = {
      numeroLoja: remessaCodigo,
      data: pedido.data_pedido,
      dataSaida,
      contato: { id: Number(parceiro.bling_id) },
      ...(blingLojaId ? { loja: { id: blingLojaId }, canal: { id: blingLojaId } } : {}),
      itens: blingItens,
      // Pedido já quitado (haver aplicado / lastro na família) ou sem cobrança
      // (bonificação) vai SEM duplicata: `blingParcelas` vem vazio e o Bling não
      // cria conta a receber. O SNCF é a fonte única do recebível; duplicata criada
      // no Bling que nunca será baixada lá é ruído de conciliação.
      //
      // A chave vai SEMPRE, mesmo vazia. Omiti-la é comportamento não testado, e
      // API que recebe pedido sem `parcelas` costuma gerar uma parcela à vista
      // default — exatamente a duplicata que não queremos, criada em silêncio.
      // `parcelas: []` com total > 0 está provado contra o Bling real: PED-2114 (2x),
      // PED-2114/01 e PED-2066, todos 200 OK (bling_envios_log).
      parcelas: blingParcelas,
      totalProdutos: totalProdutosPayload,
      total: totalExato,
      observacoes: pedido.contexto_anotacoes || `Pedido ${remessaCodigo} via SNCF`,
      ...(obsInternas ? { observacoesInternas: obsInternas } : {}),
    };

    // DIMENSÃO-VIA-TABELA: a regra de modal de frete mora em `frete_tipos.mod_frete_nf`,
    // nunca no código. A versão anterior fazia
    // `valorFrete === 0 ? 9 : (frete_tipo === "FOB" ? 1 : 0)` — dois erros empilhados:
    // (1) `9` = "sem ocorrência de transporte" mandava pro Bling como se não houvesse
    //     transporte todo pedido com frete zerado — medido: 75 de 198 envios com
    //     `fretePorConta` errado, 69 deles `CIF_ABSORVIDO` (ex.: PED-2164);
    // (2) `"FOB"` está inativo na dimensão — o ativo é `FOB_CLIENTE`; o ramo do `1`
    //     nunca era alcançado.
    // Fallback honesto: sem modelo de frete declarado na dimensão, `9` ("sem ocorrência
    // de transporte") é o que sabemos — mas logado, pra não virar silêncio.
    const { data: freteTipoDim } = pedido.frete_tipo
      ? await supabase
          .from("frete_tipos")
          .select("mod_frete_nf")
          .eq("codigo", pedido.frete_tipo)
          .maybeSingle()
      : { data: null };
    const tipoFrete = freteTipoDim?.mod_frete_nf ?? 9;
    const fretePorContaFallback = freteTipoDim?.mod_frete_nf == null;

    // PESO-REAL-É-O-DA-XPM: `pedidos.peso_bruto_total` é a soma TEÓRICA dos itens
    // (trigger), não o peso da caixa fechada. Medido: PED-2164 → SNCF 4,7 kg × XPM 7 kg;
    // PED-2171 → SNCF 25,9 kg × XPM 12 kg. A XPM informa o peso e o total de volumes da
    // expedição — é esse número que vai na NF e na transportadora.
    // UMA busca só: peso_bruto e quantidade_volumes vêm da mesma linha.
    // Sem código XPM ou sem linha: cai no teórico — não é erro e não bloqueia o envio.
    const { data: xpmExp } = pedido.xpm_expedicao_codigo
      ? await supabase
          .from("xpm_expedicao")
          .select("peso_bruto, quantidade_volumes")
          .eq("codigo", pedido.xpm_expedicao_codigo)
          .maybeSingle()
      : { data: null };
    const pesoXpm = Number(xpmExp?.peso_bruto ?? 0);
    const fontePeso: "xpm" | "teorico" = pesoXpm > 0 ? "xpm" : "teorico";
    // Quando o envio migrar pro pré-faturamento, `teorico` vira sinal de que o pedido
    // chegou cedo demais (a XPM ainda não pesou a caixa).
    const pesoReal = fontePeso === "xpm" ? pesoXpm : Number(pedido.peso_bruto_total ?? 0);
    const qtdVolumes = Number(xpmExp?.quantidade_volumes ?? 0);

    if (transpNome || valorFrete > 0 || pesoReal > 0) {
      // BLING V3: A TRANSPORTADORA VIVE EM `transporte.contato`, NÃO EM `transporte.transportadora`.
      // `transportadora` é herança da API v2. Campo desconhecido não dá erro no Bling: ele
      // ignora em silêncio e devolve 200 OK com o pedido SEM transportadora (PED-2147, 17/08,
      // dois envios seguidos). Mandar o id no lugar certo é a diferença entre "salvou" e
      // "o Bling recebeu". Se o bling_id do parceiro estiver errado, o Bling agora RECLAMA —
      // erro alto é melhor que sucesso falso.
      // Campos válidos de `transporte` na v3: fretePorConta, frete, quantidadeVolumes,
      // pesoBruto, prazoEntrega, contato, etiqueta, volumes. `pesoLiquido` NÃO é um deles
      // (ia pelo mesmo ralo silencioso) — removido.
      //
      // VOLUMES-SEM-QUEBRA (decidido com o Flavio): enviamos `quantidadeVolumes` (o total
      // que a XPM informa) e NÃO montamos o array `volumes`. Montar a quebra por caixa
      // exigiria inventar a divisão do peso entre volumes — dado fabricado numa nota
      // fiscal. Se um dia a XPM mandar a quebra real, o array entra com dado real.
      // Ninguém "completa" isso depois.
      payload.transporte = {
        fretePorConta: tipoFrete,
        ...(blingTransportadoraId
          ? { contato: { id: blingTransportadoraId, ...(transpNome ? { nome: transpNome } : {}) } }
          : transpNome
            ? { contato: { nome: transpNome } }
            : {}),
        ...(valorFrete > 0 ? { frete: parseFloat(valorFrete.toFixed(2)) } : {}),
        ...(pesoReal > 0 ? { pesoBruto: parseFloat(pesoReal.toFixed(3)) } : {}),
        ...(qtdVolumes > 0 ? { quantidadeVolumes: qtdVolumes } : {}),
      };
    }


    // A partir daqui o POST vai ao ar: nunca mais apagar a remessa.
    remessaCriadaNestaChamada = null;
    cleanupRemessaOrfa = null;

    // 10. POST Bling
    let blingId: number | null = null;
    let respStatus: number | null = null;
    let respBody: any = null;
    let sucesso = false;
    let erroMsg: string | null = null;

    try {
      const resposta = await client.post("/pedidos/vendas", payload);
      respBody = resposta;
      blingId = resposta?.data?.id ?? resposta?.id ?? null;
      sucesso = !!blingId;
      respStatus = 200;
      if (!sucesso) erroMsg = "Bling retornou sem id de pedido";
    } catch (e) {
      erroMsg = (e as Error).message;
      sucesso = false;
      const m = erroMsg?.match(/(\d{3}):/);
      if (m) respStatus = parseInt(m[1]);
    }

    const duracaoMs = Date.now() - t0;

    // 11. Log
    await supabase.from("bling_envios_log").insert({
      pedido_id,
      enviado_por: userId,
      payload_enviado: payload,
      resposta_status: respStatus,
      resposta_body: respBody,
      bling_id_retornado: blingId,
      sucesso,
      erro_msg: erroMsg,
      duracao_ms: duracaoMs,
    });

    if (sucesso) {
      // Log de sucesso: registra a fonte do peso (xpm | teorico) e o fallback do
      // fretePorConta pra que nenhum dos dois vire silêncio. `teorico` depois da
      // migração pro pré-faturamento é sinal de pedido que chegou cedo demais.
      console.log("[enviar-pedido-bling] envio OK", {
        pedido_id,
        remessa_codigo: remessaCodigo,
        bling_id: blingId,
        fonte_peso: fontePeso,
        frete_por_conta_fallback: fretePorContaFallback,
        frete_tipo: pedido.frete_tipo ?? null,
        duracao_ms: duracaoMs,
      });

      // 12a. Atualiza remessa
      await supabase.from("pedido_remessa").update({
        bling_pedido_id: String(blingId),
        status: "enviada_bling",
      }).eq("id", remessa.id);

      // 12b. Carimba o pedido com o id VIGENTE do Bling.
      // Grava quando (a) é o primeiro envio, ou (b) o id atual pertence a uma tentativa
      // CANCELADA — houve reenvio e o vigente mudou. Antes gravava só em (a), e o pedido
      // ficava apontando pro id MORTO depois de todo reenvio.
      // Condição derivada do ESTADO, não de flag: vale pra qualquer caminho, não só o botão.
      // Split real (duas tentativas vivas) segue intocado — nenhuma delas está cancelada.
      let carimbarDestino = !pedido.bling_id_destino;
      if (!carimbarDestino) {
        const { data: remMorta } = await supabase
          .from("pedido_remessa")
          .select("id")
          .eq("pedido_id", pedido_id)
          .eq("bling_pedido_id", String(pedido.bling_id_destino))
          .eq("status", "cancelada")
          .limit(1);
        carimbarDestino = !!(remMorta && remMorta.length > 0);
      }
      if (carimbarDestino) {
        await supabase.from("pedidos").update({
          bling_id_destino: blingId,
          bling_enviado_em: new Date().toISOString(),
          bling_enviado_por: userId,
          bling_envio_erro: null,
        }).eq("id", pedido_id);
      }

      // ENVIO-DEIXA-RASTRO (04/09/2026): o envio gravava bling_id_destino,
      // bling_enviado_em e bling_enviado_por na tabela pedidos, mas nao inseria
      // em pedido_eventos — o historico do pedido pulava da ancora direto pro nada
      // e ninguem conseguia ver quem enviou nem quando. FAIL-LOUD.
      const { error: eEvBling } = await supabase.from("pedido_eventos").insert({
        pedido_id,
        tipo_evento: "bling_enviado",
        descricao: `Enviado ao Bling (id ${blingId}) · remessa ${remessaCodigo} — proximo passo e emitir a NF no Bling`,
        metadata: {
          bling_id: String(blingId),
          remessa_id: remessa.id,
          remessa_codigo: remessaCodigo,
          duracao_ms: duracaoMs,
          carimbou_destino: carimbarDestino,
          enviado_por: userId,
        },
        automatico: false,
      });
      if (eEvBling) throw new Error(`registrar evento de envio ao Bling: ${eEvBling.message}`);

      return ok({
        sucesso: true,
        bling_id: blingId,
        remessa_id: remessa.id,
        remessa_codigo: remessaCodigo,
        mensagem: `Remessa ${remessaCodigo} enviada pro Bling (id ${blingId})`,
        duracao_ms: duracaoMs,
        proximo_passo: "Emitir a NF no Bling. O pedido avanca para Faturado sozinho quando a NF for ingerida.",
      });
    } else {
      await supabase.from("pedidos").update({
        bling_envio_erro: erroMsg,
      }).eq("id", pedido_id);

      return err(erroMsg || "Falha ao enviar pro Bling", 502);
    }
  } catch (e) {
    // Erro inesperado antes do POST: desfaz a remessa criada nesta chamada.
    if (cleanupRemessaOrfa) await cleanupRemessaOrfa();
    return err(`Erro inesperado: ${(e as Error).message}`, 500);
  }
});
