import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Send, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const TI_COLOR = "#3A7D6B";

const TEMPLATES = [
  { name: "boas-vindas-portal", displayName: "Boas-vindas ao Portal" },
  { name: "recuperacao-senha", displayName: "Recuperação de Senha" },
  { name: "convite-cadastro", displayName: "Convite — Cadastro de Colaborador" },
  { name: "cadastro-recebido", displayName: "Cadastro Recebido" },
  { name: "cadastro-aprovado", displayName: "Cadastro Aprovado" },
  { name: "cadastro-devolvido", displayName: "Cadastro Devolvido" },
  { name: "aviso-email-pessoal", displayName: "Aviso Email Pessoal" },
  { name: "candidatura-recebida", displayName: "Candidatura Recebida" },
  { name: "solicitar-perfil-candidato", displayName: "Solicitar Perfil — Candidato" },
  { name: "teste-tecnico-candidato", displayName: "Teste Técnico — Candidato" },
  { name: "teste-tecnico-entregue", displayName: "Teste Técnico Entregue" },
  { name: "proposta-candidato", displayName: "Proposta — Candidato" },
  { name: "nf-pagamento", displayName: "NF para Pagamento" },
  { name: "pagamento-solicitacao", displayName: "Solicitação de Pagamento" },
  { name: "pacote-fiscal-contador", displayName: "Pacote Fiscal — Contador" },
];

const TEMPLATE_DATA_DEFAULTS: Record<string, Record<string, unknown>> = {
  "boas-vindas-portal": { nome: "Flávio", email_corporativo: "", link: "https://sncf.lovable.app" },
  "recuperacao-senha": { nome: "Flávio", link: "https://sncf.lovable.app" },
};

type SendResult =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; messageId: string; rawResponse: unknown }
  | { status: "error"; message: string; details?: unknown };

type LogEntry = {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

export default function TesteEmailTemplate() {
  const { user, roles } = useAuth();
  const [templateName, setTemplateName] = useState("boas-vindas-portal");
  const [recipientEmail, setRecipientEmail] = useState(user?.email ?? "");
  const [templateDataJson, setTemplateDataJson] = useState("{}");
  const [result, setResult] = useState<SendResult>({ status: "idle" });
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Permission: super_admin only
  if (!roles.includes("super_admin")) {
    return <Navigate to="/sem-permissao" replace />;
  }

  // Carrega defaults quando muda template
  useEffect(() => {
    const defaults = TEMPLATE_DATA_DEFAULTS[templateName] ?? {};
    setTemplateDataJson(JSON.stringify(defaults, null, 2));
  }, [templateName]);

  // Default recipient
  useEffect(() => {
    if (user?.email && !recipientEmail) setRecipientEmail(user.email);
  }, [user?.email, recipientEmail]);

  async function loadRecentLogs() {
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from("email_send_log")
      .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error && data) setRecentLogs(data as LogEntry[]);
    setLoadingLogs(false);
  }

  useEffect(() => {
    void loadRecentLogs();
  }, []);

  async function handleEnviar() {
    if (!recipientEmail) {
      toast.error("Informe o email destinatário");
      return;
    }
    let parsedData: Record<string, unknown> = {};
    try {
      parsedData = templateDataJson.trim() ? JSON.parse(templateDataJson) : {};
    } catch (e: any) {
      toast.error("templateData não é JSON válido: " + e.message);
      return;
    }

    setResult({ status: "loading" });
    try {
      const { data, error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName,
          recipientEmail,
          templateData: parsedData,
        },
      });

      if (error) {
        setResult({ status: "error", message: error.message, details: error });
        toast.error("Falha no envio: " + error.message);
      } else if ((data as any)?.success === false) {
        setResult({
          status: "error",
          message: (data as any).reason || "Envio bloqueado",
          details: data,
        });
        toast.warning("Envio bloqueado: " + ((data as any).reason || "desconhecido"));
      } else {
        setResult({
          status: "success",
          messageId: (data as any)?.messageId ?? "—",
          rawResponse: data,
        });
        toast.success("Email enviado");
      }
    } catch (e: any) {
      setResult({ status: "error", message: e?.message ?? String(e) });
      toast.error("Erro inesperado: " + (e?.message ?? "desconhecido"));
    } finally {
      void loadRecentLogs();
    }
  }

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      sent: "bg-green-100 text-green-800 border-green-300",
      pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
      failed: "bg-red-100 text-red-800 border-red-300",
      suppressed: "bg-gray-100 text-gray-700 border-gray-300",
      bounced: "bg-orange-100 text-orange-800 border-orange-300",
      complained: "bg-red-100 text-red-900 border-red-400",
      dlq: "bg-red-200 text-red-900 border-red-500",
    };
    return (
      <Badge variant="outline" className={variants[status] ?? "bg-gray-50 text-gray-600 border-gray-200"}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: TI_COLOR }}>
          <Send className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Diagnóstico — Teste de Email</h1>
          <p className="text-sm text-muted-foreground">
            Dispara um email de qualquer template registrado para um destinatário escolhido.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Disparar email</CardTitle>
          <CardDescription>
            Selecione template, ajuste o JSON de dados, e envie. O envio passa por suppression check,
            renderização React Email, e Resend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="template">Template</Label>
              <Select value={templateName} onValueChange={setTemplateName}>
                <SelectTrigger id="template">
                  <SelectValue placeholder="Selecione um template" />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.displayName} ({t.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email destinatário</Label>
              <Input
                id="email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="seu@email.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="data">templateData (JSON)</Label>
            <Textarea
              id="data"
              value={templateDataJson}
              onChange={(e) => setTemplateDataJson(e.target.value)}
              className="font-mono text-sm"
              rows={6}
              placeholder="{}"
            />
            <p className="text-xs text-muted-foreground">
              Campos opcionais — templates têm defaults. Se vazio, mande <code>{`{}`}</code>.
            </p>
          </div>

          <Button
            onClick={handleEnviar}
            disabled={result.status === "loading"}
            style={{ backgroundColor: TI_COLOR }}
            className="text-white hover:opacity-90"
          >
            {result.status === "loading" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar teste
          </Button>

          {result.status === "success" && (
            <Alert className="border-green-300 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-700" />
              <AlertTitle className="text-green-900">Email enviado</AlertTitle>
              <AlertDescription className="text-green-800">
                <div>
                  messageId: <code>{result.messageId}</code>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs">Resposta completa</summary>
                  <pre className="text-xs mt-1 overflow-auto">{JSON.stringify(result.rawResponse, null, 2)}</pre>
                </details>
              </AlertDescription>
            </Alert>
          )}

          {result.status === "error" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Falha no envio</AlertTitle>
              <AlertDescription>
                <div>{result.message}</div>
                {result.details && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs">Detalhes</summary>
                    <pre className="text-xs mt-1 overflow-auto">{JSON.stringify(result.details, null, 2)}</pre>
                  </details>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Últimos 10 envios</CardTitle>
            <CardDescription>
              Log da tabela <code>email_send_log</code>
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadRecentLogs} disabled={loadingLogs}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingLogs ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum envio registrado ainda.</p>
          ) : (
            <div className="space-y-2">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-2 border rounded text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {log.template_name} → {log.recipient_email}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("pt-BR")} · msg:{" "}
                      {log.message_id?.slice(0, 8) ?? "—"}
                    </div>
                    {log.error_message && (
                      <div className="text-xs text-red-700 mt-1">{log.error_message}</div>
                    )}
                  </div>
                  {statusBadge(log.status)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
