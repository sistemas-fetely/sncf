import { useState, useRef } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, ArrowRight, Save, Loader2 } from "lucide-react";
import { StepUploadDocumentos, type UploadedFile } from "@/components/colaborador-clt/StepUploadDocumentosCLT";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { WizardStepsPJ } from "./WizardStepsPJ";
import { StepDadosPessoaisPJ } from "./StepDadosPessoaisPJ";
import { StepDocumentosPJ } from "./StepDocumentosPJ";
import { StepDadosProfissionaisPJ } from "./StepDadosProfissionaisPJ";
import { StepDadosBancarios } from "@/components/colaborador-clt/StepDadosBancarios";
import { StepDependentes } from "@/components/colaborador-clt/StepDependentes";
import {
  dadosPessoaisPJSchema,
  documentosPJSchema,
  dadosProfissionaisPJSchema,
  dadosBancariosPJSchema,
  dependentesPJSchema,
  type AllPJFormData,
} from "@/lib/validations/contrato-pj";

const TOTAL_STEPS = 6;

const stepSchemas = [
  dadosPessoaisPJSchema,
  documentosPJSchema,
  dadosProfissionaisPJSchema,
  dadosBancariosPJSchema,
  dependentesPJSchema,
];

export function CadastroContratoPJ() {
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [criarAcesso, setCriarAcesso] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  
  const initialData = (location.state as any)?.initialData || null;

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>(
    () => (initialData?.documentos_upload as any) || []
  );
  const uploadFolderRef = useRef(initialData?.upload_folder || crypto.randomUUID());

  const methods = useForm<AllPJFormData>({
    mode: "onBlur",
    defaultValues: {
      contrato_assinado: false,
      forma_pagamento: "transferencia",
      dia_vencimento: 10,
      renovacao_automatica: false,
      status: "rascunho",
      tipo_conta: "corrente",
      nacionalidade: "Brasileira",
      departamento: "",
      departamento_id: null,
      cargo_id: null,
      unidade_id: "",
      dependentes: [],
      ...(initialData || {}),
    },
  });

  const isSuperAdmin = useAuth().roles.includes("super_admin");

  const validateCurrentStep = async () => {
    if (isSuperAdmin) return true; // Super admin bypasses validation
    const schema = stepSchemas[currentStep - 1];
    if (!schema) return true; // Upload step has no schema
    const values = methods.getValues();
    const result = schema.safeParse(values);
    if (!result.success) {
      result.error.errors.forEach((err) => {
        const field = err.path.join(".") as any;
        methods.setError(field, { type: "manual", message: err.message });
      });
      return false;
    }
    return true;
  };

  const goNext = async () => {
    const valid = await validateCurrentStep();
    if (!valid) return;
    setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 1));

  const onSubmit = async (data: AllPJFormData) => {
    setSaving(true);
    try {
      const {
        dependentes,
        email_corporativo,
        telefone_corporativo,
        ramal,
        data_integracao,
        titulo_eleitor,
        zona_eleitoral,
        secao_eleitoral,
        cnh_numero,
        cnh_categoria,
        cnh_validade,
        certificado_reservista,
        valor_mensal,
        ...contratoData
      } = data as any;

      const { data: inserted, error } = await supabase
        .from("contratos_pj")
        .insert({
          cnpj: contratoData.cnpj,
          razao_social: contratoData.razao_social,
          nome_fantasia: contratoData.nome_fantasia || null,
          inscricao_municipal: contratoData.inscricao_municipal || null,
          inscricao_estadual: contratoData.inscricao_estadual || null,
          contato_nome: contratoData.contato_nome,
          contato_telefone: contratoData.contato_telefone || null,
          contato_email: contratoData.contato_email || null,
          cpf: contratoData.cpf || null,
          rg: contratoData.rg || null,
          orgao_emissor: contratoData.orgao_emissor || null,
          data_nascimento: contratoData.data_nascimento || null,
          genero: contratoData.genero || null,
          estado_civil: contratoData.estado_civil || null,
          nacionalidade: contratoData.nacionalidade || null,
          etnia: contratoData.etnia || null,
          nome_mae: contratoData.nome_mae || null,
          nome_pai: contratoData.nome_pai || null,
          cep: contratoData.cep || null,
          logradouro: contratoData.logradouro || null,
          numero: contratoData.numero || null,
          complemento: contratoData.complemento || null,
          bairro: contratoData.bairro || null,
          cidade: contratoData.cidade || null,
          uf: contratoData.uf || null,
          telefone: contratoData.telefone || null,
          email_pessoal: contratoData.email_pessoal || null,
          email_corporativo: email_corporativo || null,
          telefone_corporativo: telefone_corporativo || null,
          contato_emergencia_nome: contratoData.contato_emergencia_nome || null,
          contato_emergencia_telefone: contratoData.contato_emergencia_telefone || null,
          objeto: contratoData.objeto || null,
          tipo_servico: contratoData.tipo_servico,
          cargo_id: contratoData.cargo_id || null,
          departamento: contratoData.departamento,
          departamento_id: contratoData.departamento_id || null,
          unidade_id: contratoData.unidade_id || null,
          valor_mensal: Number(valor_mensal),
          forma_pagamento: contratoData.forma_pagamento,
          dia_vencimento: Number(contratoData.dia_vencimento) || 10,
          data_inicio: contratoData.data_inicio,
          data_fim: contratoData.data_fim || null,
          renovacao_automatica: contratoData.renovacao_automatica,
          banco_nome: contratoData.banco_nome || null,
          banco_codigo: contratoData.banco_codigo || null,
          agencia: contratoData.agencia || null,
          conta: contratoData.conta || null,
          tipo_conta: contratoData.tipo_conta || null,
          chave_pix: contratoData.chave_pix || null,
          observacoes: contratoData.observacoes || null,
          status: contratoData.status,
          contrato_assinado: contratoData.contrato_assinado,
          created_by: user?.id,
        } as any)
        .select("id")
        .single();

      if (error) throw error;


      // Criar acesso ao portal automaticamente (opt-out)
      if (criarAcesso && inserted?.id) {
        try {
          const { data: accessData, error: accessError } = await supabase.functions.invoke("manage-user", {
            body: {
              action: "create_user_from_colaborador",
              colaborador_id: inserted.id,
              tipo: "pj",
              departamento_id: (contratoData as any).departamento_id || null,
              unidade_id: (contratoData as any).unidade_id,
            },
          });

          if (accessError || (accessData as any)?.error) {
            toast.warning(
              `Contrato criado, mas não foi possível criar acesso: ${
                accessError?.message || (accessData as any)?.error
              }. Você pode criar manualmente em Gerenciar Usuários.`
            );
          } else if ((accessData as any)?.aviso_template) {
            toast.warning(
              `Acesso criado, mas template não foi aplicado: ${(accessData as any).aviso_template}`
            );
          } else {
            toast.success("Contrato e acesso ao portal criados com sucesso!");
          }
        } catch (e: any) {
          toast.warning(
            `Contrato criado, mas criação de acesso falhou: ${e.message}. Crie manualmente.`
          );
        }
      } else {
        toast.success("Contrato PJ cadastrado com sucesso!");
      }
      navigate(`/contratos-pj/${inserted.id}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao cadastrar contrato PJ");
    } finally {
      setSaving(false);
    }
  };

  const handleFinalSubmit = async () => {
    const valid = await validateCurrentStep();
    if (!valid) return;
    if (isSuperAdmin) {
      await onSubmit(methods.getValues());
    } else {
      methods.handleSubmit(onSubmit)();
    }
  };

  return (
    <FormProvider {...methods}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Novo Contrato PJ</h1>
          <p className="text-muted-foreground text-sm mt-1">Preencha os dados para cadastrar um novo contrato de prestação de serviço</p>
        </div>

        <WizardStepsPJ currentStep={currentStep} />

        <Card className="card-shadow">
          <CardContent className="pt-6">
            {currentStep === 1 && <StepDadosPessoaisPJ />}
            {currentStep === 2 && <StepDocumentosPJ />}
            {currentStep === 3 && <StepDadosProfissionaisPJ />}
            {currentStep === 4 && <StepDadosBancarios />}
            {currentStep === 5 && <StepDependentes />}
            {currentStep === 6 && (
              <StepUploadDocumentos
                tipo="pj"
                folderKey={uploadFolderRef.current}
                uploadedFiles={uploadedFiles}
                onFilesChange={setUploadedFiles}
              />
            )}
          </CardContent>
          {currentStep === TOTAL_STEPS && (
            <div className="px-6 pb-2">
              <div className="flex items-start gap-3 p-4 bg-muted/40 rounded-lg border">
                <Checkbox
                  id="criar-acesso-pj"
                  checked={criarAcesso}
                  onCheckedChange={(v) => setCriarAcesso(!!v)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <label htmlFor="criar-acesso-pj" className="text-sm font-medium cursor-pointer">
                    Criar acesso ao portal automaticamente
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    O prestador PJ receberá acesso ao portal com as mesmas funcionalidades do CLT,
                    diferindo apenas na base legal.
                  </p>
                </div>
              </div>
            </div>
          )}
          <CardFooter className="flex justify-between border-t pt-6">
            <Button type="button" variant="outline" onClick={currentStep === 1 ? () => navigate("/contratos-pj") : goBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              {currentStep === 1 ? "Cancelar" : "Voltar"}
            </Button>
            {currentStep < TOTAL_STEPS ? (
              <Button type="button" onClick={goNext} className="gap-2">
                Próximo
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleFinalSubmit} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar Contrato
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </FormProvider>
  );
}
