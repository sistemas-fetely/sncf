/**
 * Pipeline compartilhado para importar NFs (de qualquer fonte) como contas a pagar.
 * - Anti-duplicata por chave de acesso.
 * - Auto-cadastro de parceiro por CNPJ.
 * - Insert de itens quando disponíveis.
 */

import { supabase } from "@/integrations/supabase/client";
import type { NFParsed } from "./types";

/**
 * Faz upload do PDF da NF para o bucket `financeiro-docs` e registra
 * em `contas_pagar_documentos`. Não falha o fluxo se algo der errado;
 * apenas registra o erro no array passado.
 */
async function anexarPdfNF(
  contaId: string,
  arquivo: File,
  nfNumero: string | undefined,
  errosDetalhe: string[],
): Promise<void> {
  try {
    const ext = arquivo.name.split(".").pop() || "pdf";
    const nomeLimpo = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `contas-pagar/${contaId}/${Date.now()}_${nomeLimpo}`;

    const { error: upErr } = await supabase.storage
      .from("financeiro-docs")
      .upload(path, arquivo, {
        contentType: arquivo.type || "application/pdf",
        upsert: false,
      });

    if (upErr) {
      errosDetalhe.push(`Upload PDF NF ${nfNumero || "s/n"}: ${upErr.message}`);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();

    const { error: docErr } = await supabase
      .from("contas_pagar_documentos")
      .insert({
        conta_pagar_id: contaId,
        tipo: "nf",
        nome_arquivo: arquivo.name,
        storage_path: path,
        tamanho_bytes: arquivo.size,
        uploaded_por: userData.user?.id || null,
      } as any);

    if (docErr) {
      errosDetalhe.push(`Registro doc NF ${nfNumero || "s/n"}: ${docErr.message}`);
      // tentar remover arquivo órfão do storage
      await supabase.storage.from("financeiro-docs").remove([path]);
    }
  } catch (e: any) {
    errosDetalhe.push(`Anexar PDF NF ${nfNumero || "s/n"}: ${e?.message || e}`);
  }
}

export async function verificarDuplicatas(nfs: NFParsed[]): Promise<NFParsed[]> {
  // Monta candidatos com 4 sinais
  const candidatos = nfs.map((n) => ({
    cnpj: n.fornecedor_cnpj || null,
    valor: n.valor || 0,
    data_emissao: n.nf_data_emissao || null,
    nf_numero: n.nf_numero || null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("detectar_match_score_nf", {
    p_candidatos: candidatos,
  });

  if (error) {
    console.warn("Falha na detecção de match (seguindo sem bloqueio):", error);
    return nfs.map((n) => ({ ...n, _duplicata: false, _ambigua: false }));
  }

  // Mapa idx → candidatos (já vem ordenado por score desc na RPC)
  const mapaCandidatos: Record<number, NonNullable<NFParsed["_candidatos_match"]>> = {};
  for (const r of (data || []) as Array<{
    idx: number;
    match_id: string;
    match_score: number;
    match_fornecedor: string;
    match_nf_numero: string;
    match_valor: number;
    match_data_emissao: string | null;
    match_tipo_documento: string;
    match_parcela: string | null;
  }>) {
    if (!mapaCandidatos[r.idx]) mapaCandidatos[r.idx] = [];
    mapaCandidatos[r.idx].push({
      id: r.match_id,
      score: r.match_score,
      fornecedor: r.match_fornecedor,
      nf_numero: r.match_nf_numero,
      valor: Number(r.match_valor),
      data_emissao: r.match_data_emissao,
      tipo_documento: r.match_tipo_documento,
      parcela: r.match_parcela,
    });
  }

  return nfs.map((n, idx) => {
    const cands = mapaCandidatos[idx] || [];
    const melhor = cands[0];
    if (!melhor) {
      return { ...n, _duplicata: false, _ambigua: false };
    }
    if (melhor.score >= 3) {
      return { ...n, _duplicata: false, _ambigua: false, _candidatos_match: cands };
    }
    return { ...n, _duplicata: false, _ambigua: true, _candidatos_match: cands };
  });
}

export interface ImportResult {
  sucesso: number;
  vinculadas: number;
  erros: number;
  errosDetalhe: string[];
}

export async function importarNFs(nfs: NFParsed[]): Promise<ImportResult> {
  let sucesso = 0;
  let vinculadas = 0;
  let erros = 0;
  const errosDetalhe: string[] = [];

  for (const nf of nfs) {
    try {
      // === VINCULAÇÃO: NF bate com pagamento existente sem NF ===
      if (nf._match_pagamento) {
        const contaId = nf._match_pagamento.conta_id;

        const updateData: Record<string, unknown> = {
          nf_chave_acesso: nf.nf_chave_acesso || null,
          nf_numero: nf.nf_numero || null,
          nf_serie: nf.nf_serie || null,
          nf_data_emissao: nf.nf_data_emissao || null,
          nf_cnpj_emitente: nf.fornecedor_cnpj || null,
          nf_valor_produtos: nf.nf_valor_produtos || nf.valor,
          nf_valor_impostos: nf.nf_valor_impostos || 0,
          nf_natureza_operacao: nf.nf_natureza_operacao || null,
          nf_cfop: nf.nf_cfop || null,
          nf_ncm: nf.nf_ncm || null,
          updated_at: new Date().toISOString(),
        };

        // Se a conta existente não tem categoria, aplica a regra que matcheou na NF
        if (!nf._match_pagamento.conta_categoria_id && nf._categoria_id) {
          updateData.conta_id = nf._categoria_id;
          updateData.centro_custo_id = (nf as unknown as { _centro_custo_id?: string | null })._centro_custo_id || null;
          updateData.categoria_sugerida_ia = true;
          updateData.categoria_confirmada = false;
        }

        const { error: upErr } = await supabase
          .from("contas_pagar_receber")
          .update(updateData as any)
          .eq("id", contaId);

        if (upErr) throw upErr;

        // Histórico de vinculação
        await supabase.from("contas_pagar_historico").insert({
          conta_id: contaId,
          status_anterior: nf._match_pagamento.conta_status,
          status_novo: nf._match_pagamento.conta_status,
          observacao: `NF ${nf.nf_numero || "s/n"} vinculada via importação ${nf._source}`,
        } as any);

        // Inserir itens se houver (e a conta ainda não tem)
        if (nf.itens && nf.itens.length > 0) {
          const { count } = await supabase
            .from("contas_pagar_itens")
            .select("id", { count: "exact", head: true })
            .eq("conta_id", contaId);
          if (!count || count === 0) {
            const itensInsert = nf.itens.map((item) => ({
              conta_id: contaId,
              codigo_produto: item.codigo_produto || null,
              descricao: item.descricao,
              ncm: item.ncm || null,
              cfop: item.cfop || null,
              unidade: item.unidade || null,
              quantidade: item.quantidade ?? null,
              valor_unitario: item.valor_unitario ?? null,
              valor_total: item.valor_total ?? null,
              valor_icms: item.valor_icms ?? 0,
              valor_pis: item.valor_pis ?? 0,
              valor_cofins: item.valor_cofins ?? 0,
              conta_plano_id: item._categoria_id || nf._categoria_id || null,
            }));
            await supabase.from("contas_pagar_itens").insert(itensInsert as any);
          }
        }

        // Anexar PDF se for importação de PDF
        if (nf._arquivo && nf._source === "pdf_nfe") {
          await anexarPdfNF(contaId, nf._arquivo, nf.nf_numero, errosDetalhe);
        }

        vinculadas++;
        continue;
      }

      // 1. Resolver parceiro: prioriza _parceiro_id_resolvido (auto-cadastro feito antes)
      let parceiro_id: string | null = nf._parceiro_id_resolvido || null;
      if (!parceiro_id && nf.fornecedor_cnpj) {
        const { data: parceiro } = await supabase
          .from("parceiros_comerciais")
          .select("id")
          .eq("cnpj", nf.fornecedor_cnpj)
          .maybeSingle();

        if (parceiro) {
          parceiro_id = parceiro.id;
        } else {
          // Fallback: cria parceiro mínimo (caminho antigo, mantido para compatibilidade)
          const { data: novoParceiro, error: pErr } = await supabase
            .from("parceiros_comerciais")
            .insert({
              cnpj: nf.fornecedor_cnpj,
              razao_social: nf.fornecedor_nome,
              tipo: "pj",
              tipos: ["fornecedor"],
              origem: nf._source === "csv_qive" ? "qive" : "nf_import",
            } as any)
            .select("id")
            .single();
          if (pErr) throw pErr;
          parceiro_id = novoParceiro?.id || null;
        }
      }

      // 2. Forma de pagamento
      let forma_id: string | null = null;
      if (nf.meio_pagamento) {
        const { data: forma } = await supabase
          .from("formas_pagamento")
          .select("id")
          .eq("codigo", nf.meio_pagamento)
          .maybeSingle();
        forma_id = forma?.id || null;
      }

      // 3. Insert conta a pagar
      // Se expandida por item, conta principal usa a categoria do item de maior valor
      let categoriaContaPrincipal = nf._categoria_id || null;
      let centroCustoIdContaPrincipal = (nf as unknown as { _centro_custo_id?: string | null })._centro_custo_id || null;
      if (nf._expandirItens && nf.itens && nf.itens.length > 0) {
        const principal = nf.itens.reduce((a, b) =>
          (a.valor_total || 0) >= (b.valor_total || 0) ? a : b,
        );
        if (principal._categoria_id) {
          categoriaContaPrincipal = principal._categoria_id;
          centroCustoIdContaPrincipal = (principal as unknown as { _centro_custo_id?: string | null })._centro_custo_id || null;
        }
      }

      const { data: contaCriada, error: contaErr } = await supabase
        .from("contas_pagar_receber")
        .insert({
          tipo: "pagar",
          descricao: `${nf.fornecedor_nome} — NF ${nf.nf_numero || "s/n"}`,
          valor: nf.valor,
          data_vencimento: nf.nf_data_emissao || new Date().toISOString().substring(0, 10),
          // PR2: importação sempre cria como "aberto" (validação acontece no fluxo)
          status: "aberto",
          conta_id: categoriaContaPrincipal,
          centro_custo_id: centroCustoIdContaPrincipal,
          fornecedor_cliente: nf.fornecedor_nome,
          parceiro_id,
          fornecedor_id: parceiro_id,
          forma_pagamento_id: forma_id,
          origem: nf._source,
          nf_chave_acesso: nf.nf_chave_acesso || null,
          nf_numero: nf.nf_numero || null,
          nf_serie: nf.nf_serie || null,
          nf_data_emissao: nf.nf_data_emissao || null,
          nf_cnpj_emitente: nf.fornecedor_cnpj || null,
          nf_valor_produtos: nf.nf_valor_produtos || nf.valor,
          nf_valor_impostos: nf.nf_valor_impostos || 0,
          nf_natureza_operacao: nf.nf_natureza_operacao || null,
          nf_cfop: nf.nf_cfop || null,
          nf_ncm: nf.nf_ncm || null,
          categoria_sugerida_ia: !!categoriaContaPrincipal,
          categoria_confirmada: false,
        } as any)
        .select("id")
        .single();

      if (contaErr) throw contaErr;

      // 4. Itens (se existirem)
      if (nf.itens && nf.itens.length > 0 && contaCriada) {
        const itensInsert = nf.itens.map((item) => ({
          conta_id: contaCriada.id,
          codigo_produto: item.codigo_produto || null,
          descricao: item.descricao,
          ncm: item.ncm || null,
          cfop: item.cfop || null,
          unidade: item.unidade || null,
          quantidade: item.quantidade ?? null,
          valor_unitario: item.valor_unitario ?? null,
          valor_total: item.valor_total ?? null,
          valor_icms: item.valor_icms ?? 0,
          valor_pis: item.valor_pis ?? 0,
          valor_cofins: item.valor_cofins ?? 0,
          // Categoria por item — usada quando expandida; cai pra categoria geral senão
          conta_plano_id: nf._expandirItens
            ? item._categoria_id || nf._categoria_id || null
            : nf._categoria_id || null,
        }));
        const { error: itErr } = await supabase
          .from("contas_pagar_itens")
          .insert(itensInsert as any);
        if (itErr) {
          // Não falhar a NF inteira por causa de itens, mas registrar
          errosDetalhe.push(`Itens da NF ${nf.nf_numero}: ${itErr.message}`);
        }
      }

      // Anexar PDF se for importação de PDF
      if (nf._arquivo && nf._source === "pdf_nfe" && contaCriada) {
        await anexarPdfNF(contaCriada.id, nf._arquivo, nf.nf_numero, errosDetalhe);
      }

      sucesso++;
    } catch (e: any) {
      erros++;
      errosDetalhe.push(`${nf.fornecedor_nome} (NF ${nf.nf_numero}): ${e.message || e}`);
    }
  }

  return { sucesso, vinculadas, erros, errosDetalhe };
}
