import { useState, useMemo, Fragment } from "react";
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
  useGruposAcessoV2, usePermissoesDoGrupo,
  useUsuariosDoGrupo, useCriarGrupo, useDeletarGrupo, useReativarGrupo, useTogglePermissao,
  useAdicionarUsuarioAoGrupo, useRemoverUsuarioDoGrupo,
  type GrupoAcesso,
} from "@/hooks/useGruposAcessoV2";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// CATALOGO-HERDA-NAVEGACAO (23/08/2026): o agrupamento do catálogo passa a ser
// a hierarquia real do menu (app de sncf_navegacao), via vw_catalogo_por_app.
// A cor da seção é derivada do app_chave por hash — estável entre renders,
// sem mapa hardcoded de pilar.
const PALETA_APPS = [
  "#1A4A3A", "#6B5B45", "#3A7D6B", "#C77CA0", "#2C5F7C",
  "#8A6FBF", "#B25E4B", "#4E7C2C", "#9C7A1F", "#5B6B8C",
];

function corDoApp(appChave: string): string {
  let h = 0;
  for (let i = 0; i < appChave.length; i++) {
    h = (h * 31 + appChave.charCodeAt(i)) >>> 0;
  }
  return PALETA_APPS[h % PALETA_APPS.length];
}

// Seções-reserva da view (app_ordem 9998/9999) renderizam por último,
// com visual atenuado e subtítulo explicativo.
const SUBTITULO_SECAO_RESERVA: Record<number, string> = {
  9998: "Permissões de ação, não de tela",
  9999: "Sem tela cabeada — legado ou reserva",
};

export default function GruposAcessoTabV2() {
  const [grupoSelecionado, setGrupoSelecionado] = useState<GrupoAcesso | null>(null);
  const [busca, setBusca] = useState("");
  const [novoGrupoOpen, setNovoGrupoOpen] = useState(false);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const { data: grupos = [], isLoading } = useGruposAcessoV2(mostrarInativos);

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
        <Button
          variant={mostrarInativos ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setMostrarInativos((v) => !v)}
        >
          {mostrarInativos ? "Ocultar inativos" : "Mostrar inativos"}
        </Button>
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
  const reativar = useReativarGrupo();
  const inativo = grupo.ativo === false;

  return (
    <Card
      onClick={inativo ? undefined : onAbrir}
      className={`transition-all ${inativo ? "opacity-60" : "cursor-pointer hover:border-primary/50 hover:shadow-sm"}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            {grupo.pre_cadastrado && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            {grupo.nome}
            {inativo && (
              <Badge variant="outline" className="text-[9px] py-0 px-1">
                inativo
              </Badge>
            )}
          </CardTitle>
          {inativo ? (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                reativar.mutate(grupo.id);
              }}
              disabled={reativar.isPending}
            >
              {reativar.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Reativar
            </Button>
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
          )}
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
        {!grupo.pre_cadastrado && <DeletarGrupoButton grupo={grupo} onDeleted={onVoltar} />}
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

function DeletarGrupoButton({ grupo, onDeleted }: { grupo: GrupoAcesso; onDeleted: () => void }) {
  const deletar = useDeletarGrupo();
  const handleClick = async () => {
    const msg = `Desativar "${grupo.nome}"?\n\n${grupo.qtd_usuarios} usuário(s) perdem imediatamente as ${grupo.qtd_permissoes} permissões concedidas por este grupo.\n\nO grupo continua existindo e pode ser reativado depois em "Mostrar inativos".`;
    if (!confirm(msg)) return;
    await deletar.mutateAsync(grupo.id);
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
// Sessão: Permissões do grupo (agrupadas por app do menu)
// =====================================================

interface CatalogoAppRow {
  permissao_id: string;
  slug: string;
  tipo: "tela" | "ficha" | "processo";
  nome_exibicao: string;
  app_chave: string;
  app_label: string;
  app_ordem: number;
  submenu_chave: string | null;
  submenu_label: string | null;
  submenu_ordem: number;
  ordem_menu: number;
  item_chave: string | null;
  item_label: string | null;
  eh_aba: boolean;
  fora_do_menu: boolean;
  descricao: string | null;
  telas_cobertas: number;
  telas_lista: string | null;
  contem_dado_sensivel: boolean;
  feature_em_teste: boolean;
  filhas_herdadas: Array<{ label: string; slug: string; herda_de: string }> | null;
}

interface SecaoApp {
  app_chave: string;
  app_label: string;
  app_ordem: number;
  itens: CatalogoAppRow[];
  subgrupos: Array<{
    submenu_chave: string | null;
    submenu_label: string | null;
    submenu_ordem: number;
    itens: CatalogoAppRow[];
  }>;
}

function useCatalogoPorApp() {
  return useQuery({
    queryKey: ["permissoes-catalogo"],
    queryFn: async (): Promise<CatalogoAppRow[]> => {
      const { data, error } = await supabase
        .from("vw_catalogo_por_app")
        .select("permissao_id, slug, tipo, nome_exibicao, app_chave, app_label, app_ordem, submenu_chave, submenu_label, submenu_ordem, ordem_menu, item_chave, item_label, eh_aba, fora_do_menu, descricao, telas_cobertas, telas_lista, contem_dado_sensivel, feature_em_teste, filhas_herdadas");
      if (error) throw error;
      return (data || [])
        .filter((r) => r.permissao_id && r.app_chave)
        .map((r) => ({
          permissao_id: r.permissao_id!,
          slug: r.slug ?? "",
          tipo: (r.tipo ?? "tela") as CatalogoAppRow["tipo"],
          nome_exibicao: r.nome_exibicao ?? r.slug ?? "",
          app_chave: r.app_chave!,
          app_label: r.app_label ?? r.app_chave!,
          app_ordem: r.app_ordem ?? 9999,
          submenu_chave: r.submenu_chave ?? null,
          submenu_label: r.submenu_label ?? null,
          submenu_ordem: r.submenu_ordem ?? 0,
          ordem_menu: r.ordem_menu ?? 9999,
          item_chave: r.item_chave ?? null,
          item_label: r.item_label ?? null,
          eh_aba: r.eh_aba ?? false,
          fora_do_menu: r.fora_do_menu ?? false,
          descricao: r.descricao ?? null,
          telas_cobertas: r.telas_cobertas ?? 0,
          telas_lista: r.telas_lista,
          contem_dado_sensivel: r.contem_dado_sensivel ?? false,
          feature_em_teste: r.feature_em_teste ?? false,
          filhas_herdadas: Array.isArray(r.filhas_herdadas)
            ? (r.filhas_herdadas as unknown as CatalogoAppRow["filhas_herdadas"])
            : null,
        }));
    },
  });
}

// "Liberar tudo" da seção: recebe os itens da seção (calculados no client a
// partir do agrupamento) e insere apenas os permissao_id ainda não concedidos.
function useLiberarSecao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      grupoId,
      itens,
      jaConcedidas,
    }: {
      grupoId: string;
      itens: CatalogoAppRow[];
      jaConcedidas: Set<string>;
    }) => {
      const novas = itens.filter((p) => !jaConcedidas.has(p.permissao_id));
      if (!novas.length) return;
      const rows = novas.map((p) => ({
        grupo_acesso_id: grupoId,
        permissao_id: p.permissao_id,
        pode_ver: true,
        pode_criar: false,
        pode_editar: false,
        pode_apagar: false,
      }));
      const { error } = await supabase
        .from("grupo_acesso_permissoes")
        .insert(rows);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["grupo-permissoes", vars.grupoId] });
      queryClient.invalidateQueries({ queryKey: ["grupos-acesso-v2"] });
      toast.success("Pilar liberado");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

function PermissoesDoGrupo({ grupoId }: { grupoId: string }) {
  const { data: catalogo = [], isLoading: cl } = useCatalogoPorApp();
  const { data: permsGrupo = [], isLoading: gl } = usePermissoesDoGrupo(grupoId);
  const toggle = useTogglePermissao();
  const liberarSecao = useLiberarSecao();

  // Index permissões do grupo por permissao_id
  const grupoPermsMap = useMemo(() => {
    const m = new Map<string, typeof permsGrupo[0]>();
    permsGrupo.forEach((p) => m.set(p.permissao_id, p));
    return m;
  }, [permsGrupo]);

  // Catálogo agrupado por app e, dentro de cada app, por submenu (mesma
  // hierarquia do menu lateral). Ordenado por app_ordem, depois submenu_ordem,
  // depois ordem_menu (ordem real do menu lateral) e, em empate, nome_exibicao.
  // Itens sem submenu ficam em primeiro lugar no app.
  const secoes = useMemo<SecaoApp[]>(() => {
    const apps = new Map<string, SecaoApp>();
    catalogo.forEach((p) => {
      if (!apps.has(p.app_chave)) {
        apps.set(p.app_chave, {
          app_chave: p.app_chave,
          app_label: p.app_label,
          app_ordem: p.app_ordem,
          itens: [],
          subgrupos: [],
        });
      }
      apps.get(p.app_chave)!.itens.push(p);
    });

    const arr = Array.from(apps.values()).sort((a, b) => a.app_ordem - b.app_ordem);

    arr.forEach((secao) => {
      const subMap = new Map<string, { submenu_chave: string | null; submenu_label: string | null; submenu_ordem: number; itens: CatalogoAppRow[] }>();
      secao.itens.forEach((p) => {
        const key = p.submenu_chave ?? "__sem_submenu__";
        if (!subMap.has(key)) {
          subMap.set(key, {
            submenu_chave: p.submenu_chave,
            submenu_label: p.submenu_label,
            submenu_ordem: p.submenu_ordem,
            itens: [],
          });
        }
        subMap.get(key)!.itens.push(p);
      });

      const subgrupos = Array.from(subMap.values()).sort((a, b) => {
        if (a.submenu_chave === null && b.submenu_chave !== null) return -1;
        if (a.submenu_chave !== null && b.submenu_chave === null) return 1;
        if (a.submenu_ordem !== b.submenu_ordem) return a.submenu_ordem - b.submenu_ordem;
        return (a.submenu_label ?? "").localeCompare(b.submenu_label ?? "", "pt-BR");
      });

      subgrupos.forEach((sg) => {
        sg.itens.sort((a, b) => {
          if (a.ordem_menu !== b.ordem_menu) return a.ordem_menu - b.ordem_menu;
          return a.nome_exibicao.localeCompare(b.nome_exibicao, "pt-BR");
        });
      });

      secao.subgrupos = subgrupos;
    });

    return arr;
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
          Marque por módulo. "Ver" abre a tela; "Editar" libera mexer nela. Ato específico se concede na seção Ações. Abas em cinza herdam a permissão de outra tela.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {secoes.map((secao) => (
          <SecaoBloco
            key={secao.app_chave}
            secao={secao}
            grupoPermsMap={grupoPermsMap}
            onToggle={(permissaoId, campo, valor) =>
              toggle.mutate({ grupoId, permissaoId, campo, valor })
            }
            onLiberarTudo={() =>
              liberarSecao.mutate({
                grupoId,
                itens: secao.itens,
                jaConcedidas: new Set(grupoPermsMap.keys()),
              })
            }
            disabled={toggle.isPending || liberarSecao.isPending}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function SecaoBloco({
  secao, grupoPermsMap, onToggle, onLiberarTudo, disabled,
}: {
  secao: SecaoApp;
  grupoPermsMap: Map<string, { pode_ver: boolean; pode_criar: boolean; pode_editar: boolean; pode_apagar: boolean }>;
  onToggle: (permissaoId: string, campo: "pode_ver" | "pode_criar" | "pode_editar" | "pode_apagar", valor: boolean) => void;
  onLiberarTudo: () => void;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const permissoes = secao.itens;
  const cor = corDoApp(secao.app_chave);
  const liberadas = permissoes.filter((p) => grupoPermsMap.get(p.permissao_id)?.pode_ver).length;
  const subtituloReserva = SUBTITULO_SECAO_RESERVA[secao.app_ordem];
  const atenuado = !!subtituloReserva;

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
          <div className="flex flex-col items-start gap-0.5 min-w-0">
            <span className={`font-medium text-sm ${atenuado ? "text-muted-foreground" : ""}`}>
              {secao.app_label}
            </span>
            {subtituloReserva && (
              <span className="text-[10px] text-muted-foreground/70">{subtituloReserva}</span>
            )}
          </div>
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
          <div className="grid grid-cols-[1fr_60px_60px] gap-2 px-4 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-medium border-b">
            <span>Permissão</span>
            <span className="text-center">Ver</span>
            <span className="text-center">Editar</span>
          </div>

          {secao.subgrupos.map((sub) => {
            const mostrarSubmenu =
              secao.subgrupos.length > 1 ||
              (secao.subgrupos.length === 1 && sub.submenu_label !== null);
            return (
              <div key={sub.submenu_chave ?? "__sem_submenu__"}>
                {mostrarSubmenu && (
                  <div className="px-4 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/30 border-b">
                    {sub.submenu_chave === null
                      ? "Sem submenu"
                      : (sub.submenu_label ?? sub.submenu_chave)}
                  </div>
                )}
                {sub.itens.map((p) => {
                  const gp = grupoPermsMap.get(p.permissao_id);
                  const isFicha = p.tipo === "ficha" || p.tipo === "processo";
                  return (
                    <Fragment key={p.permissao_id}>
                      <div
                        className="grid grid-cols-[1fr_60px_60px] gap-2 px-4 py-2 items-center text-sm hover:bg-muted/20 border-b last:border-b-0"
                      >
                        <div className={`flex flex-col min-w-0 justify-center ${p.eh_aba ? "pl-6" : ""}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            {p.eh_aba && <span className="text-muted-foreground/50 shrink-0">↳</span>}
                            <span className="truncate">{p.nome_exibicao}</span>
                            {p.contem_dado_sensivel && (
                              <Badge variant="outline" className="text-[9px] py-0 px-1">LGPD</Badge>
                            )}
                            {p.feature_em_teste && (
                              <Badge variant="outline" className="text-[9px] py-0 px-1 bg-warning/10">BETA</Badge>
                            )}
                            {p.telas_cobertas > 1 && (
                              <Badge
                                variant="outline"
                                className="text-[9px] py-0 px-1 shrink-0"
                                title={p.telas_lista ?? undefined}
                              >
                                {p.telas_cobertas} telas
                              </Badge>
                            )}
                            {p.fora_do_menu && (
                              <Badge
                                variant="outline"
                                className="text-[9px] py-0 px-1 shrink-0 text-muted-foreground"
                                title="Tela sem entrada no menu lateral — acessível por busca ou link direto"
                              >
                                fora do menu
                              </Badge>
                            )}
                            {p.tipo === "tela" && (
                              <span className="text-[9px] text-muted-foreground/60">tela</span>
                            )}
                          </div>
                          {p.descricao && (
                            <span
                              className="text-[10px] text-muted-foreground/70 truncate"
                              title={p.descricao}
                            >
                              {p.descricao}
                            </span>
                          )}
                        </div>
                        <div className="flex justify-center">
                          <Checkbox
                            checked={gp?.pode_ver || false}
                            onCheckedChange={(v) => onToggle(p.permissao_id, "pode_ver", !!v)}
                            disabled={disabled}
                          />
                        </div>
                        <div className="flex justify-center">
                          <Checkbox
                            checked={gp?.pode_editar || false}
                            onCheckedChange={(v) => onToggle(p.permissao_id, "pode_editar", !!v)}
                            disabled={disabled || !isFicha}
                            className={!isFicha ? "opacity-30" : ""}
                          />
                        </div>
                      </div>
                        {p.filhas_herdadas?.map((filha) => (
                          <div
                            key={`${p.permissao_id}-${filha.label}`}
                            className="grid grid-cols-[1fr_60px_60px] gap-2 px-4 py-1.5 border-b last:border-b-0 bg-muted/5"
                          >
                            <div className="flex items-center gap-2 min-w-0 pl-12">
                              <span className="text-muted-foreground/40 shrink-0">↳</span>
                              <span className="text-[13px] text-muted-foreground truncate">{filha.label}</span>
                              <span className="text-[9px] text-muted-foreground/60 shrink-0">herda de {filha.herda_de}</span>
                            </div>
                            <div />
                            <div />
                          </div>
                        ))}
                    </Fragment>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
