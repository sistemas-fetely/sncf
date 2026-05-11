import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export type LookupMaps = {
  categorias: Map<string, { codigo: string; nome: string }>; // id -> info
  categoriasByNome: Map<string, string>; // nome lower -> id
  centros: Map<string, string>; // id -> nome
  centrosByNome: Map<string, string>; // nome lower -> id
  formas: Map<string, string>;
  formasByNome: Map<string, string>;
  grupos: Map<string, string>;
  gruposByNome: Map<string, string>;
};

export type ParceiroRow = Record<string, any>;

const COLUNAS = [
  "id",
  "razao_social",
  "nome_fantasia",
  "cnpj",
  "cpf",
  "tipo_pessoa",
  "tipos",
  "ativo",
  "segmento",
  "origem",
  "email",
  "telefone",
  "cep",
  "logradouro",
  "numero",
  "bairro",
  "cidade",
  "uf",
  "categoria_id",
  "categoria_codigo",
  "categoria_nome",
  "centro_custo_id",
  "centro_custo_nome",
  "forma_pagamento_id",
  "forma_pagamento_nome",
  "grupo_id",
  "grupo_nome",
  "pix_tipo",
  "pix_chave",
  "tags",
  "observacao",
] as const;

export function exportarParceirosXlsx(
  parceiros: any[],
  maps: LookupMaps,
  nomeArquivo = "parceiros.xlsx",
) {
  const linhas = parceiros.map((p) => {
    const cat = p.categoria_padrao_id ? maps.categorias.get(p.categoria_padrao_id) : null;
    return {
      id: p.id,
      razao_social: p.razao_social ?? "",
      nome_fantasia: p.nome_fantasia ?? "",
      cnpj: p.cnpj ?? "",
      cpf: p.cpf ?? "",
      tipo_pessoa: p.tipo_pessoa ?? "PJ",
      tipos: (p.tipos || []).join(";"),
      ativo: p.ativo === false ? "false" : "true",
      segmento: p.segmento ?? "",
      origem: p.origem ?? "",
      email: p.email ?? "",
      telefone: p.telefone ?? "",
      cep: p.cep ?? "",
      logradouro: p.logradouro ?? "",
      numero: p.numero ?? "",
      bairro: p.bairro ?? "",
      cidade: p.cidade ?? "",
      uf: p.uf ?? "",
      categoria_id: p.categoria_padrao_id ?? "",
      categoria_codigo: cat?.codigo ?? "",
      categoria_nome: cat?.nome ?? "",
      centro_custo_id: p.centro_custo_id ?? "",
      centro_custo_nome: p.centro_custo_id ? maps.centros.get(p.centro_custo_id) ?? "" : "",
      forma_pagamento_id: p.forma_pagamento_padrao_id ?? "",
      forma_pagamento_nome: p.forma_pagamento_padrao_id
        ? maps.formas.get(p.forma_pagamento_padrao_id) ?? ""
        : "",
      grupo_id: p.grupo_id ?? "",
      grupo_nome: p.grupo_id ? maps.grupos.get(p.grupo_id) ?? "" : "",
      pix_tipo: p.pix_tipo ?? "",
      pix_chave: p.pix_chave ?? "",
      tags: (p.tags || []).join(";"),
      observacao: p.observacao ?? "",
    };
  });

  const ws = XLSX.utils.json_to_sheet(linhas, { header: COLUNAS as unknown as string[] });
  // larguras razoáveis
  ws["!cols"] = COLUNAS.map((c) => ({
    wch: c === "id" || c.endsWith("_id") ? 38 : c === "observacao" ? 40 : 22,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Parceiros");

  // Aba de instruções
  const instr = [
    ["Instruções de reimportação"],
    [""],
    ["• NÃO altere a coluna 'id' das linhas existentes — é usada para casar o registro."],
    ["• Para criar um novo parceiro, deixe a coluna 'id' em branco."],
    ["• Campos *_id (categoria/centro_custo/forma_pagamento/grupo) têm prioridade sobre os *_nome."],
    ["  Se o id estiver vazio mas o nome preenchido, será feito match pelo nome (case-insensitive)."],
    ["• 'tipos' aceita valores separados por ; (ex: fornecedor;cliente). Valores válidos: fornecedor, cliente."],
    ["• 'ativo' aceita true/false."],
    ["• 'tipo_pessoa' aceita PF ou PJ."],
    ["• 'tags' separadas por ;"],
    ["• Não remova nem renomeie colunas."],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instr);
  wsInstr["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, "Instruções");

  XLSX.writeFile(wb, nomeArquivo);
}

function normalizeBool(v: any): boolean {
  if (v === undefined || v === null || v === "") return true;
  const s = String(v).trim().toLowerCase();
  return !(s === "false" || s === "0" || s === "não" || s === "nao" || s === "n");
}

function parseTipos(v: any): string[] {
  if (!v) return ["fornecedor"];
  return String(v)
    .split(/[;,]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s === "fornecedor" || s === "cliente");
}

function parseTags(v: any): string[] | null {
  if (!v) return null;
  const arr = String(v)
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? arr : null;
}

function nullable(v: any): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function resolveLookup(
  idCol: any,
  nomeCol: any,
  byNome: Map<string, string>,
): string | null {
  const id = nullable(idCol);
  if (id) return id;
  const nome = nullable(nomeCol);
  if (!nome) return null;
  return byNome.get(nome.toLowerCase()) ?? null;
}

export type ImportResult = {
  total: number;
  criados: number;
  atualizados: number;
  erros: { linha: number; razao_social?: string; mensagem: string }[];
};

export async function importarParceirosXlsx(
  file: File,
  maps: LookupMaps,
): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets["Parceiros"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Planilha 'Parceiros' não encontrada no arquivo.");

  const linhas = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

  const result: ImportResult = { total: linhas.length, criados: 0, atualizados: 0, erros: [] };

  for (let i = 0; i < linhas.length; i++) {
    const row = linhas[i];
    const linhaIdx = i + 2; // header é linha 1
    try {
      if (!nullable(row.razao_social)) {
        result.erros.push({ linha: linhaIdx, mensagem: "razao_social vazia" });
        continue;
      }

      const tipo_pessoa = (nullable(row.tipo_pessoa) || "PJ").toUpperCase();
      if (tipo_pessoa !== "PF" && tipo_pessoa !== "PJ") {
        result.erros.push({ linha: linhaIdx, mensagem: `tipo_pessoa inválido: ${row.tipo_pessoa}` });
        continue;
      }

      const payload: Record<string, any> = {
        razao_social: String(row.razao_social).trim(),
        nome_fantasia: nullable(row.nome_fantasia),
        cnpj: nullable(row.cnpj),
        cpf: nullable(row.cpf),
        tipo_pessoa,
        tipos: parseTipos(row.tipos),
        ativo: normalizeBool(row.ativo),
        segmento: nullable(row.segmento),
        email: nullable(row.email),
        telefone: nullable(row.telefone),
        cep: nullable(row.cep),
        logradouro: nullable(row.logradouro),
        numero: nullable(row.numero),
        bairro: nullable(row.bairro),
        cidade: nullable(row.cidade),
        uf: nullable(row.uf),
        pix_tipo: nullable(row.pix_tipo),
        pix_chave: nullable(row.pix_chave),
        tags: parseTags(row.tags),
        observacao: nullable(row.observacao),
        categoria_padrao_id: resolveLookup(row.categoria_id, row.categoria_nome, maps.categoriasByNome),
        centro_custo_id: resolveLookup(row.centro_custo_id, row.centro_custo_nome, maps.centrosByNome),
        forma_pagamento_padrao_id: resolveLookup(
          row.forma_pagamento_id,
          row.forma_pagamento_nome,
          maps.formasByNome,
        ),
        grupo_id: resolveLookup(row.grupo_id, row.grupo_nome, maps.gruposByNome),
      };

      const id = nullable(row.id);
      if (id) {
        const { error } = await supabase
          .from("parceiros_comerciais")
          .update(payload as any)
          .eq("id", id);
        if (error) throw error;
        result.atualizados++;
      } else {
        const { error } = await supabase.from("parceiros_comerciais").insert(payload as any);
        if (error) throw error;
        result.criados++;
      }
    } catch (e: any) {
      result.erros.push({
        linha: linhaIdx,
        razao_social: row.razao_social,
        mensagem: e.message || String(e),
      });
    }
  }

  return result;
}
