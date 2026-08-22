import { useAuth } from "@/contexts/AuthContext";
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAllCargos } from "@/hooks/useCargos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Pause, Play, RefreshCw } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
const DELAY_MS = 3500;

export default function CargosEnriquecimento() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { roles: authRoles } = useAuth();
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const isAdminRH = (authRoles ?? []).includes("admin_rh") || (authRoles ?? []).includes("rh" as never);
  const pausadoRef = useRef(false);

  const { data: cargos = [] } = useAllCargos();

  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [rodando, setRodando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [atual, setAtual] = useState<string | null>(null);
  const [progresso, setProgresso] = useState(0);
  const [totalFila, setTotalFila] = useState(0);
  const [erros, setErros] = useState<{ nome: string; erro: string }[]>([]);
  const [filtro, setFiltro] = useState<"todos" | "pendentes" | "enriquecidos" | "erros">("todos");

  if (!isSuperAdmin && !isAdminRH) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Acesso restrito a Super Admin e Admin RH.</p>
      </div>
    );
  }

  function getStatusInicial(cargo: any): string {
    if (statusMap[cargo.id]) return statusMap[cargo.id];
    const temJD = cargo.missao || cargo.skills_obrigatorias?.length > 0;
    const temFaixa = cargo.faixa_clt_f1_min != null || cargo.faixa_pj_f1_min != null;
    return temJD && temFaixa ? "completo" : "pendente";
  }

  const cargosFiltrados = cargos.filter(c => {
    const st = getStatusInicial(c);
    if (filtro === "pendentes") return st === "pendente";
    if (filtro === "enriquecidos") return st === "enriquecido" || st === "completo";
    if (filtro === "erros") return st === "erro";
    return true;
  });

  const counts = {
    total: cargos.length,
    pendentes: cargos.filter(c => getStatusInicial(c) === "pendente").length,
    enriquecidos: cargos.filter(c => ["enriquecido", "completo"].includes(getStatusInicial(c))).length,
    erros: cargos.filter(c => getStatusInicial(c) === "erro").length,
  };

  async function enriquecerUm(cargo: any) {
    setAtual(cargo.nome);
    setStatusMap(s => ({ ...s, [cargo.id]: "processando" }));

    try {
      const { data, error } = await supabase.functions.invoke("enrich-cargo", {
        body: { nome: cargo.nome, nivel: cargo.nivel, departamento: cargo.departamento },
      });
      if (error) throw error;

      const update: any = {};
      if (!cargo.missao && data.missao) update.missao = data.missao;
      if ((!cargo.responsabilidades?.length) && data.responsabilidades?.length)
        update.responsabilidades = data.responsabilidades;
      if ((!cargo.skills_obrigatorias?.length) && data.skills_obrigatorias?.length)
        update.skills_obrigatorias = data.skills_obrigatorias;
      if ((!cargo.skills_desejadas?.length) && data.skills_desejadas?.length)
        update.skills_desejadas = data.skills_desejadas;
      if ((!cargo.ferramentas?.length) && data.ferramentas?.length)
        update.ferramentas = data.ferramentas;

      const faixasClt = [
        "faixa_clt_f1_min","faixa_clt_f1_max","faixa_clt_f2_min","faixa_clt_f2_max",
        "faixa_clt_f3_min","faixa_clt_f3_max","faixa_clt_f4_min","faixa_clt_f4_max",
        "faixa_clt_f5_min","faixa_clt_f5_max",
      ];
      const faixasPj = [
        "faixa_pj_f1_min","faixa_pj_f1_max","faixa_pj_f2_min","faixa_pj_f2_max",
        "faixa_pj_f3_min","faixa_pj_f3_max","faixa_pj_f4_min","faixa_pj_f4_max",
        "faixa_pj_f5_min","faixa_pj_f5_max",
      ];

      // Faixas vão para cargos_faixas_salariais (fonte única, RLS restrita)
      const faixasUpdate: any = {};
      if (cargo.tipo_contrato !== "pj") {
        faixasClt.forEach(f => {
          if (cargo[f] == null && data[f] != null) faixasUpdate[f] = data[f];
        });
      }
      if (cargo.tipo_contrato !== "clt") {
        faixasPj.forEach(f => {
          if (cargo[f] == null && data[f] != null) faixasUpdate[f] = data[f];
        });
      }

      if (Object.keys(update).length > 0) {
        const { error: saveError } = await supabase
          .from("cargos")
          .update(update)
          .eq("id", cargo.id);
        if (saveError) throw saveError;
      }

      if (Object.keys(faixasUpdate).length > 0) {
        const { error: faixasError } = await supabase
          .from("cargos_faixas_salariais")
          .upsert(
            { cargo_id: cargo.id, protege_salario: cargo.protege_salario ?? false, ...faixasUpdate },
            { onConflict: "cargo_id" }
          );
        if (faixasError) throw faixasError;
      }

      setStatusMap(s => ({ ...s, [cargo.id]: "enriquecido" }));
      queryClient.invalidateQueries({ queryKey: ["cargos"] });
    } catch (e: any) {
      setStatusMap(s => ({ ...s, [cargo.id]: "erro" }));
      setErros(prev => [...prev, { nome: cargo.nome, erro: e.message }]);
    }
  }

  async function iniciarEmLote() {
    const fila = cargos.filter(c => getStatusInicial(c) === "pendente" || getStatusInicial(c) === "erro");
    if (fila.length === 0) {
      toast.info("Nenhum cargo pendente.");
      return;
    }

    setRodando(true);
    setPausado(false);
    pausadoRef.current = false;
    setErros([]);
    setProgresso(0);
    setTotalFila(fila.length);

    for (let i = 0; i < fila.length; i++) {
      if (pausadoRef.current) break;
      await enriquecerUm(fila[i]);
      setProgresso(i + 1);
      if (i < fila.length - 1 && !pausadoRef.current) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    setRodando(false);
    setAtual(null);
    if (!pausadoRef.current) toast.success("Enriquecimento concluído!");
  }

  function pausar() {
    pausadoRef.current = true;
    setPausado(true);
  }

  function retomar() {
    pausadoRef.current = false;
    setPausado(false);
    iniciarEmLote();
  }

  const nivelLabel: Record<string, string> = {
    jr: "Jr", pl: "Pl", sr: "Sr",
    coordenacao: "Coord.", especialista: "Esp.", c_level: "C-Level",
  };

  const statusConfig: Record<string, { label: string; className: string }> = {
    pendente: { label: "Pendente", className: "bg-muted text-muted-foreground" },
    processando: { label: "Processando...", className: "bg-info/10 text-info animate-pulse" },
    enriquecido: { label: "Enriquecido", className: "bg-[#D8F3DC] text-[#1A4A3A]" },
    completo: { label: "Já completo", className: "bg-muted text-muted-foreground" },
    erro: { label: "Erro", className: "bg-destructive/10 text-destructive" },
  };

  return (
    <PageShell>
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/cargos")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          titulo="Enriquecimento em lote"
          estado="A IA preenche missão, skills e faixas salariais para cada cargo"
          className="mb-0 flex-1"
        />
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total", value: counts.total, cor: "text-foreground" },
          { label: "Pendentes", value: counts.pendentes, cor: "text-warning" },
          { label: "Enriquecidos", value: counts.enriquecidos, cor: "text-[#1A4A3A]" },
          { label: "Erros", value: counts.erros, cor: "text-destructive" },
        ].map(m => (
          <div key={m.label} className="rounded-lg border p-4 text-center">
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className={`text-2xl font-medium ${m.cor}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Barra de progresso */}
      {(rodando || progresso > 0) && totalFila > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{atual ? `Processando: ${atual}` : "Aguardando..."}</span>
            <span>{progresso}/{totalFila}</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{ width: `${(progresso / totalFila) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="flex gap-3">
        {!rodando && !pausado && (
          <Button onClick={iniciarEmLote} disabled={counts.pendentes === 0}>
            <Sparkles className="h-4 w-4 mr-2" />
            Enriquecer {counts.pendentes} cargo{counts.pendentes !== 1 ? "s" : ""} pendente{counts.pendentes !== 1 ? "s" : ""}
          </Button>
        )}
        {rodando && !pausado && (
          <Button variant="outline" onClick={pausar}>
            <Pause className="h-4 w-4 mr-2" /> Pausar
          </Button>
        )}
        {pausado && (
          <Button onClick={retomar}>
            <Play className="h-4 w-4 mr-2" /> Retomar
          </Button>
        )}
        {counts.erros > 0 && !rodando && (
          <Button variant="outline" onClick={() => {
            setStatusMap(s => {
              const novo = { ...s };
              cargos.filter(c => s[c.id] === "erro").forEach(c => { novo[c.id] = "pendente"; });
              return novo;
            });
          }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retentar {counts.erros} erro{counts.erros !== 1 ? "s" : ""}
          </Button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {(["todos", "pendentes", "enriquecidos", "erros"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors capitalize ${
              filtro === f
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {cargosFiltrados.map(cargo => {
          const st = getStatusInicial(cargo);
          const cfg = statusConfig[st] || statusConfig.pendente;

          return (
            <div key={cargo.id} className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">{cargo.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {nivelLabel[cargo.nivel] || cargo.nivel} · {cargo.departamento || "—"} · {cargo.tipo_contrato?.toUpperCase()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={cfg.className}>{cfg.label}</Badge>
                {(st === "pendente" || st === "erro") && !rodando && (
                  <Button variant="outline" size="sm" onClick={() => enriquecerUm(cargo)}>
                    Enriquecer
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Erros detalhados */}
      {erros.length > 0 && (
        <div className="space-y-2 p-4 rounded-lg bg-destructive/10 border border-destructive/40">
          <p className="text-sm font-medium text-destructive">Erros registrados</p>
          {erros.map((e, i) => (
            <p key={i} className="text-xs text-destructive">
              <span className="font-medium">{e.nome}:</span> {e.erro}
            </p>
          ))}
        </div>
      )}
    </PageShell>
  );
}
