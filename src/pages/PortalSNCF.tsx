import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import * as LucideIcons from "lucide-react";
import { LayoutGrid, Lock, ExternalLink, ClipboardList, Sparkles, MessageCircle, Star, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useMeusAtalhos } from "@/hooks/useRegistrarNavegacao";
import { MuralRotativo } from "@/components/mural/MuralRotativo";
import { ListaAniversariantesMes } from "@/components/mural/ListaAniversariantesMes";

interface Sistema {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  icone: string;
  cor: string;
  ativo: boolean;
  ordem: number;
  rota_base: string;
}

interface UserSystem {
  sistema_id: string;
  ativo: boolean;
}

function getIcon(name: string) {
  const pascal = name
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[pascal];
  return Icon || LayoutGrid;
}

export default function PortalSNCF() {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const [sistemas, setSistemas] = useState<Sistema[]>([]);
  const [userSystems, setUserSystems] = useState<UserSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPendentes, setTotalPendentes] = useState(0);
  const { data: atalhos } = useMeusAtalhos(5);

  /**
   * Sprint 2 (29/04/2026): super_admin e admin_rh têm acesso universal.
   * Antes a checagem dependia 100% de sncf_user_systems, o que esconde
   * sistemas novos do próprio dono do sistema. Doutrina: "se você é
   * super_admin, vê tudo, sem precisar de cadastro adicional".
   */
  const isAdmin = roles.includes("super_admin") || roles.includes("admin_rh");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [sistemasRes, userSystemsRes, tarefasRes] = await Promise.all([
        supabase.from("sncf_sistemas").select("*").eq("ativo", true).order("ordem"),
        supabase.from("sncf_user_systems").select("sistema_id, ativo").eq("user_id", user.id),
        supabase
          .from("vw_tarefas")
          .select("id", { count: "exact", head: true })
          .eq("responsavel_user_id", user.id)
          .eq("esta_aberta", true),
      ]);
      if (sistemasRes.data) setSistemas(sistemasRes.data as Sistema[]);
      if (userSystemsRes.data) setUserSystems(userSystemsRes.data as UserSystem[]);
      setTotalPendentes(tarefasRes.count ?? 0);
      setLoading(false);
    };
    void load();
  }, [user]);

  const hasAccess = (sistemaId: string) => {
    if (isAdmin) return true; // super_admin/admin_rh veem todos os sistemas
    return userSystems.some((us) => us.sistema_id === sistemaId && us.ativo);
  };

  const isExternal = (sistema: Sistema) => sistema.rota_base.startsWith("http");

  const handleEnter = (sistema: Sistema) => {
    if (!hasAccess(sistema.id)) return;
    if (isExternal(sistema)) {
      window.open(sistema.rota_base, "_blank");
    } else {
      navigate(sistema.rota_base);
    }
  };

  // Top 4 mais acessados + 1 mais recente que não esteja nos top
  const topQuatro = atalhos?.slice(0, 4) || [];
  const ultimoNaoRepetido = atalhos && atalhos.length > 4
    ? [...atalhos.slice(4)].sort((a, b) =>
        new Date(b.ultimo_acesso).getTime() - new Date(a.ultimo_acesso).getTime()
      )[0]
    : null;

  const renderCardCompacto = (sistema: Sistema) => {
    const Icon = getIcon(sistema.icone);
    const accessible = hasAccess(sistema.id);
    return (
      <button
        key={sistema.id}
        onClick={() => handleEnter(sistema)}
        disabled={!accessible}
        className={cn(
          "group relative overflow-hidden rounded-xl border bg-card text-left transition-all p-4",
          accessible
            ? "hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
            : "opacity-50 cursor-not-allowed"
        )}
      >
        <div className="h-1 absolute top-0 left-0 right-0" style={{ backgroundColor: sistema.cor }} />
        <div className="flex items-start gap-3 mt-1">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-lg flex-shrink-0"
            style={{ backgroundColor: `${sistema.cor}15` }}
          >
            <Icon className="h-5 w-5" style={{ color: sistema.cor }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <h3 className="text-base font-bold truncate">{sistema.nome}</h3>
              {isExternal(sistema) && accessible && (
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              )}
              {!accessible && (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Lock className="h-2.5 w-2.5" />
                  Sem acesso
                </Badge>
              )}
            </div>
            {sistema.descricao && (
              <p className="text-xs text-muted-foreground line-clamp-2">{sistema.descricao}</p>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2" style={{ color: "#1a3d2b" }}>
          Gesto não se delega. 💚
        </h1>
        <p className="text-lg md:text-xl font-medium text-foreground/80">
          Celebre o que importa — comece por aqui.
        </p>
      </div>

      {/* Mural Fetely + Lista de aniversariantes — layout 2 colunas no desktop */}
      <section className="grid grid-cols-1 lg:grid-cols-[65fr_35fr] gap-4 items-stretch">
        <div className="min-w-0 h-full">
          <MuralRotativo />
        </div>
        <div className="min-w-0 h-full">
          <ListaAniversariantesMes />
        </div>
      </section>

      {/* TOPO: Minhas Tarefas + Fala Fetely */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Minhas Tarefas */}
        <button
          onClick={() => navigate("/tarefas")}
          className="group w-full rounded-2xl border-2 bg-card p-5 hover:shadow-lg transition-all text-left"
          style={{ borderColor: "#1A4A3A" }}
        >
          <div className="flex items-center gap-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0"
              style={{ backgroundColor: "#1A4A3A" }}
            >
              <ClipboardList className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold" style={{ color: "#1A4A3A" }}>Minhas Tarefas</h2>
              <p className="text-xs text-muted-foreground">
                {totalPendentes > 0
                  ? `${totalPendentes} pendente${totalPendentes > 1 ? "s" : ""} · radar operacional`
                  : "Suas ações do dia + radar operacional"}
              </p>
            </div>
            <ArrowRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" style={{ color: "#1A4A3A" }} />
          </div>
        </button>

        {/* Fala Fetely — link limpo */}
        <button
          onClick={() => navigate("/fala-fetely")}
          className="group w-full rounded-2xl border-2 bg-card p-5 hover:shadow-lg transition-all text-left"
          style={{ borderColor: "#E91E63" }}
        >
          <div className="flex items-center gap-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0 text-white"
              style={{ background: "linear-gradient(135deg, #1A4A3A 0%, #E91E63 100%)" }}
            >
              <MessageCircle className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold">Fala Fetely</h2>
              <p className="text-xs text-muted-foreground">Pergunta, sugere, descobre.</p>
            </div>
            <Sparkles className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </button>
      </div>

      {/* ATALHOS PERSONALIZADOS */}
      {topQuatro.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
              Atalhos pra você
            </h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {topQuatro.map((a) => (
              <button
                key={a.rota}
                onClick={() => navigate(a.rota)}
                className="rounded-lg border bg-card p-3 text-left hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <p className="text-sm font-medium truncate">{a.titulo}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{a.acessos} acessos</p>
              </button>
            ))}
            {ultimoNaoRepetido && (
              <button
                onClick={() => navigate(ultimoNaoRepetido.rota)}
                className="rounded-lg border border-dashed bg-muted/30 p-3 text-left hover:border-primary/40 hover:bg-card transition-all"
              >
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Último</p>
                <p className="text-sm font-medium truncate">{ultimoNaoRepetido.titulo}</p>
              </button>
            )}
          </div>
        </div>
      )}

      {/* SISTEMAS INTERNOS + EXTERNOS */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        (() => {
          const internos = sistemas.filter((s) => !isExternal(s));
          const externos = sistemas.filter((s) => isExternal(s));

          return (
            <div className="space-y-6">
              {internos.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                    Sistemas
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {internos.map(renderCardCompacto)}
                  </div>
                </div>
              )}
              {externos.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                    Sistemas externos
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {externos.map(renderCardCompacto)}
                  </div>
                </div>
              )}
            </div>
          );
        })()
      )}
    </div>
  );
}
