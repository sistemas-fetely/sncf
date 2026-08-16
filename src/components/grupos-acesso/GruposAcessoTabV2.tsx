import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Users, ShieldCheck, Trash2, Lock, FileText, Layers, Loader2, ChevronRight, ArrowLeft, Sparkles } from "lucide-react";
import {
  useGruposAcessoV2, usePermissoesCatalogo, usePermissoesDoGrupo,
  useUsuariosDoGrupo, useCriarGrupo, useDeletarGrupo, useTogglePermissao,
  useLiberarPilar, useAdicionarUsuarioAoGrupo, useRemoverUsuarioDoGrupo,
  type GrupoAcesso, type PermissaoCatalogo,
} from "@/hooks/useGruposAcessoV2";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PILAR_LABELS: Record<string, string> = {
  portal: "Portal",
  people: "People Fetely",
  financeiro: "Financeiro Fetely",
  administrativo: "Administrativo Fetely",
  ti: "TI Fetely",
  produto: "Produto Fetely",
  "gestao-vista": "Gestão à Vista",
  "adm-sncf": "ADM SNCF",
};

const PILAR_CORES: Record<string, string> = {
  portal: "#1A4A3A",
  people: "#1A4A3A",
  financeiro: "#1A4A3A",
  administrativo: "#6B5B45",
  ti: "#3A7D6B",
  produto: "#C77CA0",
  "gestao-vista": "#2C5F7C",
  "adm-sncf": "#1A4A3A",
};

export default function GruposAcessoTabV2() {
  const [grupoSelecionado, setGrupoSelecionado] = useState<GrupoAcesso | null>(null);
  const [busca, setBusca] = useState("");
  const [novoGrupoOpen, setNovoGrupoOpen] = useState(false);
  const { data: grupos = [], isLoading } = useGruposAcessoV2();

  const filtrados = useMemo(
    () => grupos.filter((g) => g.nome.toLowerCase().includes(busca.toLowerCase())),
    [grupos, busca]
  );

  if (grupoSelecionado) {
    return (
      <DetalheGrupo
        grupo={grupoSelecionado}
        onVoltar={() => setGrupoSelecionado(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 max-w-md">
          <Input
            placeholder="Buscar grupo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-9"
          />
        </div>
        <Dialog open={novoGrupoOpen} onOpenChange={setNovoGrupoOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo grupo
            </Button>
          </DialogTrigger>
          <NovoGrupoDialog onClose={() => setNovoGrupoOpen(false)} />
        </Dialog>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldCheck className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {busca ? "Nenhum grupo encontrado" : "Nenhum grupo cadastrado ainda"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtrados.map((g) => (
            <CardGrupo key={g.id} grupo={g} onAbrir={() => setGrupoSelecionado(g)} />
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================
// Card de grupo na lista
// =====================================================

function CardGrupo({ grupo, onAbrir }: { grupo: GrupoAcesso; onAbrir: () => void }) {
  return (
    <Card
      onClick={onAbrir}
      className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            {grupo.pre_cadastrado && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            {grupo.nome}
          </CardTitle>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        </div>
        {grupo.descricao && (
          <p className="text-xs text-muted-foreground line-clamp-2">{grupo.descricao}</p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {grupo.qtd_usuarios} {grupo.qtd_usuarios === 1 ? "usuário" : "usuários"}
          </span>
          <span className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            {grupo.qtd_permissoes} permissões
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================
// Dialog: criar novo grupo
// =====================================================

function NovoGrupoDialog({ onClose }: { onClose: () => void }) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const criar = useCriarGrupo();

  const submit = async () => {
    if (!nome.trim()) return;
    await criar.mutateAsync({ nome: nome.trim(), descricao: descricao.trim() });
    setNome("");
    setDescricao("");
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo grupo de acesso</DialogTitle>
        <DialogDescription>
          Grupos definem o que um conjunto de usuários pode acessar no sistema.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="nome">Nome</Label>
          <Input
            id="nome"
            placeholder="Ex: Financeiro Senior, Time de RH..."
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="descricao">Descrição (finalidade)</Label>
          <Textarea
            id="descricao"
            placeholder="Ex: Pessoas que aprovam pagamentos acima de R$ 5k. Exigência LGPD: descrição da base legal/finalidade do acesso."
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={3}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} disabled={!nome.trim() || criar.isPending}>
          {criar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Criar grupo
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// =====================================================
// Detalhe do grupo (permissões + usuários)
// =====================================================

function DetalheGrupo({ grupo, onVoltar }: { grupo: GrupoAcesso; onVoltar: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onVoltar}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para grupos
        </Button>
        {!grupo.pre_cadastrado && <DeletarGrupoButton grupoId={grupo.id} onDeleted={onVoltar} />}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg flex items-center gap-2">
                {grupo.nome}
                {grupo.pre_cadastrado && (
                  <Badge variant="outline" className="text-[10px]">
                    <Lock className="h-2.5 w-2.5 mr-1" />
                    Pré-cadastrado
                  </Badge>
                )}
              </CardTitle>
              {grupo.descricao && (
                <p className="text-sm text-muted-foreground mt-1">{grupo.descricao}</p>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Usuários */}
      <UsuariosDoGrupo grupoId={grupo.id} />

      {/* Permissões */}
      <PermissoesDoGrupo grupoId={grupo.id} />
    </div>
  );
}

function DeletarGrupoButton({ grupoId, onDeleted }: { grupoId: string; onDeleted: () => void }) {
  const deletar = useDeletarGrupo();
  const handleClick = async () => {
    if (!confirm("Desativar este grupo? Os usuários perdem acesso pelas permissões deste grupo.")) return;
    await deletar.mutateAsync(grupoId);
    onDeleted();
  };
  return (
    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleClick} disabled={deletar.isPending}>
      <Trash2 className="h-4 w-4 mr-2" />
      Desativar grupo
    </Button>
  );
}

// =====================================================
// Sessão: Usuários do grupo
// =====================================================

function UsuariosDoGrupo({ grupoId }: { grupoId: string }) {
  const { data: usuarios = [], isLoading } = useUsuariosDoGrupo(grupoId);
  const [adicionarOpen, setAdicionarOpen] = useState(false);
  const remover = useRemoverUsuarioDoGrupo();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Usuários ({usuarios.length})
          </CardTitle>
          <Dialog open={adicionarOpen} onOpenChange={setAdicionarOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Adicionar usuário
              </Button>
            </DialogTrigger>
            <AdicionarUsuarioDialog
              grupoId={grupoId}
              onClose={() => setAdicionarOpen(false)}
              jaInclusos={usuarios.map((u) => u.user_id)}
            />
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto my-3" />
        ) : usuarios.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum usuário neste grupo. Clique em "Adicionar usuário" pra começar.
          </p>
        ) : (
          <div className="space-y-1">
            {usuarios.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-muted/50 group">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-[10px]">
                    {(u.nome || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.nome}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (confirm(`Remover ${u.nome} deste grupo?`)) {
                      remover.mutate({ grupoId, userId: u.user_id });
                    }
                  }}
                  disabled={remover.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdicionarUsuarioDialog({
  grupoId, onClose, jaInclusos,
}: { grupoId: string; onClose: () => void; jaInclusos: string[] }) {
  const [userId, setUserId] = useState("");
  const adicionar = useAdicionarUsuarioAoGrupo();

  const { data: usuarios = [] } = useQuery({
    queryKey: ["users-disponiveis-grupo", grupoId, jaInclusos.length],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name");
      return (data || []).filter((p) => !jaInclusos.includes(p.user_id));
    },
  });

  const submit = async () => {
    if (!userId) return;
    await adicionar.mutateAsync({ grupoId, userId });
    onClose();
  };

  return (
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
              <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                Todos os usuários já estão no grupo
              </div>
            )}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} disabled={!userId || adicionar.isPending}>
          {adicionar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Adicionar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// =====================================================
// Sessão: Permissões do grupo (agrupadas por pilar)
// =====================================================

function PermissoesDoGrupo({ grupoId }: { grupoId: string }) {
  const { data: catalogo = [], isLoading: cl } = usePermissoesCatalogo();
  const { data: permsGrupo = [], isLoading: gl } = usePermissoesDoGrupo(grupoId);
  const toggle = useTogglePermissao();
  const liberarPilar = useLiberarPilar();

  // Index permissões do grupo por permissao_id
  const grupoPermsMap = useMemo(() => {
    const m = new Map<string, typeof permsGrupo[0]>();
    permsGrupo.forEach((p) => m.set(p.permissao_id, p));
    return m;
  }, [permsGrupo]);

  // Catálogo agrupado por pilar
  const catalogoPorPilar = useMemo(() => {
    const m: Record<string, PermissaoCatalogo[]> = {};
    catalogo.forEach((p) => {
      if (!m[p.pilar]) m[p.pilar] = [];
      m[p.pilar].push(p);
    });
    return m;
  }, [catalogo]);

  if (cl || gl) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          O que pode acessar
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Marque por pilar. Telas têm só "Ver". Fichas têm Ver / Criar / Editar / Apagar.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(catalogoPorPilar).map(([pilar, perms]) => (
          <PilarBloco
            key={pilar}
            pilar={pilar}
            permissoes={perms}
            grupoPermsMap={grupoPermsMap}
            onToggle={(permissaoId, campo, valor) =>
              toggle.mutate({ grupoId, permissaoId, campo, valor })
            }
            onLiberarTudo={() => liberarPilar.mutate({ grupoId, pilar })}
            disabled={toggle.isPending || liberarPilar.isPending}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function PilarBloco({
  pilar, permissoes, grupoPermsMap, onToggle, onLiberarTudo, disabled,
}: {
  pilar: string;
  permissoes: PermissaoCatalogo[];
  grupoPermsMap: Map<string, { pode_ver: boolean; pode_criar: boolean; pode_editar: boolean; pode_apagar: boolean }>;
  onToggle: (permissaoId: string, campo: "pode_ver" | "pode_criar" | "pode_editar" | "pode_apagar", valor: boolean) => void;
  onLiberarTudo: () => void;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const cor = PILAR_CORES[pilar] || "#666";
  const liberadas = permissoes.filter((p) => grupoPermsMap.get(p.id)?.pode_ver).length;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setAberto(!aberto)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: cor }}
          />
          <span className="font-medium text-sm">{PILAR_LABELS[pilar] || pilar}</span>
          <Badge variant="secondary" className="text-[10px]">
            {liberadas}/{permissoes.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {!aberto && liberadas < permissoes.length && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onLiberarTudo();
              }}
              disabled={disabled}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Liberar tudo
            </Button>
          )}
          <ChevronRight
            className={`h-4 w-4 text-muted-foreground transition-transform ${aberto ? "rotate-90" : ""}`}
          />
        </div>
      </button>

      {aberto && (
        <div className="border-t bg-muted/10">
          {/* Header colunas */}
          <div className="grid grid-cols-[1fr_60px_60px_60px_60px] gap-2 px-4 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-medium border-b">
            <span>Permissão</span>
            <span className="text-center">Ver</span>
            <span className="text-center">Criar</span>
            <span className="text-center">Editar</span>
            <span className="text-center">Apagar</span>
          </div>

          {permissoes.map((p) => {
            const gp = grupoPermsMap.get(p.id);
            const isFicha = p.tipo === "ficha" || p.tipo === "processo";
            return (
              <div
                key={p.id}
                className="grid grid-cols-[1fr_60px_60px_60px_60px] gap-2 px-4 py-2 items-center text-sm hover:bg-muted/20 border-b last:border-b-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{p.nome_exibicao}</span>
                  {p.contem_dado_sensivel && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1">LGPD</Badge>
                  )}
                  {p.feature_em_teste && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1 bg-warning/10">BETA</Badge>
                  )}
                  {p.tipo === "tela" && (
                    <span className="text-[9px] text-muted-foreground/60">tela</span>
                  )}
                </div>
                <div className="flex justify-center">
                  <Checkbox
                    checked={gp?.pode_ver || false}
                    onCheckedChange={(v) => onToggle(p.id, "pode_ver", !!v)}
                    disabled={disabled}
                  />
                </div>
                <div className="flex justify-center">
                  <Checkbox
                    checked={gp?.pode_criar || false}
                    onCheckedChange={(v) => onToggle(p.id, "pode_criar", !!v)}
                    disabled={disabled || !isFicha}
                    className={!isFicha ? "opacity-30" : ""}
                  />
                </div>
                <div className="flex justify-center">
                  <Checkbox
                    checked={gp?.pode_editar || false}
                    onCheckedChange={(v) => onToggle(p.id, "pode_editar", !!v)}
                    disabled={disabled || !isFicha}
                    className={!isFicha ? "opacity-30" : ""}
                  />
                </div>
                <div className="flex justify-center">
                  <Checkbox
                    checked={gp?.pode_apagar || false}
                    onCheckedChange={(v) => onToggle(p.id, "pode_apagar", !!v)}
                    disabled={disabled || !isFicha}
                    className={!isFicha ? "opacity-30" : ""}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
