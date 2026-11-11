import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export function PedidoCanalDrawer({ open, onOpenChange, titulo, descricao, cabecalho, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; titulo: ReactNode;
  descricao: ReactNode; cabecalho?: ReactNode; children: ReactNode;
}) {
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
      <SheetHeader className="pb-3">
        <SheetTitle className="font-mono text-base">{titulo}</SheetTitle>
        <SheetDescription>{descricao}</SheetDescription>
        {cabecalho}
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">{children}</div>
    </SheetContent>
  </Sheet>;
}
export function BlocoPedidoCanal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <section className="space-y-2">
    <h3 className="text-[11px] font-medium uppercase tracking-[2px] text-muted-foreground">{titulo}</h3>
    {children}
  </section>;
}
export function LinhaPedidoCanal({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <div className="flex items-start justify-between gap-3 text-xs">
    <span className="text-muted-foreground">{rotulo}</span><span className="text-right">{children}</span>
  </div>;
}
