export function pctClassPersonalizada(pct: number | null | undefined) {
  if (pct == null) return "bg-muted text-muted-foreground";
  if (pct <= 5) return "bg-success/15 text-success";
  if (pct <= 15) return "bg-warning/10 text-warning";
  return "bg-destructive/15 text-destructive";
}
