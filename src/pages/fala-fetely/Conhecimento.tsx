import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Search, BookOpen, Edit2, EyeOff, X, Loader2, GraduationCap, FileText, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { humanizeError } from "@/lib/errorMessages";
import { UploadPdfConhecimento } from "@/components/fala-fetely/UploadPdfConhecimento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { SugestoesPendentes, type SugestaoPendente } from "@/components/fala-fetely/SugestoesPendentes";
import { ConfirmacaoDupla } from "@/components/ConfirmacaoDupla";

type Categoria = "politica" | "regra" | "diretriz" | "faq" | "conceito" | "manifesto" | "mercado";

const CATEGORIAS: { value: Categoria; label: string; color: string; bg: string }[] = [
  { value: "politica",  label: "Política",  color: "#92400E", bg: "#FEF3C7" },
  { value: "regra",     label: "Regra",     color: "#991B1B", bg: "#FEE2E2" },
  { value: "diretriz",  label: "Diretriz",  color: "#1E40AF", bg: "#DBEAFE" },
  { value: "faq",       label: "FAQ",       color: "#374151", bg: "#E5E7EB" },
  { value: "conceito",  label: "Conceito",  color: "#5B21B6", bg: "#EDE9FE" },
  { value: "manifesto", label: "Manifesto", color: "#FFFFFF", bg: "#1A4A3A" },
  { value: "mercado",   label: "Mercado",   color: "#FFFFFF", bg: "#E8833A" },
];

// "Público-alvo" antigo (perfis) ficou conceitualmente errado.
// Substituído por "Área de negócio" carregado dinamicamente de parametros.

const NIVEIS = [
  { value: "junior",       label: "Júnior" },
  { value: "pleno",        label: "Pleno" },
  { value: "senior",       label: "Sênior" },
  { value: "coordenacao",  label: "Coordenação" },
  { value: "gerencia",     label: "Gerência" },
  { value: "c-level",      label: "C-Level" },
];

interface Conhecimento {
  id: string;
  categoria: Categoria;
  titulo: string;
  conteudo: string;
  area_negocio: string | null;
  publico_alvo: string;
  cargos_aplicaveis: string[];
  departamentos_aplicaveis: string[];
  niveis_aplicaveis: string[];
  fonte: string | null;
  tags: string[];
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

interface FormState {
  id?: string;
  categoria: Categoria;
  titulo: string;
  conteudo: string;
  area_negocio: string | null;
  cargos_aplicaveis: string[];
  departamentos_aplicaveis: string[];
  niveis_aplicaveis: string[];
  tags: string[];
  fonte: string;
}

const FORM_INICIAL: FormState = {
  categoria: "faq",
  titulo: "",
  conteudo: "",
  area_negocio: null,
  cargos_aplicaveis: [],
  departamentos_aplicaveis: [],
  niveis_aplicaveis: [],
  tags: [],
  fonte: "",
};

function getCategoriaStyle(c: string) {
  return CATEGORIAS.find((x) => x.value === c) ?? CATEGORIAS[3];
}

export default function Conhecimento() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roles: authRoles } = useAuth();
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const isAdminRH = (authRoles ?? []).includes("admin_rh") || (authRoles ?? []).includes("rh" as never);
  const userRoles = authRoles;
  const isLoading = false;
  const [mostrarUploadPdf, setMostrarUploadPdf] = useState(false);
  const [itens, setItens] = useState<Conhecimento[]>([]);
  const [sugestoes, setSugestoes] = useState<SugestaoPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");
  const [showForm, setShowForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [tagInput, setTagInput] = useState("");
  const [aprovandoSugestao, setAprovandoSugestao] = useState<SugestaoPendente | null>(null);
  const [confirmarDesativar, setConfirmarDesativar] = useState<Conhecimento | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Conhecimento | null>(null);

  const [cargos, setCargos] = useState<string[]>([]);
  const [departamentos, setDepartamentos] = useState<string[]>([]);

  const { data: areas } = useQuery({
    queryKey: ["parametros", "area_negocio"],
    queryFn: async () => {
      const { data } = await supabase
        .from("parametros")
        .select("valor, label")
        .eq("categoria", "area_negocio")
        .eq("ativo", true)
        .order("ordem");
      return Array.isArray(data) ? data : [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const podeAcessar = isSuperAdmin || isAdminRH;

  useEffect(() => {
    if (!isLoading && !podeAcessar) {
      navigate("/sem-permissao");
    }
  }, [isLoading, podeAcessar, navigate]);

  useEffect(() => {
    if (podeAcessar) {
      void carregar();
      void carregarSugestoes();
      void carregarMetadados();
    }
  }, [podeAcessar]);

  async function carregarSugestoes() {
    const { data } = await supabase
      .from("fala_fetely_sugestoes_conhecimento")
      .select("*")
      .eq("status", "pendente")
      .order("created_at", { ascending: false });
    setSugestoes((data || []) as SugestaoPendente[]);
  }

  async function carregar() {
    setLoading(true);
    const { data, error } = await supabase
      .from("fala_fetely_conhecimento")
      .select("id, categoria, titulo, conteudo, area_negocio, publico_alvo, cargos_aplicaveis, departamentos_aplicaveis, niveis_aplicaveis, fonte, tags, ativo, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setItens(
        (data || []).map((d: any) => ({
          ...d,
          cargos_aplicaveis: Array.isArray(d.cargos_aplicaveis) ? d.cargos_aplicaveis : [],
          departamentos_aplicaveis: Array.isArray(d.departamentos_aplicaveis) ? d.departamentos_aplicaveis : [],
          niveis_aplicaveis: Array.isArray(d.niveis_aplicaveis) ? d.niveis_aplicaveis : [],
          tags: d.tags || [],
        }))
      );
    }
    setLoading(false);
  }

  async function carregarMetadados() {
    const [{ data: cargosData }, { data: deptosData }] = await Promise.all([
      supabase.from("cargos").select("nome").eq("ativo", true).order("nome"),
      supabase.from("colaboradores_clt").select("departamento").not("departamento", "is", null),
    ]);
    setCargos(Array.from(new Set((cargosData || []).map((c: any) => c.nome))).sort());
    setDepartamentos(
      Array.from(new Set((deptosData || []).map((d: any) => d.departamento).filter(Boolean))).sort()
    );
  }

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return itens.filter((i) => {
      if (!i.ativo) return false;
      if (filtroCategoria !== "todas" && i.categoria !== filtroCategoria) return false;
      if (q && !i.titulo.toLowerCase().includes(q) && !i.conteudo.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [itens, busca, filtroCategoria]);

  function abrirNovo() {
    setForm(FORM_INICIAL);
    setShowForm(true);
  }

  function abrirEditar(item: Conhecimento) {
    setForm({
      id: item.id,
      categoria: item.categoria,
      titulo: item.titulo,
      conteudo: item.conteudo,
      area_negocio: item.area_negocio ?? null,
      cargos_aplicaveis: item.cargos_aplicaveis,
      departamentos_aplicaveis: item.departamentos_aplicaveis,
      niveis_aplicaveis: item.niveis_aplicaveis,
      tags: item.tags,
      fonte: item.fonte || "",
    });
    setShowForm(true);
  }

  async function salvar() {
    if (!form.titulo.trim() || !form.conteudo.trim()) {
      toast({ title: "Campos obrigatórios", description: "Título e conteúdo são obrigatórios", variant: "destructive" });
      return;
    }
    setSalvando(true);
    const payload = {
      categoria: form.categoria,
      titulo: form.titulo.trim(),
      conteudo: form.conteudo.trim(),
      area_negocio: form.area_negocio,
      publico_alvo: "todos",
      cargos_aplicaveis: form.cargos_aplicaveis,
      departamentos_aplicaveis: form.departamentos_aplicaveis,
      niveis_aplicaveis: form.niveis_aplicaveis,
      tags: form.tags,
      fonte: form.fonte.trim() || null,
      criado_por: user?.id ?? null,
    };
    let novoId: string | undefined;
    let erroFinal: any = null;
    if (form.id) {
      const { error } = await supabase.from("fala_fetely_conhecimento").update(payload).eq("id", form.id);
      erroFinal = error;
    } else {
      const { data, error } = await supabase
        .from("fala_fetely_conhecimento")
        .insert(payload)
        .select("id")
        .single();
      erroFinal = error;
      novoId = data?.id;
    }
    if (erroFinal) {
      setSalvando(false);
      toast({ title: "Erro ao salvar", description: erroFinal.message, variant: "destructive" });
      return;
    }
    // Se veio de uma sugestão, marcar como convertida
    if (aprovandoSugestao && novoId) {
      await supabase
        .from("fala_fetely_sugestoes_conhecimento")
        .update({
          status: "convertida",
          revisado_por: user?.id ?? null,
          revisado_em: new Date().toISOString(),
          conhecimento_gerado_id: novoId,
        })
        .eq("id", aprovandoSugestao.id);
      setAprovandoSugestao(null);
    }
    setSalvando(false);
    toast({ title: form.id ? "Atualizado ✨" : "Conhecimento criado 💚" });
    setShowForm(false);
    void carregar();
    void carregarSugestoes();
  }

  function abrirAprovarSugestao(s: SugestaoPendente) {
    setAprovandoSugestao(s);
    setForm({
      categoria: (s.categoria_sugerida as Categoria) || "faq",
      titulo: s.titulo_sugerido || s.correcao_sugerida.slice(0, 60),
      conteudo: s.correcao_sugerida,
      area_negocio: null,
      cargos_aplicaveis: [],
      departamentos_aplicaveis: [],
      niveis_aplicaveis: [],
      tags: [],
      fonte: s.pergunta_original ? `Sugerido a partir de pergunta: "${s.pergunta_original.slice(0, 100)}"` : "",
    });
    setShowForm(true);
  }

  async function handleDeleteConhecimento() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("fala_fetely_conhecimento").delete().eq("id", deleteTarget.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: humanizeError(error.message), variant: "destructive" });
    } else {
      toast({ title: "Conhecimento excluído permanentemente" });
      void carregar();
    }
    setDeleteTarget(null);
  }

  async function desativar(item: Conhecimento) {
    const { error } = await supabase.from("fala_fetely_conhecimento").update({ ativo: false }).eq("id", item.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Desativado" });
    void carregar();
  }

  function adicionarTag() {
    const t = tagInput.trim().toLowerCase();
    if (!t || form.tags.includes(t)) return;
    setForm({ ...form, tags: [...form.tags, t] });
    setTagInput("");
  }

  function toggleArrayItem(field: "cargos_aplicaveis" | "departamentos_aplicaveis" | "niveis_aplicaveis", value: string) {
    const arr = form[field];
    setForm({
      ...form,
      [field]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
    });
  }

  if (isLoading || !podeAcessar) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "linear-gradient(135deg, #FFF8F3 0%, #F0F7F4 100%)" }}>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Button variant="ghost" onClick={() => navigate("/fala-fetely")} className="gap-1 mb-2 -ml-3">
              <ArrowLeft className="h-4 w-4" /> Voltar ao Fala Fetely
            </Button>
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6" style={{ color: "#1A4A3A" }} />
              <h1 className="text-2xl font-medium" style={{ color: "#1A4A3A" }}>Base de Conhecimento</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Ensine o Fala Fetely sobre cultura, regras, mercado e diretrizes da empresa
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(isSuperAdmin || isAdminRH || (userRoles as string[]).includes("gestor_rh")) && (
              <Button
                variant="outline"
                onClick={() => setMostrarUploadPdf(true)}
                className="gap-2"
              >
                <FileText className="h-4 w-4" /> A partir de PDF
              </Button>
            )}
            <Button onClick={abrirNovo} className="gap-2 text-white hover:opacity-90" style={{ backgroundColor: "#1A4A3A" }}>
              <Plus className="h-4 w-4" /> Novo Conhecimento
            </Button>
          </div>
        </div>

        <UploadPdfConhecimento
          open={mostrarUploadPdf}
          onOpenChange={setMostrarUploadPdf}
          onConhecimentosCriados={() => void carregar()}
        />

        {/* Filtros */}
        <Card className="p-4 flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por título ou conteúdo..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {CATEGORIAS.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground">
            {filtrados.length} {filtrados.length === 1 ? "item" : "itens"}
          </div>
        </Card>

        {/* Tabs: Base ativa + Sugestões pendentes */}
        <Tabs defaultValue="base" className="space-y-4">
          <TabsList>
            <TabsTrigger value="base" className="gap-2">
              📚 Base Ativa ({itens.filter((i) => i.ativo).length})
            </TabsTrigger>
            <TabsTrigger value="sugestoes" className="gap-2">
              <GraduationCap className="h-3.5 w-3.5" /> Sugestões Pendentes
              {sugestoes.length > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                  {sugestoes.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="base">
            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
              </div>
            ) : filtrados.length === 0 ? (
              <Card className="p-12 text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground">
                  {itens.length === 0 ? "Nenhum conhecimento ainda. Crie o primeiro!" : "Nada encontrado com esses filtros."}
                </p>
              </Card>
            ) : (
              <div className="grid gap-3">
                {filtrados.map((item) => {
                  const cat = getCategoriaStyle(item.categoria);
                  return (
                    <Card key={item.id} className="p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge style={{ backgroundColor: cat.bg, color: cat.color, border: 0 }} className="text-[10px] uppercase tracking-wide">
                              {cat.label}
                            </Badge>
                            {item.area_negocio && (
                              <Badge variant="outline" className="text-[10px]">
                                🎯 {(areas || []).find((a: any) => a.valor === item.area_negocio)?.label || item.area_negocio}
                              </Badge>
                            )}
                            {item.niveis_aplicaveis.length > 0 && (
                              <Badge variant="outline" className="text-[10px]">
                                {item.niveis_aplicaveis.length} nível(is)
                              </Badge>
                            )}
                            {item.cargos_aplicaveis.length > 0 && (
                              <Badge variant="outline" className="text-[10px]">
                                {item.cargos_aplicaveis.length} cargo(s)
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-medium text-base">{item.titulo}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {item.conteudo.length > 220 ? item.conteudo.slice(0, 220) + "..." : item.conteudo}
                          </p>
                          {item.tags.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {item.tags.map((t) => (
                                <span key={t} className="text-[10px] bg-muted px-2 py-0.5 rounded-full">#{t}</span>
                              ))}
                            </div>
                          )}
                          {item.fonte && (
                            <p className="text-[10px] text-muted-foreground italic">Fonte: {item.fonte}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <Button variant="ghost" size="sm" onClick={() => abrirEditar(item)} className="gap-1">
                            <Edit2 className="h-3.5 w-3.5" /> Editar
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmarDesativar(item)} className="gap-1 text-muted-foreground hover:text-destructive">
                            <EyeOff className="h-3.5 w-3.5" /> Desativar
                          </Button>
                          {isSuperAdmin && (
                            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(item)} className="gap-1 text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" /> Excluir
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="sugestoes">
            <SugestoesPendentes
              sugestoes={sugestoes}
              onAprovar={abrirAprovarSugestao}
              onAtualizar={() => void carregarSugestoes()}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog formulário */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar Conhecimento" : "Novo Conhecimento"}</DialogTitle>
            <DialogDescription>
              Conteúdo que o Fala Fetely usará como fonte de verdade ao responder.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria *</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v as Categoria })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Área de negócio</Label>
                <Select
                  value={form.area_negocio ?? "__todas__"}
                  onValueChange={(v) => setForm({ ...form, area_negocio: v === "__todas__" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todas__">Todas as áreas (geral)</SelectItem>
                    {(areas || []).map((a: any) => (
                      <SelectItem key={a.valor} value={a.valor}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Área de negócio à qual o conhecimento se aplica. Cargos, departamentos e níveis específicos abaixo.
                </p>
              </div>
            </div>

            <div>
              <Label>Título *</Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex: Celular corporativo — quem tem direito"
              />
            </div>

            <div>
              <Label>Conteúdo * (suporta markdown)</Label>
              <Textarea
                value={form.conteudo}
                onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                rows={8}
                placeholder="Descreva o conhecimento de forma clara e completa..."
              />
            </div>

            <div>
              <Label>Níveis aplicáveis (opcional)</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {NIVEIS.map((n) => (
                  <label key={n.value} className="flex items-center gap-1.5 text-sm bg-muted/40 px-2.5 py-1 rounded-md cursor-pointer hover:bg-muted">
                    <Checkbox
                      checked={form.niveis_aplicaveis.includes(n.value)}
                      onCheckedChange={() => toggleArrayItem("niveis_aplicaveis", n.value)}
                    />
                    {n.label}
                  </label>
                ))}
              </div>
            </div>

            {cargos.length > 0 && (
              <div>
                <Label>Cargos aplicáveis (opcional)</Label>
                <div className="flex flex-wrap gap-2 mt-1 max-h-32 overflow-y-auto p-2 bg-muted/20 rounded-md">
                  {cargos.map((c) => (
                    <label key={c} className="flex items-center gap-1.5 text-xs bg-background px-2 py-1 rounded cursor-pointer hover:bg-muted">
                      <Checkbox
                        checked={form.cargos_aplicaveis.includes(c)}
                        onCheckedChange={() => toggleArrayItem("cargos_aplicaveis", c)}
                      />
                      {c}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {departamentos.length > 0 && (
              <div>
                <Label>Departamentos aplicáveis (opcional)</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {departamentos.map((d) => (
                    <label key={d} className="flex items-center gap-1.5 text-xs bg-muted/40 px-2 py-1 rounded cursor-pointer hover:bg-muted">
                      <Checkbox
                        checked={form.departamentos_aplicaveis.includes(d)}
                        onCheckedChange={() => toggleArrayItem("departamentos_aplicaveis", d)}
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarTag(); } }}
                  placeholder="Pressione Enter para adicionar"
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={adicionarTag}>Adicionar</Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.tags.map((t) => (
                    <span key={t} className="text-xs bg-muted px-2 py-1 rounded-full flex items-center gap-1">
                      #{t}
                      <button onClick={() => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Fonte</Label>
              <Input
                value={form.fonte}
                onChange={(e) => setForm({ ...form, fonte: e.target.value })}
                placeholder="Ex: Definido por Flavio em DD/MM/AAAA"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando} style={{ backgroundColor: "#1A4A3A" }} className="text-white hover:opacity-90 gap-2">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              {form.id ? "Salvar alterações" : "Criar conhecimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação dupla: desativar conhecimento (Regra 18) */}
      <ConfirmacaoDupla
        open={!!confirmarDesativar}
        onOpenChange={(o) => !o && setConfirmarDesativar(null)}
        titulo="Desativar este conhecimento?"
        descricao={
          <p>
            <strong>{confirmarDesativar?.titulo}</strong> não aparecerá mais nas respostas do Fala
            Fetely. Você pode reativar depois pela base inativa.
          </p>
        }
        textoConfirmacao="APAGAR"
        placeholder="APAGAR"
        acaoLabel="Desativar"
        onConfirmar={async () => {
          if (confirmarDesativar) {
            await desativar(confirmarDesativar);
            setConfirmarDesativar(null);
          }
        }}
      />

      {/* Excluir permanentemente (super_admin) */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conhecimento permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.titulo}" será removido permanentemente da base. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConhecimento} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
