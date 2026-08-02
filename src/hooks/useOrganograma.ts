import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PosicaoRaw, PosicaoNode, ColaboradorVinculado, ContratoPJVinculado } from "@/types/organograma";
import { nomePessoaPJ } from "@/lib/parceiros/nome";

function buildTree(posicoes: PosicaoRaw[], colaboradores: ColaboradorVinculado[], contratos: ContratoPJVinculado[]): PosicaoNode[] {
  const colabMap = new Map(colaboradores.map(c => [c.id, c]));
  const contratoMap = new Map(contratos.map(c => [c.id, c]));

  // Track which colaboradores/contratos are already linked to a position
  const linkedColabIds = new Set<string>();
  const linkedContratoIds = new Set<string>();

  const nodeMap = new Map<string, PosicaoNode>();
  const roots: PosicaoNode[] = [];

  // Create nodes from positions
  for (const p of posicoes) {
    const colab = p.colaborador_id ? colabMap.get(p.colaborador_id) : null;
    const contrato = p.contrato_pj_id ? contratoMap.get(p.contrato_pj_id) : null;

    if (colab && p.colaborador_id) linkedColabIds.add(p.colaborador_id);
    if (contrato && p.contrato_pj_id) linkedContratoIds.add(p.contrato_pj_id);

    const node: PosicaoNode = {
      ...p,
      colaborador: colab || null,
      contrato_pj: contrato || null,
      children: [],
      subordinados_diretos: 0,
      subordinados_totais: 0,
      nome_display: colab ? colab.nome_completo : contrato ? nomePessoaPJ(contrato.contato_nome, contrato.razao_social, "") : "",
      foto_url: colab?.foto_url || contrato?.foto_url || null,
      vinculo: colab ? "CLT" : contrato ? "PJ" : null,
      status_pessoal: colab ? colab.status : contrato ? contrato.status : null,
    };
    nodeMap.set(p.id, node);
  }

  // Create virtual nodes for unlinked colaboradores CLT (active)
  for (const c of colaboradores) {
    if (linkedColabIds.has(c.id)) continue;
    if (c.status === "desligado") continue;

    const virtualId = `virtual-clt-${c.id}`;
    const node: PosicaoNode = {
      id: virtualId,
      titulo_cargo: c.cargo,
      nivel_hierarquico: 1,
      departamento: c.departamento,
      area: null,
      filial: null,
      status: "ocupado",
      id_pai: null,
      colaborador_id: c.id,
      contrato_pj_id: null,
      salario_previsto: c.salario_base,
      centro_custo: null,
      created_at: "",
      updated_at: "",
      depth: 0,
      path: [virtualId],
      colaborador: c,
      contrato_pj: null,
      children: [],
      subordinados_diretos: 0,
      subordinados_totais: 0,
      nome_display: c.nome_completo,
      foto_url: c.foto_url,
      vinculo: "CLT",
      status_pessoal: c.status,
    };
    nodeMap.set(virtualId, node);
  }

  // Create virtual nodes for unlinked contratos PJ (active)
  for (const cp of contratos) {
    if (linkedContratoIds.has(cp.id)) continue;
    if (cp.status === "encerrado" || cp.status === "cancelado") continue;

    const virtualId = `virtual-pj-${cp.id}`;
    const node: PosicaoNode = {
      id: virtualId,
      titulo_cargo: cp.razao_social ? `PJ - ${cp.contato_nome}` : cp.contato_nome,
      nivel_hierarquico: 1,
      departamento: "",
      area: null,
      filial: null,
      status: "ocupado",
      id_pai: null,
      colaborador_id: null,
      contrato_pj_id: cp.id,
      salario_previsto: cp.valor_mensal,
      centro_custo: null,
      created_at: "",
      updated_at: "",
      depth: 0,
      path: [virtualId],
      colaborador: null,
      contrato_pj: cp,
      children: [],
      subordinados_diretos: 0,
      subordinados_totais: 0,
      nome_display: nomePessoaPJ(cp.contato_nome, cp.razao_social, ""),
      foto_url: cp.foto_url || null,
      vinculo: "PJ",
      status_pessoal: cp.status,
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
      const [posRes, colabRes, contrRes] = await Promise.all([
        supabase.rpc("get_organograma_tree"),
        supabase.from("colaboradores_clt").select("id, nome_completo, foto_url, email_corporativo, telefone, data_admissao, salario_base, status, tipo_contrato, cargo, departamento"),
        supabase.from("contratos_pj").select("id, contato_nome, nome_fantasia, razao_social, contato_email, contato_telefone, data_inicio, valor_mensal, status, foto_url"),
      ]);

      if (posRes.error) throw posRes.error;

      const tree = buildTree(
        (posRes.data || []) as unknown as PosicaoRaw[],
        (colabRes.data || []) as ColaboradorVinculado[],
        (contrRes.data || []) as ContratoPJVinculado[],
      );

      return { tree, flat: flattenTree(tree) };
    },
  });
}
