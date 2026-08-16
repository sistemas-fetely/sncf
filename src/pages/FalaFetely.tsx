import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft, Plus, Send, Sparkles, MessageCircle, ThumbsUp, ThumbsDown, Copy,
  Globe, Gift, Workflow, Users, MessageCircleHeart, GraduationCap, Brain,
  MoreHorizontal, Trash2, Shield, Lightbulb, Star,
} from "lucide-react";
import { SugerirProcessoDialog } from "@/components/fala-fetely/SugerirProcessoDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { EnsinarDialog } from "@/components/fala-fetely/EnsinarDialog";
import { FeedbackNegativoDialog } from "@/components/fala-fetely/FeedbackNegativoDialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DialogConsentimentoFalaFetely } from "@/components/fala-fetely/DialogConsentimentoFalaFetely";
import { ConfirmacaoDupla } from "@/components/ConfirmacaoDupla";

interface Conversa {
  id: string;
  titulo: string | null;
  updated_at: string;
  favorita?: boolean;
}

interface Mensagem {
  id: string;
  papel: "user" | "assistant";
  conteudo: string;
  created_at: string;
  pendente?: boolean;
}

const FRASES_MOTIVACIONAIS = [
  "Me pergunta que te dou um bolo? 🎂",
  "O que você quer celebrar hoje? 🎉",
  "Dúvida boa é dúvida perguntada 💚",
  "Gesto não se delega — mas pergunta, sim! ✨",
  "Bora descobrir algo que vale a pena? 🌿",
  "Aqui ninguém fica sem resposta 🌷",
  "Curiosidade é o melhor presente 🎁",
  "Pergunta vai, conhecimento vem ✨",
];

const FRASES_PENSANDO = [
  "Vasculhando a base secreta... 🔍",
  "Juntando as peças do quebra-cabeça...",
  "Preparando uma resposta caprichada 💚",
  "Quase lá, só polindo os detalhes...",
  "Consultando os sábios da Fetely... ✨",
  "Isso vai ser bom, espera só...",
  "Montando a resposta com carinho 🌿",
];

const SUGESTOES = [
  { categoria: "Descubra", icone: Sparkles, cor: "#E91E63", texto: "O que a Fetely tem que nenhuma outra empresa tem?" },
  { categoria: "Explore", icone: Globe, cor: "#3A7D6B", texto: "Me conta um segredo sobre como as coisas funcionam aqui" },
  { categoria: "Celebre", icone: Gift, cor: "#FF9800", texto: "Qual benefício da Fetely eu ainda não estou usando?" },
  { categoria: "Aprenda", icone: Workflow, cor: "#1A4A3A", texto: "O que eu deveria saber nos meus primeiros 30 dias?" },
];

function formatRelativo(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString("pt-BR");
}

export default function FalaFetely() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { roles: authRoles } = useAuth();
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const isAdminRH = (authRoles ?? []).includes("admin_rh") || (authRoles ?? []).includes("rh" as never);
  const userRoles = authRoles;
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [conversaAtiva, setConversaAtiva] = useState<Conversa | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [input, setInput] = useState("");
  const [pensando, setPensando] = useState(false);
  const [estadoPensando, setEstadoPensando] = useState(FRASES_PENSANDO[0]);
  const [mensagemEnsinando, setMensagemEnsinando] = useState<Mensagem | null>(null);
  const [feedbackNegativo, setFeedbackNegativo] = useState<Mensagem | null>(null);
  const [feedbacksDados, setFeedbacksDados] = useState<Map<string, boolean>>(new Map());
  const [conversaParaExcluir, setConversaParaExcluir] = useState<Conversa | null>(null);
  const [showPrivacidade, setShowPrivacidade] = useState(false);
  const [confirmarLimparTudo, setConfirmarLimparTudo] = useState(false);
  const [precisaConsentimento, setPrecisaConsentimento] = useState<boolean | null>(null);
  const [sugerirAberto, setSugerirAberto] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Regra 11 — Consentimento bloqueante no primeiro acesso
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function verificar() {
      const { data, error } = await supabase.rpc("tem_consentimento_ativo", {
        _user_id: user.id,
        _tipo: "fala_fetely_conversas",
      });
      if (cancelled) return;
      if (error) {
        // Em caso de erro, assume sem consentimento pra ser seguro
        setPrecisaConsentimento(true);
        return;
      }
      setPrecisaConsentimento(!data);
    }
    void verificar();
    return () => { cancelled = true; };
  }, [user]);

  const podeEnsinar = useMemo(
    () =>
      isSuperAdmin ||
      isAdminRH ||
      (userRoles as string[]).includes("gestor_rh") ||
      (userRoles as string[]).includes("gestor_direto"),
    [isSuperAdmin, isAdminRH, userRoles]
  );

  const fraseMotivacional = useMemo(
    () => FRASES_MOTIVACIONAIS[Math.floor(Math.random() * FRASES_MOTIVACIONAIS.length)],
    []
  );

  const userInitials = useMemo(() => {
    const name = profile?.full_name || user?.email || "??";
    return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  }, [profile, user]);

  function getPerguntaAnterior(msg: Mensagem): string {
    const idx = mensagens.findIndex((m) => m.id === msg.id);
    if (idx <= 0) return "";
    for (let i = idx - 1; i >= 0; i--) {
      if (mensagens[i].papel === "user") return mensagens[i].conteudo;
    }
    return "";
  }

  // Carrega conversas
  useEffect(() => {
    if (!user) return;
    void carregarConversas();
  }, [user]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  // Detecta se a última mensagem do assistente está pendente e ainda sem conteúdo
  const ultimaAssistantVazia = useMemo(() => {
    const ultima = [...mensagens].reverse().find((m) => m.papel === "assistant");
    return !!(ultima?.pendente && !ultima?.conteudo);
  }, [mensagens]);

  // Rotaciona frases de "pensando" enquanto aguarda primeiro token
  useEffect(() => {
    if (!ultimaAssistantVazia) {
      setEstadoPensando(FRASES_PENSANDO[0]);
      return;
    }
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % FRASES_PENSANDO.length;
      setEstadoPensando(FRASES_PENSANDO[idx]);
    }, 900);
    return () => clearInterval(interval);
  }, [ultimaAssistantVazia]);

  async function carregarConversas() {
    const { data } = await supabase
      .from("fala_fetely_conversas")
      .select("id, titulo, updated_at, favorita")
      .eq("arquivada", false)
      .order("favorita", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(50);
    setConversas((data as Conversa[]) || []);
  }

  async function toggleFavorita(id: string, novoValor: boolean) {
    // Atualização otimista
    setConversas((prev) =>
      [...prev]
        .map((c) => (c.id === id ? { ...c, favorita: novoValor } : c))
        .sort((a, b) => {
          if ((b.favorita ? 1 : 0) !== (a.favorita ? 1 : 0)) {
            return (b.favorita ? 1 : 0) - (a.favorita ? 1 : 0);
          }
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        }),
    );
    const { error } = await supabase
      .from("fala_fetely_conversas")
      .update({ favorita: novoValor })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao favoritar", description: error.message, variant: "destructive" });
      void carregarConversas();
    }
  }

  async function abrirConversa(c: Conversa) {
    setConversaAtiva(c);
    const { data } = await supabase
      .from("fala_fetely_mensagens")
      .select("id, papel, conteudo, created_at")
      .eq("conversa_id", c.id)
      .order("created_at", { ascending: true });
    const msgs = (data as Mensagem[]) || [];
    setMensagens(msgs);

    // Carrega feedbacks já dados pelo usuário para essas mensagens
    const mensagemIds = msgs.filter((m) => m.papel === "assistant").map((m) => m.id);
    if (mensagemIds.length > 0 && user) {
      const { data: fbs } = await supabase
        .from("fala_fetely_feedback")
        .select("mensagem_id, util")
        .in("mensagem_id", mensagemIds)
        .eq("user_id", user.id);
      const map = new Map<string, boolean>();
      (fbs || []).forEach((f) => map.set(f.mensagem_id, f.util));
      setFeedbacksDados(map);
    } else {
      setFeedbacksDados(new Map());
    }
  }

  function novaConversa() {
    // Dispara extração de memória da conversa anterior em background (fire-and-forget)
    if (conversaAtiva && mensagens.length >= 4) {
      void supabase.functions
        .invoke("fala-fetely-extrair-memoria", {
          body: { conversa_id: conversaAtiva.id },
        })
        .catch((err) => console.error("Erro extração memória:", err));
    }
    setConversaAtiva(null);
    setMensagens([]);
    setInput("");
    setFeedbacksDados(new Map());
  }

  async function enviarPergunta(perguntaTexto: string) {
    if (!perguntaTexto.trim() || pensando || !user) return;

    const userMsg: Mensagem = {
      id: `tmp-user-${Date.now()}`,
      papel: "user",
      conteudo: perguntaTexto,
      created_at: new Date().toISOString(),
    };
    const assistantMsg: Mensagem = {
      id: `tmp-assistant-${Date.now()}`,
      papel: "assistant",
      conteudo: "",
      created_at: new Date().toISOString(),
      pendente: true,
    };

    setMensagens((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setPensando(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão expirada");

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fala-fetely-perguntar`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversa_id: conversaAtiva?.id ?? null,
          pergunta: perguntaTexto,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        if (resp.status === 429) {
          toast({ title: "Devagar aí 🌱", description: "Muitas perguntas em pouco tempo. Tente em instantes.", variant: "destructive" });
        } else if (resp.status === 402) {
          toast({ title: "Créditos esgotados", description: "Avise um admin para repor os créditos da IA.", variant: "destructive" });
        } else {
          toast({ title: "Ops", description: err.error || "Erro ao falar com a IA", variant: "destructive" });
        }
        // remove pendente
        setMensagens((prev) => prev.filter((m) => m.id !== assistantMsg.id && m.id !== userMsg.id));
        return;
      }

      if (!resp.body) throw new Error("Sem corpo de resposta");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acumulado = "";
      let novaConvId: string | null = null;
      let mensagemFinalId: string | null = null;
      let currentEvent = "message";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.trim() === "") continue;

          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            continue;
          }

          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();

          if (currentEvent === "meta") {
            try {
              const parsed = JSON.parse(payload);
              if (parsed.conversa_id) novaConvId = parsed.conversa_id;
            } catch { /* ignore */ }
            currentEvent = "message";
            continue;
          }

          if (currentEvent === "end") {
            try {
              const parsed = JSON.parse(payload);
              if (parsed.mensagem_id) mensagemFinalId = parsed.mensagem_id;
            } catch { /* ignore */ }
            currentEvent = "message";
            continue;
          }

          if (payload === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              acumulado += delta;
              setMensagens((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, conteudo: acumulado } : m
                )
              );
            }
          } catch {
            // partial JSON; rebuffer
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Atualiza ID real da mensagem para feedback e marca como não pendente
      if (mensagemFinalId) {
        setMensagens((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, id: mensagemFinalId!, pendente: false } : m))
        );
      } else {
        // Fallback: se o evento "end" não chegou, busca a última mensagem do assistente no banco
        const convIdFinal = novaConvId || conversaAtiva?.id;
        if (convIdFinal) {
          try {
            const { data: ultimaMsg } = await supabase
              .from("fala_fetely_mensagens")
              .select("id")
              .eq("conversa_id", convIdFinal)
              .eq("papel", "assistant")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (ultimaMsg) {
              setMensagens((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, id: ultimaMsg.id, pendente: false } : m))
              );
            } else {
              setMensagens((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, pendente: false } : m))
              );
            }
          } catch (e) {
            console.error("Erro buscando ID real:", e);
            setMensagens((prev) =>
              prev.map((m) => (m.id === assistantMsg.id ? { ...m, pendente: false } : m))
            );
          }
        } else {
          setMensagens((prev) =>
            prev.map((m) => (m.id === assistantMsg.id ? { ...m, pendente: false } : m))
          );
        }
      }

      // Se era nova conversa, atualiza o ativo e recarrega lista
      if (novaConvId && !conversaAtiva) {
        setConversaAtiva({ id: novaConvId, titulo: perguntaTexto.slice(0, 50), updated_at: new Date().toISOString() });
      }
      void carregarConversas();
    } catch (e) {
      console.error(e);
      toast({ title: "Ops", description: e instanceof Error ? e.message : "Erro inesperado", variant: "destructive" });
      setMensagens((prev) => prev.filter((m) => m.id !== assistantMsg.id));
    } finally {
      setPensando(false);
    }
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    void enviarPergunta(input);
  }

  async function feedback(mensagemId: string, util: boolean) {
    if (!user || mensagemId.startsWith("tmp-")) return;
    if (util) {
      const { error } = await supabase
        .from("fala_fetely_feedback")
        .upsert({ mensagem_id: mensagemId, user_id: user.id, util: true }, { onConflict: "mensagem_id,user_id" });
      if (error) {
        toast({ title: "Não consegui registrar", description: error.message, variant: "destructive" });
        return;
      }
      setFeedbacksDados((prev) => new Map(prev).set(mensagemId, true));
      toast({ title: "Valeu! 💚", description: "Vou seguir nessa linha" });
    } else {
      const msg = mensagens.find((m) => m.id === mensagemId);
      if (msg) setFeedbackNegativo(msg);
    }
  }

  function copiar(texto: string) {
    navigator.clipboard.writeText(texto);
    toast({ title: "Copiado ✨" });
  }

  async function excluirConversa() {
    if (!conversaParaExcluir || !user) return;
    try {
      const { error } = await supabase
        .from("fala_fetely_conversas")
        .delete()
        .eq("id", conversaParaExcluir.id)
        .eq("user_id", user.id);
      if (error) throw error;
      if (conversaAtiva?.id === conversaParaExcluir.id) {
        setConversaAtiva(null);
        setMensagens([]);
        setFeedbacksDados(new Map());
      }
      setConversas((prev) => prev.filter((c) => c.id !== conversaParaExcluir.id));
      setConversaParaExcluir(null);
      toast({ title: "Conversa excluída" });
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Erro inesperado", variant: "destructive" });
    }
  }

  async function limparTudo() {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("fala_fetely_conversas")
        .delete()
        .eq("user_id", user.id);
      if (error) throw error;
      setConversas([]);
      setConversaAtiva(null);
      setMensagens([]);
      setFeedbacksDados(new Map());
      setConfirmarLimparTudo(false);
      setShowPrivacidade(false);
      toast({ title: "Histórico apagado", description: "Todas as conversas foram excluídas." });
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Erro inesperado", variant: "destructive" });
    }
  }

  // Regra 11 — Bloqueia tela inteira até consentir
  if (precisaConsentimento === true) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #FFF8F3 0%, #F0F7F4 100%)" }}>
        <DialogConsentimentoFalaFetely
          open={true}
          onAceite={() => setPrecisaConsentimento(false)}
        />
      </div>
    );
  }

  return (
    <div className="h-screen flex" style={{ background: "linear-gradient(135deg, #FFF8F3 0%, #F0F7F4 100%)" }}>
      {/* Sidebar de conversas */}
      <aside className="w-72 border-r bg-white/60 backdrop-blur-sm flex flex-col">
        <div className="p-4 border-b">
          <Button onClick={novaConversa} className="w-full gap-2 text-white hover:opacity-90" style={{ backgroundColor: "#1A4A3A" }}>
            <Plus className="h-4 w-4" /> Nova conversa
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {conversas.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center mt-6 px-4">
              Suas conversas aparecerão aqui
            </p>
          ) : (
            conversas.map((c) => (
              <div key={c.id} className="group relative">
                <button
                  onClick={() => abrirConversa(c)}
                  className={`w-full text-left p-2 pr-16 rounded-lg text-sm hover:bg-muted transition-all ${
                    conversaAtiva?.id === c.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {c.favorita && <Star className="h-3 w-3 flex-shrink-0 fill-warning text-warning" />}
                    <MessageCircle className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    <span className="truncate">{c.titulo || "Conversa"}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 ml-5">{formatRelativo(c.updated_at)}</p>
                </button>
                <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    className="p-1 hover:bg-background rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleFavorita(c.id, !c.favorita);
                    }}
                    title={c.favorita ? "Remover dos favoritos" : "Fixar conversa"}
                  >
                    <Star className={`h-3.5 w-3.5 ${c.favorita ? "fill-warning text-warning" : "text-muted-foreground"}`} />
                  </button>
                  <button
                    type="button"
                    className="p-1 hover:bg-background rounded text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConversaParaExcluir(c);
                    }}
                    title="Excluir conversa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Área principal */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between p-4 border-b bg-white/40">
          <Button variant="ghost" onClick={() => navigate("/sncf")} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Voltar ao SNCF
          </Button>
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white"
              style={{ background: "linear-gradient(135deg, #1A4A3A, #E91E63)" }}
            >
              <MessageCircleHeart className="w-4 h-4" />
            </div>
            <span className="font-medium">Fala Fetely</span>
            {pensando && (
              <span className="ml-2 text-xs text-muted-foreground flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                respondendo...
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPrivacidade(true)}
              className="gap-1 text-xs"
              title="Privacidade"
            >
              <Shield className="h-3 w-3" /> Privacidade
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/fala-fetely/memorias")}
              className="gap-1 text-xs"
              title="Minhas memórias"
            >
              <Brain className="h-3 w-3" /> Minhas Memórias
            </Button>
          </div>
        </header>

        {mensagens.length === 0 ? (
          <div className="flex-1 overflow-auto">
            <div className="max-w-2xl mx-auto text-center pt-12 pb-8 px-4 space-y-6">
              <div
                className="w-20 h-20 rounded-full mx-auto flex items-center justify-center text-white"
                style={{ background: "linear-gradient(135deg, #1A4A3A 0%, #E91E63 100%)" }}
              >
                <MessageCircleHeart className="w-11 h-11" />
              </div>
              <div>
                <h1 className="text-3xl font-medium mb-2" style={{ color: "#1A4A3A" }}>
                  {fraseMotivacional}
                </h1>
                <p className="text-muted-foreground">
                  Pergunte qualquer coisa sobre a Fetely. Estou aqui pra te ajudar a celebrar com clareza ✨
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SUGESTOES.map((s) => (
                  <button
                    key={s.texto}
                    onClick={() => void enviarPergunta(s.texto)}
                    disabled={pensando}
                    className="p-4 rounded-xl border-2 hover:border-[#1A4A3A] hover:shadow-md transition-all bg-white text-left disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <s.icone className="h-4 w-4" style={{ color: s.cor }} />
                      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: s.cor }}>
                        {s.categoria}
                      </span>
                    </div>
                    <p className="text-sm">{s.texto}</p>
                  </button>
                ))}
              </div>

              <form onSubmit={enviar} className="flex gap-2 pt-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Pergunte alguma coisa..."
                  disabled={pensando}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || pensando}
                  style={{ backgroundColor: "#1A4A3A" }}
                  className="gap-2 text-white hover:opacity-90"
                >
                  <Send className="h-4 w-4" /> Enviar
                </Button>
              </form>
              <p className="text-[10px] text-muted-foreground">
                ✌️ Sou só uma IA — confirme com seu gestor antes de decisões importantes
              </p>
              <p className="text-[10px] text-center text-muted-foreground/70 mt-0.5">
                Suas conversas são privadas.{" "}
                <button className="underline hover:text-foreground" onClick={() => setShowPrivacidade(true)}>
                  Gerenciar dados
                </button>
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto p-6">
              <div className="max-w-3xl mx-auto space-y-4">
                {mensagens.map((msg) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.papel === "user" ? "flex-row-reverse" : ""}`}>
                    <div
                      className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-medium text-white text-xs"
                      style={
                        msg.papel === "user"
                          ? { backgroundColor: "#E91E63" }
                          : { background: "linear-gradient(135deg, #1A4A3A, #E91E63)" }
                      }
                    >
                      {msg.papel === "user" ? userInitials : <MessageCircleHeart className="w-4 h-4" />}
                    </div>
                    <div className={`flex-1 max-w-[75%] ${msg.papel === "user" ? "text-right" : ""}`}>
                      <div
                        className={`inline-block p-4 rounded-2xl text-left ${
                          msg.papel === "user"
                            ? "bg-[#E91E63] text-white rounded-tr-sm"
                            : "bg-white border-l-4 border-l-[#1A4A3A] rounded-tl-sm shadow-sm"
                        }`}
                      >
                        {msg.pendente && !msg.conteudo ? (
                          <div className="flex items-center gap-3 min-w-[280px] py-2">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full animate-bounce"
                                style={{ backgroundColor: "#1A4A3A", animationDelay: "0ms", animationDuration: "0.8s" }}
                              />
                              <span
                                className="w-2.5 h-2.5 rounded-full animate-bounce"
                                style={{ backgroundColor: "#E91E63", animationDelay: "150ms", animationDuration: "0.8s" }}
                              />
                              <span
                                className="w-2.5 h-2.5 rounded-full animate-bounce"
                                style={{ backgroundColor: "#1A4A3A", animationDelay: "300ms", animationDuration: "0.8s" }}
                              />
                            </div>
                            <p
                              key={estadoPensando}
                              className="text-sm font-medium animate-fade-in"
                              style={{ color: "#1A4A3A" }}
                            >
                              {estadoPensando}
                            </p>
                          </div>
                        ) : (
                          <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-headings:my-2">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.conteudo}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                      {msg.papel === "assistant" && !msg.pendente && msg.conteudo && (() => {
                        const fbAtual = feedbacksDados.get(msg.id);
                        return (
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <button
                              onClick={() => void feedback(msg.id, true)}
                              className={`transition-colors p-1 rounded ${
                                fbAtual === true
                                  ? "text-success bg-success/10"
                                  : "text-muted-foreground hover:text-success"
                              }`}
                              title="Útil"
                            >
                              <ThumbsUp className="h-3 w-3" fill={fbAtual === true ? "currentColor" : "none"} />
                            </button>
                            <button
                              onClick={() => void feedback(msg.id, false)}
                              className={`transition-colors p-1 rounded ${
                                fbAtual === false
                                  ? "text-destructive bg-destructive/10"
                                  : "text-muted-foreground hover:text-destructive"
                              }`}
                              title="Não útil"
                            >
                              <ThumbsDown className="h-3 w-3" fill={fbAtual === false ? "currentColor" : "none"} />
                            </button>
                            <button onClick={() => copiar(msg.conteudo)} className="hover:text-foreground transition-colors p-1" title="Copiar">
                              <Copy className="h-3 w-3" />
                            </button>
                            {podeEnsinar && (
                              <button
                                onClick={() => setMensagemEnsinando(msg)}
                                className="hover:text-[#1A4A3A] transition-colors p-1"
                                title="Ensinar Fala Fetely"
                              >
                                <GraduationCap className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="border-t bg-white/80 backdrop-blur-sm p-4">
              <div className="max-w-3xl mx-auto">
                <form onSubmit={enviar} className="flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Pergunte alguma coisa..."
                    disabled={pensando}
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    disabled={!input.trim() || pensando}
                    style={{ backgroundColor: "#1A4A3A" }}
                    className="gap-2 text-white hover:opacity-90"
                  >
                    <Send className="h-4 w-4" /> Enviar
                  </Button>
                </form>
                <div className="flex items-center justify-center gap-3 mt-2">
                  <p className="text-[10px] text-muted-foreground">
                    ✌️ Sou só uma IA — confirme com seu gestor antes de decisões importantes
                  </p>
                  <span className="text-muted-foreground/40">·</span>
                  <button
                    type="button"
                    onClick={() => setSugerirAberto(true)}
                    className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                    title="Sugerir melhoria em processo"
                  >
                    <Lightbulb className="h-3 w-3" /> Sugerir melhoria de processo
                  </button>
                </div>
                <p className="text-[10px] text-center text-muted-foreground/70 mt-0.5">
                  Suas conversas são privadas.{" "}
                  <button className="underline hover:text-foreground" onClick={() => setShowPrivacidade(true)}>
                    Gerenciar dados
                  </button>
                </p>
              </div>
            </div>
          </>
        )}
      </main>

      {mensagemEnsinando && (
        <EnsinarDialog
          mensagem={mensagemEnsinando}
          perguntaOriginal={getPerguntaAnterior(mensagemEnsinando)}
          onClose={() => setMensagemEnsinando(null)}
          onEnviado={() => {
            setMensagemEnsinando(null);
            toast({ title: "Obrigado!", description: "Sua sugestão foi enviada para o RH revisar. 💚" });
          }}
        />
      )}

      {feedbackNegativo && (
        <FeedbackNegativoDialog
          mensagem={feedbackNegativo}
          perguntaOriginal={getPerguntaAnterior(feedbackNegativo)}
          podeEnsinar={podeEnsinar}
          onClose={() => setFeedbackNegativo(null)}
          onEnviado={() => {
            const id = feedbackNegativo.id;
            setFeedbacksDados((prev) => new Map(prev).set(id, false));
            setFeedbackNegativo(null);
            toast({ title: "Obrigado pelo feedback!", description: "Vou usar isso pra melhorar. 💚" });
          }}
        />
      )}

      <SugerirProcessoDialog open={sugerirAberto} onOpenChange={setSugerirAberto} />

      {/* AlertDialog: confirmar exclusão de uma conversa */}
      <AlertDialog
        open={!!conversaParaExcluir}
        onOpenChange={(open) => !open && setConversaParaExcluir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação é permanente e não pode ser desfeita. Todas as mensagens, feedbacks e
              sugestões relacionadas serão apagadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={excluirConversa}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Privacidade e seus dados */}
      <Dialog open={showPrivacidade} onOpenChange={setShowPrivacidade}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" /> Privacidade e seus dados
            </DialogTitle>
            <DialogDescription>
              Pela LGPD, você tem direito de controlar os dados que o Fala Fetely guarda sobre suas
              conversas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="border rounded-lg p-4 space-y-2">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <MessageCircle className="h-4 w-4" /> Suas conversas
              </h3>
              <p className="text-xs text-muted-foreground">
                Você tem {conversas.length} conversa(s) salva(s). Cada conversa é privada e só você
                pode acessar.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmarLimparTudo(true)}
                className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                disabled={conversas.length === 0}
              >
                <Trash2 className="h-4 w-4" /> Limpar todo o histórico
              </Button>
            </div>
            <div className="border rounded-lg p-4 space-y-2">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <Brain className="h-4 w-4" /> Suas memórias
              </h3>
              <p className="text-xs text-muted-foreground">
                O Fala Fetely pode lembrar de fatos sobre você para melhorar as conversas. Veja e
                gerencie o que ele lembra.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowPrivacidade(false);
                  navigate("/fala-fetely/memorias");
                }}
                className="gap-2"
              >
                <Brain className="h-4 w-4" /> Ver minhas memórias
              </Button>
            </div>
            <div className="border rounded-lg p-4 bg-muted/50">
              <h3 className="font-medium text-sm mb-2">Como seus dados são usados?</h3>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Suas conversas são privadas — apenas você tem acesso</li>
                <li>• O Fala Fetely processa suas perguntas para respondê-las</li>
                <li>• Memórias extraídas ficam guardadas até você removê-las</li>
                <li>• Você pode excluir qualquer dado a qualquer momento</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação dupla: limpar todo o histórico (Regra 18) */}
      <ConfirmacaoDupla
        open={confirmarLimparTudo}
        onOpenChange={setConfirmarLimparTudo}
        titulo="Apagar TODAS as conversas?"
        descricao={
          <>
            <p>
              Essa ação vai deletar permanentemente todas as suas {conversas.length} conversa(s),
              incluindo mensagens, feedbacks e histórico. Essa ação não pode ser desfeita.
            </p>
            <p>
              <strong>Suas memórias não serão apagadas.</strong> Se quiser remover memórias também,
              acesse a tela "Minhas Memórias".
            </p>
          </>
        }
        textoConfirmacao="APAGAR TUDO"
        placeholder="APAGAR TUDO"
        acaoLabel="Sim, apagar tudo"
        onConfirmar={limparTudo}
      />
    </div>
  );
}
