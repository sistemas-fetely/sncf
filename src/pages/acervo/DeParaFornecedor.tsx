import { useEstadoTela } from "@/lib/navegacao";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Link2,
  Plus,
  Pencil,
  Trash2,
  Search,
  ScanSearch,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { nomeExibicao } from "@/lib/parceiros/nome";
import { rawMessage } from "@/lib/format-error";
import { useListaPaginada } from "@/lib/lista/useListaPaginada";
import { ParceiroBusca } from "@/components/parceiros/ParceiroBusca";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ParaQueServe } from "@/components/compras/ParaQueServe";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/layout/PageShell";

// ==========================================================================
// Types
// ==========================================================================

type TipoLinha = "produto" | "servico" | "ignorar";

interface VwFornecedorProduto {
  id: string;
  fornecedor_id: string;
  fornecedor: string | null;
  apelido: string | null;
  codigo_fornecedor: string;
  descricao_fornecedor: string | null;
  tipo_linha: TipoLinha;
  sku: string | null;
  produto: string | null;
  grupo: string | null;
  unidade_fornecedor: string | null;
  fator_conversao: number | null;
  observacao: string | null;
  ativo: boolean;
  criado_em: string;
}

interface Parceiro {
  id: string;
  nome_fantasia: string | null;
  razao_social: string | null;
}

interface Produto {
  sku: string;
  nome_comercial: string;
}

interface ConferenciaRow {
  codigo: string;
  status: "ok" | "nao_mapeado" | "mapeado_inativo";
  tipo_linha: TipoLinha | null;
  sku: string | null;
  produto: string | null;
  descricao_fornecedor: string | null;
}

interface FormData {
  id: string | null;
  fornecedor_id: string;
  codigo_fornecedor: string;
  descricao_fornecedor: string;
  tipo_linha: TipoLinha;
  sku: string;
  unidade_fornecedor: string;
  fator_conversao: string;
  observacao: string;
  ativo: boolean;
}

const EMPTY_FORM: FormData = {
  id: null,
  fornecedor_id: "",
  codigo_fornecedor: "",
  descricao_fornecedor: "",
  tipo_linha: "produto",
  sku: "",
  unidade_fornecedor: "",
  fator_conversao: "1",
  observacao: "",
  ativo: true,
};

const TIPO_LABELS: Record<TipoLinha, string> = {
  produto: "Produto",
  servico: "Serviço",
  ignorar: "Ignorar",
};

// ==========================================================================
// Página
// ==========================================================================

export default function DeParaFornecedor() {
  const qc = useQueryClient();

  // TELA-LEMBRA-ONDE-EU-ESTAVA: componente embutido, prefixo "dp".
  const [nav, setNav] = useEstadoTela({ forn: "todos", busca: "", tipo: "todos", pag: 1 }, { prefixo: "dp", replaceKeys: ["busca"] });
  const fornecedorFiltro = nav.forn;
  const setFornecedorFiltro = (v: string) => setNav({ forn: v, pag: 1 });
  const busca = nav.busca;
  const setBusca = (v: string) => setNav({ busca: v, pag: 1 });
  const tipoFiltro = nav.tipo as TipoLinha | "todos";
  const setTipoFiltro = (v: TipoLinha | "todos") => setNav({ tipo: v, pag: 1 });

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [confirmarDelete, setConfirmarDelete] = useState<VwFornecedorProduto | null>(null);

  // Lista principal — filtro, busca, ordem e página no banco (fn_lista), nunca a view inteira.
  const pagina = Math.max(1, Number(nav.pag ?? 1) || 1);
  const setPagina = (n: number) => setNav({ pag: Math.max(1, n) });
  const TAMANHO = 100;
  const listaQ = useListaPaginada<VwFornecedorProduto>({
    relacao: "vw_fornecedor_produto",
    busca,
    filtros: [
      ...(fornecedorFiltro !== "todos" ? [{ c: "fornecedor_id", op: "eq" as const, v: fornecedorFiltro }] : []),
      ...(tipoFiltro !== "todos" ? [{ c: "tipo_linha", op: "eq" as const, v: tipoFiltro }] : []),
    ],
    ordem: [{ c: "fornecedor", dir: "asc" }, { c: "codigo_fornecedor", dir: "asc" }],
    pagina,
    tamanho: TAMANHO,
  });
  const linhasFiltradas = listaQ.data?.linhas ?? [];
  const totalLinhas = listaQ.data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalLinhas / TAMANHO));
  useEffect(() => { if (listaQ.isError) toast.error(rawMessage(listaQ.error)); }, [listaQ.isError, listaQ.error]);

  // -----------------------------------------------
  // Mutations
  // -----------------------------------------------

  const salvar = useMutation({
    mutationFn: async (f: FormData) => {
      if (!f.fornecedor_id) throw new Error("Selecione o fornecedor.");
      if (!f.codigo_fornecedor.trim()) throw new Error("Informe o código do fornecedor.");

      const payload: Record<string, unknown> = {
        fornecedor_id: f.fornecedor_id,
        codigo_fornecedor: f.codigo_fornecedor.trim(),
        descricao_fornecedor: f.descricao_fornecedor.trim() || null,
        tipo_linha: f.tipo_linha,
        sku: f.tipo_linha === "produto" ? (f.sku.trim() || null) : null,
        unidade_fornecedor: f.unidade_fornecedor.trim() || null,
        fator_conversao: f.fator_conversao ? Number(f.fator_conversao) : 1,
        observacao: f.observacao.trim() || null,
        ativo: f.ativo,
      };

      if (f.id) {
        const { error } = await (supabase as any)
          .from("fornecedor_produto")
          .update(payload)
          .eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("fornecedor_produto").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Mapeamento atualizado" : "Mapeamento criado");
      qc.invalidateQueries({ queryKey: ["fornecedor-produto-lista"] });
      setFormOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (e: Error) => {
      // O banco pode devolver mensagem crua (CHECK constraint / unique). Não escondemos.
      toast.error(e.message);
    },
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("fornecedor_produto").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mapeamento excluído");
      qc.invalidateQueries({ queryKey: ["fornecedor-produto-lista"] });
      setConfirmarDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // -----------------------------------------------
  // Ações
  // -----------------------------------------------

  const abrirCriar = (preFornecedorId?: string, preCodigo?: string) => {
    setForm({
      ...EMPTY_FORM,
      fornecedor_id: preFornecedorId ?? "",
      codigo_fornecedor: preCodigo ?? "",
    });
    setFormOpen(true);
  };

  const abrirEditar = (r: VwFornecedorProduto) => {
    setForm({
      id: r.id,
      fornecedor_id: r.fornecedor_id,
      codigo_fornecedor: r.codigo_fornecedor,
      descricao_fornecedor: r.descricao_fornecedor || "",
      tipo_linha: r.tipo_linha,
      sku: r.sku || "",
      unidade_fornecedor: r.unidade_fornecedor || "",
      fator_conversao: r.fator_conversao != null ? String(r.fator_conversao) : "1",
      observacao: r.observacao || "",
      ativo: r.ativo,
    });
    setFormOpen(true);
  };

  return (
    <PageShell>
      <div className="flex items-start justify-between gap-3">
        <ParaQueServe>
          Ensina ao sistema qual SKU nosso corresponde a cada código que o fornecedor manda na
          nota. Sem de-para, a linha da NF não vira estoque nem custo.
        </ParaQueServe>
        <Button
          onClick={() => abrirCriar()}
          style={{ backgroundColor: "#1A4A3A", color: "white" }}
        >
          <Plus className="h-4 w-4 mr-1" />
          Novo mapeamento
        </Button>
      </div>


      {/* Conferir códigos de uma nota */}
      <ConferirCodigosBloco
        onMapear={(fornecedor_id, codigo) => abrirCriar(fornecedor_id, codigo)}
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-72">
<ParceiroBusca
            tipo="fornecedor"
            permitirLimpar
            value={fornecedorFiltro === "todos" ? null : fornecedorFiltro}
            onChange={(id) => setFornecedorFiltro(id ?? "todos")}
            placeholder="Todos os fornecedores"
            rotulo={(p) => nomeExibicao(p.razao_social, p.nome_fantasia, "(sem nome)")}
          />
        </div>
        <div className="w-40">
          <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as TipoLinha | "todos")}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="produto">Produto</SelectItem>
              <SelectItem value="servico">Serviço</SelectItem>
              <SelectItem value="ignorar">Ignorar</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="relative ml-auto w-80">
          <Search className="h-4 w-4 absolute left-2 top-3 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código, descrição ou SKU..."
            className="pl-8"
          />
        </div>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {listaQ.isLoading ? (
            <div className="p-12 text-center text-muted-foreground">Carregando...</div>
          ) : linhasFiltradas.length === 0 ? (
            <div className="p-12 text-center">
              <Link2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-medium mb-1">Nenhum mapeamento encontrado</h3>
              <p className="text-sm text-muted-foreground">
                Ajuste os filtros ou crie um novo mapeamento.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Código do fornecedor</TableHead>
                  <TableHead>Descrição do fornecedor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhasFiltradas.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div>{r.fornecedor || "—"}</div>
                      {r.apelido && (
                        <div className="text-xs text-muted-foreground">{r.apelido}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.codigo_fornecedor}</TableCell>
                    <TableCell className="max-w-[280px] truncate" title={r.descricao_fornecedor || ""}>
                      {r.descricao_fornecedor || "—"}
                    </TableCell>
                    <TableCell>
                      <TipoBadge tipo={r.tipo_linha} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.sku || "—"}</TableCell>
                    <TableCell className="max-w-[240px] truncate" title={r.produto || ""}>
                      {r.produto || "—"}
                    </TableCell>
                    <TableCell>{r.unidade_fornecedor || "—"}</TableCell>
                    <TableCell className="text-center">
                      {r.ativo ? (
                        <Badge variant="secondary" className="bg-success/10 text-success">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Inativo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Editar"
                          onClick={() => abrirEditar(r)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Excluir"
                          onClick={() => setConfirmarDelete(r)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {totalLinhas > 0 && (
            <div className="flex items-center justify-between gap-3 border-t p-3 text-sm text-muted-foreground">
              <span>{totalLinhas.toLocaleString("pt-BR")} mapeamentos · página {pagina} de {totalPaginas}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={pagina <= 1 || listaQ.isFetching} onClick={() => setPagina(pagina - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={pagina >= totalPaginas || listaQ.isFetching} onClick={() => setPagina(pagina + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formulário */}
      <FormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setForm(EMPTY_FORM);
        }}
        form={form}
        setForm={setForm}
        onSubmit={() => salvar.mutate(form)}
        submitting={salvar.isPending}
      />

      {/* Confirmar exclusão */}
      <AlertDialog
        open={!!confirmarDelete}
        onOpenChange={(o) => !o && setConfirmarDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mapeamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O código{" "}
              <span className="font-mono">{confirmarDelete?.codigo_fornecedor}</span> deixará de
              apontar para o SKU. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmarDelete && excluir.mutate(confirmarDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

// ==========================================================================
// Bloco: Conferir códigos
// ==========================================================================

function ConferirCodigosBloco({
  onMapear,
}: {
  onMapear: (fornecedor_id: string, codigo: string) => void;
}) {
  const [fornecedorId, setFornecedorId] = useState<string>("");
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<ConferenciaRow[] | null>(null);

  const conferir = useMutation({
    mutationFn: async () => {
      if (!fornecedorId) throw new Error("Escolha o fornecedor.");
      const codigos = texto
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (codigos.length === 0) throw new Error("Cole ao menos um código.");
      const { data, error } = await (supabase as any).rpc("fn_conferir_codigos_fornecedor", {
        p_fornecedor_id: fornecedorId,
        p_codigos: codigos,
      });
      if (error) throw error;
      return (data ?? []) as ConferenciaRow[];
    },
    onSuccess: (data) => {
      // ordenar nao_mapeado primeiro, depois mapeado_inativo, depois ok
      const ordem = (s: ConferenciaRow["status"]) =>
        s === "nao_mapeado" ? 0 : s === "mapeado_inativo" ? 1 : 2;
      const ord = [...data].sort((a, b) => ordem(a.status) - ordem(b.status));
      setResultado(ord);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nome = (p: Parceiro) => nomeExibicao(p.razao_social, p.nome_fantasia, "(sem nome)");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ScanSearch className="h-4 w-4" />
          Conferir códigos de uma nota
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,320px)_1fr_auto] gap-3 items-start">
          <div>
            <Label className="text-xs text-muted-foreground">Fornecedor</Label>
<ParceiroBusca
              tipo="fornecedor"
              value={fornecedorId || null}
              onChange={(id) => setFornecedorId(id ?? "")}
              placeholder="Selecione o fornecedor"
              rotulo={(p) => nomeExibicao(p.razao_social, p.nome_fantasia, "(sem nome)")}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Códigos (um por linha, ou separados por vírgula / ponto-e-vírgula)
            </Label>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={"4329372\n4329373\n4329374"}
              rows={4}
              className="font-mono text-sm"
            />
          </div>
          <div className="pt-5">
            <Button
              onClick={() => conferir.mutate()}
              disabled={conferir.isPending}
              style={{ backgroundColor: "#1A4A3A", color: "white" }}
            >
              {conferir.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <ScanSearch className="h-4 w-4 mr-1" />
              )}
              Conferir
            </Button>
          </div>
        </div>

        {resultado && (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultado.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                      Sem resultados.
                    </TableCell>
                  </TableRow>
                ) : (
                  resultado.map((r, i) => (
                    <TableRow
                      key={`${r.codigo}-${i}`}
                      className={cn(
                        r.status === "nao_mapeado" &&
                          "bg-destructive/5 hover:bg-destructive/10",
                        r.status === "mapeado_inativo" && "bg-warning/10 hover:bg-warning/60",
                      )}
                    >
                      <TableCell className="font-mono text-xs">{r.codigo}</TableCell>
                      <TableCell>
                        <StatusConferencia status={r.status} />
                      </TableCell>
                      <TableCell>
                        {r.tipo_linha ? <TipoBadge tipo={r.tipo_linha} /> : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.sku || "—"}</TableCell>
                      <TableCell className="max-w-[240px] truncate" title={r.produto || ""}>
                        {r.produto || r.descricao_fornecedor || "—"}
                      </TableCell>
                      <TableCell>
                        {r.status === "nao_mapeado" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onMapear(fornecedorId, r.codigo)}
                          >
                            Mapear
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusConferencia({ status }: { status: ConferenciaRow["status"] }) {
  if (status === "ok") {
    return (
      <Badge variant="secondary" className="bg-success/10 text-success gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Mapeado
      </Badge>
    );
  }
  if (status === "mapeado_inativo") {
    return (
      <Badge variant="secondary" className="bg-warning/10 text-warning gap-1">
        <AlertTriangle className="h-3 w-3" />
        Mapeado inativo
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="h-3 w-3" />
      Não mapeado
    </Badge>
  );
}

function TipoBadge({ tipo }: { tipo: TipoLinha }) {
  const cls =
    tipo === "produto"
      ? "bg-info/10 text-info"
      : tipo === "servico"
        ? "bg-info/10 text-info"
        : "bg-muted text-muted-foreground";
  return (
    <Badge variant="secondary" className={cls}>
      {TIPO_LABELS[tipo]}
    </Badge>
  );
}

// ==========================================================================
// Form Dialog
// ==========================================================================

function FormDialog({
  open,
  onOpenChange,
  form,
  setForm,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: FormData;
  setForm: (f: FormData) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const isProduto = form.tipo_linha === "produto";

  // Ao mudar tipo_linha para servico/ignorar, limpar SKU
  const setTipo = (t: TipoLinha) => {
    setForm({ ...form, tipo_linha: t, sku: t === "produto" ? form.sku : "" });
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar mapeamento" : "Novo mapeamento"}</DialogTitle>
          <DialogDescription>
            Amarra um código do fornecedor a um SKU do nosso catálogo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground">Fornecedor *</Label>
            <ParceiroCombobox
              value={form.fornecedor_id}
              onChange={(v) => setForm({ ...form, fornecedor_id: v })}
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Código do fornecedor *</Label>
            <Input
              value={form.codigo_fornecedor}
              onChange={(e) => setForm({ ...form, codigo_fornecedor: e.target.value })}
              placeholder="Ex.: 4329372"
              className="font-mono"
              maxLength={100}
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Tipo da linha *</Label>
            <Select value={form.tipo_linha} onValueChange={(v) => setTipo(v as TipoLinha)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="produto">Produto</SelectItem>
                <SelectItem value="servico">Serviço</SelectItem>
                <SelectItem value="ignorar">Ignorar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground">Descrição do fornecedor</Label>
            <Input
              value={form.descricao_fornecedor}
              onChange={(e) => setForm({ ...form, descricao_fornecedor: e.target.value })}
              placeholder="Descrição como aparece na nota"
              maxLength={500}
            />
          </div>

          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground">
              SKU {isProduto ? "*" : "(não se aplica)"}
            </Label>
            <SkuCombobox
              value={form.sku}
              onChange={(v) => setForm({ ...form, sku: v })}
              disabled={!isProduto}
            />
            {!isProduto && (
              <p className="text-xs text-muted-foreground mt-1">
                Serviço e ignorar não apontam para SKU: o destino do custo varia por nota.
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Unidade do fornecedor</Label>
            <Input
              value={form.unidade_fornecedor}
              onChange={(e) => setForm({ ...form, unidade_fornecedor: e.target.value })}
              placeholder="pct, un, cx..."
              maxLength={16}
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Fator de conversão</Label>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={form.fator_conversao}
              onChange={(e) => setForm({ ...form, fator_conversao: e.target.value })}
              placeholder="1"
            />
          </div>

          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground">Observação</Label>
            <Textarea
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              rows={2}
              maxLength={2000}
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-3">
            <Switch
              checked={form.ativo}
              onCheckedChange={(c) => setForm({ ...form, ativo: c })}
              id="ativo-switch"
            />
            <Label htmlFor="ativo-switch" className="cursor-pointer">
              Ativo
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={onSubmit}
            disabled={submitting}
            style={{ backgroundColor: "#1A4A3A", color: "white" }}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==========================================================================
// Comboboxes
// ==========================================================================

function ParceiroCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  // COMBO-POR-DIGITACAO: busca no banco (fn_busca_parceiro), nunca a base inteira.
  return (
    <ParceiroBusca
      tipo="fornecedor"
      value={value || null}
      onChange={(id) => onChange(id ?? "")}
      placeholder="Selecione o fornecedor..."
      rotulo={(p) => nomeExibicao(p.razao_social, p.nome_fantasia, "(sem nome)")}
    />
  );
}

function SkuCombobox({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");

  const produtosQ = useQuery({
    queryKey: ["sncf_produtos-depara", busca],
    queryFn: async () => {
      let q = (supabase as any)
        .from("sncf_produtos")
        .select("sku,nome_comercial")
        .eq("ativo", true);
      if (busca.trim()) {
        q = q.or(`nome_comercial.ilike.%${busca}%,sku.ilike.%${busca}%`);
      }
      const { data, error } = await q.order("nome_comercial").limit(30);
      if (error) throw error;
      return (data ?? []) as Produto[];
    },
    enabled: open && !disabled,
    staleTime: 60_000,
  });

  return (
    <Popover open={open && !disabled} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          {value ? <span className="font-mono text-xs">{value}</span> : "Selecione o SKU..."}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por SKU ou nome..."
            value={busca}
            onValueChange={setBusca}
          />
          <CommandList>
            <CommandEmpty>
              {produtosQ.isLoading ? "Buscando..." : "Nenhum produto encontrado."}
            </CommandEmpty>
            <CommandGroup>
              {(produtosQ.data ?? []).map((p) => (
                <CommandItem
                  key={p.sku}
                  value={p.sku}
                  onSelect={() => {
                    onChange(p.sku);
                    setOpen(false);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="font-mono text-xs">{p.sku}</span>
                    <span className="text-xs text-muted-foreground">{p.nome_comercial}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
