// LEITURA-SEM-LIMITE (18/11/2026) — portao contra o corte silencioso de 1.000 linhas.
// O banco devolve no maximo 1.000 linhas por consulta. Ler uma relacao grande inteira
// para filtrar, contar ou somar no navegador esconde registros sem avisar.
// Leitura de relacao grande precisa de UM destes:
//   - filtro por chave: .eq() / .in() / .match()
//   - limite explicito: .range() / .limit() / .single() / .maybeSingle() / { head: true }
//   - estar dentro de buscarTodos(() => ...)  (carga em lotes, so para diagnostico/exportacao)
// Para tela-tabela use fn_lista; para KPI, RPC que devolve o agregado; para combo, busca por digitacao.
// A lista de relacoes grandes vem do banco (relacoes-grandes.json) e e regenerada pela conexao.
import relacoesGrandes from "./relacoes-grandes.json" with { type: "json" };

const GRANDES = new Set(relacoesGrandes);
const LIMITAM = new Set(["eq", "in", "match", "range", "limit", "single", "maybeSingle"]);
const ESCRITA = new Set(["insert", "update", "upsert", "delete"]);

function nomeMetodo(call) {
  const c = call.callee;
  return c && c.type === "MemberExpression" && !c.computed && c.property.type === "Identifier" ? c.property.name : null;
}

function relacaoDe(call) {
  const a = call.arguments[0];
  if (!a) return null;
  if (a.type === "Literal" && typeof a.value === "string") return a.value;
  if (a.type === "TemplateLiteral" && a.expressions.length === 0) return a.quasis[0].value.cooked;
  if (a.type === "TSAsExpression") return relacaoDe({ arguments: [a.expression] });
  return null;
}

function temHeadTrue(call) {
  return call.arguments.some(
    (a) => a.type === "ObjectExpression" &&
      a.properties.some((p) => p.type === "Property" && p.key && (p.key.name === "head" || p.key.value === "head") &&
        p.value.type === "Literal" && p.value.value === true),
  );
}

function dentroDeBuscarTodos(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === "CallExpression" && p.callee.type === "Identifier" && p.callee.name === "buscarTodos") return true;
  }
  return false;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Proibe ler relacao grande sem filtro por chave, limite ou carga em lotes." },
    schema: [],
    messages: {
      semLimite:
        "LEITURA-SEM-LIMITE: '{{rel}}' passa de 1.000 linhas e o banco corta o resto em silencio. Tela-tabela: fn_lista. KPI: RPC com o agregado. Combo: busca por digitacao (ex.: fn_busca_parceiro). Filtro por chave (.eq/.in) ou .range/.limit tambem resolvem.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (nomeMetodo(node) !== "from") return;
        const rel = relacaoDe(node);
        if (!rel || !GRANDES.has(rel)) return;
        // sobe a cadeia .from(...).select(...).eq(...)...
        let atual = node;
        while (atual.parent && atual.parent.type === "MemberExpression" && atual.parent.object === atual &&
               atual.parent.parent && atual.parent.parent.type === "CallExpression" && atual.parent.parent.callee === atual.parent) {
          atual = atual.parent.parent;
          const m = nomeMetodo(atual);
          if (ESCRITA.has(m) || LIMITAM.has(m) || temHeadTrue(atual)) return;
        }
        if (dentroDeBuscarTodos(node)) return;
        context.report({ node, messageId: "semLimite", data: { rel } });
      },
    };
  },
};
