import { useEffect, useMemo, useRef, useState } from "react";
import { exportarParceirosXlsx, importarParceirosXlsx, type LookupMaps } from "@/lib/parceiros/excel-io";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead, SortState } from "@/components/shared/SortableTableHead";
import { useCentrosCusto } from "@/hooks/financeiro/useCentrosCusto";
import { useFormasPagamento } from "@/hooks/financeiro/useFormasPagamento";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Users, Trash2, Download, Upload, Loader2, Pencil } from "lucide-react";
import { ParceiroFormSheet, Parceiro } from "@/components/financeiro/ParceiroFormSheet";
import { CategoriaOption } from "@/components/financeiro/CategoriaCombobox";
import { GruposLista } from "@/components/financeiro/GruposLista";
import { useGruposEmpresariais } from "@/hooks/useGruposEmpresariais";

const TIPO_BADGE: Record<string, string> = {
  fornecedor: "bg-[#8B1A2F] text-white hover:bg-[#8B1A2F]",
  cliente: "bg-[#1A4A3A] text-white hover:bg-[#1A4A3A]",
  ambos: "bg-[#2563EB] text-white hover:bg-[#2563EB]",
};

function formatCnpj(cnpj: string | null): string {
  if (!cnpj) return "—";
  const c = cnpj.replace(/\D/g, "");
  if (c.length !== 14) return cnpj;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

type SortField =
  | "razao_social"
  | "cnpj"
  | "tipo"
  | "categoria"
  | "centro_custo"
  | "meio_pgto";

export default function Parceiros() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const tabParam = searchParams.get("tab");
  const tabAtiva =
    tabParam === "grupos"
      ? "grupos"
      : tabParam === "clientes"
        ? "clientes"
        : "fornecedores";
  const setTabAtiva = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === "fornecedores") next.delete("tab");
    else next.set("tab", v);
    setSearchParams(next, { replace: true });
  };

  // Se URL contém ?abrir=, abre o Sheet do parceiro automaticamente
  const abrirParceiroId = searchParams.get("abrir");

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("ativos");
  const [filtroGrupo, setFiltroGrupo] = useState<string>("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Parceiro | null>(null);
  const [parceiroParaExcluir, setParceiroParaExcluir] = useState<Parceiro | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [sort, setSort] = useState<SortState<SortField> | null>({
    column: "razao_social",
    direction: "asc",
  });
  const [filtroIncompleto, setFiltroIncompleto] = useState<"sem_categoria" | "sem_meio_pgto" | "sem_centro_custo" | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!abrirParceiroId) return;
    let cancelado = false;
    (async () => {
      const { data, error } = await supabase
        .from("parceiros_comerciais")
        .select("*")
        .eq("id", abrirParceiroId)
        .maybeSingle();
      if (cancelado) return;
      if (error || !data) {
        toast.error("Parceiro não encontrado");
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setEditing(data as any);
        setFormOpen(true);
      }
      const next = new URLSearchParams(searchParams);
      next.delete("abrir");
      setSearchParams(next, { replace: true });
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirParceiroId]);

  async function handleConfirmarExcluir() {
    if (!parceiroParaExcluir) return;
    setExcluindo(true);
    try {
      const { data, error } = await supabase.rpc("excluir_parceiro_seguro", {
        p_parceiro_id: parceiroParaExcluir.id,
      });
      if (error) throw error;

      const res = data as {
        resultado: "inativado" | "excluido";
        razao_social: string;
        refs_count: number;
        docs_count: number;
      };

      if (res.resultado === "inativado") {
        const total = res.refs_count + res.docs_count;
        toast.success(
          `${res.razao_social} inativado`,
          {
            description: `Não foi excluído porque tem ${total} referência${total === 1 ? "" : "s"} no sistema (histórico preservado).`,
          },
        );
      } else {
        toast.success(`${res.razao_social} excluído`);
      }

      queryClient.invalidateQueries({ queryKey: ["parceiros"] });
      queryClient.invalidateQueries({ queryKey: ["parceiros-fornecedores"] });
      setParceiroParaExcluir(null);
    } catch (e: any) {
      toast.error("Erro ao excluir parceiro", { description: e.message });
    } finally {
      setExcluindo(false);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["parceiros"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parceiros_comerciais")
        .select("*")
        .order("razao_social");
      if (error) throw error;
      return data as Parceiro[];
    },
  });

  const { data: categorias } = useQuery({
    queryKey: ["plano-contas-flat"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plano_contas")
        .select("id,codigo,nome,nivel,parent_id")
        .order("codigo");
      if (error) throw error;
      return data as CategoriaOption[];
    },
  });

  const { data: gruposAll = [] } = useGruposEmpresariais(false);
  const { data: centrosCustoAll = [] } = useCentrosCusto(false);
  const centroCustoNomeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of centrosCustoAll) m.set(c.id, c.nome);
    return m;
  }, [centrosCustoAll]);
  const { data: formasPgtoAll = [] } = useFormasPagamento(false);
  const formaPgtoNomeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of formasPgtoAll) m.set(f.id, f.nome);
    return m;
  }, [formasPgtoAll]);
  const categoriaNomeMap = useMemo(() => {
    const m = new Map<string, { codigo: string; nome: string }>();
    for (const c of categorias || []) m.set(c.id, { codigo: c.codigo, nome: c.nome });
    return m;
  }, [categorias]);
  const gruposParaFiltro = useMemo(
    () => gruposAll.filter((g) => g.ativo),
    [gruposAll],
  );

  function temMeioPagamento(p: Parceiro): boolean {
    return !!p.forma_pagamento_padrao_id;
  }

  const kpis = useMemo(() => {
    const all = (data || []).filter((p) => p.ativo !== false);
    return {
      total: all.length,
      fornecedores: all.filter((p) => (p.tipos || []).includes("fornecedor")).length,
      clientes: all.filter((p) => (p.tipos || []).includes("cliente")).length,
      semCategoria: all.filter((p) => !p.plano_contas_id).length,
      semCentroCusto: all.filter((p) => !p.centro_custo_id).length,
      semMeioPgto: all.filter((p) => !temMeioPagamento(p)).length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    let list = data || [];

    // Filtra automaticamente pela aba ativa
    if (tabAtiva === "fornecedores") {
      list = list.filter((p) => (p.tipos || []).includes("fornecedor"));
    } else if (tabAtiva === "clientes") {
      list = list.filter((p) => (p.tipos || []).includes("cliente"));
    }

    if (filtroStatus === "ativos") list = list.filter((p) => p.ativo !== false);
    else if (filtroStatus === "inativos") list = list.filter((p) => p.ativo === false);

    if (filtroGrupo === "sem_grupo") {
      list = list.filter((p) => !p.grupo_id);
    } else if (filtroGrupo !== "todos") {
      list = list.filter((p) => p.grupo_id === filtroGrupo);
    }
    if (busca.trim()) {
      const t = busca.toLowerCase();
      const tNumerico = t.replace(/\D/g, "");
      list = list.filter(
        (p) =>
          p.razao_social.toLowerCase().includes(t) ||
          (p.nome_fantasia || "").toLowerCase().includes(t) ||
          (tNumerico !== "" && (p.cnpj || "").includes(tNumerico)),
      );
    }

    if (filtroIncompleto === "sem_categoria") list = list.filter((p) => !p.plano_contas_id);
    else if (filtroIncompleto === "sem_meio_pgto") list = list.filter((p) => !temMeioPagamento(p));
    else if (filtroIncompleto === "sem_centro_custo") list = list.filter((p) => !p.centro_custo_id);

    if (!sort) return list;
    const mult = sort.direction === "asc" ? 1 : -1;
    const sortFn = (a: Parceiro, b: Parceiro) => {
      let v: number;
      switch (sort.column) {
        case "cnpj":
          v = (a.cnpj || "").localeCompare(b.cnpj || "");
          break;
        case "tipo":
          v = (a.tipos?.[0] || "").localeCompare(b.tipos?.[0] || "");
          break;
        case "categoria": {
          const aN = a.plano_contas_id ? categoriaNomeMap.get(a.plano_contas_id)?.nome || "" : "";
          const bN = b.plano_contas_id ? categoriaNomeMap.get(b.plano_contas_id)?.nome || "" : "";
          v = aN.localeCompare(bN, "pt-BR");
          break;
        }
        case "centro_custo": {
          const aN = a.centro_custo_id ? centroCustoNomeMap.get(a.centro_custo_id) || "" : "";
          const bN = b.centro_custo_id ? centroCustoNomeMap.get(b.centro_custo_id) || "" : "";
          v = aN.localeCompare(bN, "pt-BR");
          break;
        }
        case "meio_pgto":
          v = Number(temMeioPagamento(a)) - Number(temMeioPagamento(b));
          break;
        case "razao_social":
        default:
          v = a.razao_social.localeCompare(b.razao_social, "pt-BR");
      }
      return v * mult;
    };
    return [...list].sort(sortFn);
  }, [data, filtroStatus, filtroGrupo, busca, tabAtiva, sort, categoriaNomeMap, centroCustoNomeMap, filtroIncompleto]);

  const handleOpenNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (p: Parceiro) => {
    setEditing(p);
    setFormOpen(true);
  };

  // ============ Export / Import Excel ============
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);

  const buildLookupMaps = (): LookupMaps => {
    const categoriasMap = new Map<string, { codigo: string; nome: string }>();
    const categoriasByNome = new Map<string, string>();
    for (const c of (categorias || [])) {
      categoriasMap.set(c.id, { codigo: c.codigo, nome: c.nome });
      categoriasByNome.set(c.nome.toLowerCase(), c.id);
    }
    const centros = new Map<string, string>();
    const centrosByNome = new Map<string, string>();
    for (const c of centrosCustoAll) {
      centros.set(c.id, c.nome);
      centrosByNome.set(c.nome.toLowerCase(), c.id);
    }
    const formas = new Map<string, string>();
    const formasByNome = new Map<string, string>();
    for (const f of formasPgtoAll) {
      formas.set(f.id, f.nome);
      formasByNome.set(f.nome.toLowerCase(), f.id);
    }
    const grupos = new Map<string, string>();
    const gruposByNome = new Map<string, string>();
    for (const g of gruposAll) {
      grupos.set(g.id, g.nome);
      gruposByNome.set(g.nome.toLowerCase(), g.id);
    }
    return { categorias: categoriasMap, categoriasByNome, centros, centrosByNome, formas, formasByNome, grupos, gruposByNome };
  };

  const handleExportar = () => {
    if (!filtered.length) {
      toast.info("Nada para exportar");
      return;
    }
    try {
      const nome =
        tabAtiva === "clientes" ? "clientes.xlsx" : "fornecedores.xlsx";
      exportarParceirosXlsx(filtered, buildLookupMaps(), nome);
      toast.success(`${filtered.length} parceiro${filtered.length === 1 ? "" : "s"} exportado${filtered.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error("Erro ao exportar", { description: e.message });
    }
  };

  const handleImportarClick = () => fileInputRef.current?.click();

  const handleImportarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportando(true);
    try {
      const res = await importarParceirosXlsx(file, buildLookupMaps());
      queryClient.invalidateQueries({ queryKey: ["parceiros"] });
      queryClient.invalidateQueries({ queryKey: ["parceiros-fornecedores"] });
      const partes = [
        `${res.atualizados} atualizado${res.atualizados === 1 ? "" : "s"}`,
        `${res.criados} criado${res.criados === 1 ? "" : "s"}`,
      ];
      if (res.erros.length) {
        toast.warning(`Importação parcial: ${partes.join(", ")} • ${res.erros.length} erro(s)`, {
          description: res.erros.slice(0, 3).map((e) => `Linha ${e.linha}: ${e.mensagem}`).join(" | "),
          duration: 10000,
        });
        console.warn("[Parceiros][Import] erros:", res.erros);
      } else {
        toast.success(`Importação concluída: ${partes.join(", ")}`);
      }
    } catch (err: any) {
      toast.error("Erro ao importar", { description: err.message });
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleImportarArquivo}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-admin" />
            Parceiros Comerciais
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Fornecedores, clientes e parceiros da Fetely — cadastro unificado.
          </p>
        </div>
        {tabAtiva !== "grupos" && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportar}
              className="gap-2"
              disabled={isLoading || !filtered.length}
              title="Exporta os parceiros filtrados para Excel"
            >
              <Download className="h-4 w-4" />
              Exportar Excel
            </Button>
            <Button
              variant="outline"
              onClick={handleImportarClick}
              className="gap-2"
              disabled={importando}
              title="Reimportar arquivo Excel (atualiza por id, cria novos sem id)"
            >
              {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importar Excel
            </Button>
            <Button onClick={handleOpenNew} className="gap-2 bg-admin hover:bg-admin/90 text-admin-foreground">
              <Plus className="h-4 w-4" />
              Novo parceiro
            </Button>
          </div>
        )}
      </div>

      <Tabs value={tabAtiva} onValueChange={setTabAtiva}>
        <TabsList>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
        </TabsList>

        {(tabAtiva === "fornecedores" || tabAtiva === "clientes") && (
          <TabsContent value={tabAtiva} className="space-y-6 mt-4" forceMount>
            <div className="sticky top-0 z-10 bg-background pb-2 -mx-6 px-6 pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-normal text-muted-foreground">Total ativos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{kpis.total}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-normal text-muted-foreground">Fornecedores</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#8B1A2F]">{kpis.fornecedores}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-normal text-muted-foreground">Clientes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[#1A4A3A]">{kpis.clientes}</div>
                  </CardContent>
                </Card>
                <Card
                  className={`cursor-pointer transition-all hover:shadow-md ${filtroIncompleto === "sem_categoria" ? "ring-2 ring-warning" : ""}`}
                  onClick={() => setFiltroIncompleto(filtroIncompleto === "sem_categoria" ? null : "sem_categoria")}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-normal text-muted-foreground">Sem categoria</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-warning">{kpis.semCategoria}</div>
                  </CardContent>
                </Card>
                <Card
                  className={`cursor-pointer transition-all hover:shadow-md ${filtroIncompleto === "sem_centro_custo" ? "ring-2 ring-warning" : ""}`}
                  onClick={() => setFiltroIncompleto(filtroIncompleto === "sem_centro_custo" ? null : "sem_centro_custo")}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-normal text-muted-foreground">Sem centro de custo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-warning">{kpis.semCentroCusto}</div>
                  </CardContent>
                </Card>
                <Card
                  className={`cursor-pointer transition-all hover:shadow-md ${filtroIncompleto === "sem_meio_pgto" ? "ring-2 ring-warning" : ""}`}
                  onClick={() => setFiltroIncompleto(filtroIncompleto === "sem_meio_pgto" ? null : "sem_meio_pgto")}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-normal text-muted-foreground">Sem meio de pagamento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-warning">{kpis.semMeioPgto}</div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col lg:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome ou CNPJ..."
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                    <SelectTrigger className="w-full lg:w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativos">Ativos</SelectItem>
                      <SelectItem value="inativos">Inativos</SelectItem>
                      <SelectItem value="todos">Todos</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filtroGrupo} onValueChange={setFiltroGrupo}>
                    <SelectTrigger className="w-full lg:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os grupos</SelectItem>
                      <SelectItem value="sem_grupo">Sem grupo</SelectItem>
                      {gruposParaFiltro.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    Nenhum parceiro encontrado.
                  </div>
                ) : (
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableTableHead column="razao_social" sort={sort} onSort={setSort}>
                            Razão Social
                          </SortableTableHead>
                          <SortableTableHead column="cnpj" sort={sort} onSort={setSort}>
                            CNPJ
                          </SortableTableHead>
                          <SortableTableHead column="tipo" sort={sort} onSort={setSort}>
                            Tipo
                          </SortableTableHead>
                          <SortableTableHead column="categoria" sort={sort} onSort={setSort}>
                            Categoria
                          </SortableTableHead>
                          <SortableTableHead column="centro_custo" sort={sort} onSort={setSort}>
                            Centro de Custo
                          </SortableTableHead>
                          <SortableTableHead column="meio_pgto" sort={sort} onSort={setSort}>
                            Meio de Pgto
                          </SortableTableHead>
                          <TableHead className="w-[60px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((p) => {
                          const tipos = p.tipos || [];
                          const isForn = tipos.includes("fornecedor");
                          const isCli = tipos.includes("cliente");
                          let tipoLabel: string;
                          if (isForn && isCli) tipoLabel = "ambos";
                          else if (isCli) tipoLabel = "cliente";
                          else tipoLabel = "fornecedor";
                          const cat = p.plano_contas_id
                            ? categoriaNomeMap.get(p.plano_contas_id)
                            : null;
                          const ccNome = p.centro_custo_id
                            ? centroCustoNomeMap.get(p.centro_custo_id)
                            : null;
                          return (
                            <TableRow
                              key={p.id}
                              className="cursor-pointer"
                              onClick={() => navigate(`/parceiros/${p.id}`, { state: { from: location.pathname + location.search } })}
                            >
                              <TableCell>
                                <div>
                                  <div className="font-medium flex items-center gap-2">
                                    {p.razao_social}
                                    {(p as any).origem === "auto_cartao" && !p.cnpj && (
                                      <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700 dark:text-amber-400">
                                        CNPJ pendente
                                      </Badge>
                                    )}
                                  </div>
                                  {p.nome_fantasia && (
                                    <div className="text-xs text-muted-foreground">{p.nome_fantasia}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{formatCnpj(p.cnpj)}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  <Badge className={TIPO_BADGE[tipoLabel] || "bg-muted"}>
                                    {tipoLabel === "ambos" ? "Forn. + Cliente" : tipoLabel}
                                  </Badge>
                                  {tipos.includes("prestador_pj") && (
                                    <Badge className="bg-purple-100 text-purple-700 border-0">
                                      Prestador PJ
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {cat ? (
                                  <div className="text-sm">
                                    <span className="font-mono text-xs text-muted-foreground mr-1.5">
                                      {cat.codigo}
                                    </span>
                                    <span>{cat.nome}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">— sem categoria</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {ccNome ? (
                                  <span className="text-sm">{ccNome}</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">— sem CC</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {p.forma_pagamento_padrao_id && formaPgtoNomeMap.get(p.forma_pagamento_padrao_id) ? (
                                  <span>{formaPgtoNomeMap.get(p.forma_pagamento_padrao_id)}</span>
                                ) : (
                                  <span className="text-xs text-amber-600">— faltando</span>
                                )}
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleEdit(p)}
                                    title="Edição rápida"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => setParceiroParaExcluir(p)}
                                    title="Excluir parceiro"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="grupos" className="mt-4">
          <GruposLista />
        </TabsContent>
      </Tabs>

      <ParceiroFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        categorias={categorias || []}
      />

      <AlertDialog
        open={!!parceiroParaExcluir}
        onOpenChange={(v) => {
          if (!v) setParceiroParaExcluir(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir parceiro?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir <strong>{parceiroParaExcluir?.razao_social}</strong>.
              Se este parceiro tiver qualquer histórico no sistema (contas, NFs, documentos,
              pedidos, etc.), ele será apenas inativado para preservar o registro. Caso não
              tenha nenhum vínculo, será excluído permanentemente junto com sua pasta GED vazia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmarExcluir();
              }}
              disabled={excluindo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluindo ? "Processando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
