import { useState, useEffect, useRef } from "react";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CategoriaFolhaSelect } from "./CategoriaFolhaSelect";
import { cleanCNPJ, formatCNPJ, validateCNPJ } from "@/lib/cnpj";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCriado: (parceiroId: string) => void;
}

// Dados extras capturados silenciosamente da BrasilAPI, vinculados ao CNPJ consultado
interface DadosBrasilapi {
  cnpj: string;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  email: string | null;
}

export function NovoFornecedorRapidoDialog({ open, onOpenChange, onCriado }: Props) {
  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [categoriaPadraoId, setCategoriaPadraoId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const ultimoCnpjConsultado = useRef("");
  const dadosBrasilapiRef = useRef<DadosBrasilapi | null>(null);
  const qc = useQueryClient();

  const cnpjLimpo = cleanCNPJ(cnpj);
  const cnpjValido = cnpjLimpo.length === 14 && validateCNPJ(cnpjLimpo);
  const cnpjComErroDV = cnpjLimpo.length === 14 && !cnpjValido;

  useEffect(() => {
    if (!cnpjValido) return;
    if (ultimoCnpjConsultado.current === cnpjLimpo) return;

    const timer = setTimeout(async () => {
      ultimoCnpjConsultado.current = cnpjLimpo;
      setConsultando(true);
      try {
        const { data, error } = await supabase.functions.invoke("consultar-cnpj", {
          body: { cnpj: cnpjLimpo },
        });

        if (error) {
          toast.warning("Consulta da Receita indisponível. Preencha manualmente.");
          console.error("consultar-cnpj error:", error);
          return;
        }

        if (data?.found === false) {
          toast.info("CNPJ não encontrado na Receita. Preencha manualmente.");
          return;
        }

        if (data?.razao_social) setRazaoSocial(data.razao_social);
        if (data?.nome_fantasia) setNomeFantasia(data.nome_fantasia);

        // Captura silenciosa dos campos extras — vinculados ao CNPJ consultado
        // (se o operador depois mudar o CNPJ, descartamos no submit via comparação)
        const logradouroCompleto = data?.complemento
          ? `${data.logradouro ?? ""}, ${data.complemento}`.trim().replace(/^,\s*/, "")
          : data?.logradouro ?? null;

        dadosBrasilapiRef.current = {
          cnpj: cnpjLimpo,
          cep: data?.cep || null,
          logradouro: logradouroCompleto || null,
          numero: data?.numero || null,
          bairro: data?.bairro || null,
          cidade: data?.municipio || null,
          uf: data?.uf || null,
          telefone: data?.ddd_telefone_1 || null,
          email: data?.email || null,
        };

        if (data?.razao_social || data?.nome_fantasia) {
          toast.success("Dados preenchidos pela Receita Federal");
        }
      } catch (e) {
        toast.warning("Consulta indisponível. Preencha manualmente.");
        console.error("consultar-cnpj exception:", e);
      } finally {
        setConsultando(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [cnpjLimpo, cnpjValido]);

  const reset = () => {
    setCnpj("");
    setRazaoSocial("");
    setNomeFantasia("");
    setCategoriaPadraoId(null);
    setConsultando(false);
    ultimoCnpjConsultado.current = "";
    dadosBrasilapiRef.current = null;
  };

  const handleSubmit = async () => {
    if (!razaoSocial.trim()) {
      toast.error("Razão social é obrigatória");
      return;
    }
    if (cnpjLimpo && !validateCNPJ(cnpjLimpo)) {
      toast.error("CNPJ inválido — verifique os dígitos");
      return;
    }

    // Só usa os dados extras se foram capturados para o CNPJ atual
    // (operador pode ter mudado o CNPJ após a consulta — descarta)
    const dadosExtras =
      dadosBrasilapiRef.current?.cnpj === cnpjLimpo
        ? dadosBrasilapiRef.current
        : null;

    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("parceiros_comerciais")
        .insert({
          razao_social: razaoSocial.trim(),
          nome_fantasia: nomeFantasia.trim() || null,
          cnpj: cnpjLimpo || null,
          plano_contas_id: categoriaPadraoId,
          ativo: true,
          tipo: "pj",
          origem: "manual",
          // Cadastro completo se veio da Receita; incompleto se foi só manual
          cadastro_incompleto: !dadosExtras,
          // Enriquecimento silencioso — só se houve consulta bem-sucedida ao CNPJ atual
          cep: dadosExtras?.cep ?? null,
          logradouro: dadosExtras?.logradouro ?? null,
          numero: dadosExtras?.numero ?? null,
          bairro: dadosExtras?.bairro ?? null,
          cidade: dadosExtras?.cidade ?? null,
          uf: dadosExtras?.uf ?? null,
          telefone: dadosExtras?.telefone ?? null,
          email: dadosExtras?.email ?? null,
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
            Digite o CNPJ — os dados da Receita Federal são preenchidos automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>CNPJ</Label>
            <div className="relative">
              <Input
                value={cnpj}
                onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
                maxLength={18}
                className={
                  cnpjComErroDV
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }
              />
              {consultando && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {cnpjComErroDV && (
              <p className="text-xs text-destructive mt-1">
                Dígitos verificadores inválidos
              </p>
            )}
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
