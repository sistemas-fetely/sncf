import { useState } from "react";
import { Lightbulb, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export interface SugestaoItem {
  id: string;
  titulo_sugerido: string | null;
  descricao: string;
  origem: string;
  sugerido_em: string;
  processo_id: string | null;
  processos?: { id: string; nome: string; codigo: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sugestoes: SugestaoItem[];
}

const ORIGEM_LABEL: Record<string, string> = {
  fala_fetely: "via Fala Fetely",
  descoberto_em_mapeamento: "descoberto em mapeamento",
  manual: "manual",
};

type Acao = "aceita" | "rejeitada" | "aplicada";

const ACAO_LABEL: Record<Acao, string> = {
  aceita: "Aceitar",
  rejeitada: "Rejeitar",
  aplicada: "Marcar como aplicada",
};

function tempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return `há ${meses} mês${meses > 1 ? "es" : ""}`;
}

export function SugestoesInboxDialog({ open, onOpenChange, sugestoes }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [decidindo, setDecidindo] = useState<{ sug: SugestaoItem; acao: Acao } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const abrirDecisao = (sug: SugestaoItem, acao: Acao) => {
    setDecidindo({ sug, acao });
    setMotivo("");
  };

  const confirmar = async () => {
    if (!decidindo) return;
    const { sug, acao } = decidindo;
    if (acao === "rejeitada" && !motivo.trim()) {
      toast.error("Informe o motivo da rejeição");
      return;
    }
    setSalvando(true);
    const { error } = await supabase
      .from("processos_sugestoes")
      .update({
        status: acao,
        motivo_decisao: motivo.trim() || null,
        avaliado_por: user?.id ?? null,
        avaliado_em: new Date().toISOString(),
      })
      .eq("id", sug.id);
    setSalvando(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success(`Sugestão ${ACAO_LABEL[acao].toLowerCase()}`);
    setDecidindo(null);
    qc.invalidateQueries({ queryKey: ["dashboard-sugestoes-pendentes"] });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-warning" />
              Sugestões pendentes
            </DialogTitle>
            <DialogDescription>
              Sugestões enviadas pelo Fala Fetely ou descobertas em mapeamentos. Avalie cada uma para fechar o ciclo.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {sugestoes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                ✅ Nenhuma sugestão pendente
              </p>
            ) : (
              sugestoes.map((s) => (
                <Card key={s.id} className="border">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        {s.titulo_sugerido && (
                          <p className="text-sm font-medium">{s.titulo_sugerido}</p>
                        )}
                        <p className="text-sm text-muted-foreground whitespace-pre-line">
                          {s.descricao.length > 240 ? s.descricao.slice(0, 240) + "…" : s.descricao}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pl-6">
                      <span>{tempoRelativo(s.sugerido_em)}</span>
                      <span>·</span>
                      <Badge variant="outline" className="text-xs">
                        {ORIGEM_LABEL[s.origem] ?? s.origem}
                      </Badge>
                      {s.processos && (
                        <>
                          <span>·</span>
                          <Link
                            to={`/processos/${s.processos.id}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {s.processos.nome}
                          </Link>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 pl-6 pt-1">
                      <Button size="sm" variant="outline" onClick={() => abrirDecisao(s, "rejeitada")}>
                        Rejeitar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => abrirDecisao(s, "aplicada")}>
                        Marcar como aplicada
                      </Button>
                      <Button size="sm" onClick={() => abrirDecisao(s, "aceita")}>
                        Aceitar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!decidindo} onOpenChange={(o) => !o && setDecidindo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decidindo ? ACAO_LABEL[decidindo.acao] : ""}
            </DialogTitle>
            <DialogDescription>
              {decidindo?.acao === "rejeitada"
                ? "Explique por que essa sugestão foi rejeitada (obrigatório)."
                : "Adicione um comentário se quiser (opcional)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo da decisão</Label>
            <Textarea
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={decidindo?.acao === "rejeitada" ? "Ex.: já existe processo equivalente" : "Opcional"}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecidindo(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={salvando}>
              {salvando ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
