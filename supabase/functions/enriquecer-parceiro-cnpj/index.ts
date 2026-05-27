// Edge function: enriquecer-parceiro-cnpj
// Consulta BrasilAPI pelo CNPJ do parceiro, atualiza cadastro + sócios,
// e detecta grupo econômico via sócio em comum.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRASILAPI_BASE = "https://brasilapi.com.br/api/cnpj/v1";

const QUALIFICACAO_MAP: Record<number, string> = {
  5: "Administrador",
  8: "Conselheiro de Administração",
  10: "Diretor",
  16: "Presidente",
  17: "Procurador",
  20: "Sociedade Consorciada",
  22: "Sócio",
  23: "Sócio Capitalista",
  24: "Sócio Comanditado",
  25: "Sócio Comanditário",
  26: "Sócio de Indústria",
  29: "Sócio Incapaz ou Relat.Incapaz (exceto menor)",
  30: "Sócio Menor (Assistido/Representado)",
  31: "Sócio Ostensivo",
  37: "Sócio Pessoa Jurídica Domiciliado no Exterior",
  38: "Sócio Pessoa Física Residente no Exterior",
  47: "Sócio Pessoa Física Residente no Brasil",
  48: "Sócio Pessoa Jurídica Domiciliado no Brasil",
  49: "Sócio-Administrador",
  52: "Sócio com Capital",
  53: "Sócio sem Capital",
  54: "Fundador",
  55: "Sócio Comanditado Residente no Exterior",
  56: "Sócio Comanditário Pessoa Física Residente no Exterior",
  57: "Sócio Comanditário Pessoa Jurídica Domiciliado no Exterior",
  58: "Sócio Comanditário Incapaz",
  59: "Produtor Rural",
  63: "Cotas em Tesouraria",
  65: "Titular Pessoa Física Residente ou Domiciliado no Brasil",
  66: "Titular Pessoa Física Residente ou Domiciliado no Exterior",
  67: "Titular Pessoa Física Incapaz ou Relativamente Incapaz",
  78: "Titular Pessoa Física Residente no Brasil",
};

function qualificacao(codigo: number | null | undefined): string {
  if (codigo == null) return "Sócio";
  return QUALIFICACAO_MAP[codigo] || "Sócio";
}

function situacaoNormalizada(desc: string | null | undefined): string | null {
  if (!desc) return null;
  const d = desc.toLowerCase();
  if (d.includes("ativa")) return "ativo";
  if (d.includes("suspensa") || d.includes("inapta") || d.includes("baixada")) return "inativo";
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const parceiro_id = body?.parceiro_id;
    if (!parceiro_id) return jsonResponse({ error: "parceiro_id obrigatório" }, 400);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: parceiro, error: pErr } = await supa
      .from("parceiros_comerciais")
      .select("*")
      .eq("id", parceiro_id)
      .single();

    if (pErr || !parceiro) {
      return jsonResponse({ error: "Parceiro não encontrado" }, 404);
    }

    const cnpj = String(parceiro.cnpj ?? "").replace(/\D/g, "");
    if (cnpj.length !== 14) {
      return jsonResponse({ enriquecido: false, motivo: "cnpj_invalido" });
    }

    const resp = await fetch(`${BRASILAPI_BASE}/${cnpj}`, {
      headers: { Accept: "application/json" },
    });

    if (resp.status === 404) {
      return jsonResponse({ enriquecido: false, motivo: "cnpj_nao_encontrado" });
    }

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.error("BrasilAPI erro", resp.status, txt);
      return jsonResponse({ error: `BrasilAPI status ${resp.status}` }, 502);
    }

    const dataApi = await resp.json();

    const contextoExistente = parceiro.contexto_bureau || {};
    const novoContexto = {
      ...contextoExistente,
      brasilapi: {
        consultado_em: new Date().toISOString(),
        situacao_cadastral: dataApi.descricao_situacao_cadastral,
        data_inicio_atividade: dataApi.data_inicio_atividade,
        capital_social: dataApi.capital_social,
        cnae_fiscal: dataApi.cnae_fiscal,
        cnae_fiscal_descricao: dataApi.cnae_fiscal_descricao,
        porte: dataApi.descricao_porte,
        natureza_juridica: dataApi.codigo_natureza_juridica,
        opcao_pelo_simples: dataApi.opcao_pelo_simples,
        opcao_pelo_mei: dataApi.opcao_pelo_mei,
        endereco: {
          cep: dataApi.cep,
          logradouro: dataApi.logradouro,
          numero: dataApi.numero,
          complemento: dataApi.complemento,
          bairro: dataApi.bairro,
        },
        telefone: dataApi.ddd_telefone_1,
      },
    };

    const updates: Record<string, unknown> = {
      razao_social: dataApi.razao_social || parceiro.razao_social,
      nome_fantasia: dataApi.nome_fantasia || parceiro.nome_fantasia,
      municipio: dataApi.municipio || parceiro.municipio,
      uf: dataApi.uf || parceiro.uf,
      cadastro_incompleto: false,
      contexto_bureau: novoContexto,
    };

    const situacao = situacaoNormalizada(dataApi.descricao_situacao_cadastral);
    if (situacao) updates.situacao = situacao;

    if (dataApi.cep) updates.cep = dataApi.cep;
    if (dataApi.logradouro) {
      updates.endereco = `${dataApi.descricao_tipo_de_logradouro || ""} ${dataApi.logradouro}, ${dataApi.numero || "S/N"}${dataApi.complemento ? ` - ${dataApi.complemento}` : ""}`.trim();
    }
    if (dataApi.bairro) updates.bairro = dataApi.bairro;
    if (dataApi.ddd_telefone_1) updates.telefone = dataApi.ddd_telefone_1;

    const { error: upErr } = await supa
      .from("parceiros_comerciais")
      .update(updates)
      .eq("id", parceiro_id);

    if (upErr) {
      console.error("Erro atualizando parceiro:", upErr);
      return jsonResponse({ error: upErr.message }, 500);
    }

    const qsa = (dataApi.qsa || []) as Array<Record<string, unknown>>;
    let sociosUpserted = 0;
    const cpfsNovos: string[] = [];

    for (const socio of qsa) {
      const nome = socio.nome_socio as string | undefined;
      const cpf = socio.cnpj_cpf_do_socio as string | null | undefined;

      if (!nome || !cpf) continue;

      const socioPayload = {
        parceiro_id,
        nome,
        cpf_cnpj: cpf,
        participacao_pct: socio.percentual_capital_social ?? null,
        qualificacao: qualificacao(socio.codigo_qualificacao_socio as number),
        data_entrada: socio.data_entrada_sociedade || null,
        fonte: "brasil_api",
        ultima_atualizacao: new Date().toISOString(),
      };

      const { error: socioErr } = await supa
        .from("socios_parceiro")
        .upsert(socioPayload, { onConflict: "parceiro_id,cpf_cnpj" });

      if (socioErr) {
        console.error("Erro upsert sócio:", socioErr, socioPayload);
        continue;
      }

      sociosUpserted++;
      cpfsNovos.push(cpf);
    }

    let grupoVinculado: string | null = null;
    let grupoCriado = false;

    if (cpfsNovos.length > 0 && !parceiro.grupo_economico_id) {
      const { data: matches, error: matchErr } = await supa
        .from("socios_parceiro")
        .select(`
          parceiro_id, cpf_cnpj, nome,
          parceiro:parceiros_comerciais(id, razao_social, grupo_economico_id)
        `)
        .in("cpf_cnpj", cpfsNovos)
        .neq("parceiro_id", parceiro_id)
        .is("desligado_em", null);

      if (matchErr) {
        console.error("Erro busca matches:", matchErr);
      } else if (matches && matches.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const matchComGrupo = matches.find((m: any) => m.parceiro?.grupo_economico_id);

        if (matchComGrupo) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          grupoVinculado = (matchComGrupo as any).parceiro.grupo_economico_id;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const primeiroMatch = matches[0] as any;
          const nomeGrupo = `Grupo ${primeiroMatch.nome}`.slice(0, 100);

          const { data: novoGrupo, error: grpErr } = await supa
            .from("grupos_economicos")
            .insert({
              nome: nomeGrupo,
              origem_deteccao: "automatica",
              parceiro_matriz_id: parceiro_id,
              observacoes: `Detectado via sócio em comum (CPF ${primeiroMatch.cpf_cnpj}) com parceiros: ${matches.map((m: { parceiro_id: string }) => m.parceiro_id).slice(0, 5).join(", ")}`,
            })
            .select("id")
            .single();

          if (grpErr) {
            console.error("Erro criando grupo:", grpErr);
          } else if (novoGrupo) {
            grupoVinculado = novoGrupo.id;
            grupoCriado = true;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parceirosSoltos = (matches as any[])
              .filter((m) => !m.parceiro?.grupo_economico_id)
              .map((m) => m.parceiro_id);

            if (parceirosSoltos.length > 0) {
              await supa
                .from("parceiros_comerciais")
                .update({ grupo_economico_id: novoGrupo.id })
                .in("id", parceirosSoltos);
            }
          }
        }

        if (grupoVinculado) {
          await supa
            .from("parceiros_comerciais")
            .update({ grupo_economico_id: grupoVinculado })
            .eq("id", parceiro_id);

          await supa.from("parceiro_marcos").insert({
            parceiro_id,
            tipo_marco: "grupo_economico_vinculado",
            valor_novo: grupoVinculado,
            motivo: grupoCriado
              ? "Grupo criado automaticamente — sócio em comum detectado"
              : "Vinculado a grupo existente — sócio em comum detectado",
          });
        }
      }
    }

    await supa.from("parceiro_marcos").insert({
      parceiro_id,
      tipo_marco: "cadastro_completado",
      valor_anterior: parceiro.razao_social || null,
      valor_novo: dataApi.razao_social || null,
      motivo: "Enriquecimento automático via BrasilAPI",
    });

    return jsonResponse({
      enriquecido: true,
      razao_social: dataApi.razao_social,
      socios_criados: sociosUpserted,
      grupo_vinculado: !!grupoVinculado,
      grupo_criado: grupoCriado,
    });
  } catch (e) {
    console.error("enriquecer-parceiro-cnpj erro:", e);
    return jsonResponse({ error: (e as Error).message || "Erro desconhecido" }, 500);
  }
});
