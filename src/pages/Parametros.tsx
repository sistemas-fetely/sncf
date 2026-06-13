import { useState, useMemo } from "react";
import { useAllParametros } from "@/hooks/useParametros";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Pencil, Trash2, Loader2, Monitor, Package, Settings2, FileText, Search, Heart, ChevronDown, ExternalLink, MoreHorizontal, X, CalendarClock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Parametro } from "@/hooks/useParametros";
import { usePerfisV2 } from "@/hooks/usePerfisV2";
import ParametrosFinanceiroTab from "@/components/financeiro/ParametrosFinanceiroTab";
import ParametrosUnidadesSection from "@/components/parametros/ParametrosUnidadesSection";

interface CategoriaConfig {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const CATEGORIAS_GERAL: CategoriaConfig[] = [
  { value: "area_negocio", label: "Áreas e Departamentos", icon: Monitor, description: "Estrutura organizacional: cada área contém seus departamentos. Cada pessoa pertence a 1 área e 1 departamento." },
  { value: "local_trabalho", label: "Locais de Trabalho", icon: Monitor, description: "Locais de trabalho disponíveis para colaboradores" },
  { value: "sistema", label: "Sistemas e Ferramentas", icon: Monitor, description: "Sistemas e ferramentas utilizados pela empresa" },
  { value: "beneficio", label: "Benefícios", icon: Heart, description: "Tipos de benefícios oferecidos pela empresa" },
  { value: "tipo_equipamento", label: "Tipos de Equipamento", icon: Package, description: "Tipos de equipamentos e seus estados" },
];

const CATEGORIAS_CLT: CategoriaConfig[] = [
  { value: "tipo_contrato", label: "Tipos de Contrato", icon: Settings2, description: "Modalidades de contrato CLT conforme legislação" },
  { value: "jornada", label: "Jornadas", icon: Settings2, description: "Jornadas de trabalho e escalas" },
  { value: "encargo_folha", label: "Encargos Folha", icon: FileText, description: "Alíquotas de FGTS, INSS Patronal, VT e dedução IRRF" },
  { value: "inss_faixa", label: "Faixas INSS", icon: FileText, description: "Faixas progressivas de contribuição INSS do empregado" },
  { value: "irrf_faixa", label: "Faixas IRRF", icon: FileText, description: "Faixas progressivas do Imposto de Renda Retido na Fonte" },
];

const CATEGORIAS_PJ: CategoriaConfig[] = [
  { value: "forma_pagamento", label: "Formas de Pagamento", icon: Settings2, description: "Formas de pagamento para prestadores PJ" },
];

const CATEGORIAS_FINANCEIRO: CategoriaConfig[] = [
  { value: "dias_primeiro_pagamento", label: "Dias do 1º Pagamento", icon: CalendarClock, description: "Margem em dias para o vencimento do 1º pagamento na cobrança (padrão 9 = 7 dias úteis)" },
];

// NOVAS ABAS: adicionar aqui conforme novos módulos forem ativados
// Exemplos futuros: Financeiro, Benefícios, Recrutamento, Operacional

const MODULO_MAP: Record<string, { label: string; categorias: CategoriaConfig[] }> = {
  geral: { label: "Geral", categorias: CATEGORIAS_GERAL },
  clt: { label: "CLT", categorias: CATEGORIAS_CLT },
  pj: { label: "PJ", categorias: CATEGORIAS_PJ },
  financeiro: { label: "Financeiro", categorias: CATEGORIAS_FINANCEIRO },
};

/* ── Usage counts hook ── */
function useParametroUsage() {
  return useQuery({
    queryKey: ["parametro-usage"],
    queryFn: async () => {
      const [cltRes, pjRes] = await Promise.all([
        supabase.from("colaboradores_clt").select("cargo, departamento", { count: "exact" }),
        supabase.from("contratos_pj").select("tipo_servico, departamento", { count: "exact" }),
      ]);

      const usage: Record<string, Record<string, number>> = {
        cargo: {},
        departamento: {},
        tipo_servico: {},
      };

      (cltRes.data || []).forEach((c) => {
        if (c.cargo) usage.cargo[c.cargo] = (usage.cargo[c.cargo] || 0) + 1;
        if (c.departamento) usage.departamento[c.departamento] = (usage.departamento[c.departamento] || 0) + 1;
      });
      (pjRes.data || []).forEach((c) => {
        if (c.tipo_servico) usage.tipo_servico[c.tipo_servico] = (usage.tipo_servico[c.tipo_servico] || 0) + 1;
        if (c.departamento) usage.departamento[c.departamento] = (usage.departamento[c.departamento] || 0) + 1;
      });

      return usage;
    },
    staleTime: 30_000,
  });
}

/* ── Form dialog ── */
function parseSistemaMeta(descricao: string | null): { url: string; tipo_licenca: string; custo_mensal: number; tipo_acesso: string; instrucoes_cadastro: string; perfis_acesso: string[] } {
  const defaults = { url: "", tipo_licenca: "gratuito", custo_mensal: 0, tipo_acesso: "login_individual", instrucoes_cadastro: "", perfis_acesso: ["admin", "usuario", "visualizador"] };
  if (!descricao) return defaults;
  try {
    const parsed = JSON.parse(descricao);
    return {
      url: parsed.url || "",
      tipo_licenca: parsed.tipo_licenca || "gratuito",
      custo_mensal: parsed.custo_mensal ?? 0,
      tipo_acesso: parsed.tipo_acesso || "login_individual",
      instrucoes_cadastro: parsed.instrucoes_cadastro || "",
      perfis_acesso: parsed.perfis_acesso || ["admin", "usuario", "visualizador"],
    };
  } catch {
    return defaults;
  }
}

function ParametroForm({
  open, onClose, parametro, categoria, paiValor,
}: {
  open: boolean;
  onClose: () => void;
  parametro: Parametro | null;
  categoria: string;
  paiValor: string | null;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [valor, setValor] = useState(parametro?.valor || "");
  const [label, setLabel] = useState(parametro?.label || "");
  const [descricao, setDescricao] = useState(parametro?.descricao || "");
  const [ordem, setOrdem] = useState(parametro?.ordem ?? 0);
  const [perfilAreaCodigo, setPerfilAreaCodigo] = useState<string | null>(
    parametro?.perfil_area_codigo || null
  );

  const { data: perfis } = usePerfisV2();
  const perfisArea = (perfis || []).filter((p) => p.tipo === "area");

  const isSistema = categoria === "sistema";
  const meta = parseSistemaMeta(isSistema ? parametro?.descricao ?? null : null);
  const [sistemaUrl, setSistemaUrl] = useState(meta.url);
  const [tipoLicenca, setTipoLicenca] = useState(meta.tipo_licenca);
  const [custoMensal, setCustoMensal] = useState(meta.custo_mensal);
  const [tipoAcesso, setTipoAcesso] = useState(meta.tipo_acesso);
  const [instrucoesCadastro, setInstrucoesCadastro] = useState(meta.instrucoes_cadastro);
  const [perfisAcesso, setPerfisAcesso] = useState<string[]>(meta.perfis_acesso);
  const [novoPerfil, setNovoPerfil] = useState("");

  const handleSave = async () => {
    if (!label.trim()) { toast.error("O nome é obrigatório"); return; }
    const valorFinal = valor.trim() || label.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

    let descricaoFinal: string | null = descricao.trim() || null;
    if (isSistema) {
      descricaoFinal = JSON.stringify({
        url: sistemaUrl.trim(),
        tipo_licenca: tipoLicenca,
        custo_mensal: custoMensal || 0,
        tipo_acesso: tipoAcesso,
        instrucoes_cadastro: instrucoesCadastro.trim(),
        perfis_acesso: perfisAcesso.filter(Boolean),
      });
    }

    setSaving(true);
    try {
      if (parametro) {
        const { error } = await supabase
          .from("parametros")
          .update({
            valor: valorFinal,
            label: label.trim(),
            descricao: descricaoFinal,
            ordem,
            pai_valor: paiValor,
            perfil_area_codigo: categoria === "departamento" ? perfilAreaCodigo : null,
          } as any)
          .eq("id", parametro.id);
        if (error) throw error;
        toast.success("Parâmetro atualizado!");
      } else {
        const { error } = await supabase
          .from("parametros")
          .insert({
            categoria,
            valor: valorFinal,
            label: label.trim(),
            descricao: descricaoFinal,
            ordem,
            pai_valor: paiValor,
            perfil_area_codigo: categoria === "departamento" ? perfilAreaCodigo : null,
          } as any);
        if (error) throw error;
        toast.success("Parâmetro adicionado!");
      }
      queryClient.invalidateQueries({ queryKey: ["parametros"] });
      queryClient.invalidateQueries({ queryKey: ["parametro-usage"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{parametro ? "Editar" : "Novo"} {isSistema ? "Sistema" : "Parâmetro"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{isSistema ? "Nome do sistema" : "Nome"} *</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={isSistema ? "Ex: Google Workspace" : "Ex: Departamento"} />
          </div>
          {categoria === "departamento" && paiValor && (
            <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
              Este departamento será vinculado à área: <strong>{paiValor}</strong>
            </div>
          )}
          {categoria === "departamento" && (
            <div className="space-y-2">
              <Label>Perfil de área aplicado automaticamente</Label>
              <Select
                value={perfilAreaCodigo ?? "__nenhum__"}
                onValueChange={(v) => setPerfilAreaCodigo(v === "__nenhum__" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o perfil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhum__">Nenhum (só transversal)</SelectItem>
                  {perfisArea.map((p) => (
                    <SelectItem key={p.id} value={p.codigo}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Quando alguém for alocado neste departamento, este perfil de área será atribuído automaticamente.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label>Código (valor)</Label>
            <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Auto-gerado se vazio" />
            <p className="text-xs text-muted-foreground">Identificador interno. Se vazio, será gerado a partir do nome.</p>
          </div>

          {isSistema ? (
            <>
              <div className="space-y-2">
                <Label>URL de acesso</Label>
                <Input value={sistemaUrl} onChange={(e) => setSistemaUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label>Tipo de licença</Label>
                <Select value={tipoLicenca} onValueChange={setTipoLicenca}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="por_usuario">Por usuário</SelectItem>
                    <SelectItem value="conta_unica">Conta única</SelectItem>
                    <SelectItem value="gratuito">Gratuito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Custo mensal estimado (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={custoMensal || ""}
                  onChange={(e) => setCustoMensal(Number(e.target.value))}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de acesso</Label>
                <Select value={tipoAcesso} onValueChange={setTipoAcesso}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="login_individual">Login individual (cada usuário tem o seu)</SelectItem>
                    <SelectItem value="sso">SSO (login único corporativo)</SelectItem>
                    <SelectItem value="conta_compartilhada">Conta compartilhada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Perfis de acesso disponíveis</Label>
                <div className="flex flex-wrap gap-1.5">
                  {perfisAcesso.map((perfil, idx) => (
                    <Badge key={idx} variant="secondary" className="gap-1 cursor-pointer" onClick={() => setPerfisAcesso(perfisAcesso.filter((_, i) => i !== idx))}>
                      {perfil} <X className="h-3 w-3" />
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={novoPerfil}
                    onChange={(e) => setNovoPerfil(e.target.value)}
                    placeholder="Novo perfil (ex: editor)"
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && novoPerfil.trim()) {
                        e.preventDefault();
                        setPerfisAcesso([...perfisAcesso, novoPerfil.trim()]);
                        setNovoPerfil("");
                      }
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => {
                    if (novoPerfil.trim()) {
                      setPerfisAcesso([...perfisAcesso, novoPerfil.trim()]);
                      setNovoPerfil("");
                    }
                  }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Esses perfis aparecerão como opções na ficha do colaborador</p>
              </div>
              <div className="space-y-2">
                <Label>Instruções de cadastro</Label>
                <Textarea
                  value={instrucoesCadastro}
                  onChange={(e) => setInstrucoesCadastro(e.target.value)}
                  placeholder="Passo a passo para criar acesso neste sistema. Ex: 1. Acesse admin.google.com 2. Clique em Adicionar usuário..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">Instruções visíveis para quem executar a tarefa de onboarding</p>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição opcional" />
            </div>
          )}

          <div className="space-y-2">
            <Label>Ordem de exibição</Label>
            <Input type="number" value={ordem} onChange={(e) => setOrdem(Number(e.target.value))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Usage badge component ── */
function UsageBadge({ count }: { count: number | undefined }) {
  if (count === undefined) return null;
  if (count === 0) {
    return <Badge variant="destructive" className="text-[10px]">Sem uso</Badge>;
  }
  return (
    <Badge variant="secondary" className="text-[10px]">
      {count} {count === 1 ? "colaborador" : "colaboradores"}
    </Badge>
  );
}

/* ── Main page ── */
export default function Parametros() {
  const [searchParams, setSearchParams] = useSearchParams();
  const modulo = searchParams.get("modulo") || "geral";
  const { isSuperAdmin } = usePermissions();

  const { data: allParams, isLoading } = useAllParametros();
  const { data: usageData } = useParametroUsage();
  const queryClient = useQueryClient();
  const [editParam, setEditParam] = useState<Parametro | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formCategoria, setFormCategoria] = useState("");
  const [formPaiValor, setFormPaiValor] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Parametro | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [clevelConfirm, setClevelConfirm] = useState<{ param: Parametro; enabling: boolean } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const handleModuloChange = (value: string) => {
    setSearchParams({ modulo: value });
    setSearchTerm("");
  };

  const config = MODULO_MAP[modulo] || MODULO_MAP.geral;
  const CATEGORIAS = config.categorias;

  const handleToggleAtivo = async (param: Parametro) => {
    const { error } = await supabase
      .from("parametros")
      .update({ ativo: !param.ativo } as any)
      .eq("id", param.id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    queryClient.invalidateQueries({ queryKey: ["parametros"] });
  };

  const handleToggleCLevel = async (param: Parametro) => {
    setClevelConfirm({ param, enabling: !param.is_clevel });
  };

  const doToggleCLevel = async (param: Parametro) => {
    const { error } = await supabase
      .from("parametros")
      .update({ is_clevel: !param.is_clevel } as any)
      .eq("id", param.id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    toast.success(param.is_clevel ? "Restrição C-Level removida" : "Cargo marcado como C-Level");
    queryClient.invalidateQueries({ queryKey: ["parametros"] });
    queryClient.invalidateQueries({ queryKey: ["clevel-cargos"] });
  };

  const handleConfirmCLevel = async () => {
    if (!clevelConfirm) return;
    await doToggleCLevel(clevelConfirm.param);
    setClevelConfirm(null);
  };

  const getUsageCount = (param: Parametro): number | undefined => {
    // Departamento is a reference parameter without formal FK — skip usage tracking
    if (param.categoria === "departamento") return undefined;
    if (!usageData) return undefined;
    const catUsage = usageData[param.categoria];
    if (!catUsage) return undefined;
    return catUsage[param.valor] || 0;
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("parametros").delete().eq("id", deleteTarget.id);
    if (error) { toast.error(error.message); }
    else { toast.success("Parâmetro removido"); }
    queryClient.invalidateQueries({ queryKey: ["parametros"] });
    setDeleteTarget(null);
    setDeleting(false);
  };

  const openNew = (cat: string) => {
    setEditParam(null);
    setFormCategoria(cat);
    setFormPaiValor(null);
    setFormOpen(true);
  };

  const openEdit = (param: Parametro) => {
    setEditParam(param);
    setFormCategoria(param.categoria);
    setFormPaiValor(param.pai_valor || null);
    setFormOpen(true);
  };

  const openNewDepartamento = (areaValor: string) => {
    setEditParam(null);
    setFormCategoria("departamento");
    setFormPaiValor(areaValor);
    setFormOpen(true);
  };

  const estadosEquipamento = useMemo(() => {
    return (allParams || []).filter((p) => p.categoria === "estado_equipamento" && p.ativo);
  }, [allParams]);

  const departamentosPorArea = useMemo(() => {
    const map: Record<string, Parametro[]> = {};
    (allParams || [])
      .filter((p) => p.categoria === "departamento")
      .forEach((p) => {
        const chave = p.pai_valor || "__sem_area__";
        if (!map[chave]) map[chave] = [];
        map[chave].push(p);
      });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => a.ordem - b.ordem);
    });
    return map;
  }, [allParams]);

  const grouped = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return CATEGORIAS.map((cat) => {
      const allItems = (allParams || []).filter((p) => p.categoria === cat.value);
      const filteredItems = lowerSearch
        ? allItems.filter((p) => p.label.toLowerCase().includes(lowerSearch))
        : allItems;
      return { ...cat, items: filteredItems, totalCount: allItems.length };
    });
  }, [CATEGORIAS, allParams, searchTerm]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Parâmetros</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie as opções disponíveis nas listas de cadastro
        </p>
      </div>

      {/* Top-level module tabs */}
      <Tabs value={modulo} onValueChange={handleModuloChange}>
        <TabsList>
          {Object.entries(MODULO_MAP).map(([key, val]) => (
            <TabsTrigger key={key} value={key}>{val.label}</TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(MODULO_MAP).map(([key]) => (
          <TabsContent key={key} value={key}>
            {key === "financeiro" ? (
              <ParametrosFinanceiroTab />
            ) : isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Search */}
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={`Buscar em ${config.label}...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Sub-tabs (categories) */}
                <Tabs defaultValue={CATEGORIAS[0]?.value}>
                  <TabsList className="flex-wrap h-auto">
                    {grouped.map((cat) => (
                      <TabsTrigger key={cat.value} value={cat.value} className="gap-2">
                        <cat.icon className="h-4 w-4" />
                        {cat.label}
                        <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0">
                          {cat.totalCount}
                        </Badge>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {grouped.map((cat) => {
                    return (
                      <TabsContent key={cat.value} value={cat.value}>
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <div>
                              <CardTitle className="text-lg">{cat.label}</CardTitle>
                              <p className="text-sm text-muted-foreground">{cat.description}</p>
                            </div>
                            <Button onClick={() => openNew(cat.value)} className="gap-2" size="sm">
                              <Plus className="h-4 w-4" /> Adicionar
                            </Button>
                          </CardHeader>
                          <CardContent>
                            {cat.items.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-8">
                                {searchTerm
                                  ? `Nenhum parâmetro encontrado para "${searchTerm}"`
                                  : "Nenhum parâmetro cadastrado nesta categoria."}
                              </p>
                            ) : (
                              <div className="space-y-2">
                                <TooltipProvider>
                                  {cat.items.map((param) => {
                                    const usageCount = getUsageCount(param);
                                    const isInUse = usageCount !== undefined && usageCount > 0;
                                    const isSistemaItem = param.categoria === "sistema";
                                    const sistemaMeta = isSistemaItem ? parseSistemaMeta(param.descricao) : null;

                                    if (isSistemaItem) {
                                      return (
                                        <div
                                          key={param.id}
                                          className={`flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors ${!param.ativo ? "opacity-60" : ""}`}
                                        >
                                          <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <Switch
                                              checked={param.ativo}
                                              onCheckedChange={() => handleToggleAtivo(param)}
                                            />
                                            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                              <Monitor className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                            <div className="min-w-0">
                                              <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium">{param.label}</p>
                                                {!param.ativo && (
                                                  <Badge variant="secondary" className="text-[10px]">Inativo</Badge>
                                                )}
                                              </div>
                                              {sistemaMeta?.url && (
                                                <a
                                                  href={sistemaMeta.url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                                                >
                                                  {sistemaMeta.url}
                                                  <ExternalLink className="h-3 w-3" />
                                                </a>
                                              )}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-3 ml-2">
                                            {sistemaMeta && sistemaMeta.custo_mensal > 0 && (
                                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                R$ {sistemaMeta.custo_mensal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês
                                              </span>
                                            )}
                                            <Badge variant="outline" className="text-xs whitespace-nowrap">
                                              {sistemaMeta?.tipo_licenca === "por_usuario" ? "Por usuário" :
                                               sistemaMeta?.tipo_licenca === "conta_unica" ? "Conta única" : "Gratuito"}
                                            </Badge>
                                            <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                  <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => openEdit(param)}>
                                                  <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleToggleAtivo(param)}>
                                                  {param.ativo ? "Desativar" : "Ativar"}
                                                </DropdownMenuItem>
                                                {!isInUse && (
                                                  <DropdownMenuItem
                                                    className="text-destructive focus:text-destructive"
                                                    onClick={() => setDeleteTarget(param)}
                                                  >
                                                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                                                  </DropdownMenuItem>
                                                )}
                                              </DropdownMenuContent>
                                            </DropdownMenu>
                                          </div>
                                        </div>
                                      );
                                    }

                                    return (
                                      <div
                                        key={param.id}
                                        className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                                      >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                          <Switch
                                            checked={param.ativo}
                                            onCheckedChange={() => handleToggleAtivo(param)}
                                          />
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="font-medium text-sm">{param.label}</span>
                                              <Badge variant="outline" className="text-[10px] font-mono">
                                                {param.valor}
                                              </Badge>
                                              {!param.ativo && (
                                                <Badge variant="secondary" className="text-[10px]">Inativo</Badge>
                                              )}
                                              <UsageBadge count={usageCount} />
                                            </div>
                                            {param.descricao && (
                                              <p className="text-xs text-muted-foreground truncate">{param.descricao}</p>
                                            )}
                                            {param.categoria === "tipo_equipamento" && (
                                              <div className="mt-2 pt-2 border-t">
                                                <div className="flex flex-wrap gap-1 mb-1">
                                                  {estadosEquipamento.length > 0 ? (
                                                    estadosEquipamento.map((e) => (
                                                      <span key={e.id} className="text-xs px-2 py-0.5 rounded-full bg-muted">{e.label}</span>
                                                    ))
                                                  ) : (
                                                    <span className="text-xs text-muted-foreground">Nenhum estado cadastrado</span>
                                                  )}
                                                </div>
                                                <Collapsible>
                                                  <CollapsibleTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-muted-foreground">
                                                      <ChevronDown className="h-3 w-3" />
                                                      Gerenciar estados
                                                    </Button>
                                                  </CollapsibleTrigger>
                                                  <CollapsibleContent className="mt-2 space-y-1">
                                                    {estadosEquipamento.map((e) => (
                                                      <div key={e.id} className="flex items-center justify-between rounded px-2 py-1 bg-muted/50">
                                                        <span className="text-xs">{e.label}</span>
                                                        <div className="flex gap-1">
                                                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(e)}>
                                                            <Pencil className="h-3 w-3" />
                                                          </Button>
                                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(e)}>
                                                            <Trash2 className="h-3 w-3" />
                                                          </Button>
                                                        </div>
                                                      </div>
                                                    ))}
                                                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 w-full" onClick={() => openNew("estado_equipamento")}>
                                                      <Plus className="h-3 w-3" /> Adicionar estado
                                                    </Button>
                                                  </CollapsibleContent>
                                                </Collapsible>
                                              </div>
                                            )}
                                            {param.categoria === "area_negocio" && (
                                              <div className="mt-2 pt-2 border-t">
                                                <div className="flex flex-wrap gap-1 mb-1">
                                                  {(departamentosPorArea[param.valor] || []).length > 0 ? (
                                                    (departamentosPorArea[param.valor] || []).map((d) => (
                                                      <span
                                                        key={d.id}
                                                        className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                                          d.ativo ? "bg-muted" : "bg-muted/40 text-muted-foreground line-through"
                                                        }`}
                                                      >
                                                        {d.label}
                                                        {d.perfil_area_codigo && (
                                                          <span className="text-[10px] text-muted-foreground">
                                                            · {d.perfil_area_codigo}
                                                          </span>
                                                        )}
                                                      </span>
                                                    ))
                                                  ) : (
                                                    <span className="text-xs text-muted-foreground">
                                                      Nenhum departamento cadastrado nesta área
                                                    </span>
                                                  )}
                                                </div>
                                                <Collapsible>
                                                  <CollapsibleTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-muted-foreground">
                                                      <ChevronDown className="h-3 w-3" />
                                                      Gerenciar departamentos
                                                    </Button>
                                                  </CollapsibleTrigger>
                                                  <CollapsibleContent className="mt-2 space-y-1">
                                                    {(departamentosPorArea[param.valor] || []).map((d) => (
                                                      <div key={d.id} className="flex items-center justify-between rounded px-2 py-1 bg-muted/50">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                          <Switch checked={d.ativo} onCheckedChange={() => handleToggleAtivo(d)} />
                                                          <div className="min-w-0">
                                                            <span className={`text-xs ${!d.ativo && "text-muted-foreground line-through"}`}>
                                                              {d.label}
                                                            </span>
                                                            {d.perfil_area_codigo && (
                                                              <p className="text-[10px] text-muted-foreground">
                                                                Perfil aplicado: {d.perfil_area_codigo}
                                                              </p>
                                                            )}
                                                          </div>
                                                        </div>
                                                        <div className="flex gap-1">
                                                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(d)}>
                                                            <Pencil className="h-3 w-3" />
                                                          </Button>
                                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(d)}>
                                                            <Trash2 className="h-3 w-3" />
                                                          </Button>
                                                        </div>
                                                      </div>
                                                    ))}
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      className="h-7 text-xs gap-1 w-full"
                                                      onClick={() => openNewDepartamento(param.valor)}
                                                    >
                                                      <Plus className="h-3 w-3" /> Adicionar departamento nesta área
                                                    </Button>
                                                  </CollapsibleContent>
                                                </Collapsible>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 ml-2">
                                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(param)}>
                                            <Pencil className="h-3.5 w-3.5" />
                                          </Button>
                                          {isInUse ? (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground cursor-not-allowed opacity-50"
                                                    disabled
                                                  >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                  </Button>
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                Este parâmetro está em uso e não pode ser excluído
                                              </TooltipContent>
                                            </Tooltip>
                                          ) : (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 text-destructive hover:text-destructive"
                                              onClick={() => setDeleteTarget(param)}
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </TooltipProvider>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </TabsContent>
                    );
                  })}
                </Tabs>

                {key === "geral" && <ParametrosUnidadesSection />}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {formOpen && (
        <ParametroForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          parametro={editParam}
          categoria={formCategoria}
          paiValor={formPaiValor}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir parâmetro?</AlertDialogTitle>
            <AlertDialogDescription>
              O parâmetro "{deleteTarget?.label}" será removido permanentemente. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!clevelConfirm} onOpenChange={() => setClevelConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {clevelConfirm?.enabling ? "Marcar como C-Level?" : "Remover restrição C-Level?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {clevelConfirm?.enabling
                ? `Marcar o cargo "${clevelConfirm?.param.label}" como C-Level restringirá a visibilidade do salário apenas ao Super Admin. Outros perfis (incluindo Admin RH) não poderão visualizar salários de colaboradores neste cargo. Confirmar?`
                : `Remover restrição C-Level de "${clevelConfirm?.param.label}"? O salário ficará visível para Admin RH também. Confirmar?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCLevel} className="bg-orange-600 text-white hover:bg-orange-700">
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
