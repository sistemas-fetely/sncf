import { useState } from "react";
import { Lightbulb, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NOVO = "__novo__";

export function SugerirProcessoDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [processoId, setProcessoId] = useState<string>(NOVO);
  const [tituloSugerido, setTituloSugerido] = useState("");
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);

  const { data: processos } = useQuery({
    queryKey: ["processos-para-sugerir"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("processos")
        .select("id, nome, codigo")
        .order("nome");
      return data || [];
    },
  });

  function reset() {
    setProcessoId(NOVO);
    setTituloSugerido("");
    setDescricao("");
  }

  async function enviar() {
    if (!user) return;
    if (!descricao.trim() || descricao.trim().length < 10) {
      toast({
        title: "Conta um pouco mais",
        description: "Descreva sua sugestão com pelo menos 10 caracteres.",
        variant: "destructive",
      });
      return;
    }
    if (processoId === NOVO && !tituloSugerido.trim()) {
      toast({
        title: "Falta o título",
        description: "Para sugerir um processo novo, dê um nome a ele.",
        variant: "destructive",
      });
      return;
    }

    setEnviando(true);
    try {
      const { error } = await supabase.from("processos_sugestoes").insert({
        processo_id: processoId === NOVO ? null : processoId,
        titulo_sugerido: processoId === NOVO ? tituloSugerido.trim() : null,
        descricao: descricao.trim(),
        sugerido_por: user.id,
        origem: "fala_fetely",
        status: "pendente",
      } as never);
      if (error) throw error;
      toast({
        title: "Sugestão enviada 💚",
        description: "O dono do processo vai receber pra avaliar.",
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Não consegui enviar",
        description: err instanceof Error ? err.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-warning" />
            Sugerir melhoria de processo
          </DialogTitle>
          <DialogDescription>
            Sugira melhorar um processo existente ou propor um novo. O dono do processo recebe e avalia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Processo</Label>
            <Select value={processoId} onValueChange={setProcessoId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOVO}>+ Sugerir processo novo</SelectItem>
                {(processos || []).map((p: { id: string; nome: string }) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {processoId === NOVO && (
            <div className="space-y-1.5">
              <Label className="text-xs">Título sugerido *</Label>
              <Input
                value={tituloSugerido}
                onChange={(e) => setTituloSugerido(e.target.value)}
                placeholder="Ex: Processo de homologação de fornecedor"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Sua sugestão *</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={5}
              placeholder="Conta o que você acha que deveria mudar, faltou descrever, ou o que poderia existir como processo novo."
            />
            <p className="text-[10px] text-muted-foreground">
              Mínimo 10 caracteres. Quanto mais contexto, melhor.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando} className="gap-2">
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar sugestão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
