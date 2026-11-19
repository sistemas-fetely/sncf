type CardFiscal = { tributacao?: Record<string, unknown> | null };
type ResultadoOrigem =
  | { tipo: "pulado"; motivo: "SNCF sem origem" }
  | { tipo: "igual" }
  | { tipo: "divergencia"; de: string | null; para: string };

// Exceção fiscal fixa: SNCF sobrescreve a origem, sem depender do de-para.
// Ausência nunca vira origem nacional (Number(null/"") seria zero).
export function alinharOrigemCard(origemSncf: unknown, atual: CardFiscal, card?: CardFiscal): ResultadoOrigem {
  if ((typeof origemSncf !== "string" && typeof origemSncf !== "number") ||
    (typeof origemSncf === "string" && origemSncf.trim() === "")) {
    return { tipo: "pulado", motivo: "SNCF sem origem" };
  }
  const origem = Number(origemSncf);
  if (!Number.isInteger(origem) || origem < 0 || origem > 8) {
    return { tipo: "pulado", motivo: "SNCF sem origem" };
  }
  const destino = atual.tributacao?.origem;
  if (origem === Number(destino)) return { tipo: "igual" };
  if (card) card.tributacao = { ...(card.tributacao ?? {}), origem };
  return { tipo: "divergencia", de: destino == null ? null : String(destino), para: String(origem) };
}