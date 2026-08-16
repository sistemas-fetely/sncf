import { CheckCircle2, Clock, AlertCircle, FileText, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { MinhaNota } from "@/hooks/useMinhasNotas";

interface Props {
  notas: MinhaNota[];
  ano?: number;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function StatusIcon({ status }: { status: string | null }) {
  if (!status) {
    return (
      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
        <Clock className="h-4 w-4 text-muted-foreground/50" />
      </div>
    );
  }
  const map: Record<string, { icon: typeof Clock; color: string; bg: string }> = {
    paga: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
    enviada_pagamento: { icon: FileText, color: "text-info", bg: "bg-info/10" },
    aprovada: { icon: CheckCircle2, color: "text-info", bg: "bg-info/10" },
    aguardando_aprovacao: { icon: Clock, color: "text-warning", bg: "bg-warning/10" },
    aguardando_validacao: { icon: Loader2, color: "text-warning", bg: "bg-warning/10" },
    em_analise: { icon: Loader2, color: "text-warning", bg: "bg-warning/10" },
    precisa_correcao: { icon: AlertCircle, color: "text-warning", bg: "bg-warning/10" },
    rejeitada: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
    em_disputa: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10" },
    pendente: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted" },
  };
  const entry = map[status] || map.pendente;
  const Icon = entry.icon;
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${entry.bg}`}>
      <Icon className={`h-4 w-4 ${entry.color}`} />
    </div>
  );
}

function StatusLabel({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">Sem NF ainda</span>;
  const labels: Record<string, string> = {
    paga: "Paga ✨",
    enviada_pagamento: "Enviada para pagamento",
    aprovada: "Aprovada pelo RH",
    aguardando_aprovacao: "Aguardando aprovação",
    aguardando_validacao: "Em análise",
    em_analise: "Em análise",
    precisa_correcao: "Precisa correção",
    rejeitada: "Rejeitada",
    em_disputa: "Em disputa",
    pendente: "Pendente",
  };
  return <span className="text-xs font-medium">{labels[status] || status}</span>;
}

export function TimelineNotas({ notas, ano = new Date().getFullYear() }: Props) {
  const byCompetencia: Record<string, MinhaNota> = {};
  notas.forEach((n) => {
    if (n.competencia.startsWith(`${ano}-`)) {
      byCompetencia[n.competencia] = n;
    }
  });

  return (
    <div className="space-y-2">
      {MESES.map((nome, i) => {
        const mesNum = String(i + 1).padStart(2, "0");
        const competencia = `${ano}-${mesNum}`;
        const nota = byCompetencia[competencia];
        const isFuture =
          new Date().getMonth() < i && new Date().getFullYear() === ano;

        return (
          <Card key={competencia} className={isFuture ? "opacity-50" : ""}>
            <CardContent className="p-3 flex items-center gap-3">
              <StatusIcon status={nota?.status || null} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium capitalize">{nome}</span>
                  <span className="text-xs text-muted-foreground">/{ano}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusLabel status={nota?.status || null} />
                  {nota && (
                    <span className="text-xs text-muted-foreground">
                      · R$ {Number(nota.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              </div>
              {nota?.numero && (
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-muted-foreground uppercase">NF Nº</p>
                  <p className="text-xs font-mono">{nota.numero}</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
