import { useEffect, useState } from "react";
import { GraduationCap, Check, X, Loader2, MessageSquareWarning } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface SugestaoPendente {
  id: string;
  mensagem_id: string | null;
  user_id: string;
  pergunta_original: string | null;
  resposta_ia: string | null;
  correcao_sugerida: string;
  categoria_sugerida: string | null;
  titulo_sugerido: string | null;
  origem: "ensinar" | "feedback_negativo";
  status: string;
  created_at: string;
}

interface SugestoesPendentesProps {
  sugestoes: SugestaoPendente[];
  onAprovar: (sugestao: SugestaoPendente) => void;
  onAtualizar: () => void;
}

export function SugestoesPendentes({ sugestoes, onAprovar, onAtualizar }: SugestoesPendentesProps) {
  const [autores, setAutores] = useState<Record<string, string>>({});
  const [rejeitando, setRejeitando] = useState<SugestaoPendente | null>(null);

  useEffect(() => {
    void carregarAutores();
  }, [sugestoes]);

  async function carregarAutores() {
    const ids = Array.from(new Set(sugestoes.map((s) => s.user_id)));
    if (!ids.length) return;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", ids);
    const map: Record<string, string> = {};
    (data || []).forEach((p: any) => { map[p.user_id] = p.full_name || "—"; });
    setAutores(map);
  }

  if (sugestoes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>Nenhuma sugestão pendente por enquanto.</p>
        <p className="text-xs mt-1">
          Conforme usuários ensinarem o Fala Fetely, sugestões aparecerão aqui.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3">
        {sugestoes.map((s) => (
          <Card key={s.id} className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {s.origem === "ensinar" ? (
                  <Badge style={{ backgroundColor: "#1A4A3A", color: "white", border: 0 }} className="gap-1">
                    <GraduationCap className="h-3 w-3" /> Ensinou
                  </Badge>
                ) : (
                  <Badge style={{ backgroundColor: "#E8833A", color: "white", border: 0 }} className="gap-1">
                    <MessageSquareWarning className="h-3 w-3" /> Feedback negativo
                  </Badge>
                )}
                {s.categoria_sugerida && (
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {s.categoria_sugerida}
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {autores[s.user_id] || "—"} · {new Date(s.created_at).toLocaleString("pt-BR")}
              </span>
            </div>

            {s.titulo_sugerido && (
              <p className="text-sm font-medium">{s.titulo_sugerido}</p>
            )}

            {s.pergunta_original && (
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Pergunta original</p>
                <p className="text-sm">{s.pergunta_original}</p>
              </div>
            )}

            {s.resposta_ia && (
              <div className="bg-muted p-3 rounded-lg max-h-32 overflow-y-auto">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Resposta da IA</p>
                <p className="text-sm whitespace-pre-wrap">{s.resposta_ia}</p>
              </div>
            )}

            <div className="bg-success/10 border-l-4 border-l-[#1A4A3A] p-3 rounded-lg">
              <p className="text-[10px] uppercase tracking-wide text-success mb-1 font-medium">Correção sugerida</p>
              <p className="text-sm whitespace-pre-wrap">{s.correcao_sugerida}</p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRejeitando(s)}
                className="gap-1 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" /> Rejeitar
              </Button>
              <Button
                size="sm"
                onClick={() => onAprovar(s)}
                style={{ backgroundColor: "#1A4A3A" }}
                className="gap-1 text-white hover:opacity-90"
              >
                <Check className="h-3.5 w-3.5" /> Aprovar e criar conhecimento
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {rejeitando && (
        <RejeitarDialog
          sugestao={rejeitando}
          onClose={() => setRejeitando(null)}
          onRejeitada={() => {
            setRejeitando(null);
            onAtualizar();
          }}
        />
      )}
    </>
  );
}

function RejeitarDialog({
  sugestao, onClose, onRejeitada,
}: { sugestao: SugestaoPendente; onClose: () => void; onRejeitada: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function rejeitar() {
    setSalvando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("fala_fetely_sugestoes_conhecimento")
        .update({
          status: "rejeitada",
          revisado_por: userData.user?.id ?? null,
          revisado_em: new Date().toISOString(),
          observacao_revisao: motivo.trim() || null,
        })
        .eq("id", sugestao.id);
      if (error) throw error;
      toast({ title: "Sugestão rejeitada" });
      onRejeitada();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rejeitar sugestão</DialogTitle>
          <DialogDescription>
            Conte brevemente o motivo (opcional). O autor não recebe esta mensagem por enquanto, mas fica registrado para auditoria.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label>Motivo da rejeição</Label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex: Já temos esse conhecimento na base, ou informação imprecisa..."
            className="mt-1"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button
            variant="destructive"
            onClick={rejeitar}
            disabled={salvando}
            className="gap-2"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar rejeição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
