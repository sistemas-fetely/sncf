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