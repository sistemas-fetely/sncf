export type StatusVenda =
  | "disponivel"
  | "baixo"
  | "indisponivel"
  | "pre_venda"
  | "a_chegar"
  | "sem_previsao"
  | "vendido_sem_lastro";

export const STATUS_VENDA_LABEL: Record<StatusVenda, string> = {
  disponivel: "Disponível",
  baixo: "Estoque baixo",
  indisponivel: "Indisponível",
  pre_venda: "Pré-venda",
  a_chegar: "A chegar",
  sem_previsao: "Sem previsão",
  vendido_sem_lastro: "Vendido sem lastro",
};

export const STATUS_VENDA_CLASS: Record<StatusVenda, string> = {
  disponivel: "bg-success/10 text-success border-success/20",
  baixo: "bg-warning/10 text-warning border-warning/20",
  indisponivel: "bg-muted text-muted-foreground border-border",
  pre_venda: "bg-info/10 text-info border-info/20",
  a_chegar: "bg-info/10 text-info border-info/20",
  sem_previsao: "bg-warning/10 text-warning border-warning/20",
  vendido_sem_lastro: "bg-destructive text-destructive-foreground border-destructive",
};

export const STATUS_VENDA_ORDEM: StatusVenda[] = [
  "vendido_sem_lastro",
  "sem_previsao",
  "indisponivel",
  "baixo",
  "a_chegar",
  "pre_venda",
  "disponivel",
];

export function rotuloStatusVenda(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_VENDA_LABEL[status as StatusVenda] ?? status;
}

export function classeStatusVenda(status: string | null | undefined): string {
  if (!status) return "bg-muted text-muted-foreground border-border";
  return STATUS_VENDA_CLASS[status as StatusVenda] ?? "bg-muted text-muted-foreground border-border";
}
