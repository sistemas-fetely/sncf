import { ChevronRight, X, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PosicaoNode } from "@/types/organograma";

interface Props {
  no: PosicaoNode;
  trilha: PosicaoNode[];
  onSelecionar: (id: string) => void;
  onLimpar: () => void;
}

function rotulo(n: PosicaoNode) {
  return n.nome_display?.trim() ? n.nome_display : n.titulo_cargo;
}

export function OrgLenteBreadcrumb({ no, trilha, onSelecionar, onLimpar }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-muted/40 px-3 py-2">
      <span className="text-xs text-muted-foreground shrink-0">Vendo a equipe de</span>

      <div className="flex items-center gap-1 flex-wrap min-w-0">
        <button
          type="button"
          onClick={onLimpar}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Empresa
        </button>

        {trilha.map((a) => (
          <span key={a.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <button
              type="button"
              onClick={() => onSelecionar(a.id)}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline truncate max-w-[160px]"
            >
              {rotulo(a)}
            </button>
          </span>
        ))}

        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-foreground truncate max-w-[220px]">{rotulo(no)}</span>
      </div>

      <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
        <Users className="h-3 w-3" />
        {no.subordinados_diretos} direto(s) · {no.subordinados_totais} no total
      </span>

      <Button variant="ghost" size="sm" onClick={onLimpar} className="h-7 ml-auto shrink-0">
        <X className="h-3.5 w-3.5 mr-1" /> Ver empresa toda
      </Button>
    </div>
  );
}
