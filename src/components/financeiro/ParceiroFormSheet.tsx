import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, AlertTriangle, FolderOpen, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { fetchCep } from "@/lib/viacep";
import { CategoriaCombobox, CategoriaOption } from "@/components/financeiro/CategoriaCombobox";
import { GrupoEmpresarialCombobox } from "@/components/financeiro/GrupoEmpresarialCombobox";
import { useCentrosCusto } from "@/hooks/financeiro/useCentrosCusto";
import { useCanaisVenda } from "@/hooks/financeiro/useCanaisVenda";
import { useFormasPagamento } from "@/hooks/financeiro/useFormasPagamento";

export type Parceiro = {
  id: string;
  tipo_pessoa: "PF" | "PJ" | null;
  cnpj: string | null;
  cpf: string | null;
  rg: string | null;
  data_nascimento: string | null;
  razao_social: string;
  nome_fantasia: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  email: string | null;
  tipo: string | null;
  tipos: string[] | null;
  canal_venda_id: string | null;
  segmento: string | null;
  categoria_padrao_id: string | null;
  centro_custo_id: string | null;
  tags: string[] | null;
  grupo_id: string | null;
  forma_pagamento_padrao_id: string | null;
  pix_chave: string | null;
  pix_tipo: string | null;
  dados_bancarios: {
    banco?: string | null;
    agencia?: string | null;
    conta?: string | null;
    tipo_conta?: string | null;
    titular?: string | null;
  } | null;
  ativo: boolean | null;
  observacao: string | null;
  origem: string | null;
  cadastro_incompleto?: boolean | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: Parceiro | null;
  categorias: CategoriaOption[];
  onSaved?: (id: string) => void;
  /** Pré-preenche os campos ao abrir em modo criação. */
  prefill?: {
    razao_social?: string;
    cnpj?: string;
    nome_fantasia?: string;
  };
  /**
   * Quando true, desativa o botão Cancelar e exige completar campos críticos
   * (Razão Social, CNPJ, Nome Fantasia). Usado no auto-cadastro vindo de NF.
   */
  obrigatorio?: boolean;
}

function maskCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}
function maskCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}
function maskCep(v: string) {
  return v.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}

export function ParceiroFormSheet({ open, onOpenChange, editing, categorias, onSaved, prefill, obrigatorio }: Props) {
  const qc = useQueryClient();
  const isEdit = !!editing;

  const { data: centrosCusto = [] } = useCentrosCusto();
  const { data: canaisVenda = [] } = useCanaisVenda();
  const { data: formasPagamento = [] } = useFormasPagamento();

  const [tiposSelecionados, setTiposSelecionados] = useState<string[]>(["fornecedor"]);
  const [tipoPessoa, setTipoPessoa] = useState<"PF" | "PJ">("PJ");
  const [cnpj, setCnpj] = useState("");
  const [cpf, setCpf] = useState("");
  const [rg, setRg] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [canalVendaId, setCanalVendaId] = useState<string | null>(null);
  const [segmento, setSegmento] = useState("");
  const [categoriaPadrao, setCategoriaPadrao] = useState<string | null>(null);
  const [centroCustoId, setCentroCustoId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [grupoId, setGrupoId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [observacao, setObservacao] = useState("");
  const [formaPagamentoPadraoId, setFormaPagamentoPadraoId] = useState<string | null>(null);
  const [pixTipo, setPixTipo] = useState<string>("");
  const [pixChave, setPixChave] = useState("");
  const [bcoBanco, setBcoBanco] = useState("");
  const [bcoAgencia, setBcoAgencia] = useState("");
  const [bcoConta, setBcoConta] = useState("");
  const [bcoTipoConta, setBcoTipoConta] = useState<string>("");
  const [bcoTitular, setBcoTitular] = useState("");
  const [duplicateWarn, setDuplicateWarn] = useState<string | null>(null);

  const { data: grupoInfo } = useQuery({
    queryKey: ["grupo-info", grupoId],
    enabled: !!grupoId,
    queryFn: async () => {
      const { data } = await supabase
        .from("grupos_empresariais")
        .select("id, nome")
        .eq("id", grupoId)
        .maybeSingle();
      return data;
    },
  });

  const { data: irmaos } = useQuery({
    queryKey: ["grupo-irmaos", grupoId, editing?.id],
    enabled: !!grupoId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social, nome_fantasia, cnpj, tipos, ativo")
        .eq("grupo_id", grupoId)
        .neq("id", editing?.id || "")
        .order("razao_social");
      return data || [];
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTiposSelecionados(editing.tipos?.length ? editing.tipos : ["fornecedor"]);
      setTipoPessoa((editing.tipo_pessoa as "PF" | "PJ") || "PJ");
      setCnpj(editing.cnpj ? maskCnpj(editing.cnpj) : "");
      setCpf(editing.cpf ? maskCpf(editing.cpf) : "");
      setRg(editing.rg || "");
      setDataNascimento(editing.data_nascimento || "");
      setRazaoSocial(editing.razao_social || "");
      setNomeFantasia(editing.nome_fantasia || "");
      setCep(editing.cep ? maskCep(editing.cep) : "");
      setLogradouro(editing.logradouro || "");
      setNumero(editing.numero || "");
      setBairro(editing.bairro || "");
      setCidade(editing.cidade || "");
      setUf(editing.uf || "");
      setTelefone(editing.telefone || "");
      setEmail(editing.email || "");
      setCanalVendaId(editing.canal_venda_id ?? null);
      setSegmento(editing.segmento || "");
      setCategoriaPadrao(editing.categoria_padrao_id);
      setCentroCustoId(editing.centro_custo_id ?? null);
      setTags(editing.tags || []);
      setGrupoId(editing.grupo_id ?? null);
      setObservacao(editing.observacao || "");
      setFormaPagamentoPadraoId(editing.forma_pagamento_padrao_id ?? null);
      setPixTipo(editing.pix_tipo || "");
      setPixChave(editing.pix_chave || "");
      setBcoBanco(editing.dados_bancarios?.banco || "");
      setBcoAgencia(editing.dados_bancarios?.agencia || "");
      setBcoConta(editing.dados_bancarios?.conta || "");
      setBcoTipoConta(editing.dados_bancarios?.tipo_conta || "");
      setBcoTitular(editing.dados_bancarios?.titular || "");
    } else {
      setTiposSelecionados(["fornecedor"]);
      setTipoPessoa("PJ");
      setCnpj(prefill?.cnpj ? maskCnpj(prefill.cnpj) : "");
      setCpf("");
      setRg("");
      setDataNascimento("");
      setRazaoSocial(prefill?.razao_social || "");
      // Nome Fantasia: usa o valor explícito do prefill OU adota a razão social como default
      // (evita travar o fluxo de importação - usuário pode editar depois no cadastro)
      setNomeFantasia(prefill?.nome_fantasia || prefill?.razao_social || "");
      setCep("");
      setLogradouro("");
      setNumero("");
      setBairro("");
      setCidade("");
      setUf("");
      setTelefone("");
      setEmail("");
      setCanalVendaId(null);
      setSegmento("");
      setCategoriaPadrao(null);
      setCentroCustoId(null);
      setTags([]);
      setGrupoId(null);
      setObservacao("");
      setFormaPagamentoPadraoId(null);
      setPixTipo("");
      setPixChave("");
      setBcoBanco("");
      setBcoAgencia("");
      setBcoConta("");
      setBcoTipoConta("");
      setBcoTitular("");
    }
    setDuplicateWarn(null);
    setTagInput("");
  }, [open, editing]);

  // Check duplicate CNPJ/CPF on blur
  const checkDuplicate = async () => {
    if (tipoPessoa === "PJ") {
      const clean = cnpj.replace(/\D/g, "");
      if (clean.length !== 14) return;
      if (editing && editing.cnpj === clean) return;
      const { data } = await supabase
        .from("parceiros_comerciais")
        .select("id, razao_social")
        .eq("cnpj", clean)
        .maybeSingle();
      setDuplicateWarn(data ? `Já cadastrado: ${data.razao_social}` : null);
    } else {
      const clean = cpf.replace(/\D/g, "");
      if (clean.length !== 11) return;
      if (editing && editing.cpf === clean) return;
      const { data } = await supabase
        .from("parceiros_comerciais")
        .select("id, razao_social")
        .eq("cpf", clean)
        .maybeSingle();
      setDuplicateWarn(data ? `Já cadastrado: ${data.razao_social}` : null);
    }
  };

  // ViaCEP autocomplete
  const handleCepBlur = async () => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    const result = await fetchCep(clean);
    if (result) {
      setLogradouro(result.logradouro);
      setBairro(result.bairro);
      setCidade(result.localidade);
      setUf(result.uf);
    }
  };

  const toggleTipo = (tipo: string) => {
    setTiposSelecionados((prev) =>
      prev.includes(tipo) ? prev.filter((t) => t !== tipo) : [...prev, tipo],
    );
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!razaoSocial.trim()) throw new Error(tipoPessoa === "PF" ? "Nome completo é obrigatório" : "Razão social é obrigatória");
      if (tiposSelecionados.length === 0) throw new Error("Selecione ao menos um tipo");
      // Validações reforçadas em modo auto-cadastro
      if (obrigatorio) {
        if (tipoPessoa === "PJ") {
          if (!cnpj.replace(/\D/g, "")) throw new Error("CNPJ é obrigatório");
          if (cnpj.replace(/\D/g, "").length !== 14) throw new Error("CNPJ inválido (14 dígitos)");
          if (!nomeFantasia.trim()) throw new Error("Nome fantasia é obrigatório");
        } else {
          if (!cpf.replace(/\D/g, "")) throw new Error("CPF é obrigatório");
          if (cpf.replace(/\D/g, "").length !== 11) throw new Error("CPF inválido (11 dígitos)");
        }
      }
      const payload = {
        tipo_pessoa: tipoPessoa,
        tipos: tiposSelecionados,
        cnpj: tipoPessoa === "PJ" ? (cnpj.replace(/\D/g, "") || null) : null,
        cpf: tipoPessoa === "PF" ? (cpf.replace(/\D/g, "") || null) : null,
        rg: tipoPessoa === "PF" ? (rg.trim() || null) : null,
        data_nascimento: tipoPessoa === "PF" ? (dataNascimento || null) : null,
        razao_social: razaoSocial.trim(),
        nome_fantasia: tipoPessoa === "PJ" ? (nomeFantasia.trim() || null) : null,
        cep: cep.replace(/\D/g, "") || null,
        logradouro: logradouro.trim() || null,
        numero: numero.trim() || null,
        bairro: bairro.trim() || null,
        cidade: cidade.trim() || null,
        uf: uf.trim() || null,
        telefone: telefone.trim() || null,
        email: email.trim() || null,
        canal_venda_id: canalVendaId,
        segmento: segmento.trim() || null,
        categoria_padrao_id: categoriaPadrao,
        grupo_id: grupoId,
        centro_custo_id: centroCustoId,
        tags: tags.length ? tags : null,
        observacao: observacao.trim() || null,
        forma_pagamento_padrao_id: formaPagamentoPadraoId,
        pix_tipo: pixTipo || null,
        pix_chave: pixChave.trim() || null,
        dados_bancarios:
          bcoBanco.trim() || bcoAgencia.trim() || bcoConta.trim() || bcoTitular.trim() || bcoTipoConta
            ? {
                banco: bcoBanco.trim() || null,
                agencia: bcoAgencia.trim() || null,
                conta: bcoConta.trim() || null,
                tipo_conta: bcoTipoConta || null,
                titular: bcoTitular.trim() || null,
              }
            : null,
        ativo: true,
        origem: editing?.origem || "manual",
      };
      if (isEdit && editing) {
        const { data, error } = await supabase
          .from("parceiros_comerciais")
          .update(payload)
          .eq("id", editing.id)
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      } else {
        const { data, error } = await supabase
          .from("parceiros_comerciais")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      }
    },
    onSuccess: (id) => {
      toast.success(isEdit ? "Parceiro atualizado" : "Parceiro cadastrado");
      qc.invalidateQueries({ queryKey: ["parceiros"] });
      qc.invalidateQueries({ queryKey: ["parceiros-fornecedores"] });
      onSaved?.(id);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEdit ? "Editar parceiro" : obrigatorio ? "Completar cadastro do fornecedor" : "Novo parceiro"}
          </SheetTitle>
          <SheetDescription>
            {obrigatorio
              ? "Este fornecedor não está cadastrado. Complete os campos obrigatórios (*) antes de prosseguir com o pagamento."
              : "Cadastro unificado de fornecedores, clientes e parceiros da Fetely."}
          </SheetDescription>
        </SheetHeader>

        {editing?.cadastro_incompleto && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Cadastro incompleto — criado automaticamente a partir de NF</span>
          </div>
        )}

        <div className="space-y-5 py-4">
          {/* Tipo */}
          <div>
            <Label className="mb-2 block">Tipo de parceiro</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={tiposSelecionados.includes("fornecedor")}
                  onCheckedChange={() => toggleTipo("fornecedor")}
                />
                <span className="text-sm">Fornecedor</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={tiposSelecionados.includes("cliente")}
                  onCheckedChange={() => toggleTipo("cliente")}
                />
                <span className="text-sm">Cliente</span>
              </label>
            </div>
          </div>

          {/* Tipo de pessoa (PF/PJ) */}
          <div>
            <Label className="mb-2 block">Tipo de pessoa</Label>
            <div className="inline-flex rounded-md border bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => setTipoPessoa("PJ")}
                className={`px-4 py-1.5 text-sm rounded transition ${
                  tipoPessoa === "PJ"
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pessoa Jurídica
              </button>
              <button
                type="button"
                onClick={() => setTipoPessoa("PF")}
                className={`px-4 py-1.5 text-sm rounded transition ${
                  tipoPessoa === "PF"
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pessoa Física
              </button>
            </div>
          </div>

          {tipoPessoa === "PJ" ? (
            <>
              <div>
                <Label>CNPJ {obrigatorio && "*"}</Label>
                <Input
                  value={cnpj}
                  onChange={(e) => setCnpj(maskCnpj(e.target.value))}
                  onBlur={checkDuplicate}
                  placeholder="00.000.000/0000-00"
                />
                {duplicateWarn && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ {duplicateWarn}</p>
                )}
              </div>
              <div>
                <Label>Razão social *</Label>
                <Input value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} />
              </div>
              <div>
                <Label>Nome fantasia {obrigatorio && "*"}</Label>
                <Input value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>CPF {obrigatorio && "*"}</Label>
                <Input
                  value={cpf}
                  onChange={(e) => setCpf(maskCpf(e.target.value))}
                  onBlur={checkDuplicate}
                  placeholder="000.000.000-00"
                />
                {duplicateWarn && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ {duplicateWarn}</p>
                )}
              </div>
              <div>
                <Label>Nome completo *</Label>
                <Input value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>RG</Label>
                  <Input value={rg} onChange={(e) => setRg(e.target.value)} />
                </div>
                <div>
                  <Label>Data de nascimento</Label>
                  <Input
                    type="date"
                    value={dataNascimento}
                    onChange={(e) => setDataNascimento(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}
          {/* Endereço */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Endereço</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>CEP</Label>
                <Input
                  value={cep}
                  onChange={(e) => setCep(maskCep(e.target.value))}
                  onBlur={handleCepBlur}
                  placeholder="00000-000"
                />
              </div>
              <div className="col-span-2">
                <Label>Logradouro</Label>
                <Input value={logradouro} onChange={(e) => setLogradouro(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <Label>Número</Label>
                <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Bairro</Label>
                <Input value={bairro} onChange={(e) => setBairro(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="col-span-2">
                <Label>Cidade</Label>
                <Input value={cidade} onChange={(e) => setCidade(e.target.value)} />
              </div>
              <div>
                <Label>UF</Label>
                <Input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} />
              </div>
            </div>
          </div>

          {/* Contato */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Contato</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Telefone</Label>
                <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Classificação */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Classificação</p>
            <div className="mb-3">
              <Label>Grupo empresarial</Label>
              <GrupoEmpresarialCombobox value={grupoId} onChange={setGrupoId} />
              <p className="text-xs text-muted-foreground mt-1">
                Agrupa parceiros que pertencem ao mesmo controle (holding, mesmo dono, etc).
              </p>
            </div>
            {tiposSelecionados.includes("cliente") && (
              <div className="mb-3">
                <Label>Canal (cliente)</Label>
                <Select
                  value={canalVendaId ?? "__none__"}
                  onValueChange={(v) => setCanalVendaId(v === "__none__" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem canal —</SelectItem>
                    {canaisVenda.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="mb-3">
              <Label>Segmento</Label>
              <Input value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="ex: TI, Logística..." />
            </div>
            <div className="mb-3">
              <Label>Categoria padrão (toda compra desse parceiro)</Label>
              <CategoriaCombobox
                options={categorias}
                value={categoriaPadrao}
                onChange={setCategoriaPadrao}
                allowNull
                placeholder="Sem categoria padrão"
              />
            </div>
            <div className="mb-3">
              <Label>Centro de custo padrão</Label>
              <Select
                value={centroCustoId ?? "__none__"}
                onValueChange={(v) => setCentroCustoId(v === "__none__" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sem centro de custo —</SelectItem>
                  {centrosCusto.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="ex: recorrente, importação"
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button onClick={() => setTags(tags.filter((t) => t !== tag))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pagamento */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Pagamento</p>

            <div className="mb-3">
              <Label>Meio de pagamento padrão</Label>
              <Select
                value={formaPagamentoPadraoId ?? "__none__"}
                onValueChange={(v) => setFormaPagamentoPadraoId(v === "__none__" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhum —</SelectItem>
                  {formasPagamento.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Sugerido automaticamente em novas contas a pagar deste parceiro.
              </p>
            </div>

            {/* PIX */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <Label>Tipo de chave PIX</Label>
                <Select value={pixTipo || "_none"} onValueChange={(v) => setPixTipo(v === "_none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">—</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="telefone">Telefone</SelectItem>
                    <SelectItem value="aleatoria">Aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Chave PIX</Label>
                <Input
                  value={pixChave}
                  onChange={(e) => setPixChave(e.target.value)}
                  placeholder="ex: 00.000.000/0000-00"
                />
              </div>
            </div>

            {/* Dados bancários */}
            <p className="text-xs font-medium text-muted-foreground mt-4 mb-2">Dados bancários</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <Label>Banco</Label>
                <Input value={bcoBanco} onChange={(e) => setBcoBanco(e.target.value)} placeholder="ex: 341 - Itaú" />
              </div>
              <div>
                <Label>Titular</Label>
                <Input value={bcoTitular} onChange={(e) => setBcoTitular(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Agência</Label>
                <Input value={bcoAgencia} onChange={(e) => setBcoAgencia(e.target.value)} />
              </div>
              <div>
                <Label>Conta</Label>
                <Input value={bcoConta} onChange={(e) => setBcoConta(e.target.value)} />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={bcoTipoConta || "_none"} onValueChange={(v) => setBcoTipoConta(v === "_none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">—</SelectItem>
                    <SelectItem value="corrente">Corrente</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                    <SelectItem value="pagamento">Pagamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div>
            <Label>Observação</Label>
            <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={3} />
          </div>
        </div>

        {isEdit && editing && (
          <PastaGedSection parceiroId={editing.id} parceiroNome={editing.razao_social} />
        )}

        {grupoId && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              Grupo: {grupoInfo?.nome}
            </p>
            {irmaos && irmaos.length > 0 ? (
              <div className="space-y-1">
                {irmaos.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-sm px-2 py-1.5 rounded bg-muted/40">
                    <span className="font-medium">{p.nome_fantasia || p.razao_social}</span>
                    <span className="text-xs text-muted-foreground font-mono">{p.cnpj}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Único membro cadastrado neste grupo.</p>
            )}
          </div>
        )}

        <SheetFooter>
          {!obrigatorio && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          )}
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : isEdit ? "Salvar" : "Cadastrar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── Seção Pasta GED ─────────────────────────────────────
function PastaGedSection({ parceiroId, parceiroNome: _parceiroNome }: { parceiroId: string; parceiroNome: string }) {
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["parceiro-pasta-stats", parceiroId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: pasta } = await sb
        .from("ged_pastas")
        .select("id, nome")
        .eq("parceiro_id", parceiroId)
        .eq("ativa", true)
        .maybeSingle();

      if (!pasta) return null;

      const [docsResp, nfsSemCprResp, cprsResp] = await Promise.all([
        sb.from("ged_documentos").select("id", { count: "exact", head: true }).eq("pasta_id", pasta.id),
        sb.from("nfs_stage").select("id", { count: "exact", head: true })
          .eq("parceiro_id", parceiroId).is("conta_pagar_id", null).eq("status", "nao_vinculada"),
        sb.from("contas_pagar_receber").select("id", { count: "exact", head: true }).eq("parceiro_id", parceiroId),
      ]);

      return {
        pastaId: pasta.id as string,
        docs: (docsResp.count ?? 0) as number,
        nfsSemCpr: (nfsSemCprResp.count ?? 0) as number,
        cprs: (cprsResp.count ?? 0) as number,
      };
    },
    enabled: !!parceiroId,
  });

  if (!stats) {
    return (
      <div className="mt-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Pasta no GED será criada automaticamente ao salvar.
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FolderOpen className="h-4 w-4 text-primary" />
          Pasta no GED
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/administrativo-fetely/ged?pasta=${stats.pastaId}`)}
        >
          Abrir no GED
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-bold">{stats.docs}</div>
          <div className="text-[10px] text-muted-foreground">documentos</div>
        </div>
        <div>
          <div className="text-lg font-bold">{stats.cprs}</div>
          <div className="text-[10px] text-muted-foreground">contas a pagar</div>
        </div>
        <div>
          <div className={`text-lg font-bold ${stats.nfsSemCpr > 0 ? "text-amber-600" : ""}`}>
            {stats.nfsSemCpr}
          </div>
          <div className="text-[10px] text-muted-foreground">NFs sem CPR</div>
        </div>
      </div>
    </div>
  );
}

