import { Selo } from "@/components/ui/selo";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

/**
 * MESA-SP-SERVICO-CORREIOS: PAC/SEDEX e frete pago, lidos prontos do banco
 * (`fn_mesa_sp_servico_correios` via `vw_mesa_sp_quadro`). A tela não deriva nada.
 */
export function SeloServicoCorreios({
  servico, freteValor, freteGratis, className,
}: { servico: string | null; freteValor: number | null; freteGratis: boolean | null; className?: string }) {
  if (!servico) {
    return <Selo estado="warning" className={className}>Serviço não informado — confira no pedido</Selo>;
  }
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <Selo estado={servico === "SEDEX" ? "warning" : "info"} className="px-3 py-1 text-base font-bold tracking-wide">
        {servico}
      </Selo>
      <span className="text-sm font-medium">
        {freteGratis ? "frete grátis" : `cliente pagou ${formatBRL(freteValor ?? 0)}`}
      </span>
    </span>
  );
}
