import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mail, Phone, Users, Briefcase, Pencil, Link2, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useMovePosicao } from "@/hooks/useOrgMutations";
import type { PosicaoNode } from "@/types/organograma";

interface Props {
  node: PosicaoNode | null;
  open: boolean;
  onClose: () => void;
  allNodes: PosicaoNode[];
  onEditPosition?: (node: PosicaoNode) => void;
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function statusBadge(status: string | null) {
  if (!status) return null;
  const map: Record<string, { label: string; className: string }> = {
    ativo: { label: "🟢 Ativo", className: "bg-success/10 text-success border-success/40" },
    ferias: { label: "🟠 Férias", className: "bg-warning/10 text-warning border-warning/40" },
    afastado: { label: "⚫ Afastado", className: "bg-muted/10 text-muted-foreground border-border/40" },
  };
  const s = map[status] || { label: status, className: "" };
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
}

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function isDescendant(nodeId: string, potentialAncestorId: string, allNodes: PosicaoNode[]): boolean {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  let current = nodeMap.get(nodeId);
  while (current) {
    if (current.id === potentialAncestorId) return true;
    current = current.id_pai ? nodeMap.get(current.id_pai) : undefined;
  }
  return false;
}

export function OrgNodeDrawer({ node, open, onClose, allNodes, onEditPosition }: Props) {
  const { hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const canSeeSalary = hasAnyRole(["super_admin", "gestor_rh", "financeiro"]);
  const canManage = hasAnyRole(["super_admin", "gestor_rh"]);
  const moveMutation = useMovePosicao();

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");

  if (!node) return null;

  const parent = node.id_pai ? allNodes.find(n => n.id === node.id_pai) : null;
  const avatarUrl = node.foto_url || null;

  // Available nodes to link as subordinate: exclude self, current children, and ancestors (to prevent cycles)
  const currentChildIds = new Set(node.children.map(c => c.id));
  const availableNodes = allNodes.filter(n => {
    if (n.id === node.id) return false;
    if (currentChildIds.has(n.id)) return false;
    // Prevent circular: don't allow ancestors
    if (isDescendant(node.id, n.id, allNodes)) return false;
    return true;
  });

  const filteredLinkNodes = linkSearch.trim()
    ? availableNodes.filter(n => {
        const s = linkSearch.toLowerCase();
        return n.nome_display.toLowerCase().includes(s) || n.titulo_cargo.toLowerCase().includes(s) || n.departamento.toLowerCase().includes(s);
      })
    : availableNodes;

  const handleLinkSubordinate = (subordinate: PosicaoNode) => {
    moveMutation.mutate(
      { id: subordinate.id, newParentId: node.id, node: subordinate, parentNode: node },
      {
        onSuccess: () => {
          setLinkDialogOpen(false);
          setLinkSearch("");
        },
      }
    );
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="sr-only">Detalhes da Posição</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col items-center gap-3 py-4">
            <Avatar className="h-20 w-20">
              {avatarUrl && <AvatarImage src={avatarUrl} className="object-cover" />}
              <AvatarFallback className="text-lg">{node.nome_display ? getInitials(node.nome_display) : "?"}</AvatarFallback>
            </Avatar>
            <div className="text-center">
              <h3 className="text-lg font-medium">{node.nome_display || "Posição Vazia"}</h3>
              <p className="text-sm text-muted-foreground">{node.titulo_cargo}</p>
              <p className="text-xs text-muted-foreground">{node.departamento}{node.area ? ` · ${node.area}` : ""}</p>
            </div>
            <div className="flex gap-2">
              {node.vinculo && <Badge variant={node.vinculo === "CLT" ? "default" : "secondary"}>{node.vinculo}</Badge>}
              {node.status === "vaga_aberta" && <Badge variant="outline" className="border-dashed">⚪ Vaga Aberta</Badge>}
              {node.status === "previsto" && <Badge variant="outline" className="border-dashed border-success/40 text-success">🔵 Previsto</Badge>}
              {statusBadge(node.status_pessoal)}
            </div>
            {canManage && (
              <div className="flex gap-2">
                {onEditPosition && (
                  <Button variant="outline" size="sm" onClick={() => onEditPosition(node)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => { setLinkDialogOpen(true); setLinkSearch(""); }}>
                  <Link2 className="h-3.5 w-3.5 mr-1" /> Vincular Subordinado
                </Button>
              </div>
            )}
          </div>

          <Tabs defaultValue="perfil" className="mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="perfil" className="flex-1">Perfil</TabsTrigger>
              <TabsTrigger value="equipe" className="flex-1">Equipe</TabsTrigger>
              <TabsTrigger value="posicao" className="flex-1">Posição</TabsTrigger>
            </TabsList>

            <TabsContent value="perfil" className="space-y-3 pt-3">
              {node.colaborador && (
                <>
                  <InfoRow icon={<Calendar className="h-4 w-4" />} label="Tempo de casa" value={formatTempoCasa(node.colaborador.data_admissao)} />
                  <InfoRow icon={<Mail className="h-4 w-4" />} label="E-mail" value={node.colaborador.email_corporativo || "—"} />
                  <InfoRow icon={<Phone className="h-4 w-4" />} label="Telefone" value={node.colaborador.telefone || "—"} />
                  <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Vínculo" value="CLT" />
                  {canSeeSalary && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground"><DollarSign className="h-4 w-4" /></span>
                      <span className="text-muted-foreground min-w-[100px]">Salário:</span>
                      <SalarioMasked valor={node.colaborador.salario_base} userId={(node.colaborador as any).user_id || null} contexto="organograma" />
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="w-full mt-3" onClick={() => navigate(`/colaboradores/${node.colaborador!.id}`)}>
                    Ver ficha completa
                  </Button>
                </>
              )}
              {node.contrato_pj && (
                <>
                  <InfoRow icon={<Mail className="h-4 w-4" />} label="E-mail" value={node.contrato_pj.contato_email || "—"} />
                  <InfoRow icon={<Phone className="h-4 w-4" />} label="Telefone" value={node.contrato_pj.contato_telefone || "—"} />
                  <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Vínculo" value="PJ" />
                  {canSeeSalary && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground"><DollarSign className="h-4 w-4" /></span>
                      <span className="text-muted-foreground min-w-[100px]">Valor mensal:</span>
                      <SalarioMasked valor={node.contrato_pj.valor_mensal} userId={(node.contrato_pj as any).user_id || null} contexto="organograma" />
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="w-full mt-3" onClick={() => navigate(`/contratos-pj/${node.contrato_pj!.id}`)}>
                    Ver contrato
                  </Button>
                </>
              )}
              {node.status !== "ocupado" && <p className="text-sm text-muted-foreground text-center py-4">Posição sem colaborador vinculado</p>}
            </TabsContent>

            <TabsContent value="equipe" className="space-y-3 pt-3">
              {parent && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Gestor Direto</p>
                  <MiniCard node={parent} />
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Subordinados Diretos ({node.subordinados_diretos})</p>
                {node.children.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum subordinado</p>
                ) : (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {node.children.map(c => <MiniCard key={c.id} node={c} />)}
                  </div>
                )}
              </div>
              <div className="border-t pt-2">
                <p className="text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5 inline mr-1" />
                  Total de subordinados (diretos + indiretos): <strong>{node.subordinados_totais}</strong>
                </p>
              </div>
            </TabsContent>

            <TabsContent value="posicao" className="space-y-3 pt-3">
              <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Cargo" value={node.titulo_cargo} />
              <InfoRow label="Nível" value={`${node.nivel_hierarquico}`} />
              <InfoRow label="Departamento" value={node.departamento} />
              {node.area && <InfoRow label="Área" value={node.area} />}
              {node.filial && <InfoRow label="Filial" value={node.filial} />}
              {node.centro_custo && <InfoRow label="Centro de custo" value={node.centro_custo} />}
              {canSeeSalary && node.salario_previsto && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground"><DollarSign className="h-4 w-4" /></span>
                  <span className="text-muted-foreground min-w-[100px]">Salário previsto:</span>
                  <SalarioMasked
                    valor={node.salario_previsto}
                    userId={(node.colaborador as any)?.user_id || (node.contrato_pj as any)?.user_id || null}
                    contexto="organograma"
                  />
                </div>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Link Subordinate Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={(o) => { if (!o) { setLinkDialogOpen(false); setLinkSearch(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular Subordinado</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Selecione uma pessoa ou posição para vincular como subordinado de <strong>{node.nome_display || node.titulo_cargo}</strong>
            </p>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, cargo ou departamento..."
              className="pl-9"
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              autoFocus
            />
          </div>

          <ScrollArea className="h-[300px] -mx-2 px-2">
            {filteredLinkNodes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum resultado encontrado</p>
            ) : (
              <div className="space-y-1">
                {filteredLinkNodes.map(n => (
                  <button
                    key={n.id}
                    className="flex items-center gap-2.5 p-2.5 rounded-md border w-full text-left hover:bg-accent/50 transition-colors disabled:opacity-50"
                    onClick={() => handleLinkSubordinate(n)}
                    disabled={moveMutation.isPending}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      {n.nome_display && (
                        <AvatarImage src={n.foto_url || undefined} className="object-cover" />
                      )}
                      <AvatarFallback className="text-[10px]">{n.nome_display ? getInitials(n.nome_display) : "?"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{n.nome_display || "Posição Vazia"}</p>
                      <p className="text-xs text-muted-foreground truncate">{n.titulo_cargo} · {n.departamento}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {n.vinculo && <Badge variant="outline" className="text-[9px] h-4">{n.vinculo}</Badge>}
                      {n.id_pai && <Badge variant="outline" className="text-[9px] h-4 text-muted-foreground">vinculado</Badge>}
                      {!n.id_pai && <Badge variant="outline" className="text-[9px] h-4 border-dashed text-warning">solto</Badge>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setLinkDialogOpen(false); setLinkSearch(""); }}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-muted-foreground min-w-[100px]">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function MiniCard({ node }: { node: PosicaoNode }) {
  const avatarUrl = node.foto_url || null;
  return (
    <div className="flex items-center gap-2 p-2 rounded-md border hover:bg-accent/50 cursor-pointer transition-colors">
      <Avatar className="h-7 w-7">
        {avatarUrl && <AvatarImage src={avatarUrl} className="object-cover" />}
        <AvatarFallback className="text-[10px]">{node.nome_display ? getInitials(node.nome_display) : "?"}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{node.nome_display || "Vaga"}</p>
        <p className="text-[10px] text-muted-foreground truncate">{node.titulo_cargo}</p>
      </div>
      {node.vinculo && <Badge variant="outline" className="text-[9px] h-4">{node.vinculo}</Badge>}
    </div>
  );
}
