import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Link2, Loader2, ShieldCheck, ShieldOff, ShieldPlus, Trash2, Unlink, UserPlus, Users2, X,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmacaoDupla } from "@/components/ConfirmacaoDupla";
import { ReenviarLinkAcessoButton } from "@/components/auth/ReenviarLinkAcessoButton";
import { DefinirSenhaButton } from "@/components/gerenciar-usuarios/DefinirSenhaButton";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
type Escopo = Database["public"]["Enums"]["escopo_acesso"];

// Lista deliberadamente menor que o enum app_role (22 valores).
// Ficam DE FORA os legados de alto peso de RLS e zero usuários:
// admin_rh, gestor_rh, gestor_direto, recrutador, admin_ti.
// socio entrou em 22/08/2026 porque já havia usuários com esse papel no banco.
const ROLE_OPTIONS: AppRole[] = [
  "super_admin", "diretoria_executiva", "rh", "gestao_direta", "financeiro",
  "administrativo", "operacional", "ti", "recrutamento", "fiscal",
  "estagiario", "colaborador", "comprador", "triagem", "coordenacao_op_fin", "auditor",
  "socio",
];

const ROLE_LABEL: Partial<Record<AppRole, string>> = {
  super_admin: "Super Admin",
  diretoria_executiva: "Diretoria Executiva",
  rh: "RH",
  gestao_direta: "Gestão Direta",
  financeiro: "Financeiro",
  administrativo: "Administrativo",
  operacional: "Operacional",
  ti: "TI",
  recrutamento: "Recrutamento",
  fiscal: "Fiscal",
  estagiario: "Estagiário",
  colaborador: "Colaborador",
  comprador: "Comprador",
  triagem: "Triagem",
  coordenacao_op_fin: "Coordenação Op/Fin",
  auditor: "Auditor",
  socio: "Sócio",
};

const ESCOPO_OPTIONS: { value: Escopo; label: string }[] = [
  { value: "tudo", label: "Tudo" },
  { value: "unidade", label: "Unidade" },
  { value: "centro_custo", label: "Centro de custo" },
  { value: "proprio", label: "Próprio" },
];

const roleLabel = (r: AppRole) => ROLE_LABEL[r] ?? r;
const escopoLabel = (e: Escopo | null) =>
  ESCOPO_OPTIONS.find((o) => o.value === e)?.label ?? "—";

function fmtDataCurta(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

interface Props {
  isSuperAdmin: boolean;
  podeCriar: boolean;
  onNovoUsuario: () => void;
}

export default function MesaUsuariosTab({ isSuperAdmin, podeCriar, onNovoUsuario }: Props) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");

  // dialogs
  const [papelDialog, setPapelDialog] = useState<{ userId: string; nome: string } | null>(null);
  const [novoPapel, setNovoPapel] = useState<AppRole | "">("");
  const [novoEscopo, setNovoEscopo] = useState<Escopo>("tudo");
  const [validoAte, setValidoAte] = useState("");

  const [revogar, setRevogar] = useState<{ id: string; label: string } | null>(null);

  const [gruposDialog, setGruposDialog] = useState<{ userId: string; nome: string } | null>(null);
  const [grupoParaAdicionar, setGrupoParaAdicionar] = useState("");

  const [vinculoDialog, setVinculoDialog] = useState<{ userId: string; nome: string } | null>(null);
  const [vinculoEscolhido, setVinculoEscolhido] = useState("");

  const [banConfirm, setBanConfirm] = useState<{ userId: string; nome: string } | null>(null);
  const [reativarConfirm, setReativarConfirm] = useState<{ userId: string; nome: string } | null>(null);
  const [excluirConfirm, setExcluirConfirm] = useState<{ userId: string; nome: string } | null>(null);
  const [duplaConfirm, setDuplaConfirm] = useState<
    { userId: string; nome: string; mode: "ban" | "delete" } | null
  >(null);

  // ---------------- queries ----------------
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: authUsers = [] } = useQuery({
    queryKey: ["admin-auth-users"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { action: "list_users" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return (data?.users || []) as Array<{ id: string; email?: string; banned?: boolean }>;
    },
  });

  const { data: vinculosLigados = [] } = useQuery({
    queryKey: ["mesa-vinculos-ligados"],
    queryFn: async () => {
      // MESA-VE-VINCULO-MESMO-SEM-VER-PESSOA: RPC SECURITY DEFINER expõe só a
      // existência do vínculo (sem salário/dados bancários), furando a RLS de pode_ver_pessoa()
      const { data, error } = await supabase.rpc("mesa_listar_vinculos");
      if (error) throw error;
      return (data || []).filter((v) => v.usuario_id !== null);
    },
  });

  const { data: papeisAtivos = [] } = useQuery({
    queryKey: ["mesa-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, user_id, role, escopo, valido_ate")
        .is("revogado_em", null);
      if (error) throw error;
      const agora = Date.now();
      return (data || []).filter(
        (r) => !r.valido_ate || new Date(r.valido_ate).getTime() > agora,
      );
    },
  });

  const { data: gruposDoUsuario = [] } = useQuery({
    queryKey: ["mesa-grupos-usuarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grupo_acesso_usuarios")
        .select("id, user_id, grupo_acesso_id, grupos_acesso(nome, ativo)")
        .is("inativado_em", null);
      if (error) throw error;
      return data;
    },
  });

  const { data: gruposDisponiveis = [] } = useQuery({
    queryKey: ["mesa-grupos-catalogo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grupos_acesso")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: vinculosLivres = [] } = useQuery({
    queryKey: ["mesa-vinculos-livres"],
    enabled: !!vinculoDialog,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("mesa_listar_vinculos");
      if (error) throw error;
      return (data || []).filter((v) => v.usuario_id === null && v.status === "ativo");
    },
  });

  const invalidarTudo = () => {
    qc.invalidateQueries({ queryKey: ["mesa-user-roles"] });
    qc.invalidateQueries({ queryKey: ["mesa-grupos-usuarios"] });
    qc.invalidateQueries({ queryKey: ["mesa-vinculos-ligados"] });
    qc.invalidateQueries({ queryKey: ["mesa-vinculos-livres"] });
    qc.invalidateQueries({ queryKey: ["admin-profiles"] });
  };

  const invalidarAcesso = () => {
    qc.invalidateQueries({ queryKey: ["admin-auth-users"] });
    qc.invalidateQueries({ queryKey: ["admin-profiles"] });
    qc.invalidateQueries({ queryKey: ["mesa-vinculos-ligados"] });
    qc.invalidateQueries({ queryKey: ["mesa-vinculos-livres"] });
    qc.invalidateQueries({ queryKey: ["mesa-user-roles"] });
  };

  // ---------------- mutations ----------------
  const concederPapel = useMutation({
    mutationFn: async () => {
      if (!papelDialog || !novoPapel) throw new Error("Selecione um papel");
      const { error } = await supabase.from("user_roles").insert({
        user_id: papelDialog.userId,
        role: novoPapel as AppRole,
        escopo: novoEscopo,
        valido_ate: validoAte ? new Date(validoAte).toISOString() : null,
        atribuido_manualmente: true,
      });
      if (error) {
        if (error.code === "23505" || error.code === "23P01" || /duplicate|unique/i.test(error.message)) {
          throw new Error("Papel já concedido para este usuário");
        }
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      invalidarTudo();
      toast.success("Papel concedido");
      setPapelDialog(null);
      setNovoPapel("");
      setNovoEscopo("tudo");
      setValidoAte("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revogarPapel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ revogado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidarTudo();
      toast.success("Papel revogado");
      setRevogar(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const adicionarGrupo = useMutation({
    mutationFn: async () => {
      if (!gruposDialog || !grupoParaAdicionar) throw new Error("Selecione um grupo");
      const { error } = await supabase.from("grupo_acesso_usuarios").insert({
        grupo_acesso_id: grupoParaAdicionar,
        user_id: gruposDialog.userId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidarTudo();
      toast.success("Grupo adicionado");
      setGrupoParaAdicionar("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removerGrupo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("grupo_acesso_usuarios")
        .update({ inativado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidarTudo();
      toast.success("Grupo removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const vincular = useMutation({
    mutationFn: async ({ vinculoId, userId }: { vinculoId: string; userId: string | null }) => {
      const { data, error } = await supabase.rpc("mesa_vincular_usuario", {
        p_vinculo_id: vinculoId,
        p_user_id: userId as unknown as string,
      });
      if (error) throw new Error(error.message);
      return data as { ok?: boolean; pessoa?: string } | null;
    },
    onSuccess: (data, vars) => {
      invalidarTudo();
      const pessoa = data?.pessoa ? ` — ${data.pessoa}` : "";
      toast.success(vars.userId ? `Vínculo criado${pessoa}` : `Vínculo desfeito${pessoa}`);
      setVinculoDialog(null);
      setVinculoEscolhido("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleBan = useMutation({
    mutationFn: async ({ user_id, ban }: { user_id: string; ban: boolean }) => {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { action: "toggle_ban", user_id, ban },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: (_, { ban }) => {
      invalidarAcesso();
      toast.success(ban ? "Acesso inativado" : "Acesso reativado");
      setBanConfirm(null);
      setDuplaConfirm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: async (user_id: string) => {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { action: "delete_user", user_id },
      });
      if (error) {
        // Erro 409 (FK) vem no corpo da resposta — mensagem já é pronta e amigável
        let msg = error.message;
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.error) msg = body.error;
        } catch { /* mantém msg original */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      invalidarAcesso();
      toast.success("Usuário excluído");
      setExcluirConfirm(null);
      setDuplaConfirm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---------------- derivados ----------------
  const emailPorUser = useMemo(() => {
    const m = new Map<string, string>();
    authUsers.forEach((u) => m.set(u.id, u.email || ""));
    return m;
  }, [authUsers]);

  const bannedPorUser = useMemo(() => {
    const m = new Map<string, boolean>();
    authUsers.forEach((u) => m.set(u.id, !!u.banned));
    return m;
  }, [authUsers]);

  const ehSuperAdmin = (userId: string) =>
    papeisAtivos.some((r) => r.user_id === userId && r.role === "super_admin");

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return profiles
      .map((p) => {
        const vinculo = vinculosLigados.find((v) => v.usuario_id === p.user_id) || null;
        return {
          profileId: p.id,
          userId: p.user_id,
          nome: p.full_name || "—",
          email: emailPorUser.get(p.user_id) || "",
          banned: bannedPorUser.get(p.user_id) || false,
          vinculo,
          papeis: papeisAtivos.filter((r) => r.user_id === p.user_id),
          grupos: gruposDoUsuario.filter((g) => g.user_id === p.user_id),
        };
      })
      .filter((l) =>
        !termo ||
        l.nome.toLowerCase().includes(termo) ||
        l.email.toLowerCase().includes(termo) ||
        (l.vinculo?.nome_completo || "").toLowerCase().includes(termo),
      );
  }, [profiles, vinculosLigados, papeisAtivos, gruposDoUsuario, emailPorUser, bannedPorUser, busca]);

  const semVinculo = linhas.filter((l) => !l.vinculo).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-lg">Usuários do Sistema</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {linhas.length} usuário(s) · {linhas.length - semVinculo} com vínculo · {semVinculo} sem vínculo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail ou pessoa"
            className="h-9 w-64"
          />
          {podeCriar && (
            <Button size="sm" onClick={onNovoUsuario}>
              <UserPlus className="h-4 w-4" /> Novo Usuário
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando usuários…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Espécie</TableHead>
                <TableHead>Papéis ativos</TableHead>
                <TableHead>Grupos</TableHead>
                {isSuperAdmin && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.profileId}>
                  <TableCell>
                    <p className="font-medium">{l.nome}</p>
                    <p className="text-xs text-muted-foreground">{l.email}</p>
                  </TableCell>
                  <TableCell>
                    {l.vinculo ? (
                      <div className="space-y-1">
                        <p className="text-sm">{l.vinculo.nome_completo || "—"}</p>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs uppercase">
                            {l.vinculo.tipo_vinculo}
                          </Badge>
                          {l.vinculo.cargo_nome && (
                            <span className="text-xs text-muted-foreground">{l.vinculo.cargo_nome}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <Badge variant="secondary" className="text-xs font-normal">
                        Sem vínculo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {l.papeis.length === 0 && (
                        <span className="text-xs text-muted-foreground">Nenhum</span>
                      )}
                      {l.papeis.map((r) => (
                        <Badge key={r.id} variant="outline" className="text-xs gap-1">
                          <span>
                            {roleLabel(r.role as AppRole)} · {escopoLabel(r.escopo as Escopo | null)}
                            {r.valido_ate ? ` · até ${fmtDataCurta(r.valido_ate)}` : ""}
                          </span>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              className="opacity-60 hover:opacity-100"
                              onClick={() =>
                                setRevogar({
                                  id: r.id,
                                  label: `${roleLabel(r.role as AppRole)} de ${l.nome}`,
                                })
                              }
                              aria-label="Revogar papel"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {l.grupos.length === 0 && (
                        <span className="text-xs text-muted-foreground">Nenhum</span>
                      )}
                      {l.grupos.map((g) => (
                        <Badge
                          key={g.id}
                          variant="secondary"
                          className="text-xs font-normal"
                          title={g.grupos_acesso?.ativo === false ? "Grupo desativado — este vínculo não concede mais nenhuma permissão" : undefined}
                        >
                          <span className={g.grupos_acesso?.ativo === false ? "line-through opacity-60" : ""}>
                            {g.grupos_acesso?.nome || "Grupo"}
                          </span>
                          {g.grupos_acesso?.ativo === false && (
                            <span className="ml-1 text-[8px] uppercase tracking-wide">inativo</span>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  {isSuperAdmin && (
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPapelDialog({ userId: l.userId, nome: l.nome })}
                      >
                        <ShieldPlus className="h-3.5 w-3.5" /> Papel
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setGruposDialog({ userId: l.userId, nome: l.nome })}
                      >
                        <Users2 className="h-3.5 w-3.5" /> Grupos
                      </Button>
                      {l.vinculo ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={vincular.isPending}
                          onClick={() =>
                            vincular.mutate({ vinculoId: l.vinculo!.id, userId: null })
                          }
                        >
                          <Unlink className="h-3.5 w-3.5" /> Desvincular
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setVinculoEscolhido("");
                            setVinculoDialog({ userId: l.userId, nome: l.nome });
                          }}
                        >
                          <Link2 className="h-3.5 w-3.5" /> Vincular
                        </Button>
                      )}
                      <ReenviarLinkAcessoButton variant="icon" userId={l.userId} nome={l.nome} />
                      <DefinirSenhaButton userId={l.userId} nome={l.nome} />
                      {l.banned ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={toggleBan.isPending}
                          onClick={() => setReativarConfirm({ userId: l.userId, nome: l.nome })}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" /> Reativar acesso
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={toggleBan.isPending}
                          onClick={() =>
                            ehSuperAdmin(l.userId)
                              ? setDuplaConfirm({ userId: l.userId, nome: l.nome, mode: "ban" })
                              : setBanConfirm({ userId: l.userId, nome: l.nome })
                          }
                        >
                          <ShieldOff className="h-3.5 w-3.5" /> Inativar acesso
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={deleteUser.isPending}
                        onClick={() =>
                          ehSuperAdmin(l.userId)
                            ? setDuplaConfirm({ userId: l.userId, nome: l.nome, mode: "delete" })
                            : setExcluirConfirm({ userId: l.userId, nome: l.nome })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Conceder papel */}
      <Dialog open={!!papelDialog} onOpenChange={(v) => !v && setPapelDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conceder papel</DialogTitle>
            <DialogDescription>{papelDialog?.nome}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={novoPapel} onValueChange={(v) => setNovoPapel(v as AppRole)}>
                <SelectTrigger><SelectValue placeholder="Selecione o papel" /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Escopo</Label>
              <Select value={novoEscopo} onValueChange={(v) => setNovoEscopo(v as Escopo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESCOPO_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Válido até (opcional)</Label>
              <Input
                type="datetime-local"
                value={validoAte}
                onChange={(e) => setValidoAte(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPapelDialog(null)}>Cancelar</Button>
            <Button
              disabled={!novoPapel || concederPapel.isPending}
              onClick={() => concederPapel.mutate()}
            >
              {concederPapel.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Conceder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revogar papel */}
      <AlertDialog open={!!revogar} onOpenChange={(v) => !v && setRevogar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar papel?</AlertDialogTitle>
            <AlertDialogDescription>
              O papel {revogar?.label} deixa de valer agora. O registro é preservado para trilha de auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (revogar) revogarPapel.mutate(revogar.id);
              }}
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Grupos */}
      <Dialog open={!!gruposDialog} onOpenChange={(v) => !v && setGruposDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grupos de acesso</DialogTitle>
            <DialogDescription>{gruposDialog?.nome}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1">
              {gruposDoUsuario
                .filter((g) => g.user_id === gruposDialog?.userId)
                .map((g) => (
                  <Badge
                    key={g.id}
                    variant="secondary"
                    className="text-xs gap-1 font-normal"
                    title={g.grupos_acesso?.ativo === false ? "Grupo desativado — este vínculo não concede mais nenhuma permissão" : undefined}
                  >
                    <span className={g.grupos_acesso?.ativo === false ? "line-through opacity-60" : ""}>
                      {g.grupos_acesso?.nome || "Grupo"}
                    </span>
                    {g.grupos_acesso?.ativo === false && (
                      <span className="ml-1 text-[8px] uppercase tracking-wide">inativo</span>
                    )}
                    <button
                      type="button"
                      className="opacity-60 hover:opacity-100"
                      disabled={removerGrupo.isPending}
                      onClick={() => removerGrupo.mutate(g.id)}
                      aria-label="Remover grupo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              {gruposDoUsuario.filter((g) => g.user_id === gruposDialog?.userId).length === 0 && (
                <span className="text-xs text-muted-foreground">Nenhum grupo ativo</span>
              )}
            </div>
            <div className="space-y-2">
              <Label>Adicionar grupo</Label>
              <Select value={grupoParaAdicionar} onValueChange={setGrupoParaAdicionar}>
                <SelectTrigger><SelectValue placeholder="Selecione o grupo" /></SelectTrigger>
                <SelectContent>
                  {gruposDisponiveis.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGruposDialog(null)}>Fechar</Button>
            <Button
              disabled={!grupoParaAdicionar || adicionarGrupo.isPending}
              onClick={() => adicionarGrupo.mutate()}
            >
              {adicionarGrupo.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vincular a colaborador */}
      <Dialog open={!!vinculoDialog} onOpenChange={(v) => !v && setVinculoDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular a colaborador</DialogTitle>
            <DialogDescription>
              {vinculoDialog?.nome} — vínculos ativos ainda sem usuário
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Vínculo</Label>
            <Select value={vinculoEscolhido} onValueChange={setVinculoEscolhido}>
              <SelectTrigger><SelectValue placeholder="Selecione o vínculo" /></SelectTrigger>
              <SelectContent>
                {vinculosLivres.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {(v.nome_completo || "Sem nome") + ` · ${String(v.tipo_vinculo).toUpperCase()}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVinculoDialog(null)}>Cancelar</Button>
            <Button
              disabled={!vinculoEscolhido || vincular.isPending}
              onClick={() =>
                vinculoDialog &&
                vincular.mutate({ vinculoId: vinculoEscolhido, userId: vinculoDialog.userId })
              }
            >
              {vincular.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inativar acesso (não super admin) */}
      <AlertDialog open={!!banConfirm} onOpenChange={(v) => !v && setBanConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar acesso de {banConfirm?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O usuário perde acesso ao sistema imediatamente. Pode ser revertido a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={toggleBan.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (banConfirm) toggleBan.mutate({ user_id: banConfirm.userId, ban: true });
              }}
            >
              Inativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reativar acesso */}
      <AlertDialog open={!!reativarConfirm} onOpenChange={(v) => !v && setReativarConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reativar acesso de {reativarConfirm?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O usuário volta a acessar o sistema normalmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={toggleBan.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (reativarConfirm) toggleBan.mutate({ user_id: reativarConfirm.userId, ban: false });
              }}
            >
              Reativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir usuário (não super admin) */}
      <AlertDialog open={!!excluirConfirm} onOpenChange={(v) => !v && setExcluirConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário {excluirConfirm?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível e remove todos os dados de acesso do usuário. Se ele
              tiver histórico vinculado (pedidos, processos, auditoria), o sistema recusa
              e sugere Inativar em vez de excluir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteUser.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (excluirConfirm) deleteUser.mutate(excluirConfirm.userId);
              }}
            >
              {deleteUser.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação dupla: inativar/excluir Super Admin */}
      <ConfirmacaoDupla
        open={!!duplaConfirm}
        onOpenChange={(o) => !o && setDuplaConfirm(null)}
        titulo={duplaConfirm?.mode === "delete" ? "Excluir Super Admin" : "Inativar Super Admin"}
        descricao={
          <p>
            Você está prestes a {duplaConfirm?.mode === "delete" ? "excluir" : "inativar"} o
            Super Admin <strong>{duplaConfirm?.nome}</strong>. Essa ação afeta o acesso total
            ao sistema e é registrada em auditoria.
          </p>
        }
        textoConfirmacao={duplaConfirm?.mode === "delete" ? "EXCLUIR SUPER ADMIN" : "INATIVAR SUPER ADMIN"}
        placeholder={duplaConfirm?.mode === "delete" ? "EXCLUIR SUPER ADMIN" : "INATIVAR SUPER ADMIN"}
        acaoLabel={duplaConfirm?.mode === "delete" ? "Excluir Super Admin" : "Inativar Super Admin"}
        onConfirmar={async () => {
          if (!duplaConfirm) return;
          if (duplaConfirm.mode === "delete") {
            await deleteUser.mutateAsync(duplaConfirm.userId);
          } else {
            await toggleBan.mutateAsync({ user_id: duplaConfirm.userId, ban: true });
          }
        }}
      />
    </Card>
  );
}
