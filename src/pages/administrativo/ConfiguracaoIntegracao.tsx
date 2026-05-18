import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Eye, EyeOff, Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle, Settings2, ExternalLink, Mail, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PUBLIC_APP_URL } from "@/lib/urls";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

const CALLBACK_URL = `${PUBLIC_APP_URL}/administrativo/bling-callback`;

type EntidadeBling = "contatos" | "produtos" | "contas_receber" | "pedidos" | "nfe";

const ENTIDADES: Array<{ id: EntidadeBling; label: string }> = [
  { id: "contatos", label: "Contatos / Clientes" },
  { id: "produtos", label: "Produtos" },
  { id: "contas_receber", label: "Contas a Receber" },
  { id: "pedidos", label: "Pedidos de Venda" },
  { id: "nfe", label: "Notas Fiscais (NFe)" },
];

export default function ConfiguracaoIntegracao() {
  const qc = useQueryClient();
  const [showSecret, setShowSecret] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [showRefresh, setShowRefresh] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [manualCode, setManualCode] = useState("");
  const [processingCode, setProcessingCode] = useState(false);
  const [fixExecutado, setFixExecutado] = useState(false);
  const [logsLimit, setLogsLimit] = useState(5);

  // Financeiro externo
  const [showDialogFin, setShowDialogFin] = useState(false);
  const [editingFin, setEditingFin] = useState<any>(null);
  const [removingFin, setRemovingFin] = useState<any>(null);
  const [finForm, setFinForm] = useState<{
    nome: string;
    email: string;
    observacao: string;
    propositos: string[];
    papel: "principal" | "copia";
  }>({
    nome: "",
    email: "",
    observacao: "",
    propositos: ["pagamento", "fiscal"],
    papel: "principal",
  });
  const [savingFin, setSavingFin] = useState(false);

  const [form, setForm] = useState({
    client_id: "",
    client_secret: "",
    access_token: "",
    refresh_token: "",
    ativo: false,
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ["integracao-bling"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integracoes_config")
        .select("*")
        .eq("sistema", "bling")
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setForm({
          client_id: data.client_id || "",
          client_secret: data.client_secret || "",
          access_token: data.access_token || "",
          refresh_token: data.refresh_token || "",
          ativo: data.ativo || false,
        });
      }
      return data;
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["integracao-bling-logs", logsLimit],
    queryFn: async () => {
      const { data } = await supabase
        .from("integracoes_sync_log")
        .select("*")
        .eq("sistema", "bling")
        .order("created_at", { ascending: false })
        .limit(logsLimit);
      return data || [];
    },
    refetchInterval: syncing ? 2000 : false,
  });

  const { data: cursores = [] } = useQuery({
    queryKey: ["integracao-bling-cursores"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("integracoes_sync_cursor")
        .select("*")
        .eq("sistema", "bling");
      return data || [];
    },
    refetchInterval: syncing ? 2000 : 10_000,
  });

  const { data: configFinanceiro = [] } = useQuery({
    queryKey: ["config-financeiro-externo"],
    queryFn: async () => {
      const { data } = await supabase
        .from("config_financeiro_externo")
        .select("*")
        .order("nome");
      return data || [];
    },
  });

  function abrirNovoFin() {
    setEditingFin(null);
    setFinForm({
      nome: "",
      email: "",
      observacao: "",
      propositos: ["pagamento", "fiscal"],
      papel: "principal",
    });
    setShowDialogFin(true);
  }

  function abrirEditarFin(fin: any) {
    setEditingFin(fin);
    setFinForm({
      nome: fin.nome || "",
      email: fin.email || "",
      observacao: fin.observacao || "",
      propositos: Array.isArray(fin.propositos) && fin.propositos.length > 0
        ? fin.propositos
        : ["pagamento"],
      papel: fin.papel === "copia" ? "copia" : "principal",
    });
    setShowDialogFin(true);
  }

  async function salvarFinanceiro() {
    if (!finForm.nome.trim() || !finForm.email.trim()) {
      toast.error("Nome e email são obrigatórios");
      return;
    }
    if (finForm.propositos.length === 0) {
      toast.error("Selecione pelo menos um propósito (pagamento ou fiscal)");
      return;
    }
    setSavingFin(true);
    const payload = {
      nome: finForm.nome.trim(),
      email: finForm.email.trim(),
      observacao: finForm.observacao.trim() || null,
      propositos: finForm.propositos,
      papel: finForm.papel,
    };
    if (editingFin) {
      const { error } = await supabase
        .from("config_financeiro_externo")
        .update(payload as any)
        .eq("id", editingFin.id);
      setSavingFin(false);
      if (error) { toast.error("Erro: " + error.message); return; }
      toast.success("Destinatário atualizado");
    } else {
      const { error } = await supabase
        .from("config_financeiro_externo")
        .insert({ ...payload, ativo: true } as any);
      setSavingFin(false);
      if (error) { toast.error("Erro: " + error.message); return; }
      toast.success("Destinatário adicionado");
    }
    setShowDialogFin(false);
    qc.invalidateQueries({ queryKey: ["config-financeiro-externo"] });
  }

  async function removerFinanceiro() {
    if (!removingFin) return;
    const { error } = await supabase
      .from("config_financeiro_externo")
      .delete()
      .eq("id", removingFin.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Destinatário removido");
    setRemovingFin(null);
    qc.invalidateQueries({ queryKey: ["config-financeiro-externo"] });
  }

  async function salvar() {
    setSaving(true);
    const { error } = await supabase
      .from("integracoes_config")
      .update({
        client_id: form.client_id || null,
        client_secret: form.client_secret || null,
        access_token: form.access_token || null,
        refresh_token: form.refresh_token || null,
        ativo: form.ativo,
        updated_at: new Date().toISOString(),
      })
      .eq("sistema", "bling");
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Credenciais salvas");
    qc.invalidateQueries({ queryKey: ["integracao-bling"] });
  }

  async function sincronizar(entidade: EntidadeBling) {
    setSyncing(entidade);
    setSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("sync-bling-financeiro", {
        body: { tipo: "sync", entidades: [entidade] },
      });
      if (error) throw new Error(error.message);
      if (data?.sucesso === false) throw new Error(data.erro || "Erro");
      setSyncResult(data);
      toast.success(`Sync ${entidade}: ${data?.criados || 0} novos, ${data?.atualizados || 0} atualizados${data?.continuar ? " (continua)" : ""}`);
    } catch (e: any) {
      toast.error("Falha: " + (e?.message || String(e)));
    } finally {
      setSyncing(null);
      qc.invalidateQueries({ queryKey: ["integracao-bling"] });
      qc.invalidateQueries({ queryKey: ["integracao-bling-logs"] });
      qc.invalidateQueries({ queryKey: ["integracao-bling-cursores"] });
    }
  }

  async function testarConexao() {
    setSyncing("ping");
    try {
      const { data, error } = await supabase.functions.invoke("sync-bling-financeiro", {
        body: { tipo: "ping" },
      });
      if (error) throw new Error(error.message);
      if (data?.sucesso === false) throw new Error(data.erro || "Erro");
      toast.success("Conexão OK: " + (data?.mensagem || "Edge ativa"));
    } catch (e: any) {
      toast.error("Falha: " + (e?.message || String(e)));
    } finally {
      setSyncing(null);
    }
  }

  async function handleSyncFull() {
    setSyncing("full");
    setSyncResult(null);
    const startTime = Date.now();
    try {
      // Server processa as 5 entidades em ordem (contatos → produtos → contas_receber → pedidos → nfe).
      // Se algo não finalizar em 120s, voltamos a chamar com `continuar=true`.
      let continuar = true;
      let totalCriados = 0, totalAtualizados = 0, totalErros = 0;
      const detalhes: string[] = [];
      let tentativas = 0;

      while (continuar && tentativas < 6) {
        tentativas++;
        const { data, error } = await supabase.functions.invoke("sync-bling-financeiro", {
          body: { tipo: "sync" },
        });
        if (error) throw new Error(error.message);
        if (data?.sucesso === false) throw new Error(data.erro || "Erro");
        totalCriados += data?.criados || 0;
        totalAtualizados += data?.atualizados || 0;
        totalErros += data?.erros || 0;
        if (data?.detalhes) detalhes.push(data.detalhes);
        continuar = !!data?.continuar;
        qc.invalidateQueries({ queryKey: ["integracao-bling-cursores"] });
      }

      setSyncResult({
        criados: totalCriados,
        atualizados: totalAtualizados,
        erros: totalErros,
        detalhes: detalhes.join(" | "),
        duracao_ms: Date.now() - startTime,
      });
      toast.success(`Sync completo: ${totalCriados} novos, ${totalAtualizados} atualizados${totalErros ? `, ${totalErros} erros` : ""}`);
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || String(e)));
    } finally {
      setSyncing(null);
      qc.invalidateQueries({ queryKey: ["integracao-bling"] });
      qc.invalidateQueries({ queryKey: ["integracao-bling-logs"] });
      qc.invalidateQueries({ queryKey: ["integracao-bling-cursores"] });
    }
  }

  async function resetarCursor(entidade: EntidadeBling) {
    const ok = window.confirm(`Resetar cursor de "${entidade}"? Próxima sync vai começar do zero (mais lenta).`);
    if (!ok) return;
    const { error } = await supabase.functions.invoke("sync-bling-financeiro", {
      body: { tipo: "resetar_cursor", entidade },
    });
    if (error) { toast.error("Falha: " + error.message); return; }
    toast.success("Cursor resetado");
    qc.invalidateQueries({ queryKey: ["integracao-bling-cursores"] });
  }

  async function desconectarBling() {
    const ok = window.confirm("Desconectar do Bling? Tokens serão apagados (Client ID/Secret ficam).");
    if (!ok) return;
    const { error } = await supabase.functions.invoke("sync-bling-financeiro", {
      body: { tipo: "desconectar" },
    });
    if (error) { toast.error("Falha: " + error.message); return; }
    toast.success("Bling desconectado");
    qc.invalidateQueries({ queryKey: ["integracao-bling"] });
  }

  async function processarCodeManual() {
    setProcessingCode(true);
    try {
      const code = manualCode.trim();
      if (!code) throw new Error("Cole o código de autorização");

      const { data, error } = await supabase.functions.invoke("sync-bling-financeiro", {
        body: { tipo: "token_exchange", code, redirect_uri: CALLBACK_URL },
      });

      if (error) throw new Error(error.message || "Erro no servidor");
      if (data?.sucesso === false) throw new Error(data.erro || "Erro desconhecido");

      toast.success("Bling conectado com sucesso!");
      setManualCode("");
      qc.invalidateQueries({ queryKey: ["integracao-bling"] });
    } catch (e: any) {
      toast.error("Erro: " + (e?.message || String(e)));
    } finally {
      setProcessingCode(false);
    }
  }

  function autorizarBling() {
    if (!form.client_id) {
      toast.error("Cadastre o Client ID antes de autorizar");
      return;
    }
    salvar().then(() => {
      const url = new URL("https://www.bling.com.br/Api/v3/oauth/authorize");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", form.client_id);
      url.searchParams.set("redirect_uri", CALLBACK_URL);
      url.searchParams.set("state", "oauth");
      window.open(url.toString(), "_blank");
    });
  }

  async function corrigirConstraintLancamentos() {
    try {
      const { data, error } = await supabase.rpc("fix_lancamentos_origem_constraint" as any);
      if (error) {
        toast.error("Erro: " + error.message);
      } else {
        toast.success("Correção aplicada: " + (data || "OK"));
        setFixExecutado(true);
      }
    } catch (e) {
      toast.error("Erro: " + String(e));
    }
  }

  const statusBadge = () => {
    if (!config?.ativo) return <Badge variant="outline">Desconectado</Badge>;
    if (config.ultima_sync_status === "erro") return <Badge variant="destructive">Erro</Badge>;
    if (config.ultima_sync_status === "parcial")
      return <Badge className="bg-amber-500 hover:bg-amber-500">Parcial</Badge>;
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Conectado</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-admin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings2 className="h-6 w-6 text-admin" />
          Integrações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure as integrações externas do sistema.
        </p>
      </div>

      <Tabs defaultValue="bling" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bling">Bling</TabsTrigger>
          <TabsTrigger value="email">Email Externo</TabsTrigger>
        </TabsList>

        {/* ABA BLING */}
        <TabsContent value="bling" className="space-y-6">
          <div className="flex justify-end">{statusBadge()}</div>

          {/* Credenciais */}
          <Card>
            <CardHeader>
              <CardTitle>Credenciais Bling</CardTitle>
              <CardDescription>
                Cadastre o app no portal do Bling e cole as chaves abaixo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Client ID</Label>
                  <Input
                    value={form.client_id}
                    onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                    placeholder="ex: abcd1234..."
                  />
                </div>
                <div>
                  <Label>Client Secret</Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? "text" : "password"}
                      value={form.client_secret}
                      onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
                      placeholder="••••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label>Access Token</Label>
                  <div className="relative">
                    <Input
                      type={showAccess ? "text" : "password"}
                      value={form.access_token}
                      onChange={(e) => setForm({ ...form, access_token: e.target.value })}
                      placeholder="Gerado após autorização OAuth"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAccess((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showAccess ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label>Refresh Token</Label>
                  <div className="relative">
                    <Input
                      type={showRefresh ? "text" : "password"}
                      value={form.refresh_token}
                      onChange={(e) => setForm({ ...form, refresh_token: e.target.value })}
                      placeholder="Gerado após autorização OAuth"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRefresh((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showRefresh ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <Switch
                  checked={form.ativo}
                  onCheckedChange={(v) => setForm({ ...form, ativo: v })}
                />
                <Label className="cursor-pointer">Integração ativa</Label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={salvar} disabled={saving} className="bg-admin hover:bg-admin/90 text-admin-foreground">
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar credenciais
                </Button>
                <Button variant="outline" onClick={autorizarBling} disabled={!form.client_id}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Autorizar no Bling
                </Button>
                <Button
                  variant="outline"
                  onClick={testarConexao}
                  disabled={!!syncing}
                >
                  {syncing === "ping" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Testar conexão
                </Button>
              </div>

              <div className="mt-4 p-4 rounded-lg border border-dashed space-y-2">
                <p className="text-xs text-muted-foreground">
                  Após autorizar no Bling, copie o <code>code=</code> da URL e cole aqui:
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Cole o code aqui"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    className="flex-1 text-xs font-mono"
                  />
                  <Button
                    size="sm"
                    onClick={processarCodeManual}
                    disabled={!manualCode.trim() || processingCode}
                    className="bg-admin hover:bg-admin-accent text-admin-foreground"
                  >
                    {processingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Conectar"}
                  </Button>
                </div>
              </div>

            </CardContent>
          </Card>

          {/* Sincronização por entidade */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle>Sincronização</CardTitle>
                  <CardDescription>
                    {config?.ultima_sync_at
                      ? `Última sincronização ${formatDistanceToNow(new Date(config.ultima_sync_at), { addSuffix: true, locale: ptBR })}`
                      : "Nunca sincronizado"}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSyncFull}
                    disabled={!!syncing || !config?.access_token}
                    className="bg-admin hover:bg-admin/90 text-admin-foreground"
                  >
                    {syncing === "full"
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <RefreshCw className="h-4 w-4 mr-2" />}
                    Sincronizar tudo
                  </Button>
                  {config?.access_token && (
                    <Button variant="outline" onClick={desconectarBling}>
                      Desconectar
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entidade</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Página atual</TableHead>
                    <TableHead className="text-right">Total processado</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ENTIDADES.map((ent) => {
                    const cur: any = cursores.find((c: any) => c.entidade === ent.id) || {};
                    const emExec = cur.em_execucao || syncing === ent.id;
                    return (
                      <TableRow key={ent.id}>
                        <TableCell className="font-medium">{ent.label}</TableCell>
                        <TableCell>
                          {emExec ? (
                            <Badge variant="outline"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Sincronizando</Badge>
                          ) : cur.ultima_data_corte ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              {formatDistanceToNow(new Date(cur.ultima_data_corte), { addSuffix: true, locale: ptBR })}
                            </Badge>
                          ) : cur.ultima_pagina > 0 ? (
                            <Badge className="bg-amber-500 hover:bg-amber-500">
                              <AlertCircle className="h-3 w-3 mr-1" />Pausada
                            </Badge>
                          ) : (
                            <Badge variant="outline">Nunca</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {cur.ultima_pagina || 0}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {cur.total_processado || 0}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => sincronizar(ent.id)}
                              disabled={!!syncing || !config?.access_token}
                            >
                              {syncing === ent.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <RefreshCw className="h-3 w-3" />}
                            </Button>
                            {cur.ultima_pagina > 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => resetarCursor(ent.id)}
                                disabled={!!syncing}
                                title="Resetar cursor"
                              >
                                ↺
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {syncResult && (
                <div className="p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 text-sm">
                  <div className="font-medium text-emerald-900 dark:text-emerald-200">
                    ✅ {syncResult.criados} novos | {syncResult.atualizados} atualizados | {syncResult.erros} erros · {syncResult.duracao_ms}ms
                  </div>
                  {syncResult.detalhes && (
                    <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 font-mono">
                      {syncResult.detalhes}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Histórico */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>Histórico de sincronizações</CardTitle>
                  <CardDescription>Últimas {logsLimit} execuções</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={String(logsLimit)} onValueChange={(v) => setLogsLimit(Number(v))}>
                    <SelectTrigger className="w-[110px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Últimos 5</SelectItem>
                      <SelectItem value="10">Últimos 10</SelectItem>
                      <SelectItem value="20">Últimos 20</SelectItem>
                      <SelectItem value="50">Últimos 50</SelectItem>
                    </SelectContent>
                  </Select>
                  {logs.some((l: any) => l.status === "executando") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const { data, error } = await supabase.functions.invoke(
                          "sync-bling-financeiro",
                          { body: { tipo: "limpar_travados" } }
                        );
                        if (error) {
                          toast.error("Falha: " + error.message);
                        } else {
                          toast.success(`${data?.cancelados ?? 0} sync(s) marcadas como canceladas`);
                          qc.invalidateQueries({ queryKey: ["integracao-bling-logs"] });
                        }
                      }}
                    >
                      Limpar travados
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Nenhuma sincronização registrada ainda.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Criados</TableHead>
                      <TableHead className="text-right">Atualizados</TableHead>
                      <TableHead className="text-right">Erros</TableHead>
                      <TableHead className="text-right">Duração</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">
                          {format(new Date(l.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-xs">{l.tipo}</TableCell>
                        <TableCell>
                          {l.status === "sucesso" && (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Sucesso
                            </Badge>
                          )}
                          {l.status === "erro" && (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" /> Erro
                            </Badge>
                          )}
                          {l.status === "parcial" && (
                            <Badge className="bg-amber-500 hover:bg-amber-500">
                              <AlertCircle className="h-3 w-3 mr-1" /> Parcial
                            </Badge>
                          )}
                          {l.status === "executando" && (
                            <Badge variant="outline">
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Executando
                            </Badge>
                          )}
                          {l.status === "cancelado" && (
                            <Badge variant="outline" className="text-muted-foreground">
                              <XCircle className="h-3 w-3 mr-1" /> Cancelado
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">{l.registros_criados ?? 0}</TableCell>
                        <TableCell className="text-right text-xs">{l.registros_atualizados ?? 0}</TableCell>
                        <TableCell className="text-right text-xs">{l.registros_erro ?? 0}</TableCell>
                        <TableCell className="text-right text-xs">
                          {l.duracao_ms ? `${l.duracao_ms}ms` : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Como configurar */}
          <Accordion type="single" collapsible>
            <AccordionItem value="how">
              <AccordionTrigger className="text-sm font-medium">
                Como configurar a integração
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-2">
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>Acesse o portal do Bling → Configurações → API → Aplicativos</li>
                  <li>Crie um novo aplicativo com nome "Fetely Uauuu"</li>
                  <li>
                    URL de callback:{" "}
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                      {CALLBACK_URL}
                    </code>
                  </li>
                  <li>Copie Client ID e Client Secret nos campos acima e salve</li>
                  <li>Clique em "Autorizar no Bling" para gerar os tokens</li>
                  <li>Teste a conexão e sincronize os dados</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>

        {/* ABA EMAIL EXTERNO */}
        <TabsContent value="email" className="space-y-6">
          {/* Destinatários (pagamento + fiscal) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-admin" />
                Destinatários
              </CardTitle>
              <CardDescription>
                Quem recebe emails do sistema. Um destinatário pode receber solicitações de pagamento individual e/ou pacotes fiscais consolidados pro contador.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {configFinanceiro.length === 0 ? (
                <div className="text-center py-8 border border-dashed rounded-lg">
                  <p className="text-sm font-medium">Nenhum destinatário cadastrado</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Adicione quem deve receber os emails do sistema.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {configFinanceiro.map((fin: any) => {
                    const propositos: string[] = Array.isArray(fin.propositos) ? fin.propositos : ["pagamento"];
                    const recebePagamento = propositos.includes("pagamento");
                    const recebeFiscal = propositos.includes("fiscal");
                    const ehCopia = fin.papel === "copia";
                    return (
                      <div
                        key={fin.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm truncate">{fin.nome}</p>
                            {!fin.ativo && <Badge variant="outline" className="text-xs">Inativo</Badge>}
                            {ehCopia && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                Cópia (CC)
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{fin.email}</p>
                          <div className="flex items-center gap-1 mt-1">
                            {recebePagamento && (
                              <Badge className="bg-blue-600 hover:bg-blue-600 text-xs">
                                Pagamento
                              </Badge>
                            )}
                            {recebeFiscal && (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-xs">
                                Fiscal
                              </Badge>
                            )}
                          </div>
                          {fin.observacao && (
                            <p className="text-xs text-muted-foreground mt-1 italic">{fin.observacao}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-3">
                          <Button size="sm" variant="ghost" onClick={() => abrirEditarFin(fin)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setRemovingFin(fin)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={abrirNovoFin}
              >
                <Plus className="h-4 w-4" /> Adicionar destinatário
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog adicionar/editar financeiro */}
      <Dialog open={showDialogFin} onOpenChange={setShowDialogFin}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFin ? "Editar destinatário" : "Novo destinatário"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Nome</Label>
              <Input
                placeholder="ex: João da Silva"
                value={finForm.nome}
                onChange={(e) => setFinForm({ ...finForm, nome: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="financeiro@empresa.com"
                value={finForm.email}
                onChange={(e) => setFinForm({ ...finForm, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Observação (opcional)</Label>
              <Input
                placeholder="ex: Receber só pagamentos acima de 1k"
                value={finForm.observacao}
                onChange={(e) => setFinForm({ ...finForm, observacao: e.target.value })}
              />
            </div>

            <div>
              <Label>Recebe</Label>
              <div className="space-y-2 mt-2">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="prop-pagamento"
                    checked={finForm.propositos.includes("pagamento")}
                    onCheckedChange={(checked) => {
                      setFinForm((f) => ({
                        ...f,
                        propositos: checked
                          ? Array.from(new Set([...f.propositos, "pagamento"]))
                          : f.propositos.filter((p) => p !== "pagamento"),
                      }));
                    }}
                  />
                  <div className="grid gap-0.5 leading-none">
                    <Label htmlFor="prop-pagamento" className="cursor-pointer">
                      Solicitação de pagamento
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Email enviado quando uma conta vai pra pagamento.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox
                    id="prop-fiscal"
                    checked={finForm.propositos.includes("fiscal")}
                    onCheckedChange={(checked) => {
                      setFinForm((f) => ({
                        ...f,
                        propositos: checked
                          ? Array.from(new Set([...f.propositos, "fiscal"]))
                          : f.propositos.filter((p) => p !== "fiscal"),
                      }));
                    }}
                  />
                  <div className="grid gap-0.5 leading-none">
                    <Label htmlFor="prop-fiscal" className="cursor-pointer">
                      Pacote fiscal (contador)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Email com link pro pacote de NFs/recibos consolidado.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Label>Papel no email</Label>
              <RadioGroup
                value={finForm.papel}
                onValueChange={(v) =>
                  setFinForm({ ...finForm, papel: v as "principal" | "copia" })
                }
                className="flex gap-4 mt-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="principal" id="papel-principal" />
                  <Label htmlFor="papel-principal" className="cursor-pointer font-normal">
                    Principal (To:)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="copia" id="papel-copia" />
                  <Label htmlFor="papel-copia" className="cursor-pointer font-normal">
                    Cópia (CC:)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialogFin(false)}>Cancelar</Button>
            <Button
              onClick={salvarFinanceiro}
              disabled={savingFin}
              className="bg-admin hover:bg-admin/90 text-admin-foreground"
            >
              {savingFin && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog confirmar remoção */}
      <AlertDialog open={!!removingFin} onOpenChange={(open) => !open && setRemovingFin(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover destinatário?</AlertDialogTitle>
            <AlertDialogDescription>
              {removingFin && `${removingFin.nome} (${removingFin.email}) deixará de receber emails do sistema.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={removerFinanceiro}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sim, remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
