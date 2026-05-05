import { useState } from "react";
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
} from "lucide-react";
import { useParametros } from "@/hooks/useParametros";
import { formatDateBR } from "@/lib/format-currency";

interface Pasta {
  id: string;
  nome: string;
  descricao: string | null;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  total_documentos: number;
  ultimo_upload: string | null;
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
  const [pastaSelecionada, setPastaSelecionada] = useState<string>(PASTA_SOLTOS);
  const [busca, setBusca] = useState("");
  const [novaPastaOpen, setNovaPastaOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [docDetalhe, setDocDetalhe] = useState<Documento | null>(null);

  const { data: pastas = [], isLoading: loadingPastas } = useQuery({
    queryKey: ["ged-pastas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_ged_pastas_kpis")
        .select("*")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Pasta[];
    },
  });

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

          {pastas.map((p) => (
            <button
              key={p.id}
              className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
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
              <Badge variant="secondary" className="text-xs shrink-0">
                {p.total_documentos}
              </Badge>
            </button>
          ))}
        </div>
      </aside>

      {/* Conteúdo principal */}
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
function NovaPastaDialog({
  open,
  onOpenChange,
  onSalvo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSalvo: () => void;
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
      const { error } = await (supabase as any).from("ged_pastas").insert({
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        parceiro_id: parceiroId || null,
      });
      if (error) throw error;
      toast.success("Pasta criada");
      setNome("");
      setDescricao("");
      setParceiroId("");
      onSalvo();
    } catch (e) {
      toast.error("Erro: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova pasta</DialogTitle>
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

// ─── Dialog: Upload ──────────────────────────────────────────
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
  const [file, setFile] = useState<File | null>(null);
  const [extraindo, setExtraindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [dadosIA, setDadosIA] = useState<any>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);

  // Campos editáveis
  const [nome, setNome] = useState("");
  const [tipoDoc, setTipoDoc] = useState("outro");
  const [pastaId, setPastaId] = useState<string>(pastaIdInicial ?? "");
  const [parceiroId, setParceiroId] = useState<string>("");
  const [tags, setTags] = useState<string>("");

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
    setFile(null);
    setDadosIA(null);
    setStoragePath(null);
    setNome("");
    setTipoDoc("outro");
    setPastaId(pastaIdInicial ?? "");
    setParceiroId("");
    setTags("");
  }

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setNome(f.name.replace(/\.[^/.]+$/, ""));

    setExtraindo(true);
    try {
      // Upload no storage
      const path = `${Date.now()}_${f.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("ged")
        .upload(path, f, { contentType: f.type });
      if (upErr) throw new Error("Upload: " + upErr.message);
      setStoragePath(path);

      // IA classifica (só PDF por enquanto)
      if (f.type === "application/pdf") {
        const formData = new FormData();
        formData.append("file", f);
        const res = await supabase.functions.invoke("classificar-documento-ged", {
          body: formData,
        });
        if (!res.error && res.data) {
          const dados = res.data;
          setDadosIA(dados);
          if (dados.nome_sugerido) setNome(dados.nome_sugerido);
          if (dados.tipo_documento) setTipoDoc(dados.tipo_documento);
          if (dados.tags_sugeridas?.length) {
            setTags(dados.tags_sugeridas.join(", "));
          }

          if (dados.parceiro_cnpj) {
            const { data: p } = await (supabase as any)
              .from("parceiros_comerciais")
              .select("id")
              .eq("cnpj", String(dados.parceiro_cnpj).replace(/\D/g, ""))
              .maybeSingle();
            if (p?.id) setParceiroId(p.id);
          }
        }
      }
    } catch (err) {
      toast.error("Erro: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExtraindo(false);
    }
  }

  async function salvar() {
    if (!file || !storagePath) {
      toast.error("Suba um arquivo primeiro");
      return;
    }
    if (!nome.trim()) {
      toast.error("Nome obrigatório");
      return;
    }
    setSalvando(true);
    try {
      const tagsArr = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const { error } = await (supabase as any).from("ged_documentos").insert({
        pasta_id: pastaId || null,
        nome: nome.trim(),
        arquivo_original: file.name,
        tipo_documento: tipoDoc,
        parceiro_id: parceiroId || null,
        storage_path: storagePath,
        mime_type: file.type,
        tamanho_bytes: file.size,
        tags: tagsArr,
        resumo_ia: dadosIA?.resumo ?? null,
        classificacao_ia: dadosIA ?? null,
        confianca_ia: dadosIA?.confianca ?? null,
      });

      if (error) throw error;
      toast.success("Documento salvo no GED");
      reset();
      onSalvo();
    } catch (e) {
      toast.error("Erro: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload de documento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload */}
          {!file ? (
            <div
              className="rounded-lg border-2 border-dashed p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => document.getElementById("ged-upload-input")?.click()}
            >
              <input
                id="ged-upload-input"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={handleArquivo}
              />
              <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Clique para subir um arquivo (PDF, imagem ou Office)
              </p>
              <p className="text-xs text-muted-foreground mt-1">Máx 8MB</p>
            </div>
          ) : (
            <div className="rounded-lg border p-3 flex items-center gap-3 bg-muted/30">
              <FileText className="h-6 w-6 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                </p>
              </div>
              {extraindo && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  reset();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* IA insights */}
          {dadosIA?.resumo && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-2">
              <div className="flex items-center gap-2 font-medium text-blue-800 text-sm">
                <Info className="h-4 w-4" />
                Resumo IA
              </div>
              <p className="text-sm text-blue-700">{dadosIA.resumo}</p>
              {dadosIA.pontos_principais?.length > 0 && (
                <details>
                  <summary className="text-xs text-blue-600 cursor-pointer">
                    Pontos principais
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {dadosIA.pontos_principais.map((p: string, i: number) => (
                      <li
                        key={i}
                        className="text-xs text-blue-700 flex gap-2"
                      >
                        <span>•</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Campos editáveis */}
          {file && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Nome *</Label>
                  <Input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Tipo *</Label>
                  <Select value={tipoDoc} onValueChange={setTipoDoc}>
                    <SelectTrigger>
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
                  <Label>Pasta</Label>
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
                <div className="space-y-1">
                  <Label>Parceiro</Label>
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
              </div>

              <div className="space-y-1">
                <Label>Tags (separadas por vírgula)</Label>
                <Input
                  placeholder="reforma, escritorio, sp"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!file || salvando || extraindo}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
