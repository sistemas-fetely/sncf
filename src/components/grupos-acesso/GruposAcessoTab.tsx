import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UserPlus, Search, Trash2, Loader2, Shield, MapPin } from "lucide-react";
import { toast } from "sonner";
import { usePerfisV2 } from "@/hooks/usePerfisV2";
import { useUnidades } from "@/hooks/useUnidades";
import { NIVEL_LABELS_V2, type NivelHierarquico } from "@/types/permissoes-v2";
import { DrawerUsuario } from "@/components/DrawerUsuario";

type Perfil = {
  id: string;
  codigo: string;
  nome: string;
  tipo: "area" | "transversal";
  area: string | null;
  descricao: string | null;
};

type AtribuicaoExpandida = {
  id: string;
  user_id: string;
  perfil_id: string;
  unidade_id: string | null;
  nivel: NivelHierarquico | null;
  valido_ate: string | null;
  nome: string;
  email: string;
  unidade_nome: string | null;
};

const NIVEIS_ORDEM: NivelHierarquico[] = [
  "estagio", "assistente", "analista", "coordenador", "gerente", "diretor",
];

export function GruposAcessoTab() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);
  const [atribuicaoDialog, setAtribuicaoDialog] = useState<{ perfil: Perfil | null; open: boolean }>({
    perfil: null,
    open: false,
  });

  const { data: perfis, isLoading: loadingPerfis } = usePerfisV2();
  const { data: unidades } = useUnidades();

  const { data: atribuicoes, isLoading: loadingAtrib } = useQuery({
    queryKey: ["atribuicoes-com-users"],
    queryFn: async () => {
      // 1. Busca todas as atribuições (sem joins problemáticos)
      const { data: atribs, error: errAtrib } = await supabase
        .from("user_atribuicoes")
        .select("id, user_id, perfil_id, unidade_id, nivel, valido_ate");
      if (errAtrib) throw errAtrib;
      if (!atribs || atribs.length === 0) return [] as AtribuicaoExpandida[];

      // 2. Busca profiles dos usuários mencionados
      const userIds = [...new Set(atribs.map((a) => a.user_id))];
      const { data: profs, error: errProf } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      if (errProf) throw errProf;

      // 3. Busca unidades mencionadas
      const unidadeIds = [
        ...new Set(atribs.map((a) => a.unidade_id).filter(Boolean)),
      ] as string[];
      let unids: Array<{ id: string; nome: string }> = [];
      if (unidadeIds.length > 0) {
        const { data: u, error: errU } = await supabase
          .from("unidades")
          .select("id, nome")
          .in("id", unidadeIds);
        if (errU) throw errU;
        unids = u || [];
      }

      // 4. Merge no cliente
      const profMap = new Map((profs || []).map((p) => [p.user_id, p]));
      const unidMap = new Map(unids.map((u) => [u.id, u]));

      return atribs.map((a: any) => {
        const prof = profMap.get(a.user_id);
        const unid = a.unidade_id ? unidMap.get(a.unidade_id) : null;
        return {
          id: a.id,
          user_id: a.user_id,
          perfil_id: a.perfil_id,
          unidade_id: a.unidade_id,
          nivel: a.nivel as AtribuicaoExpandida["nivel"],
          valido_ate: a.valido_ate,
          nome: prof?.full_name || "Sem nome",
          email: "",
          unidade_nome: unid?.nome || null,
        } as AtribuicaoExpandida;
      });
    },
    staleTime: 30 * 1000,
  });

  const { data: todosUsuarios } = useQuery({
    queryKey: ["todos-usuarios-cadastro"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, department, position")
        .order("full_name");
      if (error) throw error;
      return (data || []).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name || "Sem nome",
        department: p.department,
        position: p.position,
      }));
    },
    staleTime: 60 * 1000,
  });

  const removerAtrib = useMutation({
    mutationFn: async (atribuicaoId: string) => {
      const { error } = await supabase.from("user_atribuicoes").delete().eq("id", atribuicaoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atribuição removida");
      queryClient.invalidateQueries({ queryKey: ["atribuicoes-com-users"] });
      queryClient.invalidateQueries({ queryKey: ["minhas-atribuicoes"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao remover"),
  });

  if (loadingPerfis || loadingAtrib) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const perfisFiltrados = (perfis || []).filter((p) =>
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (p.descricao || "").toLowerCase().includes(busca.toLowerCase())
  );
  const transversais = perfisFiltrados.filter((p) => p.tipo === "transversal");
  const areas = perfisFiltrados.filter((p) => p.tipo === "area");

  function atribuicoesPorPerfil(perfilId: string) {
    return (atribuicoes || []).filter((a) => a.perfil_id === perfilId);
  }

  function iniciais(nome: string) {
    return nome.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar perfil..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {(perfis || []).length} perfis · {(atribuicoes || []).length} atribuições
        </div>
      </div>

      {transversais.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Shield className="h-4 w-4" />
            Papéis transversais · sem unidade, sem nível
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {transversais.map((perfil) => {
              const pessoas = atribuicoesPorPerfil(perfil.id);
              return (
                <Card key={perfil.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-medium">{perfil.nome}</h3>
                        {perfil.descricao && (
                          <p className="text-xs text-muted-foreground mt-0.5">{perfil.descricao}</p>
                        )}
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {pessoas.length} {pessoas.length === 1 ? "pessoa" : "pessoas"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {pessoas.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Nenhuma pessoa atribuída ainda.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {pessoas.map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-2 group">
                            <button
                              onClick={() => setDrawerUserId(p.user_id)}
                              className="flex items-center gap-2 flex-1 text-left hover:text-primary transition-colors min-w-0"
                            >
                              <Avatar className="h-7 w-7 shrink-0">
                                <AvatarFallback className="text-xs">{iniciais(p.nome)}</AvatarFallback>
                              </Avatar>
                              <span className="text-sm truncate">{p.nome}</span>
                            </button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                              onClick={() => removerAtrib.mutate(p.id)}
                              disabled={removerAtrib.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setAtribuicaoDialog({ perfil, open: true })}
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                        Atribuir pessoa
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {areas.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <MapPin className="h-4 w-4" />
            Áreas · sempre com unidade e nível
          </div>
          <div className="grid grid-cols-1 gap-4">
            {areas.map((perfil) => {
              const pessoas = atribuicoesPorPerfil(perfil.id);
              const porUnidade = (unidades || [])
                .map((u) => ({
                  unidade: u,
                  pessoas: pessoas.filter((p) => p.unidade_id === u.id),
                }))
                .filter((x) => x.pessoas.length > 0);

              return (
                <Card key={perfil.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-medium">{perfil.nome}</h3>
                        {perfil.descricao && (
                          <p className="text-xs text-muted-foreground mt-0.5">{perfil.descricao}</p>
                        )}
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {pessoas.length} {pessoas.length === 1 ? "pessoa" : "pessoas"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {porUnidade.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Nenhuma pessoa atribuída ainda.</p>
                    ) : (
                      porUnidade.map(({ unidade, pessoas: pp }) => (
                        <div key={unidade.id} className="space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {unidade.nome}
                          </div>
                          <div className="space-y-2 pl-4 border-l-2 border-muted">
                            {NIVEIS_ORDEM.map((nivel) => {
                              const pessoasNivel = pp.filter((p) => p.nivel === nivel);
                              if (pessoasNivel.length === 0) return null;
                              return (
                                <div key={nivel} className="flex items-start gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-xs shrink-0">
                                    {NIVEL_LABELS_V2[nivel]}
                                  </Badge>
                                  <div className="flex flex-wrap gap-1.5">
                                    {pessoasNivel.map((p) => (
                                      <button
                                        key={p.id}
                                        onClick={() => setDrawerUserId(p.user_id)}
                                        className="flex items-center gap-1.5 px-2 py-0.5 bg-muted/50 hover:bg-muted rounded-full text-xs transition-colors group"
                                      >
                                        <Avatar className="h-4 w-4">
                                          <AvatarFallback className="text-[8px]">{iniciais(p.nome)}</AvatarFallback>
                                        </Avatar>
                                        <span>{p.nome}</span>
                                        <span
                                          role="button"
                                          tabIndex={0}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            removerAtrib.mutate(p.id);
                                          }}
                                          className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 ml-0.5 cursor-pointer"
                                        >
                                          ×
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAtribuicaoDialog({ perfil, open: true })}
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                        Atribuir pessoa a {perfil.nome}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <AtribuirDialog
        perfil={atribuicaoDialog.perfil}
        open={atribuicaoDialog.open}
        onOpenChange={(open) =>
          setAtribuicaoDialog({ perfil: open ? atribuicaoDialog.perfil : null, open })
        }
        unidades={unidades || []}
        todosUsuarios={todosUsuarios || []}
        atribuicoesExistentes={atribuicoes || []}
        onSucesso={() => {
          queryClient.invalidateQueries({ queryKey: ["atribuicoes-com-users"] });
          queryClient.invalidateQueries({ queryKey: ["minhas-atribuicoes"] });
        }}
      />

      <DrawerUsuario
        userId={drawerUserId}
        open={!!drawerUserId}
        onOpenChange={(open) => !open && setDrawerUserId(null)}
      />
    </div>
  );
}

interface AtribuirDialogProps {
  perfil: Perfil | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidades: Array<{ id: string; nome: string }>;
  todosUsuarios: Array<{
    user_id: string;
    full_name: string;
    department?: string | null;
    position?: string | null;
  }>;
  atribuicoesExistentes: AtribuicaoExpandida[];
  onSucesso: () => void;
}

function AtribuirDialog({
  perfil, open, onOpenChange, unidades, todosUsuarios, atribuicoesExistentes, onSucesso,
}: AtribuirDialogProps) {
  const [userId, setUserId] = useState("");
  const [unidadeId, setUnidadeId] = useState("");
  const [nivel, setNivel] = useState<string>("");
  const [salvando, setSalvando] = useState(false);

  const ehArea = perfil?.tipo === "area";

  const idsJaAtribuidos = new Set(
    atribuicoesExistentes
      .filter((a) => {
        if (!perfil) return false;
        if (perfil.tipo === "transversal") return a.perfil_id === perfil.id;
        // Área: considera duplicata se mesmo perfil + mesma unidade selecionada
        return a.perfil_id === perfil.id && a.unidade_id === unidadeId;
      })
      .map((a) => a.user_id)
  );

  async function salvar() {
    if (!perfil || !userId) return;
    if (ehArea && !unidadeId) {
      toast.error("Escolha uma unidade (Regra 19: escopo sempre explícito)");
      return;
    }
    if (ehArea && !nivel) {
      toast.error("Escolha o nível dentro da área");
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase.from("user_atribuicoes").insert({
        user_id: userId,
        perfil_id: perfil.id,
        unidade_id: ehArea ? unidadeId : null,
        nivel: ehArea ? (nivel as NivelHierarquico) : null,
      });
      if (error) throw error;
      toast.success("Atribuição criada");
      onSucesso();
      onOpenChange(false);
      setUserId("");
      setUnidadeId("");
      setNivel("");
    } catch (e: any) {
      const msg = e?.message || "";
      if (
        msg.includes("unique") ||
        msg.includes("duplicate") ||
        msg.includes("user_atribuicoes_user_id_perfil_id_unidade_id_key")
      ) {
        toast.error("Essa pessoa já tem esse perfil nesse contexto");
      } else if (msg.includes("Regra 19") || msg.includes("Escopo obrigatório")) {
        toast.error("Essa pessoa precisa ter unidade definida (Regra 19)");
      } else {
        toast.error(msg || "Erro ao atribuir");
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atribuir pessoa a {perfil?.nome}</DialogTitle>
          <DialogDescription>
            {ehArea
              ? "Perfil de área — escolha pessoa, unidade e nível."
              : "Perfil transversal — escolha apenas a pessoa."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Pessoa</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma pessoa..." />
              </SelectTrigger>
              <SelectContent>
                {todosUsuarios.map((u) => {
                  const jaTem = idsJaAtribuidos.has(u.user_id);
                  const subtitulo = [u.position, u.department].filter(Boolean).join(" · ");
                  return (
                    <SelectItem key={u.user_id} value={u.user_id} disabled={jaTem}>
                      <div className="flex flex-col items-start gap-0.5">
                        <div className="flex items-center gap-2">
                          <span>{u.full_name || "Sem nome"}</span>
                          {jaTem && (
                            <span className="text-[10px] text-muted-foreground italic">
                              (já atribuído)
                            </span>
                          )}
                        </div>
                        {subtitulo && (
                          <span className="text-xs text-muted-foreground">{subtitulo}</span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {ehArea && (
            <>
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Select value={unidadeId} onValueChange={setUnidadeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a unidade..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unidades.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nível</Label>
                <Select value={nivel} onValueChange={setNivel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o nível..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="estagio">Estágio</SelectItem>
                    <SelectItem value="assistente">Assistente</SelectItem>
                    <SelectItem value="analista">Analista</SelectItem>
                    <SelectItem value="coordenador">Coordenador</SelectItem>
                    <SelectItem value="gerente">Gerente</SelectItem>
                    <SelectItem value="diretor">Diretor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || !userId}>
            {salvando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Atribuir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default GruposAcessoTab;
