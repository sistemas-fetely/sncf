import { ErroCatalogo } from "./mensagens.ts";

type Rpc = (nome: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
export const PRAZO_TRAVA = 300;

/** A unique lease token prevents an old worker from renewing or releasing a successor's lease. */
export async function pegarTrava(rpc: Rpc, dono: "leitura" | "aplicacao", ator: string | null, automatica = false, prazo = PRAZO_TRAVA) {
  const r = await rpc("fn_catalogo_trava_pegar", { p_ambiente: "oficial", p_dono: dono, p_segundos: prazo, p_ator: ator, p_aguardar: automatica });
  if (r.error) throw new Error(r.error.message);
  if (!r.data?.ok) {
    const leitura = r.data?.dono === "leitura";
    throw new ErroCatalogo(leitura ? "Leitura da planilha em andamento — aguarde e atualize a tela." : "Aplicação em andamento — tente em instantes.", 409, leitura ? "leitura_em_andamento" : "aplicacao_em_andamento");
  }
  const token = r.data.token as string;
  let falha: Error | null = null;
  let renovando: Promise<void> | null = null;
  let renovadaEm = Date.now();
  let solta = false;
  const renovar = () => {
    if (renovando) return renovando;
    renovando = (async () => {
      const r = await rpc("fn_catalogo_trava_renovar", { p_ambiente: "oficial", p_token: token, p_segundos: prazo });
      if (r.error || r.data !== true) throw new Error(r.error?.message ?? "A trava do catálogo expirou; operação interrompida.");
      renovadaEm = Date.now();
    })().catch(e => { falha = e instanceof Error ? e : new Error(String(e)); throw falha; }).finally(() => { renovando = null; });
    return renovando;
  };
  const intervalo = Math.min(60_000, prazo * 1000 / 3);
  const timer = setInterval(() => { void renovar().catch(() => {}); }, intervalo);
  return {
    verificar: async () => { if (falha) throw falha; if (solta) throw new Error('A trava do catálogo foi liberada.'); if (prazo === PRAZO_TRAVA || Date.now() - renovadaEm >= intervalo) await renovar(); },
    soltar: async () => {
      if (solta) return;
      clearInterval(timer);
      if (renovando) await renovando.catch(() => {});
      const r = await rpc("fn_catalogo_trava_soltar", { p_ambiente: "oficial", p_token: token });
      if (r.error) throw new Error(r.error.message);
      solta = true;
    },
  };
}