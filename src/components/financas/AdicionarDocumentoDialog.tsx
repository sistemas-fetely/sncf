import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilePlus2, Loader2 } from "lucide-react";

type TipoDocumento = "fatura" | "invoice" | "recibo" | "boleto";

function maskCNPJ(v: string): string {
  const s = v.replace(/\D/g, "").slice(0, 14);
  return s
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function sanitizeFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function toNum(v: string): number {
  if (!v) return NaN;
  return Number(v.replace(/\./g, "").replace(",", "."));
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export default function AdicionarDocumentoDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();

  const [tipo, setTipo] = useState<TipoDocumento | "">("");
  const [razao, setRazao] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [numero, setNumero] = useState("");
  const [dataEmissao, setDataEmissao] = useState("");
  const [dataVenc, setDataVenc] = useState("");
  const [descricao, setDescricao] = useState("");

  const [valorBRL, setValorBRL] = useState("");

  const [paisEmissor, setPaisEmissor] = useState("BR");
  const [moeda, setMoeda] = useState("");
  const [valorOrigem, setValorOrigem] = useState("");
  const [taxaConv, setTaxaConv] = useState("");

  const [numParcela, setNumParcela] = useState("");
  const [totalParcelas, setTotalParcelas] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const isInvoice = tipo === "invoice";

  const valorBRLCalc = useMemo(() => {
    if (!isInvoice) return NaN;
    const vo = toNum(valorOrigem);
    const tx = toNum(taxaConv);
    if (!isFinite(vo) || !isFinite(tx)) return NaN;
    return vo * tx;
  }, [isInvoice, valorOrigem, taxaConv]);

  function reset() {
    setTipo("");
    setRazao("");
    setCnpj("");
    setNumero("");
    setDataEmissao("");
    setDataVenc("");
    setDescricao("");
    setValorBRL("");
    setPaisEmissor("BR");
    setMoeda("");
    setValorOrigem("");
    setTaxaConv("");
    setNumParcela("");
    setTotalParcelas("");
    setFile(null);
  }

  async function handleSubmit() {
    if (!tipo) return toast.error("Selecione o tipo de documento.");
    if (!razao.trim()) return toast.error("Fornecedor (razão social) é obrigatório.");
    if (!dataEmissao) return toast.error("Data de emissão é obrigatória.");

    let valorFinal: number;
    let moedaFinal = "BRL";
    let paisFinal = "BR";
    let valorOrigemFinal: number | null = null;
    let taxaFinal: number | null = null;

    if (isInvoice) {
      if (!moeda.trim()) return toast.error("Moeda é obrigatória para invoice.");
      const vo = toNum(valorOrigem);
      const tx = toNum(taxaConv);
      if (!isFinite(vo) || vo <= 0) return toast.error("Valor na moeda de origem inválido.");
      if (!isFinite(tx) || tx <= 0) return toast.error("Taxa de conversão inválida.");
      valorFinal = vo * tx;
      moedaFinal = moeda.trim().toUpperCase();
      paisFinal = (paisEmissor || "BR").trim().toUpperCase();
      valorOrigemFinal = vo;
      taxaFinal = tx;
    } else {
      const v = toNum(valorBRL);
      if (!isFinite(v) || v <= 0) return toast.error("Valor deve ser maior que zero.");
      valorFinal = v;
    }

    if (numParcela && !/^\d+$/.test(numParcela))
      return toast.error("Nº da parcela deve ser inteiro.");
    if (totalParcelas && !/^\d+$/.test(totalParcelas))
      return toast.error("Total de parcelas deve ser inteiro.");

    setSaving(true);
    try {
      let arquivoPath: string | null = null;

      if (file) {
        const ano = new Date().getFullYear();
        const uid =
          (globalThis.crypto?.randomUUID?.() as string | undefined) ??
          `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const path = `${ano}/${uid}-${sanitizeFilename(file.name)}`;
        const up = await supabase.storage
          .from("documentos-despesa")
          .upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (up.error) {
          throw new Error(`Falha no upload: ${up.error.message}`);
        }
        arquivoPath = up.data?.path ?? path;
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw new Error(userErr.message);
      const uid = userData.user?.id ?? null;

      const payload: Record<string, unknown> = {
        fonte: "manual",
        tipo_documento: tipo,
        tem_xml_obrigatorio: false,
        criada_por: uid,
        fornecedor_razao_social: razao.trim(),
        fornecedor_cnpj: cnpj.replace(/\D/g, "") || null,
        nf_numero: numero.trim() || null,
        nf_data_emissao: dataEmissao,
        data_vencimento: dataVenc || null,
        descricao: descricao.trim() || null,
        pais_emissor: paisFinal,
        moeda: moedaFinal,
        valor: valorFinal,
        valor_origem: valorOrigemFinal,
        taxa_conversao: taxaFinal,
        numero_parcela: numParcela ? Number(numParcela) : null,
        total_parcelas: totalParcelas ? Number(totalParcelas) : null,
        arquivo_storage_path: arquivoPath,
      };

      const { error: insErr } = await supabase.from("nfs_stage").insert(payload as any);
      if (insErr) {
        throw new Error(insErr.message);
      }

      toast.success("Documento adicionado.");
      qc.invalidateQueries({ queryKey: ["lancamentos-caixa-banco"] });
      qc.invalidateQueries({ queryKey: ["movimentacoes-gerencial"] });
      qc.invalidateQueries({ queryKey: ["nfs_stage"] });
      reset();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2 className="h-5 w-5" />
            Adicionar documento
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <div className="md:col-span-2">
            <Label>Tipo de documento *</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDocumento)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fatura">Fatura</SelectItem>
                <SelectItem value="invoice">Invoice (exterior)</SelectItem>
                <SelectItem value="recibo">Recibo</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Fornecedor (razão social) *</Label>
            <Input value={razao} onChange={(e) => setRazao(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label>CNPJ</Label>
            <Input
              value={cnpj}
              onChange={(e) => setCnpj(maskCNPJ(e.target.value))}
              placeholder="00.000.000/0000-00"
            />
          </div>

          <div>
            <Label>Número do documento</Label>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={60} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} />
          </div>

          <div>
            <Label>Data de emissão *</Label>
            <Input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
          </div>
          <div>
            <Label>Vencimento</Label>
            <Input type="date" value={dataVenc} onChange={(e) => setDataVenc(e.target.value)} />
          </div>

          {isInvoice ? (
            <>
              <div>
                <Label>País emissor</Label>
                <Input
                  value={paisEmissor}
                  onChange={(e) => setPaisEmissor(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="BR"
                />
              </div>
              <div>
                <Label>Moeda *</Label>
                <Input
                  value={moeda}
                  onChange={(e) => setMoeda(e.target.value.toUpperCase().slice(0, 3))}
                  placeholder="USD"
                />
              </div>
              <div>
                <Label>Valor na moeda de origem *</Label>
                <Input
                  inputMode="decimal"
                  value={valorOrigem}
                  onChange={(e) => setValorOrigem(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div>
                <Label>Taxa de conversão *</Label>
                <Input
                  inputMode="decimal"
                  value={taxaConv}
                  onChange={(e) => setTaxaConv(e.target.value)}
                  placeholder="0,0000"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Valor em BRL (calculado)</Label>
                <Input
                  readOnly
                  value={
                    isFinite(valorBRLCalc)
                      ? valorBRLCalc.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })
                      : ""
                  }
                  className="bg-muted"
                />
              </div>
            </>
          ) : (
            <div className="md:col-span-2">
              <Label>Valor (BRL) *</Label>
              <Input
                inputMode="decimal"
                value={valorBRL}
                onChange={(e) => setValorBRL(e.target.value)}
                placeholder="0,00"
              />
            </div>
          )}

          <div>
            <Label>Nº da parcela</Label>
            <Input
              inputMode="numeric"
              value={numParcela}
              onChange={(e) => setNumParcela(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div>
            <Label>Total de parcelas</Label>
            <Input
              inputMode="numeric"
              value={totalParcelas}
              onChange={(e) => setTotalParcelas(e.target.value.replace(/\D/g, ""))}
            />
          </div>

          <div className="md:col-span-2">
            <Label>Arquivo (PDF, PNG ou JPG)</Label>
            <Input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground mt-1">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar documento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
