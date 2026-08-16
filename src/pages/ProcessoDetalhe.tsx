import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Edit, FileText, Users, Building2, MapPin, Briefcase,
  Monitor, Shield, Clock, History, AlertCircle, Loader2, Lock,
  Workflow, GitBranch, Sparkles, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartBackButton } from "@/components/SmartBackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useProcessoDetalhe } from "@/hooks/useProcessos";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errorMessages";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidRenderer } from "@/components/processos/MermaidRenderer";

const STATUS_COR: Record<string, string> = {
  vigente: "bg-success text-success border-success/40",
  em_revisao: "bg-warning text-warning border-warning/40",
  rascunho: "bg-muted text-muted-foreground",
  arquivado: "bg-muted/50 text-muted-foreground",
};

const NATUREZA_LABEL: Record<string, string> = {
  lista_tarefas: "Lista de tarefas",
  workflow: "Workflow",
  guia: "Guia/Norma",
  misto: "Misto",
};

export default function ProcessoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const { roles: authRoles } = useAuth();
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: processo, isLoading } = useProcessoDetalhe(id || null);

  const podeEditar =
    roles?.includes("super_admin") ||
    roles?.includes("admin_rh") ||
    (processo?.owner_user_id && processo.owner_user_id === user?.id);

  const handleDeleteProcesso = async () => {
    if (!id) return;
    await supabase.from("processos_versoes").delete().eq("processo_id", id);
    await supabase.from("processos_tags_tipos_colaborador").delete().eq("processo_id", id);
    await supabase.from("processos_tags_areas").delete().eq("processo_id", id);
    await supabase.from("processos_tags_departamentos").delete().eq("processo_id", id);
    await supabase.from("processos_ligacoes").delete().or(`origem_id.eq.${id},destino_id.eq.${id}`);
    await supabase.from("processos_sugestoes").delete().eq("processo_id", id);
    await supabase.from("processos_log_consultas").delete().eq("processo_id", id);
    const { error } = await supabase.from("processos").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir: " + humanizeError(error.message));
      return;
    }
    toast.success("Processo excluído");
    navigate("/processos");
  };

  const { data: versoes } = useQuery({
    queryKey: ["processo-versoes", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("processos_versoes")
        .select("id, numero, publicado_em, motivo_alteracao, publicado_por")
        .eq("processo_id", id!)
        .order("numero", { ascending: false });
      return (data as any[]) || [];
    },
  });

  const { data: tarefasLegado } = useQuery({
    queryKey: ["processo-tarefas-legado", processo?.template_sncf_id],
    enabled: !!processo?.template_sncf_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("sncf_templates_tarefas")
        .select(
          "id, ordem, titulo, descricao, responsavel_role, accountable_role, prazo_dias, prioridade",
        )
        .eq("template_id", processo!.template_sncf_id!)
        .order("ordem");
      return (data as any[]) || [];
    },
  });

  const { data: sugestoes } = useQuery({
    queryKey: ["processo-sugestoes", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("processos_sugestoes")
        .select("id, titulo_sugerido, descricao, status, sugerido_em, origem")
        .eq("processo_id", id!)
        .order("sugerido_em", { ascending: false });
      return (data as any[]) || [];
    },
  });

  const { data: ligacoes } = useQuery({
    queryKey: ["processo-ligacoes", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("processos_ligacoes_expandidas")
        .select("*")
        .or(`processo_origem_id.eq.${id},processo_destino_id.eq.${id}`)
        .order("ordem");
      return (data as any[]) || [];
    },
  });

  // Info de importação PDF (se este processo veio de PDF)
  const { data: importacaoInfo } = useQuery({
    queryKey: ["processo-importacao-pdf", id],
    enabled: !!id,
    queryFn: async () => {
      // Primeiro verifica se o processo tem flag importado_de_pdf
      const { data: proc } = await (supabase as any)
        .from("processos")
        .select("importado_de_pdf, importacao_pdf_id")
        .eq("id", id!)
        .maybeSingle();

      if (!proc?.importado_de_pdf || !proc?.importacao_pdf_id) return null;

      const { data: imp } = await (supabase as any)
        .from("processos_importacoes_pdf")
        .select("arquivo_nome, importado_por_nome, created_at")
        .eq("id", proc.importacao_pdf_id)
        .maybeSingle();

      return imp || null;
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!processo) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-muted-foreground">Processo não encontrado.</p>
        <Button variant="outline" onClick={() => navigate("/processos")} className="mt-4">
          Voltar
        </Button>
      </div>
    );
  }

  const sugestoesPendentes = (sugestoes || []).filter((s: any) => s.status === "pendente");
  const totalLigacoes = (ligacoes || []).length;

  return (
    <div className="container mx-auto py-6 space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <SmartBackButton fallback="/processos" fallbackLabel="Processos" />
        <div className="flex items-center gap-2">
          {processo.sensivel && (
            <Badge variant="outline" className="gap-1 border-warning/40 text-warning">
              <Lock className="h-3 w-3" /> Sensível
            </Badge>
          )}
          {podeEditar && (
            <Button
              onClick={() => navigate(`/processos/${processo.id}/editar`)}
              className="gap-2"
              size="sm"
            >
              <Edit className="h-4 w-4" /> Editar
            </Button>
          )}
          {isSuperAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10 gap-2"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          )}
        </div>
      </div>

      {/* Cabeçalho */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-medium tracking-tight">{processo.nome}</h1>
              {processo.descricao && (
                <p className="text-sm text-muted-foreground mt-1">{processo.descricao}</p>
              )}
              {importacaoInfo && (
                <Badge
                  variant="outline"
                  className="mt-2 gap-1 border-info/40 bg-info text-info"
                >
                  <Sparkles className="h-3 w-3" />
                  Importado de PDF · {importacaoInfo.arquivo_nome}
                  {importacaoInfo.importado_por_nome && <> · por {importacaoInfo.importado_por_nome}</>}
                  <> · em {new Date(importacaoInfo.created_at).toLocaleDateString("pt-BR")}</>
                </Badge>
              )}
            </div>
            <Badge variant="outline" className={STATUS_COR[processo.status_valor] || ""}>
              {processo.status_valor}
            </Badge>
          </div>

          <Separator />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <InfoBloco
              label="Natureza"
              valor={NATUREZA_LABEL[processo.natureza_valor] || processo.natureza_valor}
              icon={<FileText className="h-3.5 w-3.5" />}
            />
            <InfoBloco
              label="Versão atual"
              valor={`v${processo.versao_atual}`}
              icon={<History className="h-3.5 w-3.5" />}
            />
            <InfoBloco
              label="Owner"
              valor={processo.owner_nome || "—"}
              icon={<Shield className="h-3.5 w-3.5" />}
            />
            <InfoBloco
              label="Atualizado"
              valor={formatDistanceToNow(new Date(processo.updated_at), {
                locale: ptBR,
                addSuffix: true,
              })}
              icon={<Clock className="h-3.5 w-3.5" />}
            />
          </div>

          {processo.tags_departamentos.length +
            processo.tags_unidades.length +
            processo.tags_cargos.length +
            processo.tags_sistemas.length +
            processo.tags_tipos_colaborador.length >
            0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {processo.tags_tipos_colaborador.map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px] uppercase">
                  {t}
                </Badge>
              ))}
              {processo.tags_departamentos.map((t) => (
                <Badge key={t.id} variant="outline" className="text-[10px] gap-1">
                  <Users className="h-2.5 w-2.5" /> {t.label}
                </Badge>
              ))}
              {processo.tags_unidades.map((t) => (
                <Badge key={t.id} variant="outline" className="text-[10px] gap-1">
                  <MapPin className="h-2.5 w-2.5" /> {t.label}
                </Badge>
              ))}
              {processo.tags_cargos.map((t) => (
                <Badge key={t.id} variant="outline" className="text-[10px] gap-1">
                  <Briefcase className="h-2.5 w-2.5" /> {t.label}
                </Badge>
              ))}
              {processo.tags_sistemas.map((t) => (
                <Badge key={t.id} variant="outline" className="text-[10px] gap-1">
                  <Monitor className="h-2.5 w-2.5" /> {t.label}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sugestões pendentes */}
      {sugestoesPendentes.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-warning border border-warning/40 rounded-md">
          <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <p className="text-sm text-warning">
            <strong>{sugestoesPendentes.length}</strong> sugestão(ões) aguardando avaliação.
            {podeEditar && " Abra a aba Sugestões para revisar."}
          </p>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="narrativa">
        <TabsList>
          <TabsTrigger value="narrativa">Narrativa</TabsTrigger>
          {tarefasLegado && tarefasLegado.length > 0 && (
            <TabsTrigger value="passos">Passos ({tarefasLegado.length})</TabsTrigger>
          )}
          <TabsTrigger value="diagrama" className="gap-1">
            <Workflow className="h-3.5 w-3.5" /> Diagrama
          </TabsTrigger>
          <TabsTrigger value="conexoes" className="gap-1">
            <GitBranch className="h-3.5 w-3.5" /> Conexões{totalLigacoes > 0 ? ` (${totalLigacoes})` : ""}
          </TabsTrigger>
          <TabsTrigger value="versoes">Versões ({(versoes || []).length})</TabsTrigger>
          <TabsTrigger value="sugestoes">
            Sugestões{sugestoesPendentes.length > 0 ? ` (${sugestoesPendentes.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="narrativa" className="mt-4">
          <Card>
            <CardContent className="p-6">
              {processo.narrativa ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{processo.narrativa}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Este processo ainda não tem narrativa escrita.
                  {podeEditar && " Clique em Editar para adicionar."}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {tarefasLegado && tarefasLegado.length > 0 && (
          <TabsContent value="passos" className="mt-4">
            <Card>
              <CardContent className="p-6 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Estes passos vêm do workflow de tarefas (lista de tarefas automatizada).
                </p>
                {tarefasLegado.map((t: any, i: number) => (
                  <div key={t.id} className="flex gap-3 pb-3 border-b last:border-b-0 last:pb-0">
                    <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 space-y-1">
                      <h4 className="font-medium text-sm">{t.titulo}</h4>
                      {t.descricao && (
                        <p className="text-xs text-muted-foreground">{t.descricao}</p>
                      )}
                      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        {t.responsavel_role && <span>👤 R: {t.responsavel_role}</span>}
                        {t.accountable_role && <span>🅰 A: {t.accountable_role}</span>}
                        {t.prazo_dias > 0 && <span>⏱ {t.prazo_dias}d</span>}
                        {t.prioridade && t.prioridade !== "normal" && (
                          <Badge variant="outline" className="text-[10px]">
                            {t.prioridade}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="diagrama" className="mt-4">
          <Card>
            <CardContent className="p-6">
              {processo.diagrama_mermaid?.trim() ? (
                <MermaidRenderer codigo={processo.diagrama_mermaid} />
              ) : (
                <div className="text-center py-10 space-y-2">
                  <Workflow className="h-8 w-8 text-muted-foreground/50 mx-auto" />
                  <p className="text-sm text-muted-foreground">Este processo não tem diagrama.</p>
                  <p className="text-[11px] text-muted-foreground">
                    {podeEditar
                      ? "Clique em Editar para adicionar um desenho em Mermaid."
                      : "Nem todo processo precisa de um."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conexoes" className="mt-4">
          <Card>
            <CardContent className="p-6">
              {totalLigacoes === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <GitBranch className="h-8 w-8 text-muted-foreground/50 mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Este processo não tem ligações com outros processos.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {podeEditar
                      ? "Clique em Editar → aba Conexões para mapear relações com outros processos."
                      : ""}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(ligacoes || []).map((l: any) => {
                    const euSouOrigem = l.processo_origem_id === id;
                    const outroId = euSouOrigem ? l.processo_destino_id : l.processo_origem_id;
                    const outroNome = euSouOrigem ? l.destino_nome : l.origem_nome;
                    return (
                      <div
                        key={l.id}
                        className="flex items-start gap-3 pb-3 border-b last:border-b-0 last:pb-0"
                      >
                        <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                          {euSouOrigem ? "→ este" : "este →"} {l.tipo_ligacao_label || l.tipo_ligacao}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => navigate(`/processos/${outroId}`)}
                            className="text-sm font-medium hover:text-primary hover:underline truncate text-left"
                          >
                            {outroNome}
                          </button>
                          {l.descricao && (
                            <p className="text-xs text-muted-foreground mt-0.5">{l.descricao}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="versoes" className="mt-4">
          <Card>
            <CardContent className="p-6">
              {!versoes || versoes.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Sem versões publicadas ainda.
                </p>
              ) : (
                <div className="space-y-3">
                  {versoes.map((v: any) => (
                    <div key={v.id} className="flex gap-3 items-start">
                      <Badge variant="outline" className="font-mono">
                        v{v.numero}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        {v.motivo_alteracao ? (
                          <p className="text-sm">{v.motivo_alteracao}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            Sem descrição da mudança
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          {format(new Date(v.publicado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sugestoes" className="mt-4">
          <Card>
            <CardContent className="p-6">
              {!sugestoes || sugestoes.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Nenhuma sugestão ainda.</p>
              ) : (
                <div className="space-y-3">
                  {sugestoes.map((s: any) => (
                    <div key={s.id} className="flex gap-3 items-start pb-3 border-b last:border-b-0 last:pb-0">
                      <Badge
                        variant="outline"
                        className={
                          s.status === "pendente"
                            ? "bg-warning text-warning"
                            : s.status === "aceita" || s.status === "aplicada"
                              ? "bg-success text-success"
                              : "bg-muted text-muted-foreground"
                        }
                      >
                        {s.status}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        {s.titulo_sugerido && (
                          <h4 className="font-medium text-sm">{s.titulo_sugerido}</h4>
                        )}
                        <p className="text-sm text-muted-foreground">{s.descricao}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {s.origem} ·{" "}
                          {format(new Date(s.sugerido_em), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog excluir processo */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir processo permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              O processo "{processo.nome}" será excluído junto com todas as versões, tags, conexões e sugestões. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProcesso}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InfoBloco({
  label,
  valor,
  icon,
}: {
  label: string;
  valor: string;
  icon: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </p>
      <p className="text-sm font-medium mt-0.5 truncate">{valor}</p>
    </div>
  );
}
