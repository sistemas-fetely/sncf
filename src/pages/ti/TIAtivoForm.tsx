import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useParametros } from "@/hooks/useParametros";
import { Sparkles, Loader2, Camera, X } from "lucide-react";
import ManutencoesSection from "@/components/ti/ManutencoesSection";
import { ImagemPrivada } from "@/components/storage/ImagemPrivada";


interface TIAtivoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ativoId: string | null;
  onSaved: () => void;
}

interface ParametroSimple {
  label: string;
  valor: string;
}

interface ColaboradorOption {
  id: string;
  nome: string;
  tipo: "clt" | "pj";
}

interface FormState {
  id?: string;
  tipo: string;
  marca: string;
  modelo: string;
  numero_serie: string;
  numero_patrimonio: string;
  estado: string;
  condicao: string;
  status: string;
  data_compra: string;
  valor_compra: string;
  valor_atual_mercado: string;
  valor_estimado_em: string;
  fornecedor: string;
  nota_fiscal: string;
  garantia_ate: string;
  localizacao: string;
  observacoes: string;
  colaborador_key: string;
  especificacoes: Record<string, string>;
  fotos: string[];
}

const initialState: FormState = {
  tipo: "",
  marca: "",
  modelo: "",
  numero_serie: "",
  numero_patrimonio: "",
  estado: "novo",
  condicao: "otima",
  status: "disponivel",
  data_compra: "",
  valor_compra: "",
  valor_atual_mercado: "",
  valor_estimado_em: "",
  fornecedor: "",
  nota_fiscal: "",
  garantia_ate: "",
  localizacao: "",
  observacoes: "",
  colaborador_key: "",
  especificacoes: {},
  fotos: [],
};

export default function TIAtivoForm({ open, onOpenChange, ativoId, onSaved }: TIAtivoFormProps) {
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(initialState);
  const [tiposEquipamento, setTiposEquipamento] = useState<ParametroSimple[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [estimandoValor, setEstimandoValor] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const { data: locaisTrabalho = [] } = useParametros("local_trabalho");

  const setEspec = (k: string, v: string) =>
    setForm((s) => ({ ...s, especificacoes: { ...s.especificacoes, [k]: v } }));

  const loadOptions = useCallback(async () => {
    const [tiposRes, cltRes, pjRes] = await Promise.all([
      supabase.from("parametros").select("label, valor").eq("categoria", "tipo_equipamento").eq("ativo", true).order("ordem"),
      supabase.from("colaboradores_clt").select("id, nome_completo").eq("status", "ativo").order("nome_completo"),
      supabase.from("contratos_pj").select("id, razao_social, contato_nome").eq("status", "ativo").order("razao_social"),
    ]);

    if (tiposRes.data) setTiposEquipamento(tiposRes.data);
    const opts: ColaboradorOption[] = [];
    if (cltRes.data) cltRes.data.forEach((c) => opts.push({ id: c.id, nome: c.nome_completo, tipo: "clt" }));
    if (pjRes.data) pjRes.data.forEach((c) => opts.push({ id: c.id, nome: c.contato_nome || c.razao_social, tipo: "pj" }));
    setColaboradores(opts);
  }, []);

  const loadAtivo = useCallback(async (id: string) => {
    const { data } = await supabase.from("ti_ativos").select("*").eq("id", id).maybeSingle();
    if (data) {
      setForm({
        id: data.id,
        tipo: data.tipo || "",
        marca: data.marca || "",
        modelo: data.modelo || "",
        numero_serie: data.numero_serie || "",
        numero_patrimonio: data.numero_patrimonio || "",
        estado: data.estado || "novo",
        condicao: (data as any).condicao || "otima",
        status: data.status || "disponivel",
        data_compra: data.data_compra || "",
        valor_compra: data.valor_compra != null ? String(data.valor_compra) : "",
        valor_atual_mercado: (data as any).valor_atual_mercado != null ? String((data as any).valor_atual_mercado) : "",
        valor_estimado_em: (data as any).valor_estimado_em || "",
        fornecedor: data.fornecedor || "",
        nota_fiscal: data.nota_fiscal || "",
        garantia_ate: data.garantia_ate || "",
        localizacao: data.localizacao || "",
        observacoes: data.observacoes || "",
        colaborador_key: data.colaborador_id && data.colaborador_tipo ? `${data.colaborador_tipo}:${data.colaborador_id}` : "",
        especificacoes: ((data as any).especificacoes as Record<string, string>) || {},
        fotos: ((data as any).fotos as string[]) || [],
      });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadOptions();
    if (ativoId) {
      void loadAtivo(ativoId);
    } else {
      setForm(initialState);
    }
  }, [open, ativoId, loadOptions, loadAtivo]);

  const estimarComIA = async () => {
    setEstimandoValor(true);
    try {
      const { data, error } = await supabase.functions.invoke("estimar-valor-ativo", {
        body: {
          tipo: form.tipo,
          marca: form.marca,
          modelo: form.modelo,
          ano_compra: form.data_compra ? new Date(form.data_compra).getFullYear() : null,
          estado: form.estado,
          condicao: form.condicao,
          valor_compra: form.valor_compra ? Number(form.valor_compra) : null,
          especificacoes: form.especificacoes,
        },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      const valor = Number(data?.valor);
      if (!isNaN(valor) && valor > 0) {
        setForm((s) => ({
          ...s,
          valor_atual_mercado: valor.toFixed(2),
          valor_estimado_em: new Date().toISOString(),
        }));
        toast.success(`Valor estimado: R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
      } else {
        toast.error("Não foi possível estimar o valor. Preencha manualmente.");
      }
    } catch (err) {
      toast.error("Erro ao estimar valor: " + (err as Error).message);
    } finally {
      setEstimandoValor(false);
    }
  };

  const handleUploadFoto = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Máximo 5MB");
      return;
    }
    setUploadingFoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${form.id || crypto.randomUUID()}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("ti-ativos").upload(filePath, file, { upsert: true });
      if (error) {
        toast.error("Erro: " + error.message);
        return;
      }
      const { data: urlData } = supabase.storage.from("ti-ativos").getPublicUrl(filePath);
      setForm((s) => ({ ...s, fotos: [...s.fotos, urlData.publicUrl] }));
    } finally {
      setUploadingFoto(false);
    }
  };

  const removerFoto = async (idx: number) => {
    const url = form.fotos[idx];
    const path = url.split("/ti-ativos/")[1];
    if (path) await supabase.storage.from("ti-ativos").remove([path]);
    setForm((s) => ({ ...s, fotos: s.fotos.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    if (!form.tipo) {
      toast.error("Tipo é obrigatório");
      return;
    }
    setSaving(true);

    let colaborador_id: string | null = null;
    let colaborador_tipo: string | null = null;
    let colaborador_nome: string | null = null;
    let status = form.status;
    let atribuido_em: string | null = null;

    if (form.colaborador_key) {
      const [tipo, id] = form.colaborador_key.split(":");
      const c = colaboradores.find((x) => x.id === id && x.tipo === tipo);
      if (c) {
        colaborador_id = c.id;
        colaborador_tipo = c.tipo;
        colaborador_nome = c.nome;
        status = "atribuido";
        atribuido_em = new Date().toISOString().split("T")[0];
      }
    } else if (status === "atribuido") {
      status = "disponivel";
    }

    const payload: any = {
      tipo: form.tipo,
      marca: form.marca || null,
      modelo: form.modelo || null,
      numero_serie: form.numero_serie || null,
      numero_patrimonio: form.numero_patrimonio || null,
      estado: form.estado,
      condicao: form.condicao,
      status,
      data_compra: form.data_compra || null,
      valor_compra: form.valor_compra ? Number(form.valor_compra) : null,
      valor_atual_mercado: form.valor_atual_mercado ? Number(form.valor_atual_mercado) : null,
      valor_estimado_em: form.valor_estimado_em || null,
      fornecedor: form.fornecedor || null,
      nota_fiscal: form.nota_fiscal || null,
      garantia_ate: form.garantia_ate || null,
      localizacao: form.localizacao || null,
      observacoes: form.observacoes || null,
      especificacoes: form.especificacoes || {},
      fotos: form.fotos || [],
      colaborador_id,
      colaborador_tipo,
      colaborador_nome,
      atribuido_em,
    };

    if (ativoId) {
      const { error } = await supabase.from("ti_ativos").update(payload).eq("id", ativoId);
      if (error) {
        toast.error("Erro ao salvar: " + error.message);
        setSaving(false);
        return;
      }
      await supabase.from("ti_ativos_historico").insert({
        ativo_id: ativoId,
        acao: colaborador_id ? "atribuicao" : "edicao",
        para_colaborador: colaborador_nome,
        responsavel_id: user?.id,
      });
      toast.success("Ativo atualizado");
    } else {
      const { data, error } = await supabase
        .from("ti_ativos")
        .insert({ ...payload, created_by: user?.id })
        .select("id")
        .maybeSingle();
      if (error) {
        toast.error("Erro ao criar: " + error.message);
        setSaving(false);
        return;
      }
      if (data?.id) {
        await supabase.from("ti_ativos_historico").insert({
          ativo_id: data.id,
          acao: "criacao",
          para_colaborador: colaborador_nome,
          responsavel_id: user?.id,
        });
      }
      toast.success("Ativo criado");
    }

    setSaving(false);
    onSaved();
  };

  const showSpecsHardware = ["notebook", "desktop", "servidor"].includes(form.tipo);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{ativoId ? "Editar ativo" : "Novo ativo"}</SheetTitle>
          <SheetDescription>Cadastre o equipamento e atribua a um colaborador se necessário.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  {tiposEquipamento.length === 0 ? (
                    <>
                      <SelectItem value="notebook">Notebook</SelectItem>
                      <SelectItem value="desktop">Desktop</SelectItem>
                      <SelectItem value="monitor">Monitor</SelectItem>
                      <SelectItem value="celular">Celular</SelectItem>
                      <SelectItem value="headset">Headset</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </>
                  ) : (
                    tiposEquipamento.map((t) => (
                      <SelectItem key={t.valor} value={t.valor}>{t.label}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Marca</Label>
              <Input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Modelo</Label>
              <Input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Nº Série</Label>
              <Input value={form.numero_serie} onChange={(e) => setForm({ ...form, numero_serie: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Nº Patrimônio</Label>
              <Input value={form.numero_patrimonio} onChange={(e) => setForm({ ...form, numero_patrimonio: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={form.estado} onValueChange={(v) => setForm({ ...form, estado: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="novo">Novo</SelectItem>
                  <SelectItem value="usado">Usado</SelectItem>
                  <SelectItem value="recondicionado">Recondicionado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Condição Atual</Label>
              <Select value={form.condicao || "otima"} onValueChange={(v) => setForm({ ...form, condicao: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="otima">Ótima</SelectItem>
                  <SelectItem value="muito_boa">Muito Boa</SelectItem>
                  <SelectItem value="boa">Boa</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
              {form.condicao === "inativo" && (
                <p className="text-xs text-destructive">Ao salvar, o status será alterado para "Descartado" automaticamente.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status || "disponivel"} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="disponivel">Disponível</SelectItem>
                  <SelectItem value="atribuido">Atribuído</SelectItem>
                  <SelectItem value="descartado">Descartado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data de compra</Label>
              <Input type="date" value={form.data_compra} onChange={(e) => setForm({ ...form, data_compra: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Valor de compra (R$)</Label>
              <Input type="number" step="0.01" value={form.valor_compra} onChange={(e) => setForm({ ...form, valor_compra: e.target.value })} />
            </div>

            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Valor Atual de Mercado (R$)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.valor_atual_mercado || ""}
                  onChange={(e) => setForm({ ...form, valor_atual_mercado: e.target.value })}
                  placeholder="0,00"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 whitespace-nowrap"
                  disabled={estimandoValor || !form.marca || !form.modelo}
                  onClick={estimarComIA}
                >
                  {estimandoValor ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {estimandoValor ? "Estimando..." : "Estimar com IA"}
                </Button>
              </div>
              {form.valor_estimado_em && (
                <p className="text-xs text-muted-foreground">
                  Estimado em {new Date(form.valor_estimado_em).toLocaleDateString("pt-BR")}
                </p>
              )}
              {(!form.marca || !form.modelo) && (
                <p className="text-xs text-muted-foreground">Preencha marca e modelo para estimar com IA</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <Input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Nota fiscal</Label>
              <Input value={form.nota_fiscal} onChange={(e) => setForm({ ...form, nota_fiscal: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Garantia até</Label>
              <Input type="date" value={form.garantia_ate} onChange={(e) => setForm({ ...form, garantia_ate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Localização</Label>
              <Select value={form.localizacao || "_none"} onValueChange={(v) => setForm({ ...form, localizacao: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">—</SelectItem>
                  {locaisTrabalho.map((l) => (
                    <SelectItem key={l.id} value={l.label}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 col-span-2">
              <Label>Atribuir a colaborador</Label>
              <Select
                value={form.colaborador_key || "_none"}
                onValueChange={(v) => setForm({ ...form, colaborador_key: v === "_none" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Não atribuído" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Não atribuído</SelectItem>
                  {colaboradores.map((c) => (
                    <SelectItem key={`${c.tipo}:${c.id}`} value={`${c.tipo}:${c.id}`}>
                      {c.nome} <span className="text-xs text-muted-foreground ml-1">({c.tipo.toUpperCase()})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Ao atribuir, o status muda automaticamente para "Atribuído".</p>
            </div>

            {showSpecsHardware && (
              <div className="col-span-2 space-y-3 pt-3 border-t">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Especificações Técnicas</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Processador</Label>
                    <Input value={form.especificacoes?.processador || ""} onChange={(e) => setEspec("processador", e.target.value)} placeholder="Ex: Intel i7-12700H" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Memória RAM</Label>
                    <Input value={form.especificacoes?.ram || ""} onChange={(e) => setEspec("ram", e.target.value)} placeholder="Ex: 16GB DDR5" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo de Armazenamento</Label>
                    <Select value={form.especificacoes?.hd_tipo || ""} onValueChange={(v) => setEspec("hd_tipo", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ssd_nvme">SSD NVMe</SelectItem>
                        <SelectItem value="ssd_sata">SSD SATA</SelectItem>
                        <SelectItem value="hdd">HDD</SelectItem>
                        <SelectItem value="hibrido">Híbrido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tamanho Armazenamento</Label>
                    <Input value={form.especificacoes?.hd_tamanho || ""} onChange={(e) => setEspec("hd_tamanho", e.target.value)} placeholder="Ex: 512GB" />
                  </div>
                </div>
              </div>
            )}

            {form.tipo === "monitor" && (
              <div className="col-span-2 space-y-3 pt-3 border-t">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Especificações do Monitor</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tamanho (polegadas)</Label>
                    <Input value={form.especificacoes?.tamanho || ""} onChange={(e) => setEspec("tamanho", e.target.value)} placeholder="Ex: 27" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Resolução</Label>
                    <Input value={form.especificacoes?.resolucao || ""} onChange={(e) => setEspec("resolucao", e.target.value)} placeholder="Ex: 2560x1440 (QHD)" />
                  </div>
                </div>
              </div>
            )}

            {form.tipo === "celular" && (
              <div className="col-span-2 space-y-3 pt-3 border-t">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Dados do Celular</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">IMEI</Label>
                    <Input value={form.especificacoes?.imei || ""} onChange={(e) => setEspec("imei", e.target.value)} placeholder="IMEI do aparelho" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Número da Linha</Label>
                    <Input value={form.especificacoes?.numero_linha || ""} onChange={(e) => setEspec("numero_linha", e.target.value)} placeholder="(XX) XXXXX-XXXX" />
                  </div>
                </div>
              </div>
            )}

            {form.tipo === "headset" && (
              <div className="col-span-2 space-y-3 pt-3 border-t">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Especificações do Headset</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo de Conexão</Label>
                    <Select value={form.especificacoes?.conexao || ""} onValueChange={(v) => setEspec("conexao", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bluetooth">Bluetooth</SelectItem>
                        <SelectItem value="usb">USB</SelectItem>
                        <SelectItem value="p2">P2 (3.5mm)</SelectItem>
                        <SelectItem value="wireless_dongle">Wireless (dongle)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Com microfone</Label>
                    <Select value={form.especificacoes?.microfone || ""} onValueChange={(v) => setEspec("microfone", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sim">Sim</SelectItem>
                        <SelectItem value="nao">Não</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2 col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={3} />
            </div>

            <div className="col-span-2 space-y-3 pt-3 border-t">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Fotos do Ativo</Label>
              <div className="flex flex-wrap gap-3">
                {(form.fotos || []).map((url, idx) => (
                  <div key={idx} className="relative group">
                    <ImagemPrivada
                      bucket="ti-ativos"
                      valor={url}
                      alt={`Foto ${idx + 1}`}
                      className="h-24 w-24 rounded-lg object-cover border"
                    />

                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removerFoto(idx)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {(form.fotos || []).length < 5 && (
                  <label className="h-24 w-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                    {uploadingFoto ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Camera className="h-5 w-5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground mt-1">Adicionar</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) await handleUploadFoto(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Máximo 5 fotos · JPG ou PNG · até 5MB cada</p>
            </div>

            {ativoId && (
              <ManutencoesSection
                ativoId={ativoId}
                ativoStatus={form.status}
                onStatusChange={(s) => setForm((f) => ({ ...f, status: s }))}
              />
            )}
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: "#3A7D6B" }} className="text-white hover:opacity-90">
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
