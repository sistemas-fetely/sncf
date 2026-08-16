import { useCallback, useMemo, useEffect } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState,
  type Node, type Edge, type NodeProps, Handle, Position, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import type { PosicaoNode, OrgFilters } from "@/types/organograma";

const NODE_W = 220;
const NODE_H = 80;
const H_GAP = 40;
const V_GAP = 100;

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function getBorderColor(node: PosicaoNode) {
  if (node.status === "vaga_aberta") return "#9CA3AF";
  if (node.status === "previsto") return "#22C55E";
  if (node.status_pessoal === "ferias") return "#F59E0B";
  if (node.status_pessoal === "afastado") return "#6B7280";
  if (node.vinculo === "PJ") return "#7C3AED";
  return "#2563EB";
}

let globalClickHandler: ((n: PosicaoNode) => void) | null = null;

function OrgCard({ data }: NodeProps) {
  const node = data.posicao as PosicaoNode;
  const borderColor = getBorderColor(node);
  const isDashed = node.status === "vaga_aberta" || node.status === "previsto";
  const avatarUrl = node.foto_url || null;

  return (
    <div
      className="bg-card rounded-lg shadow-sm px-3 py-2.5 cursor-pointer hover:shadow-md transition-shadow"
      style={{ border: `2px ${isDashed ? "dashed" : "solid"} ${borderColor}`, width: NODE_W, minHeight: 64 }}
      onClick={() => globalClickHandler?.(node)}
    >
      <Handle type="target" position={Position.Top} className="!bg-border !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-border !w-2 !h-2" />

      {node.status === "ocupado" ? (
        <div className="flex items-center gap-2.5">
          <Avatar className="h-9 w-9 shrink-0" style={{ boxShadow: `0 0 0 2px ${borderColor}` }}>
            {avatarUrl && <AvatarImage src={avatarUrl} className="object-cover" />}
            <AvatarFallback className="text-[10px]">{getInitials(node.nome_display)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate leading-tight">{node.nome_display}</p>
            <p className="text-[10px] text-muted-foreground truncate">{node.titulo_cargo}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge variant="outline" className="text-[8px] h-3.5 px-1">{node.vinculo}</Badge>
              {node.status_pessoal === "ativo" && <span className="text-[9px]">🟢</span>}
              {node.status_pessoal === "ferias" && <span className="text-[9px]">🟠</span>}
              {node.status_pessoal === "afastado" && <span className="text-[9px]">⚫</span>}
              {node.subordinados_diretos > 0 && (
                <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                  <Users className="h-2.5 w-2.5" />{node.subordinados_diretos}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-1">
          <p className="text-xs font-medium">{node.titulo_cargo}</p>
          <Badge variant="outline" className="text-[9px] mt-1 border-dashed">
            {node.status === "vaga_aberta" ? "⚪ Vaga Aberta" : "🔵 Previsto"}
          </Badge>
        </div>
      )}
    </div>
  );
}

const nodeTypes = { orgCard: OrgCard };

function layoutTree(roots: PosicaoNode[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const widthMap = new Map<string, number>();
  function calcWidth(node: PosicaoNode): number {
    if (node.children.length === 0) {
      widthMap.set(node.id, NODE_W);
      return NODE_W;
    }
    const w = node.children.reduce((sum, c) => sum + calcWidth(c) + H_GAP, -H_GAP);
    widthMap.set(node.id, Math.max(w, NODE_W));
    return widthMap.get(node.id)!;
  }

  const totalWidth = roots.reduce((sum, r) => sum + calcWidth(r) + H_GAP, -H_GAP);

  function place(node: PosicaoNode, x: number, y: number) {
    nodes.push({
      id: node.id,
      type: "orgCard",
      position: { x, y },
      data: { posicao: node },
    });

    if (node.id_pai) {
      edges.push({
        id: `${node.id_pai}-${node.id}`,
        source: node.id_pai,
        target: node.id,
        type: "smoothstep",
        style: { stroke: "hsl(var(--border))", strokeWidth: 1.5 },
      });
    }

    const w = widthMap.get(node.id) || NODE_W;
    if (node.children.length === 0) return;

    let startX = x - w / 2;
    for (const child of node.children) {
      const cw = widthMap.get(child.id) || NODE_W;
      place(child, startX + cw / 2, y + NODE_H + V_GAP);
      startX += cw + H_GAP;
    }
  }

  let startX = -totalWidth / 2;
  for (const root of roots) {
    const rw = widthMap.get(root.id) || NODE_W;
    place(root, startX + rw / 2, 0);
    startX += rw + H_GAP;
  }

  return { nodes, edges };
}

interface Props {
  tree: PosicaoNode[];
  filters: OrgFilters;
  onNodeClick: (n: PosicaoNode) => void;
  onMoveRequest?: (movedId: string, newParentId: string) => void;
}

export function OrgVisualView({ tree, filters, onNodeClick, onMoveRequest }: Props) {
  globalClickHandler = onNodeClick;

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => layoutTree(tree), [tree]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  useEffect(() => {
    const { nodes: n, edges: e } = layoutTree(tree);
    setNodes(n);
    setEdges(e);
  }, [tree, setNodes, setEdges]);

  const onConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target && onMoveRequest) {
      // source = new parent, target = child being moved
      onMoveRequest(connection.target, connection.source);
    }
  }, [onMoveRequest]);

  return (
    <div className="h-[calc(100vh-220px)] rounded-lg border bg-card">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => {
            const p = n.data?.posicao as PosicaoNode | undefined;
            return p ? getBorderColor(p) : "#ccc";
          }}
          maskColor="rgba(0,0,0,0.1)"
          className="!bottom-4 !right-4"
        />
      </ReactFlow>
    </div>
  );
}
