import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Brain, Pencil, Trash2, Plus, RotateCcw, ShieldAlert, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { AcessarMemoriasOutroDialog } from "@/components/fala-fetely/AcessarMemoriasOutroDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type TipoMemoria = "decisao" | "preferencia" | "fato" | "contexto_pessoal";

interface Memoria {
  id: string;
  tipo: TipoMemoria;
  resumo: string;
  conteudo_completo: string | null;
  relevancia: number;
  ativo: boolean;
  origem: string;
  tags: string[] | null;
  created_at: string;
  ultimo_uso: string | null;
}

interface MemoriaOutro {
  id: string;
  resumo: string;
  conteudo_completo: string | null;
  tipo: string;
  ativo: boolean;
  created_at: string;
  user_id: string;
}

const TIPO_LABELS: Record<TipoMemoria, string> = {
  decisao: "Decisão",
  preferencia: "Preferência",
  fato: "Fato",
  contexto_pessoal: "Contexto Pessoal",
};

const TIPO_CORES: Record<TipoMemoria, string> = {
  decisao: "bg-info/10 text-info border-info/40",
  preferencia: "bg-info/10 text-info border-info/40",
  fato: "bg-success/10 text-success border-success/40",
  contexto_pessoal: "bg-warning/10 text-warning border-warning/40",
};

function relevanciaLabel(r: number): { label: string; cor: string } {
  if (r >= 8) return { label: "Alta", cor: "bg-destructive/10 text-destructive" };
  if (r >= 5) return { label: "Média", cor: "bg-warning/10 text-warning" };
  return { label: "Baixa", cor: "bg-muted/10 text-muted-foreground" };
}

function formatData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function MinhasMemorias() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roles: authRoles } = useAuth();
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const [memorias, setMemorias] = useState<Memoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<string>("todas");
  const [apenasAtivas, setApenasAtivas] = useState(true);

  // Regra 5 — Super Admin acessando memórias de OUTRO usuário (com log formal)
  const [acessarOutroOpen, setAcessarOutroOpen] = useState(false);
  const [memoriasOutro, setMemoriasOutro] = useState<MemoriaOutro[] | null>(null);
  const [titularOutro, setTitularOutro] = useState<{ user_id: string; full_name: string | null } | null>(null);



  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<Memoria | null>(null);
  const [resumo, setResumo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [tipo, setTipo] = useState<TipoMemoria>("fato");
  const [relevancia, setRelevancia] = useState(5);
  const [salvando, setSalvando] = useState(false);

  const [confirmarEsquecer, setConfirmarEsquecer] = useState<Memoria | null>(null);

  useEffect(() => {
    if (!user) return;
    void carregar();
  }, [user]);

  async function carregar() {
    setLoading(true);
    const { data, error } = await supabase
      .from("fala_fetely_memoria")
      .select("*")
      .eq("user_id", user!.id)
      .order("relevancia", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    } else {
      setMemorias((data as Memoria[]) || []);
    }
    setLoading(false);
  }

  const memoriasFiltradas = useMemo(() => {
    return memorias.filter((m) => {
      if (apenasAtivas && !m.ativo) return false;
      if (filtroTipo !== "todas" && m.tipo !== filtroTipo) return false;
      return true;
    });
  }, [memorias, apenasAtivas, filtroTipo]);

  function abrirNova() {
    setEditando(null);
    setResumo("");
    setConteudo("");
    setTipo("fato");
    setRelevancia(5);
    setDialogAberto(true);
  }

  function abrirEditar(m: Memoria) {
    setEditando(m);
    setResumo(m.resumo);
    setConteudo(m.conteudo_completo || "");
    setTipo(m.tipo);
    setRelevancia(m.relevancia);
    setDialogAberto(true);
  }

  async function salvar() {
    if (!resumo.trim()) {
      toast({ title: "Resumo é obrigatório", variant: "destructive" });
      return;
    }
    setSalvando(true);
    try {
      if (editando) {
        const { error } = await supabase
          .from("fala_fetely_memoria")
          .update({
            resumo: resumo.trim(),
            conteudo_completo: conteudo.trim() || null,
            tipo,
            relevancia,
          })
          .eq("id", editando.id);
        if (error) throw error;
        toast({ title: "Memória atualizada ✨" });
      } else {
        const { error } = await supabase.from("fala_fetely_memoria").insert({
          user_id: user!.id,
          tipo,
          resumo: resumo.trim(),
          conteudo_completo: conteudo.trim() || null,
          relevancia,
          origem: "manual",
          ativo: true,
        });
        if (error) throw error;
        toast({ title: "Memória adicionada 🧠" });
      }
      setDialogAberto(false);
      await carregar();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  }

  async function esquecer(m: Memoria) {
    const { error } = await supabase
      .from("fala_fetely_memoria")
      .update({ ativo: false })
      .eq("id", m.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Esquecido. 🌸" });
      await carregar();
    }
    setConfirmarEsquecer(null);
  }

  async function reativar(m: Memoria) {
    const { error } = await supabase
      .from("fala_fetely_memoria")
      .update({ ativo: true })
      .eq("id", m.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Memória reativada 💚" });
      await carregar();
    }
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "linear-gradient(135deg, #FFF8F3 0%, #F0F7F4 100%)" }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate("/fala-fetely")} className="gap-1 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Fala Fetely
        </Button>
        <PageHeader
          icone={Brain}
          titulo="Minhas Memórias"
          estado="Tudo que o Fala Fetely lembra de você. Você pode editar ou esquecer qualquer memória a qualquer momento."
          acoes={
            <div className="flex items-center gap-2">
              {isSuperAdmin && (
                <Button variant="outline" onClick={() => setAcessarOutroOpen(true)} className="gap-2">
                  <ShieldAlert className="h-4 w-4" /> Ver memórias de outro usuário
                </Button>
              )}
              <Button onClick={abrirNova} style={{ backgroundColor: "#1A4A3A" }} className="text-white hover:opacity-90 gap-2">
                <Plus className="h-4 w-4" /> Adicionar memória
              </Button>
            </div>
          }
        />

        {/* Filtros */}
        <div className="flex items-center gap-4 flex-wrap bg-white/60 backdrop-blur-sm p-4 rounded-lg border">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Tipo:</Label>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="decisao">Decisões</SelectItem>
                <SelectItem value="preferencia">Preferências</SelectItem>
                <SelectItem value="fato">Fatos</SelectItem>
                <SelectItem value="contexto_pessoal">Contexto Pessoal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="apenas-ativas" checked={apenasAtivas} onCheckedChange={setApenasAtivas} />
            <Label htmlFor="apenas-ativas" className="text-sm cursor-pointer">
              Mostrar apenas ativas
            </Label>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {memoriasFiltradas.length} {memoriasFiltradas.length === 1 ? "memória" : "memórias"}
          </div>
        </div>

        {/* Listagem */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : memoriasFiltradas.length === 0 ? (
          <div className="text-center py-12 bg-white/60 backdrop-blur-sm rounded-lg border">
            <Brain className="h-12 w-12 mx-auto opacity-30 mb-3" />
            <p className="text-muted-foreground">
              {memorias.length === 0
                ? "Ainda não tenho memórias sobre você."
                : "Nenhuma memória com esses filtros."}
            </p>
            {memorias.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Conforme a gente conversa, eu vou aprendendo o que é importante pra você.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {memoriasFiltradas.map((m) => {
              const rel = relevanciaLabel(m.relevancia);
              return (
                <div
                  key={m.id}
                  className={`bg-white border rounded-lg p-4 shadow-sm transition-opacity ${
                    !m.ativo ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={TIPO_CORES[m.tipo]}>
                        {TIPO_LABELS[m.tipo]}
                      </Badge>
                      <Badge variant="outline" className={rel.cor}>
                        Relevância {rel.label}
                      </Badge>
                      {m.origem === "manual" && (
                        <Badge variant="outline" className="bg-muted/10 text-muted-foreground">
                          Manual
                        </Badge>
                      )}
                      {!m.ativo && (
                        <Badge variant="outline" className="bg-muted/15 text-muted-foreground">
                          Esquecida
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {m.ativo ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => abrirEditar(m)} title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmarEsquecer(m)}
                            title="Esquecer"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => reativar(m)} className="gap-1">
                          <RotateCcw className="h-3 w-3" /> Reativar
                        </Button>
                      )}
                    </div>
                  </div>
                  <h3 className="font-medium mt-2" style={{ color: "#1A4A3A" }}>
                    {m.resumo}
                  </h3>
                  {m.conteudo_completo && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                      {m.conteudo_completo}
                    </p>
                  )}
                  {m.tags && m.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {m.tags.map((t, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-3">
                    <span>Criada em {formatData(m.created_at)}</span>
                    {m.ultimo_uso && <span>Último uso: {formatData(m.ultimo_uso)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog Editar/Criar */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar memória" : "Adicionar memória"}</DialogTitle>
            <DialogDescription>
              {editando
                ? "Ajuste como o Fala Fetely deve lembrar disso."
                : "Cadastre algo que o Fala Fetely deve lembrar nas próximas conversas."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Resumo *</Label>
              <Input
                value={resumo}
                onChange={(e) => setResumo(e.target.value)}
                placeholder="Ex: Prefere respostas curtas e diretas"
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label>Conteúdo completo (opcional)</Label>
              <Textarea
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                placeholder="Detalhe quando for relevante..."
                rows={4}
                maxLength={2000}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoMemoria)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="decisao">Decisão</SelectItem>
                  <SelectItem value="preferencia">Preferência</SelectItem>
                  <SelectItem value="fato">Fato</SelectItem>
                  <SelectItem value="contexto_pessoal">Contexto Pessoal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Relevância</Label>
                <span className="text-sm font-medium" style={{ color: "#1A4A3A" }}>
                  {relevancia}/10
                </span>
              </div>
              <Slider
                value={[relevancia]}
                onValueChange={(v) => setRelevancia(v[0])}
                min={1}
                max={10}
                step={1}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={salvando || !resumo.trim()}
              style={{ backgroundColor: "#1A4A3A" }}
              className="text-white hover:opacity-90"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar esquecer */}
      <AlertDialog open={!!confirmarEsquecer} onOpenChange={(o) => !o && setConfirmarEsquecer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Esquecer essa memória?</AlertDialogTitle>
            <AlertDialogDescription>
              Eu não vou mais lembrar disso nas próximas conversas. Você pode reativar depois se mudar de ideia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmarEsquecer && esquecer(confirmarEsquecer)}
              className="bg-destructive hover:bg-destructive"
            >
              Esquecer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regra 5 — Dialog de acesso formal a memórias de outro usuário */}
      <AcessarMemoriasOutroDialog
        open={acessarOutroOpen}
        onOpenChange={setAcessarOutroOpen}
        onAcessoAprovado={(mems, titular) => {
          setMemoriasOutro(mems as MemoriaOutro[]);
          setTitularOutro(titular);
        }}
      />

      {/* View de memórias de outro usuário (após acesso aprovado) */}
      {memoriasOutro && titularOutro && (
        <div className="fixed inset-0 z-50 bg-background overflow-auto p-6">
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => {
                  setMemoriasOutro(null);
                  setTitularOutro(null);
                }}
                className="gap-1"
              >
                <X className="h-4 w-4" /> Fechar visualização
              </Button>
            </div>
            <Card className="bg-warning/10 border-warning/40">
              <CardContent className="p-3 text-sm">
                🔐 Você está visualizando memórias de{" "}
                <strong>{titularOutro.full_name || titularOutro.user_id}</strong>. Esse acesso foi
                registrado em log de auditoria e também é visível ao próprio titular.
              </CardContent>
            </Card>
            <h2 className="text-xl font-medium">Memórias ({memoriasOutro.length})</h2>
            {memoriasOutro.length === 0 ? (
              <p className="text-sm text-muted-foreground">Esse usuário não tem memórias armazenadas.</p>
            ) : (
              <div className="space-y-2">
                {memoriasOutro.map((m) => (
                  <Card key={m.id} className={m.ativo ? "" : "opacity-60"}>
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={TIPO_CORES[m.tipo as TipoMemoria]}>
                          {TIPO_LABELS[m.tipo as TipoMemoria]}
                        </Badge>
                        {!m.ativo && <Badge variant="secondary">inativa</Badge>}
                      </div>
                      <p className="text-sm font-medium">{m.resumo}</p>
                      {m.conteudo_completo && (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{m.conteudo_completo}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
