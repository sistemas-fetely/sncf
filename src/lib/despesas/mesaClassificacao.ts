export type Porta = "nf" | "cartao";
export interface GrupoMesa {
  porta: Porta; chave: string; rotulo: string | null; itens: number; valor: number; de: string | null; ate: string | null;
  itens_sem_plano: number; valor_sem_plano: number; itens_sem_centro: number; destinos: string | null; pista: string | null;
  grupo_id: string | null; sugestao_status: string | null; sugestao_origem: string | null;
  sug_plano_contas_id: string | null; sug_plano_codigo: string | null; sug_plano_nome: string | null;
  sug_centro_custo_id: string | null; sug_centro_codigo: string | null; sug_centro_nome: string | null;
  sug_destino_codigo: string | null; sug_destino_rotulo: string | null; sug_motivo: string | null;
  sug_confianca: number | null; regra_automatica: boolean | null;
}
export type FiltroPendencia = "sem_plano" | "sem_centro" | "todas";
export type FiltroConfianca = "todas" | "alta" | "media" | "baixa" | "sem";

export function faixaConfianca(c: number | null | undefined): "alta" | "media" | "baixa" | null {
  if (c == null) return null;
  return c >= 75 ? "alta" : c >= 50 ? "media" : "baixa";
}
export const grupoPendente = (g: GrupoMesa) => g.itens_sem_plano > 0 || g.itens_sem_centro > 0;

export function filtrarGrupos(gs: GrupoMesa[], f: { porta: string; pendencia: FiltroPendencia; confianca: FiltroConfianca; busca: string }): GrupoMesa[] {
  const b = f.busca.trim().toLowerCase();
  const out = gs.filter((g) => {
    if (f.porta !== "todas" && g.porta !== f.porta) return false;
    if (f.pendencia === "sem_plano" && !(g.itens_sem_plano > 0)) return false;
    if (f.pendencia === "sem_centro" && !(g.itens_sem_plano === 0 && g.itens_sem_centro > 0)) return false;
    if (f.confianca !== "todas") {
      const fx = g.sug_plano_contas_id ? faixaConfianca(g.sug_confianca) : null;
      if (f.confianca === "sem" ? !!g.sug_plano_contas_id : fx !== f.confianca) return false;
    }
    if (b && ![g.rotulo, g.chave, g.pista].some((t) => (t ?? "").toLowerCase().includes(b))) return false;
    return true;
  });
  const k = f.pendencia === "sem_centro" ? "valor" : "valor_sem_plano";
  return out.sort((a, c) => Number(c[k] ?? 0) - Number(a[k] ?? 0));
}

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesAno = (d: string) => { const [y, m] = d.slice(0, 7).split("-"); return `${MES[Number(m) - 1]}/${y.slice(2)}`; };
export function periodo(de: string | null, ate: string | null): string {
  if (!de && !ate) return "—";
  const a = mesAno(de ?? ate!), b = mesAno(ate ?? de!);
  return a === b ? a : `${a} – ${b}`;
}
/** Contas-folha: não são pai de nenhuma outra. */
export function contasFolha<T extends { id: string; parent_id: string | null; codigo: string }>(cs: T[]): T[] {
  const pais = new Set(cs.map((c) => c.parent_id).filter(Boolean));
  return cs.filter((c) => !pais.has(c.id)).sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
}
