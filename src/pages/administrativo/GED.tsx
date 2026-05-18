import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  FolderArchive,
  FolderPlus,
  Folder,
  FileText,
  Upload,
  Search,
  Trash2,
  Loader2,
  AlertTriangle,
  Info,
  X,
  Files,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useParametros } from "@/hooks/useParametros";
import { formatDateBR } from "@/lib/format-currency";
import { PastaDetalhe } from "@/components/ged/PastaDetalhe";

interface Pasta {
  id: string;
  nome: string;
  descricao: string | null;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  total_documentos: number;
  ultimo_upload: string | null;
  parent_id: string | null;
}

interface Documento {
  id: string;
  pasta_id: string | null;
  nome: string;
  tipo_documento: string;
  parceiro_id: string | null;
  storage_path: string;
  resumo_ia: string | null;
  classificacao_ia: any;
  tags: string[];
  tamanho_bytes: number | null;
  created_at: string;
}

const PASTA_SOLTOS = "__soltos__";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function GED() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // Inicialização preguiçosa: já lê o query param ?pasta=<id> no mount
  // pra evitar piscar na pasta padrão antes do useEffect aplicar.
  const [pastaSelecionada, setPastaSelecionada] = useState<string>(() => {
    return searchParams.get("pasta") || PASTA_SOLTOS;
  });
  const [busca, setBusca] = useState("");
  const [novaPastaOpen, setNovaPastaOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [docDetalhe, setDocDetalhe] = useState<Documento | null>(null);
  const [pastasExpandidas, setPastasExpandidas] = useState<Set<string>>(new Set());

  function toggleExpandir(pastaId: string) {
    setPastasExpandidas((prev) => {
      const novo = new Set(prev);
      if (novo.has(pastaId)) novo.delete(pastaId);
      else novo.add(pastaId);
      return novo;
    });
  }

  const { data: pastas = [], isLoading: loadingPastas } = useQuery({
    queryKey: ["ged-pastas"],
    queryFn: async () => {
      const { data: rawPastas, error } = await (supabase as any)
        .from("vw_ged_pastas_kpis")
        .select("*")
        .order("nome");
      if (error) throw error;

      const lista = (rawPastas ?? []) as Pasta[];

      const parceiroIds = Array.from(
        new Set(lista.map((p) => p.parceiro_id).filter(Boolean) as string[])
      );

      if (parceiroIds.length === 0) return lista;

      const { data: parceiros } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, cnpj, nome_fantasia, grupo_id, grupos_empresariais:grupo_id(id, nome)")
        .in("id", parceiroIds);

      const mapaParceiro = new Map<string, {
        cnpj: string | null;
        nome_fantasia: string | null;
        grupo_id: string | null;
        grupo_nome: string | null;
      }>();

      (parceiros ?? []).forEach((p: any) => {
        mapaParceiro.set(p.id, {
          cnpj: p.cnpj,
          nome_fantasia: p.nome_fantasia,
          grupo_id: p.grupo_id,
          grupo_nome: p.grupos_empresariais?.nome ?? null,
        });
      });

      return lista.map((pasta) => {
        const extra = pasta.parceiro_id ? mapaParceiro.get(pasta.parceiro_id) : null;
        return {
          ...pasta,
          parceiro_cnpj: extra?.cnpj ?? null,
          parceiro_nome_fantasia: extra?.nome_fantasia ?? null,
          grupo_id: extra?.grupo_id ?? null,
          grupo_nome: extra?.grupo_nome ?? null,
        };
      }) as (Pasta & {
        parceiro_cnpj: string | null;
        parceiro_nome_fantasia: string | null;
        grupo_id: string | null;
        grupo_nome: string | null;
      })[];
    },
  });

  const pastasFiltradas = useMemo(() => {
    if (!busca || busca.trim().length === 0) return pastas;
    const b = busca.toLowerCase().trim();
    return pastas.filter((p: any) => {
      return (
        p.nome?.toLowerCase().includes(b) ||
        p.parceiro_nome?.toLowerCase().includes(b) ||
        p.parceiro_cnpj?.toLowerCase().includes(b) ||
        p.parceiro_nome_fantasia?.toLowerCase().includes(b) ||
        p.grupo_nome?.toLowerCase().includes(b) ||
        p.descricao?.toLowerCase().includes(b)
      );
    });
  }, [pastas, busca]);

  // Índice: parent_id (ou "ROOT") → lista de pastas-filhas
  const indiceFilhas = useMemo(() => {
    const idx = new Map<string, typeof pastasFiltradas>();
    for (const p of pastasFiltradas) {
      const chave = p.parent_id ?? "ROOT";
      if (!idx.has(chave)) idx.set(chave, []);
      idx.get(chave)!.push(p);
    }
    for (const lista of idx.values()) {
      lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    }
    return idx;
  }, [pastasFiltradas]);

  // Auto-expande quando há busca ativa
  useEffect(() => {
    if (busca && busca.trim().length > 0) {
      const todasComFilhas = new Set<string>();
      for (const p of pastasFiltradas) {
        if (p.parent_id) todasComFilhas.add(p.parent_id);
      }
      setPastasExpandidas(todasComFilhas);
    }
  }, [busca, pastasFiltradas]);

  // Doutrina #34: useEffect (não useState) pra reagir a dados que chegam depois.
  // Cobre 3 cenários:
  // 1. Vinda de Contratos.tsx com ?pasta=<id> — aplica seleção quando pastas chegam.
  // 2. Cache do React Query (staleTime 60s): pastas já vem cheio, dispara mesmo assim.
  // 3. Trocar de contrato sem sair do GED: searchParams muda → reaplica seleção.
  useEffect(() => {
    const pastaParam = searchParams.get("pasta");
    if (!pastaParam || loadingPastas || pastas.length === 0) return;
    const existe = pastas.find((p) => p.id === pastaParam);
    if (existe) {
      setPastaSelecionada(pastaParam);
      setSearchParams({}, { replace: true });
    } else {
      // Pasta não existe (deletada / sem visibilidade) — limpa pra evitar loop
      setSearchParams({}, { replace: true });
    }
  }, [pastas, loadingPastas, searchParams, setSearchParams]);

  const { data: documentos = [], isLoading: loadingDocs } = useQuery({
    queryKey: ["ged-documentos", pastaSelecionada, busca],
    queryFn: async () => {
      let q = (supabase as any)
        .from("ged_documentos")
        .select("*")
        .order("created_at", { ascending: false });

      if (pastaSelecionada === PASTA_SOLTOS) {
        q = q.is("pasta_id", null);
      } else {
        q = q.eq("pasta_id", pastaSelecionada);
      }

      if (busca) {
        q = q.or(`nome.ilike.%${busca}%,resumo_ia.ilike.%${busca}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Documento[];
    },
  });

  const { data: solitarios } = useQuery({
    queryKey: ["ged-soltos-count"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("vw_ged_documentos_soltos")
        .select("*")
        .single();
      return data as { total: number; tamanho_total_bytes: number };
    },
  });

  async function handleExcluirPasta(p: Pasta) {
    const msg = p.total_documentos > 0
      ? `A pasta "${p.nome}" tem ${p.total_documentos} documento(s). Os documentos NÃO serão apagados — vão para "Sem pasta". Continuar?`
      : `Excluir pasta "${p.nome}"?`;
    if (!confirm(msg)) return;
    try {
      const { error } = await (supabase as any)
        .from("ged_pastas")
        .delete()
        .eq("id", p.id);
      if (error) throw error;
      toast.success("Pasta excluída");
      if (pastaSelecionada === p.id) setPastaSelecionada(PASTA_SOLTOS);
      qc.invalidateQueries({ queryKey: ["ged-pastas"] });
      qc.invalidateQueries({ queryKey: ["ged-documentos"] });
      qc.invalidateQueries({ queryKey: ["ged-soltos-count"] });
    } catch (e) {
      toast.error("Erro: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleExcluirDoc(doc: Documento) {
    if (!confirm(`Excluir "${doc.nome}"?`)) return;
    try {
      await supabase.storage.from("ged").remove([doc.storage_path]);
      const { error } = await (supabase as any)
        .from("ged_documentos")
        .delete()
        .eq("id", doc.id);
      if (error) throw error;
      toast.success("Documento excluído");
      qc.invalidateQueries({ queryKey: ["ged-documentos"] });
      qc.invalidateQueries({ queryKey: ["ged-pastas"] });
      qc.invalidateQueries({ queryKey: ["ged-soltos-count"] });
      setDocDetalhe(null);
    } catch (e) {
      toast.error("Erro: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className="flex h-[calc(100vh-100px)]">
      {/* Sidebar de Pastas */}
      <aside className="w-64 border-r bg-muted/30 flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold flex items-center gap-2">
              <FolderArchive className="h-5 w-5" />
              GED
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setNovaPastaOpen(true)}
              title="Nova pasta"
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* Sem pasta */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
              pastaSelecionada === PASTA_SOLTOS
                ? "bg-primary/10 text-primary font-medium"
                : "hover:bg-muted"
            }`}
            onClick={() => setPastaSelecionada(PASTA_SOLTOS)}
          >
            <Files className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">Sem pasta</span>
            <Badge variant="secondary" className="text-xs">
              {solitarios?.total ?? 0}
            </Badge>
          </button>

          {loadingPastas && (
            <p className="text-xs text-muted-foreground p-2">Carregando...</p>
          )}

          {pastasFiltradas.map((p) => (
            <div
              key={p.id}
              className={`group relative w-full px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors cursor-pointer ${
                pastaSelecionada === p.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted"
              }`}
              onClick={() => setPastaSelecionada(p.id)}
            >
              <Folder className="h-4 w-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate">{p.nome}</div>
                {p.parceiro_nome && (
                  <div className="text-xs text-muted-foreground truncate">
                    {p.parceiro_nome}
                  </div>
                )}
              </div>
              <Badge variant="secondary" className="text-xs shrink-0 group-hover:hidden">
                {p.total_documentos}
              </Badge>
              <button
                className="hidden group-hover:flex h-6 w-6 items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive shrink-0"
                title={`Excluir pasta "${p.nome}"`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleExcluirPasta(p);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Conteúdo principal */}
      {pastaSelecionada !== PASTA_SOLTOS ? (
        // Vista detalhada da pasta com 4 abas
        (() => {
          const pastaAtiva = pastas.find((p) => p.id === pastaSelecionada);
          if (!pastaAtiva) {
            return (
              <main className="flex-1 flex items-center justify-center text-muted-foreground">
                Pasta não encontrada
              </main>
            );
          }
          return (
            <PastaDetalhe
              pasta={pastaAtiva as any}
              onAtualizado={() => {
                qc.invalidateQueries({ queryKey: ["ged-pastas"] });
                qc.invalidateQueries({ queryKey: ["ged-documentos"] });
              }}
            />
          );
        })()
      ) : (
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou conteúdo..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
        </div>

        {/* Lista de documentos */}
        <div className="flex-1 overflow-y-auto p-4">
          {loadingDocs && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Carregando documentos...
            </div>
          )}

          {!loadingDocs && documentos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Nenhum documento aqui ainda.</p>
              <Button
                variant="link"
                size="sm"
                onClick={() => setUploadOpen(true)}
              >
                Fazer upload do primeiro
              </Button>
            </div>
          )}

          {!loadingDocs && documentos.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {documentos.map((d) => (
                <div
                  key={d.id}
                  className="border rounded-lg p-4 hover:border-primary cursor-pointer transition-colors bg-card"
                  onClick={() => setDocDetalhe(d)}
                >
                  <div className="flex items-start gap-3">
                    <FileText className="h-8 w-8 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">{d.nome}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs capitalize">
                          {d.tipo_documento}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatBytes(d.tamanho_bytes)}
                        </span>
                      </div>
                      {d.resumo_ia && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                          {d.resumo_ia}
                        </p>
                      )}
                      {d.tags && d.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {d.tags.slice(0, 3).map((t) => (
                            <span key={t} className="text-xs bg-muted px-2 py-0.5 rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      )}

      {/* Dialog: Nova Pasta */}
      <NovaPastaDialog
        open={novaPastaOpen}
        onOpenChange={setNovaPastaOpen}
        onSalvo={() => {
          qc.invalidateQueries({ queryKey: ["ged-pastas"] });
          setNovaPastaOpen(false);
        }}
      />

      {/* Dialog: Upload */}
      <UploadDocumentoDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        pastaIdInicial={
          pastaSelecionada === PASTA_SOLTOS ? null : pastaSelecionada
        }
        pastas={pastas}
        onSalvo={() => {
          qc.invalidateQueries({ queryKey: ["ged-documentos"] });
          qc.invalidateQueries({ queryKey: ["ged-pastas"] });
          qc.invalidateQueries({ queryKey: ["ged-soltos-count"] });
          setUploadOpen(false);
        }}
      />

      {/* Sheet: Detalhe do documento */}
      <DocumentoDetalheSheet
        documento={docDetalhe}
        pastas={pastas}
        onClose={() => setDocDetalhe(null)}
        onExcluir={handleExcluirDoc}
        onAtualizado={() => {
          qc.invalidateQueries({ queryKey: ["ged-documentos"] });
          qc.invalidateQueries({ queryKey: ["ged-pastas"] });
          setDocDetalhe(null);
        }}
      />
    </div>
  );
}

// ─── Dialog: Nova Pasta ──────────────────────────────────────
export function NovaPastaDialog({
  open,
  onOpenChange,
  onSalvo,
  parentId,
  parentNome,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSalvo: () => void;
  parentId?: string | null;
  parentNome?: string | null;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [parceiroId, setParceiroId] = useState<string>("");
  const [salvando, setSalvando] = useState(false);

  const { data: parceiros = [] } = useQuery({
    queryKey: ["parceiros-select"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social")
        .order("razao_social");
      return data ?? [];
    },
  });

  async function salvar() {
    if (!nome.trim()) {
      toast.error("Nome obrigatório");
      return;
    }
    setSalvando(true);
    try {
      // Se for subpasta, herda parceiro_id da pasta-mãe
      let parceiroIdFinal: string | null = parceiroId || null;
      if (parentId) {
        const { data: mae, error: errMae } = await (supabase as any)
          .from("ged_pastas")
          .select("parceiro_id")
          .eq("id", parentId)
          .single();
        if (errMae) throw errMae;
        parceiroIdFinal = mae?.parceiro_id ?? null;
      }

      const { error } = await (supabase as any).from("ged_pastas").insert({
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        parceiro_id: parceiroIdFinal,
        parent_id: parentId || null,
      });
      if (error) throw error;
      toast.success(parentId ? "Subpasta criada" : "Pasta criada");
      setNome("");
      setDescricao("");
      setParceiroId("");
      onSalvo();
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      const msg =
        err?.message ||
        err?.details ||
        err?.hint ||
        (e instanceof Error ? e.message : null) ||
        JSON.stringify(e);
      console.error("[NovaPastaDialog] salvar falhou:", e);
      toast.error("Erro: " + msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {parentNome ? `Nova subpasta em "${parentNome}"` : "Nova pasta"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input
              placeholder="Ex: Reforma Escritório SP"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input
              placeholder="Opcional"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          {!parentId && (
            <div className="space-y-1">
              <Label>Parceiro relacionado</Label>
              <Select value={parceiroId} onValueChange={setParceiroId}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  {(parceiros as any[]).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {parentId && parentNome && (
            <div className="text-sm text-muted-foreground">
              Subpasta de "{parentNome}" — parceiro será herdado automaticamente.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Criando..." : "Criar pasta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog: Upload (múltiplo) ───────────────────────────────
interface ItemUpload {
  id: string;                    // id local
  file: File;
  status: "subindo" | "lendo_ia" | "pronto" | "erro" | "salvando" | "salvo";
  storagePath: string | null;
  dadosIA: any;
  // Campos editáveis
  nome: string;
  tipoDoc: string;
  parceiroId: string;
  tags: string;
  erro: string | null;
}

function UploadDocumentoDialog({
  open,
  onOpenChange,
  pastaIdInicial,
  pastas,
  onSalvo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pastaIdInicial: string | null;
  pastas: Pasta[];
  onSalvo: () => void;
}) {
  const [itens, setItens] = useState<ItemUpload[]>([]);
  const [pastaId, setPastaId] = useState<string>(pastaIdInicial ?? "");
  const [salvandoTudo, setSalvandoTudo] = useState(false);

  const { data: tipos = [] } = useParametros("tipo_documento_ged");
  const { data: parceiros = [] } = useQuery({
    queryKey: ["parceiros-select"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social")
        .order("razao_social");
      return data ?? [];
    },
  });

  function reset() {
    setItens([]);
    setPastaId(pastaIdInicial ?? "");
  }

  async function processarArquivo(item: ItemUpload) {
    try {
      // 1. Upload storage
      const path = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${item.file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("ged")
        .upload(path, item.file, { contentType: item.file.type });
      if (upErr) throw new Error("Upload: " + upErr.message);

      setItens((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: "lendo_ia", storagePath: path }
            : i
        )
      );

      // 2. IA classifica (só PDF)
      if (item.file.type === "application/pdf") {
        const formData = new FormData();
        formData.append("file", item.file);
        const res = await supabase.functions.invoke(
          "classificar-documento-ged",
          { body: formData }
        );
        if (!res.error && res.data) {
          const dados = res.data;
          let parceiroIdEncontrado = "";
          if (dados.parceiro_cnpj) {
            const { data: p } = await (supabase as any)
              .from("parceiros_comerciais")
              .select("id")
              .eq("cnpj", String(dados.parceiro_cnpj).replace(/\D/g, ""))
              .maybeSingle();
            if (p?.id) parceiroIdEncontrado = p.id;
          }
          setItens((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    status: "pronto",
                    dadosIA: dados,
                    nome: dados.nome_sugerido ?? i.nome,
                    tipoDoc: dados.tipo_documento ?? "outro",
                    tags: dados.tags_sugeridas?.join(", ") ?? "",
                    parceiroId: parceiroIdEncontrado || i.parceiroId,
                  }
                : i
            )
          );
        } else {
          setItens((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, status: "pronto" } : i
            )
          );
        }
      } else {
        setItens((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: "pronto" } : i
          )
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setItens((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: "erro", erro: msg } : i
        )
      );
    }
  }

  async function handleArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const novos: ItemUpload[] = files.map((f) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      status: "subindo",
      storagePath: null,
      dadosIA: null,
      nome: f.name.replace(/\.[^/.]+$/, ""),
      tipoDoc: "outro",
      parceiroId: "",
      tags: "",
      erro: null,
    }));

    setItens((prev) => [...prev, ...novos]);

    // Processa em paralelo
    novos.forEach((item) => processarArquivo(item));

    // Limpa input para permitir re-upload
    e.target.value = "";
  }

  function atualizarItem(id: string, campos: Partial<ItemUpload>) {
    setItens((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...campos } : i))
    );
  }

  function removerItem(id: string) {
    setItens((prev) => prev.filter((i) => i.id !== id));
  }

  async function salvarTodos() {
    const prontos = itens.filter((i) => i.status === "pronto");
    if (prontos.length === 0) {
      toast.error("Nenhum documento pronto para salvar");
      return;
    }

    setSalvandoTudo(true);
    let salvos = 0;
    let erros = 0;

    for (const item of prontos) {
      atualizarItem(item.id, { status: "salvando" });
      try {
        if (!item.storagePath) throw new Error("storage_path ausente");
        const tagsArr = item.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);

        const { error } = await (supabase as any).from("ged_documentos").insert({
          pasta_id: pastaId || null,
          nome: item.nome.trim(),
          arquivo_original: item.file.name,
          tipo_documento: item.tipoDoc,
          parceiro_id: item.parceiroId || null,
          storage_path: item.storagePath,
          mime_type: item.file.type,
          tamanho_bytes: item.file.size,
          tags: tagsArr,
          resumo_ia: item.dadosIA?.resumo ?? null,
          classificacao_ia: item.dadosIA ?? null,
          confianca_ia: item.dadosIA?.confianca ?? null,
        });

        if (error) throw error;
        atualizarItem(item.id, { status: "salvo" });
        salvos++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        atualizarItem(item.id, { status: "erro", erro: msg });
        erros++;
      }
    }

    setSalvandoTudo(false);

    if (salvos > 0) {
      toast.success(
        `${salvos} documento${salvos > 1 ? "s" : ""} salvo${
          salvos > 1 ? "s" : ""
        }${erros > 0 ? ` · ${erros} com erro` : ""}`
      );
    }
    if (erros > 0 && salvos === 0) {
      toast.error(`${erros} erro${erros > 1 ? "s" : ""} ao salvar`);
    }

    if (salvos > 0) onSalvo();
  }

  const totalProntos = itens.filter((i) => i.status === "pronto").length;
  const algumProcessando = itens.some(
    (i) => i.status === "subindo" || i.status === "lendo_ia"
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload de documentos</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Pasta destino comum */}
          <div className="space-y-1">
            <Label>Pasta destino para todos</Label>
            <Select value={pastaId} onValueChange={setPastaId}>
              <SelectTrigger>
                <SelectValue placeholder="Sem pasta (avulso)" />
              </SelectTrigger>
              <SelectContent>
                {pastas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Upload area */}
          <div
            className="rounded-lg border-2 border-dashed p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => document.getElementById("ged-upload-input")?.click()}
          >
            <input
              id="ged-upload-input"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
              multiple
              className="hidden"
              onChange={handleArquivos}
            />
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Clique para selecionar 1 ou mais arquivos
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, imagem ou Office · Máx 25MB cada · IA classifica em paralelo
            </p>
          </div>

          {/* Lista de arquivos */}
          {itens.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {itens.length} arquivo{itens.length > 1 ? "s" : ""}
                {algumProcessando && (
                  <span className="text-muted-foreground ml-2 text-xs">
                    (processando...)
                  </span>
                )}
              </p>
              {itens.map((item) => (
                <ItemUploadCard
                  key={item.id}
                  item={item}
                  tipos={tipos as any[]}
                  parceiros={parceiros as any[]}
                  onAtualizar={(c) => atualizarItem(item.id, c)}
                  onRemover={() => removerItem(item.id)}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            disabled={salvandoTudo}
          >
            {itens.some((i) => i.status === "salvo") ? "Fechar" : "Cancelar"}
          </Button>
          <Button
            onClick={salvarTodos}
            disabled={totalProntos === 0 || salvandoTudo || algumProcessando}
          >
            {salvandoTudo
              ? "Salvando..."
              : totalProntos === 0
                ? "Salvar"
                : `Salvar ${totalProntos} documento${totalProntos > 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Card de cada arquivo na lista ────────────────────────────
function ItemUploadCard({
  item,
  tipos,
  parceiros,
  onAtualizar,
  onRemover,
}: {
  item: ItemUpload;
  tipos: any[];
  parceiros: any[];
  onAtualizar: (campos: Partial<ItemUpload>) => void;
  onRemover: () => void;
}) {
  const [expandido, setExpandido] = useState(false);

  const statusBadge = () => {
    if (item.status === "subindo")
      return (
        <Badge variant="outline" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Subindo
        </Badge>
      );
    if (item.status === "lendo_ia")
      return (
        <Badge variant="outline" className="gap-1 bg-blue-50 text-blue-700">
          <Loader2 className="h-3 w-3 animate-spin" /> Lendo com IA
        </Badge>
      );
    if (item.status === "pronto")
      return <Badge className="bg-green-100 text-green-700">Pronto</Badge>;
    if (item.status === "salvando")
      return (
        <Badge variant="outline" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Salvando
        </Badge>
      );
    if (item.status === "salvo")
      return <Badge className="bg-emerald-100 text-emerald-800">✓ Salvo</Badge>;
    if (item.status === "erro")
      return <Badge variant="destructive">Erro</Badge>;
    return null;
  };

  const podeEditar = item.status === "pronto";

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-3 flex items-center gap-3">
        <FileText className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.file.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(item.file.size)}
          </p>
          {item.erro && (
            <p className="text-xs text-destructive mt-1">{item.erro}</p>
          )}
        </div>
        {statusBadge()}
        {podeEditar && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpandido(!expandido)}
          >
            {expandido ? "Ocultar" : "Editar"}
          </Button>
        )}
        {item.status !== "salvo" && item.status !== "salvando" && (
          <Button variant="ghost" size="sm" onClick={onRemover}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {expandido && podeEditar && (
        <div className="border-t p-3 space-y-3 bg-muted/20">
          {item.dadosIA?.resumo && (
            <div className="text-xs bg-blue-50 border border-blue-200 rounded p-2 text-blue-700">
              <strong>IA:</strong> {item.dadosIA.resumo}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input
                className="h-8"
                value={item.nome}
                onChange={(e) => onAtualizar({ nome: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select
                value={item.tipoDoc}
                onValueChange={(v) => onAtualizar({ tipoDoc: v })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tipos.map((t) => (
                    <SelectItem key={t.id} value={t.valor}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Parceiro</Label>
              <Select
                value={item.parceiroId}
                onValueChange={(v) => onAtualizar({ parceiroId: v })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  {parceiros.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tags (vírgula)</Label>
              <Input
                className="h-8"
                placeholder="reforma, escritorio"
                value={item.tags}
                onChange={(e) => onAtualizar({ tags: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Sheet: Detalhe do documento ─────────────────────────────
function DocumentoDetalheSheet({
  documento,
  pastas,
  onClose,
  onExcluir,
  onAtualizado,
}: {
  documento: Documento | null;
  pastas: Pasta[];
  onClose: () => void;
  onExcluir: (d: Documento) => void;
  onAtualizado: () => void;
}) {
  const [pastaId, setPastaId] = useState<string>("");
  const [nome, setNome] = useState("");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const aberto = !!documento;

  // Carrega URL do PDF
  useState(() => {
    if (documento) {
      setNome(documento.nome);
      setPastaId(documento.pasta_id ?? "");
      supabase.storage
        .from("ged")
        .createSignedUrl(documento.storage_path, 3600)
        .then(({ data }) => {
          if (data?.signedUrl) setSignedUrl(data.signedUrl);
        });
    }
  });

  async function salvarAlteracoes() {
    if (!documento) return;
    setSalvando(true);
    try {
      const { error } = await (supabase as any)
        .from("ged_documentos")
        .update({
          nome: nome.trim(),
          pasta_id: pastaId || null,
        })
        .eq("id", documento.id);
      if (error) throw error;
      toast.success("Documento atualizado");
      onAtualizado();
    } catch (e) {
      toast.error("Erro: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalhe do documento</SheetTitle>
        </SheetHeader>

        {documento && (
          <div className="mt-6 space-y-4">
            {signedUrl && (
              <div className="rounded-lg overflow-hidden border bg-muted">
                <iframe
                  src={signedUrl}
                  className="w-full"
                  style={{ height: "400px" }}
                  title={documento.nome}
                />
                <div className="p-2 border-t bg-background text-center">
                  <a
                    href={signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Abrir em nova aba
                  </a>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Pasta</Label>
              <Select value={pastaId} onValueChange={setPastaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem pasta" />
                </SelectTrigger>
                <SelectContent>
                  {pastas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Tipo:</span>{" "}
                <Badge variant="outline" className="capitalize">
                  {documento.tipo_documento}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Tamanho:</span>{" "}
                {formatBytes(documento.tamanho_bytes)}
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Adicionado:</span>{" "}
                {formatDateBR(documento.created_at)}
              </div>
            </div>

            {documento.resumo_ia && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                <div className="flex items-center gap-2 font-medium text-blue-800 text-sm mb-1">
                  <Info className="h-4 w-4" />
                  Resumo IA
                </div>
                <p className="text-sm text-blue-700">{documento.resumo_ia}</p>
              </div>
            )}

            {documento.classificacao_ia?.pontos_principais?.length > 0 && (
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                <div className="flex items-center gap-2 font-medium text-yellow-800 text-sm mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  Pontos principais
                </div>
                <ul className="space-y-1">
                  {documento.classificacao_ia.pontos_principais.map(
                    (p: string, i: number) => (
                      <li
                        key={i}
                        className="text-xs text-yellow-700 flex gap-2"
                      >
                        <span>•</span>
                        <span>{p}</span>
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}

            {documento.tags && documento.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {documento.tags.map((t) => (
                  <span
                    key={t}
                    className="text-xs bg-muted px-2 py-1 rounded"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-4 border-t">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onExcluir(documento)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  Fechar
                </Button>
                <Button onClick={salvarAlteracoes} disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
