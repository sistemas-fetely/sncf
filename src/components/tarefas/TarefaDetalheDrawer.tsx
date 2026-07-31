import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";
import {
  Plus, ArrowRight, MessageSquare, UserPlus, CheckCircle, RotateCcw,
  Pencil, Send, Loader2, Calendar, User, Building2, Flag, Play, PauseCircle,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useTarefaHistorico, useRegistrarHistorico, type HistoricoEntry } from "@/hooks/useTarefaHistorico";
import { cn } from "@/lib/utils";

export interface TarefaDrawer {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  prioridade: string;
  area_destino: string | null;
  prazo_data: string | null;
  responsavel_user_id: string | null;
  accountable_user_id: string | null;
  colaborador_nome: string | null;
  tipo_processo: string;
  sistema_origem: string;
  criado_por: string | null;
  created_at: string;
  delegado_de_user_id?: string | null;
  delegado_por_user_id?: string | null;
  delegado_em?: string | null;
  esta_aberta?: boolean | null;
  esta_atrasada?: boolean | null;
  dias_atraso?: number | null;
  dias_restantes?: number | null;
}

interface Props {
  tarefa: TarefaDrawer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAtualizada?: () => void;
  /** Se true, usuário não pode editar/concluir — só visualiza e pode delegar */
  readonly?: boolean;
}

interface PessoaSubordinada {
  user_id: string;
  nome: string;
  cargo: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  aguardando_terceiro: "Aguardando terceiro",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  pendente: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  em_andamento: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  aguardando_terceiro: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  concluida: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  cancelada: "bg-muted text-muted-foreground border-border",
};

const TIPO_ICON: Record<string, { Icon: typeof Plus; cls: string }> = {
  criacao: { Icon: Plus, cls: "text-muted-foreground bg-muted" },
  status_change: { Icon: ArrowRight, cls: "text-blue-600 bg-blue-500/10" },
  comentario: { Icon: MessageSquare, cls: "text-emerald-700 bg-emerald-500/10" },
  delegacao: { Icon: UserPlus, cls: "text-purple-600 bg-purple-500/10" },
  conclusao: { Icon: CheckCircle, cls: "text-emerald-600 bg-emerald-500/10" },
  reativacao: { Icon: RotateCcw, cls: "text-amber-600 bg-amber-500/10" },
  edicao: { Icon: Pencil, cls: "text-muted-foreground bg-muted" },
};

function dataRelativa(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h atrás`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} dia(s) atrás`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function TimelineItem({ entry, isLast }: { entry: HistoricoEntry; isLast: boolean }) {
  const cfg = TIPO_ICON[entry.tipo] ?? TIPO_ICON.criacao;
  const { Icon, cls } = cfg;
  return (
    <div className="relative flex gap-3 pb-4">
      {!isLast && (
        <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
      )}
      <div className={cn("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", cls)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 pt-0.5 min-w-0">
        <p className="text-[13px] leading-snug">{entry.descricao}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {entry.user_nome} · {dataRelativa(entry.created_at)}
        </p>
      </div>
    </div>
  );
}

export function TarefaDetalheDrawer({ tarefa, open, onOpenChange, onAtualizada, readonly = false }: Props) {
  const { user, roles } = useAuth();
  const { historico, loading: loadingHist, recarregar } = useTarefaHistorico(tarefa?.id ?? null);
  const { registrar } = useRegistrarHistorico();

  const [comentario, setComentario] = useState("");
  const [salvandoComentario, setSalvandoComentario] = useState(false);
  const [executandoAcao, setExecutandoAcao] = useState(false);
  const [delegarOpen, setDelegarOpen] = useState(false);
  const [subordinados, setSubordinados] = useState<PessoaSubordinada[]>([]);
  const [carregandoSubs, setCarregandoSubs] = useState(false);

  const podeDelegar = useMemo(
    () => roles?.some((r) => ["gestor_direto", "admin_rh", "super_admin", "gestor_rh"].includes(r)) ?? false,
    [roles],
  );
  const isDono = tarefa?.responsavel_user_id === user?.id;
  const podeAgir = !readonly && isDono && tarefa?.status !== "concluida" && tarefa?.status !== "cancelada";

  // Reset quando troca de tarefa
  useEffect(() => {
    if (open) setComentario("");
  }, [open, tarefa?.id]);

  // Carregar subordinados quando abre o popover de delegação
  useEffect(() => {
    if (!delegarOpen || !user) return;
    void (async () => {
      setCarregandoSubs(true);
      const isAdminAmplo = roles?.some((r) => ["super_admin", "admin_rh"].includes(r));
      const { data: meuProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      let query = supabase
        .from("colaboradores_clt")
        .select("user_id, nome_completo, cargo")
        .eq("status", "ativo")
        .not("user_id", "is", null);
      if (!isAdminAmplo && meuProfile?.id) {
        query = query.eq("gestor_direto_id", meuProfile.id);
      }
      const { data } = await query.order("nome_completo");
      setSubordinados(
        (data ?? [])
          .filter((c) => c.user_id && c.user_id !== tarefa?.responsavel_user_id)
          .map((c) => ({
            user_id: c.user_id as string,
            nome: c.nome_completo,
            cargo: c.cargo ?? null,
          })),
      );
      setCarregandoSubs(false);
    })();
  }, [delegarOpen, user, roles, tarefa?.responsavel_user_id]);

  if (!tarefa) return null;

  const handleAcaoStatus = async (
    novoStatus: string,
    descricao: string,
    opts: { evidenciaTexto?: string | null; evidenciaUrl?: string | null; motivo?: string } = {},
  ) => {
    setExecutandoAcao(true);
    let error: unknown = null;
    if (novoStatus === "concluida") {
      ({ error } = await supabase.rpc("concluir_tarefa", {
        p_tarefa_id: tarefa.id,
        p_evidencia_texto: opts.evidenciaTexto ?? null,
        p_evidencia_url: opts.evidenciaUrl ?? null,
      }));
    } else if (novoStatus === "cancelada") {
      ({ error } = await supabase.rpc("cancelar_tarefa", {
        p_tarefa_id: tarefa.id,
        p_motivo: opts.motivo ?? "",
      }));
    } else {
      ({ error } = await supabase.rpc("transicionar_tarefa", {
        p_tarefa_id: tarefa.id,
        p_novo_status: novoStatus,
      }));
    }
    if (error) {
      toast.error("Erro: " + formatError(error));
      setExecutandoAcao(false);
      return;
    }
    // Histórico de status_change é gravado pelo gatilho trg_tarefa_historico
    toast.success(descricao);
    void recarregar();
    onAtualizada?.();
    setExecutandoAcao(false);
  };

  const handleIniciar = () => handleAcaoStatus("em_andamento", "Iniciou a tarefa");
  const handleAguardando = () => handleAcaoStatus("aguardando_terceiro", "Moveu para aguardando terceiro");
  const handleRetomar = () => handleAcaoStatus("em_andamento", "Retomou a tarefa");

  const handleComentar = async () => {
    if (!comentario.trim()) return;
    setSalvandoComentario(true);
    await registrar(tarefa.id, "comentario", comentario.trim());
    toast.success("Comentário registrado");
    setComentario("");
    void recarregar();
    setSalvandoComentario(false);
  };

  const handleDelegar = async (novoUserId: string, nomeNovo: string) => {
    setExecutandoAcao(true);
    setDelegarOpen(false);
    const { error } = await supabase.rpc("delegar_tarefa", {
      p_tarefa_id: tarefa.id,
      p_para_user_id: novoUserId,
    });
    if (error) {
      toast.error("Erro ao delegar: " + error.message);
      setExecutandoAcao(false);
      return;
    }
    // Histórico de delegação é gravado pelo gatilho trg_tarefa_historico
    toast.success(`Tarefa delegada para ${nomeNovo}`);
    void recarregar();
    onAtualizada?.();
    setExecutandoAcao(false);
  };

  const diasRestantes = tarefa.dias_restantes ?? null;
  const diasAtraso = tarefa.dias_atraso ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto p-0">
        <div className="px-6 pt-6 pb-4">
          <SheetHeader className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={STATUS_BADGE_CLASS[tarefa.status] ?? ""}>
                {STATUS_LABEL[tarefa.status] ?? tarefa.status}
              </Badge>
              {tarefa.esta_atrasada && (
                <Badge variant="destructive" className="gap-1">
                  Atrasada{diasAtraso > 0 ? ` há ${diasAtraso} dia(s)` : ""}
                </Badge>
              )}
              {tarefa.prioridade === "urgente" && (
                <Badge variant="destructive" className="gap-1">
                  <Flag className="h-3 w-3" /> Urgente
                </Badge>
              )}
              {tarefa.prioridade === "alta" && (
                <Badge className="bg-orange-500 hover:bg-orange-500/90 gap-1">
                  <Flag className="h-3 w-3" /> Alta
                </Badge>
              )}
            </div>
            <SheetTitle className="text-lg leading-snug text-left">{tarefa.titulo}</SheetTitle>
            {tarefa.descricao && (
              <SheetDescription className="text-left text-sm whitespace-pre-wrap">
                {tarefa.descricao}
              </SheetDescription>
            )}
          </SheetHeader>

          {/* Ações primárias */}
          {podeAgir && (
            <div className="flex flex-wrap gap-2 mt-4">
              {tarefa.status === "pendente" && (
                <Button size="sm" onClick={handleIniciar} disabled={executandoAcao} className="gap-1.5">
                  <Play className="h-3.5 w-3.5" /> Iniciar
                </Button>
              )}
              {tarefa.status === "em_andamento" && (
                <>
                  <Button size="sm" onClick={handleAguardando} disabled={executandoAcao}
                    variant="outline" className="gap-1.5 border-amber-500/40 text-amber-700 hover:bg-amber-500/10">
                    <PauseCircle className="h-3.5 w-3.5" /> Aguardando
                  </Button>
                </>
              )}
              {tarefa.status === "aguardando_terceiro" && (
                <Button size="sm" onClick={handleRetomar} disabled={executandoAcao} className="gap-1.5">
                  <Play className="h-3.5 w-3.5" /> Retomar
                </Button>
              )}
            </div>
          )}

          {/* Delegação (gestores) */}
          {!readonly && podeDelegar && tarefa.status !== "concluida" && tarefa.status !== "cancelada" && (
            <div className="mt-3">
              <Popover open={delegarOpen} onOpenChange={setDelegarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={executandoAcao}>
                    <UserPlus className="h-3.5 w-3.5" /> Delegar tarefa
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar pessoa..." />
                    <CommandList>
                      {carregandoSubs ? (
                        <div className="py-6 text-center">
                          <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                        </div>
                      ) : (
                        <>
                          <CommandEmpty>Nenhuma pessoa encontrada.</CommandEmpty>
                          <CommandGroup>
                            {subordinados.map((sub) => (
                              <CommandItem
                                key={sub.user_id}
                                value={sub.nome}
                                onSelect={() => handleDelegar(sub.user_id, sub.nome)}
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm">{sub.nome}</span>
                                  {sub.cargo && (
                                    <span className="text-[11px] text-muted-foreground">{sub.cargo}</span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        <Separator />

        {/* Informações */}
        <div className="px-6 py-4 space-y-2.5 text-sm">
          {tarefa.prazo_data && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                Prazo: {new Date(tarefa.prazo_data + "T00:00:00").toLocaleDateString("pt-BR")}
                {tarefa.esta_atrasada ? (
                  <span className="ml-1.5 text-destructive font-medium">
                    ({diasAtraso} dia(s) atrasada)
                  </span>
                ) : diasRestantes !== null ? (
                  <span className="ml-1.5">
                    ({diasRestantes === 0 ? "hoje" : `em ${diasRestantes} dia(s)`})
                  </span>
                ) : null}
              </span>
            </div>
          )}
          {tarefa.area_destino && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              <span>Área: <span className="text-foreground">{tarefa.area_destino}</span></span>
            </div>
          )}
          {tarefa.colaborador_nome && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              <span>Sobre: <span className="text-foreground">{tarefa.colaborador_nome}</span></span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-[11px] uppercase tracking-wide">Origem:</span>
            <Badge variant="outline" className="text-[10px]">
              {tarefa.sistema_origem === "people" ? "People" :
                tarefa.sistema_origem === "ti" ? "TI" :
                tarefa.sistema_origem === "manual" ? "Manual" : tarefa.sistema_origem}
            </Badge>
          </div>
          {tarefa.delegado_em && (
            <div className="flex items-center gap-2 text-muted-foreground italic text-[12px]">
              <UserPlus className="h-3 w-3" />
              <span>Delegada em {new Date(tarefa.delegado_em).toLocaleDateString("pt-BR")}</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Adicionar comentário */}
        {!readonly && (
          <div className="px-6 py-4 space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              Adicionar nota
            </p>
            <Textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Ex: Liguei pro fornecedor, retorno na sexta..."
              rows={3}
              className="resize-none text-sm"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleComentar}
                disabled={!comentario.trim() || salvandoComentario}
                className="gap-1.5"
              >
                {salvandoComentario ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Registrar
              </Button>
            </div>
          </div>
        )}

        <Separator />

        {/* Timeline */}
        <div className="px-6 py-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-3">
            Histórico
          </p>
          {loadingHist ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : historico.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">
              Sem atividades registradas ainda.
            </p>
          ) : (
            <div className="space-y-0">
              {historico.map((entry, idx) => (
                <TimelineItem key={entry.id} entry={entry} isLast={idx === historico.length - 1} />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
