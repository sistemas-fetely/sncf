export interface SeloEstagioTransferenciaProps {
  estagio: string | null;
  blingIdDestino?: string | null;
  blingEnvioErro?: string | null;
}

export function estadoEnvioTransferencia({ estagio, blingIdDestino, blingEnvioErro }: SeloEstagioTransferenciaProps): "erro" | "aguardando_nf" | "estagio" {
  if (estagio !== "pre_faturamento") return "estagio";
  if (blingEnvioErro?.trim()) return "erro";
  if (blingIdDestino?.trim()) return "aguardando_nf";
  return "estagio";
}