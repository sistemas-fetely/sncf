import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PosicaoNode } from "@/types/organograma";

interface Props {
  tree: PosicaoNode[];
  onNodeClick?: (n: PosicaoNode) => void;
}

function NoCard({
  node,
  level,
  onNodeClick,
}: {
  node: PosicaoNode;
  level: number;
  onNodeClick?: (n: PosicaoNode) => void;
}) {
  const compact = level >= 2;
  const nome = node.nome_display?.trim() || node.titulo_cargo;
  const vago = node.status !== "ocupado";

  return (
    <div className="space-y-2">
      <Card
        className={`card-shadow border-l-4 ${
          level === 0 ? "border-l-primary" : level === 1 ? "border-l-primary/60" : "border-l-primary/30"
        } ${onNodeClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
        onClick={() => onNodeClick?.(node)}
      >
        <CardContent className={compact ? "p-2.5" : "p-3.5"}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className={`font-medium truncate ${compact ? "text-sm" : "text-base"}`}>{nome}</p>
              <p className="text-xs text-muted-foreground truncate">
                {node.titulo_cargo || "—"}
                {node.departamento ? ` · ${node.departamento}` : ""}
                {node.filial ? ` · ${node.filial}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {node.subordinados_diretos > 0 && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {node.subordinados_diretos}
                </span>
              )}
              {vago ? (
                <Badge variant="outline" className="text-[10px] border-dashed">
                  {node.status === "vaga_aberta" ? "Vaga Aberta" : "Previsto"}
                </Badge>
              ) : (
                node.vinculo && <span className="text-[11px] text-muted-foreground">{node.vinculo}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {node.children.length > 0 && (
        <div className="ml-6 pl-4 border-l border-border space-y-2">
          {node.children.map((f) => (
            <NoCard key={f.id} node={f} level={level + 1} onNodeClick={onNodeClick} />
          ))}
        </div>
      )}
    </div>
  );
}

export function OrgListaView({ tree, onNodeClick }: Props) {
  if (tree.length === 0) {
    return (
      <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
        Nenhuma posição encontrada com os filtros atuais.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tree.map((r) => (
        <NoCard key={r.id} node={r} level={0} onNodeClick={onNodeClick} />
      ))}
    </div>
  );
}
