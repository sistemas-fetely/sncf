// Checagem server-side de permissão nominal de AÇÃO (slug `acao.*`).
// Doutrina DIMENSAO-VIA-TABELA: quem decide é `permissoes_catalogo` +
// `grupo_acesso_permissoes` (lidos pela RPC `usuario_tem_acao`), nunca o código.
// Convenção existente do projeto: `pode_ver = true` significa "pode executar".
// Sem isso, esconder o botão na tela seria só cosmético — a função continua chamável.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export interface ResultadoAcao {
  ok: boolean;
  userId: string | null;
  status: number;
  erro: string | null;
}

/**
 * Valida o JWT do chamador e exige a permissão de ação `slug`.
 * super_admin passa por bypass (padrão do projeto).
 */
export async function exigirAcao(
  sb: Sb,
  authHeader: string | null,
  slug: string,
  rotuloAcao: string,
): Promise<ResultadoAcao> {
  const negado = (erro: string, status: number): ResultadoAcao => ({ ok: false, userId: null, status, erro });

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return negado("Não autorizado", 401);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = authHeader.replace("Bearer ", "");
  // ATOR-SISTEMA-TAMBEM-PASSA (01/09/2026): esta guarda nasceu pensando em
  // pessoa clicando botao, mas a mesma edge e chamada por cron com service
  // role. `auth.getUser(serviceKey)` devolve vazio -> 401 -> a fila B2C morreu
  // em silencio por 3 dias (13 pedidos). Maquina nao tem auth.uid(); a autoria
  // dela e `ator_tipo='sistema'`, previsto na doutrina AUTORIA-NAO-SE-PERDE.
  if (serviceKey && token === serviceKey) {
    return { ok: true, userId: null, status: 200, erro: null };
  }

  const { data: u, error: eUser } = await sb.auth.getUser(token);
  const userId: string | null = u?.user?.id ?? null;
  if (eUser || !userId) return negado("Não autorizado", 401);

  const { data: ehSuper } = await sb.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (ehSuper === true) return { ok: true, userId, status: 200, erro: null };

  const { data: permitido, error: ePerm } = await sb.rpc("usuario_tem_acao", {
    p_slug: slug,
    p_user_id: userId,
  });
  if (ePerm) return { ...negado(`Falha ao checar permissão: ${ePerm.message}`, 500), userId };
  if (permitido !== true) {
    return {
      ...negado(
        `Sem permissão para ${rotuloAcao}. Ação do time de Operações (permissão ${slug}).`,
        403,
      ),
      userId,
    };
  }
  return { ok: true, userId, status: 200, erro: null };
}
