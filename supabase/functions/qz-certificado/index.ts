import { z } from "npm:zod@3.25.76";
import { gerarParQz } from "../_shared/qz/crypto.ts";
import { contextoQz, corsHeaders, lerSegredo, resposta } from "../_shared/qz/http.ts";

const schema = z.object({ acao: z.enum(["gerar", "certificado"]), forcar: z.boolean().optional() }).strict();
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return resposta({ erro: "Método não permitido." }, 405);
  try {
    const ctx = await contextoQz(req);
    if (!ctx) return resposta({ erro: "Não autorizado." }, 401);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return resposta({ erro: "Informe acao gerar/certificado e forcar booleano opcional." }, 400);
    if (parsed.data.acao === "certificado") {
      const certificado = await lerSegredo(ctx.servidor, "qz_certificado");
      return certificado ? resposta({ certificado }) : resposta({ erro: "Certificado QZ ainda não gerado.", codigo: "SEM_CERTIFICADO" }, 404);
    }
    // Project admin roles, never user-editable metadata.
    const { data: roles, error } = await ctx.servidor.from("user_roles").select("role").eq("user_id", ctx.userId);
    if (error) return resposta({ erro: "Não foi possível verificar o acesso administrativo." }, 403);
    if (!roles?.some(r => ["super_admin", "admin_ti", "admin_rh"].includes(r.role))) return resposta({ erro: "Apenas administradores podem gerar o certificado." }, 403);
    const { data: permitido, error: erroPermissao } = await ctx.usuario.rpc("usuario_tem_acao", { p_slug: "acao.credenciais_integracao.gravar", p_user_id: ctx.userId });
    if (erroPermissao || !permitido) return resposta({ erro: "Sem permissão para gravar credenciais (acao.credenciais_integracao.gravar)." }, 403);
    if (!parsed.data.forcar && (await lerSegredo(ctx.servidor, "qz_certificado") || await lerSegredo(ctx.servidor, "qz_private_key"))) return resposta({ erro: "Certificado ou chave já existe. Use forcar para substituir." }, 409);
    const par = await gerarParQz();
    // Caller context is required by the protected RPC; private PEM never leaves this server.
    for (const [nome, valor, descricao] of [["qz_private_key", par.chave, "QZ Tray - chave de assinatura SNCF"], ["qz_certificado", par.certificado, "QZ Tray - certificado público SNCF"]]) {
      const { data, error: erroGravar } = await ctx.usuario.rpc("fn_vault_gravar_segredo", { p_nome: nome, p_valor: valor, p_descricao: descricao });
      if (erroGravar || data?.ok === false) return resposta({ erro: "Falha ao gravar credenciais QZ. Verifique a permissão e tente novamente com forcar." }, 500);
    }
    return resposta({ certificado: par.certificado });
  } catch { return resposta({ erro: "Não foi possível processar o certificado QZ." }, 500); }
});