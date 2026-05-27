import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import type { AnaliseListItem, ParceiroMarco, TipoMarco } from "@/types/credito";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");

const MARCO_LABELS: Record<TipoMarco, string> = {
  bandeira_vermelha_subiu: "🚩 Bandeira vermelha erguida",
  bandeira_vermelha_baixou: "✅ Bandeira vermelha baixada",
  nivel_programa_mudou: "📈 Nível do programa mudou",
  categoria_ka_mudou: "⭐ Categoria KA mudou",
  perfil_credito_mudou: "🔄 Perfil de crédito mudou",
  grupo_economico_vinculado: "🔗 Vinculado a grupo econômico",
  grupo_economico_desvinculado: "🔓 Desvinculado do grupo",
  cadastro_completado: "✓ Cadastro completado",
  analise_aprovada: "✅ Análise aprovada",
  analise_aprovada_com_ressalva: "⚠️ Análise aprovada com ressalva",
  analise_reprovada: "❌ Análise reprovada",
  analise_cancelada: "🚫 Análise cancelada",
};

interface Props {
  analisesAnteriores: AnaliseListItem[];
  marcos: ParceiroMarco[];
}

export function HistoricoClienteAccordion({ analisesAnteriores, marcos }: Props) {
  const temConteudo = analisesAnteriores.length > 0 || marcos.length > 0;

  if (!temConteudo) {
    return (
      <p className="text-sm text-muted-foreground italic px-1">
        Cliente novo na Fetely. Sem histórico ainda.
      </p>
    );
  }

  return (
    <Accordion type="single" collapsible className="border rounded-lg">
      <AccordionItem value="hist" className="border-b-0">
        <AccordionTrigger className="px-4 hover:no-underline">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="font-medium">Histórico do cliente</span>
            <Badge variant="secondary" className="ml-1">
              {analisesAnteriores.length} análises · {marcos.length} marcos
            </Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 space-y-4">
          {analisesAnteriores.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Análises anteriores
              </p>
              <div className="space-y-1.5">
                {analisesAnteriores.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 text-sm border rounded-md px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={a.status_final === "aprovado" ? "default" : "outline"}>
                        {a.status_final || "em curso"}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {fmtDate(a.decidido_em)} · {fmtBRL.format(a.pedido_valor_liquido)} ·{" "}
                        {a.pedido_condicao}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {marcos.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Timeline de marcos
              </p>
              <div className="space-y-2">
                {marcos.map((m) => (
                  <div key={m.id} className="text-sm border-l-2 pl-3 py-1">
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.criado_em).toLocaleString("pt-BR")}
                    </p>
                    <p>{MARCO_LABELS[m.tipo_marco] || m.tipo_marco}</p>
                    {m.motivo && (
                      <p className="text-xs text-muted-foreground italic">
                        "{m.motivo}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
