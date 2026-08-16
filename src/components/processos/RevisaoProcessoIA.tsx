import { useEffect, useState } from "react";
import { Loader2, Save, Trash2, Plus, Sparkles, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { MermaidRenderer } from "@/components/processos/MermaidRenderer";

interface Etapa {
  ordem: number;
  titulo: string;
  descricao: string;
  responsavel: string;
}

interface KpiCandidato {
  nome: string;
  unidade: string;
}

interface Props {
  resultadoIa: any;
  importacaoId: string;
  onCancel: () => void;
}

const AREAS_NEGOCIO = [
  { value: "rh", label: "RH" },
  { value: "ti", label: "TI" },
  { value: "comercial", label: "Comercial" },
  { value: "financeiro", label: "Financeiro" },
  { value: "produto", label: "Produto" },
  { value: "marketing", label: "Marketing" },
  { value: "logistica", label: "Logística" },
  { value: "operacional", label: "Operacional" },
  { value: "administrativo", label: "Administrativo" },
];

const NATUREZAS = [
  { value: "gera_valor", label: "Gera valor" },
  { value: "mantem_valor", label: "Mantém valor" },
  { value: "reduz_risco", label: "Reduz risco" },
];

// Preview Mermaid com debounce — reaproveita MermaidRenderer
function MermaidLivePreview({ code }: { code: string }) {
  const [debounced, setDebounced] = useState(code);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(code), 500);
    return () => clearTimeout(timer);
  }, [code]);

  if (!code.trim()) {
    return (
      <div className="h-[280px] border rounded-md bg-muted/20 flex items-center justify-center text-xs text-muted-foreground italic">
        Sem código — preview vazio
      </div>
    );
  }

  return (
    <div className="h-[280px] border rounded-md bg-card p-3 overflow-auto flex items-start justify-center">
      <MermaidRenderer codigo={debounced} className="w-full [&_svg]:max-w-full [&_svg]:h-auto" />
    </div>
  );
}

export function RevisaoProcessoIA({ resultadoIa, importacaoId, onCancel }: Props) {
  const navigate = useNavigate();

  const [nome, setNome] = useState<string>(resultadoIa.nome || "");
  const [descricao, setDescricao] = useState<string>(resultadoIa.descricao || "");
  const [narrativa, setNarrativa] = useState<string>(resultadoIa.narrativa || "");
  const [area, setArea] = useState<string>(resultadoIa.area_sugerida || "");
  const [natureza, setNatureza] = useState<string>(resultadoIa.natureza_valor_sugerida || "");
  const [sensivel, setSensivel] = useState<boolean>(!!resultadoIa.sensivel_sugerido);
  const [responsavel, setResponsavel] = useState<string>(resultadoIa.responsavel_sugerido || "");
  const [diagramaMermaid, setDiagramaMermaid] = useState<string>(resultadoIa.diagrama_mermaid || "");
  const [tags, setTags] = useState<string[]>(resultadoIa.tags_sugeridas || []);
  const [tagInput, setTagInput] = useState("");
  const [etapas, setEtapas] = useState<Etapa[]>(resultadoIa.etapas_sugeridas || []);
  const [kpis, setKpis] = useState<KpiCandidato[]>(resultadoIa.kpis_candidatos || []);

  const [salvando, setSalvando] = useState(false);

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const addEtapa = () => {
    setEtapas([
      ...etapas,
      { ordem: etapas.length + 1, titulo: "", descricao: "", responsavel: "" },
    ]);
  };

  const updateEtapa = (idx: number, field: keyof Etapa, value: any) => {
    const novas = [...etapas];
    (novas[idx] as any)[field] = value;
    setEtapas(novas);
  };

  const removeEtapa = (idx: number) => {
    const novas = etapas.filter((_, i) => i !== idx);
    novas.forEach((e, i) => (e.ordem = i + 1));
    setEtapas(novas);
  };

  const addKpi = () => {
    setKpis([...kpis, { nome: "", unidade: "" }]);
  };

  const updateKpi = (idx: number, field: keyof KpiCandidato, value: string) => {
    const novos = [...kpis];
    novos[idx][field] = value;
    setKpis(novos);
  };

  const removeKpi = (idx: number) => {
    setKpis(kpis.filter((_, i) => i !== idx));
  };

  const handleSalvar = async () => {
    if (!nome.trim()) {
      toast.error("Nome do processo é obrigatório");
      return;
    }
    if (!area) {
      toast.error("Selecione a área");
      return;
    }

    setSalvando(true);
    try {
      // Buscar area_negocio_id correspondente ao valor textual
      const { data: areaRec } = await supabase
        .from("parametros")
        .select("id")
        .eq("categoria", "area_negocio")
        .eq("valor", area)
        .maybeSingle();

      const areaId = (areaRec as any)?.id || null;

      const codigo = `PROC-${Date.now().toString(36).toUpperCase()}`;

      const payload: any = {
        codigo,
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        narrativa: narrativa.trim() || null,
        area_negocio_id: areaId,
        natureza_valor: natureza || null,
        sensivel,
        status_valor: "rascunho",
        diagrama_mermaid: diagramaMermaid.trim() || null,
        tags,
        importado_de_pdf: true,
        importacao_pdf_id: importacaoId,
      };

      const { data: processoCriado, error: errCriar } = await supabase
        .from("processos")
        .insert(payload)
        .select("id")
        .single();

      if (errCriar) throw errCriar;

      if (importacaoId) {
        await supabase
          .from("processos_importacoes_pdf")
          .update({
            processos_criados: [processoCriado.id],
          })
          .eq("id", importacaoId);
      }

      // Criar entrada RASCUNHO no Fala Fetely para revisão admin
      try {
        const conteudoFalaFetely = [
          `**${nome.trim()}**`,
          descricao.trim() || "",
          "",
          "## Narrativa",
          narrativa.trim() || "",
          "",
          etapas.length > 0 ? "## Etapas" : "",
          ...etapas.map((e) => `${e.ordem}. **${e.titulo}** — ${e.descricao}${e.responsavel ? ` (resp: ${e.responsavel})` : ""}`),
          "",
          kpis.length > 0 ? "## KPIs candidatos" : "",
          ...kpis.map((k) => `- ${k.nome}${k.unidade ? ` (${k.unidade})` : ""}`),
        ].filter(Boolean).join("\n");

        const tagsFalaFetely = [
          ...tags,
          "auto-gerado-pdf",
          "revisar-antes-de-publicar",
        ];

        // Buscar user atual pra criado_por
        const { data: { user: usr } } = await supabase.auth.getUser();

        await supabase.from("fala_fetely_conhecimento").insert({
          categoria: "diretriz", // categoria mais próxima de "processo" no CHECK
          titulo: nome.trim(),
          conteudo: conteudoFalaFetely,
          area_negocio: area,
          publico_alvo: "admin_rh",
          fonte: `Importação PDF · ${(resultadoIa as any).arquivo_nome || "PDF importado"}`,
          tags: tagsFalaFetely,
          ativo: false, // RASCUNHO — admin precisa aprovar
          origem: "sugestao_ia",
          criado_por: usr?.id || null,
          sugerido_por: usr?.id || null,
        });
      } catch (e: any) {
        console.error("Erro ao criar entrada Fala Fetely:", e);
        // Não bloqueia o fluxo do processo principal
      }

      toast.success("Processo criado como rascunho!");
      navigate(`/processos/${processoCriado.id}`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar processo");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Badge variant="secondary" className="gap-1 mb-2">
            <Sparkles className="h-3 w-3 text-info" />
            Sugerido pela IA — revise antes de salvar
          </Badge>
          <h1 className="text-2xl font-medium tracking-tight">Revisão do processo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ajuste o que precisar. O processo será salvo como rascunho.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={salvando}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Descartar
          </Button>
          <Button onClick={handleSalvar} disabled={salvando} className="gap-1.5">
            {salvando ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando...</>
            ) : (
              <><Save className="h-3.5 w-3.5" /> Criar processo</>
            )}
          </Button>
        </div>
      </div>

      {/* Dados básicos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados básicos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="descricao">Descrição curta</Label>
            <Input id="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="narrativa">Narrativa completa</Label>
            <Textarea id="narrativa" rows={8} value={narrativa} onChange={(e) => setNarrativa(e.target.value)} className="font-mono text-sm" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Área *</Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {AREAS_NEGOCIO.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Natureza de valor</Label>
              <Select value={natureza} onValueChange={setNatureza}>
                <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                <SelectContent>
                  {NATUREZAS.map((n) => (
                    <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Responsável sugerido</Label>
              <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="ex: admin_rh" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sensivel"
              checked={sensivel}
              onChange={(e) => setSensivel(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="sensivel" className="text-sm cursor-pointer">
              Processo sensível (acesso restrito a admin)
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tags</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1">
                {t}
                <button
                  onClick={() => removeTag(t)}
                  className="ml-1 hover:text-destructive"
                  type="button"
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="nova tag..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <Button variant="outline" size="sm" onClick={addTag}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Etapas */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Etapas do processo</CardTitle>
          <Button variant="outline" size="sm" onClick={addEtapa} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Etapa
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {etapas.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Nenhuma etapa. Clique em "+ Etapa".</p>
          )}
          {etapas.map((etapa, idx) => (
            <div key={idx} className="flex gap-2 items-start border rounded-md p-3 bg-muted/20">
              <GripVertical className="h-4 w-4 text-muted-foreground mt-2 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <span className="text-xs text-muted-foreground mt-2 shrink-0 w-4">{etapa.ordem}.</span>
                  <Input
                    value={etapa.titulo}
                    onChange={(e) => updateEtapa(idx, "titulo", e.target.value)}
                    placeholder="Título da etapa"
                    className="flex-1"
                  />
                </div>
                <Textarea
                  value={etapa.descricao}
                  onChange={(e) => updateEtapa(idx, "descricao", e.target.value)}
                  placeholder="O que acontece nessa etapa"
                  rows={2}
                  className="text-sm"
                />
                <Input
                  value={etapa.responsavel}
                  onChange={(e) => updateEtapa(idx, "responsavel", e.target.value)}
                  placeholder="Responsável (role ou nome)"
                  className="text-sm"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeEtapa(idx)}
                className="h-8 w-8 text-destructive shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* KPIs candidatos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">KPIs candidatos</CardTitle>
          <Button variant="outline" size="sm" onClick={addKpi} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> KPI
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {kpis.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Nenhum KPI. Adicione se quiser.</p>
          )}
          {kpis.map((kpi, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <Input
                placeholder="Nome do KPI"
                value={kpi.nome}
                onChange={(e) => updateKpi(idx, "nome", e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Unidade (ex: dias, %)"
                value={kpi.unidade}
                onChange={(e) => updateKpi(idx, "unidade", e.target.value)}
                className="w-32"
              />
              <Button variant="ghost" size="icon" onClick={() => removeKpi(idx)} className="h-8 w-8 text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Diagrama Mermaid com preview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Diagrama (Mermaid)</CardTitle>
            <p className="text-[10px] text-muted-foreground">Edite à esquerda · preview à direita</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Código</Label>
              <Textarea
                value={diagramaMermaid}
                onChange={(e) => setDiagramaMermaid(e.target.value)}
                rows={10}
                className="font-mono text-xs h-[280px] resize-none"
                placeholder="flowchart TD..."
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Preview</Label>
              <MermaidLivePreview code={diagramaMermaid} />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Sugestão gerada pela IA. Você pode editar ou apagar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
