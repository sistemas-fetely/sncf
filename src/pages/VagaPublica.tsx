import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Clock, Briefcase, Target, Star, Wrench, Gift, ChevronRight } from "lucide-react";

export default function VagaPublica() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: vaga, isLoading } = useQuery({
    queryKey: ["vaga-publica", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vagas")
        .select("*")
        .eq("id", id!)
        .eq("status", "aberta")
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const Header = () => (
    <header style={{ backgroundColor: "#1a3d2b" }} className="text-white">
      <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
        <h1 className="text-3xl font-medium tracking-tight">Fetély.</h1>
        <p className="text-sm italic hidden sm:block max-w-[280px] text-right opacity-80">
          Vamos celebrar!! Venha criar algo novo...
        </p>
      </div>
    </header>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-4xl mx-auto px-6 py-20 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!vaga) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-4xl mx-auto px-6 py-20 text-center space-y-4">
          <h2 className="text-xl font-medium text-foreground">Esta vaga não está mais disponível.</h2>
          <p className="text-muted-foreground">A posição pode ter sido encerrada ou preenchida.</p>
        </div>
      </div>
    );
  }

  const tipoLabel = vaga.tipo_contrato === "clt" ? "CLT" : vaga.tipo_contrato === "pj" ? "PJ" : "CLT / PJ";

  const faixaStr = vaga.faixa_min
    ? `R$ ${Number(vaga.faixa_min).toLocaleString("pt-BR")}${vaga.faixa_max ? ` – R$ ${Number(vaga.faixa_max).toLocaleString("pt-BR")}` : "+"}`
    : null;

  const responsabilidades = (vaga.responsabilidades as string[] | null) ?? [];
  const skillsObrigatorias = (vaga.skills_obrigatorias as string[] | null) ?? [];
  const skillsDesejadas = (vaga.skills_desejadas as string[] | null) ?? [];
  const ferramentas = (vaga.ferramentas as string[] | null) ?? [];
  const beneficiosTexto = vaga.beneficios || (vaga as any).beneficios_outros || null;

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />

      {/* Hero */}
      <section style={{ backgroundColor: "#1a3d2b" }} className="text-white pb-12 pt-8">
        <div className="max-w-4xl mx-auto px-6 space-y-4">
          <h2 className="text-3xl sm:text-4xl font-medium leading-tight">{vaga.titulo}</h2>
          <div className="flex flex-wrap gap-2 text-sm opacity-90">
            {vaga.area && (
              <span className="flex items-center gap-1.5">
                <Briefcase className="h-4 w-4" /> {vaga.area}
              </span>
            )}
            <Badge variant="secondary" className="bg-white/15 text-white border-0 hover:bg-white/20">
              {tipoLabel}
            </Badge>
            {(vaga as any).local_trabalho && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> {(vaga as any).local_trabalho}
              </span>
            )}
            {(vaga as any).jornada && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> {(vaga as any).jornada}
              </span>
            )}
          </div>
          {faixaStr && (
            <p className="text-lg font-medium opacity-90">{faixaStr}</p>
          )}
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">

        {/* Missão */}
        {vaga.missao && (
          <section className="bg-card rounded-xl p-6 shadow-sm border space-y-3">
            <h3 className="font-medium text-sm uppercase tracking-wide flex items-center gap-2" style={{ color: "#1a3d2b" }}>
              <Target className="h-4 w-4" /> Missão do cargo
            </h3>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{vaga.missao}</p>
          </section>
        )}

        {/* Responsabilidades */}
        {responsabilidades.length > 0 && (
          <section className="bg-card rounded-xl p-6 shadow-sm border space-y-3">
            <h3 className="font-medium text-sm uppercase tracking-wide" style={{ color: "#1a3d2b" }}>
              Responsabilidades
            </h3>
            <ul className="space-y-2">
              {responsabilidades.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#1a3d2b" }} />
                  {r}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Skills */}
        {(skillsObrigatorias.length > 0 || skillsDesejadas.length > 0) && (
          <section className="bg-card rounded-xl p-6 shadow-sm border space-y-4">
            <h3 className="font-medium text-sm uppercase tracking-wide flex items-center gap-2" style={{ color: "#1a3d2b" }}>
              <Star className="h-4 w-4" /> Competências
            </h3>

            {skillsObrigatorias.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Obrigatórias</p>
                <div className="flex flex-wrap gap-2">
                  {skillsObrigatorias.map((s) => (
                    <Badge key={s} style={{ backgroundColor: "#1a3d2b" }} className="text-white border-0">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {skillsDesejadas.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Desejadas</p>
                <div className="flex flex-wrap gap-2">
                  {skillsDesejadas.map((s) => (
                    <Badge key={s} variant="outline">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Ferramentas */}
        {ferramentas.length > 0 && (
          <section className="bg-card rounded-xl p-6 shadow-sm border space-y-3">
            <h3 className="font-medium text-sm uppercase tracking-wide flex items-center gap-2" style={{ color: "#1a3d2b" }}>
              <Wrench className="h-4 w-4" /> Ferramentas e sistemas
            </h3>
            <div className="flex flex-wrap gap-2">
              {ferramentas.map((f) => (
                <Badge key={f} variant="secondary">{f}</Badge>
              ))}
            </div>
          </section>
        )}

        {/* Benefícios */}
        {beneficiosTexto && (
          <section className="bg-card rounded-xl p-6 shadow-sm border space-y-3">
            <h3 className="font-medium text-sm uppercase tracking-wide flex items-center gap-2" style={{ color: "#1a3d2b" }}>
              <Gift className="h-4 w-4" /> Benefícios
            </h3>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{beneficiosTexto}</p>
          </section>
        )}

        {/* CTA */}
        <div className="text-center space-y-4 py-6">
          <Button
            size="lg"
            className="h-14 px-10 text-base font-medium text-white rounded-full"
            style={{ backgroundColor: "#E85D75" }}
            onClick={() => navigate(`/vagas/${id}/candidatura`)}
          >
            Quero fazer parte 🌿
          </Button>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Ao se candidatar, você concorda com o uso dos seus dados pela Fetely exclusivamente para este processo seletivo, conforme a LGPD.
          </p>
        </div>

        <footer className="text-center text-xs text-muted-foreground pt-6 pb-6 border-t border-border/30">
          © {new Date().getFullYear()} Fetely · Todos os direitos reservados
        </footer>
      </div>
    </div>
  );
}
