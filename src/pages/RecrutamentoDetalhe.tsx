import { useState, useRef, useEffect } from "react";
import { publicUrl, PUBLIC_APP_URL } from "@/lib/urls";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useParametros } from "@/hooks/useParametros";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errorMessages";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { SmartBackButton } from "@/components/SmartBackButton";
import { SalarioMasked } from "@/components/SalarioMasked";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Copy, Globe, MoreHorizontal, Plus, Loader2,
  UserPlus, ArrowRight, XCircle, User, CheckCircle2, ExternalLink, Users, Link, Trash2, Check, Mail, AlertTriangle, Pencil, X, Sparkles, ClipboardList, FileText, Upload, Clock
} from "lucide-react";

const statusConfig: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  aberta: { label: "Aberta", className: "bg-success/15 text-success border-success/30" },
  em_selecao: { label: "Em seleção", className: "bg-info/15 text-info border-info/30" },
  encerrada: { label: "Encerrada", className: "bg-muted text-muted-foreground" },
  cancelada: { label: "Cancelada", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

const KANBAN_STAGES = [
  { key: "recebido",          label: "Recebido",           cor: "#5C9A80", bg: "#F0F7F4" },
  { key: "triagem",           label: "Triagem",            cor: "#4A8A6E", bg: "#E5F0EA" },
  { key: "entrevista_rh",     label: "Entrevista RH",      cor: "#3D7A5F", bg: "#DAE9E0" },
  { key: "entrevista_gestor", label: "Entrevista Gestor",  cor: "#316A50", bg: "#CEE2D5" },
  { key: "teste_tecnico",     label: "Teste Técnico",      cor: "#265A42", bg: "#C2DACB" },
  { key: "oferta",            label: "Proposta",           cor: "#1F5038", bg: "#B5D2C0" },
  { key: "contratado",        label: "Contratado",         cor: "#1A4A3A", bg: "#A8C9B5" },
  { key: "recusado",          label: "Recusado",           cor: "#C73E3A", bg: "#FDF0EF" },
] as const;

export default function RecrutamentoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isSuperAdmin, isAdminRH } = usePermissions();
  const canSeeFaixa = isSuperAdmin || isAdminRH;
  const podeExcluir = isSuperAdmin || isAdminRH;

  const [addCandidatoOpen, setAddCandidatoOpen] = useState(false);
  const [newCandidato, setNewCandidato] = useState({
    nome: "", email: "", telefone: "", origem: "indicacao",
    experiencias: [] as any[], formacoes: [] as any[],
    skills_candidato: [] as any[], sistemas_candidato: [] as any[], mensagem: "",
  });
  const [addCandidatoArrastando, setAddCandidatoArrastando] = useState(false);
  const [addCandidatoImportando, setAddCandidatoImportando] = useState(false);
  const [addCandidatoPdfCarregado, setAddCandidatoPdfCarregado] = useState(false);
  const [addCandidatoNomePDF, setAddCandidatoNomePDF] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedCandidato, setSelectedCandidato] = useState<any | null>(null);
  const [notaTexto, setNotaTexto] = useState("");
  const [vagaPublicada, setVagaPublicada] = useState(false);

  // Contratar flow
  const [encerrarVagaOpen, setEncerrarVagaOpen] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [solicitando, setSolicitando] = useState(false);

  const [gatilhoDialog, setGatilhoDialog] = useState(false);
  const [gatilhoCandidato, setGatilhoCandidato] = useState<any>(null);
  const [gatilhoProximoStatus, setGatilhoProximoStatus] = useState("");
  const [gatilhoJustificativa, setGatilhoJustificativa] = useState("");
  const SCORE_MINIMO_ENTREVISTA = 40;

  const [editarVagaOpen, setEditarVagaOpen] = useState(false);
  const [editarForm, setEditarForm] = useState<any>({});
  const [editandoEmail, setEditandoEmail] = useState(false);
  const [novoEmail, setNovoEmail] = useState("");
  const [salvandoEmail, setSalvandoEmail] = useState(false);

  async function solicitarPerfilCompleto(candidato: any) {
    if (!candidato.email) {
      toast.error("Candidato sem e-mail cadastrado.");
      return;
    }
    setSolicitando(true);
    try {
      const link = publicUrl(`/vagas/${id}`);
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "solicitar-perfil-candidato",
          recipientEmail: candidato.email,
          idempotencyKey: `solicitar-perfil-${candidato.id}-${Date.now()}`,
          templateData: {
            nome: candidato.nome,
            cargo: vaga?.titulo ?? "",
            link_vaga: link,
          },
        },
      });
      if (error) throw error;
      toast.success(`E-mail enviado para ${candidato.email}`);
    } catch (e: any) {
      toast.error("Erro ao enviar e-mail: " + e.message);
    } finally {
      setSolicitando(false);
    }
  }

  async function processarPDFCandidato(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("PDF muito grande. Máximo 5MB.");
      return;
    }
    setAddCandidatoImportando(true);
    setAddCandidatoNomePDF(file.name);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("score-candidato", {
        body: { action: "parse_pdf", pdf_base64: base64 },
      });
      if (error) throw error;

      const perfil = data?.perfil;
      if (perfil) {
        setNewCandidato(prev => ({
          ...prev,
          nome: perfil.nome || prev.nome,
          email: perfil.email || prev.email,
          telefone: perfil.telefone || prev.telefone,
          experiencias: perfil.experiencias ?? [],
          formacoes: perfil.formacoes ?? [],
          skills_candidato: (perfil.skills_identificadas ?? []).map((s: string) => ({ skill: s, nivel: "nao_informado" })),
        }));
        setAddCandidatoPdfCarregado(true);
        toast.success("CV lido! Revise os dados antes de salvar.");
      }
    } catch (e: any) {
      toast.error("Erro ao ler o CV: " + e.message);
    } finally {
      setAddCandidatoImportando(false);
    }
  }

  async function calcularScoreCandidato(candidatoId: string, candidatoData: typeof newCandidato) {
    if (!vaga) return;
    try {
      await supabase.functions.invoke("score-candidato", {
        body: {
          action: "calcular_score",
          candidato_id: candidatoId,
          vaga: {
            titulo: vaga.titulo,
            nivel: (vaga as any).nivel,
            skills_obrigatorias: (vaga as any).skills_obrigatorias ?? [],
            skills_desejadas: (vaga as any).skills_desejadas ?? [],
            ferramentas: (vaga as any).ferramentas ?? [],
            faixa_min: (vaga as any).faixa_min ?? null,
            faixa_max: (vaga as any).faixa_max ?? null,
          },
          candidato: {
            skills_candidato: candidatoData.skills_candidato,
            sistemas_candidato: candidatoData.sistemas_candidato,
            experiencias: candidatoData.experiencias,
            formacoes: candidatoData.formacoes,
            mensagem: candidatoData.mensagem,
            pretensao_salarial: (candidatoData as any).pretensao_salarial ?? null,
          },
        },
      });
      queryClient.invalidateQueries({ queryKey: ["candidatos", id] });
    } catch (e) {
      console.error("Erro ao calcular score:", e);
    }
  }

  async function recalcularTodosScores() {
    if (!vaga || !candidatos?.length) return;
    const candidatosComPerfil = candidatos.filter((c: any) =>
      c.skills_candidato?.length > 0 || c.experiencias?.length > 0
    );
    if (candidatosComPerfil.length === 0) {
      toast.info("Nenhum candidato com perfil para recalcular.");
      return;
    }
    toast.info(`Recalculando ${candidatosComPerfil.length} candidato(s)...`);
    let ok = 0;
    let erro = 0;
    for (const c of candidatosComPerfil) {
      try {
        await supabase.functions.invoke("score-candidato", {
          body: {
            action: "calcular_score",
            candidato_id: c.id,
            vaga: {
              titulo: vaga.titulo,
              nivel: (vaga as any).nivel,
              skills_obrigatorias: (vaga as any).skills_obrigatorias ?? [],
              skills_desejadas: (vaga as any).skills_desejadas ?? [],
              ferramentas: (vaga as any).ferramentas ?? [],
              faixa_min: (vaga as any).faixa_min ?? null,
              faixa_max: (vaga as any).faixa_max ?? null,
            },
            candidato: {
              skills_candidato: (c as any).skills_candidato ?? [],
              sistemas_candidato: (c as any).sistemas_candidato ?? [],
              experiencias: (c as any).experiencias ?? [],
              formacoes: (c as any).formacoes ?? [],
              mensagem: (c as any).mensagem ?? "",
              pretensao_salarial: (c as any).pretensao_salarial ?? null,
            },
          },
        });
        ok++;
      } catch {
        erro++;
      }
    }
    queryClient.invalidateQueries({ queryKey: ["candidatos", id] });
    toast.success(`Scores recalculados: ${ok} ok${erro > 0 ? `, ${erro} com erro` : ""}`);
  }


  async function salvarEmailCandidato(candidatoId: string, email: string) {
    if (!email || !email.includes("@")) {
      toast.error("E-mail inválido.");
      return;
    }
    setSalvandoEmail(true);
    try {
      const { error } = await supabase
        .from("candidatos")
        .update({ email } as any)
        .eq("id", candidatoId);
      if (error) throw error;
      setSelectedCandidato((c: any) => ({ ...c, email }));
      queryClient.invalidateQueries({ queryKey: ["candidatos", id] });
      setEditandoEmail(false);
      toast.success("E-mail atualizado!");
    } catch (e: any) {
      toast.error("Erro ao atualizar e-mail: " + e.message);
    } finally {
      setSalvandoEmail(false);
    }
  }

  const { data: beneficiosParam = [] } = useParametros("beneficio");

  const { data: entrevistasRH = [] } = useQuery({
    queryKey: ["entrevista-rh", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("entrevistas_candidato")
        .select("candidato_id, recomendacao")
        .eq("vaga_id", id!)
        .eq("tipo", "rh");
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  // Buscar entrevistas do gestor em lote
  const { data: entrevistasGestor = [] } = useQuery({
    queryKey: ["entrevista-gestor", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("entrevistas_candidato")
        .select("candidato_id, recomendacao")
        .eq("vaga_id", id!)
        .eq("tipo", "gestor");
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  // Buscar testes técnicos em lote
  const { data: testesTecnicos = [] } = useQuery({
    queryKey: ["testes-tecnicos-vaga", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("testes_tecnicos" as any)
        .select("candidato_id, enviado_em, entregue_em, resultado, prazo_entrega, skills_validadas")
        .eq("vaga_id", id!);
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  // Buscar ofertas em lote
  const { data: ofertasCandidatos = [] } = useQuery({
    queryKey: ["ofertas-vaga", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ofertas_candidato" as any)
        .select("candidato_id, status, enviado_em, salario_proposto")
        .eq("vaga_id", id!);
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  const { data: vaga, isLoading: vagaLoading } = useQuery({
    queryKey: ["vaga", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vagas")
        .select("*, cargos(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: gestorNome } = useQuery({
    queryKey: ["gestor-nome", (vaga as any)?.gestor_id],
    queryFn: async () => {
      const gestorId = (vaga as any)?.gestor_id;
      if (!gestorId) return null;
      const { data: clt } = await supabase
        .from("colaboradores_clt")
        .select("nome_completo")
        .eq("id", gestorId)
        .maybeSingle();
      if (clt?.nome_completo) return clt.nome_completo;
      const { data: pj } = await supabase
        .from("contratos_pj")
        .select("contato_nome")
        .eq("id", gestorId)
        .maybeSingle();
      if (pj?.contato_nome) return pj.contato_nome;
      return null;
    },
    enabled: !!(vaga as any)?.gestor_id,
  });

  const { data: candidatos = [], isLoading: candidatosLoading } = useQuery({
    queryKey: ["candidatos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidatos")
        .select("*")
        .eq("vaga_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch potential leaders from active colaboradores CLT + PJ
  const { data: lideres = [] } = useQuery({
    queryKey: ["gestores-para-vaga"],
    queryFn: async () => {
      const { data: clt } = await supabase
        .from("colaboradores_clt")
        .select("id, nome_completo, cargo, departamento")
        .eq("status", "ativo")
        .order("nome_completo");
      const { data: pj } = await supabase
        .from("contratos_pj")
        .select("id, contato_nome, tipo_servico, departamento")
        .eq("status", "ativo")
        .order("contato_nome");
      const todos = [
        ...(clt ?? []).map(c => ({ id: c.id, nome: c.nome_completo, cargo: c.cargo, tipo: "CLT" })),
        ...(pj ?? []).map(c => ({ id: c.id, nome: c.contato_nome, cargo: c.tipo_servico, tipo: "PJ" })),
      ];
      return todos.sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from("vagas")
        .update({ status: newStatus } as any)
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: (_, newStatus) => {
      const label = statusConfig[newStatus]?.label || newStatus;
      toast.success(`Vaga atualizada para "${label}"`);
      queryClient.invalidateQueries({ queryKey: ["vaga", id] });
      queryClient.invalidateQueries({ queryKey: ["vagas"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const editarVagaMutation = useMutation({
    mutationFn: async (dados: any) => {
      const { data: vagaAtual, error: checkError } = await supabase
        .from("vagas")
        .select("id")
        .eq("id", id!)
        .single();

      if (checkError || !vagaAtual) {
        throw new Error("Vaga não encontrada. Atualize a página.");
      }

      const updateData: any = {};
      if (dados.titulo) updateData.titulo = dados.titulo;
      if (dados.area !== undefined) updateData.area = dados.area;
      if (dados.nivel !== undefined) updateData.nivel = dados.nivel;
      if (dados.local_trabalho !== undefined) updateData.local_trabalho = dados.local_trabalho;
      if (dados.jornada !== undefined) updateData.jornada = dados.jornada;
      if (dados.salario_min !== undefined) updateData.faixa_min = dados.salario_min ? Number(dados.salario_min) : null;
      if (dados.salario_max !== undefined) updateData.faixa_max = dados.salario_max ? Number(dados.salario_max) : null;
      if (dados.skills_obrigatorias !== undefined) updateData.skills_obrigatorias = dados.skills_obrigatorias;
      if (dados.skills_desejadas !== undefined) updateData.skills_desejadas = dados.skills_desejadas;
      if (dados.ferramentas !== undefined) updateData.ferramentas = dados.ferramentas;
      if (dados.descricao !== undefined) updateData.missao = dados.descricao;
      if (dados.gestor_id !== undefined) updateData.gestor_id = dados.gestor_id || null;
      if (dados.num_vagas !== undefined) updateData.num_vagas = dados.num_vagas;

      const { error } = await supabase
        .from("vagas")
        .update(updateData)
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vaga atualizada!");
      queryClient.invalidateQueries({ queryKey: ["vaga", id] });
      queryClient.invalidateQueries({ queryKey: ["vagas"] });
      setEditarVagaOpen(false);
    },
    onError: (err: any) => {
      toast.error("Erro ao salvar: " + err.message);
      console.error("Erro editarVaga:", err);
    },
  });

  const moveCandidatoMutation = useMutation({
    mutationFn: async ({ candidatoId, newStatus }: { candidatoId: string; newStatus: string }) => {
      const { error } = await supabase
        .from("candidatos")
        .update({ status: newStatus } as any)
        .eq("id", candidatoId);
      if (error) throw error;
    },
    onSuccess: (_, { candidatoId, newStatus }) => {
      const c = candidatos.find((x) => x.id === candidatoId);
      const stageLabel = KANBAN_STAGES.find((s) => s.key === newStatus)?.label || newStatus;
      toast.success(`${c?.nome || "Candidato"} movido para ${stageLabel}`);
      queryClient.invalidateQueries({ queryKey: ["candidatos", id] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addCandidatoMutation = useMutation({
    mutationFn: async () => {
      const { data: inserted, error } = await supabase.from("candidatos").insert({
        vaga_id: id!,
        nome: newCandidato.nome,
        email: newCandidato.email,
        telefone: newCandidato.telefone || null,
        origem: newCandidato.origem || "indicacao",
        status: "recebido",
        consentimento_lgpd: true,
        consentimento_lgpd_at: new Date().toISOString(),
        experiencias: newCandidato.experiencias.length > 0 ? newCandidato.experiencias : null,
        formacoes: newCandidato.formacoes.length > 0 ? newCandidato.formacoes : null,
        skills_candidato: newCandidato.skills_candidato.length > 0 ? newCandidato.skills_candidato : null,
        sistemas_candidato: newCandidato.sistemas_candidato.length > 0 ? newCandidato.sistemas_candidato : null,
        mensagem: newCandidato.mensagem || null,
      } as any).select().single();
      if (error) throw error;
      return inserted;
    },
    onSuccess: (inserted) => {
      toast.success("Candidato adicionado!");
      setAddCandidatoOpen(false);
      const resetState = { nome: "", email: "", telefone: "", origem: "indicacao", experiencias: [] as any[], formacoes: [] as any[], skills_candidato: [] as any[], sistemas_candidato: [] as any[], mensagem: "" };
      setNewCandidato(resetState);
      setAddCandidatoPdfCarregado(false);
      setAddCandidatoNomePDF("");
      queryClient.invalidateQueries({ queryKey: ["candidatos", id] });
      // Calculate score if profile data exists
      if (inserted && (newCandidato.experiencias.length > 0 || newCandidato.skills_candidato.length > 0)) {
        calcularScoreCandidato(inserted.id, newCandidato);
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openContratarDialog = async (candidato: any) => {
    if (!vaga) return;

    // Buscar proposta aceita do candidato
    const { data: ofertaAceita } = await supabase
      .from("ofertas_candidato" as any)
      .select("*")
      .eq("candidato_id", candidato.id)
      .eq("vaga_id", id!)
      .eq("status", "aceita")
      .maybeSingle();

    // Navegar para Convites de Cadastro com dados pré-preenchidos
    navigate("/convites-cadastro", {
      state: {
        prefill: {
          nome: candidato.nome,
          email: candidato.email,
          tipo: (ofertaAceita as any)?.tipo_contrato || (vaga.tipo_contrato === "ambos" ? "clt" : vaga.tipo_contrato) || "clt",
          cargo: vaga.titulo || "",
          departamento: vaga.area || "",
          lider_direto_id: vaga.gestor_id || "",
          salario_previsto: (ofertaAceita as any)?.salario_proposto?.toString() || "",
          data_inicio_prevista: (ofertaAceita as any)?.data_inicio || "",
          jornada: vaga.jornada || "",
          beneficios_ids: (vaga.beneficios_ids as string[] | null) || [],
          origem: "recrutamento",
          candidato_id: candidato.id,
          vaga_id: id,
        }
      }
    });
  };

  const copyLink = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = publicUrl(`/vagas/${id}`);
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Link copiado!");
    }).catch(() => {
      toast.error("Não foi possível copiar o link");
    });
  };

  async function publicarVaga() {
    setPublicando(true);
    try {
      const { error } = await supabase
        .from("vagas")
        .update({ status: "aberta", publicado_em: new Date().toISOString() } as any)
        .eq("id", id!);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["vaga", id] });
      queryClient.invalidateQueries({ queryKey: ["vagas"] });
      setVagaPublicada(true);
    } catch (e: any) {
      toast.error("Erro ao publicar vaga: " + e.message);
    } finally {
      setPublicando(false);
    }
  }

  function getStatusCard(c: any) {
    switch (c.status) {
      case "recebido": {
        const temPerfil = (c as any).experiencias?.length > 0 || (c as any).skills_candidato?.length > 0;
        if (!temPerfil) return { label: "Perfil incompleto", cor: "#D97706" };
        return null;
      }
      case "triagem": {
        const score = (c as any).score_total ?? 0;
        const alerta = (c as any).score_detalhado?.alerta;
        if (alerta?.startsWith("overqualified")) return { label: "Overqualified", cor: "#D97706" };
        if (alerta === "underqualified") return { label: "Underqualified", cor: "#DC2626" };
        if (score === 0) return { label: "Sem score", cor: "#6B7280" };
        if (score >= 80) return { label: "Recomendado", cor: "#1A4A3A" };
        if (score >= 50) return { label: "Avaliar", cor: "#D97706" };
        return { label: "Abaixo do mínimo", cor: "#DC2626" };
      }
      case "entrevista_rh": {
        const temEntrevistaRH = entrevistasRH.some((e: any) => e.candidato_id === c.id);
        if (!temEntrevistaRH) return { label: "Preencher formulário", cor: "#DC2626" };
        const recRH = entrevistasRH.find((e: any) => e.candidato_id === c.id)?.recomendacao;
        if (recRH === "nao_avançar") return { label: "Não avançar", cor: "#DC2626" };
        if (recRH === "aguardar") return { label: "Aguardar", cor: "#D97706" };
        return { label: "Formulário ok", cor: "#1A4A3A" };
      }
      case "entrevista_gestor": {
        const temEntrevistaG = entrevistasGestor.some((e: any) => e.candidato_id === c.id);
        if (!temEntrevistaG) return { label: "Preencher formulário", cor: "#DC2626" };
        const recG = entrevistasGestor.find((e: any) => e.candidato_id === c.id)?.recomendacao;
        if (recG === "nao_avançar") return { label: "Não avançar", cor: "#DC2626" };
        if (recG === "aguardar") return { label: "Aguardar", cor: "#D97706" };
        return { label: "Formulário ok", cor: "#1A4A3A" };
      }
      case "teste_tecnico": {
        const testeCand = testesTecnicos.find((t: any) => t.candidato_id === c.id);
        if (!testeCand?.enviado_em) return { label: "Enviar teste", cor: "#DC2626" };
        const prazoVencidoCard = testeCand.prazo_entrega &&
          new Date(testeCand.prazo_entrega + "T23:59:59") < new Date();
        if (!testeCand.entregue_em) {
          if (prazoVencidoCard) return { label: "Prazo vencido", cor: "#DC2626" };
          return { label: "Aguardando entrega", cor: "#D97706" };
        }
        if (testeCand.entregue_em && (!testeCand.resultado || testeCand.resultado === "pendente"))
          return { label: "Avaliar entrega", cor: "#2563EB" };
        if (testeCand.resultado === "reprovado") return { label: "Reprovado", cor: "#DC2626" };
        return { label: "Aprovado", cor: "#1A4A3A" };
      }
      case "oferta": {
        const ofertaCand = ofertasCandidatos.find((o: any) => o.candidato_id === c.id);
        if (!ofertaCand?.enviado_em) return { label: "Registrar proposta", cor: "#DC2626" };
        if (ofertaCand.status === "aceita") return { label: "Proposta aceita", cor: "#1A4A3A" };
        if (ofertaCand.status === "recusada") return { label: "Proposta recusada", cor: "#DC2626" };
        return { label: "Em negociação", cor: "#D97706" };
      }
      default:
        return null;
    }
  }

  async function excluirVaga() {
    setExcluindo(true);
    try {
      await supabase.from("candidatos").delete().eq("vaga_id", id!);
      const { error } = await supabase.from("vagas").delete().eq("id", id!);
      if (error) throw error;
      toast.success("Vaga excluída com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["vagas"] });
      navigate("/recrutamento");
    } catch (e: any) {
      toast.error("Erro ao excluir vaga: " + e.message);
    } finally {
      setExcluindo(false);
      setConfirmarExclusao(false);
    }
  }

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const handleDragStart = (candidatoId: string) => setDraggingId(candidatoId);
  const handleDragEnd = () => setDraggingId(null);
  const handleDrop = (stageKey: string) => {
    if (draggingId) {
      const c = candidatos.find((x) => x.id === draggingId);
      if (c && c.status !== stageKey) {
        if (stageKey === "contratado") {
          openContratarDialog(c);
        } else {
          // Verificar bloqueios de entrevista no drag
          if (c.status === "entrevista_rh" && stageKey === "entrevista_gestor") {
            const temEntrevista = entrevistasRH.some((e: any) => e.candidato_id === c.id);
            if (!temEntrevista) {
              toast.error("Preencha o formulário de Entrevista RH antes de avançar.");
              setDraggingId(null);
              return;
            }
          }
          moverCandidatoComHistorico(draggingId, c.status, stageKey, null, (c as any).score_total);
        }
      }
      setDraggingId(null);
    }
  };

  const moverCandidatoComHistorico = async (
    candidatoId: string,
    deStatus: string,
    paraStatus: string,
    justificativa: string | null,
    score: number | null
  ) => {
    moveCandidatoMutation.mutate({ candidatoId, newStatus: paraStatus });
    try {
      await supabase.from("candidato_historico").insert({
        candidato_id: candidatoId,
        status_anterior: deStatus,
        status_novo: paraStatus,
        responsavel_id: user?.id || null,
        justificativa: justificativa || null,
        score_no_momento: score || null,
        vaga_id: id || null,
      } as any);
    } catch (e) {
      console.error("Erro ao registrar histórico:", e);
    }
  };

  const advanceCandidato = async (candidatoId: string) => {
    const c = candidatos.find((x) => x.id === candidatoId);
    if (!c) return;
    const idx = KANBAN_STAGES.findIndex((s) => s.key === c.status);
    if (idx < 0 || idx >= KANBAN_STAGES.length - 2) return;
    const nextStatus = KANBAN_STAGES[idx + 1].key;

    // Bloqueio suave: Triagem → Entrevista RH com score < 40%
    if (c.status === "triagem" && nextStatus === "entrevista_rh") {
      const score = (c as any).score_total ?? 0;
      if (score < SCORE_MINIMO_ENTREVISTA) {
        setGatilhoCandidato(c);
        setGatilhoProximoStatus(nextStatus);
        setGatilhoJustificativa("");
        setGatilhoDialog(true);
        return;
      }
    }

    // Alerta: perfil incompleto ao sair de Recebido
    if (c.status === "recebido" && nextStatus === "triagem") {
      const temPerfil = (c as any).experiencias?.length > 0 ||
                        (c as any).skills_candidato?.length > 0;
      if (!temPerfil) {
        toast.warning(
          `${c.nome} não tem perfil completo. Considere solicitar o perfil antes de avançar.`,
          { duration: 5000 }
        );
      }
    }

    // Bloqueio: Entrevista RH → Entrevista Gestor sem formulário RH
    if (c.status === "entrevista_rh" && nextStatus === "entrevista_gestor") {
      const { data: entrevistaRH } = await supabase
        .from("entrevistas_candidato")
        .select("id, recomendacao")
        .eq("candidato_id", candidatoId)
        .eq("vaga_id", id!)
        .eq("tipo", "rh")
        .maybeSingle();
      if (!entrevistaRH) {
        toast.error("Preencha o formulário de Entrevista RH antes de avançar.", { duration: 5000 });
        setSelectedCandidato(c);
        return;
      }
      if ((entrevistaRH as any).recomendacao === "nao_avançar") {
        toast.warning("O formulário de RH indica 'Não avançar'. Tem certeza?", { duration: 5000 });
      }
    }

    // Bloqueio: Entrevista Gestor → próxima etapa sem formulário Gestor
    if (c.status === "entrevista_gestor" && ["teste_tecnico", "oferta"].includes(nextStatus)) {
      const { data: entrevistaGestor } = await supabase
        .from("entrevistas_candidato")
        .select("id, recomendacao")
        .eq("candidato_id", candidatoId)
        .eq("vaga_id", id!)
        .eq("tipo", "gestor")
        .maybeSingle();
      if (!entrevistaGestor) {
        toast.error("Preencha o formulário de Entrevista Gestor antes de avançar.", { duration: 5000 });
        setSelectedCandidato(c);
        return;
      }
      if ((entrevistaGestor as any).recomendacao === "nao_avançar") {
        toast.warning("O formulário do Gestor indica 'Não avançar'. Tem certeza?", { duration: 5000 });
      }
    }

    // Bloqueio: Teste Técnico → Oferta sem resultado registrado
    if (c.status === "teste_tecnico" && nextStatus === "oferta") {
      const { data: teste } = await supabase
        .from("testes_tecnicos" as any)
        .select("resultado")
        .eq("candidato_id", candidatoId)
        .eq("vaga_id", id!)
        .maybeSingle();

      if (!teste || !(teste as any).resultado) {
        toast.error(
          "Registre o resultado do Teste Técnico antes de avançar.",
          { duration: 5000 }
        );
        setSelectedCandidato(c);
        return;
      }

      if ((teste as any).resultado === "reprovado") {
        toast.warning(
          "O resultado do Teste Técnico é Reprovado. Tem certeza que quer avançar?",
          { duration: 5000 }
        );
      }
    }

    // Bloqueio: Oferta → qualquer próxima etapa sem proposta enviada
    if (c.status === "oferta" && nextStatus !== "recusado") {
      const { data: ofertaCheck } = await supabase
        .from("ofertas_candidato" as any)
        .select("enviado_em")
        .eq("candidato_id", candidatoId)
        .eq("vaga_id", id!)
        .maybeSingle();
      if (!(ofertaCheck as any)?.enviado_em) {
        toast.error(
          "Envie a proposta ao candidato antes de avançar. Use o botão 'Enviar para...' na aba Proposta.",
          { duration: 5000 }
        );
        setSelectedCandidato(c);
        return;
      }
    }

    // Bloqueio: Oferta → Contratado sem oferta aceita
    if (c.status === "oferta" && nextStatus === "contratado") {
      const { data: oferta } = await supabase
        .from("ofertas_candidato" as any)
        .select("status, enviado_em")
        .eq("candidato_id", candidatoId)
        .eq("vaga_id", id!)
        .maybeSingle();

      if (!(oferta as any)?.enviado_em) {
        toast.error(
          "Registre e envie a proposta antes de contratar.",
          { duration: 5000 }
        );
        setSelectedCandidato(c);
        return;
      }

      if ((oferta as any).status !== "aceita") {
        toast.error(
          "A proposta precisa estar com status 'Aceita' antes de contratar.",
          { duration: 5000 }
        );
        setSelectedCandidato(c);
        return;
      }
    }

    if (nextStatus === "contratado") {
      openContratarDialog(c);
    } else {
      moverCandidatoComHistorico(candidatoId, c.status, nextStatus, null, (c as any).score_total);
    }
  };

  const rejectCandidato = (candidatoId: string) => {
    const c = candidatos.find((x) => x.id === candidatoId);
    if (c) {
      moverCandidatoComHistorico(candidatoId, c.status, "recusado", null, (c as any).score_total);
    } else {
      moveCandidatoMutation.mutate({ candidatoId, newStatus: "recusado" });
    }
  };

  const scrollToColuna = (colId: string) => {
    document.getElementById(`col-${colId}`)?.scrollIntoView({
      behavior: "smooth", block: "nearest", inline: "center",
    });
  };

  if (vagaLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-[30%_70%] gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!vaga) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Vaga não encontrada.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/recrutamento")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </div>
    );
  }

  const beneficiosLabels = (vaga.beneficios_ids as string[] | null)?.map(
    (v) => beneficiosParam.find((b) => b.valor === v)?.label || v
  ) || [];

  return (
    <div className="flex flex-col h-full -m-6 overflow-hidden">
      <div className="px-6 pt-4">
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-2 text-xs">
          <strong className="text-warning">Fluxo de contratação desativado nesta tela.</strong>{" "}
          <span className="text-foreground">Para contratar, use <a href="/pessoas/vagas" className="underline font-medium">Pessoas → Vagas</a>.</span>
        </div>
      </div>
      {/* HEADER */}
      <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
        <div className="flex items-center gap-3">
          <SmartBackButton fallback="/recrutamento" fallbackLabel="Recrutamento" />
          <div>
            <h1 className="text-lg font-semibold">{vaga.titulo}</h1>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {vaga.area}
                {vaga.tipo_contrato ? ` · ${vaga.tipo_contrato.toUpperCase()}` : ""}
                {vaga.local_trabalho ? ` · ${vaga.local_trabalho}` : ""}
              </p>
              {((vaga as any)?.num_vagas ?? 1) > 1 && (() => {
                const nv = (vaga as any).num_vagas ?? 1;
                const vr = nv - ((vaga as any).vagas_preenchidas ?? 0);
                return (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: vr > 0 ? "#D8F3DC" : "#FEE2E2",
                      color: vr > 0 ? "#1A4A3A" : "#DC2626",
                    }}>
                    {vr > 0
                      ? `${(vaga as any).vagas_preenchidas ?? 0}/${nv} · ${vr} restante${vr > 1 ? "s" : ""}`
                      : "Todas as vagas preenchidas"}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(isSuperAdmin || isAdminRH) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditarForm({
                  titulo: vaga.titulo ?? "",
                  area: vaga.area ?? "",
                  nivel: (vaga as any).nivel ?? "",
                  local_trabalho: (vaga as any).local_trabalho ?? "",
                  jornada: (vaga as any).jornada ?? "",
                  salario_min: (vaga as any).salario_min?.toString() ?? "",
                  salario_max: (vaga as any).salario_max?.toString() ?? "",
                  skills_obrigatorias: (vaga as any).skills_obrigatorias ?? [],
                  skills_desejadas: (vaga as any).skills_desejadas ?? [],
                  ferramentas: (vaga as any).ferramentas ?? [],
                  beneficios: (vaga as any).beneficios ?? [],
                  descricao: (vaga as any).descricao ?? "",
                  gestor_id: (vaga as any).gestor_id ?? "",
                  num_vagas: (vaga as any).num_vagas ?? 1,
                });
                setEditarVagaOpen(true);
              }}
            >
              <Pencil className="h-4 w-4 mr-2" /> Editar vaga
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setAddCandidatoOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" /> Adicionar Candidato
          </Button>
          <Button variant="outline" size="sm" onClick={recalcularTodosScores} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Recalcular scores
          </Button>
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Link className="h-4 w-4 mr-2" /> Copiar link
          </Button>
          {vaga.status === "rascunho" && (
            <Button size="sm" onClick={publicarVaga}
              disabled={publicando}>
              {publicando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Globe className="h-4 w-4 mr-2" /> Publicar
            </Button>
          )}
          {(vaga.status === "aberta" || vaga.status === "em_selecao") && (
            <Button variant="outline" size="sm" onClick={() => updateStatusMutation.mutate("encerrada")}
              disabled={updateStatusMutation.isPending}>
              Encerrar vaga
            </Button>
          )}
          {vaga.status === "encerrada" && (
            <Button variant="outline" size="sm" onClick={() => updateStatusMutation.mutate("aberta")}
              disabled={updateStatusMutation.isPending}>
              Reabrir vaga
            </Button>
           )}
          {podeExcluir && (
            <Button variant="outline" size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setConfirmarExclusao(true)}>
              <Trash2 className="h-4 w-4 mr-2" /> Excluir vaga
            </Button>
          )}
        </div>
      </div>

      {/* KANBAN — full width */}
      <div className="flex-1 overflow-hidden bg-muted/20">
        <div className="flex gap-3 p-4 h-full overflow-x-auto">
          {KANBAN_STAGES.map((stage) => {
            const cards = candidatos.filter((c) => c.status === stage.key);
            return (
              <div
                key={stage.key}
                id={`col-${stage.key}`}
                className="flex flex-col min-w-[200px] flex-1 rounded-xl overflow-hidden"
                style={{ backgroundColor: stage.bg }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(stage.key)}
              >
                {/* Column header */}
                <div className="px-3 py-2.5 flex items-center justify-between"
                  style={{ backgroundColor: stage.cor }}>
                  <span className="text-xs font-semibold text-white uppercase tracking-wider">
                    {stage.label}
                  </span>
                  <span className="bg-white/20 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center">
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-220px)]">
                  {cards.map((c) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => handleDragStart(c.id)}
                      onDragEnd={handleDragEnd}
                      className={`bg-white rounded-lg p-3 cursor-pointer shadow-sm border-l-4 hover:shadow-md transition-all group ${
                        draggingId === c.id ? "opacity-50" : ""
                      }`}
                      style={{ borderLeftColor: stage.cor }}
                      onClick={() => setSelectedCandidato(c)}
                    >
                      {/* Avatar + Name */}
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: stage.cor }}
                        >
                          {getInitials(c.nome)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate leading-tight">{c.nome}</p>
                          <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: stage.bg, color: stage.cor }}>
                          {c.origem || "portal"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {c.created_at ? format(new Date(c.created_at), "dd/MM") : ""}
                        </span>
                      </div>

                      {/* Score badge */}
                      {(c as any).score_total > 0 && (
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                          <span className="text-xs text-muted-foreground">
                            {(c as any).score_detalhado?.alerta?.startsWith("overqualified")
                              ? "⚠ Overqualified"
                              : (c as any).score_detalhado?.alerta === "underqualified"
                                ? "⚠ Underqualified"
                                : "Score"}
                          </span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            (c as any).score_detalhado?.alerta?.startsWith("overqualified")
                              ? "bg-orange-100 text-orange-700"
                              : (c as any).score_detalhado?.alerta === "underqualified"
                                ? "bg-red-100 text-red-700"
                                : (c as any).score_total >= 80
                                  ? "bg-green-100 text-green-700"
                                  : (c as any).score_total >= 50
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-red-100 text-red-700"
                          }`}>
                            {(c as any).score_total}%
                          </span>
                        </div>
                      )}

                      {/* Status / próxima ação */}
                      {(() => {
                        const statusCard = getStatusCard(c);
                        if (!statusCard) return null;
                        return (
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                            <span className="text-xs text-muted-foreground">Status</span>
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: statusCard.cor + "18",
                                color: statusCard.cor,
                              }}>
                              {statusCard.label}
                            </span>
                          </div>
                        );
                      })()}

                      {/* Hover actions */}
                      <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost" size="sm"
                          className="h-6 text-xs flex-1 px-2 hover:bg-gray-100"
                          onClick={(e) => { e.stopPropagation(); advanceCandidato(c.id); }}
                        >
                          Avançar →
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="h-6 text-xs text-destructive hover:bg-red-50 px-2"
                          onClick={(e) => { e.stopPropagation(); rejectCandidato(c.id); }}
                        >
                          Recusar
                        </Button>
                      </div>
                    </div>
                  ))}

                  {cards.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8">
                      <div className="w-8 h-8 rounded-full mb-2 flex items-center justify-center opacity-20"
                        style={{ backgroundColor: stage.cor }}>
                        <Plus className="h-4 w-4 text-white" />
                      </div>
                      <p className="text-xs text-muted-foreground opacity-50">Nenhum candidato</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DETAILS — always visible */}
      <div className="border-t flex-shrink-0">
        <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Col 1 — Info */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Informações</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {[
                { label: "Tipo", value: vaga.tipo_contrato === "clt" ? "CLT" : vaga.tipo_contrato === "pj" ? "PJ" : "CLT/PJ" },
                { label: "Nível", value: vaga.nivel },
                { label: "Local", value: vaga.local_trabalho },
                { label: "Jornada", value: vaga.jornada },
                { label: "Gestor", value: gestorNome ?? "—" },
                { label: "Vigência", value: vaga.vigencia_fim ? new Date(vaga.vigencia_fim).toLocaleDateString("pt-BR") : "—" },
              ].map(item => item.value ? (
                <div key={item.label}>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium">{item.value}</p>
                </div>
              ) : null)}
            </div>
            {vaga.missao && (
              <div className="pt-2 border-t">
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Missão</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{vaga.missao}</p>
              </div>
            )}
          </div>

          {/* Col 2 — Salary, Benefits & Responsibilities */}
          <div className="space-y-4">
            {canSeeFaixa && (vaga.faixa_min || vaga.faixa_max) && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Remuneração</p>
                <p className="text-base font-bold text-[#1A4A3A]">
                  {vaga.faixa_min ? `R$ ${Number(vaga.faixa_min).toLocaleString("pt-BR")}` : "—"}
                  {" – "}
                  {vaga.faixa_max ? `R$ ${Number(vaga.faixa_max).toLocaleString("pt-BR")}` : "—"}
                </p>
              </div>
            )}
            {(beneficiosLabels.length > 0 || vaga.beneficios_outros) && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Benefícios</p>
                <div className="flex flex-wrap gap-1.5">
                  {beneficiosLabels.map((b) => (
                    <span key={b} className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#1A4A3A]/8 text-[#1A4A3A] border border-[#1A4A3A]/15">{b}</span>
                  ))}
                </div>
                {vaga.beneficios_outros && (
                  <p className="text-sm text-muted-foreground mt-2">{vaga.beneficios_outros}</p>
                )}
              </div>
            )}
            {(vaga.responsabilidades as string[] | null)?.length ? (
              <div className="pt-3 border-t">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Responsabilidades</p>
                <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                  {(vaga.responsabilidades as string[]).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Col 3 — Skills */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Skills</p>
            {(vaga.skills_obrigatorias as string[] | null)?.length ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Obrigatórias</p>
                <div className="flex flex-wrap gap-1.5">
                  {(vaga.skills_obrigatorias as string[]).map((s) => (
                    <span key={s} className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#1A4A3A] text-white">{s}</span>
                  ))}
                </div>
              </div>
            ) : null}
            {(vaga.skills_desejadas as string[] | null)?.length ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Desejadas</p>
                <div className="flex flex-wrap gap-1.5">
                  {(vaga.skills_desejadas as string[]).map((s) => (
                    <span key={s} className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">{s}</span>
                  ))}
                </div>
              </div>
            ) : null}
            {(vaga.ferramentas as string[] | null)?.length ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Ferramentas</p>
                <div className="flex flex-wrap gap-1.5">
                  {(vaga.ferramentas as string[]).map((s) => (
                    <span key={s} className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">{s}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Add candidato dialog */}
      <Dialog open={addCandidatoOpen} onOpenChange={(open) => {
        setAddCandidatoOpen(open);
        if (!open) {
          setNewCandidato({ nome: "", email: "", telefone: "", origem: "indicacao", experiencias: [], formacoes: [], skills_candidato: [], sistemas_candidato: [], mensagem: "" });
          setAddCandidatoPdfCarregado(false);
          setAddCandidatoNomePDF("");
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Candidato</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Upload de CV */}
            <div className="rounded-xl overflow-hidden shadow-sm border">
              <div className="px-4 py-3 bg-primary/10 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-primary/20">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Importar CV</p>
                  <p className="text-xs text-muted-foreground">A IA lê e preenche os campos automaticamente</p>
                </div>
              </div>
              <div className="bg-card px-4 pb-4 pt-3">
                {!addCandidatoPdfCarregado ? (
                  <div
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                      addCandidatoArrastando ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setAddCandidatoArrastando(true); }}
                    onDragLeave={() => setAddCandidatoArrastando(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setAddCandidatoArrastando(false);
                      const file = e.dataTransfer.files[0];
                      if (file?.type === "application/pdf") processarPDFCandidato(file);
                      else toast.error("Apenas arquivos PDF são aceitos.");
                    }}
                    onClick={() => document.getElementById("pdf-candidato-rh")?.click()}
                  >
                    <input id="pdf-candidato-rh" type="file" accept=".pdf" className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) processarPDFCandidato(file);
                      }}
                    />
                    {addCandidatoImportando ? (
                      <div className="space-y-2">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                        <p className="text-sm font-medium text-primary">Lendo o CV...</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-sm font-medium">Arraste o PDF ou clique para selecionar</p>
                        <p className="text-xs text-muted-foreground">PDF · máx. 5MB</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-xl border bg-success/10 border-success/30">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-success">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-success">CV importado!</p>
                      <p className="text-xs text-muted-foreground truncate">{addCandidatoNomePDF}</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="text-muted-foreground"
                      onClick={() => { setAddCandidatoPdfCarregado(false); setAddCandidatoNomePDF(""); }}>
                      Trocar
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Divisor */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground uppercase">dados do candidato</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Campos */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Nome *</Label>
                <Input value={newCandidato.nome} onChange={(e) => setNewCandidato({ ...newCandidato, nome: e.target.value })}
                  placeholder="Nome completo" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>E-mail *</Label>
                  <Input type="email" value={newCandidato.email} onChange={(e) => setNewCandidato({ ...newCandidato, email: e.target.value })}
                    placeholder="email@exemplo.com" />
                </div>
                <div className="space-y-1">
                  <Label>Telefone</Label>
                  <Input value={newCandidato.telefone} onChange={(e) => setNewCandidato({ ...newCandidato, telefone: e.target.value })}
                    placeholder="(11) 99999-9999" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Origem</Label>
                <Select value={newCandidato.origem} onValueChange={(v) => setNewCandidato({ ...newCandidato, origem: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indicacao">Indicação</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="email_direto">E-mail direto</SelectItem>
                    <SelectItem value="agencia">Agência</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Skills importadas — preview */}
              {newCandidato.skills_candidato.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Skills identificadas no CV</Label>
                  <div className="flex flex-wrap gap-1">
                    {newCandidato.skills_candidato.slice(0, 8).map((s: any, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">{s.skill}</Badge>
                    ))}
                    {newCandidato.skills_candidato.length > 8 && (
                      <Badge variant="outline" className="text-xs">+{newCandidato.skills_candidato.length - 8} mais</Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Experiências — preview */}
              {newCandidato.experiencias.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Experiências importadas</Label>
                  <div className="space-y-1">
                    {newCandidato.experiencias.slice(0, 2).map((exp: any, i: number) => (
                      <div key={i} className="text-xs p-2 rounded bg-muted/50">
                        <p className="font-medium">{exp.cargo}</p>
                        <p className="text-muted-foreground">{exp.empresa} · {exp.periodo_inicio} – {exp.atual ? "atual" : exp.periodo_fim}</p>
                      </div>
                    ))}
                    {newCandidato.experiencias.length > 2 && (
                      <p className="text-xs text-muted-foreground">+{newCandidato.experiencias.length - 2} experiência{newCandidato.experiencias.length - 2 > 1 ? "s" : ""}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Button className="w-full" disabled={!newCandidato.nome.trim() || !newCandidato.email.trim() || addCandidatoMutation.isPending}
              onClick={() => addCandidatoMutation.mutate()}>
              {addCandidatoMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adicionando...</> : "Adicionar candidato"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contratar dialog removed — redirects to ConvitesCadastro */}

      {/* Encerrar vaga alert */}
      <AlertDialog open={encerrarVagaOpen} onOpenChange={setEncerrarVagaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deseja encerrar esta vaga?</AlertDialogTitle>
            <AlertDialogDescription>
              O candidato foi contratado. Deseja encerrar a vaga "{vaga.titulo}" agora?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setEncerrarVagaOpen(false);
              navigate("/convites-cadastro");
            }}>
              Não, manter aberta
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              updateStatusMutation.mutate("encerrada");
              setEncerrarVagaOpen(false);
              navigate("/convites-cadastro");
            }}>
              Sim, encerrar vaga
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir vaga dialog */}
      <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir vaga</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a vaga "{vaga.titulo}"?
              Esta ação não pode ser desfeita e todos os candidatos vinculados serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={excluindo}
              onClick={(e) => { e.preventDefault(); excluirVaga(); }}
            >
              {excluindo ? "Excluindo..." : "Sim, excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={!!selectedCandidato} onOpenChange={(open) => { if (!open) { setSelectedCandidato(null); setEditandoEmail(false); setNovoEmail(""); } }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedCandidato && (
            <div className="space-y-6 py-4">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-full flex items-center justify-center text-lg font-semibold shrink-0 bg-primary text-primary-foreground">
                  {getInitials(selectedCandidato.nome)}
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-lg font-semibold leading-tight">{selectedCandidato.nome}</p>
                  {editandoEmail ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={novoEmail}
                        onChange={e => setNovoEmail(e.target.value)}
                        className="h-7 text-xs px-2 w-48"
                        placeholder="novo@email.com"
                        onKeyDown={e => {
                          if (e.key === "Enter") salvarEmailCandidato(selectedCandidato.id, novoEmail);
                          if (e.key === "Escape") setEditandoEmail(false);
                        }}
                        autoFocus
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => salvarEmailCandidato(selectedCandidato.id, novoEmail)}>
                        {salvandoEmail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setEditandoEmail(false)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 group">
                      <p className="text-sm text-muted-foreground">{selectedCandidato.email}</p>
                      <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => { setNovoEmail(selectedCandidato.email); setEditandoEmail(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {selectedCandidato.telefone && (
                    <p className="text-sm text-muted-foreground">{selectedCandidato.telefone}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge variant="secondary" className="text-xs capitalize">{selectedCandidato.status}</Badge>
                    <Badge variant="outline" className="text-xs capitalize">{selectedCandidato.origem || "portal"}</Badge>
                  </div>
                  {selectedCandidato.created_at && (
                    <p className="text-xs text-muted-foreground">
                      Candidatura em {new Date(selectedCandidato.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
              </div>

              <Tabs defaultValue="perfil">
                <TabsList className="grid w-full grid-cols-7">
                  <TabsTrigger value="perfil" className="text-xs">Perfil</TabsTrigger>
                  <TabsTrigger value="entrevistas" className="text-xs">Entrevistas</TabsTrigger>
                  <TabsTrigger value="teste" className="text-xs">Teste</TabsTrigger>
                  <TabsTrigger value="avaliacao" className="text-xs">Score</TabsTrigger>
                  <TabsTrigger value="oferta" className="text-xs">Proposta</TabsTrigger>
                  <TabsTrigger value="notas" className="text-xs">Notas</TabsTrigger>
                  <TabsTrigger value="historico" className="text-xs">Histórico</TabsTrigger>
                </TabsList>

                <TabsContent value="perfil" className="space-y-4 mt-4">
                  {/* Score se existir */}
                  {(selectedCandidato as any).score_total > 0 && (
                    <div className="p-3 rounded-lg border space-y-2"
                      style={{ backgroundColor:
                        (selectedCandidato as any).score_detalhado?.alerta?.startsWith("overqualified") ? '#FFF7ED' :
                        (selectedCandidato as any).score_total >= 80 ? '#F0FFF4' :
                        (selectedCandidato as any).score_total >= 50 ? '#FFFBEB' : '#FEF2F2'
                      }}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">Score de aderência</p>
                        <span className="text-lg font-bold" style={{ color:
                          (selectedCandidato as any).score_detalhado?.alerta?.startsWith("overqualified") ? '#D97706' :
                          (selectedCandidato as any).score_total >= 80 ? '#1A4A3A' :
                          (selectedCandidato as any).score_total >= 50 ? '#D97706' : '#DC2626'
                        }}>
                          {(selectedCandidato as any).score_total}%
                        </span>
                      </div>
                      {(selectedCandidato as any).score_detalhado?.alerta && (
                        <div className="flex items-start gap-2 p-2 rounded-md border" style={{
                          backgroundColor: (selectedCandidato as any).score_detalhado.alerta === "underqualified" ? "#FEF2F2" : "#FFF7ED",
                          borderColor: (selectedCandidato as any).score_detalhado.alerta === "underqualified" ? "#DC262630" : "#D9770630"
                        }}>
                          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{
                            color: (selectedCandidato as any).score_detalhado.alerta === "underqualified" ? "#DC2626" : "#D97706"
                          }} />
                          <div>
                            <p className="text-xs font-medium" style={{
                              color: (selectedCandidato as any).score_detalhado.alerta === "underqualified" ? "#DC2626" : "#D97706"
                            }}>
                              {(selectedCandidato as any).score_detalhado.alerta === "overqualified" ? "Overqualified — risco de turnover" :
                               (selectedCandidato as any).score_detalhado.alerta === "overqualified_leve" ? "Overqualified leve — avaliar motivação" :
                               "Underqualified — pode não atender o nível exigido"}
                            </p>
                            {(selectedCandidato as any).score_detalhado.alerta_texto && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {(selectedCandidato as any).score_detalhado.alerta_texto}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {(selectedCandidato as any).score_detalhado?.alerta_salarial && (
                        <div className="flex items-start gap-2 p-2 rounded-md border" style={{
                          backgroundColor: (selectedCandidato as any).score_detalhado.alerta_salarial === "acima_critico" ? "#FEF2F2" : "#FFF7ED",
                          borderColor: (selectedCandidato as any).score_detalhado.alerta_salarial === "acima_critico" ? "#DC262630" : "#D9770630"
                        }}>
                          <span className="text-sm flex-shrink-0">💰</span>
                          <div>
                            <p className="text-xs font-medium" style={{
                              color: (selectedCandidato as any).score_detalhado.alerta_salarial === "acima_critico" ? "#DC2626" : "#D97706"
                            }}>
                              {(selectedCandidato as any).score_detalhado.alerta_salarial === "acima_critico" ? "Pretensão muito acima da faixa" :
                               (selectedCandidato as any).score_detalhado.alerta_salarial === "acima_leve" ? "Pretensão levemente acima da faixa" :
                               "Pretensão abaixo da faixa — avaliar"}
                            </p>
                            {(selectedCandidato as any).pretensao_salarial && (
                              <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                                Pretensão: <SalarioMasked valor={Number((selectedCandidato as any).pretensao_salarial)} userId={null} contexto="recrutamento" />
                                {(vaga as any)?.faixa_max && <> · Faixa: até R$ {Number((vaga as any).faixa_max).toLocaleString("pt-BR")}</>}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {(selectedCandidato as any).score_detalhado?.nivel_detectado && (
                        <p className="text-xs text-muted-foreground">
                          Nível detectado: <span className="font-medium capitalize">{(selectedCandidato as any).score_detalhado.nivel_detectado}</span>
                          {" · "}Vaga: <span className="font-medium capitalize">{(vaga as any)?.nivel ?? "?"}</span>
                        </p>
                      )}
                      {(selectedCandidato as any).score_detalhado?.resumo && (
                        <p className="text-xs text-muted-foreground">
                          {(selectedCandidato as any).score_detalhado.resumo}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Links */}
                  {selectedCandidato.linkedin_url && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">LinkedIn</p>
                      <a href={selectedCandidato.linkedin_url.startsWith("http") ? selectedCandidato.linkedin_url : `https://${selectedCandidato.linkedin_url}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-sm text-primary flex items-center gap-1 hover:underline">
                        {selectedCandidato.linkedin_url} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {selectedCandidato.portfolio_url && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Portfólio</p>
                      <a href={selectedCandidato.portfolio_url.startsWith("http") ? selectedCandidato.portfolio_url : `https://${selectedCandidato.portfolio_url}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-sm text-primary flex items-center gap-1 hover:underline">
                        {selectedCandidato.portfolio_url} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}

                  {/* Experiências */}
                  {(selectedCandidato as any).experiencias?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Experiências</p>
                      {(selectedCandidato as any).experiencias.map((exp: any, i: number) => (
                        <div key={i} className="p-3 rounded-lg bg-muted/30 space-y-0.5">
                          <p className="text-sm font-medium">{exp.cargo}</p>
                          <p className="text-xs text-muted-foreground">{exp.empresa}</p>
                          <p className="text-xs text-muted-foreground">
                            {exp.periodo_inicio} – {exp.atual ? 'atual' : exp.periodo_fim}
                          </p>
                          {exp.descricao && (
                            <p className="text-xs text-muted-foreground mt-1">{exp.descricao}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Formações */}
                  {(selectedCandidato as any).formacoes?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Formação</p>
                      {(selectedCandidato as any).formacoes.map((form: any, i: number) => (
                        <div key={i} className="p-3 rounded-lg bg-muted/30 space-y-0.5">
                          <p className="text-sm font-medium">{form.curso}</p>
                          <p className="text-xs text-muted-foreground">{form.instituicao}</p>
                          <p className="text-xs text-muted-foreground capitalize">{form.nivel} · {form.status}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Skills */}
                  {(selectedCandidato as any).skills_candidato?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Skills declaradas</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(selectedCandidato as any).skills_candidato.map((s: any, i: number) => (
                          <span key={i} className="px-2 py-1 rounded-full text-xs font-medium bg-primary text-primary-foreground">
                            {s.skill}
                            {s.nivel && s.nivel !== 'intermediario' && (
                              <span className="ml-1 opacity-70">· {s.nivel}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sistemas */}
                  {(selectedCandidato as any).sistemas_candidato?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sistemas e ferramentas</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(selectedCandidato as any).sistemas_candidato.map((s: any, i: number) => (
                          <span key={i} className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            {s.sistema}
                            {s.nivel && s.nivel !== 'intermediario' && (
                              <span className="ml-1 opacity-70">· {s.nivel}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skills validadas pelo teste */}
                  {selectedCandidato?.id && (() => {
                    const testeDoC = testesTecnicos.find((t: any) => t.candidato_id === selectedCandidato.id);
                    const validadas = (testeDoC as any)?.skills_validadas?.filter((s: any) => s.resultado);
                    if (!validadas?.length) return null;
                    return (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Skills validadas no teste
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {validadas.map((s: any, i: number) => (
                            <span key={i}
                              className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1"
                              style={{
                                backgroundColor: s.resultado === "confirmado" ? "#D8F3DC" :
                                  s.resultado === "parcial" ? "#FEF3C7" : "#FEE2E2",
                                color: s.resultado === "confirmado" ? "#1A4A3A" :
                                  s.resultado === "parcial" ? "#D97706" : "#DC2626",
                              }}>
                              {s.resultado === "confirmado" ? "✓" :
                               s.resultado === "parcial" ? "~" : "✗"} {s.skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Motivação */}
                  {selectedCandidato.mensagem && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Por que a Fetely</p>
                      <p className="text-sm text-muted-foreground italic">"{selectedCandidato.mensagem}"</p>
                    </div>
                  )}

                  {/* Perfil incompleto — botão solicitar */}
                  {!(selectedCandidato as any).experiencias?.length && (
                    <div className="p-4 rounded-lg border border-dashed text-center space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Este candidato não preencheu o perfil completo.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={solicitando}
                        onClick={() => solicitarPerfilCompleto(selectedCandidato)}
                      >
                        {solicitando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                        Solicitar perfil por e-mail
                      </Button>
                    </div>
                  )}

                  {/* LGPD */}
                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    Consentimento LGPD: {selectedCandidato.consentimento_lgpd_at
                      ? new Date(selectedCandidato.consentimento_lgpd_at).toLocaleDateString("pt-BR")
                      : "não registrado"}
                  </div>
                </TabsContent>

                <TabsContent value="entrevistas" className="space-y-6 mt-4">
                  {["entrevista_rh", "entrevista_gestor", "teste_tecnico", "oferta", "contratado"]
                    .includes(selectedCandidato.status) ? (
                    <>
                      <FormularioEntrevista
                        candidatoId={selectedCandidato.id}
                        vagaId={id!}
                        tipo="rh"
                        candidato={selectedCandidato}
                        vaga={vaga}
                        readOnly={
                          selectedCandidato.status !== "entrevista_rh" &&
                          !["entrevista_gestor", "teste_tecnico", "oferta", "contratado"]
                            .includes(selectedCandidato.status)
                        }
                      />
                      {["entrevista_gestor", "teste_tecnico", "oferta", "contratado"]
                        .includes(selectedCandidato.status) && (
                        <div className="border-t pt-4">
                          <FormularioEntrevista
                            candidatoId={selectedCandidato.id}
                            vagaId={id!}
                            tipo="gestor"
                            candidato={selectedCandidato}
                            vaga={vaga}
                            readOnly={selectedCandidato.status !== "entrevista_gestor"}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground italic text-center py-4">
                      Formulários disponíveis a partir da etapa Entrevista RH.
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="teste" className="mt-4">
                  <TesteTecnico
                    candidatoId={selectedCandidato.id}
                    vagaId={id!}
                    candidato={selectedCandidato}
                    vaga={vaga}
                  />
                </TabsContent>

                <TabsContent value="oferta" className="mt-4">
                  <ModuloOferta
                    candidatoId={selectedCandidato.id}
                    vagaId={id!}
                    candidato={selectedCandidato}
                    vaga={vaga}
                    canSeeFaixa={canSeeFaixa}
                  />
                </TabsContent>

                <TabsContent value="avaliacao" className="space-y-4 mt-4">
                  {(selectedCandidato as any).score_total > 0 ? (
                    <>
                      {/* Score total + resumo */}
                      <div className="p-4 rounded-lg border" style={{
                        backgroundColor: (selectedCandidato as any).score_total >= 80 ? '#F0FFF4' :
                          (selectedCandidato as any).score_total >= 50 ? '#FFFBEB' : '#FEF2F2'
                      }}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold">Score de aderência</p>
                          <span className="text-2xl font-bold" style={{ color:
                            (selectedCandidato as any).score_total >= 80 ? '#1A4A3A' :
                            (selectedCandidato as any).score_total >= 50 ? '#D97706' : '#DC2626'
                          }}>
                            {(selectedCandidato as any).score_total}%
                          </span>
                        </div>
                        {(selectedCandidato as any).score_detalhado?.resumo && (
                          <p className="text-sm text-muted-foreground whitespace-pre-line">
                            {(selectedCandidato as any).score_detalhado.resumo}
                          </p>
                        )}
                        {(selectedCandidato as any).score_detalhado?.nivel_detectado && (
                          <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                            Nível detectado: <span className="font-medium capitalize">{(selectedCandidato as any).score_detalhado.nivel_detectado}</span>
                            {" · "}Nível da vaga: <span className="font-medium capitalize">{(vaga as any)?.nivel ?? "?"}</span>
                            {(selectedCandidato as any).score_calculado_em && (
                              <> {" · "}Calculado em {new Date((selectedCandidato as any).score_calculado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</>
                            )}
                          </p>
                        )}
                      </div>
                      {/* Alertas */}
                      {(selectedCandidato as any).score_detalhado?.alerta && (
                        <div className="flex items-start gap-2 p-3 rounded-lg border" style={{
                          backgroundColor: (selectedCandidato as any).score_detalhado.alerta === "underqualified" ? "#FEF2F2" : "#FFF7ED",
                          borderColor: (selectedCandidato as any).score_detalhado.alerta === "underqualified" ? "#DC262630" : "#D9770630"
                        }}>
                          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{
                            color: (selectedCandidato as any).score_detalhado.alerta === "underqualified" ? "#DC2626" : "#D97706"
                          }} />
                          <div>
                            <p className="text-sm font-medium" style={{
                              color: (selectedCandidato as any).score_detalhado.alerta === "underqualified" ? "#DC2626" : "#D97706"
                            }}>
                              {(selectedCandidato as any).score_detalhado.alerta === "overqualified" ? "Overqualified — risco de turnover" :
                               (selectedCandidato as any).score_detalhado.alerta === "overqualified_leve" ? "Overqualified leve — avaliar motivação" :
                               "Underqualified — pode não atender o nível exigido"}
                            </p>
                            {(selectedCandidato as any).score_detalhado.alerta_texto && (
                              <p className="text-xs text-muted-foreground mt-1">{(selectedCandidato as any).score_detalhado.alerta_texto}</p>
                            )}
                          </div>
                        </div>
                      )}
                      {(selectedCandidato as any).score_detalhado?.alerta_salarial && (
                        <div className="flex items-start gap-2 p-3 rounded-lg border" style={{
                          backgroundColor: (selectedCandidato as any).score_detalhado.alerta_salarial === "acima_critico" ? "#FEF2F2" : "#FFF7ED",
                          borderColor: (selectedCandidato as any).score_detalhado.alerta_salarial === "acima_critico" ? "#DC262630" : "#D9770630"
                        }}>
                          <span className="text-base flex-shrink-0">💰</span>
                          <div>
                            <p className="text-sm font-medium" style={{
                              color: (selectedCandidato as any).score_detalhado.alerta_salarial === "acima_critico" ? "#DC2626" : "#D97706"
                            }}>
                              {(selectedCandidato as any).score_detalhado.alerta_salarial === "acima_critico" ? "Pretensão muito acima da faixa" :
                               (selectedCandidato as any).score_detalhado.alerta_salarial === "acima_leve" ? "Pretensão levemente acima da faixa" :
                               "Pretensão abaixo da faixa — avaliar"}
                            </p>
                            {(selectedCandidato as any).pretensao_salarial && (
                              <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                                Pretensão: <SalarioMasked valor={Number((selectedCandidato as any).pretensao_salarial)} userId={null} contexto="recrutamento" />
                                {(vaga as any)?.faixa_max && <> · Faixa da vaga: até R$ {Number((vaga as any).faixa_max).toLocaleString("pt-BR")}</>}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Breakdown por dimensão */}
                      <div className="p-4 rounded-lg border space-y-3">
                        <p className="text-sm font-semibold">Detalhamento por dimensão</p>
                        {[
                          { label: "Skills", valor: (selectedCandidato as any).score_detalhado?.skills_match, max: 35, cor: "#1A4A3A" },
                          { label: "Adequação de nível", valor: (selectedCandidato as any).score_detalhado?.nivel_adequacao, max: 30, cor: "#2563EB" },
                          { label: "Experiência relevante", valor: (selectedCandidato as any).score_detalhado?.experiencia_relevante, max: 20, cor: "#7C3AED" },
                          { label: "Sistemas e ferramentas", valor: (selectedCandidato as any).score_detalhado?.sistemas_match, max: 10, cor: "#0891B2" },
                          { label: "Motivação", valor: (selectedCandidato as any).score_detalhado?.motivacao, max: 5, cor: "#D97706", texto: (selectedCandidato as any).score_detalhado?.motivacao_texto },
                        ].map((dim: any) => dim.valor != null ? (
                          <div key={dim.label} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium">{dim.label}</span>
                              <span className="text-xs font-bold" style={{ color: dim.cor }}>{dim.valor}/{dim.max}</span>
                            </div>
                            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{
                                width: `${(dim.valor / dim.max) * 100}%`,
                                backgroundColor: dim.cor
                              }} />
                            </div>
                            {dim.texto && (
                              <p className="text-xs text-muted-foreground italic">{dim.texto}</p>
                            )}
                          </div>
                        ) : null)}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 space-y-2">
                      <p className="text-sm text-muted-foreground">Score ainda não calculado.</p>
                      <p className="text-xs text-muted-foreground">O score é gerado automaticamente quando o candidato tem perfil completo (experiências, skills).</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="historico" className="mt-4">
                  <HistoricoCandidato candidatoId={selectedCandidato?.id} />
                </TabsContent>

                <TabsContent value="notas" className="space-y-3 mt-4">
                  <div className="flex gap-2">
                    <Textarea
                      value={notaTexto}
                      onChange={(e) => setNotaTexto(e.target.value)}
                      placeholder="Adicionar nota interna..."
                      rows={2}
                      className="flex-1"
                    />
                    <Button size="sm" className="self-end" disabled={!notaTexto.trim()}>
                      Salvar
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex gap-2 pt-4 border-t">
                <Button className="flex-1" onClick={() => { advanceCandidato(selectedCandidato.id); setSelectedCandidato(null); }}>
                  <ArrowRight className="h-4 w-4 mr-1" /> Avançar etapa
                </Button>
                <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => { rejectCandidato(selectedCandidato.id); setSelectedCandidato(null); }}>
                  <XCircle className="h-4 w-4 mr-1" /> Recusar
                </Button>
                {selectedCandidato.status === "contratado" && (
                  <Button variant="default" onClick={() => { openContratarDialog(selectedCandidato); setSelectedCandidato(null); }}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Contratar
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog de vaga publicada */}
      <Dialog open={vagaPublicada} onOpenChange={setVagaPublicada}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          {/* Header verde Fetely */}
          <div className="px-6 pt-8 pb-6 text-center" style={{ backgroundColor: "#1A4A3A" }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
              <Check className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-1">
              Vaga publicada! 🎉
            </h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
              {vaga?.titulo} está no ar
            </p>
          </div>
          {/* Corpo */}
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Compartilhe o link abaixo para receber candidaturas.
              Sem login — o candidato acessa direto.
            </p>
            {/* Link com copy */}
            <div className="rounded-xl border p-3 space-y-2" style={{ backgroundColor: "#F3F7F5" }}>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Link da vaga
              </p>
              <p className="text-sm font-mono text-gray-700 break-all leading-relaxed">
                {PUBLIC_APP_URL}/vagas/{id}
              </p>
            </div>
            {/* Sugestão de onde compartilhar */}
            <div className="flex gap-2 text-xs text-muted-foreground justify-center">
              <span>LinkedIn</span>
              <span>·</span>
              <span>WhatsApp</span>
              <span>·</span>
              <span>Instagram</span>
              <span>·</span>
              <span>Email</span>
            </div>
            {/* Botões */}
            <div className="flex flex-col gap-2 pt-1">
              <Button
                className="w-full h-11 font-medium"
                style={{ backgroundColor: "#1A4A3A" }}
                onClick={() => {
                  navigator.clipboard.writeText(publicUrl(`/vagas/${id}`));
                  toast.success("Link copiado!");
                  setVagaPublicada(false);
                }}>
                <Copy className="h-4 w-4 mr-2" /> Copiar link e fechar
              </Button>
              <Button variant="ghost" className="w-full h-9 text-muted-foreground"
                onClick={() => setVagaPublicada(false)}>
                Fechar sem copiar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de gatilho — score abaixo do mínimo */}
      <Dialog open={gatilhoDialog} onOpenChange={(open) => {
        if (!open) {
          setGatilhoDialog(false);
          setGatilhoCandidato(null);
          setGatilhoJustificativa("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Score abaixo do mínimo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-sm text-amber-800">
                <strong>{gatilhoCandidato?.nome}</strong> tem score de{" "}
                <strong>{(gatilhoCandidato as any)?.score_total ?? 0}%</strong>{" "}
                (mínimo recomendado: {SCORE_MINIMO_ENTREVISTA}%).
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Por que está avançando para Entrevista RH? *
              </Label>
              <Textarea
                value={gatilhoJustificativa}
                onChange={e => setGatilhoJustificativa(e.target.value)}
                placeholder="Ex: Candidato tem experiência específica relevante que não foi capturada pelo score automático..."
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Esta justificativa ficará registrada no histórico do candidato.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setGatilhoDialog(false);
                setGatilhoCandidato(null);
                setGatilhoJustificativa("");
              }}
            >
              Cancelar
            </Button>
            <Button
              disabled={!gatilhoJustificativa.trim()}
              onClick={() => {
                moverCandidatoComHistorico(
                  gatilhoCandidato.id,
                  gatilhoCandidato.status,
                  gatilhoProximoStatus,
                  gatilhoJustificativa,
                  (gatilhoCandidato as any)?.score_total
                );
                setGatilhoDialog(false);
                setGatilhoCandidato(null);
                setGatilhoJustificativa("");
              }}
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Avançar com justificativa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog editar vaga */}
      <Dialog open={editarVagaOpen} onOpenChange={setEditarVagaOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Editar vaga
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Título da vaga</Label>
              <Input value={editarForm.titulo ?? ""}
                onChange={e => setEditarForm((f: any) => ({ ...f, titulo: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Área</Label>
                <Input value={editarForm.area ?? ""}
                  onChange={e => setEditarForm((f: any) => ({ ...f, area: e.target.value }))} />
              </div>
              <div>
                <Label>Nível</Label>
                <Select value={editarForm.nivel ?? ""}
                  onValueChange={v => setEditarForm((f: any) => ({ ...f, nivel: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jr">Júnior</SelectItem>
                    <SelectItem value="pl">Pleno</SelectItem>
                    <SelectItem value="sr">Sênior</SelectItem>
                    <SelectItem value="coordenacao">Coordenação</SelectItem>
                    <SelectItem value="especialista">Especialista</SelectItem>
                    <SelectItem value="c_level">C-Level</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Número de vagas */}
            <div className="space-y-1">
              <Label>Número de vagas</Label>
              <div className="flex items-center gap-3">
                <button type="button"
                  className="w-8 h-8 rounded-full border flex items-center justify-center text-lg font-medium hover:bg-muted"
                  onClick={() => setEditarForm((f: any) => ({ ...f, num_vagas: Math.max(1, (f.num_vagas ?? 1) - 1) }))}>
                  −
                </button>
                <span className="text-lg font-semibold w-8 text-center">
                  {editarForm.num_vagas ?? 1}
                </span>
                <button type="button"
                  className="w-8 h-8 rounded-full border flex items-center justify-center text-lg font-medium hover:bg-muted"
                  onClick={() => setEditarForm((f: any) => ({ ...f, num_vagas: (f.num_vagas ?? 1) + 1 }))}>
                  +
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Local de trabalho</Label>
                <Input value={editarForm.local_trabalho ?? ""}
                  onChange={e => setEditarForm((f: any) => ({ ...f, local_trabalho: e.target.value }))} />
              </div>
              <div>
                <Label>Jornada</Label>
                <Input value={editarForm.jornada ?? ""}
                  onChange={e => setEditarForm((f: any) => ({ ...f, jornada: e.target.value }))} />
              </div>
            </div>
            {/* Gestor responsável */}
            <div>
              <Label>Gestor responsável</Label>
              <Select
                value={editarForm.gestor_id || "__none__"}
                onValueChange={v => setEditarForm((f: any) => ({ ...f, gestor_id: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o gestor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sem gestor —</SelectItem>
                  {lideres.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.nome} {l.cargo ? `— ${l.cargo}` : ""}
                      <span className="text-xs text-muted-foreground ml-1">({l.tipo})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Salário mínimo</Label>
                <Input type="number" value={editarForm.salario_min ?? ""} placeholder="R$ 0"
                  onChange={e => setEditarForm((f: any) => ({ ...f, salario_min: e.target.value }))} />
              </div>
              <div>
                <Label>Salário máximo</Label>
                <Input type="number" value={editarForm.salario_max ?? ""} placeholder="R$ 0"
                  onChange={e => setEditarForm((f: any) => ({ ...f, salario_max: e.target.value }))} />
              </div>
            </div>

            {/* Skills obrigatórias */}
            <div>
              <Label>Skills obrigatórias</Label>
              <div className="flex flex-wrap gap-1.5 mb-2 min-h-[32px] p-2 border rounded-lg bg-muted/20">
                {(editarForm.skills_obrigatorias ?? []).map((s: string, i: number) => (
                  <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary text-primary-foreground">
                    {s}
                    <button type="button" onClick={() =>
                      setEditarForm((f: any) => ({
                        ...f, skills_obrigatorias: f.skills_obrigatorias.filter((_: string, idx: number) => idx !== i)
                      }))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <Input placeholder="Digite e pressione Enter para adicionar"
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) {
                      setEditarForm((f: any) => ({ ...f, skills_obrigatorias: [...(f.skills_obrigatorias ?? []), val] }));
                      (e.target as HTMLInputElement).value = "";
                    }
                  }
                }} />
            </div>

            {/* Skills desejadas */}
            <div>
              <Label>Skills desejadas</Label>
              <div className="flex flex-wrap gap-1.5 mb-2 min-h-[32px] p-2 border rounded-lg bg-muted/20">
                {(editarForm.skills_desejadas ?? []).map((s: string, i: number) => (
                  <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-info/20 text-info">
                    {s}
                    <button type="button" onClick={() =>
                      setEditarForm((f: any) => ({
                        ...f, skills_desejadas: f.skills_desejadas.filter((_: string, idx: number) => idx !== i)
                      }))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <Input placeholder="Digite e pressione Enter para adicionar"
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) {
                      setEditarForm((f: any) => ({ ...f, skills_desejadas: [...(f.skills_desejadas ?? []), val] }));
                      (e.target as HTMLInputElement).value = "";
                    }
                  }
                }} />
            </div>

            {/* Ferramentas */}
            <div>
              <Label>Ferramentas e sistemas</Label>
              <div className="flex flex-wrap gap-1.5 mb-2 min-h-[32px] p-2 border rounded-lg bg-muted/20">
                {(editarForm.ferramentas ?? []).map((s: string, i: number) => (
                  <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-accent text-accent-foreground">
                    {s}
                    <button type="button" onClick={() =>
                      setEditarForm((f: any) => ({
                        ...f, ferramentas: f.ferramentas.filter((_: string, idx: number) => idx !== i)
                      }))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <Input placeholder="Digite e pressione Enter para adicionar"
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) {
                      setEditarForm((f: any) => ({ ...f, ferramentas: [...(f.ferramentas ?? []), val] }));
                      (e.target as HTMLInputElement).value = "";
                    }
                  }
                }} />
            </div>

            {/* Descrição */}
            <div>
              <Label>Descrição / Missão da vaga</Label>
              <Textarea rows={3} value={editarForm.descricao ?? ""}
                placeholder="Descreva o contexto e o propósito desta vaga..."
                onChange={e => setEditarForm((f: any) => ({ ...f, descricao: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditarVagaOpen(false)}>Cancelar</Button>
            <Button
              disabled={!editarForm.titulo || editarVagaMutation.isPending}
              onClick={() => editarVagaMutation.mutate(editarForm)}
            >
              {editarVagaMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
              ) : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoricoCandidato({ candidatoId }: { candidatoId?: string }) {
  const { data: historico = [] } = useQuery({
    queryKey: ["candidato-historico", candidatoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidato_historico")
        .select("*")
        .eq("candidato_id", candidatoId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!candidatoId,
  });

  const stageLabel = (key: string) =>
    KANBAN_STAGES.find(s => s.key === key)?.label ?? key;

  if (!candidatoId || historico.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Nenhuma movimentação registrada.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {historico.map((h: any) => (
        <div key={h.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
            <div className="w-px flex-1 bg-border mt-1" />
          </div>
          <div className="pb-3 flex-1 min-w-0">
            <p className="text-sm">
              <span className="text-muted-foreground">
                {stageLabel(h.status_anterior ?? "")}
              </span>
              {" → "}
              <span className="font-medium">{stageLabel(h.status_novo)}</span>
            </p>
            {h.justificativa && (
              <div className="mt-1.5 p-2 rounded-md bg-amber-50 border border-amber-100">
                <p className="text-xs text-amber-800">
                  <span className="font-medium">Exceção: </span>
                  {h.justificativa}
                </p>
                {h.score_no_momento != null && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    Score no momento: {h.score_no_momento}%
                  </p>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(h.created_at).toLocaleDateString("pt-BR", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit"
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function FormularioEntrevista({
  candidatoId,
  vagaId,
  tipo,
  readOnly = false,
  candidato,
  vaga,
}: {
  candidatoId: string;
  vagaId: string;
  tipo: "rh" | "gestor";
  readOnly?: boolean;
  candidato?: any;
  vaga?: any;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    impressao_geral: 0,
    fit_cultural: 0,
    pontos_fortes: "",
    pontos_atencao: "",
    recomendacao: "",
    observacoes: "",
  });

  const [gerandoResumo, setGerandoResumo] = useState(false);
  const [resumoIA, setResumoIA] = useState<{
    resumo: string;
    pontos_fortes: string[];
    pontos_atencao: string[];
    recomendacao_ia: string;
    score_fit: number;
  } | null>(null);

  const { data: entrevista, isLoading } = useQuery({
    queryKey: ["entrevista", candidatoId, tipo],
    queryFn: async () => {
      const { data } = await supabase
        .from("entrevistas_candidato")
        .select("*")
        .eq("candidato_id", candidatoId)
        .eq("vaga_id", vagaId)
        .eq("tipo", tipo)
        .maybeSingle();
      return data;
    },
    enabled: !!candidatoId && !!vagaId,
  });

  useEffect(() => {
    if (entrevista) {
      setForm({
        impressao_geral: (entrevista as any).impressao_geral ?? 0,
        fit_cultural: (entrevista as any).fit_cultural ?? 0,
        pontos_fortes: (entrevista as any).pontos_fortes ?? "",
        pontos_atencao: (entrevista as any).pontos_atencao ?? "",
        recomendacao: (entrevista as any).recomendacao ?? "",
        observacoes: (entrevista as any).observacoes ?? "",
      });
    }
  }, [entrevista]);

  async function salvar() {
    if (!form.impressao_geral || !form.fit_cultural || !form.recomendacao) {
      toast.error("Preencha impressão geral, fit cultural e recomendação.");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase
        .from("entrevistas_candidato")
        .upsert({
          candidato_id: candidatoId,
          vaga_id: vagaId,
          tipo,
          impressao_geral: form.impressao_geral,
          fit_cultural: form.fit_cultural,
          pontos_fortes: form.pontos_fortes || null,
          pontos_atencao: form.pontos_atencao || null,
          recomendacao: form.recomendacao,
          observacoes: form.observacoes || null,
          preenchido_por: user?.id || null,
          updated_at: new Date().toISOString(),
        } as any, {
          onConflict: "candidato_id,vaga_id,tipo",
        });
      if (error) throw error;
      toast.success("Formulário salvo!");
      queryClient.invalidateQueries({ queryKey: ["entrevista", candidatoId, tipo] });
      queryClient.invalidateQueries({ queryKey: ["entrevista-rh", vagaId] });
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function gerarResumoIA() {
    if (!candidato) return;
    setGerandoResumo(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-candidato", {
        body: {
          candidato: {
            nome: candidato.nome,
            experiencias: candidato.experiencias ?? [],
            formacoes: candidato.formacoes ?? [],
            skills_candidato: candidato.skills_candidato ?? [],
            sistemas_candidato: candidato.sistemas_candidato ?? [],
            score_total: candidato.score_total ?? 0,
            mensagem: candidato.mensagem ?? "",
          },
          vaga: {
            titulo: vaga?.titulo ?? "",
            skills_obrigatorias: vaga?.skills_obrigatorias ?? [],
            skills_desejadas: vaga?.skills_desejadas ?? [],
          },
          tipo,
        },
      });
      if (error) throw error;

      setResumoIA(data);
      // Pre-fill empty fields with AI analysis (still editable)
      setForm(f => ({
        ...f,
        pontos_fortes: f.pontos_fortes || data.pontos_fortes?.join("\n") || "",
        pontos_atencao: f.pontos_atencao || data.pontos_atencao?.join("\n") || "",
        recomendacao: f.recomendacao || data.recomendacao_ia || "",
      }));
    } catch (e: any) {
      console.error("Erro ao gerar resumo:", e);
      toast.error("Não foi possível gerar o resumo. Preencha manualmente.");
    } finally {
      setGerandoResumo(false);
    }
  }

  // Auto-generate AI summary when form opens for the first time without saved data
  useEffect(() => {
    if (!entrevista && candidato && !gerandoResumo && !resumoIA && !readOnly && !isLoading) {
      gerarResumoIA();
    }
  }, [entrevista, candidato, isLoading]);

  const titulo = tipo === "rh" ? "Entrevista RH" : "Entrevista Gestor";
  const corTema = tipo === "rh" ? "#2563EB" : "#7C3AED";

  const StarRating = ({ value, onChange, disabled }: { value: number; onChange?: (v: number) => void; disabled?: boolean }) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onChange?.(n)}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
            n <= value
              ? "text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
          style={n <= value ? { backgroundColor: corTema } : undefined}
        >
          {n}
        </button>
      ))}
    </div>
  );

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: corTema }} />
        <p className="text-sm font-semibold">{titulo}</p>
        {entrevista && (
          <span className="text-xs text-muted-foreground ml-auto">
            Preenchido em {new Date((entrevista as any).updated_at).toLocaleDateString("pt-BR")}
          </span>
        )}
      </div>

      {/* Resumo da IA */}
      {(gerandoResumo || resumoIA) && (
        <div className="rounded-lg border p-3 space-y-2"
          style={{ borderColor: corTema + "40", backgroundColor: corTema + "08" }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold flex items-center gap-1.5"
              style={{ color: corTema }}>
              <Sparkles className="h-3.5 w-3.5" />
              Pré-análise por IA
            </p>
            {!gerandoResumo && (
              <button
                type="button"
                onClick={gerarResumoIA}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Atualizar
              </button>
            )}
          </div>
          {gerandoResumo ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Analisando perfil do candidato...
              </p>
            </div>
          ) : resumoIA && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Fit com a vaga</p>
                <span className="text-sm font-semibold" style={{ color:
                  resumoIA.score_fit >= 70 ? "#1A4A3A" :
                  resumoIA.score_fit >= 40 ? "#D97706" : "#DC2626"
                }}>
                  {resumoIA.score_fit}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {resumoIA.resumo}
              </p>
              {resumoIA.pontos_fortes?.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: "#1A4A3A" }}>
                    Pontos fortes identificados
                  </p>
                  <ul className="space-y-0.5">
                    {resumoIA.pontos_fortes.map((p: string, i: number) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                        <span style={{ color: "#1A4A3A" }}>·</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {resumoIA.pontos_atencao?.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1 text-amber-600">
                    Pontos de atenção
                  </p>
                  <ul className="space-y-0.5">
                    {resumoIA.pontos_atencao.map((p: string, i: number) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                        <span className="text-amber-500">·</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-center gap-2 pt-1 border-t"
                style={{ borderColor: corTema + "30" }}>
                <p className="text-xs text-muted-foreground">Sugestão da IA:</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  resumoIA.recomendacao_ia === "avançar"
                    ? "bg-[#D8F3DC] text-[#1A4A3A]"
                    : resumoIA.recomendacao_ia === "aguardar"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"
                }`}>
                  {resumoIA.recomendacao_ia === "avançar" ? "✓ Avançar" :
                   resumoIA.recomendacao_ia === "aguardar" ? "⏳ Aguardar" : "✗ Não avançar"}
                </span>
                <p className="text-xs text-muted-foreground ml-auto italic">
                  Você decide
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Impressão geral *</Label>
        <StarRating
          value={form.impressao_geral}
          onChange={v => !readOnly && setForm(f => ({ ...f, impressao_geral: v }))}
          disabled={readOnly}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Fit cultural *</Label>
        <StarRating
          value={form.fit_cultural}
          onChange={v => !readOnly && setForm(f => ({ ...f, fit_cultural: v }))}
          disabled={readOnly}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Pontos fortes observados</Label>
        <Textarea
          value={form.pontos_fortes}
          rows={2}
          className="resize-none text-sm"
          placeholder="O que chamou atenção positivamente..."
          disabled={readOnly}
          onChange={e => setForm(f => ({ ...f, pontos_fortes: e.target.value }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Pontos de atenção</Label>
        <Textarea
          value={form.pontos_atencao}
          rows={2}
          className="resize-none text-sm"
          placeholder="Dúvidas ou preocupações levantadas..."
          disabled={readOnly}
          onChange={e => setForm(f => ({ ...f, pontos_atencao: e.target.value }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Recomendação *</Label>
        <div className="flex gap-2">
          {[
            { value: "avançar", label: "✅ Avançar", cor: "#1A4A3A" },
            { value: "aguardar", label: "⏳ Aguardar", cor: "#D97706" },
            { value: "nao_avançar", label: "❌ Não avançar", cor: "#DC2626" },
          ].map(op => (
            <button
              key={op.value}
              type="button"
              disabled={readOnly}
              onClick={() => !readOnly && setForm(f => ({ ...f, recomendacao: op.value }))}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                form.recomendacao === op.value
                  ? "text-white border-transparent"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              }`}
              style={form.recomendacao === op.value ? { backgroundColor: op.cor } : undefined}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Observações livres</Label>
        <Textarea
          value={form.observacoes}
          rows={3}
          className="resize-none text-sm"
          placeholder="Anotações adicionais para o processo..."
          disabled={readOnly}
          onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
        />
      </div>

      {!readOnly && (
        <Button
          className="w-full text-white"
          style={{ backgroundColor: corTema }}
          disabled={salvando || !form.impressao_geral || !form.fit_cultural || !form.recomendacao}
          onClick={salvar}
        >
          {salvando ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
          ) : entrevista ? "Atualizar formulário" : "Salvar formulário"}
        </Button>
      )}
    </div>
  );
}

function TesteTecnico({
  candidatoId,
  vagaId,
  candidato,
  vaga,
}: {
  candidatoId: string;
  vagaId: string;
  candidato: any;
  vaga: any;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [fase, setFase] = useState<"desafio" | "resultado">("desafio");

  const [formDesafio, setFormDesafio] = useState({
    desafio_contexto: "",
    desafio_descricao: "",
    desafio_entregaveis: "",
    desafio_criterios: "",
    prazo_entrega: "",
  });

  const [formResultado, setFormResultado] = useState({
    link_entrega: "",
    nota: 0,
    pontos_avaliados: "",
    resultado: "",
    skills_validadas: [] as { skill: string; nivel_declarado: string; resultado: string; observacao: string }[],
  });

  const { data: teste, isLoading } = useQuery({
    queryKey: ["teste-tecnico", candidatoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("testes_tecnicos" as any)
        .select("*")
        .eq("candidato_id", candidatoId)
        .eq("vaga_id", vagaId)
        .maybeSingle();
      return data;
    },
    enabled: !!candidatoId && !!vagaId,
  });

  useEffect(() => {
    if (teste) {
      setFormDesafio({
        desafio_contexto: (teste as any).desafio_contexto ?? "",
        desafio_descricao: (teste as any).desafio_descricao ?? "",
        desafio_entregaveis: (teste as any).desafio_entregaveis ?? "",
        desafio_criterios: (teste as any).desafio_criterios ?? "",
        prazo_entrega: (teste as any).prazo_entrega ?? "",
      });
      setFormResultado({
        link_entrega: (teste as any).link_entrega ?? "",
        nota: (teste as any).nota ?? 0,
        pontos_avaliados: (teste as any).pontos_avaliados ?? "",
        resultado: (teste as any).resultado ?? "",
        skills_validadas: (teste as any).skills_validadas?.length > 0
          ? (teste as any).skills_validadas
          : ((teste as any).skills_a_validar ?? []).map((s: any) => ({
              skill: s.skill,
              nivel_declarado: s.nivel_declarado,
              resultado: "",
              observacao: "",
            })),
      });
      if ((teste as any).enviado_em) setFase("resultado");
    }
  }, [teste]);

  const prazoVencido = (teste as any)?.prazo_entrega
    ? new Date((teste as any).prazo_entrega + "T23:59:59") < new Date()
    : false;

  const jaEntregou = !!(teste as any)?.entregue_em;

  function extrairDominio(url: string): string {
    try { return new URL(url).hostname.replace("www.", ""); } catch { return "link externo"; }
  }

  async function gerarDesafioIA() {
    setGerando(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-candidato", {
        body: {
          candidato: {
            nome: candidato?.nome ?? "",
            experiencias: (candidato as any)?.experiencias ?? [],
            skills_candidato: (candidato as any)?.skills_candidato ?? [],
            sistemas_candidato: (candidato as any)?.sistemas_candidato ?? [],
          },
          vaga: {
            titulo: vaga?.titulo ?? "",
            nivel: (vaga as any)?.nivel ?? "",
            area: (vaga as any)?.area ?? "",
            skills_obrigatorias: (vaga as any)?.skills_obrigatorias ?? [],
            skills_desejadas: (vaga as any)?.skills_desejadas ?? [],
            responsabilidades: (vaga as any)?.responsabilidades ?? [],
          },
          tipo: "teste_tecnico",
        },
      });

      if (error) throw error;

      if (data?.contexto) {
        setFormDesafio(f => ({
          ...f,
          desafio_contexto: data.contexto || "",
          desafio_descricao: data.descricao || "",
          desafio_entregaveis: data.entregaveis || "",
          desafio_criterios: data.criterios || "",
        }));
        // Salvar desafio completo + skills_a_validar no banco de uma vez
        // Evita que o invalidateQueries sobrescreva o formDesafio
        await supabase
          .from("testes_tecnicos" as any)
          .upsert({
            candidato_id: candidatoId,
            vaga_id: vagaId,
            desafio_contexto: data.contexto || null,
            desafio_descricao: data.descricao || null,
            desafio_entregaveis: data.entregaveis || null,
            desafio_criterios: data.criterios || null,
            skills_a_validar: data.skills_a_validar ?? [],
            updated_at: new Date().toISOString(),
          } as any, { onConflict: "candidato_id,vaga_id" });
        // Invalidar DEPOIS de salvar tudo — o useEffect vai
        // carregar os dados corretos do banco
        queryClient.invalidateQueries({ queryKey: ["teste-tecnico", candidatoId] });
        toast.success("Desafio gerado! Revise e defina o prazo antes de enviar.");
      } else {
        toast.error("Resposta inesperada da IA. Preencha manualmente.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar desafio. Preencha manualmente.");
    } finally {
      setGerando(false);
    }
  }

  async function salvarDesafio() {
    if (!formDesafio.desafio_descricao || !formDesafio.prazo_entrega) {
      toast.error("Preencha a descrição do desafio e o prazo.");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase
        .from("testes_tecnicos" as any)
        .upsert({
          candidato_id: candidatoId,
          vaga_id: vagaId,
          ...formDesafio,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "candidato_id,vaga_id" });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["teste-tecnico", candidatoId] });
      toast.success("Desafio salvo!");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function enviarDesafio() {
    if (!candidato?.email) {
      toast.error("Candidato sem e-mail cadastrado.");
      return;
    }
    if (!formDesafio.desafio_descricao || !formDesafio.prazo_entrega) {
      toast.error("Salve o desafio antes de enviar.");
      return;
    }
    setEnviando(true);
    try {
      await supabase.from("testes_tecnicos" as any).upsert({
        candidato_id: candidatoId,
        vaga_id: vagaId,
        ...formDesafio,
        enviado_em: new Date().toISOString(),
        enviado_por: user?.id || null,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "candidato_id,vaga_id" });

      const emailResult = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "teste-tecnico-candidato",
          recipientEmail: candidato.email,
          idempotencyKey: `teste-tecnico-${candidatoId}-${Date.now()}`,
          templateData: {
            nome: candidato.nome,
            cargo: vaga?.titulo ?? "",
            contexto: formDesafio.desafio_contexto,
            descricao: formDesafio.desafio_descricao,
            entregaveis: formDesafio.desafio_entregaveis,
            criterios: formDesafio.desafio_criterios,
            prazo: (() => { if (!formDesafio.prazo_entrega) return ""; const parts = formDesafio.prazo_entrega.split("-"); if (parts.length !== 3) return formDesafio.prazo_entrega; const [ano, mes, dia] = parts; return `${dia}/${mes}/${ano}`; })(),
            link_portal: publicUrl(`/vagas/${vagaId}`),
          },
        },
      });

      queryClient.invalidateQueries({ queryKey: ["teste-tecnico", candidatoId] });
      setFase("resultado");
      if (emailResult.error) {
        console.error("Erro ao enviar e-mail:", emailResult.error);
        toast.warning(`Desafio salvo mas e-mail não enviado: ${emailResult.error.message}. Tente reenviar.`);
      } else {
        toast.success(`Desafio enviado para ${candidato.email}!`);
      }
    } catch (e: any) {
      toast.error("Erro ao enviar: " + e.message);
    } finally {
      setEnviando(false);
    }
  }

  async function reenviarDesafio() {
    if (!candidato?.email) {
      toast.error("Candidato sem e-mail cadastrado.");
      return;
    }
    if (!teste) {
      toast.error("Dados do teste não carregados. Tente novamente.");
      return;
    }
    setEnviando(true);
    try {
      const prazoFormatado = (teste as any).prazo_entrega
        ? (() => {
            const [ano, mes, dia] = ((teste as any).prazo_entrega as string).split("-");
            return `${dia}/${mes}/${ano}`;
          })()
        : "";

      const emailResult = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "teste-tecnico-candidato",
          recipientEmail: candidato.email,
          idempotencyKey: `teste-tecnico-reenvio-${candidatoId}-${Date.now()}`,
          templateData: {
            nome: candidato.nome,
            cargo: vaga?.titulo ?? "",
            contexto: (teste as any).desafio_contexto ?? "",
            descricao: (teste as any).desafio_descricao ?? "",
            entregaveis: (teste as any).desafio_entregaveis ?? "",
            criterios: (teste as any).desafio_criterios ?? "",
            prazo: prazoFormatado,
            link_portal: publicUrl(`/vagas/${vagaId}`),
          },
        },
      });
      if (emailResult.error) {
        toast.error("Erro ao reenviar e-mail: " + humanizeError(emailResult.error.message));
      } else {
        toast.success(`Teste reenviado para ${candidato.email}!`);
      }
    } catch (e: any) {
      toast.error("Erro ao reenviar: " + e.message);
    } finally {
      setEnviando(false);
    }
  }

  async function salvarResultado() {
    if (!formResultado.resultado) {
      toast.error("Selecione o resultado antes de salvar.");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase
        .from("testes_tecnicos" as any)
        .update({
          ...formResultado,
          avaliado_em: new Date().toISOString(),
          avaliado_por: user?.id || null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("candidato_id", candidatoId)
        .eq("vaga_id", vagaId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["teste-tecnico", candidatoId] });
      queryClient.invalidateQueries({ queryKey: ["testes-tecnicos-vaga", vagaId] });
      toast.success("Resultado registrado!");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSalvando(false);
    }
  }

  if (isLoading) return <div className="flex items-center gap-2 py-4"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm text-muted-foreground">Carregando...</span></div>;

  const corTema = "#0891B2";
  const jaEnviado = !!(teste as any)?.enviado_em;

  const StarRating = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors border"
          style={n <= value ? { backgroundColor: corTema, color: "white", borderColor: corTema } : { borderColor: "#E5E7EB", color: "#6B7280" }}
        >
          {n}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4" style={{ color: corTema }} />
          <p className="text-sm font-semibold">Teste Técnico</p>
        </div>
        {jaEnviado && (
          <Badge variant="outline" className="text-xs">
            Enviado em {new Date((teste as any).enviado_em).toLocaleDateString("pt-BR")}
          </Badge>
        )}
      </div>

      {/* Toggle Desafio / Resultado */}
      {jaEnviado && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setFase("desafio")}
            className="px-3 py-1 rounded-full text-xs border transition-colors"
            style={fase === "desafio"
              ? { backgroundColor: corTema, color: "white", borderColor: corTema }
              : { borderColor: "#E5E7EB", color: "#6B7280" }}>
            Desafio enviado
          </button>
          <button type="button" onClick={() => setFase("resultado")}
            className="px-3 py-1 rounded-full text-xs border transition-colors"
            style={fase === "resultado"
              ? { backgroundColor: corTema, color: "white", borderColor: corTema }
              : { borderColor: "#E5E7EB", color: "#6B7280" }}>
            {jaEntregou
              ? "Resultado • Entrega ✓"
              : prazoVencido
                ? "Resultado • Sem entrega ⚠"
                : "Registrar resultado"}
          </button>
        </div>
      )}

      {/* Botão reenviar — disponível quando já foi enviado */}
      {jaEnviado && fase === "desafio" && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
          <div>
            <p className="text-xs font-medium">Desafio enviado</p>
            <p className="text-xs text-muted-foreground">
              {new Date((teste as any).enviado_em).toLocaleDateString("pt-BR", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit"
              })}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={enviando}
            onClick={reenviarDesafio}
          >
            {enviando
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Reenviando...</>
              : <>↩ Reenviar</>}
          </Button>
        </div>
      )}

      {/* FASE: DESAFIO */}
      {fase === "desafio" && (
        <div className="space-y-3">
          {!jaEnviado && (
            <Button variant="outline" size="sm" disabled={gerando} onClick={gerarDesafioIA}
              className="w-full">
              {gerando ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" />Gerando desafio com IA...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-1" />Gerar desafio com IA</>
              )}
            </Button>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Contexto *</Label>
            <Textarea value={formDesafio.desafio_contexto} rows={2} className="resize-none text-sm"
              placeholder="Cenário/problema que o candidato vai resolver..."
              disabled={jaEnviado}
              onChange={e => setFormDesafio(f => ({ ...f, desafio_contexto: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Desafio *</Label>
            <Textarea value={formDesafio.desafio_descricao} rows={3} className="resize-none text-sm"
              placeholder="O que o candidato deve fazer..."
              disabled={jaEnviado}
              onChange={e => setFormDesafio(f => ({ ...f, desafio_descricao: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Entregáveis</Label>
            <Textarea value={formDesafio.desafio_entregaveis} rows={2} className="resize-none text-sm"
              placeholder="O que deve ser entregue e em qual formato..."
              disabled={jaEnviado}
              onChange={e => setFormDesafio(f => ({ ...f, desafio_entregaveis: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Critérios de avaliação</Label>
            <Textarea value={formDesafio.desafio_criterios} rows={2} className="resize-none text-sm"
              placeholder="Como o trabalho será avaliado..."
              disabled={jaEnviado}
              onChange={e => setFormDesafio(f => ({ ...f, desafio_criterios: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Prazo de entrega *</Label>
            <Input type="date" value={formDesafio.prazo_entrega} disabled={jaEnviado}
              min={new Date().toISOString().split("T")[0]}
              onChange={e => setFormDesafio(f => ({ ...f, prazo_entrega: e.target.value }))} />
          </div>

          {!jaEnviado && (
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={salvando} onClick={salvarDesafio}>
                {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Salvar rascunho
              </Button>
              <Button size="sm" disabled={enviando || !formDesafio.desafio_descricao || !formDesafio.prazo_entrega}
                style={{ backgroundColor: corTema }} className="text-white"
                onClick={enviarDesafio}>
                {enviando
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Enviando...</>
                  : <><Mail className="h-4 w-4 mr-1" />Enviar para {candidato?.nome?.split(" ")[0]}</>}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* FASE: RESULTADO */}
      {fase === "resultado" && (
        <div className="space-y-3">
          {/* Card de status da entrega */}
          {jaEntregou ? (
            <div className="p-3 rounded-lg border space-y-2" style={{ backgroundColor: "#F0FFF4", borderColor: "#1A4A3A40" }}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: "#1A4A3A" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "#1A4A3A" }}>Entrega recebida</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date((teste as any).entregue_em).toLocaleDateString("pt-BR", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit"
                    })}
                    {formResultado.link_entrega && (
                      <> · {formResultado.link_entrega.includes("supabase") ? "📎 Arquivo enviado" : extrairDominio(formResultado.link_entrega)}</>
                    )}
                  </p>
                </div>
                {formResultado.link_entrega && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => window.open(formResultado.link_entrega, "_blank")}>
                    <ExternalLink className="h-3 w-3" />
                    {formResultado.link_entrega.includes("supabase") ? "Abrir arquivo" : "Abrir entrega"}
                  </Button>
                )}
              </div>
            </div>
          ) : prazoVencido ? (
            <div className="p-3 rounded-lg border space-y-1" style={{ backgroundColor: "#FEF2F2", borderColor: "#DC262640" }}>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: "#DC2626" }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: "#DC2626" }}>Prazo vencido — entrega não recebida</p>
                  <p className="text-xs text-muted-foreground">
                    Prazo era {(() => { const [a,m,d] = ((teste as any).prazo_entrega as string).split("-"); return `${d}/${m}/${a}`; })()}
                  </p>
                </div>
              </div>
            </div>
          ) : (teste as any)?.prazo_entrega ? (
            <div className="p-3 rounded-lg border space-y-1" style={{ backgroundColor: "#FFFBEB", borderColor: "#D9770640" }}>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 flex-shrink-0" style={{ color: "#D97706" }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: "#D97706" }}>Aguardando entrega</p>
                  <p className="text-xs text-muted-foreground">
                    Prazo: {(() => { const [a,m,d] = ((teste as any).prazo_entrega as string).split("-"); return `${d}/${m}/${a}`; })()}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {/* Link da entrega — só mostra input se NÃO tem entrega (preenchimento manual pelo RH) */}
          {!jaEntregou && (
            <div className="space-y-1.5">
              <Label className="text-xs">Link da entrega</Label>
              <Input value={formResultado.link_entrega} placeholder="Drive, Notion, GitHub, etc."
                onChange={e => setFormResultado(f => ({ ...f, link_entrega: e.target.value }))} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Nota geral</Label>
            <StarRating value={formResultado.nota}
              onChange={v => setFormResultado(f => ({ ...f, nota: v }))} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Pontos avaliados</Label>
            <Textarea value={formResultado.pontos_avaliados} rows={3} className="resize-none text-sm"
              placeholder="O que se destacou na entrega? O que ficou abaixo do esperado?"
              onChange={e => setFormResultado(f => ({ ...f, pontos_avaliados: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Resultado *</Label>
            <div className="flex gap-2">
              {[
                { value: "aprovado", label: "✅ Aprovado", cor: "#1A4A3A" },
                { value: "pendente", label: "⏳ Pendente", cor: "#D97706" },
                { value: "reprovado", label: "❌ Reprovado", cor: "#DC2626" },
              ].map(op => (
                <button key={op.value} type="button"
                  onClick={() => setFormResultado(f => ({ ...f, resultado: op.value }))}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                  style={formResultado.resultado === op.value
                    ? { backgroundColor: op.cor, color: "white", borderColor: op.cor }
                    : { borderColor: "#E5E7EB", color: "#6B7280" }}>
                  {op.label}
                </button>
              ))}
            </div>
          </div>

          {/* Validação de skills */}
          {formResultado.skills_validadas.length > 0 && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Validação de skills declaradas</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Com base na entrega, confirme se as skills declaradas pelo candidato são reais.
                </p>
              </div>
              {formResultado.skills_validadas.map((sv, i) => {
                const skillInfo = (teste as any)?.skills_a_validar?.find(
                  (s: any) => s.skill === sv.skill
                );
                return (
                  <div key={i} className="p-3 rounded-lg border space-y-2"
                    style={{
                      borderColor: sv.resultado === "confirmado" ? "#1A4A3A40" :
                        sv.resultado === "parcial" ? "#D9770640" :
                        sv.resultado === "nao_confirmado" ? "#DC262640" :
                        "var(--color-border-tertiary)",
                      backgroundColor: sv.resultado === "confirmado" ? "#F0FFF4" :
                        sv.resultado === "parcial" ? "#FFFBEB" :
                        sv.resultado === "nao_confirmado" ? "#FEF2F2" :
                        undefined,
                    }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold">{sv.skill}</p>
                        <p className="text-xs text-muted-foreground">
                          Declarado: <span className="capitalize">{sv.nivel_declarado}</span>
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {[
                          { value: "confirmado", label: "✓", title: "Confirmado", cor: "#1A4A3A" },
                          { value: "parcial", label: "~", title: "Parcial", cor: "#D97706" },
                          { value: "nao_confirmado", label: "✗", title: "Não confirmado", cor: "#DC2626" },
                        ].map(op => (
                          <button key={op.value} type="button"
                            title={op.title}
                            onClick={() => {
                              const arr = [...formResultado.skills_validadas];
                              arr[i] = { ...arr[i], resultado: op.value };
                              setFormResultado(f => ({ ...f, skills_validadas: arr }));
                            }}
                            className="w-7 h-7 rounded-full text-xs font-bold border transition-colors"
                            style={sv.resultado === op.value
                              ? { backgroundColor: op.cor, color: "white", borderColor: op.cor }
                              : { borderColor: "#E5E7EB", color: "#9CA3AF" }}>
                            {op.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {skillInfo?.como_validar && (
                      <p className="text-xs text-muted-foreground italic border-t pt-2">
                        Como foi testada: {skillInfo.como_validar}
                      </p>
                    )}
                    <Input
                      value={sv.observacao}
                      className="h-7 text-xs"
                      placeholder="Observação opcional..."
                      onChange={e => {
                        const arr = [...formResultado.skills_validadas];
                        arr[i] = { ...arr[i], observacao: e.target.value };
                        setFormResultado(f => ({ ...f, skills_validadas: arr }));
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <Button className="w-full text-white" style={{ backgroundColor: corTema }}
            disabled={salvando || !formResultado.resultado}
            onClick={salvarResultado}>
            {salvando
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</>
              : teste && (teste as any).avaliado_em
                ? "Atualizar resultado"
                : "Registrar resultado"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ModuloOferta({
  candidatoId,
  vagaId,
  candidato,
  vaga,
  canSeeFaixa,
}: {
  candidatoId: string;
  vagaId: string;
  candidato: any;
  vaga: any;
  canSeeFaixa: boolean;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const faixaTipo = vaga?.tipo_contrato === "pj" ? "pj" : "clt";
  const faixaMinEfetiva = vaga?.faixa_min ?? (vaga as any)?.cargos?.[`faixa_${faixaTipo}_f1_min`] ?? null;
  const faixaMaxEfetiva = vaga?.faixa_max ?? (vaga as any)?.cargos?.[`faixa_${faixaTipo}_f1_max`] ?? null;
  const faixaF5Max = (vaga as any)?.cargos?.[`faixa_${faixaTipo}_f5_max`] ?? null;

  const [form, setForm] = useState({
    tipo_contrato: "clt",
    salario_proposto: "",
    data_inicio: "",
    beneficios: "",
    observacoes: "",
    status: "em_negociacao",
  });

  const { data: oferta } = useQuery({
    queryKey: ["oferta-candidato", candidatoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ofertas_candidato" as any)
        .select("*")
        .eq("candidato_id", candidatoId)
        .eq("vaga_id", vagaId)
        .maybeSingle();
      return data;
    },
    enabled: !!candidatoId && !!vagaId,
  });

  useEffect(() => {
    if (oferta) {
      setForm({
        tipo_contrato: (oferta as any).tipo_contrato ?? "clt",
        salario_proposto: (oferta as any).salario_proposto?.toString() ?? "",
        data_inicio: (oferta as any).data_inicio ?? "",
        beneficios: (oferta as any).beneficios ?? "",
        observacoes: (oferta as any).observacoes ?? "",
        status: (oferta as any).status ?? "em_negociacao",
      });
    }
  }, [oferta]);

  async function salvarOferta() {
    setSalvando(true);
    if (form.salario_proposto && faixaF5Max && Number(form.salario_proposto) > Number(faixaF5Max)) {
      toast.error("Salário proposto está acima do topo da faixa salarial do cargo (F5). Não é permitido.");
      setSalvando(false);
      return;
    }
    try {
      const { error } = await supabase
        .from("ofertas_candidato" as any)
        .upsert({
          candidato_id: candidatoId,
          vaga_id: vagaId,
          tipo_contrato: form.tipo_contrato,
          salario_proposto: form.salario_proposto ? Number(form.salario_proposto) : null,
          data_inicio: form.data_inicio || null,
          beneficios: form.beneficios || null,
          observacoes: form.observacoes || null,
          status: form.status,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "candidato_id,vaga_id" });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["oferta-candidato", candidatoId] });
      queryClient.invalidateQueries({ queryKey: ["ofertas-vaga", vagaId] });
      toast.success("Proposta salva!");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function enviarProposta() {
    if (!candidato?.email) {
      toast.error("Candidato sem e-mail cadastrado.");
      return;
    }
    setEnviando(true);
    if (form.salario_proposto && faixaF5Max && Number(form.salario_proposto) > Number(faixaF5Max)) {
      toast.error("Salário proposto está acima do topo da faixa salarial do cargo (F5). Não é permitido.");
      setEnviando(false);
      return;
    }
    try {
      const { error: saveError } = await supabase
        .from("ofertas_candidato" as any)
        .upsert({
          candidato_id: candidatoId,
          vaga_id: vagaId,
          tipo_contrato: form.tipo_contrato,
          salario_proposto: form.salario_proposto ? Number(form.salario_proposto) : null,
          data_inicio: form.data_inicio || null,
          beneficios: form.beneficios || null,
          observacoes: form.observacoes || null,
          status: "em_negociacao",
          enviado_em: new Date().toISOString(),
          enviado_por: user?.id || null,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "candidato_id,vaga_id" });
      if (saveError) throw saveError;

      const emailResult = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "proposta-candidato",
          recipientEmail: candidato.email,
          idempotencyKey: `proposta-${candidatoId}-${Date.now()}`,
          templateData: {
            nome: candidato.nome,
            cargo: vaga?.titulo ?? "",
            tipo_contrato: form.tipo_contrato.toUpperCase(),
            salario: form.salario_proposto
              ? `R$ ${Number(form.salario_proposto).toLocaleString("pt-BR")}`
              : null,
            data_inicio: form.data_inicio
              ? (() => {
                  const [ano, mes, dia] = form.data_inicio.split("-");
                  return `${dia}/${mes}/${ano}`;
                })()
              : null,
            beneficios: form.beneficios || null,
            observacoes: form.observacoes || null,
          },
        },
      });

      if (emailResult.error) {
        toast.warning("Proposta salva mas e-mail não enviado: " + emailResult.error.message);
      } else {
        toast.success(`Proposta enviada para ${candidato.email}!`);
      }

      queryClient.invalidateQueries({ queryKey: ["oferta-candidato", candidatoId] });
      queryClient.invalidateQueries({ queryKey: ["ofertas-vaga", vagaId] });
    } catch (e: any) {
      toast.error("Erro ao enviar proposta: " + e.message);
    } finally {
      setEnviando(false);
    }
  }

  async function atualizarStatus(novoStatus: string) {
    try {
      const { error } = await supabase
        .from("ofertas_candidato" as any)
        .update({
          status: novoStatus,
          respondido_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("candidato_id", candidatoId)
        .eq("vaga_id", vagaId);
      if (error) throw error;
      setForm(f => ({ ...f, status: novoStatus }));
      queryClient.invalidateQueries({ queryKey: ["oferta-candidato", candidatoId] });
      queryClient.invalidateQueries({ queryKey: ["ofertas-vaga", vagaId] });
      toast.success(
        novoStatus === "aceita" ? "Proposta marcada como aceita!" : "Proposta marcada como recusada."
      );
    } catch (e: any) {
      toast.error("Erro ao atualizar status: " + e.message);
    }
  }

  const jaEnviada = !!(oferta as any)?.enviado_em;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm" style={{ backgroundColor: "#D97706" }}>
            <ClipboardList className="h-4 w-4" />
          </div>
          <p className="text-sm font-semibold">Proposta de oferta</p>
        </div>
        {jaEnviada && (
          <span className="text-xs text-muted-foreground">
            Enviada em {new Date((oferta as any).enviado_em).toLocaleDateString("pt-BR")}
          </span>
        )}
      </div>

      {/* Status badges quando já enviada */}
      {jaEnviada && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Status da proposta</p>
          <div className="flex gap-2">
            {[
              { value: "em_negociacao", label: "⏳ Em negociação", cor: "#D97706" },
              { value: "aceita", label: "✅ Aceita", cor: "#1A4A3A" },
              { value: "recusada", label: "❌ Recusada", cor: "#DC2626" },
            ].map(op => (
              <button key={op.value}
                onClick={() => atualizarStatus(op.value)}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                style={form.status === op.value
                  ? { backgroundColor: op.cor, color: "white", borderColor: op.cor }
                  : { borderColor: "#E5E7EB", color: "#6B7280" }}>
                {op.label}
              </button>
            ))}
          </div>

          {form.status === "recusada" && (
            <div className="p-3 rounded-lg border" style={{ backgroundColor: "#FEF2F2", borderColor: "#FECACA" }}>
              <p className="text-xs font-medium" style={{ color: "#DC2626" }}>Proposta recusada</p>
              <div className="mt-2">
                <Button variant="outline" size="sm" className="text-xs"
                  onClick={() => atualizarStatus("em_negociacao")}>
                  Reabrir negociação
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Formulário */}
      <div className="space-y-3">
        {/* Tipo contrato */}
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo de contrato</Label>
          <Select value={form.tipo_contrato} onValueChange={v => setForm(f => ({ ...f, tipo_contrato: v }))}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clt">CLT</SelectItem>
              <SelectItem value="pj">PJ</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Salário */}
        {canSeeFaixa && (
          <div className="space-y-2">
            <Label className="text-xs">
              {form.tipo_contrato === "pj" ? "Honorários propostos (R$)" : "Salário proposto (R$)"}
            </Label>
            {(faixaMinEfetiva || faixaMaxEfetiva) && (
              <div className="p-3 rounded-lg border space-y-2" style={{ backgroundColor: "#F0F7F4", borderColor: "#1A4A3A20" }}>
                <p className="text-xs font-semibold" style={{ color: "#1A4A3A" }}>Faixa salarial do cargo</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">F1 (entrada)</p>
                    <p className="text-sm font-semibold" style={{ color: "#1A4A3A" }}>
                      R$ {Number(faixaMinEfetiva ?? 0).toLocaleString("pt-BR")} – R$ {Number(faixaMaxEfetiva ?? 0).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  {faixaF5Max && (
                    <div>
                      <p className="text-xs text-muted-foreground">F5 (topo)</p>
                      <p className="text-sm font-medium text-muted-foreground">
                        até R$ {Number(faixaF5Max).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            <Input type="number" value={form.salario_proposto} className="h-9"
              placeholder="0,00"
              onChange={e => setForm(f => ({ ...f, salario_proposto: e.target.value }))}
            />
            {form.salario_proposto && faixaMinEfetiva && Number(form.salario_proposto) < Number(faixaMinEfetiva) && (
              <p className="text-xs font-medium" style={{ color: "#D97706" }}>⚠ Valor abaixo da faixa mínima do cargo (F1)</p>
            )}
            {form.salario_proposto && faixaMaxEfetiva && Number(form.salario_proposto) > Number(faixaMaxEfetiva) && (
              <p className="text-xs font-medium" style={{ color: "#D97706" }}>⚠ Valor acima da faixa F1 — verifique se é uma promoção ou exceção</p>
            )}
            {form.salario_proposto && faixaF5Max && Number(form.salario_proposto) > Number(faixaF5Max) && (
              <p className="text-xs font-medium" style={{ color: "#DC2626" }}>⚠ Valor acima do topo da faixa (F5) — não permitido</p>
            )}
          </div>
        )}

        {/* Data de início */}
        <div className="space-y-1.5">
          <Label className="text-xs">Data de início prevista</Label>
          <Input type="date" value={form.data_inicio} className="h-9"
            onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))}
          />
        </div>

        {/* Benefícios */}
        <div className="space-y-1.5">
          <Label className="text-xs">Benefícios incluídos</Label>
          <Textarea value={form.beneficios} rows={2} className="resize-none text-sm"
            placeholder="VR, VT, Plano de Saúde..."
            onChange={e => setForm(f => ({ ...f, beneficios: e.target.value }))}
          />
        </div>

        {/* Observações */}
        <div className="space-y-1.5">
          <Label className="text-xs">Observações</Label>
          <Textarea value={form.observacoes} rows={2} className="resize-none text-sm"
            placeholder="Informações adicionais sobre a oferta..."
            onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
          />
        </div>

        {/* Ações */}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" disabled={salvando}
            onClick={salvarOferta}>
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Salvar rascunho
          </Button>
          <Button size="sm" disabled={enviando}
            style={{ backgroundColor: "#D97706" }}
            onClick={enviarProposta}>
            {enviando
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Enviando...</>
              : jaEnviada ? "Reenviar proposta" : `Enviar para ${candidato?.nome?.split(" ")[0]}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
