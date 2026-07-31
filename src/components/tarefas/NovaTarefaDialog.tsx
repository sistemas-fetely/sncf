import { useEffect, useState } from "react";
import { Loader2, Plus, Check, ChevronsUpDown, UserPlus } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useRegistrarHistorico } from "@/hooks/useTarefaHistorico";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errorMessages";
import { cn } from "@/lib/utils";

interface PessoaOption {
  user_id: string;
  nome: string;
  cargo: string | null;
}

interface ColaboradorOption {
  id: string;
  tipo: "clt" | "pj";
  nome: string;
  departamento: string | null;
}

interface TarefaParaEditar {
  id: string;
  titulo: string;
  descricao: string | null;
  prazo_dias: number;
  prioridade: "urgente" | "normal" | "baixa";
  responsavel_user_id: string | null;
  colaborador_id: string | null;
  colaborador_tipo: "clt" | "pj" | null;
  colaborador_nome: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCriada?: () => void;
  /** Se passado, abre em modo edição dessa tarefa */
  tarefaParaEditar?: TarefaParaEditar;
  /** Pré-seleciona o responsável (ex: ao criar a partir do card de um colaborador) */
  responsavelInicial?: { user_id: string; nome: string };
}

export function NovaTarefaDialog({ open, onOpenChange, onCriada, tarefaParaEditar, responsavelInicial }: Props) {
  const { user } = useAuth();
  const { isSuperAdmin, isAdminRH } = usePermissions();
  const { registrar } = useRegistrarHistorico();

  const isEdicao = !!tarefaParaEditar;

  // Nível de permissão pra atribuição
  const [meuNivel, setMeuNivel] = useState<"admin" | "gestor" | "colaborador">("colaborador");

  // Campos do formulário
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prazoDias, setPrazoDias] = useState(7);
  const [prioridade, setPrioridade] = useState<"urgente" | "normal" | "baixa">("normal");
  const [responsavelUserId, setResponsavelUserId] = useState("");
  const [colaboradorRelacionadoId, setColaboradorRelacionadoId] = useState("");

  // Listas de autocomplete
  const [pessoasDisponiveis, setPessoasDisponiveis] = useState<PessoaOption[]>([]);
  const [colaboradoresRelacionados, setColaboradoresRelacionados] = useState<ColaboradorOption[]>([]);

  // Estado UI
  const [salvando, setSalvando] = useState(false);
  const [responsavelPopoverOpen, setResponsavelPopoverOpen] = useState(false);
  const [colaboradorPopoverOpen, setColaboradorPopoverOpen] = useState(false);

  // Modo "delegação": quando true, expande autocomplete pra atribuir a outra pessoa.
  // Default: false — dialog inicia em "criar pra mim".
  // Exceção: se veio com responsavelInicial (fluxo /tarefas/time), já trata como delegação.
  const [modoDelegacao, setModoDelegacao] = useState(false);

  // Reset ao fechar
  useEffect(() => {
    if (!open) setModoDelegacao(false);
  }, [open]);

  // ═══ Determinar nível do usuário ═══
  useEffect(() => {
    if (!user) return;

    if (isSuperAdmin || isAdminRH) {
      setMeuNivel("admin");
      return;
    }

    void (async () => {
      // profile próprio
      const { data: meuProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!meuProfile?.id) {
        setMeuNivel("colaborador");
        return;
      }

      // É gestor se alguém aponta pra ele em colaboradores_clt.gestor_direto_id
      const { count } = await supabase
        .from("colaboradores_clt")
        .select("id", { count: "exact", head: true })
        .eq("gestor_direto_id", meuProfile.id);

      setMeuNivel((count || 0) > 0 ? "gestor" : "colaborador");
    })();
  }, [user, isSuperAdmin, isAdminRH]);

  // ═══ Carregar pessoas disponíveis como responsável ═══
  useEffect(() => {
    if (!open || !user) return;

    // Só carrega lista completa se o usuário expandiu OU se veio pré-preenchido
    const precisaCarregarLista = modoDelegacao || !!responsavelInicial;

    void (async () => {
      let pessoas: PessoaOption[] = [];

      // Próprio profile (sempre busca pra ter user_id)
      const { data: meuProfile } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, position")
        .eq("user_id", user.id)
        .maybeSingle();

      if (meuProfile?.user_id) {
        pessoas.push({
          user_id: meuProfile.user_id,
          nome: `${meuProfile.full_name || "Você"} (você)`,
          cargo: meuProfile.position,
        });

        // Default: pré-selecionado tem prioridade; senão o próprio (apenas em criação)
        if (!isEdicao) {
          if (responsavelInicial?.user_id) {
            setResponsavelUserId(responsavelInicial.user_id);
          } else {
            setResponsavelUserId(meuProfile.user_id);
          }
        }
      }

      if (!precisaCarregarLista) {
        // Modo "pra mim" — só o próprio usuário na lista
        setPessoasDisponiveis(pessoas);
        return;
      }

      if (meuNivel === "admin") {
        const { data: todos } = await supabase
          .from("profiles")
          .select("user_id, full_name, position")
          .not("user_id", "is", null)
          .neq("user_id", user.id)
          .order("full_name");

        pessoas = [
          ...pessoas,
          ...(todos || []).map((p: any) => ({
            user_id: p.user_id,
            nome: p.full_name || "(sem nome)",
            cargo: p.position,
          })),
        ];
      } else if (meuNivel === "gestor" && meuProfile?.id) {
        // Liderados: colaboradores_clt onde gestor_direto_id = meu profile.id
        const { data: liderados } = await supabase
          .from("colaboradores_clt")
          .select("user_id, nome_completo, cargo")
          .eq("gestor_direto_id", meuProfile.id)
          .not("user_id", "is", null)
          .order("nome_completo");

        pessoas = [
          ...pessoas,
          ...(liderados || []).map((l: any) => ({
            user_id: l.user_id,
            nome: l.nome_completo,
            cargo: l.cargo,
          })),
        ];
      }

      setPessoasDisponiveis(pessoas);
    })();
  }, [open, user, meuNivel, isEdicao, responsavelInicial, modoDelegacao]);

  // ═══ Carregar colaboradores (CLT + PJ) ═══
  useEffect(() => {
    if (!open) return;

    void (async () => {
      const [cltRes, pjRes] = await Promise.all([
        supabase.from("colaboradores_clt")
          .select("id, nome_completo, departamento")
          .eq("status", "ativo")
          .order("nome_completo"),
        supabase.from("contratos_pj")
          .select("id, contato_nome, departamento")
          .eq("status", "ativo")
          .eq("categoria_pj", "colaborador")
          .order("contato_nome"),
      ]);

      const colabs: ColaboradorOption[] = [
        ...(cltRes.data || []).map((c: any) => ({
          id: c.id,
          tipo: "clt" as const,
          nome: c.nome_completo,
          departamento: c.departamento,
        })),
        ...(pjRes.data || []).map((p: any) => ({
          id: p.id,
          tipo: "pj" as const,
          nome: p.contato_nome,
          departamento: p.departamento,
        })),
      ].sort((a, b) => a.nome.localeCompare(b.nome));

      setColaboradoresRelacionados(colabs);
    })();
  }, [open]);

  // ═══ Preencher campos ao editar ═══
  useEffect(() => {
    if (!open) return;

    if (tarefaParaEditar) {
      setTitulo(tarefaParaEditar.titulo);
      setDescricao(tarefaParaEditar.descricao || "");
      setPrazoDias(tarefaParaEditar.prazo_dias || 7);
      setPrioridade(tarefaParaEditar.prioridade);
      setResponsavelUserId(tarefaParaEditar.responsavel_user_id || "");
      setColaboradorRelacionadoId(tarefaParaEditar.colaborador_id || "");
    } else {
      setTitulo("");
      setDescricao("");
      setPrazoDias(7);
      setPrioridade("normal");
      setColaboradorRelacionadoId("");
    }
  }, [open, tarefaParaEditar]);

  // ═══ Submit ═══
  const handleSubmit = async () => {
    if (!user) return;
    if (!titulo.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    if (titulo.trim().length < 3) {
      toast.error("Título muito curto (mínimo 3 caracteres)");
      return;
    }
    if (!responsavelUserId) {
      toast.error("Selecione um responsável");
      return;
    }

    setSalvando(true);
    try {
      const colabRelacionado = colaboradorRelacionadoId
        ? colaboradoresRelacionados.find((c) => c.id === colaboradorRelacionadoId)
        : null;

      if (isEdicao && tarefaParaEditar) {
        // Edição: não muda responsável
        const { error } = await supabase
          .from("sncf_tarefas")
          .update({
            titulo: titulo.trim(),
            descricao: descricao.trim() || null,
            prazo_dias: prazoDias,
            prioridade,
            colaborador_id: colabRelacionado?.id || null,
            colaborador_tipo: colabRelacionado?.tipo || null,
            colaborador_nome: colabRelacionado?.nome || null,
          })
          .eq("id", tarefaParaEditar.id);

        if (error) throw error;
        await registrar(tarefaParaEditar.id, "edicao", "Editou os dados da tarefa");
        toast.success("Tarefa atualizada");
      } else {
        // Criação via RPC criar_tarefa — o banco valida e deriva o que falta
        const args: Record<string, unknown> = {
          p_titulo: titulo.trim(),
          p_tipo_processo: "manual",
          p_sistema_origem: "manual",
          p_descricao: descricao.trim() || undefined,
          p_responsavel_user_id: responsavelUserId,
          p_prioridade: prioridade,
        };

        // Só manda prazo quando o usuário informou — senão o banco deriva da dimensão
        if (prazoDias && prazoDias > 0) {
          const prazoData = new Date();
          prazoData.setDate(prazoData.getDate() + prazoDias);
          args.p_prazo_data = prazoData.toISOString().slice(0, 10);
        }

        const { data: novoId, error } = await supabase.rpc("criar_tarefa", args as never);

        if (error) {
          toast.error("Erro ao criar tarefa: " + error.message);
          setSalvando(false);
          return;
        }

        // Vínculo com colaborador relacionado não é coberto pela RPC
        if (novoId && colabRelacionado) {
          const { error: errVinculo } = await supabase
            .from("sncf_tarefas")
            .update({
              colaborador_id: colabRelacionado.id,
              colaborador_tipo: colabRelacionado.tipo,
              colaborador_nome: colabRelacionado.nome,
            })
            .eq("id", novoId as string);
          if (errVinculo) {
            toast.error("Tarefa criada, mas o vínculo com o colaborador falhou: " + errVinculo.message);
          }
        }

        // Histórico de criação é gravado pelo gatilho trg_tarefa_historico
        toast.success("Tarefa criada");
      }

      onOpenChange(false);
      onCriada?.();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar tarefa");
    } finally {
      setSalvando(false);
    }
  };

  const responsavelSelecionado = pessoasDisponiveis.find((p) => p.user_id === responsavelUserId);
  const colaboradorSelecionado = colaboradoresRelacionados.find((c) => c.id === colaboradorRelacionadoId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdicao ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          <DialogDescription>
            {isEdicao
              ? "Atualize os dados da sua tarefa manual."
              : "Crie uma tarefa avulsa. Ela vai aparecer no seu inbox."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Título */}
          <div className="space-y-2">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Preparar apresentação do cliente X"
              maxLength={200}
            />
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição (opcional)</Label>
            <Textarea
              id="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Contexto, detalhes, links..."
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Prazo + Prioridade */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="prazo">Prazo (dias)</Label>
              <Input
                id="prazo"
                type="number"
                min={0}
                max={365}
                value={prazoDias}
                onChange={(e) => setPrazoDias(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prioridade">Prioridade</Label>
              <Select value={prioridade} onValueChange={(v: any) => setPrioridade(v)}>
                <SelectTrigger id="prioridade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">🟢 Baixa</SelectItem>
                  <SelectItem value="normal">🟡 Normal</SelectItem>
                  <SelectItem value="urgente">🔴 Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Responsável (só em modo criação) */}
          {!isEdicao && (
            <div className="space-y-2">
              {/* Modo "pra mim" — gestor/admin: card discreto + atalho pra delegar */}
              {!modoDelegacao && !responsavelInicial && meuNivel !== "colaborador" && (
                <div className="rounded-md border border-dashed bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground leading-tight">
                    Essa tarefa será criada{" "}
                    <span className="font-medium text-foreground">pra você</span>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setModoDelegacao(true)}
                    className="text-xs text-primary hover:underline mt-1.5 inline-flex items-center gap-1"
                  >
                    <UserPlus className="h-3 w-3" />
                    Atribuir a outra pessoa
                  </button>
                </div>
              )}

              {/* Modo "pra mim" — colaborador puro: explicação sem link */}
              {!modoDelegacao && !responsavelInicial && meuNivel === "colaborador" && (
                <div className="rounded-md border border-dashed bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground leading-tight">
                    Essa tarefa será criada{" "}
                    <span className="font-medium text-foreground">pra você</span>.
                  </p>
                  <p className="text-[10px] text-muted-foreground/80 mt-1">
                    Para atribuir a outra pessoa, fale com seu gestor.
                  </p>
                </div>
              )}

              {/* Modo delegação OU veio pré-preenchido: autocomplete completo */}
              {(modoDelegacao || responsavelInicial) && (
                <>
                  <div className="flex items-center justify-between">
                    <Label>Responsável *</Label>
                    {modoDelegacao && !responsavelInicial && (
                      <button
                        type="button"
                        onClick={() => {
                          setModoDelegacao(false);
                          const me = pessoasDisponiveis.find((p) => p.nome.includes("(você)"));
                          if (me) setResponsavelUserId(me.user_id);
                        }}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        ← criar pra mim
                      </button>
                    )}
                  </div>

                  <Popover open={responsavelPopoverOpen} onOpenChange={setResponsavelPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                      >
                        {responsavelSelecionado ? (
                          <span className="truncate">
                            {responsavelSelecionado.nome}
                            {responsavelSelecionado.cargo && (
                              <span className="text-muted-foreground ml-1">
                                · {responsavelSelecionado.cargo}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Selecione...</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput placeholder="Buscar pessoa..." />
                        <CommandList>
                          <CommandEmpty>Ninguém encontrado.</CommandEmpty>
                          <CommandGroup>
                            {pessoasDisponiveis.map((p) => (
                              <CommandItem
                                key={p.user_id}
                                value={p.nome}
                                onSelect={() => {
                                  setResponsavelUserId(p.user_id);
                                  setResponsavelPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    responsavelUserId === p.user_id ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                <span className="flex-1 truncate">
                                  {p.nome}
                                  {p.cargo && (
                                    <span className="text-muted-foreground text-xs ml-1">
                                      · {p.cargo}
                                    </span>
                                  )}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  {meuNivel === "gestor" && (
                    <p className="text-[10px] text-muted-foreground">
                      Você pode atribuir tarefas a você mesmo ou aos liderados do seu time.
                    </p>
                  )}
                  {meuNivel === "admin" && (
                    <p className="text-[10px] text-muted-foreground">
                      Você pode atribuir tarefas a qualquer pessoa da empresa.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Colaborador relacionado (opcional) */}
          <div className="space-y-2">
            <Label>Tarefa relacionada a (opcional)</Label>
            <Popover open={colaboradorPopoverOpen} onOpenChange={setColaboradorPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  {colaboradorSelecionado ? (
                    <span className="truncate">
                      {colaboradorSelecionado.nome}
                      <span className="text-muted-foreground ml-1 text-xs">
                        · {colaboradorSelecionado.tipo.toUpperCase()}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Nenhum — tarefa avulsa</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Buscar colaborador..." />
                  <CommandList>
                    <CommandEmpty>Nenhum encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__nenhum__"
                        onSelect={() => {
                          setColaboradorRelacionadoId("");
                          setColaboradorPopoverOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            !colaboradorRelacionadoId ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="italic text-muted-foreground">
                          Nenhum — tarefa avulsa
                        </span>
                      </CommandItem>
                      {colaboradoresRelacionados.map((c) => (
                        <CommandItem
                          key={`${c.tipo}-${c.id}`}
                          value={c.nome}
                          onSelect={() => {
                            setColaboradorRelacionadoId(c.id);
                            setColaboradorPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              colaboradorRelacionadoId === c.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="flex-1 truncate">
                            {c.nome}
                            <span className="text-[10px] text-muted-foreground ml-1">
                              {c.tipo.toUpperCase()} · {c.departamento || "—"}
                            </span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={salvando} className="gap-2">
            {salvando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
              </>
            ) : isEdicao ? (
              "Salvar alterações"
            ) : (
              <>
                <Plus className="h-4 w-4" /> Criar tarefa
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
