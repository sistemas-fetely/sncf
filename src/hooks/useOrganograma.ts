import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PosicaoRaw, PosicaoNode, ColaboradorVinculado, TipoVinculoCodigo } from "@/types/organograma";

interface VinculoRaw {
  id: string;
  tipo_vinculo: TipoVinculoCodigo;
  status: string;
  data_inicio: string;
  valor_base: number;
  email_corporativo: string | null;
  telefone_corporativo: string | null;
  departamento_id: string | null;
  pessoa: {
    id: string;
    nome_completo: string;
    foto_url: string | null;
    telefone: string | null;
    email_pessoal: string | null;
  } | null;
  cargo: { nome: string | null } | null;
  departamento: { nome: string | null } | null;
}

function mapVinculoToColaborador(v: VinculoRaw): ColaboradorVinculado {
  return {
    id: v.id,
    nome_completo: v.pessoa?.nome_completo ?? "",
    foto_url: v.pessoa?.foto_url ?? null,
    email_corporativo: v.email_corporativo,
    telefone: v.telefone_corporativo ?? v.pessoa?.telefone ?? null,
    data_admissao: v.data_inicio,
    salario_base: v.valor_base,
    status: v.status,
    tipo_contrato: v.tipo_vinculo,
    cargo: v.cargo?.nome ?? "",
    departamento: v.departamento?.nome ?? "",
  };
}

function buildTree(posicoes: PosicaoRaw[], vinculos: ColaboradorVinculado[]): PosicaoNode[] {
  const vinculoMap = new Map(vinculos.map(v => [v.id, v]));

  // Track which vinculos are already linked to a position
  const linkedVinculoIds = new Set<string>();

  const nodeMap = new Map<string, PosicaoNode>();
  const roots: PosicaoNode[] = [];

  // Create nodes from positions
  for (const p of posicoes) {
    const vinculo = p.vinculo_id ? vinculoMap.get(p.vinculo_id) : null;

    if (vinculo && p.vinculo_id) linkedVinculoIds.add(p.vinculo_id);

    const node: PosicaoNode = {
      ...p,
      colaborador: vinculo || null,
      contrato_pj: null,
      children: [],
      subordinados_diretos: 0,
      subordinados_totais: 0,
      nome_display: vinculo ? vinculo.nome_completo : "",
      foto_url: vinculo?.foto_url ?? null,
      vinculo: vinculo ? vinculo.tipo_contrato : null,
      status_pessoal: vinculo ? vinculo.status : null,
    };
    nodeMap.set(p.id, node);
  }


  // Create virtual nodes for unlinked vinculos (active)
  for (const v of vinculos) {
    if (linkedVinculoIds.has(v.id)) continue;
    if (v.status !== "ativo") continue;

    const virtualId = `virtual-${v.id}`;
    const node: PosicaoNode = {
      id: virtualId,
      titulo_cargo: v.cargo,
      nivel_hierarquico: 1,
      departamento: v.departamento,
      area: null,
      filial: null,
      status: "ocupado",
      id_pai: null,
      colaborador_id: null,
      contrato_pj_id: null,
      vinculo_id: v.id,
      salario_previsto: v.salario_base,
      centro_custo: null,
      created_at: "",
      updated_at: "",
      depth: 0,
      path: [virtualId],
      colaborador: v,
      contrato_pj: null,
      children: [],
      subordinados_diretos: 0,
      subordinados_totais: 0,
      nome_display: v.nome_completo,
      foto_url: v.foto_url,
      vinculo: v.tipo_contrato,
      status_pessoal: v.status,
    };
    nodeMap.set(virtualId, node);
  }


  // Build tree
  for (const node of nodeMap.values()) {
    if (node.id_pai && nodeMap.has(node.id_pai)) {
      nodeMap.get(node.id_pai)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Calculate subordinates
  function countSubs(node: PosicaoNode): number {
    node.subordinados_diretos = node.children.length;
    let total = node.children.length;
    for (const child of node.children) {
      total += countSubs(child);
    }
    node.subordinados_totais = total;
    return total;
  }
  roots.forEach(countSubs);

  return roots;
}

function flattenTree(nodes: PosicaoNode[]): PosicaoNode[] {
  const result: PosicaoNode[] = [];
  function walk(node: PosicaoNode) {
    result.push(node);
    node.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

export function useOrganograma() {
  return useQuery({
    queryKey: ["organograma"],
    queryFn: async () => {
      const [posRes, vincRes, tipoRes] = await Promise.all([
        supabase.rpc("get_organograma_tree"),
        supabase
          .from("vinculos")
          .select(`
            id, tipo_vinculo, status, data_inicio, valor_base,
            email_corporativo, telefone_corporativo, departamento_id,
            pessoa:pessoas!inner ( id, nome_completo, foto_url, telefone, email_pessoal ),
            cargo:cargos ( nome ),
            departamento:departamentos ( nome )
          `)
          .eq("status", "ativo"),
        supabase.from("tipos_vinculo").select("codigo, aparece_organograma"),
      ]);

      if (posRes.error) throw posRes.error;
      if (vincRes.error) throw vincRes.error;

      const vinculos = ((vincRes.data || []) as unknown as VinculoRaw[]).map(mapVinculoToColaborador);

      const tree = buildTree(
        (posRes.data || []) as unknown as PosicaoRaw[],
        vinculos,
      );

      return { tree, flat: flattenTree(tree) };
    },
  });
}
