import { useEffect, useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, MapPin, Loader2, AlertCircle, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { usePerfisV2 } from "@/hooks/usePerfisV2";
import { useUnidades } from "@/hooks/useUnidades";
import { NIVEL_LABELS_V2, type NivelHierarquico } from "@/types/permissoes-v2";
import { ReenviarLinkAcessoButton } from "@/components/auth/ReenviarLinkAcessoButton";

interface Props {
  userId: string | null;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSucesso?: () => void;
}

type EstadoArea = {
  marcado: boolean;
  nivel: NivelHierarquico | "";
  unidades: Set<string>;
};

export function HubDaPessoaDialog({
  userId,
  userName,
  open,
  onOpenChange,
  onSucesso,
}: Props) {
  const queryClient = useQueryClient();
  const { data: perfis } = usePerfisV2();
  const { data: unidades } = useUnidades();

  const { data: atribuicoesAtuais } = useQuery({
    queryKey: ["atribuicoes-do-user", userId],
    enabled: !!userId && open,
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("user_atribuicoes")
        .select("id, perfil_id, unidade_id, nivel")
        .eq("user_id", userId);
      if (error) throw error;
      return data || [];
    },
    staleTime: 0,
  });

  const { data: origensAtrib } = useQuery({
    queryKey: ["atribuicao-origem", userId],
    enabled: !!userId && open,
    queryFn: async () => {
      if (!userId) return [];
      const { data: atribs } = await supabase
        .from("user_atribuicoes")
        .select("id")
        .eq("user_id", userId);
      if (!atribs || atribs.length === 0) return [];
      const { data, error } = await supabase
        .from("atribuicao_origem")
        .select("atribuicao_id, template_id, origem")
        .in("atribuicao_id", atribs.map((a) => a.id));
      if (error) throw error;
      return data || [];
    },
  });

  const perfisDeTemplate = useMemo(() => {
    const perfilIds = new Set<string>();
    if (!atribuicoesAtuais || !origensAtrib) return perfilIds;
    const ids = new Set(
      origensAtrib
        .filter((o) => o.origem === "template")
        .map((o) => o.atribuicao_id)
    );
    for (const a of atribuicoesAtuais) {
      if (ids.has(a.id)) perfilIds.add(a.perfil_id);
    }
    return perfilIds;
  }, [atribuicoesAtuais, origensAtrib]);

  const transversais = useMemo(
    () => (perfis || []).filter((p) => p.tipo === "transversal"),
    [perfis]
  );
  const areas = useMemo(
    () => (perfis || []).filter((p) => p.tipo === "area"),
    [perfis]
  );

  const [marcadosTransv, setMarcadosTransv] = useState<Set<string>>(new Set());
  const [estadoAreas, setEstadoAreas] = useState<Record<string, EstadoArea>>({});

  useEffect(() => {
    if (!atribuicoesAtuais || !perfis) return;
    const transv = new Set<string>();
    const mapAreas: Record<string, EstadoArea> = {};
    for (const p of perfis) {
      if (p.tipo === "area") {
        mapAreas[p.id] = { marcado: false, nivel: "", unidades: new Set() };
      }
    }
    for (const a of atribuicoesAtuais) {
      const perfil = perfis.find((p) => p.id === a.perfil_id);
      if (!perfil) continue;
      if (perfil.tipo === "transversal") {
        transv.add(perfil.id);
      } else {
        const existing = mapAreas[perfil.id];
        if (existing) {
          existing.marcado = true;
          existing.nivel = (a.nivel as NivelHierarquico) || "";
          if (a.unidade_id) existing.unidades.add(a.unidade_id);
        }
      }
    }
    setMarcadosTransv(transv);
    setEstadoAreas(mapAreas);
  }, [atribuicoesAtuais, perfis]);

  function toggleTransversal(perfilId: string) {
    setMarcadosTransv((s) => {
      const n = new Set(s);
      if (n.has(perfilId)) n.delete(perfilId);
      else n.add(perfilId);
      return n;
    });
  }

  function toggleArea(perfilId: string) {
    setEstadoAreas((s) => ({
      ...s,
      [perfilId]: {
        marcado: !s[perfilId]?.marcado,
        nivel: s[perfilId]?.nivel || "",
        unidades: s[perfilId]?.unidades || new Set(),
      },
    }));
  }

  function setNivelArea(perfilId: string, nivel: NivelHierarquico) {
    setEstadoAreas((s) => ({
      ...s,
      [perfilId]: { ...s[perfilId], nivel },
    }));
  }

  function toggleUnidade(perfilId: string, unidadeId: string) {
    setEstadoAreas((s) => {
      const atual = s[perfilId];
      const novas = new Set(atual.unidades);
      if (novas.has(unidadeId)) novas.delete(unidadeId);
      else novas.add(unidadeId);
      return { ...s, [perfilId]: { ...atual, unidades: novas } };
    });
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Sem usuário");

      const desejado: {
        perfil_id: string;
        unidade_id: string | null;
        nivel: string | null;
      }[] = [];

      for (const pid of marcadosTransv) {
        desejado.push({ perfil_id: pid, unidade_id: null, nivel: null });
      }

      for (const perfil of areas) {
        const est = estadoAreas[perfil.id];
        if (!est?.marcado) continue;
        if (!est.nivel) {
          throw new Error(`Escolha um nível para ${perfil.nome}`);
        }
        if (est.unidades.size === 0) {
          throw new Error(`Escolha pelo menos uma unidade para ${perfil.nome}`);
        }
        for (const uid of est.unidades) {
          desejado.push({
            perfil_id: perfil.id,
            unidade_id: uid,
            nivel: est.nivel,
          });
        }
      }

      const { data: atuais, error: errAtual } = await supabase
        .from("user_atribuicoes")
        .select("id, perfil_id, unidade_id, nivel")
        .eq("user_id", userId);
      if (errAtual) throw errAtual;

      const chave = (p: string, u: string | null) => `${p}::${u || "null"}`;
      const atuaisMap = new Map(
        (atuais || []).map((a) => [chave(a.perfil_id, a.unidade_id), a])
      );
      const desejadoKeys = new Set(
        desejado.map((d) => chave(d.perfil_id, d.unidade_id))
      );

      const paraRemover = (atuais || []).filter(
        (a) => !desejadoKeys.has(chave(a.perfil_id, a.unidade_id))
      );
      const paraInserir: any[] = [];
      const paraAtualizar: { id: string; nivel: string | null }[] = [];

      for (const d of desejado) {
        const k = chave(d.perfil_id, d.unidade_id);
        const ja = atuaisMap.get(k);
        if (!ja) {
          paraInserir.push({ user_id: userId, ...d });
        } else if (ja.nivel !== d.nivel) {
          paraAtualizar.push({ id: ja.id, nivel: d.nivel });
        }
      }

      if (paraRemover.length > 0) {
        const { error } = await supabase
          .from("user_atribuicoes")
          .delete()
          .in(
            "id",
            paraRemover.map((a) => a.id)
          );
        if (error) throw error;
      }

      if (paraInserir.length > 0) {
        const { error } = await supabase
          .from("user_atribuicoes")
          .insert(paraInserir);
        if (error) throw error;
      }

      for (const a of paraAtualizar) {
        const { error } = await supabase
          .from("user_atribuicoes")
          .update({ nivel: a.nivel })
          .eq("id", a.id);
        if (error) throw error;
      }

      return {
        criadas: paraInserir.length,
        removidas: paraRemover.length,
        atualizadas: paraAtualizar.length,
      };
    },
    onSuccess: (r) => {
      const partes: string[] = [];
      if (r.criadas) partes.push(`${r.criadas} criada(s)`);
      if (r.removidas) partes.push(`${r.removidas} removida(s)`);
      if (r.atualizadas) partes.push(`${r.atualizadas} atualizada(s)`);
      toast.success(
        partes.length
          ? `Perfis atualizados: ${partes.join(", ")}`
          : "Nenhuma alteração"
      );
      queryClient.invalidateQueries({ queryKey: ["atribuicoes-com-users"] });
      queryClient.invalidateQueries({ queryKey: ["atribuicoes-todas-v2"] });
      queryClient.invalidateQueries({ queryKey: ["atribuicoes-do-user", userId] });
      queryClient.invalidateQueries({ queryKey: ["minhas-atribuicoes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      onOpenChange(false);
      onSucesso?.();
    },
    onError: (e: any) => {
      const msg = e?.message || "Erro ao salvar";
      if (msg.includes("Regra 19")) {
        toast.error("Perfil de área exige unidade (Regra 19 na Pedra)");
      } else if (msg.includes("unique") || msg.includes("duplicate")) {
        toast.error("Atribuição duplicada");
      } else {
        toast.error(msg);
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Perfis de {userName}
              </DialogTitle>
              <DialogDescription className="mt-1">
                Marque os papéis transversais e as áreas que essa pessoa exerce. Em
                áreas, escolha o nível e todas as unidades de uma vez.
              </DialogDescription>
            </div>
            {userId && (
              <ReenviarLinkAcessoButton userId={userId} nome={userName} variant="button" />
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-2 pr-1">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Papéis transversais
              </Label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {transversais.map((p) => {
                const marcado = marcadosTransv.has(p.id);
                return (
                  <Card
                    key={p.id}
                    onClick={() => toggleTransversal(p.id)}
                    className={`p-3 cursor-pointer transition-all ${
                      marcado
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={marcado}
                        onCheckedChange={() => toggleTransversal(p.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium leading-tight">
                            {p.nome}
                          </p>
                          {perfisDeTemplate.has(p.id) && (
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 px-1.5 h-4 gap-0.5 font-normal"
                            >
                              <ClipboardList className="h-2.5 w-2.5" />
                              do template
                            </Badge>
                          )}
                        </div>
                        {p.descricao && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                            {p.descricao}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
              {transversais.length === 0 && (
                <p className="text-xs text-muted-foreground col-span-2">
                  Nenhum papel transversal cadastrado.
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Áreas · escolha nível e unidades
              </Label>
            </div>
            <div className="space-y-2">
              {areas.map((p) => {
                const est = estadoAreas[p.id];
                const marcado = est?.marcado;
                return (
                  <Card
                    key={p.id}
                    className={`p-3 transition-all ${
                      marcado
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={marcado || false}
                        onCheckedChange={() => toggleArea(p.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0 space-y-3">
                        <button
                          type="button"
                          className="text-left w-full"
                          onClick={() => toggleArea(p.id)}
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium leading-tight">
                              {p.nome}
                            </p>
                            {perfisDeTemplate.has(p.id) && (
                              <Badge
                                variant="outline"
                                className="text-[9px] py-0 px-1.5 h-4 gap-0.5 font-normal"
                              >
                                <ClipboardList className="h-2.5 w-2.5" />
                                do template
                              </Badge>
                            )}
                          </div>
                          {p.descricao && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                              {p.descricao}
                            </p>
                          )}
                        </button>

                        {marcado && (
                          <div className="space-y-2.5 pt-1">
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground w-16 shrink-0">
                                Nível:
                              </Label>
                              <Select
                                value={est?.nivel || ""}
                                onValueChange={(v) =>
                                  setNivelArea(p.id, v as NivelHierarquico)
                                }
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Escolha o nível" />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(NIVEL_LABELS_V2).map(
                                    ([v, label]) => (
                                      <SelectItem key={v} value={v}>
                                        {label}
                                      </SelectItem>
                                    )
                                  )}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="flex items-start gap-2">
                              <Label className="text-xs text-muted-foreground w-16 shrink-0 mt-1">
                                Unidades:
                              </Label>
                              <div className="flex flex-wrap gap-1.5 flex-1">
                                {(unidades || []).map((u) => {
                                  const sel = est?.unidades.has(u.id);
                                  return (
                                    <button
                                      type="button"
                                      key={u.id}
                                      onClick={() =>
                                        toggleUnidade(p.id, u.id)
                                      }
                                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                                        sel
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-transparent border-muted-foreground/30 hover:border-primary/50"
                                      }`}
                                    >
                                      {u.nome}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {est?.marcado && est.unidades.size === 0 && (
                              <div className="flex items-center gap-1.5 text-[11px] text-warning">
                                <AlertCircle className="h-3 w-3" />
                                Escolha ao menos uma unidade
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
              {areas.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma área cadastrada.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-4 mt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={salvar.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => salvar.mutate()}
            disabled={salvar.isPending}
          >
            {salvar.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Salvar Perfis
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
