import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftRight, FileSpreadsheet, Banknote, ChevronRight, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export default function Conciliacao() {
  const { data: stage1Pendentes } = useQuery({
    queryKey: ["conciliacao-hub-stage1-count"],
    queryFn: async () => {
      const { count } = await sb
        .from("itau_pagamentos_stage")
        .select("id", { count: "exact", head: true })
        .is("movimentacao_id", null)
        .not("status_conciliacao", "in", "(ignorado)");
      return count ?? 0;
    },
  });

  const { data: stage2Pendentes } = useQuery({
    queryKey: ["conciliacao-hub-stage2-count"],
    queryFn: async () => {
      const { count } = await sb
        .from("ofx_transacoes_stage")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente")
        .lt("valor", 0);
      return count ?? 0;
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6" />
          Conciliação Bancária
        </h1>
        <p className="text-sm text-muted-foreground">
          Saldo banco = saldo sistema. Dois recortes: Stage 1 casa cada linha da planilha Itaú a uma movimentação do sistema.
          Stage 2 confirma com o extrato OFX. Mapa Conciliação v2.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Card Stage 1 — ATIVO */}
        <Link to="/administrativo/conciliacao/stage-1" className="block">
          <Card className="hover:border-primary hover:shadow-md transition-all cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10 text-primary">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                    <Badge variant="secondary" className="mb-1">STAGE 1</Badge>
                    <h3 className="font-semibold">Planilha ↔ Movimentação</h3>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                A IA propõe matches por CNPJ, Data e Valor. Você aprova cada vínculo.
              </p>
              {(stage1Pendentes ?? 0) > 0 && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1">
                  <Clock className="h-3 w-3" />
                  {stage1Pendentes} pendente{stage1Pendentes !== 1 ? "s" : ""}
                </Badge>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Card Stage 2 */}
        <Link to="/administrativo/conciliacao/stage-2" className="block">
          <Card className="hover:border-primary hover:shadow-md transition-all cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10 text-primary">
                    <Banknote className="h-5 w-5" />
                  </div>
                  <div>
                    <Badge variant="secondary" className="mb-1">STAGE 2</Badge>
                    <h3 className="font-semibold">Planilha ↔ Extrato OFX</h3>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Confirma os vínculos Stage 1 contra o extrato bancário. Preenche a data efetiva de pagamento.
              </p>
              {(stage2Pendentes ?? 0) > 0 && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1">
                  <Clock className="h-3 w-3" />
                  {stage2Pendentes} pendente{stage2Pendentes !== 1 ? "s" : ""}
                </Badge>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="pt-4 border-t">
        <Link
          to="/administrativo/conciliacao/legacy"
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          → Tela antiga (Stage 1 + Stage 2 combinados, usar até Fase 2 cobrir)
        </Link>
      </div>
    </div>
  );
}
