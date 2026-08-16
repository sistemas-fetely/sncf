import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, FileText, Sparkles, AlertCircle, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface Importacao {
  id: string;
  importado_por_nome: string | null;
  arquivo_nome: string;
  arquivo_tamanho_kb: number | null;
  status: string;
  resultado_ia: any;
  processos_criados: string[] | null;
  erro_mensagem: string | null;
  created_at: string;
}

const statusLabels: Record<string, { label: string; cor: string; icone: any }> = {
  em_processamento: { label: "Processando", cor: "text-info", icone: Loader2 },
  sucesso: { label: "Sucesso", cor: "text-success", icone: CheckCircle2 },
  recusado_nao_processo: { label: "Não é processo", cor: "text-warning", icone: AlertCircle },
  erro_ia: { label: "Erro IA", cor: "text-destructive", icone: XCircle },
  erro_pdf: { label: "Erro PDF", cor: "text-destructive", icone: XCircle },
};

export default function HistoricoImportacoesPDF() {
  const navigate = useNavigate();
  const [importacoes, setImportacoes] = useState<Importacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("todos");

  useEffect(() => {
    const carregar = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from("processos_importacoes_pdf")
          .select("id, importado_por_nome, arquivo_nome, arquivo_tamanho_kb, status, resultado_ia, processos_criados, erro_mensagem, created_at")
          .order("created_at", { ascending: false })
          .limit(100);

        if (filtroStatus !== "todos") {
          query = query.eq("status", filtroStatus);
        }

        const { data } = await query;
        setImportacoes((data || []) as any[]);
      } finally {
        setLoading(false);
      }
    };
    void carregar();
  }, [filtroStatus]);

  return (
    <div className="container mx-auto py-6 space-y-5 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-info" />
          <h1 className="text-2xl font-medium tracking-tight">Histórico de Importações PDF</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          PDFs analisados pela IA para virar processos. Auditoria completa.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground">Filtrar status:</span>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="sucesso">Sucesso</SelectItem>
            <SelectItem value="recusado_nao_processo">Não é processo</SelectItem>
            <SelectItem value="erro_ia">Erro IA</SelectItem>
            <SelectItem value="em_processamento">Processando</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-[10px]">
          {importacoes.length} importações
        </Badge>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : importacoes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma importação registrada{filtroStatus !== "todos" && ` com status "${filtroStatus}"`}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {importacoes.map((imp) => {
            const statusInfo = statusLabels[imp.status] || { label: imp.status, cor: "text-muted-foreground", icone: AlertCircle };
            const StatusIcon = statusInfo.icone;
            const temProcessos = (imp.processos_criados?.length || 0) > 0;

            return (
              <Card key={imp.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-sm truncate">{imp.arquivo_nome}</h3>
                        <Badge variant="outline" className={`gap-1 text-[10px] ${statusInfo.cor}`}>
                          <StatusIcon className={`h-3 w-3 ${imp.status === "em_processamento" ? "animate-spin" : ""}`} />
                          {statusInfo.label}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground mt-1">
                        {imp.importado_por_nome || "—"} · {new Date(imp.created_at).toLocaleString("pt-BR")}
                        {imp.arquivo_tamanho_kb && <> · {imp.arquivo_tamanho_kb} KB</>}
                      </p>

                      {imp.erro_mensagem && (
                        <p className="text-xs text-destructive mt-1.5 break-words">{imp.erro_mensagem}</p>
                      )}

                      {imp.status === "recusado_nao_processo" && imp.resultado_ia?.motivo && (
                        <p className="text-xs text-warning mt-1.5 italic">
                          IA disse: "{imp.resultado_ia.motivo}"
                        </p>
                      )}
                    </div>

                    {temProcessos && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/processos/${imp.processos_criados![0]}`)}
                        className="gap-1 shrink-0"
                      >
                        Ver processo <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
