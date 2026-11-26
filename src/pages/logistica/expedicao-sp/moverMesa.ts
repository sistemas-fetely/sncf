export interface TransicaoMesa {
  para: string;
  rotulo: string;
  descricao: string | null;
  exige_motivo: boolean;
  permitido: boolean;
  bloqueio: string | null;
  pergunta: string | null;
}

export interface MoverMesaArgs {
  p_pedido_id: string;
  p_para: string;
  p_motivo: string | null;
  p_respostas: { cancelar_etiqueta?: "sim" };
}

export type ResultadoMoverMesa =
  | { ok: true; de: string; para: string; avisos: string[] }
  | { ok: false; pergunta: "cancelar_etiqueta"; texto: string };

/** Local RPC contracts: keep the generated database types untouched. */
export interface RpcsMovimentoMesa {
  fn_mesa_sp_transicoes: { Args: { p_pedido_id: string }; Returns: TransicaoMesa[] };
  fn_mesa_sp_mover: { Args: MoverMesaArgs; Returns: ResultadoMoverMesa };
}

export function podeConfirmarMovimento(exigeMotivo: boolean, motivo: string, pergunta: string | null, confirmado: boolean): boolean {
  return (!exigeMotivo || motivo.trim().length > 0) && (!pergunta || confirmado);
}

export function respostasMovimento(confirmado: boolean): MoverMesaArgs["p_respostas"] {
  return confirmado ? { cancelar_etiqueta: "sim" } : {};
}

export function lerResultadoMovimento(valor: unknown): ResultadoMoverMesa {
  if (valor && typeof valor === "object") {
    const r = valor as Record<string, unknown>;
    if (r.ok === false && r.pergunta === "cancelar_etiqueta" && typeof r.texto === "string") {
      return { ok: false, pergunta: r.pergunta, texto: r.texto };
    }
    if (r.ok === true && typeof r.de === "string" && typeof r.para === "string" && Array.isArray(r.avisos) && r.avisos.every((v) => typeof v === "string")) {
      return { ok: true, de: r.de, para: r.para, avisos: r.avisos };
    }
  }
  throw new Error("Resposta inválida de fn_mesa_sp_mover.");
}