import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Users, Minus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { SalarioMasked } from "@/components/SalarioMasked";
import type { PosicaoNode, OrgFilters } from "@/types/organograma";

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function statusIcon(node: PosicaoNode) {
  if (node.status === "vaga_aberta") return "⚪";
  if (node.status === "previsto") return "🔵";
  if (node.status_pessoal === "ferias") return "🟠";
  if (node.status_pessoal === "afastado") return "⚫";
  return "🟢";
}

function statusLabel(node: PosicaoNode) {
  if (node.status === "vaga_aberta") return "Vaga";
  if (node.status === "previsto") return "Previsto";
  if (node.status_pessoal === "ferias") return "Férias";
  if (node.status_pessoal === "afastado") return "Afastado";
  return "Ativo";
}

interface RowProps {
  node: PosicaoNode;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  onNodeClick: (n: PosicaoNode) => void;
  canSeeSalary: boolean;
  showPrevisto: boolean;
}

function TreeRow({ node, expanded, toggleExpand, onNodeClick, canSeeSalary, showPrevisto }: RowProps) {
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const indent = node.depth * 24;
  const avatarUrl = node.foto_url || null;

  return (
    <>
      <tr
        className="border-b hover:bg-accent/30 cursor-pointer transition-colors group"
        onClick={() => onNodeClick(node)}
      >
        <td className="py-2 px-3">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: indent }}>
            {hasChildren ? (
              <button
                onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
                className="p-0.5 hover:bg-accent rounded shrink-0"
              >
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}

            {node.status === "ocupado" ? (
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="h-6 w-6 shrink-0">
                  {avatarUrl && <AvatarImage src={avatarUrl} className="object-cover" />}
                  <AvatarFallback className="text-[8px]">{getInitials(node.nome_display)}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium truncate">{node.nome_display}</span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground italic">
                {node.status === "vaga_aberta" ? "[Vaga Aberta]" : "[Previsto]"}
              </span>
            )}
          </div>
        </td>
        <td className="py-2 px-3 text-sm text-muted-foreground">{node.titulo_cargo}</td>
        <td className="py-2 px-3 text-sm text-muted-foreground">{node.departamento}</td>
        <td className="py-2 px-3">
          {node.vinculo ? (
            <Badge variant="outline" className="text-[10px] h-5">
              {node.vinculo === "CLT" ? "💼" : "🔷"} {node.vinculo}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </td>
        <td className="py-2 px-3 text-sm text-center">
          {node.subordinados_diretos > 0 ? (
            <span className="flex items-center justify-center gap-1">
              <Users className="h-3 w-3 text-muted-foreground" />
              {node.subordinados_diretos}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="py-2 px-3 text-sm text-center">
          <span>{statusIcon(node)} {statusLabel(node)}</span>
        </td>
        {canSeeSalary && showPrevisto && (
          <td className="py-2 px-3 text-sm text-right font-mono">
            <SalarioMasked
              valor={node.salario_previsto}
              userId={(node.colaborador as any)?.user_id || (node.contrato_pj as any)?.user_id || null}
              contexto="organograma"
            />
          </td>
        )}
      </tr>
      {isExpanded && node.children.map(child => (
        <TreeRow
          key={child.id}
          node={child}
          expanded={expanded}
          toggleExpand={toggleExpand}
          onNodeClick={onNodeClick}
          canSeeSalary={canSeeSalary}
          showPrevisto={showPrevisto}
        />
      ))}
    </>
  );
}

interface Props {
  tree: PosicaoNode[];
  flat: PosicaoNode[];
  filters: OrgFilters;
  onNodeClick: (n: PosicaoNode) => void;
}

export function OrgSyntheticView({ tree, flat, filters, onNodeClick }: Props) {
  const { hasAnyRole } = useAuth();
  const canSeeSalary = hasAnyRole(["super_admin", "gestor_rh", "financeiro"]);
  const [showPrevisto, setShowPrevisto] = useState(false);

  // Start with first 3 levels expanded
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const set = new Set<string>();
    flat.filter(n => n.depth < 3).forEach(n => set.add(n.id));
    return set;
  });

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(flat.map(n => n.id)));
  const collapseAll = () => setExpanded(new Set());

  // Summary
  const totalPosicoes = flat.length;
  const ocupadas = flat.filter(n => n.status === "ocupado").length;
  const cltCount = flat.filter(n => n.vinculo === "CLT").length;
  const pjCount = flat.filter(n => n.vinculo === "PJ").length;
  const vagas = flat.filter(n => n.status === "vaga_aberta").length;
  const previstas = flat.filter(n => n.status === "previsto").length;
  const custoPrevisto = flat.reduce((s, n) => s + (n.salario_previsto || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>Expandir tudo</Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>Colapsar tudo</Button>
        </div>
        {canSeeSalary && (
          <Button variant="ghost" size="sm" onClick={() => setShowPrevisto(!showPrevisto)}>
            {showPrevisto ? "Ocultar previsto" : "Mostrar previsto"}
          </Button>
        )}
      </div>

      <div className="border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left py-2.5 px-3 font-medium text-muted-foreground min-w-[280px]">Nome</th>
              <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Cargo</th>
              <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Departamento</th>
              <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Vínculo</th>
              <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Equipe</th>
              <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Status</th>
              {canSeeSalary && showPrevisto && <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Previsto</th>}
            </tr>
          </thead>
          <tbody>
            {tree.map(root => (
              <TreeRow
                key={root.id}
                node={root}
                expanded={expanded}
                toggleExpand={toggleExpand}
                onNodeClick={onNodeClick}
                canSeeSalary={canSeeSalary}
                showPrevisto={showPrevisto}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground px-1 flex-wrap gap-2">
        <span>
          Total: <strong>{totalPosicoes}</strong> posições · <strong>{ocupadas}</strong> ocupadas ({cltCount} CLT · {pjCount} PJ) · <strong>{vagas}</strong> vagas abertas · <strong>{previstas}</strong> previstas
        </span>
        {canSeeSalary && (
          <span className="flex items-center gap-1.5">
            Custo previsto das posições: <strong>{fmtBRL(custoPrevisto)}</strong>/mês
            <span className="text-muted-foreground/70">· Baseado no salário previsto da posição. Para custo real, veja Custo de Pessoas.</span>
          </span>
        )}
      </div>
    </div>
  );
}
