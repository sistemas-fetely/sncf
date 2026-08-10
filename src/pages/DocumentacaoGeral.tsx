import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, FileText, Search, BookOpen, ChevronRight, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errorMessages";

interface Documento {
  id: string;
  slug: string;
  titulo: string;
  descricao: string | null;
  categoria: string;
  tipo: string;
  tags: string[] | null;
  versao: number;
  updated_at: string;
  editado_por_nome: string | null;
}

const CATEGORIAS = [
  { value: "todos", label: "Todas as categorias", icon: "📚" },
  { value: "dna_marca", label: "DNA & Marca", icon: "🧬" },
  { value: "people", label: "People (RH)", icon: "👥" },
  { value: "juridico", label: "Jurídico", icon: "⚖️" },
  { value: "ti", label: "TI", icon: "🖥️" },
  { value: "operacional", label: "Operacional", icon: "📊" },
  { value: "roadmap", label: "Roadmap", icon: "🗺️" },
];

const SNCF_COLOR = "#1A4A3A";

export default function DocumentacaoGeral() {
  const navigate = useNavigate();
  const { roles: authRoles } = useAuth();
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");

  const [docs, setDocs] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroCategoria, setFiltroCategoria] = useState("todos");
  const [buscaTexto, setBuscaTexto] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Documento | null>(null);

  useEffect(() => {
    void carregar();
  }, []);

  const handleDeleteDoc = async () => {
    if (!deleteTarget) return;
    await (supabase as any).from("sncf_documentacao_versoes").delete().eq("documento_id", deleteTarget.id);
    const { error } = await (supabase as any).from("sncf_documentacao").delete().eq("id", deleteTarget.id);
    if (error) toast.error("Erro ao excluir: " + humanizeError(error.message));
    else {
      toast.success("Documento excluído");
      void carregar();
    }
    setDeleteTarget(null);
  };

  const carregar = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("sncf_documentacao")
      .select("id, slug, titulo, descricao, categoria, tipo, tags, versao, updated_at, editado_por_nome")
      .eq("ativo", true)
      .order("categoria")
      .order("ordem");
    setDocs((data || []) as Documento[]);
    setLoading(false);
  };

  const docsFiltrados = docs.filter((d) => {
    if (filtroCategoria !== "todos" && d.categoria !== filtroCategoria) return false;
    if (buscaTexto.trim()) {
      const busca = buscaTexto.toLowerCase();
      return (
        d.titulo.toLowerCase().includes(busca) ||
        (d.descricao || "").toLowerCase().includes(busca) ||
        (d.tags || []).some((t) => t.toLowerCase().includes(busca))
      );
    }
    return true;
  });

  const porCategoria = docsFiltrados.reduce<Record<string, Documento[]>>((acc, d) => {
    const cat = d.categoria || "operacional";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(d);
    return acc;
  }, {});

  const categoriaInfo = (cat: string) =>
    CATEGORIAS.find((c) => c.value === cat) || { label: cat, icon: "📄" };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6" style={{ color: SNCF_COLOR }} />
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: SNCF_COLOR }}>
              Documentação Fetely
            </h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Tudo que a Fetely sabe, em um lugar só. Documentos vivos — atualizados a cada sessão.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, descrição ou tag..."
            value={buscaTexto}
            onChange={(e) => setBuscaTexto(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIAS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.icon} {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {docsFiltrados.length} documento{docsFiltrados.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Lista agrupada */}
      {docsFiltrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              Nenhum documento encontrado{buscaTexto ? ` para "${buscaTexto}"` : ""}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(porCategoria).map(([cat, docsCategoria]) => {
            const info = categoriaInfo(cat);
            return (
              <div key={cat} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xl">{info.icon}</span>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {info.label}
                  </h2>
                  <span className="text-xs text-muted-foreground/70">
                    ({docsCategoria.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {docsCategoria.map((doc) => (
                    <Card
                      key={doc.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => navigate(`/documentacao/${doc.slug}`, { state: { from: "/documentacao", fromLabel: "Documentação" } })}
                    >
                      <CardContent className="pt-5 pb-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <FileText className="h-4 w-4 flex-shrink-0" style={{ color: SNCF_COLOR }} />
                              <h3 className="font-semibold text-base truncate">{doc.titulo}</h3>
                              <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                                v{doc.versao}
                              </Badge>
                            </div>
                            {doc.descricao && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                {doc.descricao}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1 items-center text-[10px] text-muted-foreground">
                              {(doc.tags || []).slice(0, 4).map((t) => (
                                <Badge key={t} variant="outline" className="text-[10px]">
                                  {t}
                                </Badge>
                              ))}
                              {doc.editado_por_nome && (
                                <span className="ml-1">· editado por {doc.editado_por_nome}</span>
                              )}
                              <span>
                                · {new Date(doc.updated_at).toLocaleDateString("pt-BR")}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {isSuperAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(doc); }}
                                aria-label="Excluir documento"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              O documento "{deleteTarget?.titulo}" e suas versões serão excluídos. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDoc} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
