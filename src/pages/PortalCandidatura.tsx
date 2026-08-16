import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Loader2, Plus, CheckCircle2, FileText, Upload, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function PortalCandidatura() {
  const { id } = useParams<{ id: string }>();
  const [enviando, setEnviando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const [form, setForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    linkedin_url: "",
    experiencias: [{ cargo: "", empresa: "", periodo_inicio: "", periodo_fim: "", atual: false, descricao: "" }],
    formacoes: [{ curso: "", instituicao: "", nivel: "graduacao", status: "concluido", ano_conclusao: "" }],
    skills_candidato: [] as { skill: string; nivel: string }[],
    sistemas_candidato: [] as { sistema: string; nivel: string }[],
    mensagem: "",
    pretensao_salarial: "",
    consentimento_lgpd: false,
  });

  const { data: vaga, isLoading } = useQuery({
    queryKey: ["vaga-publica", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vagas")
        .select("*, cargos(skills_obrigatorias, skills_desejadas, ferramentas)")
        .eq("id", id!)
        .eq("status", "aberta")
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const skillsVaga = [
    ...((vaga?.skills_obrigatorias as string[] | null) ?? []).map((s: string) => ({ skill: s, obrigatoria: true })),
    ...((vaga?.skills_desejadas as string[] | null) ?? []).map((s: string) => ({ skill: s, obrigatoria: false })),
  ];
  const sistemasVaga: string[] = (vaga as any)?.cargos?.ferramentas ?? (vaga as any)?.ferramentas ?? [];

  const [arrastando, setArrastando] = useState(false);
  const [pdfCarregado, setPdfCarregado] = useState(false);
  const [nomePDF, setNomePDF] = useState("");

  async function processarPDF(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("PDF muito grande. Máximo 5MB.");
      return;
    }
    setImportando(true);
    setNomePDF(file.name);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("score-candidato", {
        body: { action: "parse_pdf", pdf_base64: base64 },
      });
      if (error) throw error;
      const perfil = data?.perfil;

      if (perfil && (perfil.nome || perfil.experiencias?.length > 0)) {
        setForm((f) => ({
          ...f,
          nome: perfil.nome || f.nome,
          email: perfil.email || f.email,
          telefone: perfil.telefone || f.telefone,
          linkedin_url: perfil.linkedin_url || f.linkedin_url,
          experiencias: perfil.experiencias?.length > 0 ? perfil.experiencias.slice(0, 3) : f.experiencias,
          formacoes: perfil.formacoes?.length > 0 ? perfil.formacoes : f.formacoes,
          skills_candidato: skillsVaga
            .filter(({ skill }) =>
              perfil.skills_identificadas?.some(
                (s: string) => s.toLowerCase().includes(skill.toLowerCase()) || skill.toLowerCase().includes(s.toLowerCase())
              )
            )
            .map(({ skill }) => ({ skill, nivel: "intermediario" })),
        }));
        setPdfCarregado(true);
        toast.success("Currículo importado! Revise os campos e complete o que faltar.");
      } else {
        toast.error("Não foi possível ler o PDF. Preencha manualmente.");
        setPdfCarregado(false);
      }
    } catch (error) {
      console.error("Erro ao processar PDF:", error);
      toast.error("Não foi possível ler o PDF. Preencha manualmente.");
      setPdfCarregado(false);
    } finally {
      setImportando(false);
    }
  }

  function toggleSkill(skill: string, nivel: string = "intermediario") {
    setForm((f) => {
      const existe = f.skills_candidato.find((s) => s.skill === skill);
      if (existe) return { ...f, skills_candidato: f.skills_candidato.filter((s) => s.skill !== skill) };
      return { ...f, skills_candidato: [...f.skills_candidato, { skill, nivel }] };
    });
  }

  function setNivelSkill(skill: string, nivel: string) {
    setForm((f) => ({
      ...f,
      skills_candidato: f.skills_candidato.map((s) => (s.skill === skill ? { ...s, nivel } : s)),
    }));
  }

  function toggleSistema(sistema: string, nivel: string = "intermediario") {
    setForm((f) => {
      const existe = f.sistemas_candidato.find((s) => s.sistema === sistema);
      if (existe) return { ...f, sistemas_candidato: f.sistemas_candidato.filter((s) => s.sistema !== sistema) };
      return { ...f, sistemas_candidato: [...f.sistemas_candidato, { sistema, nivel }] };
    });
  }

  async function calcularScore(candidatoId: string) {
    try {
      await supabase.functions.invoke("score-candidato", {
        body: {
          action: "calcular_score",
          candidato_id: candidatoId,
          vaga: {
            titulo: vaga?.titulo,
            nivel: vaga?.nivel,
            skills_obrigatorias: vaga?.skills_obrigatorias,
            skills_desejadas: vaga?.skills_desejadas,
            ferramentas: sistemasVaga,
            faixa_min: (vaga as any)?.faixa_min ?? null,
            faixa_max: (vaga as any)?.faixa_max ?? null,
          },
          candidato: {
            skills_candidato: form.skills_candidato,
            sistemas_candidato: form.sistemas_candidato,
            experiencias: form.experiencias,
            formacoes: form.formacoes,
            mensagem: form.mensagem,
            pretensao_salarial: form.pretensao_salarial ? Number(form.pretensao_salarial) : null,
          },
        },
      });
    } catch (e) {
      console.error("Erro ao calcular score:", e);
    }
  }

  async function submeterCandidatura() {
    if (!form.nome || !form.email || !form.consentimento_lgpd) {
      toast.error("Preencha nome, e-mail e aceite os termos LGPD.");
      return;
    }
    setEnviando(true);
    try {
      const { data: candidato, error } = await supabase
        .from("candidatos")
        .upsert(
          {
            vaga_id: id!,
            nome: form.nome,
            email: form.email,
            telefone: form.telefone || null,
            linkedin_url: form.linkedin_url || null,
            experiencias: form.experiencias,
            formacoes: form.formacoes,
            skills_candidato: form.skills_candidato,
            sistemas_candidato: form.sistemas_candidato,
            mensagem: form.mensagem || null,
            pretensao_salarial: form.pretensao_salarial ? Number(form.pretensao_salarial) : null,
            consentimento_lgpd: true,
            consentimento_lgpd_at: new Date().toISOString(),
            status: "recebido",
            origem: "portal",
          } as any,
          {
            onConflict: "vaga_id,email",
            ignoreDuplicates: false,
          }
        )
        .select()
        .single();

      if (error) throw error;

      // Enviar e-mail de confirmação para o candidato
      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "candidatura-recebida",
            recipientEmail: form.email,
            idempotencyKey: `candidatura-recebida-${candidato.id}`,
            templateData: {
              nome: form.nome,
              cargo: vaga?.titulo ?? "",
              area: vaga?.area ?? "",
              tipo: (vaga as any)?.tipo ?? "",
            },
          },
        });
      } catch (emailError) {
        console.error("Erro ao enviar e-mail de confirmação:", emailError);
      }

      // Score in background
      calcularScore(candidato.id);
      setEnviado(true);
    } catch (e: any) {
      toast.error("Erro ao enviar candidatura: " + e.message);
    } finally {
      setEnviando(false);
    }
  }

  const Header = () => (
    <header className="border-b border-border/40 bg-card/80 backdrop-blur-sm">
      <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
        <h1 className="text-3xl font-medium tracking-tight" style={{ color: "hsl(156, 28%, 22%)" }}>
          Fetély.
        </h1>
        <p className="text-sm text-muted-foreground italic hidden sm:block max-w-[280px] text-right">
          Vamos celebrar!! Venha criar algo novo...
        </p>
      </div>
    </header>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-3xl mx-auto px-6 py-20 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!vaga) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-3xl mx-auto px-6 py-20 text-center space-y-4">
          <h2 className="text-xl font-medium text-foreground">Esta vaga não está mais disponível.</h2>
          <p className="text-muted-foreground">A posição pode ter sido encerrada ou preenchida.</p>
        </div>
      </div>
    );
  }

  if (enviado) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-3xl mx-auto px-6 py-20 text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: "#1A4A3A" }}>
            <CheckCircle2 className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-medium text-foreground">Candidatura enviada!</h2>
          <p className="text-muted-foreground text-lg max-w-md mx-auto leading-relaxed">
            Recebemos sua candidatura para <strong>{vaga?.titulo}</strong>.
            Entraremos em contato em breve.
          </p>
          <p className="text-sm text-muted-foreground italic">
            A memória não guarda o preço, ela guarda a presença.
          </p>
        </div>
      </div>
    );
  }

  const tipoLabel = (vaga as any).tipo_contrato === "clt" ? "CLT" : (vaga as any).tipo_contrato === "pj" ? "PJ" : "CLT / PJ";

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* Título da vaga */}
        <div className="space-y-2">
          <h2 className="text-3xl font-medium text-primary">{vaga.titulo}</h2>
          <p className="text-sm text-muted-foreground">
            {vaga.area} · {tipoLabel}
            {(vaga as any).local_trabalho ? ` · ${(vaga as any).local_trabalho}` : ""}
          </p>
        </div>

        {/* Upload de currículo — PRIMEIRO */}
        <div className="rounded-xl overflow-hidden shadow-sm border">
          {/* Header explicativo */}
          <div className="px-6 py-4" style={{ backgroundColor: "#1A4A3A" }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  Comece pelo seu currículo
                </p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                  A IA lê o PDF e preenche o formulário automaticamente
                </p>
              </div>
            </div>
          </div>
          {/* Área de upload */}
          <div className="bg-card px-6 pb-6 pt-4 space-y-3">
            {/* O que acontece — 3 passos visuais */}
            {!pdfCarregado && !importando && (
              <div className="flex items-center gap-2 mb-4">
                {[
                  { num: "1", texto: "Faça upload do PDF" },
                  { num: "2", texto: "IA lê e extrai os dados" },
                  { num: "3", texto: "Formulário preenchido" },
                ].map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5 flex-1">
                    <span className="w-5 h-5 rounded-full text-xs font-medium flex items-center justify-center flex-shrink-0 text-white"
                      style={{ backgroundColor: "#1A4A3A" }}>
                      {p.num}
                    </span>
                    <span className="text-xs text-muted-foreground leading-tight">{p.texto}</span>
                    {i < 2 && <span className="text-muted-foreground/40 text-xs">→</span>}
                  </div>
                ))}
              </div>
            )}

            {!pdfCarregado ? (
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  arrastando ? "border-[#1A4A3A] bg-[#1A4A3A]/5" : "border-border hover:border-[#1A4A3A]/40"
                }`}
                onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastando(false);
                  const file = e.dataTransfer.files[0];
                  if (file?.type === "application/pdf") processarPDF(file);
                  else toast.error("Apenas arquivos PDF são aceitos.");
                }}
                onClick={() => document.getElementById("pdf-upload")?.click()}
              >
                <input id="pdf-upload" type="file" accept=".pdf" className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) processarPDF(file); }} />
                {importando ? (
                  <div className="space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto" style={{ color: "#1A4A3A" }} />
                    <p className="text-sm font-medium" style={{ color: "#1A4A3A" }}>
                      Lendo seu currículo...
                    </p>
                    <p className="text-xs text-muted-foreground">
                      A IA está extraindo suas experiências, formações e skills
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                      style={{ backgroundColor: "rgba(26,74,58,0.1)" }}>
                      <FileText className="h-6 w-6" style={{ color: "#1A4A3A" }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Arraste seu currículo ou clique para selecionar
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PDF · máx. 5MB · Exportado do LinkedIn ou qualquer currículo
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm">
                      <Upload className="h-4 w-4 mr-2" />
                      Selecionar PDF
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-xl border bg-success/10 border-success/40">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "#1A4A3A" }}>
                  <Check className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "#1A4A3A" }}>
                    Currículo lido com sucesso!
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {nomePDF} · Formulário preenchido automaticamente — revise abaixo
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground"
                  onClick={() => { setPdfCarregado(false); setNomePDF(""); }}>
                  Trocar
                </Button>
              </div>
            )}

            {/* Dica: pode preencher manualmente */}
            {!pdfCarregado && !importando && (
              <p className="text-xs text-center text-muted-foreground">
                Prefere preencher manualmente? Os campos abaixo ficam disponíveis mesmo sem upload.
              </p>
            )}
          </div>
        </div>

        {/* SEÇÃO 1 — Identificação */}
        <div className="bg-card rounded-xl p-6 space-y-4 shadow-sm border">
          <h2 className="font-medium text-sm uppercase tracking-wide" style={{ color: "#1A4A3A" }}>
            Quem é você
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs">Nome completo *</Label>
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Seu nome completo" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="seu@email.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} placeholder="(11) 99999-9999" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">LinkedIn (opcional)</Label>
            <Input
              value={form.linkedin_url}
              onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
              placeholder="linkedin.com/in/seu-perfil"
            />
          </div>
        </div>

        {/* SEÇÃO 2 — Experiências */}
        <div className="bg-card rounded-xl p-6 space-y-4 shadow-sm border">
          <h2 className="font-medium text-sm uppercase tracking-wide" style={{ color: "#1A4A3A" }}>
            Experiências profissionais
          </h2>
          <p className="text-xs text-muted-foreground">Últimas 3 experiências</p>

          {form.experiencias.map((exp, i) => (
            <div key={i} className="space-y-3 pb-4 border-b last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Experiência {i + 1}</span>
                {form.experiencias.length > 1 && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive"
                    onClick={() => setForm((f) => ({ ...f, experiencias: f.experiencias.filter((_, idx) => idx !== i) }))}>
                    Remover
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Cargo</Label>
                  <Input value={exp.cargo} onChange={(e) => {
                    const arr = [...form.experiencias]; arr[i] = { ...arr[i], cargo: e.target.value };
                    setForm((f) => ({ ...f, experiencias: arr }));
                  }} />
                </div>
                <div>
                  <Label className="text-xs">Empresa</Label>
                  <Input value={exp.empresa} onChange={(e) => {
                    const arr = [...form.experiencias]; arr[i] = { ...arr[i], empresa: e.target.value };
                    setForm((f) => ({ ...f, experiencias: arr }));
                  }} />
                </div>
                <div>
                  <Label className="text-xs">Início</Label>
                  <Input value={exp.periodo_inicio} placeholder="MM/YYYY" onChange={(e) => {
                    const arr = [...form.experiencias]; arr[i] = { ...arr[i], periodo_inicio: e.target.value };
                    setForm((f) => ({ ...f, experiencias: arr }));
                  }} />
                </div>
                <div>
                  <Label className="text-xs">Fim</Label>
                  <Input value={exp.periodo_fim} placeholder="MM/YYYY" disabled={exp.atual} onChange={(e) => {
                    const arr = [...form.experiencias]; arr[i] = { ...arr[i], periodo_fim: e.target.value };
                    setForm((f) => ({ ...f, experiencias: arr }));
                  }} />
                  <label className="flex items-center gap-1.5 mt-1 cursor-pointer">
                    <input type="checkbox" checked={exp.atual} onChange={(e) => {
                      const arr = [...form.experiencias]; arr[i] = { ...arr[i], atual: e.target.checked, periodo_fim: "" };
                      setForm((f) => ({ ...f, experiencias: arr }));
                    }} />
                    <span className="text-xs text-muted-foreground">Trabalho aqui atualmente</span>
                  </label>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">O que você fazia</Label>
                  <Textarea value={exp.descricao} rows={2} onChange={(e) => {
                    const arr = [...form.experiencias]; arr[i] = { ...arr[i], descricao: e.target.value };
                    setForm((f) => ({ ...f, experiencias: arr }));
                  }} />
                </div>
              </div>
            </div>
          ))}

          {form.experiencias.length < 3 && (
            <Button type="button" variant="ghost" size="sm" className="pl-0" style={{ color: "#1A4A3A" }}
              onClick={() => setForm((f) => ({
                ...f,
                experiencias: [...f.experiencias, { cargo: "", empresa: "", periodo_inicio: "", periodo_fim: "", atual: false, descricao: "" }],
              }))}>
              <Plus className="h-4 w-4 mr-1.5" /> Adicionar experiência
            </Button>
          )}
        </div>

        {/* SEÇÃO 3 — Formação */}
        <div className="bg-card rounded-xl p-6 space-y-4 shadow-sm border">
          <h2 className="font-medium text-sm uppercase tracking-wide" style={{ color: "#1A4A3A" }}>
            Formação acadêmica
          </h2>

          {form.formacoes.map((formItem, i) => (
            <div key={i} className="space-y-3 pb-4 border-b last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Formação {i + 1}</span>
                {form.formacoes.length > 1 && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive"
                    onClick={() => setForm((f) => ({ ...f, formacoes: f.formacoes.filter((_, idx) => idx !== i) }))}>
                    Remover
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Curso</Label>
                  <Input value={formItem.curso} placeholder="Ex: Administração" onChange={(e) => {
                    const arr = [...form.formacoes]; arr[i] = { ...arr[i], curso: e.target.value };
                    setForm((f) => ({ ...f, formacoes: arr }));
                  }} />
                </div>
                <div>
                  <Label className="text-xs">Instituição</Label>
                  <Input value={formItem.instituicao} placeholder="Ex: USP" onChange={(e) => {
                    const arr = [...form.formacoes]; arr[i] = { ...arr[i], instituicao: e.target.value };
                    setForm((f) => ({ ...f, formacoes: arr }));
                  }} />
                </div>
                <div>
                  <Label className="text-xs">Nível</Label>
                  <Select value={formItem.nivel} onValueChange={(v) => {
                    const arr = [...form.formacoes]; arr[i] = { ...arr[i], nivel: v };
                    setForm((f) => ({ ...f, formacoes: arr }));
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tecnico">Técnico</SelectItem>
                      <SelectItem value="graduacao">Graduação</SelectItem>
                      <SelectItem value="pos">Pós-graduação</SelectItem>
                      <SelectItem value="mba">MBA</SelectItem>
                      <SelectItem value="mestrado">Mestrado</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={formItem.status} onValueChange={(v) => {
                    const arr = [...form.formacoes]; arr[i] = { ...arr[i], status: v };
                    setForm((f) => ({ ...f, formacoes: arr }));
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="concluido">Concluído</SelectItem>
                      <SelectItem value="cursando">Cursando</SelectItem>
                      <SelectItem value="trancado">Trancado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}

          <Button type="button" variant="ghost" size="sm" className="pl-0" style={{ color: "#1A4A3A" }}
            onClick={() => setForm((f) => ({
              ...f,
              formacoes: [...f.formacoes, { curso: "", instituicao: "", nivel: "graduacao", status: "concluido", ano_conclusao: "" }],
            }))}>
            <Plus className="h-4 w-4 mr-1.5" /> Adicionar formação
          </Button>
        </div>

        {/* SEÇÃO 4 — Skills e Sistemas */}
        {(skillsVaga.length > 0 || sistemasVaga.length > 0) && (
          <div className="bg-card rounded-xl p-6 space-y-5 shadow-sm border">
            <div>
              <h2 className="font-medium text-sm uppercase tracking-wide" style={{ color: "#1A4A3A" }}>
                Skills e sistemas
              </h2>
              <p className="text-xs text-muted-foreground mt-1">Marque o que você domina e informe seu nível</p>
            </div>

            {skillsVaga.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Skills</p>
                <div className="space-y-2">
                  {skillsVaga.map(({ skill, obrigatoria }) => {
                    const selecionada = form.skills_candidato.find((s) => s.skill === skill);
                    return (
                      <div key={skill}
                        className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:border-primary/40 transition-colors"
                        style={{
                          backgroundColor: selecionada ? "#F0FFF4" : undefined,
                          borderColor: selecionada ? "#1A4A3A" : undefined,
                        }}
                        onClick={() => toggleSkill(skill)}>
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                            selecionada ? "border-transparent" : "border-border/40"
                          }`} style={selecionada ? { backgroundColor: "#1A4A3A" } : {}}>
                            {selecionada && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <span className="text-sm">{skill}</span>
                          {obrigatoria && <span className="text-xs font-medium" style={{ color: "#1A4A3A" }}>obrigatória</span>}
                        </div>
                        {selecionada && (
                          <select value={selecionada.nivel} className="text-xs border rounded px-2 py-1 bg-background"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => { e.stopPropagation(); setNivelSkill(skill, e.target.value); }}>
                            <option value="basico">Básico</option>
                            <option value="intermediario">Intermediário</option>
                            <option value="avancado">Avançado</option>
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {sistemasVaga.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Ferramentas e sistemas</p>
                <div className="space-y-2">
                  {sistemasVaga.map((sistema: string) => {
                    const selecionado = form.sistemas_candidato.find((s) => s.sistema === sistema);
                    return (
                      <div key={sistema}
                        className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:border-info/40 transition-colors"
                        style={{
                          backgroundColor: selecionado ? "#FAF5FF" : undefined,
                          borderColor: selecionado ? "#7C3AED" : undefined,
                        }}
                        onClick={() => toggleSistema(sistema)}>
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                            selecionado ? "bg-info border-info/40" : "border-border/40"
                          }`}>
                            {selecionado && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <span className="text-sm">{sistema}</span>
                        </div>
                        {selecionado && (
                          <select value={selecionado.nivel} className="text-xs border rounded px-2 py-1 bg-background"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              setForm((f) => ({
                                ...f,
                                sistemas_candidato: f.sistemas_candidato.map((s) =>
                                  s.sistema === sistema ? { ...s, nivel: e.target.value } : s
                                ),
                              }));
                            }}>
                            <option value="basico">Básico</option>
                            <option value="intermediario">Intermediário</option>
                            <option value="avancado">Avançado</option>
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SEÇÃO 5 — Por que a Fetely */}
        <div className="bg-card rounded-xl p-6 space-y-3 shadow-sm border">
          <h2 className="font-medium text-sm uppercase tracking-wide" style={{ color: "#1A4A3A" }}>
            Por que a Fetely?
          </h2>
          <Textarea
            value={form.mensagem}
            rows={4}
            placeholder="Conte um pouco sobre você e por que essa vaga faz sentido na sua história..."
            onChange={(e) => setForm((f) => ({ ...f, mensagem: e.target.value }))}
          />
        </div>

        {/* SEÇÃO 6 — Pretensão salarial */}
        <div className="bg-card rounded-xl p-6 space-y-3 shadow-sm border">
          <h2 className="font-medium text-sm uppercase tracking-wide" style={{ color: "#1A4A3A" }}>
            Pretensão salarial
          </h2>
          <p className="text-xs text-muted-foreground">Informe o valor mensal bruto (R$). Campo opcional mas ajuda no processo.</p>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">R$</span>
            <Input
              type="number"
              value={form.pretensao_salarial}
              onChange={(e) => setForm((f) => ({ ...f, pretensao_salarial: e.target.value }))}
              placeholder="Ex: 4000"
              className="pl-10"
            />
          </div>
        </div>

        {/* LGPD + Enviar */}
        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.consentimento_lgpd}
              onChange={(e) => setForm((f) => ({ ...f, consentimento_lgpd: e.target.checked }))}
              className="mt-0.5"
            />
            <span className="text-xs text-muted-foreground">
              Concordo com o uso dos meus dados pela Fetely para este processo seletivo.
              Dados retidos por até 180 dias após encerramento da vaga. (LGPD)
            </span>
          </label>

          <Button
            className="w-full h-12 text-base"
            style={{ backgroundColor: "#1A4A3A" }}
            disabled={!form.nome || !form.email || !form.consentimento_lgpd || enviando}
            onClick={submeterCandidatura}
          >
            {enviando ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
            ) : (
              "Quero fazer parte"
            )}
          </Button>
        </div>

        <footer className="text-center text-xs text-muted-foreground pt-6 pb-6 border-t border-border/30">
          © {new Date().getFullYear()} Fetely · Todos os direitos reservados
        </footer>
      </div>
    </div>
  );
}
