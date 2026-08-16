import { useState, useCallback } from "react";
import { Upload, FileText, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface ExtractedNFData {
  numero: string | null;
  serie: string | null;
  valor: number | null;
  data_emissao: string | null;
  competencia: string | null;
  data_vencimento: string | null;
  descricao: string | null;
  cnpj_prestador: string | null;
  razao_social_prestador: string | null;
}

interface ContratoPJOption {
  id: string;
  label: string;
  cnpj: string;
}

interface ImportNFDialogProps {
  open: boolean;
  onClose: () => void;
  contratos: ContratoPJOption[];
  onSuccess: () => void;
}

type Step = "upload" | "processing" | "review" | "error";

export default function ImportNFDialog({ open, onClose, contratos, onSuccess }: ImportNFDialogProps) {
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [extracted, setExtracted] = useState<ExtractedNFData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // Form fields for review/edit
  const [form, setForm] = useState({
    contrato_id: "",
    numero: "",
    serie: "",
    valor: "",
    data_emissao: "",
    competencia: "",
    data_vencimento: "",
    descricao: "",
  });

  const reset = () => {
    setStep("upload");
    setFile(null);
    setExtracted(null);
    setErrorMsg("");
    setSaving(false);
    setForm({ contrato_id: "", numero: "", serie: "", valor: "", data_emissao: "", competencia: "", data_vencimento: "", descricao: "" });
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type === "application/pdf") {
      setFile(f);
    } else {
      toast.error("Selecione um arquivo PDF válido");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setStep("processing");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setErrorMsg("Sessão expirada. Faça login novamente.");
        setStep("error");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-nf-pdf`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        setErrorMsg(result.error || "Erro ao processar o PDF");
        setStep("error");
        return;
      }

      const data = result.data as ExtractedNFData;
      setExtracted(data);

      // Try to match contrato by CNPJ
      let matchedContratoId = "";
      if (data.cnpj_prestador) {
        const cleanCnpj = data.cnpj_prestador.replace(/\D/g, "");
        const match = contratos.find((c) => c.cnpj.replace(/\D/g, "") === cleanCnpj);
        if (match) matchedContratoId = match.id;
      }

      setForm({
        contrato_id: matchedContratoId,
        numero: data.numero || "",
        serie: data.serie || "",
        valor: data.valor?.toString() || "",
        data_emissao: data.data_emissao || "",
        competencia: data.competencia || "",
        data_vencimento: data.data_vencimento || "",
        descricao: data.descricao || "",
      });

      setStep("review");
    } catch (err) {
      console.error(err);
      setErrorMsg("Erro de conexão ao processar o PDF");
      setStep("error");
    }
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!isSuperAdmin && (!form.contrato_id || !form.numero.trim() || !form.data_emissao || !form.valor || !form.competencia)) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        contrato_id: form.contrato_id,
        numero: form.numero.trim(),
        serie: form.serie.trim() || null,
        valor: Number(form.valor),
        data_emissao: form.data_emissao,
        data_vencimento: form.data_vencimento || null,
        competencia: form.competencia.trim(),
        descricao: form.descricao.trim() || null,
        status: "pendente",
        observacoes: null,
      };

      const { error } = await supabase.from("notas_fiscais_pj").insert(payload as any);
      if (error) throw error;

      toast.success("Nota Fiscal importada com sucesso!");
      handleClose();
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar nota fiscal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Nota Fiscal via PDF
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">
                Selecione o PDF da Nota Fiscal para extração automática dos dados
              </p>
              <Input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="max-w-xs mx-auto"
              />
              {file && (
                <p className="text-sm text-primary mt-2 font-medium">{file.name}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button onClick={handleUpload} disabled={!file} className="gap-2">
                <Upload className="h-4 w-4" /> Processar PDF
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "processing" && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
            <div>
              <p className="font-medium">Processando PDF com IA...</p>
              <p className="text-sm text-muted-foreground mt-1">Extraindo dados da nota fiscal automaticamente</p>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="py-8 text-center space-y-4">
            <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
            <div>
              <p className="font-medium text-destructive">Erro ao processar</p>
              <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
            </div>
            <DialogFooter className="justify-center">
              <Button variant="outline" onClick={reset}>Tentar novamente</Button>
              <Button variant="outline" onClick={handleClose}>Fechar</Button>
            </DialogFooter>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-sm text-success bg-success/10 rounded-md px-3 py-2">
              <CheckCircle2 className="h-4 w-4" />
              Dados extraídos com sucesso! Revise e ajuste antes de salvar.
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Contrato *</Label>
                <Select value={form.contrato_id} onValueChange={(v) => set("contrato_id", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o contrato" />
                  </SelectTrigger>
                  <SelectContent>
                    {contratos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {extracted?.razao_social_prestador && !form.contrato_id && (
                  <p className="text-xs text-warning mt-1">
                    Prestador identificado: {extracted.razao_social_prestador} — selecione o contrato manualmente
                  </p>
                )}
              </div>
              <div>
                <Label>Número *</Label>
                <Input value={form.numero} onChange={(e) => set("numero", e.target.value)} />
              </div>
              <div>
                <Label>Série</Label>
                <Input value={form.serie} onChange={(e) => set("serie", e.target.value)} />
              </div>
              <div>
                <Label>Valor (R$) *</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={(e) => set("valor", e.target.value)} />
              </div>
              <div>
                <Label>Competência *</Label>
                <Input type="month" value={form.competencia} onChange={(e) => set("competencia", e.target.value)} />
              </div>
              <div>
                <Label>Data Emissão *</Label>
                <Input type="date" value={form.data_emissao} onChange={(e) => set("data_emissao", e.target.value)} />
              </div>
              <div>
                <Label>Data Vencimento</Label>
                <Input type="date" value={form.data_vencimento} onChange={(e) => set("data_vencimento", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Descrição</Label>
                <Input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={reset}>Voltar</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar Nota Fiscal
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
