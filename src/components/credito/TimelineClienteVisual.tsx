import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ParceiroMarco, TipoMarco } from "@/types/credito";

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
  marcos: ParceiroMarco[];
}

export function TimelineClienteVisual({ marcos }: Props) {
  if (marcos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Sem marcos registrados ainda.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Timeline</span>
          <Badge variant="secondary">{marcos.length} marcos</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative pl-6">
          <div className="absolute left-2 top-2 bottom-2 w-px bg-border" aria-hidden />
          <div className="space-y-5">
            {marcos.map((m) => (
              <div key={m.id} className="relative">
                <div className="absolute -left-[18px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                <p className="text-xs text-muted-foreground">
                  {new Date(m.criado_em).toLocaleString("pt-BR")}
                  {m.operador_email && ` · ${m.operador_email}`}
                </p>
                <p className="text-sm font-medium mt-0.5">
                  {MARCO_LABELS[m.tipo_marco] || m.tipo_marco}
                </p>
                {m.valor_anterior && m.valor_novo && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {m.valor_anterior} → {m.valor_novo}
                  </p>
                )}
                {m.motivo && (
                  <p className="text-xs text-foreground/80 italic mt-1">
                    “{m.motivo}”
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
