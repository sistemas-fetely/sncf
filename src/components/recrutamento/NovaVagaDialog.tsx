import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParametros } from "@/hooks/useParametros";
import { SelectDepartamentoHierarquico } from "@/components/shared/SelectDepartamentoHierarquico";
import { useCargos, type Cargo } from "@/hooks/useCargos";
import { useAuth } from "@/contexts/AuthContext";
import { useSkillsCatalogo, salvarNovaSkill } from "@/hooks/useSkillsCatalogo";
import { useFerramentasCatalogo, salvarNovaFerramenta } from "@/hooks/useFerramentasCatalogo";
import { useBeneficiosCatalogo, salvarNovoBeneficio } from "@/hooks/useBeneficiosCatalogo";
import { useResponsabilidadesCatalogo, salvarNovaResponsabilidade } from "@/hooks/useResponsabilidadesCatalogo";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ArrowRight, ArrowLeft, Loader2, X } from "lucide-react";

const NIVEIS = [
  { value: "jr", label: "Jr" },
  { value: "pl", label: "Pl" },
  { value: "sr", label: "Sr" },
  { value: "coordenacao", label: "Coordenação" },
  { value: "especialista", label: "Especialista" },
  { value: "c-level", label: "C-Level" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NovaVagaDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { roles: authRoles } = useAuth();
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const isAdminRH = (authRoles ?? []).includes("admin_rh") || (authRoles ?? []).includes("rh" as never);
  const canSeeFaixa = isSuperAdmin || isAdminRH;

  const [step, setStep] = useState(1);

  // Step 1
  const [titulo, setTitulo] = useState("");
  const [area, setArea] = useState("");
  const [tipoContrato, setTipoContrato] = useState("");
  const [nivel, setNivel] = useState("");
  const [gestorId, setGestorId] = useState("");
  const [localTrabalho, setLocalTrabalho] = useState("");
  const [jornada, setJornada] = useState("");
  const [beneficiosSelecionados, setBeneficiosSelecionados] = useState<string[]>([]);
  const [novoBeneficio, setNovoBeneficio] = useState("");
  const [vigenciaFim, setVigenciaFim] = useState("");
  const [numVagas, setNumVagas] = useState(1);
  const [errosDuplicata, setErrosDuplicata] = useState<string[]>([]);
  const [verificandoDuplicata, setVerificandoDuplicata] = useState(false);
  const [cargoId, setCargoId] = useState<string | null>(null);

  // Step 2
  const [missao, setMissao] = useState("");
  const [responsabilidades, setResponsabilidades] = useState<string[]>([""]);
  const [skillsObrigatorias, setSkillsObrigatorias] = useState<string[]>([]);
  const [skillsDesejadas, setSkillsDesejadas] = useState<string[]>([]);
  const [ferramentasSelecionadas, setFerramentasSelecionadas] = useState<string[]>([]);
  const [novaFerramenta, setNovaFerramenta] = useState("");
  const [faixaMin, setFaixaMin] = useState("");
  const [faixaMax, setFaixaMax] = useState("");
  const [novaSkillObrig, setNovaSkillObrig] = useState("");
  const [novaSkillDesej, setNovaSkillDesej] = useState("");

  
  const { data: locais = [] } = useParametros("local_trabalho");
  const { data: jornadas = [] } = useParametros("jornada");
  const { data: beneficiosCatalogo = [] } = useBeneficiosCatalogo(tipoContrato || undefined);
  const { data: cargosData = [] } = useCargos();

  // Auto-fill faixa from cargos table
  useEffect(() => {
    if (!titulo || !tipoContrato) return;
    const cargoMatch = cargosData.find((c) => c.nome === titulo);
    if (!cargoMatch) return;
    const tipo = tipoContrato === "pj" ? "pj" : "clt";
    const f1Min = (cargoMatch as any)[`faixa_${tipo}_f1_min`];
    const f1Max = (cargoMatch as any)[`faixa_${tipo}_f1_max`];
    if (f1Min != null) setFaixaMin(String(f1Min));
    if (f1Max != null) setFaixaMax(String(f1Max));
  }, [titulo, tipoContrato, cargosData]);

  // Skills from database
  const niveisMap: Record<string, string> = {
    jr: "jr", pl: "pl", sr: "sr",
    coordenacao: "coordenacao", especialista: "especialista", "c-level": "c_level"
  };
  const nivelNormalizado = niveisMap[nivel] || "todos";

  const { data: skillsCatalogo = [] } = useSkillsCatalogo(area || undefined, nivelNormalizado !== "todos" ? nivelNormalizado : undefined);

  const skillsPorNivel = {
    especificas: skillsCatalogo.filter(s => s.nivel === nivelNormalizado && s.nivel !== "todos"),
    gerais: skillsCatalogo.filter(s => s.nivel === "todos"),
  };

  // Ferramentas from database
  const { data: ferramentasCatalogo = [] } = useFerramentasCatalogo(area || undefined);
  const ferramentasEspecificas = ferramentasCatalogo.filter(f => f.area !== "todos");
  const ferramentasTransversais = ferramentasCatalogo.filter(f => f.area === "todos");

  // Responsabilidades from database
  const { data: responsabilidadesCatalogo = [] } = useResponsabilidadesCatalogo(
    area || undefined,
    nivelNormalizado !== "todos" ? nivelNormalizado : undefined
  );

  const { data: gestores = [] } = useQuery({
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
        ...(clt ?? []).map((c) => ({ id: c.id, nome: c.nome_completo, cargo: c.cargo, tipo: "CLT" as const })),
        ...(pj ?? []).map((c) => ({ id: c.id, nome: c.contato_nome, cargo: c.tipo_servico, tipo: "PJ" as const })),
      ];
      return todos.sort((a, b) => a.nome.localeCompare(b.nome));
    },
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = {
        titulo,
        area,
        tipo_contrato: tipoContrato,
        nivel,
        status: "rascunho",
        local_trabalho: localTrabalho || null,
        jornada: jornada || null,
        beneficios: beneficiosSelecionados.join(", ") || null,
        beneficios_ids: beneficiosSelecionados.length > 0 ? beneficiosSelecionados : null,
        vigencia_fim: vigenciaFim || null,
        vigencia_inicio: new Date().toISOString().split("T")[0],
        missao: missao || null,
        responsabilidades: responsabilidades.filter(Boolean),
        skills_obrigatorias: skillsObrigatorias.filter(Boolean),
        skills_desejadas: skillsDesejadas.filter(Boolean),
        ferramentas: ferramentasSelecionadas,
        ferramentas_ids: ferramentasSelecionadas.length > 0 ? ferramentasSelecionadas : null,
        gestor_id: gestorId || null,
        criado_por: user?.id || null,
        cargo_id: cargoId || null,
        num_vagas: numVagas,
        vagas_preenchidas: 0,
      };
      if (canSeeFaixa) {
        if (faixaMin) payload.faixa_min = Number(faixaMin);
        if (faixaMax) payload.faixa_max = Number(faixaMax);
      }
      const { error } = await supabase.from("vagas").insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vaga criada! Revise e publique quando estiver pronto.");
      queryClient.invalidateQueries({ queryKey: ["vagas"] });
      resetAndClose();
    },
    onError: (err: any) => toast.error(err.message || "Erro ao criar vaga"),
  });

  function resetAndClose() {
    setStep(1);
    setTitulo(""); setArea(""); setTipoContrato(""); setNivel("");
    setGestorId(""); setLocalTrabalho(""); setJornada(""); setBeneficiosSelecionados([]); setNovoBeneficio("");
    setVigenciaFim(""); setMissao(""); setResponsabilidades([""]);
    setSkillsObrigatorias([]); setSkillsDesejadas([]);
    setFerramentasSelecionadas([]); setNovaFerramenta("");
    setFaixaMin(""); setFaixaMax("");
    setCargoId(null);
    setNovaSkillObrig(""); setNovaSkillDesej("");
    setNumVagas(1);
    setErrosDuplicata([]);
    setVerificandoDuplicata(false);
    onOpenChange(false);
  }

  const step1Valid = titulo.trim() && area && tipoContrato && nivel;

  async function verificarDuplicata(): Promise<boolean> {
    if (!titulo.trim() || !tipoContrato || !gestorId) return false;
    setVerificandoDuplicata(true);
    try {
      const { data } = await supabase
        .from("vagas")
        .select("id, titulo, tipo_contrato, status")
        .ilike("titulo", titulo.trim())
        .eq("tipo_contrato", tipoContrato)
        .eq("gestor_id", gestorId)
        .in("status", ["rascunho", "aberta", "em_selecao"]);
      if (data && data.length > 0) {
        const statusLabel: Record<string, string> = {
          rascunho: "rascunho",
          aberta: "aberta",
          em_selecao: "em seleção",
        };
        setErrosDuplicata([
          `Já existe uma vaga "${titulo}" (${tipoContrato.toUpperCase()}) com este gestor — status: ${statusLabel[data[0].status] ?? data[0].status}.`
        ]);
        return true;
      }
      setErrosDuplicata([]);
      return false;
    } finally {
      setVerificandoDuplicata(false);
    }
  }

  // Dynamic list helpers
  const addItem = (list: string[], setList: (v: string[]) => void) => setList([...list, ""]);
  const removeItem = (list: string[], setList: (v: string[]) => void, i: number) =>
    setList(list.filter((_, idx) => idx !== i));
  const updateItem = (list: string[], setList: (v: string[]) => void, i: number, val: string) =>
    setList(list.map((v, idx) => (idx === i ? val : v)));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Nova Vaga — Etapa {step} de 2
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {step === 1 ? "Dados da vaga" : "Perfil e requisitos"}
          </p>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Título da vaga *</Label>
              <Select value={titulo} onValueChange={(v) => {
                setTitulo(v); setErrosDuplicata([]);
                const cargoMatch = cargosData.find((c) => c.nome === v);
                if (cargoMatch) setCargoId(cargoMatch.id);
                if (cargoMatch) {
                  const autoNivel = cargoMatch.nivel;
                  setNivel(autoNivel);
                  if (cargoMatch.missao) setMissao(cargoMatch.missao);
                  if (cargoMatch.responsabilidades?.length) setResponsabilidades(cargoMatch.responsabilidades);
                  if (cargoMatch.skills_obrigatorias?.length) setSkillsObrigatorias(cargoMatch.skills_obrigatorias);
                  if (cargoMatch.skills_desejadas?.length) setSkillsDesejadas(cargoMatch.skills_desejadas);
                  if (cargoMatch.ferramentas?.length) {
                    setFerramentasSelecionadas(cargoMatch.ferramentas);
                  }
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                <SelectContent>
                  {cargosData.map((c) => (
                    <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Não encontrou o cargo? Cadastre em Admin → Cargos e Salários
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Departamento *</Label>
                <SelectDepartamentoHierarquico
                  valueTexto={area}
                  onChange={(dep) => setArea(dep?.valor || "")}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de contrato *</Label>
                <Select value={tipoContrato} onValueChange={(v) => { setTipoContrato(v); setErrosDuplicata([]); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clt">CLT</SelectItem>
                    <SelectItem value="pj">PJ</SelectItem>
                    <SelectItem value="ambos">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nível *</Label>
                <Select value={nivel} onValueChange={setNivel}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {NIVEIS.map((n) => (
                      <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Número de vagas */}
              <div className="space-y-2">
                <Label>Número de vagas</Label>
                <div className="flex items-center gap-3">
                  <button type="button"
                    className="w-8 h-8 rounded-full border flex items-center justify-center text-lg font-medium hover:bg-muted transition-colors"
                    onClick={() => setNumVagas(v => Math.max(1, v - 1))}>
                    −
                  </button>
                  <span className="text-lg font-semibold w-8 text-center">{numVagas}</span>
                  <button type="button"
                    className="w-8 h-8 rounded-full border flex items-center justify-center text-lg font-medium hover:bg-muted transition-colors"
                    onClick={() => setNumVagas(v => v + 1)}>
                    +
                  </button>
                  {numVagas > 1 && (
                    <span className="text-xs text-muted-foreground">
                      {numVagas} posições num único processo
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Gestor responsável</Label>
                <Select value={gestorId} onValueChange={(v) => { setGestorId(v); setErrosDuplicata([]); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                {gestores.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.nome}{g.cargo ? ` — ${g.cargo}` : ""}{" "}
                        <span className="text-muted-foreground text-xs">({g.tipo})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Local de trabalho</Label>
                <Select value={localTrabalho} onValueChange={setLocalTrabalho}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {locais.map((l) => (
                      <SelectItem key={l.id} value={l.valor}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vigência até</Label>
                <Input type="date" value={vigenciaFim} onChange={(e) => setVigenciaFim(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Jornada</Label>
              <Select value={jornada} onValueChange={setJornada}>
                <SelectTrigger><SelectValue placeholder="Selecione a jornada" /></SelectTrigger>
                <SelectContent>
                  {jornadas.map((j) => (
                    <SelectItem key={j.id} value={j.valor}>{j.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Benefícios</Label>

              {beneficiosSelecionados.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {beneficiosSelecionados.map((b, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-white" style={{ backgroundColor: "#C2185B" }}>
                      {b}
                      <button type="button" onClick={() => setBeneficiosSelecionados(beneficiosSelecionados.filter((_, idx) => idx !== i))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {beneficiosCatalogo.filter(b => !beneficiosSelecionados.includes(b.beneficio)).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {beneficiosCatalogo
                    .filter(b => !beneficiosSelecionados.includes(b.beneficio))
                    .map(b => (
                      <button key={b.id} type="button"
                        onClick={() => setBeneficiosSelecionados([...beneficiosSelecionados, b.beneficio])}
                        className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer border-border text-muted-foreground bg-background hover:bg-muted">
                        + {b.beneficio}
                      </button>
                    ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  placeholder="Adicionar benefício personalizado"
                  value={novoBeneficio}
                  onChange={(e) => setNovoBeneficio(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = novoBeneficio.trim();
                      if (val && !beneficiosSelecionados.includes(val)) {
                        setBeneficiosSelecionados([...beneficiosSelecionados, val]);
                        await salvarNovoBeneficio(val, tipoContrato || "todos");
                        setNovoBeneficio("");
                      }
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="shrink-0"
                  onClick={async () => {
                    const val = novoBeneficio.trim();
                    if (val && !beneficiosSelecionados.includes(val)) {
                      setBeneficiosSelecionados([...beneficiosSelecionados, val]);
                      await salvarNovoBeneficio(val, tipoContrato || "todos");
                      setNovoBeneficio("");
                    }
                  }}>
                  Confirmar
                </Button>
              </div>
            </div>

            {errosDuplicata.length > 0 && (
              <div className="p-3 rounded-lg border flex items-start gap-2.5"
                style={{ backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" }}>
                <span style={{ fontSize: 16 }}>🚫</span>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-red-700">
                    Vaga duplicada — não é possível criar
                  </p>
                  <p className="text-xs text-red-600">
                    {errosDuplicata[0]}
                  </p>
                  <p className="text-xs text-red-500 mt-1">
                    Se precisar de mais posições, edite a vaga existente
                    e aumente o número de vagas.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                onClick={async () => {
                  const isDuplicata = await verificarDuplicata();
                  if (!isDuplicata) setStep(2);
                }}
                disabled={!step1Valid || verificandoDuplicata}
              >
                {verificandoDuplicata
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando...</>
                  : <>Avançar <ArrowRight className="h-4 w-4 ml-2" /></>}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Missão da posição</Label>
              <Textarea value={missao} onChange={(e) => setMissao(e.target.value)}
                placeholder="O que essa pessoa vai resolver de verdade por aqui?" rows={3} />
            </div>

             {/* Responsabilidades */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Responsabilidades</Label>
              <p className="text-xs text-muted-foreground">Liste as principais atividades desta posição</p>

              {/* Tags adicionadas */}
              {responsabilidades.filter(r => r.trim()).length > 0 && (
                <div className="space-y-1.5">
                  {responsabilidades.map((r, i) => r.trim() ? (
                    <div key={i} className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#1A4A3A] flex-shrink-0" />
                      <Textarea
                        value={r}
                        onChange={(e) => updateItem(responsabilidades, setResponsabilidades, i, e.target.value)}
                        className="flex-1 resize-none text-sm border-0 p-0 bg-transparent focus-visible:ring-0 min-h-[40px]"
                      />
                      <Button
                        variant="ghost" size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive flex-shrink-0"
                        onClick={() => removeItem(responsabilidades, setResponsabilidades, i)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : null)}
                </div>
              )}

              {/* Sugestões do catálogo */}
              {area && nivel && responsabilidadesCatalogo.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    Sugeridas para {NIVEIS.find(n => n.value === nivel)?.label} em {area}:
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {responsabilidadesCatalogo
                      .filter(rc => !responsabilidades.includes(rc.responsabilidade))
                      .map(rc => (
                        <button key={rc.id} type="button"
                          onClick={() => {
                            const filtradas = responsabilidades.filter(r => r.trim());
                            setResponsabilidades([...filtradas, rc.responsabilidade]);
                          }}
                          className="flex items-start gap-2 text-left px-3 py-2 rounded-lg border border-dashed border-[#1A4A3A]/30 text-[#1A4A3A] hover:bg-[#1A4A3A]/5 transition-colors text-xs">
                          <span className="mt-0.5 flex-shrink-0">+</span>
                          <span>{rc.responsabilidade}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Input nova responsabilidade */}
              <div className="flex gap-2 mt-2">
                <Textarea
                  id="nova-resp-input"
                  rows={2}
                  placeholder="Descrever nova responsabilidade..."
                  className="flex-1 resize-none text-sm"
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const val = (e.target as HTMLTextAreaElement).value.trim();
                      if (val) {
                        const filtradas = responsabilidades.filter(r => r.trim());
                        setResponsabilidades([...filtradas, val]);
                        if (area) await salvarNovaResponsabilidade(val, area, nivelNormalizado);
                        (e.target as HTMLTextAreaElement).value = "";
                      }
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="self-end"
                  onClick={async () => {
                    const textarea = document.getElementById("nova-resp-input") as HTMLTextAreaElement;
                    const val = textarea?.value.trim();
                    if (val) {
                      const filtradas = responsabilidades.filter(r => r.trim());
                      setResponsabilidades([...filtradas, val]);
                      if (area) await salvarNovaResponsabilidade(val, area, nivelNormalizado);
                      textarea.value = "";
                    }
                  }}>
                  Confirmar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Enter confirma · Shift+Enter quebra linha</p>
            </div>

            {/* Skills obrigatórias */}
            <div className="space-y-2">
              <Label>Skills obrigatórias</Label>
              {skillsObrigatorias.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {skillsObrigatorias.map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-white" style={{ backgroundColor: "#1A4A3A" }}>
                      {s}
                      <button type="button" onClick={() => setSkillsObrigatorias(skillsObrigatorias.filter((_, idx) => idx !== i))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {area && nivel && skillsCatalogo.length > 0 && (
                <div className="space-y-2">
                  {skillsPorNivel.especificas.filter(s =>
                    !skillsObrigatorias.includes(s.skill) && !skillsDesejadas.includes(s.skill)
                  ).length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        Sugeridas para {NIVEIS.find(n => n.value === nivel)?.label} em {area}:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {skillsPorNivel.especificas
                          .filter(s => !skillsObrigatorias.includes(s.skill) && !skillsDesejadas.includes(s.skill))
                          .map(s => (
                            <button key={s.id} type="button"
                              onClick={() => setSkillsObrigatorias([...skillsObrigatorias, s.skill])}
                              className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer border-[#1A4A3A]/30 text-[#1A4A3A] bg-[#1A4A3A]/5 hover:bg-[#1A4A3A]/10">
                              + {s.skill}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {skillsPorNivel.gerais.filter(s =>
                    !skillsObrigatorias.includes(s.skill) && !skillsDesejadas.includes(s.skill)
                  ).length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Gerais de {area}:</p>
                      <div className="flex flex-wrap gap-1">
                        {skillsPorNivel.gerais
                          .filter(s => !skillsObrigatorias.includes(s.skill) && !skillsDesejadas.includes(s.skill))
                          .map(s => (
                            <button key={s.id} type="button"
                              onClick={() => setSkillsObrigatorias([...skillsObrigatorias, s.skill])}
                              className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer border-border text-muted-foreground bg-background hover:bg-muted">
                              + {s.skill}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  placeholder="Adicionar skill personalizada"
                  value={novaSkillObrig}
                  onChange={(e) => setNovaSkillObrig(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = novaSkillObrig.trim();
                      if (val && !skillsObrigatorias.includes(val)) {
                        setSkillsObrigatorias([...skillsObrigatorias, val]);
                        if (area) await salvarNovaSkill(val, area, nivelNormalizado, "obrigatoria");
                        setNovaSkillObrig("");
                      }
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="shrink-0"
                  onClick={async () => {
                    const val = novaSkillObrig.trim();
                    if (val && !skillsObrigatorias.includes(val)) {
                      setSkillsObrigatorias([...skillsObrigatorias, val]);
                      if (area) await salvarNovaSkill(val, area, nivelNormalizado, "obrigatoria");
                      setNovaSkillObrig("");
                    }
                  }}>
                  Confirmar
                </Button>
              </div>
            </div>

            {/* Skills desejadas */}
            <div className="space-y-2">
              <Label>Skills desejadas</Label>
              {skillsDesejadas.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {skillsDesejadas.map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-white" style={{ backgroundColor: "#1A6BBF" }}>
                      {s}
                      <button type="button" onClick={() => setSkillsDesejadas(skillsDesejadas.filter((_, idx) => idx !== i))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {area && nivel && skillsCatalogo.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {skillsCatalogo
                    .filter(s =>
                      (s.tipo === "desejada" || s.tipo === "ambos") &&
                      !skillsObrigatorias.includes(s.skill) &&
                      !skillsDesejadas.includes(s.skill)
                    )
                    .map(s => (
                      <button key={s.id} type="button"
                        onClick={() => setSkillsDesejadas([...skillsDesejadas, s.skill])}
                        className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100">
                        + {s.skill}
                      </button>
                    ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  placeholder="Adicionar skill personalizada"
                  value={novaSkillDesej}
                  onChange={(e) => setNovaSkillDesej(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = novaSkillDesej.trim();
                      if (val && !skillsDesejadas.includes(val)) {
                        setSkillsDesejadas([...skillsDesejadas, val]);
                        if (area) await salvarNovaSkill(val, area, nivelNormalizado, "desejada");
                        setNovaSkillDesej("");
                      }
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="shrink-0"
                  onClick={async () => {
                    const val = novaSkillDesej.trim();
                    if (val && !skillsDesejadas.includes(val)) {
                      setSkillsDesejadas([...skillsDesejadas, val]);
                      if (area) await salvarNovaSkill(val, area, nivelNormalizado, "desejada");
                      setNovaSkillDesej("");
                    }
                  }}>
                  Confirmar
                </Button>
              </div>
            </div>

            {/* Ferramentas / Sistemas */}
            <div className="space-y-2">
              <Label>Ferramentas / Sistemas</Label>

              {/* Tags selecionadas */}
              {ferramentasSelecionadas.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {ferramentasSelecionadas.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-white" style={{ backgroundColor: "#5E35B1" }}>
                      {f}
                      <button type="button" onClick={() => setFerramentasSelecionadas(ferramentasSelecionadas.filter((_, idx) => idx !== i))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Sugestões específicas da área */}
              {ferramentasEspecificas.filter(f => !ferramentasSelecionadas.includes(f.ferramenta)).length > 0 && (
                <div>
                  {area && (
                    <p className="text-xs text-muted-foreground mb-1">Usadas em {area}:</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {ferramentasEspecificas
                      .filter(f => !ferramentasSelecionadas.includes(f.ferramenta))
                      .map(f => (
                        <button key={f.id} type="button"
                          onClick={() => setFerramentasSelecionadas([...ferramentasSelecionadas, f.ferramenta])}
                          className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100">
                          + {f.ferramenta}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Ferramentas transversais */}
              {ferramentasTransversais.filter(f => !ferramentasSelecionadas.includes(f.ferramenta)).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Ferramentas gerais:</p>
                  <div className="flex flex-wrap gap-1">
                    {ferramentasTransversais
                      .filter(f => !ferramentasSelecionadas.includes(f.ferramenta))
                      .map(f => (
                        <button key={f.id} type="button"
                          onClick={() => setFerramentasSelecionadas([...ferramentasSelecionadas, f.ferramenta])}
                          className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer border-border text-muted-foreground bg-background hover:bg-muted">
                          + {f.ferramenta}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Input nova ferramenta */}
              <div className="flex gap-2">
                <Input
                  placeholder="Adicionar ferramenta personalizada"
                  value={novaFerramenta}
                  onChange={(e) => setNovaFerramenta(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = novaFerramenta.trim();
                      if (val && !ferramentasSelecionadas.includes(val)) {
                        setFerramentasSelecionadas([...ferramentasSelecionadas, val]);
                        await salvarNovaFerramenta(val, area || "todos");
                        setNovaFerramenta("");
                      }
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="shrink-0"
                  onClick={async () => {
                    const val = novaFerramenta.trim();
                    if (val && !ferramentasSelecionadas.includes(val)) {
                      setFerramentasSelecionadas([...ferramentasSelecionadas, val]);
                      await salvarNovaFerramenta(val, area || "todos");
                      setNovaFerramenta("");
                    }
                  }}>
                  Confirmar
                </Button>
              </div>
            </div>

            {/* Faixa salarial — only for super_admin and admin_rh */}
            {canSeeFaixa && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Faixa salarial mín.</Label>
                    <Input type="number" value={faixaMin} onChange={(e) => setFaixaMin(e.target.value)} placeholder="R$" />
                  </div>
                  <div className="space-y-2">
                    <Label>Faixa salarial máx.</Label>
                    <Input type="number" value={faixaMax} onChange={(e) => setFaixaMax(e.target.value)} placeholder="R$" />
                  </div>
                </div>

                {(() => {
                  const cargoMatch = cargosData.find((c) => c.nome === titulo);
                  const tipo = tipoContrato === "pj" ? "pj" : "clt";
                  const hasFaixa = cargoMatch && (cargoMatch as any)[`faixa_${tipo}_f1_min`] != null;
                  if (hasFaixa) {
                    return (
                      <div className="border rounded-md p-3 bg-muted/30 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Tabela PPR — {titulo} ({tipoContrato.toUpperCase()})</p>
                        {["F1","F2","F3","F4","F5"].map((fk, i) => {
                          const labels = ["Entrada","Desenvolvimento","Pleno","Sênior","Referência"];
                          const min = (cargoMatch as any)[`faixa_${tipo}_${fk.toLowerCase()}_min`];
                          const max = (cargoMatch as any)[`faixa_${tipo}_${fk.toLowerCase()}_max`];
                          return (
                            <div key={fk} className="flex items-center text-xs gap-2">
                              <span className="font-semibold w-8">{fk}</span>
                              <span className="text-muted-foreground w-28">· {labels[i]}</span>
                              <span>R$ {Number(min || 0).toLocaleString("pt-BR")} – R$ {Number(max || 0).toLocaleString("pt-BR")}</span>
                            </div>
                          );
                        })}
                        <p className="text-xs text-muted-foreground mt-2">
                          Pré-preenchido com F1 (entrada recomendada). Edite se necessário.
                        </p>
                      </div>
                    );
                  }
                  if (titulo && tipoContrato && tipoContrato !== "ambos") {
                    return <p className="text-xs text-muted-foreground">Cargo sem faixa no PPR. Preencha manualmente.</p>;
                  }
                  return null;
                })()}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
              </Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Vaga
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
