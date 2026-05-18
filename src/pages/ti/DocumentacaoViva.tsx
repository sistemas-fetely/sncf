import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BookOpen, Plus, Search, Sparkles, Copy, FileText } from "lucide-react";
import { toast } from "sonner";

const TI_COLOR = "#3A7D6B";

interface Documento {
  id: string;
  slug: string;
  titulo: string;
  descricao: string | null;
  tipo: string;
  tags: string[] | null;
  versao: number;
  updated_at: string;
  editado_por_nome: string | null;
}

const PROMPT_CONTINUIDADE = `Continuando o desenvolvimento do SNCF (Sistema Nervoso Central Fetely).
Leia o Estado_Atual_PeopleFetely.md e o RunBook_PeopleFetely_Tecnico.md antes de começar.
Repositório: github.com/sistemas-fetely/people-fetely-29d8a45f
Produção: https://sncf.lovable.app`;

export default function DocumentacaoViva() {
  const navigate = useNavigate();
  const { hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(["super_admin", "admin_rh"]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("sncf_documentacao")
        .select("id, slug, titulo, descricao, tipo, tags, versao, updated_at, editado_por_nome")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) toast.error("Erro ao carregar documentos: " + error.message);
      else setDocs((data || []) as Documento[]);
      setLoading(false);
    };
    void load();
  }, []);

  const copiarPrompt = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_CONTINUIDADE);
      toast.success("Prompt copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const filtered = docs.filter((d) => {
    if (tipoFiltro !== "todos" && d.tipo !== tipoFiltro) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      return (
        d.titulo.toLowerCase().includes(s) ||
        (d.descricao || "").toLowerCase().includes(s) ||
        (d.tags || []).some((t) => t.toLowerCase().includes(s))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: TI_COLOR }}>
            Documentação Viva
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Apenas 2 documentos vivos: <strong>RunBook Técnico</strong> e <strong>Estado & Roadmap</strong>. Para dúvidas operacionais, use o <strong>Fala Fetely</strong>.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => navigate("/ti/documentacao/novo")}
            variant="outline"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Novo Documento
          </Button>
        )}
      </div>

      {/* Card de destaque — Prompt de continuidade */}
      <Card className="border-l-4" style={{ borderLeftColor: TI_COLOR }}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0"
                style={{ backgroundColor: `${TI_COLOR}15` }}
              >
                <Sparkles className="h-6 w-6" style={{ color: TI_COLOR }} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                  Iniciar Nova Sessão de Desenvolvimento
                </p>
                <h3 className="text-lg font-semibold mt-0.5">
                  Copie o prompt de continuidade para colar no Claude
                </h3>
              </div>
            </div>
            <Button onClick={copiarPrompt} variant="outline" className="gap-2">
              <Copy className="h-4 w-4" />
              Copiar Prompt
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Busca e filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, descrição ou tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="tecnico">Técnico</SelectItem>
            <SelectItem value="usuario">Usuário</SelectItem>
            <SelectItem value="estado_atual">Estado Atual</SelectItem>
            <SelectItem value="roadmap">Roadmap</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="continuidade">Continuidade</SelectItem>
            <SelectItem value="outro">Outro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid de documentos */}
      {loading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">Nenhum documento encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((doc) => (
            <Card
              key={doc.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/ti/documentacao/${doc.slug}`)}
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4 flex-shrink-0" style={{ color: TI_COLOR }} />
                      <Badge variant="outline" className="text-xs capitalize">
                        {doc.tipo.replace("_", " ")}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-base">{doc.titulo}</h3>
                    {doc.descricao && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {doc.descricao}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="flex-shrink-0">
                    v{doc.versao}
                  </Badge>
                </div>

                {doc.tags && doc.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {doc.tags.slice(0, 4).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 mt-3 text-xs text-muted-foreground">
                  <span>Atualizado: {new Date(doc.updated_at).toLocaleDateString("pt-BR")}</span>
                  {doc.editado_por_nome && <span>Por: {doc.editado_por_nome}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
