import type { LinhaCentral } from "@/lib/estoque/centralEstoque";

/** Semáforo da célula: ok neutro · acabando âmbar · zerado vermelho · retido em destaque primário com cadeado. */
export function classeStatus(l: Pick<LinhaCentral, "status">): string {
  switch (l.status) {
    case "retido": return "border-primary text-primary";
    case "zerado": return "border-destructive text-destructive";
    case "acabando": return "border-warning text-warning";
    default: return "text-muted-foreground";
  }
}
export function corNumero(l: Pick<LinhaCentral, "status">): string {
  switch (l.status) {
    case "retido": return "text-primary";
    case "zerado": return "text-destructive";
    case "acabando": return "text-warning";
    default: return "text-foreground";
  }
}
export function rotuloStatus(l: Pick<LinhaCentral, "status">): string {
  return l.status === "retido" ? "retido" : l.status === "zerado" ? "zerado" : l.status === "acabando" ? "acabando" : "ok";
}
