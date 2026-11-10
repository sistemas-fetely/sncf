export type VinculoNfCliente = {
  devolucao_id: string | null;
  nf_saida_id: string | null;
  status: string;
  classe: string | null;
  nfs_stage: { nf_numero: string | null } | null;
};

export function nfClienteConfirmada(vinculos: VinculoNfCliente[], devolucaoId: string, nfOriginalId: string | null) {
  return vinculos.find((v) => v.status === "confirmado" && v.classe === "devolucao_comercial"
    && (v.devolucao_id === devolucaoId || (nfOriginalId !== null && v.nf_saida_id === nfOriginalId))) ?? null;
}