import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

type Dim = { id: string; nome: string; codigo?: string };

interface PessoaForm {
  nome_completo: string;
  cpf: string;
  rg: string;
  data_nascimento: string;
  genero: string;
  estado_civil: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  telefone: string;
  email_pessoal: string;
  contato_emergencia_nome: string;
  contato_emergencia_telefone: string;
  foto_url: string;
}

interface VinculoForm {
  tipo_vinculo: "CLT" | "PJ";
  cargo_id: string;
  departamento_id: string;
  unidade_id: string;
  data_inicio: string;
  valor_base: string;
  valor_transporte: string;
  valor_beneficios_extras: string;
  forma_pagamento_id: string;
  dia_vencimento: string;
  banco_nome: string;
  agencia: string;
  conta: string;
  tipo_conta: string;
  chave_pix: string;
  email_corporativo: string;
  observacoes: string;
  // PJ
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  categoria_pj: string;
  objeto: string;
  // CLT
  pis_pasep: string;
  ctps_numero: string;
  matricula: string;
  data_admissao: string;
  jornada_semanal: string;
}

const emptyPessoa: PessoaForm = {
  nome_completo: "", cpf: "", rg: "", data_nascimento: "", genero: "", estado_civil: "",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
  telefone: "", email_pessoal: "", contato_emergencia_nome: "", contato_emergencia_telefone: "", foto_url: "",
};

const emptyVinculo: VinculoForm = {
  tipo_vinculo: "CLT",
  cargo_id: "", departamento_id: "", unidade_id: "",
  data_inicio: new Date().toISOString().slice(0, 10),
  valor_base: "", valor_transporte: "", valor_beneficios_extras: "",
  forma_pagamento_id: "", dia_vencimento: "5",
  banco_nome: "", agencia: "", conta: "", tipo_conta: "", chave_pix: "",
  email_corporativo: "", observacoes: "",
  cnpj: "", razao_social: "", nome_fantasia: "", categoria_pj: "", objeto: "",
  pis_pasep: "", ctps_numero: "", matricula: "", data_admissao: "", jornada_semanal: "44",
};

function onlyDigits(s: string) { return (s || "").replace(/\D/g, ""); }

export default function PessoaForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [pessoa, setPessoa] = useState<PessoaForm>(emptyPessoa);
  const [vinculo, setVinculo] = useState<VinculoForm>(emptyVinculo);
  const [vinculoId, setVinculoId] = useState<string | null>(null);
  const [vinculoStatus, setVinculoStatus] = useState<"ativo" | "desligado" | null>(null);

  const [cargos, setCargos] = useState<Dim[]>([]);
  const [departamentos, setDepartamentos] = useState<Dim[]>([]);
  const [unidades, setUnidades] = useState<Dim[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<Dim[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pessoaExistente, setPessoaExistente] = useState<{ id: string; nome_completo: string } | null>(null);

  // Load dims
  useEffect(() => {
    (async () => {
      try {
        const [{ data: c }, { data: d }, { data: u }, { data: fp }] = await Promise.all([
          (supabase as any).from("cargos").select("id, nome").eq("ativo", true).order("nome"),
          (supabase as any).from("departamentos").select("id, nome").eq("ativo", true).order("nome"),
          (supabase as any).from("unidades").select("id, nome").order("nome"),
          (supabase as any).from("formas_pagamento").select("id, nome, codigo").order("ordem"),
        ]);
        setCargos((c || []) as Dim[]);
        setDepartamentos((d || []) as Dim[]);
        setUnidades((u || []) as Dim[]);
        setFormasPagamento((fp || []) as Dim[]);
      } catch (err: any) {
        toast.error("Erro ao carregar listas: " + humanizeError(err?.message || String(err)));
      }
    })();
  }, []);

  // Load pessoa (edit)
  useEffect(() => {
    if (!id) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const { data: p, error: pe } = await (supabase as any).from("pessoas").select("*").eq("id", id).maybeSingle();
        if (pe) throw pe;
        if (!p) throw new Error("Pessoa não encontrada");
        setPessoa({
          nome_completo: p.nome_completo || "", cpf: p.cpf || "", rg: p.rg || "",
          data_nascimento: p.data_nascimento || "", genero: p.genero || "", estado_civil: p.estado_civil || "",
          cep: p.cep || "", logradouro: p.logradouro || "", numero: p.numero || "",
          complemento: p.complemento || "", bairro: p.bairro || "", cidade: p.cidade || "", uf: p.uf || "",
          telefone: p.telefone || "", email_pessoal: p.email_pessoal || "",
          contato_emergencia_nome: p.contato_emergencia_nome || "",
          contato_emergencia_telefone: p.contato_emergencia_telefone || "",
          foto_url: p.foto_url || "",
        });

        // vinculo mais recente (preferindo ativo)
        const { data: vs } = await (supabase as any)
          .from("vinculos").select("*").eq("pessoa_id", id).order("data_inicio", { ascending: false });
        const v = (vs || []).find((x: any) => x.status === "ativo") || (vs || [])[0];
        if (v) {
          setVinculoId(v.id);
          setVinculoStatus(v.status);
          setVinculo({
            tipo_vinculo: v.tipo_vinculo,
            cargo_id: v.cargo_id || "", departamento_id: v.departamento_id || "", unidade_id: v.unidade_id || "",
            data_inicio: v.data_inicio || "",
            valor_base: v.valor_base?.toString() || "",
            valor_transporte: v.valor_transporte?.toString() || "",
            valor_beneficios_extras: v.valor_beneficios_extras?.toString() || "",
            forma_pagamento_id: v.forma_pagamento_id || "",
            dia_vencimento: v.dia_vencimento?.toString() || "5",
            banco_nome: v.banco_nome || "", agencia: v.agencia || "", conta: v.conta || "",
            tipo_conta: v.tipo_conta || "", chave_pix: v.chave_pix || "",
            email_corporativo: v.email_corporativo || "", observacoes: v.observacoes || "",
            cnpj: v.cnpj || "", razao_social: v.razao_social || "", nome_fantasia: v.nome_fantasia || "",
            categoria_pj: v.categoria_pj || "", objeto: v.objeto || "",
            pis_pasep: v.pis_pasep || "", ctps_numero: v.ctps_numero || "",
            matricula: v.matricula || "", data_admissao: v.data_admissao || "",
            jornada_semanal: v.jornada_semanal?.toString() || "44",
          });
        }
      } catch (err: any) {
        toast.error(humanizeError(err?.message || String(err)));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Checar CPF duplicado (só no create)
  async function checarCpfDuplicado(): Promise<string | "ok" | null> {
    const cpf = onlyDigits(pessoa.cpf);
    if (!cpf || cpf.length < 11 || isEdit) return "ok";
    const { data } = await (supabase as any).from("pessoas").select("id, nome_completo").eq("cpf", cpf).maybeSingle();
    if (data) {
      setPessoaExistente({ id: data.id, nome_completo: data.nome_completo });
      return data.id;
    }
    return "ok";
  }

  function toNum(s: string): number | null {
    if (!s || s.trim() === "") return null;
    const n = Number(s.replace(",", "."));
    return isNaN(n) ? null : n;
  }

  function payloadPessoa() {
    return {
      nome_completo: pessoa.nome_completo.trim(),
      cpf: onlyDigits(pessoa.cpf) || null,
      rg: pessoa.rg || null,
      data_nascimento: pessoa.data_nascimento || null,
      genero: pessoa.genero || null,
      estado_civil: pessoa.estado_civil || null,
      cep: pessoa.cep || null,
      logradouro: pessoa.logradouro || null,
      numero: pessoa.numero || null,
      complemento: pessoa.complemento || null,
      bairro: pessoa.bairro || null,
      cidade: pessoa.cidade || null,
      uf: pessoa.uf || null,
      telefone: pessoa.telefone || null,
      email_pessoal: pessoa.email_pessoal || null,
      contato_emergencia_nome: pessoa.contato_emergencia_nome || null,
      contato_emergencia_telefone: pessoa.contato_emergencia_telefone || null,
      foto_url: pessoa.foto_url || null,
    };
  }

  function payloadVinculo(pessoa_id: string) {
    const base: any = {
      pessoa_id,
      tipo_vinculo: vinculo.tipo_vinculo,
      cargo_id: vinculo.cargo_id || null,
      departamento_id: vinculo.departamento_id || null,
      unidade_id: vinculo.unidade_id || null,
      data_inicio: vinculo.data_inicio,
      valor_base: toNum(vinculo.valor_base),
      valor_transporte: toNum(vinculo.valor_transporte),
      valor_beneficios_extras: toNum(vinculo.valor_beneficios_extras),
      forma_pagamento_id: vinculo.forma_pagamento_id || null,
      dia_vencimento: toNum(vinculo.dia_vencimento),
      banco_nome: vinculo.banco_nome || null,
      agencia: vinculo.agencia || null,
      conta: vinculo.conta || null,
      tipo_conta: vinculo.tipo_conta || null,
      chave_pix: vinculo.chave_pix || null,
      email_corporativo: vinculo.email_corporativo || null,
      observacoes: vinculo.observacoes || null,
    };
    if (vinculo.tipo_vinculo === "PJ") {
      Object.assign(base, {
        cnpj: onlyDigits(vinculo.cnpj) || null,
        razao_social: vinculo.razao_social || null,
        nome_fantasia: vinculo.nome_fantasia || null,
        categoria_pj: vinculo.categoria_pj || null,
        objeto: vinculo.objeto || null,
      });
    } else {
      Object.assign(base, {
        pis_pasep: vinculo.pis_pasep || null,
        ctps_numero: vinculo.ctps_numero || null,
        matricula: vinculo.matricula || null,
        data_admissao: vinculo.data_admissao || null,
        jornada_semanal: toNum(vinculo.jornada_semanal),
      });
    }
    return base;
  }

  async function salvar() {
    if (!pessoa.nome_completo.trim()) { toast.error("Nome completo é obrigatório"); return; }
    if (!vinculo.data_inicio) { toast.error("Data de início do vínculo é obrigatória"); return; }

    setSaving(true);
    try {
      if (isEdit && id) {
        // UPDATE pessoa
        const { error: e1 } = await (supabase as any).from("pessoas").update(payloadPessoa()).eq("id", id);
        if (e1) throw e1;

        // UPDATE ou INSERT vinculo
        if (vinculoId) {
          const { error: e2 } = await (supabase as any).from("vinculos").update(payloadVinculo(id)).eq("id", vinculoId);
          if (e2) throw e2;
        } else {
          const { error: e2 } = await (supabase as any).from("vinculos").insert({ ...payloadVinculo(id), status: "ativo" });
          if (e2) throw e2;
        }
        toast.success("Pessoa atualizada");
        navigate("/pessoas");
      } else {
        // CREATE: checa CPF duplicado
        const dup = await checarCpfDuplicado();
        if (dup && dup !== "ok") {
          setSaving(false);
          return; // dialog cuidará
        }
        const { data: p, error: e1 } = await (supabase as any).from("pessoas").insert(payloadPessoa()).select("id").single();
        if (e1) throw e1;
        const novoId = p.id as string;
        const { error: e2 } = await (supabase as any).from("vinculos").insert({ ...payloadVinculo(novoId), status: "ativo" });
        if (e2) {
          toast.error("Pessoa criada mas o vínculo falhou: " + humanizeError(e2.message) + ". Edite a pessoa para completar.");
          navigate(`/pessoas/${novoId}/editar`);
          return;
        }
        toast.success("Pessoa cadastrada");
        navigate("/pessoas");
      }
    } catch (err: any) {
      toast.error(humanizeError(err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  }

  async function criarVinculoParaExistente() {
    if (!pessoaExistente) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("vinculos").insert({ ...payloadVinculo(pessoaExistente.id), status: "ativo" });
      if (error) throw error;
      toast.success("Vínculo criado para pessoa existente");
      navigate(`/pessoas/${pessoaExistente.id}/editar`);
    } catch (err: any) {
      toast.error(humanizeError(err?.message || String(err)));
    } finally {
      setSaving(false);
      setPessoaExistente(null);
    }
  }

  const tipo = vinculo.tipo_vinculo;

  if (loading) return <div className="p-6 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pessoas")}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{isEdit ? "Editar pessoa" : "Nova pessoa"}</h1>
          <p className="text-muted-foreground text-sm">Dados do ser humano e do vínculo com a Fetely</p>
        </div>
        {vinculoStatus === "desligado" && (
          <span className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">Vínculo desligado</span>
        )}
        <Button onClick={salvar} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      {/* BLOCO PESSOA */}
      <Card>
        <CardHeader><CardTitle>Pessoa</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2"><Label>Nome completo *</Label><Input value={pessoa.nome_completo} onChange={(e) => setPessoa({ ...pessoa, nome_completo: e.target.value })} /></div>
          <div><Label>CPF</Label><Input value={pessoa.cpf} onChange={(e) => setPessoa({ ...pessoa, cpf: e.target.value })} /></div>
          <div><Label>RG</Label><Input value={pessoa.rg} onChange={(e) => setPessoa({ ...pessoa, rg: e.target.value })} /></div>
          <div><Label>Data de nascimento</Label><Input type="date" value={pessoa.data_nascimento} onChange={(e) => setPessoa({ ...pessoa, data_nascimento: e.target.value })} /></div>
          <div>
            <Label>Gênero</Label>
            <Select value={pessoa.genero} onValueChange={(v) => setPessoa({ ...pessoa, genero: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="feminino">Feminino</SelectItem>
                <SelectItem value="masculino">Masculino</SelectItem>
                <SelectItem value="nao_binario">Não binário</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Estado civil</Label>
            <Select value={pessoa.estado_civil} onValueChange={(v) => setPessoa({ ...pessoa, estado_civil: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="solteiro">Solteiro(a)</SelectItem>
                <SelectItem value="casado">Casado(a)</SelectItem>
                <SelectItem value="uniao_estavel">União estável</SelectItem>
                <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                <SelectItem value="viuvo">Viúvo(a)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Telefone pessoal</Label><Input value={pessoa.telefone} onChange={(e) => setPessoa({ ...pessoa, telefone: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>E-mail pessoal</Label><Input type="email" value={pessoa.email_pessoal} onChange={(e) => setPessoa({ ...pessoa, email_pessoal: e.target.value })} /></div>

          <div><Label>CEP</Label><Input value={pessoa.cep} onChange={(e) => setPessoa({ ...pessoa, cep: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Logradouro</Label><Input value={pessoa.logradouro} onChange={(e) => setPessoa({ ...pessoa, logradouro: e.target.value })} /></div>
          <div><Label>Número</Label><Input value={pessoa.numero} onChange={(e) => setPessoa({ ...pessoa, numero: e.target.value })} /></div>
          <div><Label>Complemento</Label><Input value={pessoa.complemento} onChange={(e) => setPessoa({ ...pessoa, complemento: e.target.value })} /></div>
          <div><Label>Bairro</Label><Input value={pessoa.bairro} onChange={(e) => setPessoa({ ...pessoa, bairro: e.target.value })} /></div>
          <div><Label>Cidade</Label><Input value={pessoa.cidade} onChange={(e) => setPessoa({ ...pessoa, cidade: e.target.value })} /></div>
          <div><Label>UF</Label><Input value={pessoa.uf} maxLength={2} onChange={(e) => setPessoa({ ...pessoa, uf: e.target.value.toUpperCase() })} /></div>

          <div><Label>Contato de emergência — nome</Label><Input value={pessoa.contato_emergencia_nome} onChange={(e) => setPessoa({ ...pessoa, contato_emergencia_nome: e.target.value })} /></div>
          <div><Label>Contato de emergência — telefone</Label><Input value={pessoa.contato_emergencia_telefone} onChange={(e) => setPessoa({ ...pessoa, contato_emergencia_telefone: e.target.value })} /></div>
          <div><Label>URL da foto</Label><Input value={pessoa.foto_url} onChange={(e) => setPessoa({ ...pessoa, foto_url: e.target.value })} /></div>
        </CardContent>
      </Card>

      {/* BLOCO VÍNCULO */}
      <Card>
        <CardHeader><CardTitle>Vínculo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2 block">Tipo de vínculo *</Label>
            <RadioGroup
              value={vinculo.tipo_vinculo}
              onValueChange={(v) => setVinculo({ ...vinculo, tipo_vinculo: v as "CLT" | "PJ" })}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2"><RadioGroupItem value="CLT" id="clt" /><Label htmlFor="clt" className="cursor-pointer">CLT</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="PJ" id="pj" /><Label htmlFor="pj" className="cursor-pointer">PJ</Label></div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Cargo</Label>
              <Select value={vinculo.cargo_id} onValueChange={(v) => setVinculo({ ...vinculo, cargo_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Departamento</Label>
              <Select value={vinculo.departamento_id} onValueChange={(v) => setVinculo({ ...vinculo, departamento_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{departamentos.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={vinculo.unidade_id} onValueChange={(v) => setVinculo({ ...vinculo, unidade_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Data de início *</Label><Input type="date" value={vinculo.data_inicio} onChange={(e) => setVinculo({ ...vinculo, data_inicio: e.target.value })} /></div>
            <div><Label>E-mail corporativo</Label><Input type="email" value={vinculo.email_corporativo} onChange={(e) => setVinculo({ ...vinculo, email_corporativo: e.target.value })} /></div>
            <div />

            <div><Label>Valor base (R$)</Label><Input value={vinculo.valor_base} onChange={(e) => setVinculo({ ...vinculo, valor_base: e.target.value })} /></div>
            <div><Label>Vale-transporte (R$)</Label><Input value={vinculo.valor_transporte} onChange={(e) => setVinculo({ ...vinculo, valor_transporte: e.target.value })} /></div>
            <div><Label>Benefícios extras (R$)</Label><Input value={vinculo.valor_beneficios_extras} onChange={(e) => setVinculo({ ...vinculo, valor_beneficios_extras: e.target.value })} /></div>

            <div>
              <Label>Forma de pagamento</Label>
              <Select value={vinculo.forma_pagamento_id} onValueChange={(v) => setVinculo({ ...vinculo, forma_pagamento_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{formasPagamento.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Dia de vencimento</Label><Input type="number" min={1} max={31} value={vinculo.dia_vencimento} onChange={(e) => setVinculo({ ...vinculo, dia_vencimento: e.target.value })} /></div>
            <div />

            <div><Label>Banco</Label><Input value={vinculo.banco_nome} onChange={(e) => setVinculo({ ...vinculo, banco_nome: e.target.value })} /></div>
            <div><Label>Agência</Label><Input value={vinculo.agencia} onChange={(e) => setVinculo({ ...vinculo, agencia: e.target.value })} /></div>
            <div><Label>Conta</Label><Input value={vinculo.conta} onChange={(e) => setVinculo({ ...vinculo, conta: e.target.value })} /></div>
            <div>
              <Label>Tipo de conta</Label>
              <Select value={vinculo.tipo_conta} onValueChange={(v) => setVinculo({ ...vinculo, tipo_conta: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corrente">Corrente</SelectItem>
                  <SelectItem value="poupanca">Poupança</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2"><Label>Chave PIX</Label><Input value={vinculo.chave_pix} onChange={(e) => setVinculo({ ...vinculo, chave_pix: e.target.value })} /></div>
          </div>

          {tipo === "PJ" && (
            <div className="border-t pt-4">
              <h3 className="font-semibold text-sm mb-3">Dados da empresa (PJ)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><Label>CNPJ</Label><Input value={vinculo.cnpj} onChange={(e) => setVinculo({ ...vinculo, cnpj: e.target.value })} /></div>
                <div className="md:col-span-2"><Label>Razão social</Label><Input value={vinculo.razao_social} onChange={(e) => setVinculo({ ...vinculo, razao_social: e.target.value })} /></div>
                <div className="md:col-span-2"><Label>Nome fantasia</Label><Input value={vinculo.nome_fantasia} onChange={(e) => setVinculo({ ...vinculo, nome_fantasia: e.target.value })} /></div>
                <div><Label>Categoria PJ</Label><Input value={vinculo.categoria_pj} onChange={(e) => setVinculo({ ...vinculo, categoria_pj: e.target.value })} /></div>
                <div className="md:col-span-3"><Label>Objeto do contrato</Label><Textarea value={vinculo.objeto} onChange={(e) => setVinculo({ ...vinculo, objeto: e.target.value })} /></div>
              </div>
            </div>
          )}

          {tipo === "CLT" && (
            <div className="border-t pt-4">
              <h3 className="font-semibold text-sm mb-3">Dados CLT</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><Label>PIS/PASEP</Label><Input value={vinculo.pis_pasep} onChange={(e) => setVinculo({ ...vinculo, pis_pasep: e.target.value })} /></div>
                <div><Label>CTPS número</Label><Input value={vinculo.ctps_numero} onChange={(e) => setVinculo({ ...vinculo, ctps_numero: e.target.value })} /></div>
                <div><Label>Matrícula</Label><Input value={vinculo.matricula} onChange={(e) => setVinculo({ ...vinculo, matricula: e.target.value })} /></div>
                <div><Label>Data de admissão</Label><Input type="date" value={vinculo.data_admissao} onChange={(e) => setVinculo({ ...vinculo, data_admissao: e.target.value })} /></div>
                <div><Label>Jornada semanal (h)</Label><Input type="number" value={vinculo.jornada_semanal} onChange={(e) => setVinculo({ ...vinculo, jornada_semanal: e.target.value })} /></div>
              </div>
            </div>
          )}

          <div>
            <Label>Observações</Label>
            <Textarea value={vinculo.observacoes} onChange={(e) => setVinculo({ ...vinculo, observacoes: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!pessoaExistente} onOpenChange={(open) => { if (!open) setPessoaExistente(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pessoa já cadastrada</AlertDialogTitle>
            <AlertDialogDescription>
              Já existe uma pessoa com esse CPF: <strong>{pessoaExistente?.nome_completo}</strong>. Deseja criar um novo vínculo para ela em vez de duplicar o cadastro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void criarVinculoParaExistente(); }} disabled={saving}>
              Criar vínculo para pessoa existente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
