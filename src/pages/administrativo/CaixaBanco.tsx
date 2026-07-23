/**
 * Gerencial — despesas por competência (plano de contas × centro de custo).
 *
 * Refator (23/07/2026): página reduzida à visão Gerencial.
 * Removidos: pills Tudo/A pagar/Realizado/Receitas, KPIs globais, lista de
 * lançamentos, sub-view Receitas, dialogs de IA/NF/documento e queries
 * associadas. O conteúdo é 100% delegado a <MovimentacoesGerencial />.
 */
import { PieChart } from "lucide-react";
import MovimentacoesGerencial from "@/components/financeiro/MovimentacoesGerencial";

export default function CaixaBanco() {
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      {/* HEADER STICKY */}
      <div className="sticky top-0 z-20 bg-background px-6 pt-6 pb-3 border-b backdrop-blur">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <PieChart className="h-6 w-6 text-admin" />
              Gerencial
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Custos por competência — plano de contas e centro de custo.
            </p>
          </div>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6 pt-3">
        <MovimentacoesGerencial />
      </div>
    </div>
  );
}
