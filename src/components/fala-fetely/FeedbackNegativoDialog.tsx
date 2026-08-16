import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface FeedbackNegativoDialogProps {
  mensagem: { id: string; conteudo: string };
  perguntaOriginal: string;
  podeEnsinar: boolean;
  onClose: () => void;
  onEnviado: () => void;
}

const MOTIVOS = [
  { value: "informacao_incorreta", label: "Informação incorreta" },
  { value: "incompleta",           label: "Incompleta" },
  { value: "desatualizada",        label: "Desatualizada" },
  { value: "tom_inadequado",       label: "Tom inadequado" },
  { value: "outro",                label: "Outro" },
];

export function FeedbackNegativoDialog({
  mensagem, perguntaOriginal, podeEnsinar, onClose, onEnviado,
}: FeedbackNegativoDialogProps) {
  const { user } = useAuth();
  const [motivo, setMotivo] = useState<string>("");
  const [respostaEsperada, setRespostaEsperada] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function enviar() {
    if (!user || !motivo) return;
    if (mensagem.id.startsWith("tmp-")) {
      toast({ title: "Aguarde", description: "Mensagem ainda processando.", variant: "destructive" });
      return;
    }
    setSalvando(true);
    try {
      const { error: fbError } = await supabase
        .from("fala_fetely_feedback")
        .upsert(
          {
            mensagem_id: mensagem.id,
            user_id: user.id,
            util: false,
            motivo,
            resposta_esperada: respostaEsperada.trim() || null,
          },
          { onConflict: "mensagem_id,user_id" }
        );
      if (fbError) throw fbError;

      if (podeEnsinar && respostaEsperada.trim()) {
        await supabase.from("fala_fetely_sugestoes_conhecimento").insert({
          mensagem_id: mensagem.id,
          user_id: user.id,
          pergunta_original: perguntaOriginal,
          resposta_ia: mensagem.conteudo,
          correcao_sugerida: respostaEsperada.trim(),
          origem: "feedback_negativo",
          status: "pendente",
        });
      }
      onEnviado();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>O que estava errado?</DialogTitle>
          <DialogDescription>
            Seu feedback ajuda o Fala Fetely a melhorar. Conta pra gente o que poderia ser melhor nessa resposta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Motivo *</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Escolha um motivo" />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Como deveria ter sido? (opcional)</Label>
            <Textarea
              value={respostaEsperada}
              onChange={(e) => setRespostaEsperada(e.target.value)}
              placeholder="Escreva aqui se quiser detalhar o que seria uma boa resposta..."
              rows={4}
              className="mt-1"
            />
          </div>

          {podeEnsinar && respostaEsperada.trim() && (
            <div className="bg-success/10 border border-success/40 p-3 rounded-lg">
              <p className="text-xs text-success">
                💡 Sua sugestão de resposta será enviada para a equipe de RH revisar e potencialmente adicionar à Base de Conhecimento do Fala Fetely.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button
            onClick={enviar}
            disabled={!motivo || salvando}
            style={{ backgroundColor: "#1A4A3A" }}
            className="text-white hover:opacity-90 gap-2"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
