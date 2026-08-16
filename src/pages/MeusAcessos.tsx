import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, UserCheck, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { PageShell } from "@/components/layout/PageShell";
interface AcessoSalario {
  id: string;
  ator_user_id: string | null;
  ator_nome: string | null;
  contexto: string | null;
  justificativa: string | null;
  em_lote: boolean;
  quantidade_alvos: number;
  criado_em: string;
}

const CONTEXTO_LABELS: Record<string, string> = {
  proprio: "Próprio",
  folha: "Folha de pagamento",
  holerite: "Holerite",
  admissao: "Admissão",
  convite: "Convite",
  revisao_salarial: "Revisão salarial",
  recrutamento: "Recrutamento",
  dashboard_custos: "Dashboard de custos",
  organograma: "Organograma",
  relatorio_pj: "Relatório PJ",
  auditoria: "Auditoria",
};

export default function MeusAcessos() {
  const { data: acessos, isLoading } = useQuery({
    queryKey: ["meus-acessos-salario"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("meus_acessos_salario")
        .select("*")
        .limit(100);
      if (error) throw error;
      return (data || []) as AcessoSalario[];
    },
  });

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-medium flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Acessos ao meu salário
        </h1>
        <p className="text-muted-foreground mt-1">
          Transparência LGPD: quem consultou seu salário, quando e por quê. Suas próprias
          consultas não aparecem aqui.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !acessos || acessos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldCheck className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium">Nenhum acesso registrado.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Ninguém consultou seu salário ainda.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {acessos.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4 flex gap-3 items-start">
                {a.em_lote ? (
                  <Users className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                ) : (
                  <UserCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">
                      {a.ator_nome || "(usuário removido)"}
                    </span>{" "}
                    consultou em contexto{" "}
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {a.contexto ? CONTEXTO_LABELS[a.contexto] || a.contexto : "—"}
                    </Badge>
                  </p>
                  {a.justificativa && (
                    <p className="text-sm text-muted-foreground mt-1.5 italic">
                      Justificativa: "{a.justificativa}"
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(a.criado_em), "dd 'de' MMMM 'de' yyyy, HH:mm", {
                      locale: ptBR,
                    })}
                    {a.em_lote && ` · acesso em lote (${a.quantidade_alvos} pessoas)`}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
