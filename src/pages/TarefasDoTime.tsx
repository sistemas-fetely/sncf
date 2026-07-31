import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Users, AlertTriangle, ChevronDown, ChevronUp, MoreVertical, CheckCircle2,
  ArrowLeftRight, Eye, Loader2, ShieldAlert, UserPlus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { NovaTarefaDialog } from "@/components/tarefas/NovaTarefaDialog";
import { BadgePredictor } from "@/components/tarefas/BadgePredictor";
import { TarefaDetalheDrawer, type TarefaDrawer } from "@/components/tarefas/TarefaDetalheDrawer";

interface Subordinado {
  id: string; // profile.id ou colaborador.id
  user_id: string | null;
  nome: string;
  cargo: string;
  departamento: string;
  tipo: "clt" | "pj";
  tarefas: TarefaTime[];
}

interface TarefaTime {
  id: string;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  area_destino: string | null;
  prazo_data: string | null;
  status: string;
  bloqueante: boolean | null;
  tipo_processo: string;
  responsavel_user_id: string | null;
  colaborador_id: string | null;
  colaborador_tipo: string | null;
  esta_aberta?: boolean | null;
  esta_atrasada?: boolean | null;
  dias_atraso?: number | null;
  dias_restantes?: number | null;
}

type Ordenacao = "sobrecarga" | "atraso" | "alfabetico";
type Filtro = "todos" | "ativas" | "atrasos" | "sobrecarga";

const SOBRECARGA_LIMITE = 10;

function initials(nome: string) {
  return nome.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function TarefasDoTime() {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subordinados, setSubordinados] = useState<Subordinado[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("sobrecarga");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [reatribuirTarefa, setReatribuirTarefa] = useState<TarefaTime | null>(null);
  const [novoResponsavel, setNovoResponsavel] = useState<string>("");
  const [criarTarefaPara, setCriarTarefaPara] = useState<{ user_id: string; nome: string } | null>(null);
  const [drawerTarefa, setDrawerTarefa] = useState<TarefaTime | null>(null);

  const isAdminAmplo = roles?.some((r) => ["super_admin", "admin_rh", "gestor_rh"].includes(r));
  const isGestorDireto = roles?.includes("gestor_direto" as never);
  const podeAcessar = isAdminAmplo || isGestorDireto;

  const carregar = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1) Pegar profile.id do usuário logado
      const { data: meuProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const meuProfileId = meuProfile?.id ?? null;

      // 2) Buscar subordinados (CLT + PJ)
      let cltQuery = supabase
        .from("colaboradores_clt")
        .select("id, user_id, nome_completo, cargo, departamento, gestor_direto_id")
        .eq("status", "ativo");
      let pjQuery = supabase
        .from("contratos_pj")
        .select("id, user_id, contato_nome, razao_social, departamento, gestor_direto_id")
        .eq("status", "ativo");

      // Se não é admin amplo, filtra apenas subordinados diretos
      if (!isAdminAmplo && meuProfileId) {
        cltQuery = cltQuery.eq("gestor_direto_id", meuProfileId);
        pjQuery = pjQuery.eq("gestor_direto_id", meuProfileId);
      }

      const [cltRes, pjRes] = await Promise.all([cltQuery, pjQuery]);

      const subs: Subordinado[] = [];
      (cltRes.data ?? []).forEach((c) => {
        subs.push({
          id: c.id,
          user_id: c.user_id,
          nome: c.nome_completo,
          cargo: c.cargo ?? "—",
          departamento: c.departamento ?? "—",
          tipo: "clt",
          tarefas: [],
        });
      });
      (pjRes.data ?? []).forEach((c) => {
        subs.push({
          id: c.id,
          user_id: c.user_id,
          nome: c.contato_nome || c.razao_social,
          cargo: "PJ",
          departamento: c.departamento ?? "—",
          tipo: "pj",
          tarefas: [],
        });
      });

      // 3) Buscar tarefas dos subordinados (somente quem tem user_id)
      const userIds = subs.map((s) => s.user_id).filter(Boolean) as string[];
      if (userIds.length > 0) {
        // Status "atrasada" é responsabilidade do job noturno tarefas-vencimento-diario


        const { data: tarefasData } = await supabase
          .from("vw_tarefas")
          .select("id, titulo, descricao, prioridade, area_destino, prazo_data, status, bloqueante, tipo_processo, responsavel_user_id, colaborador_id, colaborador_tipo, esta_aberta, esta_atrasada, dias_atraso, dias_restantes")
          .in("responsavel_user_id", userIds)
          .order("prazo_data", { ascending: true, nullsFirst: false });

        const porUser = new Map<string, TarefaTime[]>();
        (tarefasData ?? []).forEach((t) => {
          if (!t.responsavel_user_id) return;
          const arr = porUser.get(t.responsavel_user_id) ?? [];
          arr.push(t as TarefaTime);
          porUser.set(t.responsavel_user_id, arr);
        });

        subs.forEach((s) => {
          if (s.user_id) s.tarefas = porUser.get(s.user_id) ?? [];
        });
      }

      setSubordinados(subs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast.error("Erro ao carregar time: " + msg);
    } finally {
      setLoading(false);
    }
  }, [user, isAdminAmplo]);

  useEffect(() => {
    if (podeAcessar) void carregar();
    else setLoading(false);
  }, [podeAcessar, carregar]);

  const stats = (s: Subordinado) => {
    const ativas = s.tarefas.filter((t) => t.esta_aberta);
    const atrasadas = s.tarefas.filter((t) => t.esta_atrasada);
    const legaisAtrasadas = atrasadas.filter((t) => t.bloqueante);
    return { ativas, atrasadas, legaisAtrasadas };
  };

  const subordinadosVisiveis = useMemo(() => {
    let lista = [...subordinados];
    // Filtro
    lista = lista.filter((s) => {
      const { ativas, atrasadas } = stats(s);
      if (filtro === "ativas") return ativas.length > 0;
      if (filtro === "atrasos") return atrasadas.length > 0;
      if (filtro === "sobrecarga") return ativas.length > SOBRECARGA_LIMITE;
      return true;
    });
    // Ordenação
    lista.sort((a, b) => {
      const sa = stats(a);
      const sb = stats(b);
      if (ordenacao === "sobrecarga") return sb.ativas.length - sa.ativas.length;
      if (ordenacao === "atraso") {
        const diff = sb.atrasadas.length - sa.atrasadas.length;
        if (diff !== 0) return diff;
        return sb.ativas.length - sa.ativas.length;
      }
      return a.nome.localeCompare(b.nome);
    });
    return lista;
  }, [subordinados, ordenacao, filtro]);

  // KPIs globais
  const kpis = useMemo(() => {
    const totalSubs = subordinados.length;
    let ativas = 0, atrasadas = 0, legais = 0;
    subordinados.forEach((s) => {
      const st = stats(s);
      ativas += st.ativas.length;
      atrasadas += st.atrasadas.length;
      legais += st.legaisAtrasadas.length;
    });
    const media = totalSubs > 0 ? (ativas / totalSubs).toFixed(1) : "0";
    return { totalSubs, ativas, atrasadas, legais, media };
  }, [subordinados]);

  const handleConcluirRapido = async (t: TarefaTime) => {
    const { error } = await supabase.rpc("concluir_tarefa", {
      p_tarefa_id: t.id,
      p_evidencia_texto: "Concluída pelo gestor",
    });
    if (error) toast.error("Erro: " + error.message);
    else {
      toast.success("Tarefa concluída");
      void carregar();
    }
  };

  const handleReatribuir = (t: TarefaTime) => {
    setReatribuirTarefa(t);
    setNovoResponsavel("");
  };

  const confirmarReatribuir = async () => {
    if (!reatribuirTarefa || !novoResponsavel) return;
    const { error } = await supabase.rpc("delegar_tarefa", {
      p_tarefa_id: reatribuirTarefa.id,
      p_para_user_id: novoResponsavel,
      p_motivo: null,
    });
    if (error) toast.error("Erro: " + formatError(error));
    else {
      toast.success("Tarefa reatribuída");
      setReatribuirTarefa(null);
      void carregar();
    }
  };

  if (!podeAcessar) {
    return (
      <div className="container mx-auto py-12">
        <Card>
          <CardContent className="p-8 text-center">
            <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-lg font-semibold">Acesso restrito</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Apenas gestores diretos e administradores de RH podem acessar esta tela.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#1A4A3A" }}>
              Tarefas do Time
            </h1>
            <BadgePredictor tamanho="md" />
          </div>
          <p className="text-muted-foreground mt-1">Visão das tarefas dos seus subordinados</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{kpis.totalSubs}</p>
          <p className="text-xs text-muted-foreground">Subordinados</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{kpis.ativas}</p>
          <p className="text-xs text-muted-foreground">Tarefas ativas</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-destructive">{kpis.atrasadas}</p>
          <p className="text-xs text-muted-foreground">Atrasadas</p>
        </CardContent></Card>
        <Card className={kpis.legais > 0 ? "border-destructive bg-destructive/5" : ""}>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-destructive">{kpis.legais}</p>
            <p className="text-xs text-muted-foreground">Legais atrasadas</p>
          </CardContent>
        </Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{kpis.media}</p>
          <p className="text-xs text-muted-foreground">Média/pessoa</p>
        </CardContent></Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Mostrar</Label>
            <Select value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativas">Com tarefas ativas</SelectItem>
                <SelectItem value="atrasos">Com atrasos</SelectItem>
                <SelectItem value="sobrecarga">Sobrecarregados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Ordenar por</Label>
            <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as Ordenacao)}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sobrecarga">Mais sobrecarregados</SelectItem>
                <SelectItem value="atraso">Mais atrasados</SelectItem>
                <SelectItem value="alfabetico">Alfabético</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : subordinadosVisiveis.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum subordinado encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {subordinadosVisiveis.map((sub) => {
            const st = stats(sub);
            const sobrecarregado = st.ativas.length > SOBRECARGA_LIMITE;
            const visiveis = expanded[sub.id] ? st.ativas : st.ativas.slice(0, 3);

            return (
              <Card key={sub.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: "#1A4A3A" }}
                      >
                        {initials(sub.nome)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base">{sub.nome}</CardTitle>
                          {sub.user_id && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-xs font-medium border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50 hover:text-primary"
                              onClick={() =>
                                setCriarTarefaPara({ user_id: sub.user_id!, nome: sub.nome })
                              }
                              aria-label={`Criar tarefa para ${sub.nome}`}
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              <span>Tarefa</span>
                            </Button>
                          )}
                          <BadgePredictor />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {sub.cargo} · {sub.departamento}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{st.ativas.length} ativas</Badge>
                      {st.atrasadas.length > 0 && (
                        <Badge variant="destructive">{st.atrasadas.length} atrasadas</Badge>
                      )}
                      {st.legaisAtrasadas.length > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          ⚠ {st.legaisAtrasadas.length} legal
                        </Badge>
                      )}
                      {sobrecarregado && (
                        <Badge className="bg-amber-500 hover:bg-amber-500/90 gap-1">
                          <AlertTriangle className="h-3 w-3" /> Sobrecarga
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {st.ativas.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Nenhuma tarefa ativa</p>
                  ) : (
                    <div className="space-y-2">
                      {visiveis.map((tarefa) => (
                        <div
                          key={tarefa.id}
                          onClick={() => setDrawerTarefa(tarefa)}
                          className={cn(
                            "flex items-start gap-2 p-2.5 rounded-lg border text-sm cursor-pointer hover:bg-accent/40 transition-colors",
                            tarefa.esta_atrasada
                              ? "bg-destructive/5 border-destructive/30"
                              : tarefa.bloqueante
                              ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900"
                              : "bg-muted/30 border-border",
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{tarefa.titulo}</span>
                              {tarefa.bloqueante && (
                                <Badge variant="destructive" className="text-[10px]">⚠ Legal</Badge>
                              )}
                              {tarefa.status === "em_andamento" && (
                                <Badge className="text-[10px] bg-blue-500 hover:bg-blue-500/90">Em andamento</Badge>
                              )}
                              {tarefa.esta_atrasada && (
                                <Badge variant="destructive" className="text-[10px]">
                                  Atrasada{tarefa.dias_atraso ? ` há ${tarefa.dias_atraso}d` : ""}
                                </Badge>
                              )}
                              {tarefa.tipo_processo !== "manual" && (
                                <Badge variant="secondary" className="text-[10px]">{tarefa.tipo_processo}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                              {tarefa.area_destino && <Badge variant="outline" className="text-[10px]">{tarefa.area_destino}</Badge>}
                              <span>
                                Prazo: {tarefa.prazo_data ? new Date(tarefa.prazo_data + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                              </span>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => handleConcluirRapido(tarefa)} className="gap-2">
                                <CheckCircle2 className="h-4 w-4" /> Marcar concluída
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleReatribuir(tarefa)} className="gap-2">
                                <ArrowLeftRight className="h-4 w-4" /> Reatribuir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))}
                      {st.ativas.length > 3 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpanded((e) => ({ ...e, [sub.id]: !e[sub.id] }))}
                          className="text-xs gap-1"
                        >
                          {expanded[sub.id] ? (
                            <>
                              <ChevronUp className="h-3 w-3" /> Mostrar menos
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3" /> Ver mais {st.ativas.length - 3} tarefas
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog reatribuir */}
      <Dialog open={!!reatribuirTarefa} onOpenChange={(o) => !o && setReatribuirTarefa(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reatribuir tarefa</DialogTitle>
            <DialogDescription>
              Mover "{reatribuirTarefa?.titulo}" para outro membro do time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Novo responsável</Label>
            <Select value={novoResponsavel} onValueChange={setNovoResponsavel}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {subordinados
                  .filter((s) => s.user_id && s.user_id !== reatribuirTarefa?.responsavel_user_id)
                  .map((s) => (
                    <SelectItem key={s.user_id!} value={s.user_id!}>
                      {s.nome} ({s.cargo})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReatribuirTarefa(null)}>Cancelar</Button>
            <Button onClick={confirmarReatribuir} disabled={!novoResponsavel}>
              Reatribuir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog criar tarefa pré-preenchida com responsável */}
      {criarTarefaPara && (
        <NovaTarefaDialog
          open={!!criarTarefaPara}
          onOpenChange={(open) => !open && setCriarTarefaPara(null)}
          responsavelInicial={criarTarefaPara}
          onCriada={() => {
            setCriarTarefaPara(null);
            void carregar();
          }}
        />
      )}

      {/* Drawer de detalhe (gestor visualiza, sem editar/concluir) */}
      <TarefaDetalheDrawer
        tarefa={drawerTarefa as unknown as TarefaDrawer | null}
        open={!!drawerTarefa}
        onOpenChange={(open) => { if (!open) setDrawerTarefa(null); }}
        onAtualizada={() => void carregar()}
        readonly
      />
    </div>
  );
}
