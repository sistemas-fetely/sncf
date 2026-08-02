import { useEffect, useRef, useState } from "react";
import { MessageSquareWarning, Loader2, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCriarReporte } from "@/hooks/useReportes";
import { toast } from "sonner";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export function ReportarErroBotao() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState("bug");
  const [descricao, setDescricao] = useState("");
  const [passos, setPassos] = useState("");
  const [imagem, setImagem] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const criar = useCriarReporte();

  // revoga blob local ao desmontar
  const previewRef = useRef<string | null>(null);
  previewRef.current = previewUrl;
  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const { data: tipos } = useQuery({
    queryKey: ["parametros", "tipo_reporte"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parametros")
        .select("valor, label")
        .eq("categoria", "tipo_reporte")
        .eq("ativo", true)
        .order("ordem");
      if (error) return [];
      return Array.isArray(data) ? data : [];
    },
    staleTime: 10 * 60 * 1000,
  });

  if (!user) return null;

  function resetImagem() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImagem(null);
    setPreviewUrl(null);
  }

  function handleSelectImagem(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (!f) {
      resetImagem();
      return;
    }
    if (!f.type.startsWith("image/")) {
      toast.error("Arquivo precisa ser uma imagem");
      e.target.value = "";
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      toast.error("Imagem maior que 5 MB");
      e.target.value = "";
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImagem(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function handleEnviar() {
    if (descricao.trim().length < 5) return;

    let imagemUrl: string | undefined;

    if (imagem && user) {
      setUploading(true);
      try {
        const ext = imagem.name.split(".").pop() || "png";
        const fileName = `reportes/${user.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("sistema-reportes")
          .upload(fileName, imagem, { contentType: imagem.type });
        if (uploadErr) {
          toast.error("Falha no upload da imagem — enviando report sem ela");
        } else {
          const { data: urlData } = supabase.storage
            .from("sistema-reportes")
            .getPublicUrl(fileName);
          imagemUrl = urlData.publicUrl;
        }
      } finally {
        setUploading(false);
      }
    }

    await criar.mutateAsync({
      tipo_valor: tipo,
      descricao,
      passos_reproduzir: passos || undefined,
      imagem_url: imagemUrl,
    });
    setDescricao("");
    setPassos("");
    setTipo("bug");
    resetImagem();
    setOpen(false);
  }

  const enviando = criar.isPending || uploading;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        variant="ghost"
        className="h-9 gap-1.5 rounded-xl px-2 md:px-3 hover:bg-accent"
        title="Reportar erro ou sugestão"
      >
        <MessageSquareWarning className="h-4 w-4" />
        <span className="hidden md:inline text-sm font-medium">Reportar</span>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) resetImagem();
          setOpen(o);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareWarning className="h-5 w-5 text-primary" />
              Reportar algo
            </DialogTitle>
            <DialogDescription>
              Encontrou um bug, viu algo estranho, tem uma ideia? Conta pra gente.
              Na Fetely, usuários também são colaboradores do sistema. 🙌
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Tipo *</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Array.isArray(tipos) ? tipos : []).map((t: { valor: string; label: string }) => (
                    <SelectItem key={t.valor} value={t.valor}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">O que aconteceu? *</Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={4}
                placeholder="Ex: Cliquei em 'Salvar' na aba de Benefícios mas a tela ficou em branco e perdi o que digitei..."
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Mínimo 5 caracteres. Seja específico — nos ajuda a entender rápido.
              </p>
            </div>

            <div>
              <Label className="text-xs">Como reproduzir? (opcional)</Label>
              <Textarea
                value={passos}
                onChange={(e) => setPassos(e.target.value)}
                rows={2}
                placeholder="Ex: 1. Entrei em Pessoas 2. Abri ficha da Maria 3. Cliquei em Editar Benefícios..."
              />
            </div>

            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <ImagePlus className="h-3.5 w-3.5" />
                Captura de tela (opcional)
              </Label>
              <Input
                type="file"
                accept="image/*"
                onChange={handleSelectImagem}
                className="text-xs cursor-pointer"
                disabled={enviando}
              />
              {previewUrl && (
                <div className="mt-2 relative inline-block">
                  <img
                    src={previewUrl}
                    alt="Pré-visualização"
                    className="max-h-40 rounded-md border"
                  />
                  <button
                    type="button"
                    onClick={resetImagem}
                    className="absolute -top-2 -right-2 bg-background border rounded-full p-1 shadow hover:bg-accent"
                    aria-label="Remover imagem"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                Máx. 5 MB. PNG, JPG ou similares.
              </p>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-[11px] text-muted-foreground">
              <p>
                <strong>Contexto automático que vai junto:</strong>
              </p>
              <p>
                📍 Rota: <code className="text-foreground">{location.pathname}</code>
              </p>
              <p>🌐 Largura da tela: {window.innerWidth}px</p>
              <p>🧑 Identificação: seu usuário (para poder te responder)</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button
              onClick={handleEnviar}
              disabled={enviando || descricao.trim().length < 5}
              className="gap-2"
            >
              {enviando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Enviar report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
