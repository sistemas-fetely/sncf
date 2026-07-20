export function pctClassPersonalizada(pct: number | null | undefined) {
  if (pct == null) return "bg-muted text-muted-foreground";
  if (pct <= 5) return "bg-success/15 text-success";
  if (pct <= 15) return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return "bg-destructive/15 text-destructive";
}
