import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SmartBackButton } from "@/components/SmartBackButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Plus, Sparkles, X } from "lucide-react";
import { SelectDepartamentoHierarquico } from "@/components/shared/SelectDepartamentoHierarquico";
import { useTemplates } from "@/hooks/useTemplates";
import { mesclarFaixasSalariais } from "@/hooks/useCargos";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
const NIVEIS = [
  { value: "jr", label: "Júnior" },
  { value: "pl", label: "Pleno" },
  { value: "sr", label: "Sênior" },
  { value: "coordenacao", label: "Coordenação" },
  { value: "especialista", label: "Especialista" },
  { value: "c_level", label: "C-Level" },
];

const TIPOS = [
  { value: "clt", label: "CLT" },
  { value: "pj", label: "PJ" },
  { value: "ambos", label: "CLT + PJ" },
];

const FAIXA_KEYS = ["f1", "f2", "f3", "f4", "f5"] as const;
const FAIXA_LABELS = ["F1 · Entrada", "F2 · Desenvolvimento", "F3 · Pleno", "F4 · Sênior", "F5 · Referência"];

function toNum(v: string | number | null | undefined): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toStr(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

interface FormState {
  nome: string;
  nivel: string;
  departamento: string;
  departamento_id: string | null;
  template_id_padrao: string | null;
  tipo_contrato: string;
  is_clevel: boolean;
  protege_salario: boolean;
  missao: string;
  responsabilidades: string[];
  skills_obrigatorias: string[];
  skills_desejadas: string[];
  ferramentas: string[];
  [key: string]: string | boolean | number | null | string[];
}

function buildInitial(): FormState {
  const base: FormState = {
    nome: "", nivel: "jr", departamento: "", departamento_id: null, template_id_padrao: null, tipo_contrato: "ambos",
    is_clevel: false, protege_salario: false, missao: "",
    responsabilidades: [], skills_obrigatorias: [], skills_desejadas: [], ferramentas: [],
  };
  for (const f of FAIXA_KEYS) {
    base[`faixa_clt_${f}_min`] = "";
    base[`faixa_clt_${f}_max`] = "";
    base[`faixa_pj_${f}_min`] = "";
    base[`faixa_pj_${f}_max`] = "";
  }
  return base;
}

function FaixaRow({ label, minKey, maxKey, form, setField }: {
  label: string; minKey: string; maxKey: string;
  form: FormState; setField: (k: string, v: any) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label className="text-xs">{label} mín</Label>
        <Input type="number" value={String(form[minKey] ?? "")} onChange={(e) => setField(minKey, e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">{label} máx</Label>
        <Input type="number" value={String(form[maxKey] ?? "")} onChange={(e) => setField(maxKey, e.target.value)} />
      </div>
    </div>
  );
}

function TagInput({ values, onChange, placeholder, colorClass }: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  colorClass: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {values.map((s, i) => (
          <span key={i} className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs ${colorClass}`}>
            {s}
            <button type="button" onClick={() => onChange(values.filter((_, idx) => idx !== i))}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <Input
        placeholder={placeholder}
        onKeyDown={e => {
          if (e.key === "Enter") {
            e.preventDefault();
            const val = (e.target as HTMLInputElement).value.trim();
            if (val) {
              onChange([...values, val]);
              (e.target as HTMLInputElement).value = "";
            }
          }
        }}
      />
    </div>
  );
}

export default function CargoForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNovo = !id || id === "novo";
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(buildInitial);
  const [enriquecendo, setEnriquecendo] = useState(false);
  const { data: templates } = useTemplates();

  function setField(k: string, v: any) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function enriquecerComIA() {
    if (!form.nome || !form.nivel) {
      toast.error("Preencha o nome e o nível do cargo antes de enriquecer.");
      return;
    }
    setEnriquecendo(true);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-cargo", {
        body: { nome: form.nome, nivel: form.nivel, departamento: form.departamento || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      let algumPreenchido = false;
      setForm((f) => {
        const updated: any = { ...f };
        if (!f.missao && data.missao) { updated.missao = data.missao; algumPreenchido = true; }
        if ((!f.responsabilidades || f.responsabilidades.length === 0) && data.responsabilidades?.length) {
          updated.responsabilidades = data.responsabilidades; algumPreenchido = true;
        }
        if ((!f.skills_obrigatorias || f.skills_obrigatorias.length === 0) && data.skills_obrigatorias?.length) {
          updated.skills_obrigatorias = data.skills_obrigatorias; algumPreenchido = true;
        }
        if ((!f.skills_desejadas || f.skills_desejadas.length === 0) && data.skills_desejadas?.length) {
          updated.skills_desejadas = data.skills_desejadas; algumPreenchido = true;
        }
        if ((!f.ferramentas || f.ferramentas.length === 0) && data.ferramentas?.length) {
          updated.ferramentas = data.ferramentas; algumPreenchido = true;
        }
        const faixas = [
          "faixa_clt_f1_min", "faixa_clt_f1_max", "faixa_clt_f2_min", "faixa_clt_f2_max",
          "faixa_clt_f3_min", "faixa_clt_f3_max", "faixa_clt_f4_min", "faixa_clt_f4_max",
          "faixa_clt_f5_min", "faixa_clt_f5_max",
          "faixa_pj_f1_min", "faixa_pj_f1_max", "faixa_pj_f2_min", "faixa_pj_f2_max",
          "faixa_pj_f3_min", "faixa_pj_f3_max", "faixa_pj_f4_min", "faixa_pj_f4_max",
          "faixa_pj_f5_min", "faixa_pj_f5_max",
        ];
        for (const k of faixas) {
          if (!f[k] && data[k] != null) { updated[k] = data[k].toString(); algumPreenchido = true; }
        }
        return updated;
      });
      if (algumPreenchido) {
        toast.success("Campos vazios preenchidos com dados de mercado. Revise antes de salvar.");
      } else {
        toast.info("Este cargo já tem todas as informações preenchidas. Edite manualmente se quiser atualizar.");
      }
    } catch (err: any) {
      console.error("Erro ao enriquecer cargo:", err);
      toast.error("Não foi possível buscar dados de mercado. Tente novamente.");
    } finally {
      setEnriquecendo(false);
    }
  }


  const { data: cargo } = useQuery({
    queryKey: ["cargo", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cargos").select("*").eq("id", id!).single();
      if (error) throw error;
      // protege_salario e faixas vêm de cargos_faixas_salariais (fonte única)
      const [completo] = await mesclarFaixasSalariais([data]);
      return completo;
    },
    enabled: !isNovo,
  });

  useEffect(() => {
    if (!cargo) return;
    const state = buildInitial();
    state.nome = cargo.nome ?? "";
    state.nivel = cargo.nivel ?? "jr";
    state.departamento = cargo.departamento ?? "";
    state.departamento_id = (cargo as any).departamento_id ?? null;
    state.template_id_padrao = (cargo as any).template_id_padrao ?? null;
    state.tipo_contrato = cargo.tipo_contrato ?? "ambos";
    state.is_clevel = cargo.is_clevel ?? false;
    state.protege_salario = (cargo as any).protege_salario ?? false;
    state.missao = cargo.missao ?? "";
    state.responsabilidades = (cargo.responsabilidades as string[]) ?? [];
    state.skills_obrigatorias = (cargo.skills_obrigatorias as string[]) ?? [];
    state.skills_desejadas = (cargo.skills_desejadas as string[]) ?? [];
    state.ferramentas = (cargo.ferramentas as string[]) ?? [];
    for (const f of FAIXA_KEYS) {
      state[`faixa_clt_${f}_min`] = toStr((cargo as any)[`faixa_clt_${f}_min`]);
      state[`faixa_clt_${f}_max`] = toStr((cargo as any)[`faixa_clt_${f}_max`]);
      state[`faixa_pj_${f}_min`] = toStr((cargo as any)[`faixa_pj_${f}_min`]);
      state[`faixa_pj_${f}_max`] = toStr((cargo as any)[`faixa_pj_${f}_max`]);
    }
    setForm(state);
  }, [cargo]);

  const salvar = useMutation({
    mutationFn: async () => {
      // Campos "públicos" continuam em cargos (lida por anon na candidatura)
      const payload: any = {
        nome: form.nome,
        nivel: form.nivel,
        departamento: form.departamento || null,
        departamento_id: form.departamento_id,
        template_id_padrao: form.template_id_padrao,
        tipo_contrato: form.tipo_contrato,
        is_clevel: form.is_clevel,
        missao: form.missao || null,
        responsabilidades: form.responsabilidades.length > 0 ? form.responsabilidades : null,
        skills_obrigatorias: form.skills_obrigatorias.length > 0 ? form.skills_obrigatorias : null,
        skills_desejadas: form.skills_desejadas.length > 0 ? form.skills_desejadas : null,
        ferramentas: form.ferramentas.length > 0 ? form.ferramentas : null,
      };
      // protege_salario + faixas vão para cargos_faixas_salariais (RLS restrita)
      const faixasPayload: any = { protege_salario: form.protege_salario };
      for (const f of FAIXA_KEYS) {
        faixasPayload[`faixa_clt_${f}_min`] = toNum(form[`faixa_clt_${f}_min`] as string);
        faixasPayload[`faixa_clt_${f}_max`] = toNum(form[`faixa_clt_${f}_max`] as string);
        faixasPayload[`faixa_pj_${f}_min`] = toNum(form[`faixa_pj_${f}_min`] as string);
        faixasPayload[`faixa_pj_${f}_max`] = toNum(form[`faixa_pj_${f}_max`] as string);
      }
      let cargoId = id!;
      if (isNovo) {
        const { data: novo, error } = await supabase.from("cargos").insert(payload).select("id").single();
        if (error) throw error;
        cargoId = novo.id;
      } else {
        const { error } = await supabase.from("cargos").update(payload).eq("id", id!);
        if (error) throw error;
      }
      const { error: faixasError } = await supabase
        .from("cargos_faixas_salariais")
        .upsert({ cargo_id: cargoId, ...faixasPayload }, { onConflict: "cargo_id" });
      if (faixasError) throw faixasError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cargos"] });
      qc.invalidateQueries({ queryKey: ["cargo-detalhe"] });
      qc.invalidateQueries({ queryKey: ["cargo"] });
      toast.success(isNovo ? "Cargo criado!" : "Cargo atualizado!");
      navigate("/cargos");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  return (
    <PageShell>
      <div className="flex items-center gap-3">
        <SmartBackButton fallback="/pessoas/cargos" fallbackLabel="Cargos" />
        <PageHeader
          titulo={isNovo ? "Novo Cargo" : "Editar Cargo"}
          className="mb-0 flex-1"
        />
      </div>

      <div className="space-y-6">
        <div>
          <Label>Nome do cargo *</Label>
          <div className="flex gap-2">
            <Input value={form.nome} onChange={(e) => setField("nome", e.target.value)} placeholder="Ex: Analista Design Jr" className="flex-1" />
            <Button
              type="button"
              variant="outline"
              onClick={enriquecerComIA}
              disabled={!form.nome || !form.nivel || enriquecendo}
              title="Preencher missão, skills e faixas salariais com dados de mercado"
            >
              {enriquecendo ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Buscando...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" />Enriquecer com IA</>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Preencha o nome e o nível, depois clique em "Enriquecer com IA" para sugerir missão, skills e faixas salariais.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Nível *</Label>
            <Select value={form.nivel} onValueChange={(v) => setField("nivel", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NIVEIS.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo de contrato *</Label>
            <Select value={form.tipo_contrato} onValueChange={(v) => setField("tipo_contrato", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Departamento</Label>
          <SelectDepartamentoHierarquico
            valueId={form.departamento_id}
            valueTexto={form.departamento}
            onChange={(dep) => {
              setField("departamento_id", dep?.id || null);
              setField("departamento", dep?.label || "");
            }}
          />
        </div>

        <div>
          <Label>Template padrão</Label>
          <Select
            value={form.template_id_padrao || "__auto__"}
            onValueChange={(v) =>
              setField("template_id_padrao", v === "__auto__" ? null : v)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto__">Derivar automaticamente do nível</SelectItem>
              {(templates || []).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Usado ao criar usuário automaticamente no cadastro de colaborador.
          </p>
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.is_clevel} onChange={(e) => { setField("is_clevel", e.target.checked); if (e.target.checked) setField("protege_salario", true); }} />
            Cargo C-Level
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.protege_salario} onChange={(e) => setField("protege_salario", e.target.checked)} />
            Proteger salário
          </label>
        </div>

        {/* JOB DESCRIPTION */}
        <div className="space-y-4 pt-4 border-t">
          <p className="font-medium text-sm">Job Description</p>

          <div>
            <Label>Missão da posição</Label>
            <Textarea
              rows={3}
              value={form.missao ?? ""}
              placeholder="O que essa pessoa vai resolver de verdade por aqui?"
              onChange={e => setField("missao", e.target.value)}
            />
          </div>

          <div>
            <Label>Responsabilidades</Label>
            <div className="space-y-2">
              {(form.responsabilidades ?? []).map((r: string, i: number) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={r}
                    onChange={e => {
                      const arr = [...(form.responsabilidades ?? [])];
                      arr[i] = e.target.value;
                      setField("responsabilidades", arr);
                    }}
                    placeholder={`Responsabilidade ${i + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const arr = (form.responsabilidades ?? []).filter((_: string, idx: number) => idx !== i);
                      setField("responsabilidades", arr);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setField("responsabilidades", [...(form.responsabilidades ?? []), ""])}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar responsabilidade
              </Button>
            </div>
          </div>
        </div>

        {/* SKILLS */}
        <div className="space-y-4 pt-4 border-t">
          <p className="font-medium text-sm">Skills</p>

          <div>
            <Label>Skills obrigatórias</Label>
            <TagInput
              values={form.skills_obrigatorias ?? []}
              onChange={(v) => setField("skills_obrigatorias", v)}
              placeholder="Digite e pressione Enter"
              colorClass="bg-primary/15 text-primary"
            />
          </div>

          <div>
            <Label>Skills desejadas</Label>
            <TagInput
              values={form.skills_desejadas ?? []}
              onChange={(v) => setField("skills_desejadas", v)}
              placeholder="Digite e pressione Enter"
              colorClass="bg-info/10 text-info"
            />
          </div>

          <div>
            <Label>Ferramentas e sistemas</Label>
            <TagInput
              values={form.ferramentas ?? []}
              onChange={(v) => setField("ferramentas", v)}
              placeholder="Digite e pressione Enter"
              colorClass="bg-info/10 text-info"
            />
          </div>
        </div>

        {/* FAIXAS SALARIAIS */}
        <div className="space-y-3 pt-4 border-t">
          <p className="font-medium text-sm">Faixas salariais CLT</p>
          {FAIXA_KEYS.map((f, i) => (
            <FaixaRow key={`clt-${f}`} label={FAIXA_LABELS[i]} minKey={`faixa_clt_${f}_min`} maxKey={`faixa_clt_${f}_max`} form={form} setField={setField} />
          ))}
        </div>

        <div className="space-y-3">
          <p className="font-medium text-sm">Faixas salariais PJ</p>
          {FAIXA_KEYS.map((f, i) => (
            <FaixaRow key={`pj-${f}`} label={FAIXA_LABELS[i]} minKey={`faixa_pj_${f}_min`} maxKey={`faixa_pj_${f}_max`} form={form} setField={setField} />
          ))}
        </div>

        <Button className="w-full" disabled={!form.nome || salvar.isPending} onClick={() => salvar.mutate()}>
          {salvar.isPending ? "Salvando..." : isNovo ? "Criar cargo" : "Salvar alterações"}
        </Button>
      </div>
    </PageShell>
  );
}
