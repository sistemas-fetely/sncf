import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmacaoDupla } from "@/components/ConfirmacaoDupla";
import { Download, Trash2, Eye, FileEdit, MessageSquare, DollarSign, ShieldCheck, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type ConsentTipo = {
  tipo: string;
  label: string;
  descricao: string;
};

const TIPOS_CONSENTIMENTO: ConsentTipo[] = [
  { tipo: "fala_fetely_conversas", label: "Conversas com a IA", descricao: "Permitir que a Fala Fetely armazene seu histórico de conversas para dar continuidade." },
  { tipo: "fala_fetely_memorias", label: "Memórias automáticas", descricao: "Permitir que a IA extraia e guarde memórias suas para personalizar respostas." },
  { tipo: "analytics_comportamental", label: "Analytics comportamental", descricao: "Permitir uso anonimizado dos seus dados de navegação para melhorar o produto." },
  { tipo: "notificacoes_email", label: "Notificações por e-mail", descricao: "Receber e-mails de avisos, lembretes e novidades do sistema." },
];

export default function MeusDados() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [aba, setAba] = useState("cadastrais");
  const [mostrarConfirmExclusao, setMostrarConfirmExclusao] = useState(false);
  const [mostrarResultado, setMostrarResultado] = useState(false);
  const [resultadoExclusao, setResultadoExclusao] = useState<any>(null);
  const [baixando, setBaixando] = useState(false);

  // Aba 1: dados cadastrais
  const { data: colabClt } = useQuery({
    queryKey: ["meus-dados", "clt", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("colaboradores_clt").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: contratoPj } = useQuery({
    queryKey: ["meus-dados", "pj", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("contratos_pj").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Aba 2: conversas
  const { data: conversas = [] } = useQuery({
    queryKey: ["meus-dados", "conversas", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("fala_fetely_conversas")
        .select("id, titulo, created_at, arquivada")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: memorias = [] } = useQuery({
    queryKey: ["meus-dados", "memorias", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("fala_fetely_memoria")
        .select("id, resumo, tipo, ativo, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: !!user,
  });

  // Aba 3: remuneração
  const { data: remuneracoes = [] } = useQuery({
    queryKey: ["meus-dados", "remuneracoes", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("remuneracoes")
        .select("*")
        .eq("user_id", user.id)
        .order("data_vigencia_inicio", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  // Aba 4: quem acessou
  const { data: acessos = [] } = useQuery({
    queryKey: ["meus-dados", "acessos", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("acesso_dados_log")
        .select("*")
        .eq("alvo_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
    enabled: !!user,
  });

  // Aba 5: consentimentos
  const { data: consentimentos = [] } = useQuery({
    queryKey: ["meus-dados", "consentimentos", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("consentimentos_lgpd")
        .select("*")
        .eq("user_id", user.id)
        .order("criado_em", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  function consentimentoAtivo(tipo: string) {
    return consentimentos.find((c: any) => c.tipo === tipo && c.aceito && !c.revogado_em);
  }

  async function revogarConsentimento(tipo: string) {
    if (!user) return;
    const { error } = await supabase
      .from("consentimentos_lgpd")
      .update({ revogado_em: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("tipo", tipo)
      .is("revogado_em", null);
    if (error) {
      toast.error("Erro ao revogar consentimento", { description: error.message });
      return;
    }
    toast.success("Consentimento revogado");
    qc.invalidateQueries({ queryKey: ["meus-dados", "consentimentos"] });
  }

  async function aceitarConsentimento(tipo: string) {
    if (!user) return;
    const { error } = await supabase.from("consentimentos_lgpd").insert({
      user_id: user.id,
      tipo,
      aceito: true,
      texto_versao: "v1",
    });
    if (error) {
      toast.error("Erro ao registrar consentimento", { description: error.message });
      return;
    }
    toast.success("Consentimento registrado 💚");
    qc.invalidateQueries({ queryKey: ["meus-dados", "consentimentos"] });
  }

  async function apagarConversa(id: string) {
    const { error } = await supabase.from("fala_fetely_conversas").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível apagar", { description: error.message });
      return;
    }
    toast.success("Conversa apagada");
    qc.invalidateQueries({ queryKey: ["meus-dados", "conversas"] });
  }

  async function baixarMeusDados() {
    if (!user) return;
    setBaixando(true);
    try {
      const userId = user.id;

      const safe = async <T,>(builder: any): Promise<T | null> => {
        try {
          const r = await builder;
          return (r?.data ?? null) as T | null;
        } catch {
          return null;
        }
      };

      const [
        prof, clt, pj, remun, conv, mens, mem, cons,
      ] = await Promise.all([
        safe(supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle()),
        safe(supabase.from("colaboradores_clt").select("*").eq("user_id", userId).maybeSingle()),
        safe(supabase.from("contratos_pj").select("*").eq("user_id", userId).maybeSingle()),
        safe(supabase.from("remuneracoes").select("*").eq("user_id", userId)),
        safe(supabase.from("fala_fetely_conversas").select("*").eq("user_id", userId)),
        safe(supabase.from("fala_fetely_mensagens").select("*, fala_fetely_conversas!inner(user_id)").eq("fala_fetely_conversas.user_id", userId)),
        safe(supabase.from("fala_fetely_memoria").select("*").eq("user_id", userId)),
        safe(supabase.from("consentimentos_lgpd").select("*").eq("user_id", userId)),
      ]);

      const dados = {
        exportado_em: new Date().toISOString(),
        titular: prof,
        colaborador_clt: clt,
        contrato_pj: pj,
        remuneracoes: remun,
        conversas_ia: conv,
        mensagens_ia: mens,
        memorias_ia: mem,
        consentimentos: cons,
      };

      const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meus-dados-fetely-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Seus dados foram baixados! 💚");
    } finally {
      setBaixando(false);
    }
  }

  async function solicitarExclusao() {
    if (!user) return;
    const { data, error } = await supabase.rpc("processar_exclusao_dados_usuario", { _user_id: user.id });
    if (error) {
      toast.error("Erro ao processar", { description: error.message });
      return;
    }
    setResultadoExclusao(data);
    setMostrarConfirmExclusao(false);
    setMostrarResultado(true);
    qc.invalidateQueries({ queryKey: ["meus-dados"] });
  }

  if (!user) return null;

  const dadosCadastrais = colabClt || contratoPj;
  const tipoVinculo = colabClt ? "CLT" : contratoPj ? "PJ" : null;

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-8 w-8 text-primary" />
          Meus Dados
        </h1>
        <p className="text-muted-foreground mt-1">
          Tudo que a Fetely sabe sobre você, com seus direitos de LGPD garantidos. 🌸
        </p>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="grid grid-cols-2 md:grid-cols-6 h-auto">
          <TabsTrigger value="cadastrais" className="gap-1.5"><FileEdit className="h-3.5 w-3.5" /> Cadastrais</TabsTrigger>
          <TabsTrigger value="conversas" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Conversas</TabsTrigger>
          <TabsTrigger value="remuneracao" className="gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Remuneração</TabsTrigger>
          <TabsTrigger value="acessos" className="gap-1.5"><Eye className="h-3.5 w-3.5" /> Acessos</TabsTrigger>
          <TabsTrigger value="consentimentos" className="gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Consentimentos</TabsTrigger>
          <TabsTrigger value="lgpd" className="gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Ações LGPD</TabsTrigger>
        </TabsList>

        {/* ABA 1: CADASTRAIS */}
        <TabsContent value="cadastrais" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Identificação</CardTitle>
              <CardDescription>Dados do seu perfil de acesso.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <Field label="Nome" value={profile?.full_name} />
              <Field label="E-mail" value={user.email} />
              <Field label="Departamento" value={profile?.department} />
              <Field label="Cargo no perfil" value={profile?.position} />
              {tipoVinculo && (
                <Field label="Tipo de vínculo" value={tipoVinculo} />
              )}
            </CardContent>
          </Card>

          {dadosCadastrais && (
            <Card>
              <CardHeader>
                <CardTitle>Vínculo {tipoVinculo}</CardTitle>
                <CardDescription>
                  Para alterar dados sensíveis (CPF/CNPJ, dados bancários, endereço), procure o RH.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                {colabClt && (
                  <>
                    <Field label="CPF" value={colabClt.cpf} />
                    <Field label="Cargo" value={colabClt.cargo} />
                    <Field label="Departamento" value={colabClt.departamento} />
                    <Field label="Data de admissão" value={fmtData(colabClt.data_admissao)} />
                    <Field label="Telefone" value={colabClt.telefone} />
                    <Field label="E-mail pessoal" value={colabClt.email_pessoal} />
                    <Field label="Cidade / UF" value={[colabClt.cidade, colabClt.uf].filter(Boolean).join(" / ") || null} />
                    <Field label="Status" value={colabClt.status} />
                  </>
                )}
                {contratoPj && (
                  <>
                    <Field label="CNPJ" value={contratoPj.cnpj} />
                    <Field label="Razão social" value={contratoPj.razao_social} />
                    <Field label="Tipo de serviço" value={contratoPj.tipo_servico} />
                    <Field label="Departamento" value={contratoPj.departamento} />
                    <Field label="Data de início" value={fmtData(contratoPj.data_inicio)} />
                    <Field label="Telefone" value={contratoPj.telefone} />
                    <Field label="E-mail pessoal" value={contratoPj.email_pessoal} />
                    <Field label="Status" value={contratoPj.status} />
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ABA 2: CONVERSAS */}
        <TabsContent value="conversas" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Conversas com a Fala Fetely</CardTitle>
                <CardDescription>{conversas.length} conversas armazenadas.</CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/fala-fetely">Abrir Fala Fetely <ExternalLink className="ml-1 h-3 w-3" /></Link>
              </Button>
            </CardHeader>
            <CardContent>
              {conversas.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Você ainda não tem conversas salvas.
                </p>
              ) : (
                <div className="space-y-2">
                  {conversas.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between rounded-md border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.titulo || "Conversa sem título"}</p>
                        <p className="text-xs text-muted-foreground">{fmtData(c.created_at)}{c.arquivada ? " · arquivada" : ""}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => apagarConversa(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Minhas memórias</CardTitle>
                <CardDescription>Coisas que a IA aprendeu sobre você ({memorias.length}).</CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/fala-fetely/memorias">Gerenciar memórias <ExternalLink className="ml-1 h-3 w-3" /></Link>
              </Button>
            </CardHeader>
            <CardContent>
              {memorias.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhuma memória armazenada ainda.
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-auto">
                  {memorias.map((m: any) => (
                    <div key={m.id} className="rounded-md border p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px]">{m.tipo}</Badge>
                        {!m.ativo && <Badge variant="secondary" className="text-[10px]">inativa</Badge>}
                      </div>
                      <p className="text-sm">{m.resumo}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 3: REMUNERAÇÃO */}
        <TabsContent value="remuneracao" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de remuneração</CardTitle>
              <CardDescription>Apenas leitura — alterações são feitas pelo RH.</CardDescription>
            </CardHeader>
            <CardContent>
              {remuneracoes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhum registro de remuneração encontrado.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Natureza</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Periodicidade</TableHead>
                      <TableHead>Vigência</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {remuneracoes.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.natureza}</TableCell>
                        <TableCell>{fmtMoeda(r.valor, r.moeda)}</TableCell>
                        <TableCell>{r.periodicidade}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {fmtData(r.data_vigencia_inicio)} → {r.data_vigencia_fim ? fmtData(r.data_vigencia_fim) : "atual"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 4: QUEM ACESSOU */}
        <TabsContent value="acessos" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Quem acessou meus dados</CardTitle>
              <CardDescription>Últimos 100 acessos a dados pessoais seus por outras pessoas.</CardDescription>
            </CardHeader>
            <CardContent>
              {acessos.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  🌸 Ninguém acessou seus dados pessoais recentemente. Fique tranquilo(a) — quando alguém consultar, aparece aqui.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Quem</TableHead>
                      <TableHead>Que dado</TableHead>
                      <TableHead>Contexto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acessos.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm whitespace-nowrap">{fmtDataHora(a.created_at)}</TableCell>
                        <TableCell className="text-sm">{a.user_nome || "—"}</TableCell>
                        <TableCell className="text-sm">{a.tipo_dado}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.contexto || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 5: CONSENTIMENTOS */}
        <TabsContent value="consentimentos" className="mt-4 space-y-3">
          {TIPOS_CONSENTIMENTO.map((t) => {
            const ativo = consentimentoAtivo(t.tipo);
            const ultimo = consentimentos.find((c: any) => c.tipo === t.tipo);
            return (
              <Card key={t.tipo}>
                <CardContent className="pt-6 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{t.label}</h3>
                      {ativo ? (
                        <Badge variant="default" className="text-[10px]">Aceito</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Não aceito</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{t.descricao}</p>
                    {ultimo && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Última alteração: {fmtDataHora(ultimo.revogado_em || ultimo.criado_em)}
                      </p>
                    )}
                  </div>
                  {ativo ? (
                    <Button variant="outline" size="sm" onClick={() => revogarConsentimento(t.tipo)}>
                      Revogar
                    </Button>
                  ) : (
                    <Button variant="default" size="sm" onClick={() => aceitarConsentimento(t.tipo)}>
                      Aceitar
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ABA 6: LGPD */}
        <TabsContent value="lgpd" className="mt-4 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                📦 Baixar Meus Dados
              </CardTitle>
              <CardDescription>
                Exporte tudo em JSON. É seu direito (LGPD Art. 18 V — portabilidade).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={baixarMeusDados} disabled={baixando} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                {baixando ? "Preparando..." : "Baixar JSON"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                🗑️ Solicitar Exclusão
              </CardTitle>
              <CardDescription>
                Apaga dados comportamentais. Dados com retenção legal são mantidos conforme a lei.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={() => setMostrarConfirmExclusao(true)} className="w-full">
                <Trash2 className="mr-2 h-4 w-4" />
                Solicitar exclusão
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                ✏️ Revogar Consentimentos
              </CardTitle>
              <CardDescription>Mude sua decisão sobre como seus dados são usados.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => setAba("consentimentos")} className="w-full">
                Ver consentimentos
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirmação dupla de exclusão (Regra 18) */}
      <ConfirmacaoDupla
        open={mostrarConfirmExclusao}
        onOpenChange={setMostrarConfirmExclusao}
        titulo="🌸 Entendemos que você quer apagar seus dados"
        descricao={
          <>
            <p><strong>Algumas coisas a gente apaga agora mesmo:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Suas conversas com o Fala Fetely</li>
              <li>Suas memórias salvas pela IA</li>
              <li>Suas preferências pessoais</li>
            </ul>
            <p><strong>Algumas coisas a lei nos pede pra guardar</strong> (ficam seguras e privadas):</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Seus holerites e folhas de pagamento (10 anos — obrigação trabalhista)</li>
              <li>Seus contratos (10 anos)</li>
              <li>Notas fiscais e pagamentos (5 anos — obrigação fiscal)</li>
            </ul>
            <p>Depois de confirmar, você vai receber um resumo de tudo que foi apagado e do que foi mantido por obrigação legal.</p>
          </>
        }
        textoConfirmacao="APAGAR MEUS DADOS"
        placeholder="APAGAR MEUS DADOS"
        acaoLabel="Sim, quero continuar"
        onConfirmar={solicitarExclusao}
      />


      {/* Dialog de resultado */}
      <Dialog open={mostrarResultado} onOpenChange={setMostrarResultado}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Resumo da exclusão</DialogTitle>
            <DialogDescription>
              Veja o que foi apagado, anonimizado e mantido por obrigação legal.
            </DialogDescription>
          </DialogHeader>
          {resultadoExclusao && (
            <div className="space-y-4">
              <ResultadoSecao titulo="✅ Apagados" itens={resultadoExclusao.apagados} />
              <ResultadoSecao titulo="🔄 Anonimizados" itens={resultadoExclusao.anonimizados} />
              <ResultadoSecao
                titulo="🔐 Mantidos por obrigação legal"
                itens={resultadoExclusao.mantidos_retencao_legal}
                comMotivo
              />
              <p className="text-xs text-muted-foreground">
                Processado em: {fmtDataHora(resultadoExclusao.processado_em)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setMostrarResultado(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || <span className="text-muted-foreground italic">—</span>}</p>
    </div>
  );
}

function ResultadoSecao({ titulo, itens, comMotivo }: { titulo: string; itens: any[]; comMotivo?: boolean }) {
  if (!itens || itens.length === 0) {
    return (
      <div>
        <h4 className="font-medium text-sm mb-1">{titulo}</h4>
        <p className="text-xs text-muted-foreground">Nada nessa categoria.</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="font-medium text-sm mb-2">{titulo}</h4>
      <ul className="space-y-1.5">
        {itens.map((it: any, i: number) => (
          <li key={i} className="text-sm rounded-md border p-2">
            <span className="font-mono text-xs">{it.tabela}</span> — {it.registros} registro(s)
            {comMotivo && it.motivo && (
              <p className="text-xs text-muted-foreground mt-1">{it.motivo} · retenção: {it.retencao_anos} ano(s)</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function fmtData(d?: string | null) {
  if (!d) return null;
  try {
    return format(new Date(d), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return d;
  }
}

function fmtDataHora(d?: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return d;
  }
}

function fmtMoeda(v: number, moeda?: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(Number(v) || 0);
}
