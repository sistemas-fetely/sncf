import { useState, useEffect, useRef } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, ArrowRight, Save, Loader2 } from "lucide-react";
import { StepUploadDocumentos, type UploadedFile } from "./StepUploadDocumentosCLT";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getTarefasDinamicas } from "@/lib/onboarding-tarefas";
import { WizardSteps } from "./WizardSteps";
import { StepDadosPessoais } from "./StepDadosPessoais";
import { StepDocumentos } from "./StepDocumentos";
import { StepDadosProfissionais } from "./StepDadosProfissionais";
import { StepDadosBancarios } from "./StepDadosBancarios";
import { StepDependentes } from "./StepDependentes";
import {
  dadosPessoaisSchema,
  documentosSchema,
  dadosProfissionaisSchema,
  dadosBancariosSchema,
  dependentesSchema,
  type DadosPessoaisForm,
  type DocumentosForm,
  type DadosProfissionaisForm,
  type DadosBancariosForm,
  type DependentesForm,
} from "@/lib/validations/colaborador-clt";

const TOTAL_STEPS = 6;

const stepSchemas = [
  dadosPessoaisSchema,
  documentosSchema,
  dadosProfissionaisSchema,
  dadosBancariosSchema,
  dependentesSchema,
];

type AllFormData = DadosPessoaisForm & DocumentosForm & DadosProfissionaisForm & DadosBancariosForm & DependentesForm;

export function CadastroColaboradorCLT() {
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [criarAcesso, setCriarAcesso] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();

  const conviteId = (location.state as any)?.conviteId || null;
  const initialData = (location.state as any)?.initialData || null;

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>(
    () => (initialData?.documentos_upload as any) || []
  );
  const uploadFolderRef = useRef(initialData?.upload_folder || crypto.randomUUID());

  const methods = useForm<AllFormData>({
    mode: "onBlur",
    defaultValues: {
      nacionalidade: "Brasileira",
      tipo_contrato: "indeterminado",
      jornada_semanal: "44",
      tipo_conta: "corrente",
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

  const onSubmit = async (data: AllFormData) => {
    setSaving(true);
    try {
      const { dependentes, salario_base, jornada_semanal, documentos_upload, upload_folder, celular_corporativo, ...colaboradorData } = data as any;

      const cleaned = Object.fromEntries(
        Object.entries(colaboradorData).map(([k, v]) => [k, v === "" ? null : v])
      );

      const { data: inserted, error } = await supabase
        .from("colaboradores_clt")
        .insert({
          ...cleaned,
          salario_base: Number(salario_base),
          jornada_semanal: Number(jornada_semanal) || 44,
          created_by: user?.id,
        } as any)
        .select("id")
        .single();

      if (error) throw error;

      // Insert dependents
      if (dependentes && dependentes.length > 0) {
        const depsToInsert = dependentes.map((d) => ({
          colaborador_id: inserted.id,
          nome_completo: d.nome_completo,
          cpf: d.cpf || null,
          data_nascimento: d.data_nascimento,
          parentesco: d.parentesco,
          incluir_irrf: d.incluir_irrf,
          incluir_plano_saude: d.incluir_plano_saude,
        }));

        const { error: depError } = await supabase.from("dependentes").insert(depsToInsert);
        if (depError) throw depError;
      }

      // Update convite status if created from invitation
      if (conviteId) {
        await supabase
          .from("convites_cadastro")
          .update({ colaborador_id: inserted.id, status: "cadastrado" })
          .eq("id", conviteId);
      }

      // Criar acesso ao portal automaticamente (opt-out)
      if (criarAcesso && inserted?.id) {
        try {
          const { data: accessData, error: accessError } = await supabase.functions.invoke("manage-user", {
            body: {
              action: "create_user_from_colaborador",
              colaborador_id: inserted.id,
              tipo: "clt",
              departamento_id: (cleaned as any).departamento_id || null,
              unidade_id: (cleaned as any).unidade_id,
            },
          });

          if (accessError || (accessData as any)?.error) {
            toast.warning(
              `Colaborador criado, mas não foi possível criar acesso: ${
                accessError?.message || (accessData as any)?.error
              }. Você pode criar manualmente em Gerenciar Usuários.`
            );
          } else if ((accessData as any)?.aviso_template) {
            toast.warning(
              `Acesso criado, mas template não foi aplicado: ${(accessData as any).aviso_template}`
            );
          } else {
            toast.success("Colaborador e acesso ao portal criados com sucesso!");
          }
        } catch (e: any) {
          toast.warning(
            `Colaborador criado, mas criação de acesso falhou: ${e.message}. Crie manualmente.`
          );
        }
      }

      // Gerar onboarding automático
      try {
        let provisionamento = null;
        if (conviteId) {
          const { data: conviteData } = await supabase
            .from("convites_cadastro")
            .select("dados_contratacao, data_inicio_prevista, lider_direto_id")
            .eq("id", conviteId)
            .single();
          provisionamento = (conviteData as any)?.dados_contratacao || null;
        }

        const { data: newChecklist } = await supabase
          .from("onboarding_checklists")
          .insert({
            colaborador_id: inserted.id,
            colaborador_tipo: "clt",
            convite_id: conviteId || null,
            coordenador_user_id: user?.id || null,
            coordenador_nome: profile?.full_name || null,
          } as any)
          .select("id")
          .single();

        if (newChecklist) {
          const dataAdmissao = data.data_admissao ? new Date(data.data_admissao + "T12:00:00") : new Date();

          let gestorUserId: string | null = null;
          const gestorId = (data as any).lider_direto_id || (initialData as any)?.lider_direto_id;
          if (gestorId) {
            const { data: gp } = await supabase.from("profiles").select("user_id").eq("id", gestorId).single();
            gestorUserId = gp?.user_id || null;
          }

          const tarefaTemplates = await getTarefasDinamicas("clt", provisionamento, supabase);
          const tarefas = tarefaTemplates.map((t) => {
            const prazoDate = new Date(dataAdmissao);
            prazoDate.setDate(prazoDate.getDate() + t.prazo_dias);
            return {
              tipo_processo: "onboarding",
              sistema_origem: t.sistema_origem || "people",
              area_destino: t.area_destino || null,
              prioridade: t.prioridade || "normal",
              processo_id: newChecklist.id,
              colaborador_id: inserted.id,
              colaborador_tipo: "clt",
              colaborador_nome: data.nome_completo || null,
              titulo: t.titulo,
              descricao: t.descricao || null,
              responsavel_role: t.responsavel_role,
              responsavel_user_id:
                t.responsavel_role === "gestor_direto" && gestorUserId ? gestorUserId : null,
              prazo_dias: t.prazo_dias,
              prazo_data: prazoDate.toISOString().slice(0, 10),
              bloqueante: t.bloqueante || false,
              motivo_bloqueio: t.motivo_bloqueio || null,
              accountable_role: t.accountable_role || null,
              accountable_user_id: t.accountable_role ? null : user?.id || null,
            };
          });

          if (tarefas.length > 0) {
            await supabase.from("sncf_tarefas").insert(tarefas as any);

            // Notificar responsáveis das tarefas
            const responsaveisUnicos = [...new Set(tarefas.filter((t) => t.responsavel_user_id).map((t) => t.responsavel_user_id as string))];
            for (const userId of responsaveisUnicos) {
              await supabase.from("notificacoes_rh").insert({
                tipo: "onboarding_tarefa_atribuida",
                titulo: `Novas tarefas de onboarding atribuídas`,
                mensagem: `Você tem tarefas pendentes no onboarding de ${data.nome_completo}. Acesse o módulo de Onboarding para verificar.`,
                link: "/onboarding",
                user_id: userId,
              });
            }
          }
        }
      } catch (onbErr) {
        console.error("Erro ao criar onboarding:", onbErr);
      }

      toast.success("Colaborador cadastrado com sucesso!");
      navigate(`/colaboradores/${inserted.id}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao cadastrar colaborador");
    } finally {
      setSaving(false);
    }
  };

  const handleFinalSubmit = async () => {
    const valid = await validateCurrentStep();
    if (!valid) return;
    if (isSuperAdmin) {
      // Super admin: submit directly without react-hook-form validation
      await onSubmit(methods.getValues());
    } else {
      methods.handleSubmit(onSubmit)();
    }
  };

  return (
    <FormProvider {...methods}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Novo Colaborador CLT</h1>
          <p className="text-muted-foreground text-sm mt-1">Preencha os dados para cadastrar um novo colaborador</p>
        </div>

        <WizardSteps currentStep={currentStep} />

        <Card className="card-shadow">
          <CardContent className="pt-6">
            {currentStep === 1 && <StepDadosPessoais />}
            {currentStep === 2 && <StepDocumentos />}
            {currentStep === 3 && <StepDadosProfissionais />}
            {currentStep === 4 && <StepDadosBancarios />}
            {currentStep === 5 && <StepDependentes />}
            {currentStep === 6 && (
              <StepUploadDocumentos
                tipo="clt"
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
                  id="criar-acesso-clt"
                  checked={criarAcesso}
                  onCheckedChange={(v) => setCriarAcesso(!!v)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <label htmlFor="criar-acesso-clt" className="text-sm font-medium cursor-pointer">
                    Criar acesso ao portal automaticamente
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Um usuário será criado com o cargo e unidade informados.
                    O colaborador receberá email de boas-vindas com link de primeiro acesso.
                  </p>
                </div>
              </div>
            </div>
          )}
          <CardFooter className="flex justify-between border-t pt-6">
            <Button type="button" variant="outline" onClick={currentStep === 1 ? () => navigate("/colaboradores") : goBack} className="gap-2">
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
                Salvar Colaborador
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </FormProvider>
  );
}

export { CadastroColaboradorCLT as CadastroColaboradorCLTWrapper };
