import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SmartBackButton } from "@/components/SmartBackButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, History, Edit, Save, X, RotateCcw, Eye } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const TI_COLOR = "#3A7D6B";

interface Documento {
  id: string;
  slug: string;
  titulo: string;
  descricao: string | null;
  tipo: string;
  conteudo: string;
  tags: string[] | null;
  versao: number;
  updated_at: string;
  editado_por_nome: string | null;
  autor_nome: string | null;
}

interface Versao {
  id: string;
  versao: number;
  titulo: string;
  conteudo: string;
  editado_por_nome: string | null;
  created_at: string;
}

export default function DocumentacaoDetalhe() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { temNivel } = useNivel();
  const isAdmin = temNivel(3);

  const [doc, setDoc] = useState<Documento | null>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [showHistorico, setShowHistorico] = useState(false);
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [versaoSelecionada, setVersaoSelecionada] = useState<Versao | null>(null);

  const carregarDoc = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("sncf_documentacao")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) {
      toast.error("Erro ao carregar: " + error.message);
    } else if (data) {
      setDoc(data as Documento);
      setTitulo(data.titulo);
      setDescricao(data.descricao || "");
      setConteudo(data.conteudo);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (slug) void carregarDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const carregarVersoes = async () => {
    if (!doc) return;
    const { data, error } = await (supabase as any)
      .from("sncf_documentacao_versoes")
      .select("*")
      .eq("documento_id", doc.id)
      .order("versao", { ascending: false });
    if (error) toast.error("Erro: " + error.message);
    else setVersoes((data || []) as Versao[]);
  };

  const abrirHistorico = async () => {
    await carregarVersoes();
    setShowHistorico(true);
  };

  const salvar = async () => {
    if (!doc || !user) return;
    if (!titulo.trim()) {
      toast.error("Título obrigatório");
      return;
    }
    setSalvando(true);
    const { error } = await (supabase as any)
      .from("sncf_documentacao")
      .update({
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        conteudo,
        editado_por: user.id,
        editado_por_nome: profile?.full_name || user.email,
      })
      .eq("id", doc.id);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success("Documento salvo!");
      setEditando(false);
      await carregarDoc();
    }
    setSalvando(false);
  };

  const cancelar = () => {
    if (!doc) return;
    setTitulo(doc.titulo);
    setDescricao(doc.descricao || "");
    setConteudo(doc.conteudo);
    setEditando(false);
  };

  const restaurarVersao = async (versao: Versao) => {
    if (!doc || !user) return;
    if (!confirm(`Restaurar conteúdo da versão v${versao.versao}? A versão atual ficará no histórico.`)) return;
    const { error } = await (supabase as any)
      .from("sncf_documentacao")
      .update({
        titulo: versao.titulo,
        conteudo: versao.conteudo,
        editado_por: user.id,
        editado_por_nome: profile?.full_name || user.email,
      })
      .eq("id", doc.id);
    if (error) {
      toast.error("Erro: " + error.message);
    } else {
      toast.success(`Restaurada para v${versao.versao}`);
      setVersaoSelecionada(null);
      setShowHistorico(false);
      await carregarDoc();
    }
  };

  if (loading) {
    return <p className="text-muted-foreground text-sm py-8 text-center">Carregando...</p>;
  }

  if (!doc) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Documento não encontrado.</p>
        <Button variant="outline" onClick={() => navigate("/ti/documentacao")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SmartBackButton fallback="/documentacao" fallbackLabel="Documentação" />

        <div className="flex gap-2">
          {!editando && isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={abrirHistorico} className="gap-2">
                <History className="h-4 w-4" /> Histórico
              </Button>
              <Button
                size="sm"
                onClick={() => setEditando(true)}
                className="gap-2 text-white"
                style={{ backgroundColor: TI_COLOR }}
              >
                <Edit className="h-4 w-4" /> Editar
              </Button>
            </>
          )}
          {editando && (
            <>
              <Button variant="outline" size="sm" onClick={cancelar} className="gap-2">
                <X className="h-4 w-4" /> Cancelar
              </Button>
              <Button
                size="sm"
                onClick={salvar}
                disabled={salvando}
                className="gap-2 text-white"
                style={{ backgroundColor: TI_COLOR }}
              >
                <Save className="h-4 w-4" /> {salvando ? "Salvando..." : "Salvar"}
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          {editando ? (
            <>
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="text-xl font-medium"
                placeholder="Título"
              />
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descrição curta"
              />
            </>
          ) : (
            <PageHeader
              titulo={doc.titulo}
              estado={doc.descricao || undefined}
            />
          )}

          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground pt-1">
            <Badge variant="outline" className="capitalize">{doc.tipo.replace("_", " ")}</Badge>
            <Badge variant="secondary">v{doc.versao}</Badge>
            <span>Atualizado: {new Date(doc.updated_at).toLocaleString("pt-BR")}</span>
            {doc.editado_por_nome && <span>· Por: {doc.editado_por_nome}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {editando ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Markdown (editor)</Label>
                <Textarea
                  value={conteudo}
                  onChange={(e) => setConteudo(e.target.value)}
                  className="min-h-[600px] font-mono text-sm"
                  placeholder="# Título do documento..."
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Preview</Label>
                <div className="min-h-[600px] border rounded-lg p-4 overflow-auto prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{conteudo}</ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.conteudo}</ReactMarkdown>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico */}
      <Sheet open={showHistorico} onOpenChange={setShowHistorico}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Histórico de versões</SheetTitle>
            <SheetDescription>{doc.titulo}</SheetDescription>
          </SheetHeader>
          <div className="space-y-2 mt-4">
            {versoes.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhuma versão anterior — este é o primeiro registro.
              </p>
            )}
            {versoes.map((v) => (
              <Card key={v.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <Badge variant="secondary">v{v.versao}</Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(v.created_at).toLocaleString("pt-BR")}
                      </p>
                      {v.editado_por_nome && (
                        <p className="text-xs text-muted-foreground">Por: {v.editado_por_nome}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setVersaoSelecionada(v)} className="gap-1">
                        <Eye className="h-3 w-3" /> Ver
                      </Button>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void restaurarVersao(v)}
                          className="gap-1"
                        >
                          <RotateCcw className="h-3 w-3" /> Restaurar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Visualizar versão antiga */}
      <Dialog open={!!versaoSelecionada} onOpenChange={(o) => { if (!o) setVersaoSelecionada(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {versaoSelecionada?.titulo} <Badge variant="secondary" className="ml-2">v{versaoSelecionada?.versao}</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{versaoSelecionada?.conteudo || ""}</ReactMarkdown>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
