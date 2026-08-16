import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, addDays, differenceInDays } from "date-fns";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowRight, XCircle, Loader2, Star, Send, ExternalLink, Clock, ShieldAlert } from "lucide-react";

const KANBAN_STAGES = [
  { key: "recebido", label: "Recebido" },
  { key: "triagem", label: "Triagem" },
  { key: "entrevista_rh", label: "Entrevista RH" },
  { key: "entrevista_gestor", label: "Entrevista Gestor" },
  { key: "teste_tecnico", label: "Teste Técnico" },
  { key: "oferta", label: "Oferta" },
  { key: "contratado", label: "Contratado" },
  { key: "recusado", label: "Recusado" },
];

const statusBadge: Record<string, string> = {
  recebido: "bg-muted text-muted-foreground",
  triagem: "bg-info/15 text-info border-info/30",
  entrevista_rh: "bg-info/15 text-info border-info/30",
  entrevista_gestor: "bg-info/15 text-info border-info/30",
  teste_tecnico: "bg-warning/15 text-warning border-warning/30",
  oferta: "bg-success/15 text-success border-success/30",
  contratado: "bg-success/15 text-success border-success/30",
  recusado: "bg-destructive/15 text-destructive border-destructive/30",
  desistiu: "bg-muted text-muted-foreground",
};

interface Candidato {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  origem: string | null;
  status: string;
  created_at: string | null;
  consentimento_lgpd: boolean | null;
  consentimento_lgpd_at: string | null;
  score_total?: number;
  score_detalhado?: {
    skills_match?: number;
    nivel_skills?: number;
    sistemas_match?: number;
    experiencia?: number;
    motivacao?: number;
    total?: number;
    resumo?: string;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidato: Candidato | null;
  vagaSkills: string[];
  vagaId: string;
}

export function CandidatoDrawer({ open, onOpenChange, candidato, vagaSkills, vagaId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectMotivo, setRejectMotivo] = useState("");
  const [notaTexto, setNotaTexto] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState("");

  const cId = candidato?.id ?? "";

  // Queries
  const { data: avaliacoes = [] } = useQuery({
    queryKey: ["candidato-avaliacoes", cId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidato_avaliacoes")
        .select("*")
        .eq("candidato_id", cId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open && !!cId,
  });

  const { data: historico = [] } = useQuery({
    queryKey: ["candidato-historico", cId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidato_historico")
        .select("*")
        .eq("candidato_id", cId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open && !!cId,
  });

  const { data: notas = [] } = useQuery({
    queryKey: ["candidato-notas", cId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidato_notas")
        .select("*")
        .eq("candidato_id", cId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open && !!cId,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-lookup"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data || [];
    },
  });

  const getProfileName = (userId: string | null) => {
    if (!userId) return "Sistema";
    return profiles.find((p) => p.user_id === userId)?.full_name || "Usuário";
  };

  // Mutations
  const moveMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      // Update candidato
      const { error } = await supabase
        .from("candidatos")
        .update({ status: newStatus } as any)
        .eq("id", cId);
      if (error) throw error;
      // Log history
      await supabase.from("candidato_historico").insert({
        candidato_id: cId,
        status_anterior: candidato.status,
        status_novo: newStatus,
        responsavel_id: user?.id || null,
      } as any);
    },
    onSuccess: (_, newStatus) => {
      const label = KANBAN_STAGES.find((s) => s.key === newStatus)?.label || newStatus;
      toast.success(`${candidato.nome} movido para ${label}`);
      queryClient.invalidateQueries({ queryKey: ["candidatos", vagaId] });
      queryClient.invalidateQueries({ queryKey: ["candidato-historico", cId] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("candidatos")
        .update({ status: "recusado" } as any)
        .eq("id", cId);
      if (error) throw error;
      await supabase.from("candidato_historico").insert({
        candidato_id: cId,
        status_anterior: candidato.status,
        status_novo: "recusado",
        responsavel_id: user?.id || null,
      } as any);
      if (rejectMotivo.trim()) {
        await supabase.from("candidato_notas").insert({
          candidato_id: cId,
          autor_id: user?.id,
          conteudo: `[Recusa] ${rejectMotivo}`,
        } as any);
      }
    },
    onSuccess: () => {
      toast.success(`${candidato.nome} recusado`);
      setRejectOpen(false);
      setRejectMotivo("");
      queryClient.invalidateQueries({ queryKey: ["candidatos", vagaId] });
      queryClient.invalidateQueries({ queryKey: ["candidato-historico", cId] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const saveAvaliacaoMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(scores).filter(([, v]) => v > 0);
      if (entries.length === 0) throw new Error("Selecione ao menos uma skill");
      const rows = entries.map(([skill, score]) => ({
        candidato_id: cId,
        avaliador_id: user?.id,
        skill,
        score,
        comentario: comentario || null,
      }));
      const { error } = await supabase.from("candidato_avaliacoes").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Avaliação salva!");
      setScores({});
      setComentario("");
      queryClient.invalidateQueries({ queryKey: ["candidato-avaliacoes", cId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addNotaMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("candidato_notas").insert({
        candidato_id: cId,
        autor_id: user?.id,
        conteudo: notaTexto,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nota adicionada!");
      setNotaTexto("");
      queryClient.invalidateQueries({ queryKey: ["candidato-notas", cId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Score calc
  const scoreMedia = avaliacoes.length > 0
    ? (avaliacoes.reduce((sum, a) => sum + (a.score ?? 0), 0) / avaliacoes.length).toFixed(1)
    : null;

  // LGPD
  const lgpdDate = candidato?.consentimento_lgpd_at ? new Date(candidato.consentimento_lgpd_at) : null;
  const retentionDate = lgpdDate ? addDays(lgpdDate, 180) : null;
  const daysToRetention = retentionDate ? differenceInDays(retentionDate, new Date()) : null;

  // Advance
  const currentIdx = KANBAN_STAGES.findIndex((s) => s.key === candidato?.status);
  const canAdvance = currentIdx >= 0 && currentIdx < KANBAN_STAGES.length - 2;
  const nextStage = canAdvance ? KANBAN_STAGES[currentIdx + 1] : null;

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const stageLabel = KANBAN_STAGES.find((s) => s.key === candidato?.status)?.label || candidato?.status || "";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {!candidato ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">Carregando...</div>
          ) : (
          <>
          <SheetHeader className="pb-4">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-medium shrink-0">
                {getInitials(candidato.nome)}
              </div>
              <div className="min-w-0 space-y-1">
                <SheetTitle className="text-lg leading-tight">{candidato.nome}</SheetTitle>
                <p className="text-sm text-muted-foreground">{candidato.email}</p>
                {candidato.telefone && (
                  <p className="text-sm text-muted-foreground">{candidato.telefone}</p>
                )}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge className={statusBadge[candidato.status] || "bg-muted text-muted-foreground"}>
                    {stageLabel}
                  </Badge>
                  {candidato.origem && (
                    <Badge variant="outline" className="text-xs capitalize">{candidato.origem}</Badge>
                  )}
                </div>
                {candidato.created_at && (
                  <p className="text-xs text-muted-foreground">
                    Candidatura em {format(new Date(candidato.created_at), "dd/MM/yyyy 'às' HH:mm")}
                  </p>
                )}
              </div>
            </div>
          </SheetHeader>

          <Tabs defaultValue="perfil" className="mt-2">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="perfil" className="text-xs">Perfil</TabsTrigger>
              <TabsTrigger value="avaliacao" className="text-xs">Avaliação</TabsTrigger>
              <TabsTrigger value="historico" className="text-xs">Histórico</TabsTrigger>
              <TabsTrigger value="notas" className="text-xs">Notas</TabsTrigger>
            </TabsList>

            {/* PERFIL */}
            <TabsContent value="perfil" className="space-y-4 mt-4">
              {candidato.linkedin_url && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">LinkedIn</Label>
                  <a href={candidato.linkedin_url.startsWith("http") ? candidato.linkedin_url : `https://${candidato.linkedin_url}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-sm text-primary flex items-center gap-1 hover:underline">
                    {candidato.linkedin_url} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {candidato.portfolio_url && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Portfólio / GitHub</Label>
                  <a href={candidato.portfolio_url.startsWith("http") ? candidato.portfolio_url : `https://${candidato.portfolio_url}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-sm text-primary flex items-center gap-1 hover:underline">
                    {candidato.portfolio_url} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {!candidato.linkedin_url && !candidato.portfolio_url && (
                <p className="text-sm text-muted-foreground italic">Nenhum link informado pelo candidato.</p>
              )}

              {/* Score de aderência */}
              {candidato.score_detalhado?.total && candidato.score_detalhado.total > 0 && (
                <div className="pt-4 border-t space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Score de aderência</p>
                  <div className="flex items-center gap-3">
                    <div className={`text-3xl font-medium ${
                      (candidato.score_total ?? 0) >= 80 ? "text-success"
                        : (candidato.score_total ?? 0) >= 50 ? "text-warning"
                        : "text-destructive"
                    }`}>
                      {candidato.score_total}%
                    </div>
                    {candidato.score_detalhado.resumo && (
                      <p className="text-xs text-muted-foreground flex-1">
                        {candidato.score_detalhado.resumo}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { label: "Skills match", valor: candidato.score_detalhado.skills_match ?? 0, max: 40 },
                      { label: "Nível skills", valor: candidato.score_detalhado.nivel_skills ?? 0, max: 20 },
                      { label: "Sistemas", valor: candidato.score_detalhado.sistemas_match ?? 0, max: 15 },
                      { label: "Experiência", valor: candidato.score_detalhado.experiencia ?? 0, max: 15 },
                      { label: "Motivação", valor: candidato.score_detalhado.motivacao ?? 0, max: 10 },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-24">{item.label}</span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${(item.valor / item.max) * 100}%`, backgroundColor: "#1A4A3A" }}
                          />
                        </div>
                        <span className="text-xs font-medium w-12 text-right">
                          {item.valor}/{item.max}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* AVALIAÇÃO */}
            <TabsContent value="avaliacao" className="space-y-4 mt-4">
              {scoreMedia && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10">
                  <Star className="h-5 w-5 text-primary fill-primary" />
                  <span className="text-lg font-medium text-primary">{scoreMedia}</span>
                  <span className="text-sm text-muted-foreground">/ 5.0 (média de {avaliacoes.length} avaliações)</span>
                </div>
              )}

              <div className="space-y-3">
                <p className="text-sm font-medium">Nova avaliação</p>
                {vagaSkills.length > 0 ? vagaSkills.map((skill) => (
                  <div key={skill} className="flex items-center justify-between">
                    <span className="text-sm">{skill}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setScores({ ...scores, [skill]: n })}
                          className={`h-7 w-7 rounded text-xs font-medium transition-colors ${
                            (scores[skill] || 0) >= n
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground italic">
                    Nenhuma skill obrigatória definida na vaga.
                  </p>
                )}
                <Textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Comentário geral (opcional)"
                  rows={2}
                />
                <Button size="sm" onClick={() => saveAvaliacaoMutation.mutate()}
                  disabled={Object.values(scores).filter((v) => v > 0).length === 0 || saveAvaliacaoMutation.isPending}>
                  {saveAvaliacaoMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  Salvar avaliação
                </Button>
              </div>

              {avaliacoes.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Avaliações anteriores</p>
                    {avaliacoes.map((a) => (
                      <div key={a.id} className="text-xs border rounded-md p-2 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{a.skill}</span>
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 text-primary fill-primary" />
                            <span>{a.score}</span>
                          </div>
                        </div>
                        {a.comentario && <p className="text-muted-foreground">{a.comentario}</p>}
                        <p className="text-muted-foreground">
                          {getProfileName(a.avaliador_id)} · {format(new Date(a.created_at), "dd/MM/yyyy")}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>

            {/* HISTÓRICO */}
            <TabsContent value="historico" className="space-y-3 mt-4">
              {historico.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Nenhuma movimentação registrada.</p>
              ) : (
                <div className="space-y-2">
                  {historico.map((h) => {
                    const fromLabel = KANBAN_STAGES.find((s) => s.key === h.status_anterior)?.label || h.status_anterior || "—";
                    const toLabel = KANBAN_STAGES.find((s) => s.key === h.status_novo)?.label || h.status_novo;
                    return (
                      <div key={h.id} className="flex items-start gap-2 text-sm border-l-2 border-primary/30 pl-3 py-1">
                        <Clock className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                        <div>
                          <p>
                            <span className="text-muted-foreground">{fromLabel}</span>
                            {" → "}
                            <span className="font-medium">{toLabel}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {getProfileName(h.responsavel_id)} · {format(new Date(h.created_at), "dd/MM/yyyy HH:mm")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* NOTAS */}
            <TabsContent value="notas" className="space-y-3 mt-4">
              <div className="flex gap-2">
                <Textarea
                  value={notaTexto}
                  onChange={(e) => setNotaTexto(e.target.value)}
                  placeholder="Anotação interna..."
                  rows={2}
                  className="flex-1"
                />
                <Button size="icon" className="shrink-0 self-end"
                  disabled={!notaTexto.trim() || addNotaMutation.isPending}
                  onClick={() => addNotaMutation.mutate()}>
                  {addNotaMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              {notas.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Nenhuma nota ainda.</p>
              ) : (
                <div className="space-y-2">
                  {notas.map((n) => (
                    <div key={n.id} className="border rounded-md p-3 text-sm space-y-1">
                      <p className="whitespace-pre-wrap">{n.conteudo}</p>
                      <p className="text-xs text-muted-foreground">
                        {getProfileName(n.autor_id)} · {format(new Date(n.created_at), "dd/MM/yyyy HH:mm")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* LGPD Footer */}
          <Separator className="my-4" />
          <div className="space-y-1 pb-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span className="font-medium">LGPD</span>
            </div>
            {lgpdDate && (
              <p className="text-xs text-muted-foreground">
                Consentimento em {format(lgpdDate, "dd/MM/yyyy")}
              </p>
            )}
            {retentionDate && (
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-muted-foreground">
                  Retenção até {format(retentionDate, "dd/MM/yyyy")}
                </p>
                {daysToRetention !== null && daysToRetention <= 30 && daysToRetention > 0 && (
                  <Badge className="bg-warning/15 text-warning border-warning/30 text-[10px] h-4">
                    {daysToRetention}d restantes
                  </Badge>
                )}
                {daysToRetention !== null && daysToRetention <= 0 && (
                  <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px] h-4">
                    Expirado
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <Separator className="mb-4" />
          <div className="flex gap-2 pb-4">
            {canAdvance && nextStage && (
              <Button className="flex-1" onClick={() => moveMutation.mutate(nextStage.key)}
                disabled={moveMutation.isPending}>
                {moveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                <ArrowRight className="h-4 w-4 mr-1" /> Avançar para {nextStage.label}
              </Button>
            )}
            {candidato.status !== "recusado" && candidato.status !== "contratado" && (
              <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setRejectOpen(true)}>
                <XCircle className="h-4 w-4 mr-1" /> Recusar
              </Button>
            )}
          </div>
          </>
          )}
        </SheetContent>
      </Sheet>

      {/* Reject dialog */}
      {candidato && (
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recusar candidato</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja recusar {candidato.nome}? Essa ação moverá o candidato para a coluna "Recusado".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Textarea
              value={rejectMotivo}
              onChange={(e) => setRejectMotivo(e.target.value)}
              placeholder="Informe o motivo da recusa..."
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rejectMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirmar recusa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}
    </>
  );
}
