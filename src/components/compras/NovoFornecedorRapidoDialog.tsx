import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { CategoriaFolhaSelect } from "./CategoriaFolhaSelect";
import { parseNFeXml } from "@/lib/financeiro/xml-nfe-parser";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCriado: (parceiroId: string) => void;
}

export function NovoFornecedorRapidoDialog({ open, onOpenChange, onCriado }: Props) {
  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [categoriaPadraoId, setCategoriaPadraoId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const handleImportarNF = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".xml")) {
      toast.error("Selecione um arquivo XML da NF-e");
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseNFeXml(text);
      if (!parsed) {
        toast.error("Não foi possível ler a NF-e. Verifique se é um XML válido.");
        return;
      }
      if (parsed.fornecedor_cnpj) setCnpj(parsed.fornecedor_cnpj);
      if (parsed.fornecedor_nome) {
        setRazaoSocial(parsed.fornecedor_nome);
        if (!nomeFantasia) setNomeFantasia(parsed.fornecedor_nome);
      }
      toast.success("Dados importados da NF-e");
    } catch (e) {
      toast.error("Erro ao ler XML: " + (e as Error).message);
    }
  };

  const reset = () => {
    setCnpj("");
    setRazaoSocial("");
    setNomeFantasia("");
    setCategoriaPadraoId(null);
  };

  const handleSubmit = async () => {
    if (!razaoSocial.trim()) {
      toast.error("Razão social é obrigatória");
      return;
    }
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    if (cnpjLimpo && cnpjLimpo.length !== 14) {
      toast.error("CNPJ inválido (deve ter 14 dígitos)");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("parceiros_comerciais")
        .insert({
          razao_social: razaoSocial.trim(),
          nome_fantasia: nomeFantasia.trim() || null,
          cnpj: cnpjLimpo || null,
          categoria_padrao_id: categoriaPadraoId,
          ativo: true,
          tipo: "pj",
          origem: "manual",
        })
        .select()
        .single();
      if (error) throw error;
      toast.success("Fornecedor cadastrado");
      qc.invalidateQueries({ queryKey: ["compras", "parceiros"] });
      qc.invalidateQueries({ queryKey: ["compras", "parceiros-comprador"] });
      qc.invalidateQueries({ queryKey: ["compras", "parceiros-completos"] });
      onCriado(data.id);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao cadastrar: " + (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastrar fornecedor</DialogTitle>
          <DialogDescription>
            Cadastro rápido. Mais detalhes podem ser preenchidos depois em Parceiros Comerciais.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="p-3 bg-muted/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-4 w-4" />
              Tem a NF-e do fornecedor?
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              Importar XML
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportarNF(f);
                e.target.value = "";
              }}
            />
          </Card>

          <div>
            <Label>CNPJ</Label>
            <Input
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              placeholder="00.000.000/0000-00"
              maxLength={18}
            />
          </div>

          <div>
            <Label>Razão social *</Label>
            <Input
              value={razaoSocial}
              onChange={(e) => setRazaoSocial(e.target.value)}
              placeholder="Nome jurídico do fornecedor"
            />
          </div>

          <div>
            <Label>Nome fantasia</Label>
            <Input
              value={nomeFantasia}
              onChange={(e) => setNomeFantasia(e.target.value)}
              placeholder="Nome comercial (opcional)"
            />
          </div>

          <div>
            <Label>Categoria contábil padrão (opcional)</Label>
            <CategoriaFolhaSelect
              value={categoriaPadraoId}
              onChange={(v) => setCategoriaPadraoId(v)}
              tipo="despesa"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Será pré-selecionada automaticamente nas próximas compras deste fornecedor.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ backgroundColor: "#1A4A3A", color: "white" }}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Cadastrar e selecionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
