import { useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Crown, ArrowUp, ArrowDown } from "lucide-react";
import { useOrganograma } from "@/hooks/useOrganograma";
import { Skeleton } from "@/components/ui/skeleton";
import type { PosicaoNode } from "@/types/organograma";

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function getBorderColor(node: PosicaoNode) {
  if (node.vinculo === "PJ") return "border-info/40";
  return "border-primary";
}

function getStatusBadge(status: string | null) {
  if (!status) return null;
  const map: Record<string, { label: string; className: string }> = {
    ativo: { label: "Ativo", className: "bg-success/10 text-success border-0" },
    ferias: { label: "Férias", className: "bg-warning/10 text-warning border-0" },
    afastado: { label: "Afastado", className: "bg-muted text-muted-foreground border-0" },
    desligado: { label: "Desligado", className: "bg-destructive/10 text-destructive border-0" },
  };
  const s = map[status];
  if (!s) return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  return <Badge variant="outline" className={`text-[10px] ${s.className}`}>{s.label}</Badge>;
}

/** Find the branch: path from root to the target + all descendants of the target */
function extractBranch(flat: PosicaoNode[], targetColabId: string | null, targetContratoId: string | null): {
  ancestors: PosicaoNode[];
  current: PosicaoNode | null;
  directReports: PosicaoNode[];
  leader: PosicaoNode | null;
} {
  const current = flat.find(n =>
    (targetColabId && n.colaborador_id === targetColabId) ||
    (targetContratoId && n.contrato_pj_id === targetContratoId)
  ) || null;

  if (!current) return { ancestors: [], current: null, directReports: [], leader: null };

  // Find ancestors (walk up via id_pai)
  const nodeMap = new Map(flat.map(n => [n.id, n]));
  const ancestors: PosicaoNode[] = [];
  let parentId = current.id_pai;
  while (parentId && nodeMap.has(parentId)) {
    ancestors.unshift(nodeMap.get(parentId)!);
    parentId = nodeMap.get(parentId)!.id_pai;
  }

  const leader = ancestors.length > 0 ? ancestors[ancestors.length - 1] : null;
  const directReports = current.children || [];

  return { ancestors, current, directReports, leader };
}

function PersonCard({ node, highlight, label }: { node: PosicaoNode; highlight?: boolean; label?: string }) {
  const avatarUrl = node.foto_url || null;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${highlight ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border"}`}>
      <Avatar className={`h-10 w-10 shrink-0 border-2 ${getBorderColor(node)}`}>
        {avatarUrl && <AvatarImage src={avatarUrl} className="object-cover" />}
        <AvatarFallback className="text-xs">{node.nome_display ? getInitials(node.nome_display) : "?"}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{node.nome_display || node.titulo_cargo}</p>
          {label && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0 bg-primary/10 text-primary border-0">
              {label}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{node.titulo_cargo}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant="outline" className="text-[9px] h-4 px-1">{node.vinculo || "—"}</Badge>
          {node.departamento && <span className="text-[10px] text-muted-foreground">{node.departamento}</span>}
          {getStatusBadge(node.status_pessoal)}
        </div>
      </div>
    </div>
  );
}

/** Mini tree visualization: vertical chain of ancestor cards with connector lines */
function MiniTree({ ancestors, current, directReports }: {
  ancestors: PosicaoNode[];
  current: PosicaoNode;
  directReports: PosicaoNode[];
}) {
  return (
    <div className="flex flex-col items-center gap-0 py-2">
      {ancestors.map((a, i) => (
        <div key={a.id} className="flex flex-col items-center w-full max-w-xs">
          <PersonCard node={a} label={i === ancestors.length - 1 ? "Líder direto" : undefined} />
          <div className="w-px h-4 bg-border" />
        </div>
      ))}

      <div className="w-full max-w-xs">
        <PersonCard node={current} highlight />
      </div>

      {directReports.length > 0 && (
        <>
          <div className="w-px h-4 bg-border" />
          <div className="flex flex-wrap gap-2 justify-center w-full">
            {directReports.map(r => (
              <div key={r.id} className="w-full max-w-xs">
                <PersonCard node={r} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface Props {
  colaboradorId?: string | null;
  contratoPjId?: string | null;
}

export function OrgBranchView({ colaboradorId, contratoPjId }: Props) {
  const { data, isLoading } = useOrganograma();

  const branch = useMemo(() => {
    if (!data) return null;
    return extractBranch(data.flat, colaboradorId || null, contratoPjId || null);
  }, [data, colaboradorId, contratoPjId]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!branch?.current) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center py-8">
            Este colaborador não está vinculado a nenhuma posição no organograma.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { ancestors, current, directReports, leader } = branch;

  // Build a list of all connected people (leader + peers + direct reports)
  const connectedPeople: { node: PosicaoNode; role: string }[] = [];

  if (leader) {
    connectedPeople.push({ node: leader, role: "Líder Direto" });
    // Peers = other children of leader that aren't the current node
    const leaderInFlat = data!.flat.find(n => n.id === leader.id);
    if (leaderInFlat) {
      for (const peer of leaderInFlat.children) {
        if (peer.id !== current.id && peer.nome_display) {
          connectedPeople.push({ node: peer, role: "Par (mesmo líder)" });
        }
      }
    }
  }

  for (const dr of directReports) {
    connectedPeople.push({ node: dr, role: "Subordinado direto" });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left: Mini tree */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Árvore Hierárquica
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto max-h-[500px]">
          <MiniTree ancestors={ancestors} current={current} directReports={directReports} />
        </CardContent>
      </Card>

      {/* Right: Stats + Connected people list */}
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="pt-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <ArrowDown className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-medium">{current.subordinados_totais}</p>
                <p className="text-xs text-muted-foreground">Colaboradores abaixo na hierarquia</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="h-4 w-4" /> Pessoas Conectadas
            </CardTitle>
        </CardHeader>
        <CardContent>
          {connectedPeople.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma pessoa conectada no organograma.</p>
          ) : (
            <div className="space-y-2 overflow-auto max-h-[460px]">
              {connectedPeople.map(({ node, role }) => (
                <div key={node.id} className={`flex items-center gap-3 p-3 rounded-lg border ${role === "Líder Direto" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <Avatar className={`h-9 w-9 shrink-0 border-2 ${getBorderColor(node)}`}>
                    <AvatarImage src={node.foto_url || undefined} className="object-cover" />
                    <AvatarFallback className="text-xs">{getInitials(node.nome_display)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{node.nome_display}</p>
                    <p className="text-xs text-muted-foreground truncate">{node.titulo_cargo}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${role === "Líder Direto" ? "bg-primary/10 text-primary border-0" : role.startsWith("Par") ? "bg-info/10 text-info border-0" : "bg-muted text-muted-foreground border-0"}`}>
                      {role === "Líder Direto" && <Crown className="h-2.5 w-2.5 mr-0.5" />}
                      {role === "Subordinado direto" && <ArrowDown className="h-2.5 w-2.5 mr-0.5" />}
                      {role}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] h-4 px-1">{node.vinculo}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        </Card>
      </div>
    </div>
  );
}
