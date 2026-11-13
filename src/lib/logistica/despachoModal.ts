/**
 * Resolve o modal do cadastro aceitando código OU nome (case-insensitive, trim),
 * porque `fn_mesa_sp_dados_impressao` devolve o NOME ("Correios") enquanto a
 * embalagem grava o CÓDIGO ("CORREIOS"). Candidatos na ordem de precedência.
 */
export function modalDoCadastro<T extends { codigo: string; nome: string }>(
  modais: T[],
  ...candidatos: (string | null | undefined)[]
): T | null {
  const norm = (v: string) => v.trim().toLowerCase();
  for (const candidato of candidatos) {
    if (!candidato || candidato.trim() === "") continue;
    const alvo = norm(candidato);
    const achado = modais.find((m) => norm(m.codigo) === alvo || norm(m.nome) === alvo);
    if (achado) return achado;
  }
  return null;
}

/** Capabilities come from the modal/executor dimensions, never from modal codes. */
export function requisitosDespachoModal(
  modal: { exige_etiqueta_correios: boolean; sem_despacho: boolean; tem_rastreio_automatico: boolean } | null,
  executores: { codigo: string; exige_referencia: boolean }[],
  codigoExecutor: string,
) {
  const executor = executores.find((e) => e.codigo === codigoExecutor) ?? null;
  return {
    usaExecutor: executores.length > 0,
    executor,
    exigeReferencia: executor?.exige_referencia === true,
    executorValido: executores.length === 0 || executor !== null,
    // The existing batch RPC cannot forward an executor to the individual RPC.
    permiteLote: modal?.tem_rastreio_automatico === true && !modal.sem_despacho && executores.length === 0,
  };
}