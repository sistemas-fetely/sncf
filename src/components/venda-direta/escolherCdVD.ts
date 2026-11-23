export function controlesCdLinhaVD(etapa: string | null | undefined, podeEditar: boolean, podeTrocar: boolean) {
  return {
    mostrarEscolha: podeEditar && etapa === "escolher_cd",
    mostrarTroca: podeEditar && etapa !== "escolher_cd" && podeTrocar,
  };
}

export function podeConfirmarCdVD(cd: string, transportadora: string | null, podeEditar: boolean, cotacaoOk: boolean) {
  return podeEditar && (cd === "SITE-SP" || (cd === "XPM-SC" && cotacaoOk && !!transportadora));
}

export function podeDesfazerCdVD(etapa: string | null | undefined, filaStatus: string | null | undefined, blingNumero: string | number | null | undefined) {
  return etapa === "descendo_bling" && filaStatus === "pendente" && blingNumero == null;
}

export function argsEscolhaCdVD(id: string, cd: string, motivo: string, transportadora: string | null) {
  return { p_pedido_id: id, p_centro_codigo: cd, p_motivo: motivo.trim() || null, p_transportadora_id: cd === "XPM-SC" ? transportadora || null : null };
}