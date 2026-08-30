import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import {
  useAdicionarUsuarioAoGrupo,
  useCriarGrupo,
  useEditarGrupo,
  useExcluirGrupo,
  useGruposAcessoV2,
  useReativarGrupo,
  useRemoverUsuarioDoGrupo,
  useUsuariosDoGrupo,
  type GrupoAcesso,
} from "@/hooks/useGruposAcessoV2";

/**
 * PAINEL DO GRUPO — cabeça da lente "Por grupo" do Console de Acesso.
 *
 * Absorve todas as capacidades da antiga tela de Gestão de Grupos: escolher,
 * criar, editar, excluir grupo, reativar grupo inativo (legado) e gerenciar os
 * usuários vinculados. A GRADE de permissões NÃO vive aqui — ela é a do
 * Console, com eixo invertido, para não existirem dois editores da mesma
 * tabela `grupo_acesso_permissoes`.
 *
 * NOTA DE DADO: `grupo_acesso_permissoes` também tem `pode_criar`,
 * `pode_editar` e `pode_apagar`. O dado existe no banco (marcado em poucas
 * linhas, consumido por 1 policy) e NÃO é editável por aqui — o Console
 * decide só "acessa / não acessa" + alçada mínima. Não exiba, não apague.
 */
interface Props {
  grupoId: string | null;
  onGrupoChange: (id: string | null) => void;
}

export default function PainelGrupo({ grupoId, onGrupoChange }: Props) {
  const { data: grupos = [], isLoading } = useGruposAcessoV2(true);
  const [criarAberto, setCriarAberto] = useState(false);
  const [editarAberto, setEditarAberto] = useState(false);

  const ativos = useMemo(() => grupos.filter((g) => g.ativo !== false), [grupos]);
  const inativos = useMemo(() => grupos.filter((g) => g.ativo === false), [grupos]);
  const grupo = useMemo(
    () => ativos.find((g) => g.id === grupoId) ?? null,
    [ativos, grupoId],
  );

  const excluir = useExcluirGrupo();
  const reativar = useReativarGrupo();

  const handleExcluir = async () => {
    if (!grupo) return;
    const msg = `Excluir "${grupo.nome}" DEFINITIVAMENTE?\n\n${grupo.qtd_usuarios} usuário(s) perdem imediatamente as ${grupo.qtd_permissoes} permissões concedidas por este grupo.\n\nEsta ação NÃO pode ser desfeita.`;
    if (!confirm(msg)) return;
    await excluir.mutateAsync(grupo.id);
    onGrupoChange(null);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-[220px]">
            <Select
              value={grupo?.id ?? ""}
              onValueChange={(v) => onGrupoChange(v || null)}
              disabled={isLoading}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={isLoading ? "Carregando..." : "Escolha o grupo"} />
              </SelectTrigger>
              <SelectContent>
                {ativos.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.nome}
                  </SelectItem>
                ))}
                {ativos.length === 0 && (
                  <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                    Nenhum grupo ativo
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setCriarAberto(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Novo grupo
            </Button>
            {grupo && (
              <Button size="sm" variant="ghost" onClick={() => setEditarAberto(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
              </Button>
            )}
            {grupo && !grupo.pre_cadastrado && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={handleExcluir}
                disabled={excluir.isPending}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir grupo
              </Button>
            )}
          </div>
        </div>

        {grupo && (
          <div className="pt-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {grupo.nome}
              {grupo.pre_cadastrado && (
                <Badge variant="outline" className="text-[10px]">
                  <Lock className="mr-1 h-2.5 w-2.5" /> Pré-cadastrado
                </Badge>
              )}
            </CardTitle>
            {grupo.descricao && (
              <p className="mt-0.5 text-xs text-muted-foreground">{grupo.descricao}</p>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {!grupo ? (
          <p className="text-sm text-muted-foreground">
            Escolha um grupo para editar o acesso dele tela por tela.
          </p>
        ) : (
          <UsuariosDoGrupo grupoId={grupo.id} />
        )}

        {inativos.length > 0 && (
          <div className="rounded-md border border-dashed p-2">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Grupos inativos (legado)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {inativos.map((g) => (
                <span key={g.id} className="inline-flex items-center gap-1">
                  <Badge variant="outline" className="opacity-70">
                    {g.nome}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    disabled={reativar.isPending}
                    onClick={() => reativar.mutate(g.id)}
                  >
                    Reativar
                  </Button>
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <DialogGrupo
        aberto={criarAberto}
        onFechar={() => setCriarAberto(false)}
        onCriado={(id) => onGrupoChange(id)}
      />
      {grupo && (
        <DialogGrupo
          aberto={editarAberto}
          onFechar={() => setEditarAberto(false)}
          grupo={grupo}
        />
      )}
    </Card>
  );
}

/** Criar ou editar — o mesmo formulário, FAIL-LOUD pelos hooks existentes. */
function DialogGrupo({
  aberto,
  onFechar,
  grupo,
  onCriado,
}: {
  aberto: boolean;
  onFechar: () => void;
  grupo?: GrupoAcesso;
  onCriado?: (id: string) => void;
}) {
  const editando = !!grupo;
  const [nome, setNome] = useState(grupo?.nome ?? "");
  const [descricao, setDescricao] = useState(grupo?.descricao ?? "");
  const criar = useCriarGrupo();
  const editar = useEditarGrupo();
  const salvando = criar.isPending || editar.isPending;

  const abrirMudou = (v: boolean) => {
    if (!v) onFechar();
    else {
      setNome(grupo?.nome ?? "");
      setDescricao(grupo?.descricao ?? "");
    }
  };

  const submit = async () => {
    if (!nome.trim()) return;
    if (editando && grupo) {
      await editar.mutateAsync({ id: grupo.id, nome: nome.trim(), descricao: descricao.trim() });
    } else {
      const criado = await criar.mutateAsync({ nome: nome.trim(), descricao: descricao.trim() });
      if (criado?.id) onCriado?.(criado.id);
    }
    onFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={abrirMudou}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar grupo" : "Novo grupo de acesso"}</DialogTitle>
          <DialogDescription>
            Grupos definem o que um conjunto de usuários pode acessar no sistema.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="grupo-nome">Nome</Label>
            <Input
              id="grupo-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Financeiro Sênior, Time de RH..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grupo-desc">Descrição (finalidade)</Label>
            <Textarea
              id="grupo-desc"
              rows={3}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Exigência LGPD: base legal / finalidade do acesso."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!nome.trim() || salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editando ? "Salvar" : "Criar grupo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsuariosDoGrupo({ grupoId }: { grupoId: string }) {
  const { data: usuarios = [], isLoading } = useUsuariosDoGrupo(grupoId);
  const [adicionarAberto, setAdicionarAberto] = useState(false);
  const remover = useRemoverUsuarioDoGrupo();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Users className="h-3.5 w-3.5" /> Usuários ({usuarios.length})
        </p>
        <Button size="sm" variant="outline" onClick={() => setAdicionarAberto(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar usuário
        </Button>
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto my-2 h-4 w-4 animate-spin text-muted-foreground" />
      ) : usuarios.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">
          Nenhum usuário neste grupo.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {usuarios.map((u) => (
            <span
              key={u.id}
              className="group inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5"
            >
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[9px]">
                  {(u.nome || "?")
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs">{u.nome}</span>
              <button
                type="button"
                className="text-muted-foreground transition-opacity hover:text-destructive"
                disabled={remover.isPending}
                aria-label={`Remover ${u.nome} do grupo`}
                onClick={() => {
                  if (confirm(`Remover ${u.nome} deste grupo?`)) {
                    remover.mutate({ grupoId, userId: u.user_id });
                  }
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <AdicionarUsuarioDialog
        aberto={adicionarAberto}
        onFechar={() => setAdicionarAberto(false)}
        grupoId={grupoId}
        jaInclusos={usuarios.map((u) => u.user_id)}
      />
    </div>
  );
}

function AdicionarUsuarioDialog({
  aberto,
  onFechar,
  grupoId,
  jaInclusos,
}: {
  aberto: boolean;
  onFechar: () => void;
  grupoId: string;
  jaInclusos: string[];
}) {
  const [userId, setUserId] = useState("");
  const adicionar = useAdicionarUsuarioAoGrupo();

  const { data: usuarios = [] } = useQuery({
    queryKey: ["users-disponiveis-grupo", grupoId, jaInclusos.length],
    enabled: aberto,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name");
      if (error) throw error;
      return (data ?? []).filter((p) => !jaInclusos.includes(p.user_id));
    },
  });

  const submit = async () => {
    if (!userId) return;
    await adicionar.mutateAsync({ grupoId, userId });
    setUserId("");
    onFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar usuário ao grupo</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Usuário</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {usuarios.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.full_name}
                </SelectItem>
              ))}
              {usuarios.length === 0 && (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  Todos os usuários já estão no grupo
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!userId || adicionar.isPending}>
            {adicionar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
