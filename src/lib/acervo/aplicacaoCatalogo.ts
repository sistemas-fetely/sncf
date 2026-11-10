export type CelulaLote = { id: string; cod_cadastro: string };
export type RespostaLote = { ok: boolean; aplicadas: number; conflitos: number; erros: number; lotes: number; motivos?: string[] };
export type ResultadoAplicacao = {
  aplicadas: number; conflitos: number; erros: number; lotes: number;
  idsErro: string[]; motivos: string[]; naoEnviadas: number; mensagem?: string; leituraNova?: boolean;
};
export type ProgressoAplicacao = { total: number; processadas: number; lote: number; totalLotes: number; resultado: ResultadoAplicacao };

// Products stay whole, even when a single product exceeds the target batch size.
export function lotesPorProduto(celulas: CelulaLote[], limite = Math.min(100, Math.max(1, Math.ceil(celulas.length / 10)))): string[][] {
  const produtos = new Map<string, string[]>();
  for (const c of celulas) produtos.set(c.cod_cadastro, [...(produtos.get(c.cod_cadastro) ?? []), c.id]);
  const lotes: string[][] = [];
  let lote: string[] = [];
  for (const ids of produtos.values()) {
    lote.push(...ids);
    // The target is soft: finish the product that reaches it before closing the batch.
    if (lote.length >= limite) { lotes.push(lote); lote = []; }
  }
  if (lote.length) lotes.push(lote);
  return lotes;
}

export function motivosAgrupados(motivos: string[]): { mensagem: string; quantidade: number }[] {
  const grupos = new Map<string, number>();
  for (const motivo of motivos) grupos.set(motivo, (grupos.get(motivo) ?? 0) + 1);
  return [...grupos].map(([mensagem, quantidade]) => ({ mensagem, quantidade }));
}

export class FalhaLoteCatalogo extends Error {
  constructor(mensagem: string, public status?: number, public codigo?: string) { super(mensagem); }
}
export function falhaTransporte(erro: unknown): boolean {
  return erro instanceof TypeError || (erro instanceof Error && /Falha ao falar com o FOP|Failed to fetch|NetworkError|Failed to send a request|network request failed/i.test(erro.message)) ||
    (erro instanceof FalhaLoteCatalogo && (erro.status ?? 0) >= 500);
}
export function resultadoVazio(): ResultadoAplicacao {
  return { aplicadas: 0, conflitos: 0, erros: 0, lotes: 0, idsErro: [], motivos: [], naoEnviadas: 0 };
}

export async function executarLotesCatalogo(celulas: CelulaLote[], deps: {
  enviar: (ids: string[]) => Promise<RespostaLote>;
  identificarErros: (ids: string[], quantidade: number) => Promise<string[]>;
  pausa: (mensagem: string) => Promise<'tentar' | 'parar'>;
  progresso: (p: ProgressoAplicacao) => void;
}): Promise<ResultadoAplicacao> {
  const lotes = lotesPorProduto(celulas);
  const resultado = resultadoVazio();
  let processadas = 0;
  for (let i = 0; i < lotes.length; i++) {
    const ids = lotes[i];
    deps.progresso({ total: celulas.length, processadas, lote: i + 1, totalLotes: lotes.length, resultado: { ...resultado } });
    let resposta: RespostaLote;
    while (true) {
      try { resposta = await deps.enviar(ids); break; }
      catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        if (erro instanceof FalhaLoteCatalogo && erro.status === 409 && erro.codigo === 'leitura_mais_nova') {
          return { ...resultado, naoEnviadas: celulas.length - processadas, mensagem: 'Há uma leitura mais nova. Recarregue a tela.', leituraNova: true };
        }
        if (falhaTransporte(erro) && await deps.pausa(mensagem) === 'tentar') continue;
        return { ...resultado, naoEnviadas: celulas.length - processadas, mensagem };
      }
    }
    const contadas = resposta.aplicadas + resposta.conflitos + resposta.erros;
    if (!resposta.ok || contadas !== ids.length) {
      return { ...resultado, naoEnviadas: celulas.length - processadas, mensagem: 'A resposta não confirmou o resultado de todas as células deste lote. Recarregue a lista antes de continuar.' };
    }
    resultado.aplicadas += resposta.aplicadas;
    resultado.conflitos += resposta.conflitos;
    resultado.erros += resposta.erros;
    resultado.lotes += resposta.lotes;
    resultado.motivos.push(...(resposta.motivos ?? []));
    processadas += contadas;
    // The edge only returns counts: read persisted outcomes to retry exact error IDs, never conflicts.
    if (resposta.erros) {
      try { resultado.idsErro.push(...await deps.identificarErros(ids, resposta.erros)); }
      catch (erro) {
        return { ...resultado, naoEnviadas: celulas.length - processadas, mensagem: `Não foi possível identificar as células com erro: ${erro instanceof Error ? erro.message : String(erro)}. Recarregue a lista.` };
      }
    }
    deps.progresso({ total: celulas.length, processadas, lote: i + 1, totalLotes: lotes.length, resultado: { ...resultado } });
  }
  return resultado;
}