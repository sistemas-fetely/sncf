export const SITUACAO_LABELS: Record<string, string> = {
  autorizada: "Autorizada", cancelada: "Cancelada", pendente: "Pendente",
  rejeitada: "Rejeitada", denegada: "Denegada", bloqueada: "Bloqueada",
  registrada: "Registrada", emitida: "Emitida",
};

export const SITUACAO_CLASS: Record<string, string> = {
  autorizada: "bg-success/10 text-success border-success/20",
  cancelada: "bg-destructive/10 text-destructive border-destructive/20",
  pendente: "bg-warning/10 text-warning border-warning/20",
  rejeitada: "bg-destructive/10 text-destructive border-destructive/20",
  denegada: "bg-destructive/10 text-destructive border-destructive/20",
  bloqueada: "bg-warning/10 text-warning border-warning/20",
  registrada: "bg-info/10 text-info border-info/20",
  emitida: "bg-success/10 text-success border-success/20",
};