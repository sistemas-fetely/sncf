import { useState, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SmartBackButton } from "@/components/SmartBackButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, X } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageShell } from "@/components/layout/PageShell";

const TI_COLOR = "#3A7D6B";

const slugify = (s: string) =>
  s.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);

export default function DocumentacaoForm() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState("tecnico");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [conteudo, setConteudo] = useState("# Novo Documento\n\n");
  const [salvando, setSalvando] = useState(false);

  const slug = slugify(titulo);

  const adicionarTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      const t = tagInput.trim().toLowerCase();
      if (!tags.includes(t)) setTags([...tags, t]);
      setTagInput("");
    }
  };

  const removerTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const salvar = async () => {
    if (!user) return;
    if (!titulo.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    if (!slug) {
      toast.error("Slug inválido — use letras no título");
      return;
    }
    setSalvando(true);
    const { data, error } = await (supabase as any)
      .from("sncf_documentacao")
      .insert({
        slug,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        tipo,
        conteudo,
        tags,
        versao: 1,
        autor_user_id: user.id,
        autor_nome: profile?.full_name || user.email,
        editado_por: user.id,
        editado_por_nome: profile?.full_name || user.email,
      })
      .select("slug")
      .maybeSingle();

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success("Documento criado!");
      navigate(`/documentacao/${data?.slug || slug}`);
    }
    setSalvando(false);
  };

  return (
    <PageShell variant="leitura">
      <div className="flex items-center justify-between gap-3">
        <SmartBackButton fallback="/documentacao" fallbackLabel="Documentação" />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/documentacao")} className="gap-2">
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
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Título *</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Guia de Onboarding" />
              {slug && (
                <p className="text-xs text-muted-foreground">
                  Slug: <code className="bg-muted px-1 rounded">{slug}</code>
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
          </div>

          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição curta do documento"
            />
          </div>

          <div className="space-y-1">
            <Label>Tags (Enter para adicionar)</Label>
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={adicionarTag}
              placeholder="Adicionar tag..."
            />
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((t) => (
                  <Badge
                    key={t}
                    variant="outline"
                    className="cursor-pointer gap-1"
                    onClick={() => removerTag(t)}
                  >
                    {t} <X className="h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
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
        </CardContent>
      </Card>
    </PageShell>
  );
}
