import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Clock,
  CreditCard,
  Timer,
  CalendarDays,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("pt-BR") : "—";
const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("pt-BR") : "—";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analise: any | null;
}

const STATUS_LABEL: Record<string, string> = {
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  aprovado_com_ressalva: "Aprovado com ressalva",
};

const STATUS_CLASS: Record<string, string> = {
  aprovado: "bg-emerald-500 hover:bg-emerald-500 text-white border-0",
  reprovado: "bg-red-500 hover:bg-red-500 text-white border-0",
  aprovado_com_ressalva: "bg-amber-500 hover:bg-amber-500 text-white border-0",
};

const FORMA_LABEL: Record<string, string> = {
  pix: "PIX",
  cartao: "Cartão",
  boleto: "Boleto",
};

export function CreditoTab({ analise }: Props) {
  if (!analise) {
    return (
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription>
          <p className="font-medium">Pedido à vista — sem análise de crédito.</p>
          <p className="text-xs text-muted-foreground mt-1">
            PIX, cartão e boleto à vista não passam pelo módulo de crédito.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (!analise.status_final) {
    return (
      <Alert>
        <Clock className="h-4 w-4" />
        <AlertDescription>
          <p className="font-medium">Análise de crédito em andamento.</p>
          <p className="text-xs text-muted-foreground mt-1">
            O resultado aparecerá aqui após a decisão do Joseph.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  const formas: string[] = analise.formas_aceitas || [];

  return (
    <div className="space-y-4">
      {/* Status principal */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn("gap-1.5 px-2.5 py-1 text-sm", STATUS_CLASS[analise.status_final])}>
          {analise.status_final === "aprovado_com_ressalva" ? (
            <ShieldAlert className="h-3.5 w-3.5" />
          ) : analise.status_final === "reprovado" ? (
            <ShieldX className="h-3.5 w-3.5" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          {STATUS_LABEL[analise.status_final] ?? analise.status_final}
        </Badge>
        {analise.perfil_aplicado && (
          <Badge variant="outline" className="gap-1">
            <User className="h-3 w-3" />
            Perfil: {String(analise.perfil_aplicado).replace(/_/g, " ")}
          </Badge>
        )}
      </div>

      {/* RESSALVA — caixa de destaque */}
      {analise.ressalva && (
        <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900 dark:text-amber-200">
            <p className="font-semibold mb-1">Ressalva do crédito</p>
            <p className="text-sm whitespace-pre-wrap">{analise.ressalva}</p>
          </AlertDescription>
        </Alert>
      )}

      {/* Parecer final do Joseph */}
      {analise.parecer_final && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Parecer do Joseph
          </p>
          <p className="text-sm whitespace-pre-wrap">{analise.parecer_final}</p>
        </div>
      )}

      {/* Resumo da IA */}
      {analise.analise_ia_resumo && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Resumo IA
          </p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{analise.analise_ia_resumo}</p>
        </div>
      )}

      <Separator />

      {/* Grid de condições aprovadas */}
      <div className="grid gap-3 sm:grid-cols-2">
        {analise.limite_concedido != null && (
          <div className="rounded-md border p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              <CreditCard className="h-3 w-3" />
              Limite concedido
            </p>
            <p className="text-base font-semibold">{fmtBRL.format(Number(analise.limite_concedido))}</p>
          </div>
        )}
        {analise.prazo_max_dias != null && (
          <div className="rounded-md border p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              <Timer className="h-3 w-3" />
              Prazo máximo
            </p>
            <p className="text-base font-semibold">{analise.prazo_max_dias} dias</p>
          </div>
        )}
        {analise.validade_ate && (
          <div className="rounded-md border p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              Válida até
            </p>
            <p className="text-base font-semibold">{fmtDate(analise.validade_ate)}</p>
          </div>
        )}
        {analise.decidido_em && (
          <div className="rounded-md border p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Decisão em
            </p>
            <p className="text-sm font-semibold">{fmtDateTime(analise.decidido_em)}</p>
          </div>
        )}
        {formas.length > 0 && (
          <div className="rounded-md border p-3 space-y-1.5 sm:col-span-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Formas aceitas</p>
            <div className="flex flex-wrap gap-1.5">
              {formas.map((f) => (
                <Badge key={f} variant="secondary">
                  {FORMA_LABEL[f] ?? f}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
