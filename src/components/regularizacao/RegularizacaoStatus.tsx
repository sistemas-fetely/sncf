import { Selo, type EstadoSelo } from "@/components/ui/selo";

const ROTULOS: Record<string, string> = {
  rascunho: "Rascunho", distribuido: "Distribuído", retornos_em_andamento: "Retornos em andamento",
  retornos_concluidos: "Retornos concluídos", transferencia_emitida: "Transferência emitida",
  concluido: "Concluído", cancelado: "Cancelado", planejada: "Planejada", gerando: "Gerando",
  autorizada: "Autorizada", erro: "Erro",
};
const TONS: Record<string, EstadoSelo> = {
  concluido: "success", autorizada: "success", retornos_concluidos: "success", erro: "destructive",
  cancelado: "muted", rascunho: "muted", planejada: "warning", gerando: "info",
  distribuido: "info", retornos_em_andamento: "warning", transferencia_emitida: "info",
};
export function RegularizacaoStatus({ status }: { status: string }) {
  return <Selo estado={TONS[status] ?? "muted"}>{ROTULOS[status] ?? status}</Selo>;
}
