export interface FiltroGestaoVD { tipo: "fase" | "etapa" | "alerta"; codigo: string }

export function lerFiltroVD(valor: string): FiltroGestaoVD | null {
  const [tipo, ...codigo] = valor.split(":");
  if (!["fase", "etapa", "alerta"].includes(tipo) || !codigo.join(":")) return null;
  return { tipo: tipo as FiltroGestaoVD["tipo"], codigo: codigo.join(":") };
}

export function alternarFiltroVD(atual: FiltroGestaoVD | null, novo: FiltroGestaoVD) {
  return atual?.tipo === novo.tipo && atual.codigo === novo.codigo ? null : novo;
}

export function correspondeFiltroVD(linha: { fase: string | null; etapa: string | null; alertas: string[] | null }, filtro: FiltroGestaoVD | null) {
  if (!filtro) return true;
  return filtro.tipo === "fase" ? linha.fase === filtro.codigo : filtro.tipo === "etapa" ? linha.etapa === filtro.codigo : !!linha.alertas?.includes(filtro.codigo);
}