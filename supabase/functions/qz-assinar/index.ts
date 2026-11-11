import { z } from "npm:zod@3.25.76";
import { assinarQz } from "../_shared/qz/crypto.ts";
import { contextoQz, corsHeaders, lerSegredo, resposta } from "../_shared/qz/http.ts";

const schema = z.object({ toSign: z.string().min(1).refine(v => new TextEncoder().encode(v).length <= 10 * 1024, "Limite de 10 KB excedido.") }).strict();
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return resposta({ erro: "Método não permitido." }, 405);
  try {
    const ctx = await contextoQz(req);
    if (!ctx) return resposta({ erro: "Não autorizado." }, 401);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return resposta({ erro: "toSign deve conter de 1 byte a 10 KB." }, 400);
    const pem = await lerSegredo(ctx.servidor, "qz_private_key");
    if (!pem) return resposta({ erro: "Certificado QZ ainda não gerado." }, 409);
    return resposta({ assinatura: await assinarQz(pem, parsed.data.toSign) });
  } catch { return resposta({ erro: "Não foi possível assinar a impressão QZ." }, 500); }
});