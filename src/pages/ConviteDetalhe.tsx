import { useState, useEffect } from "react";
import { publicUrl } from "@/lib/urls";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft, Edit, Save, Loader2, X, User, FileText, Building2, CreditCard, Users, UserPlus, Mail, Briefcase, Building, Paperclip, CheckCircle2, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { statusStyles } from "@/components/convite-detalhe/constants";
import { ConviteDadosPessoaisCLT } from "@/components/convite-detalhe/ConviteDadosPessoaisCLT";
import { ConviteDocumentosCLT } from "@/components/convite-detalhe/ConviteDocumentosCLT";
import { ConviteDadosBancarios } from "@/components/convite-detalhe/ConviteDadosBancarios";
import { ConviteDependentes } from "@/components/convite-detalhe/ConviteDependentes";
import { ConviteDadosEmpresaPJ } from "@/components/convite-detalhe/ConviteDadosEmpresaPJ";
import { ConviteDadosPessoaisPJ } from "@/components/convite-detalhe/ConviteDadosPessoaisPJ";
import { ConviteDadosProfissionaisCLT } from "@/components/convite-detalhe/ConviteDadosProfissionaisCLT";
import { ConviteDadosEmpresaCLT } from "@/components/convite-detalhe/ConviteDadosEmpresaCLT";
import { ConviteDadosProfissionaisPJ } from "@/components/convite-detalhe/ConviteDadosProfissionaisPJ";
import { getTarefasDinamicas } from "@/lib/onboarding-tarefas";
import { useAuth } from "@/contexts/AuthContext";
import { SmartBackButton } from "@/components/SmartBackButton";
import { fetchExtensoesAplicaveis } from "@/hooks/useExtensoesAplicaveis";
import { SystemReadinessBanner } from "@/components/shared/SystemReadinessBanner";
import { PageHeader } from "@/components/layout/PageHeader";

async function gerarTarefasExtensoes(params: {
  checklistId: string;
  colaboradorId: string;
  colaboradorTipo: "clt" | "pj";
  colaboradorNome: string;
  cargoId: string | null;
  cargoNome: string | null;
  departamentoLabel: string | null;
  sistemasIds: string[];
  dataReferencia: Date;
  gestorUserId: string | null;
  userId: string | null;
}) {
  // Busca id da categoria onboarding
  const { data: cat } = await (supabase as any)
    .from("sncf_processos_categorias")
    .select("id")
    .eq("slug", "onboarding")
    .maybeSingle();
  if (!cat?.id) return;

  // Busca cargo_id pelo nome se necessário (cargo do convite vem como string)
  let cargoIdResolved = params.cargoId;
  if (!cargoIdResolved && params.cargoNome) {
    const { data: c } = await supabase
      .from("cargos")
      .select("id")
      .eq("nome", params.cargoNome)
      .maybeSingle();
    cargoIdResolved = (c as any)?.id ?? null;
  }

  const aplicaveis = await fetchExtensoesAplicaveis({
    categoriaId: cat.id,
    cargoId: cargoIdResolved,
    departamentoLabel: params.departamentoLabel,
    sistemasIds: params.sistemasIds,
    sistemasLabels: params.sistemasIds, // also try matching label (some are slugs)
  });

  if (aplicaveis.length === 0) return;

  const inserts: any[] = [];
  for (const { extensao, tarefas } of aplicaveis) {
    for (const t of tarefas) {
      const prazoDate = new Date(params.dataReferencia);
      prazoDate.setDate(prazoDate.getDate() + (t.prazo_dias || 0));
      inserts.push({
        tipo_processo: "onboarding",
        sistema_origem: t.sistema_origem || "people",
        area_destino: t.area_destino || null,
        prioridade: t.prioridade || "normal",
        processo_id: params.checklistId,
        colaborador_id: params.colaboradorId,
        colaborador_tipo: params.colaboradorTipo,
        colaborador_nome: params.colaboradorNome,
        titulo: t.titulo,
        descricao: t.descricao || null,
        responsavel_role: t.responsavel_role,
        responsavel_user_id: t.responsavel_role === "gestor_direto" && params.gestorUserId ? params.gestorUserId : null,
        prazo_dias: t.prazo_dias,
        prazo_data: prazoDate.toISOString().slice(0, 10),
        bloqueante: t.bloqueante || false,
        motivo_bloqueio: t.motivo_bloqueio || null,
        accountable_role: t.accountable_role || null,
        accountable_user_id: t.accountable_role ? null : params.userId,
        link_acao: t.link_acao || null,
        origem_extensao_id: extensao.id,
      });
    }
  }
  if (inserts.length > 0) {
    await supabase.from("sncf_tarefas").insert(inserts as any);
  }
}

interface Convite {
  id: string;
  token: string;
  tipo: string;
  nome: string;
  email: string;
  cargo: string | null;
  cargo_id: string | null;
  departamento: string | null;
  departamento_id: string | null;
  unidade_id: string | null;
  status: string;
  expira_em: string;
  created_at: string;
  preenchido_em: string | null;
  dados_preenchidos: Record<string, any> | null;
  colaborador_id: string | null;
  contrato_pj_id: string | null;
  salario_previsto: number | null;
  lider_direto_id: string | null;
  data_inicio_prevista: string | null;
  grupo_acesso_id: string | null;
  observacoes_colaborador: string | null;
  origem: string | null;
}

function ConviteAnexos({ documentos }: { documentos?: { key: string; name: string; url: string }[] }) {
  if (!documentos || documentos.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Paperclip className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhum documento anexado pelo candidato.</p>
        </CardContent>
      </Card>
    );
  }

  const labelMap: Record<string, string> = {
    rg_cnh_frente: "RG ou CNH (Frente)",
    rg_cnh_verso: "RG ou CNH (Verso)",
    contrato_social: "Contrato Social",
    cartao_cnpj: "Cartão CNPJ",
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <h3 className="text-lg font-medium mb-4">Documentos Anexados</h3>
        {documentos.map((doc) => (
          <div key={doc.key} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
              <div>
                <p className="text-sm font-medium">{labelMap[doc.key] || doc.key}</p>
                <p className="text-xs text-muted-foreground">{doc.name}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild className="gap-2">
              <a href={doc.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Visualizar
              </a>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function ConviteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [convite, setConvite] = useState<Convite | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [criando, setCriando] = useState(false);
  const { user, profile } = useAuth();

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data, error } = await supabase
        .from("convites_cadastro")
        .select("*")
        .eq("id", id)
        .single();
      if (error || !data) {
        toast.error("Convite não encontrado");
        navigate("/convites-cadastro");
        return;
      }
      setConvite(data as Convite);
      setFormData((data as Convite).dados_preenchidos || {});
      setLoading(false);
    };
    fetchData();
  }, [id]);

  const handleSave = async () => {
    if (!convite) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("convites_cadastro")
        .update({ dados_preenchidos: formData, preenchido_em: new Date().toISOString() })
        .eq("id", convite.id);
      if (error) throw error;
      setConvite({ ...convite, dados_preenchidos: formData });
      setEditing(false);
      toast.success("Dados atualizados com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleResendEmail = async () => {
    if (!convite) return;
    setSendingEmail(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "convite-cadastro",
          recipientEmail: convite.email,
          idempotencyKey: `convite-resend-${convite.id}-${Date.now()}`,
          templateData: {
            nome: convite.nome,
            tipo: convite.tipo,
            cargo: convite.cargo || "",
            departamento: convite.departamento || "",
            link: publicUrl(`/cadastro/${convite.token}`),
          },
        },
      });
      if (error) throw error;

      // Update status to email_enviado if still pendente
      if (convite.status === "pendente") {
        await supabase
          .from("convites_cadastro")
          .update({ status: "email_enviado" })
          .eq("id", convite.id);
        setConvite({ ...convite, status: "email_enviado" });
      }

      toast.success("Email enviado para " + convite.email);
    } catch (err: any) {
      toast.error("Erro ao enviar email: " + err.message);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleCriarColaborador = async () => {
    if (!convite || !formData) return;
    const { dependentes, documentos_upload, ...rest } = formData;

    // Validação mínima
    if (convite.tipo === "clt") {
      const nome = rest.nome_completo || convite.nome;
      if (!nome) { toast.error("Nome do colaborador é obrigatório"); return; }
    } else {
      const nome = rest.contato_nome || convite.nome;
      const cnpj = rest.cnpj;
      const razao = rest.razao_social;
      if (!nome) { toast.error("Nome do contato é obrigatório"); return; }
      if (!cnpj) { toast.error("CNPJ é obrigatório"); return; }
      if (!razao) { toast.error("Razão social é obrigatória"); return; }
    }

    setCriando(true);

    // Validar integridade do convite antes de importar (V3-G)
    if (!convite.cargo_id) {
      toast.error(
        "Este convite não tem cargo válido vinculado (texto livre legado). Edite o convite e selecione um cargo cadastrado antes de importar."
      );
      setCriando(false);
      return;
    }
    if (!convite.unidade_id) {
      toast.error("Este convite não tem unidade definida. Edite o convite e escolha a unidade.");
      setCriando(false);
      return;
    }
    // Verificar se o cargo ainda existe e está ativo
    const { data: cargoAtivo } = await supabase
      .from("cargos")
      .select("id, nome, ativo")
      .eq("id", convite.cargo_id)
      .maybeSingle();
    if (!cargoAtivo || !cargoAtivo.ativo) {
      toast.error(
        `O cargo vinculado a este convite ("${convite.cargo}") não existe mais ou foi inativado. Edite o convite e escolha outro cargo.`
      );
      setCriando(false);
      return;
    }

    try {
      const dc = (convite as any).dados_contratacao || {};

      if (convite.tipo === "clt") {
        // ── CRIAR COLABORADOR CLT ──
        const colaboradorPayload: Record<string, any> = {
          nome_completo: rest.nome_completo || convite.nome,
          cpf: rest.cpf || null,
          rg: rest.rg || null,
          orgao_emissor: rest.orgao_emissor || null,
          data_nascimento: rest.data_nascimento || null,
          genero: rest.genero || null,
          estado_civil: rest.estado_civil || null,
          nacionalidade: rest.nacionalidade || "Brasileira",
          etnia: rest.etnia || null,
          nome_mae: rest.nome_mae || null,
          nome_pai: rest.nome_pai || null,
          telefone: rest.telefone || null,
          email_pessoal: rest.email_pessoal || convite.email || null,
          contato_emergencia_nome: rest.contato_emergencia_nome || null,
          contato_emergencia_telefone: rest.contato_emergencia_telefone || null,
          cep: rest.cep || null,
          logradouro: rest.logradouro || null,
          numero: rest.numero || null,
          complemento: rest.complemento || null,
          bairro: rest.bairro || null,
          cidade: rest.cidade || null,
          uf: rest.uf || null,
          pis_pasep: rest.pis_pasep || null,
          ctps_numero: rest.ctps_numero || null,
          ctps_serie: rest.ctps_serie || null,
          ctps_uf: rest.ctps_uf || null,
          titulo_eleitor: rest.titulo_eleitor || null,
          zona_eleitoral: rest.zona_eleitoral || null,
          secao_eleitoral: rest.secao_eleitoral || null,
          cnh_numero: rest.cnh_numero || null,
          cnh_categoria: rest.cnh_categoria || null,
          cnh_validade: rest.cnh_validade || null,
          certificado_reservista: rest.certificado_reservista || null,
          banco_nome: rest.banco_nome || null,
          banco_codigo: rest.banco_codigo || null,
          agencia: rest.agencia || null,
          conta: rest.conta || null,
          tipo_conta: rest.tipo_conta || "corrente",
          chave_pix: rest.chave_pix || null,
          cargo: convite.cargo || rest.cargo || null,
          cargo_id: convite.cargo_id,
          departamento: convite.departamento || rest.departamento || null,
          departamento_id: convite.departamento_id,
          unidade_id: convite.unidade_id,
          data_admissao: (convite as any).data_inicio_prevista || rest.data_admissao || new Date().toISOString().split("T")[0],
          salario_base: Number((convite as any).salario_previsto || rest.salario_base || 0),
          tipo_contrato: dc.tipo_contrato_clt || rest.tipo_contrato || "indeterminado",
          jornada_semanal: Number(dc.jornada_semanal || rest.jornada_semanal || 44),
          horario_trabalho: dc.horario_trabalho || rest.horario_trabalho || null,
          local_trabalho: dc.local_trabalho || rest.local_trabalho || null,
          email_corporativo: dc.email_corporativo_formato || rest.email_corporativo || null,
          foto_url: rest.foto_url || null,
          created_by: user?.id || null,
        };

        const cleaned = Object.fromEntries(
          Object.entries(colaboradorPayload).map(([k, v]) => [k, v === "" ? null : v])
        );

        const { data: inserted, error } = await supabase
          .from("colaboradores_clt")
          .insert(cleaned as any)
          .select("id")
          .single();

        if (error) throw error;

        if (dependentes && Array.isArray(dependentes) && dependentes.length > 0) {
          const depsToInsert = dependentes.map((d: any) => ({
            colaborador_id: inserted.id,
            nome_completo: d.nome_completo,
            cpf: d.cpf || null,
            data_nascimento: d.data_nascimento,
            parentesco: d.parentesco,
            incluir_irrf: d.incluir_irrf || false,
            incluir_plano_saude: d.incluir_plano_saude || false,
          }));
          await supabase.from("dependentes").insert(depsToInsert);
        }

        if (dc.sistemas_ids && dc.sistemas_ids.length > 0) {
          const acessosToInsert = dc.sistemas_ids.map((s: string) => ({
            colaborador_id: inserted.id,
            sistema: s,
            tem_acesso: true,
            data_concessao: new Date().toISOString().split("T")[0],
          }));
          await supabase.from("colaborador_acessos_sistemas").insert(acessosToInsert);
        }

        await supabase
          .from("convites_cadastro")
          .update({ colaborador_id: inserted.id, status: "cadastrado" })
          .eq("id", convite.id);

        try {
          const { data: newChecklist } = await supabase
            .from("onboarding_checklists")
            .insert({
              colaborador_id: inserted.id,
              colaborador_tipo: "clt",
              convite_id: convite.id,
              coordenador_user_id: user?.id || null,
              coordenador_nome: profile?.full_name || null,
            } as any)
            .select("id")
            .single();

          if (newChecklist) {
            const dataAdmissao = colaboradorPayload.data_admissao ? new Date(colaboradorPayload.data_admissao + "T12:00:00") : new Date();
            let gestorUserId: string | null = null;
            if ((convite as any).lider_direto_id) {
              const { data: gp } = await supabase.from("profiles").select("user_id").eq("id", (convite as any).lider_direto_id).single();
              gestorUserId = (gp as any)?.user_id || null;
            }
            const tarefas = (await getTarefasDinamicas("clt", dc, supabase)).map((t) => {
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
                colaborador_nome: convite.nome || null,
                titulo: t.titulo,
                descricao: t.descricao || null,
                responsavel_role: t.responsavel_role,
                responsavel_user_id: t.responsavel_role === "gestor_direto" && gestorUserId ? gestorUserId : null,
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
                  mensagem: `Você tem tarefas pendentes no onboarding de ${convite.nome}. Acesse o módulo de Onboarding para verificar.`,
                  link: "/onboarding",
                  user_id: userId,
                });
              }
            }

            // Gerar tarefas de extensões (cargo, departamento, sistemas)
            try {
              await gerarTarefasExtensoes({
                checklistId: newChecklist.id,
                colaboradorId: inserted.id,
                colaboradorTipo: "clt",
                colaboradorNome: convite.nome || colaboradorPayload.nome_completo,
                cargoId: dc.cargo_id || null,
                cargoNome: convite.cargo || colaboradorPayload.cargo,
                departamentoLabel: convite.departamento || colaboradorPayload.departamento,
                sistemasIds: Array.isArray(dc.sistemas_ids) ? dc.sistemas_ids : [],
                dataReferencia: dataAdmissao,
                gestorUserId,
                userId: user?.id || null,
              });
            } catch (extErr) {
              console.error("Erro ao gerar tarefas de extensões:", extErr);
            }
          }
        } catch (onbErr) {
          console.error("Erro ao criar onboarding:", onbErr);
        }

        // Criar usuário de acesso se solicitado
        const teraAcesso = dc.tera_acesso_sistema !== false; // default true
        let acessoMsg = "";
        if (teraAcesso && convite.email) {
          try {
            const emailDest = colaboradorPayload.email_pessoal || convite.email;
            const { data: userData, error: userErr } = await supabase.functions.invoke("manage-user", {
              body: {
                action: "create_user_from_colaborador",
                colaborador_id: inserted.id,
                tipo: "clt",
                departamento_id: convite.departamento_id || null,
                unidade_id: convite.unidade_id,
              },
            });
            if (userErr || (userData as any)?.error) {
              throw new Error(userErr?.message || (userData as any)?.error);
            }
            if ((userData as any)?.aviso_template) {
              acessoMsg = ` Acesso criado, mas template parcial: ${(userData as any).aviso_template}`;
            } else {
              acessoMsg = ` Acesso ao portal criado (template aplicado). E-mail enviado para ${emailDest}.`;
            }
          } catch (userCreateErr: any) {
            console.error("Erro ao criar usuário:", userCreateErr);
            toast.warning(
              "Colaborador criado, mas houve erro ao criar usuário de acesso. Crie manualmente na tela do colaborador."
            );
          }
        } else if (!teraAcesso) {
          // Notificar admin_rh que colaborador foi criado sem acesso
          try {
            await supabase.from("notificacoes_rh").insert({
              tipo: "colaborador_sem_acesso",
              titulo: "Colaborador criado sem acesso ao sistema",
              mensagem: `${colaboradorPayload.nome_completo} foi criado como CLT mas não tem usuário de acesso. Clique para revisar.`,
              link: `/colaboradores/${inserted.id}`,
              user_id: null,
            });
          } catch (notifErr) {
            console.error("Erro ao criar notificação:", notifErr);
          }
        }

        toast.success("Colaborador CLT criado com sucesso!" + acessoMsg);
        navigate(`/colaboradores/${inserted.id}`);

      } else {
        // ── CRIAR CONTRATO PJ ──
        const contratoPayload: Record<string, any> = {
          contato_nome: rest.contato_nome || convite.nome,
          contato_email: rest.contato_email || convite.email || null,
          contato_telefone: rest.contato_telefone || null,
          cnpj: rest.cnpj,
          razao_social: rest.razao_social,
          nome_fantasia: rest.nome_fantasia || null,
          inscricao_municipal: rest.inscricao_municipal || null,
          inscricao_estadual: rest.inscricao_estadual || null,
          cpf: rest.cpf || null,
          rg: rest.rg || null,
          orgao_emissor: rest.orgao_emissor || null,
          data_nascimento: rest.data_nascimento || null,
          genero: rest.genero || null,
          estado_civil: rest.estado_civil || null,
          nacionalidade: rest.nacionalidade || "Brasileira",
          etnia: rest.etnia || null,
          nome_mae: rest.nome_mae || null,
          nome_pai: rest.nome_pai || null,
          telefone: rest.telefone || null,
          email_pessoal: rest.email_pessoal || null,
          contato_emergencia_nome: rest.contato_emergencia_nome || null,
          contato_emergencia_telefone: rest.contato_emergencia_telefone || null,
          cep: rest.cep || null,
          logradouro: rest.logradouro || null,
          numero: rest.numero || null,
          complemento: rest.complemento || null,
          bairro: rest.bairro || null,
          cidade: rest.cidade || null,
          uf: rest.uf || null,
          banco_nome: rest.banco_nome || null,
          banco_codigo: rest.banco_codigo || null,
          agencia: rest.agencia || null,
          conta: rest.conta || null,
          tipo_conta: rest.tipo_conta || "corrente",
          chave_pix: rest.chave_pix || null,
          tipo_servico: convite.cargo || rest.tipo_servico || null,
          cargo_id: convite.cargo_id,
          departamento: convite.departamento || rest.departamento || null,
          departamento_id: convite.departamento_id,
          unidade_id: convite.unidade_id,
          valor_mensal: Number((convite as any).salario_previsto || rest.valor_mensal || 0),
          data_inicio: (convite as any).data_inicio_prevista || rest.data_inicio || new Date().toISOString().split("T")[0],
          forma_pagamento: rest.forma_pagamento || "transferencia",
          dia_vencimento: rest.dia_vencimento || 10,
          status: "ativo",
          gestor_direto_id: (convite as any).lider_direto_id || null,
          foto_url: rest.foto_url || null,
          created_by: user?.id || null,
        };

        const cleaned = Object.fromEntries(
          Object.entries(contratoPayload).map(([k, v]) => [k, v === "" ? null : v])
        );

        const { data: inserted, error } = await supabase
          .from("contratos_pj")
          .insert(cleaned as any)
          .select("id")
          .single();

        if (error) throw error;

        await supabase
          .from("convites_cadastro")
          .update({ contrato_pj_id: inserted.id, status: "cadastrado" })
          .eq("id", convite.id);

        try {
          const { data: newChecklist } = await supabase
            .from("onboarding_checklists")
            .insert({
              colaborador_id: inserted.id,
              colaborador_tipo: "pj",
              convite_id: convite.id,
              coordenador_user_id: user?.id || null,
              coordenador_nome: profile?.full_name || null,
            } as any)
            .select("id")
            .single();

          if (newChecklist) {
            const dataInicio = contratoPayload.data_inicio ? new Date(contratoPayload.data_inicio + "T12:00:00") : new Date();
            let gestorUserId: string | null = null;
            if ((convite as any).lider_direto_id) {
              const { data: gp } = await supabase.from("profiles").select("user_id").eq("id", (convite as any).lider_direto_id).single();
              gestorUserId = (gp as any)?.user_id || null;
            }
            const tarefas = (await getTarefasDinamicas("pj", dc, supabase)).map((t) => {
              const prazoDate = new Date(dataInicio);
              prazoDate.setDate(prazoDate.getDate() + t.prazo_dias);
              return {
                tipo_processo: "onboarding",
                sistema_origem: t.sistema_origem || "people",
                area_destino: t.area_destino || null,
                prioridade: t.prioridade || "normal",
                processo_id: newChecklist.id,
                colaborador_id: inserted.id,
                colaborador_tipo: "pj",
                colaborador_nome: convite.nome || null,
                titulo: t.titulo,
                descricao: t.descricao || null,
                responsavel_role: t.responsavel_role,
                responsavel_user_id: t.responsavel_role === "gestor_direto" && gestorUserId ? gestorUserId : null,
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
                  mensagem: `Você tem tarefas pendentes no onboarding de ${convite.nome}. Acesse o módulo de Onboarding para verificar.`,
                  link: "/onboarding",
                  user_id: userId,
                });
              }
            }

            // Gerar tarefas de extensões (cargo, departamento, sistemas)
            try {
              await gerarTarefasExtensoes({
                checklistId: newChecklist.id,
                colaboradorId: inserted.id,
                colaboradorTipo: "pj",
                colaboradorNome: convite.nome || contratoPayload.contato_nome,
                cargoId: dc.cargo_id || null,
                cargoNome: convite.cargo || contratoPayload.tipo_servico,
                departamentoLabel: convite.departamento || contratoPayload.departamento,
                sistemasIds: Array.isArray(dc.sistemas_ids) ? dc.sistemas_ids : [],
                dataReferencia: dataInicio,
                gestorUserId,
                userId: user?.id || null,
              });
            } catch (extErr) {
              console.error("Erro ao gerar tarefas de extensões:", extErr);
            }
          }
        } catch (onbErr) {
          console.error("Erro ao criar onboarding:", onbErr);
        }

        // Criar usuário de acesso se solicitado
        const teraAcessoPj = dc.tera_acesso_sistema !== false; // default true
        let acessoMsgPj = "";
        if (teraAcessoPj && convite.email) {
          try {
            const emailDestPj = contratoPayload.contato_email || contratoPayload.email_pessoal || convite.email;
            const { data: userData, error: userErr } = await supabase.functions.invoke("manage-user", {
              body: {
                action: "create_user_from_colaborador",
                colaborador_id: inserted.id,
                tipo: "pj",
                departamento_id: convite.departamento_id || null,
                unidade_id: convite.unidade_id,
              },
            });
            if (userErr || (userData as any)?.error) {
              throw new Error(userErr?.message || (userData as any)?.error);
            }
            if ((userData as any)?.aviso_template) {
              acessoMsgPj = ` Acesso criado, mas template parcial: ${(userData as any).aviso_template}`;
            } else {
              acessoMsgPj = ` Acesso ao portal criado (template aplicado). E-mail enviado para ${emailDestPj}.`;
            }
          } catch (userCreateErr: any) {
            console.error("Erro ao criar usuário:", userCreateErr);
            toast.warning(
              "Contrato PJ criado, mas houve erro ao criar usuário de acesso. Crie manualmente na tela do contrato."
            );
          }
        } else if (!teraAcessoPj) {
          try {
            await supabase.from("notificacoes_rh").insert({
              tipo: "colaborador_sem_acesso",
              titulo: "Prestador PJ criado sem acesso ao sistema",
              mensagem: `${contratoPayload.contato_nome} foi criado como PJ mas não tem usuário de acesso. Clique para revisar.`,
              link: `/contratos-pj/${inserted.id}`,
              user_id: null,
            });
          } catch (notifErr) {
            console.error("Erro ao criar notificação:", notifErr);
          }
        }

        toast.success("Contrato PJ criado com sucesso!" + acessoMsgPj);
        navigate(`/contratos-pj/${inserted.id}`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao criar: " + (err.message || "Erro desconhecido"));
    } finally {
      setCriando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!convite) return null;

  const isClt = convite.tipo === "clt";
  const hasDados = Object.keys(formData).length > 0;
  const expired = convite.status === "pendente" && new Date(convite.expira_em) <= new Date();
  const displayStatus = expired ? "expirado" : convite.status;
  const isCadastrado = convite.status === "cadastrado";
  const isAprovado = convite.status === "aprovado";
  const alreadyLinked = !!convite.colaborador_id || !!convite.contrato_pj_id;
  const canExport = hasDados && !alreadyLinked && (isAprovado || isCadastrado);
  const canEdit = !isCadastrado && !isAprovado;

  const statusLabels: Record<string, string> = {
    pendente: "Pendente",
    email_enviado: "Email Enviado",
    preenchido: "Preenchido",
    aprovado: "Aprovado — Aguardando Cadastro",
    cadastrado: "Cadastrado com Sucesso",
    expirado: "Expirado",
    cancelado: "Cancelado",
  };

  return (
    <div className="space-y-6">
      <SystemReadinessBanner />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <SmartBackButton fallback="/convites-cadastro" fallbackLabel="Convites" />
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-medium">{convite.nome}</h1>
              <Badge variant="outline" className={statusStyles[displayStatus] || ""}>
                {statusLabels[displayStatus] || displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
              </Badge>
              <Badge variant="outline" className="text-xs">{convite.tipo.toUpperCase()}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {convite.email} • {convite.cargo && `${convite.cargo} • `}{convite.departamento || ""}
              {convite.preenchido_em && ` • Preenchido em ${format(parseISO(convite.preenchido_em), "dd/MM/yyyy HH:mm")}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => { setEditing(false); setFormData(convite.dados_preenchidos || {}); }}>
                <X className="h-4 w-4 mr-2" /> Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar
              </Button>
            </>
          ) : (
            <>
              {hasDados && !isCadastrado && (
                <Button variant="outline" size="sm" onClick={handleResendEmail} disabled={sendingEmail}>
                  {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                  Reenviar Email
                </Button>
              )}
              {canEdit && hasDados && (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Edit className="h-4 w-4 mr-2" /> Editar Dados
                </Button>
              )}
              {canExport && convite.status !== "aprovado" && (
                <Button onClick={handleCriarColaborador} disabled={criando}>
                  {criando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                  {isClt ? "Criar Colaborador CLT" : "Criar Contrato PJ"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {isAprovado && !alreadyLinked && hasDados && (
        <div
          className="rounded-xl border-2 p-5 flex items-center justify-between gap-4"
          style={{ borderColor: "#1A4A3A", backgroundColor: "#F0F7F4" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "#1A4A3A" }}
            >
              <CheckCircle2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-medium" style={{ color: "#1A4A3A" }}>
                Cadastro aprovado — pronto para criar o {isClt ? "colaborador" : "contrato"}
              </p>
              <p className="text-sm text-muted-foreground">
                Revise os dados abaixo e clique no botão para finalizar a admissão.
              </p>
            </div>
          </div>
          <Button
            size="lg"
            className="gap-2 whitespace-nowrap text-white hover:opacity-90"
            style={{ backgroundColor: "#1A4A3A" }}
            onClick={handleCriarColaborador}
            disabled={criando}
          >
            {criando ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
            {criando ? "Criando..." : isClt ? "Criar Colaborador CLT" : "Criar Contrato PJ"}
          </Button>
        </div>
      )}

      {/* Content */}
      {!hasDados ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Este convite ainda não foi preenchido pelo colaborador.</p>
          </CardContent>
        </Card>
      ) : isClt ? (
        <Tabs defaultValue="pessoais">
          <TabsList className="flex-wrap">
            <TabsTrigger value="pessoais" className="gap-2"><User className="h-4 w-4" /> Dados Pessoais</TabsTrigger>
            <TabsTrigger value="documentos" className="gap-2"><FileText className="h-4 w-4" /> Documentos</TabsTrigger>
            <TabsTrigger value="profissionais" className="gap-2"><Briefcase className="h-4 w-4" /> Profissionais</TabsTrigger>
            <TabsTrigger value="empresa" className="gap-2"><Building className="h-4 w-4" /> Empresa</TabsTrigger>
            <TabsTrigger value="bancarios" className="gap-2"><CreditCard className="h-4 w-4" /> Dados Bancários</TabsTrigger>
            <TabsTrigger value="dependentes" className="gap-2"><Users className="h-4 w-4" /> Dependentes</TabsTrigger>
            <TabsTrigger value="anexos" className="gap-2"><Paperclip className="h-4 w-4" /> Anexos</TabsTrigger>
          </TabsList>
          <TabsContent value="pessoais">
            <ConviteDadosPessoaisCLT dados={formData} editing={editing} updateField={updateField} />
          </TabsContent>
          <TabsContent value="documentos">
            <ConviteDocumentosCLT dados={formData} editing={editing} updateField={updateField} />
          </TabsContent>
          <TabsContent value="profissionais">
            <ConviteDadosProfissionaisCLT dados={{
              ...formData,
              cargo: formData.cargo || convite.cargo || "",
              departamento: formData.departamento || convite.departamento || "",
              salario_base: formData.salario_base || (convite as any).salario_previsto || "",
              data_admissao: formData.data_admissao || (convite as any).data_inicio_prevista || "",
              tipo_contrato: formData.tipo_contrato || (convite as any).dados_contratacao?.tipo_contrato_clt || "indeterminado",
              jornada_semanal: formData.jornada_semanal || (convite as any).dados_contratacao?.jornada_semanal || "44",
              horario_trabalho: formData.horario_trabalho || (convite as any).dados_contratacao?.horario_trabalho || "",
              local_trabalho: formData.local_trabalho || (convite as any).dados_contratacao?.local_trabalho || "",
            }} editing={editing} updateField={updateField} />
          </TabsContent>
          <TabsContent value="empresa">
            <ConviteDadosEmpresaCLT dados={{ ...formData, _convite_dados_contratacao: (convite as any).dados_contratacao }} editing={editing} updateField={updateField} />
          </TabsContent>
          <TabsContent value="bancarios">
            <ConviteDadosBancarios dados={formData} editing={editing} updateField={updateField} />
          </TabsContent>
          <TabsContent value="dependentes">
            <ConviteDependentes dados={formData} editing={editing} updateField={updateField} />
          </TabsContent>
          <TabsContent value="anexos">
            <ConviteAnexos documentos={formData.documentos_upload} />
          </TabsContent>
        </Tabs>
      ) : (
        <Tabs defaultValue="pessoais">
          <TabsList className="flex-wrap">
            <TabsTrigger value="pessoais" className="gap-2"><User className="h-4 w-4" /> Dados Pessoais</TabsTrigger>
            <TabsTrigger value="empresa" className="gap-2"><Building2 className="h-4 w-4" /> Dados da Empresa</TabsTrigger>
            <TabsTrigger value="profissionais" className="gap-2"><Briefcase className="h-4 w-4" /> Dados do Contrato</TabsTrigger>
            <TabsTrigger value="bancarios" className="gap-2"><CreditCard className="h-4 w-4" /> Dados Bancários</TabsTrigger>
            <TabsTrigger value="anexos" className="gap-2"><Paperclip className="h-4 w-4" /> Anexos</TabsTrigger>
          </TabsList>
          <TabsContent value="pessoais">
            <ConviteDadosPessoaisPJ dados={formData} editing={editing} updateField={updateField} />
          </TabsContent>
          <TabsContent value="empresa">
            <ConviteDadosEmpresaPJ dados={formData} editing={editing} updateField={updateField} />
          </TabsContent>
          <TabsContent value="profissionais">
            <ConviteDadosProfissionaisPJ dados={{
              ...formData,
              tipo_servico: formData.tipo_servico || convite.cargo || "",
              departamento: formData.departamento || convite.departamento || "",
              valor_mensal: formData.valor_mensal || (convite as any).salario_previsto || "",
              data_inicio: formData.data_inicio || (convite as any).data_inicio_prevista || "",
            }} editing={editing} updateField={updateField} />
          </TabsContent>
          <TabsContent value="bancarios">
            <ConviteDadosBancarios dados={formData} editing={editing} updateField={updateField} />
          </TabsContent>
          <TabsContent value="anexos">
            <ConviteAnexos documentos={formData.documentos_upload} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
