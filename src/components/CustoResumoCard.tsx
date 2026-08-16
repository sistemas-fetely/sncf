import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DollarSign, TrendingUp, Calculator } from "lucide-react";
import { useParametrosFolha } from "@/hooks/useParametrosFolha";
import { calcularINSS, calcularIRRF } from "@/lib/calculo-folha";

const fmt = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

interface CustoResumoProps {
  tipo: "clt" | "pj";
  salarioBase: number;
  /** Only for CLT: number of dependentes marked as incluir_irrf */
  dependentesIRRF?: number;
}

function CustoLine({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${highlight ? "font-medium text-primary" : ""}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm ${highlight ? "text-primary font-medium" : "font-medium"}`}>{value}</span>
    </div>
  );
}

export function CustoResumoCard({ tipo, salarioBase, dependentesIRRF = 0 }: CustoResumoProps) {
  const { data: params } = useParametrosFolha();

  if (!params) return null;

  if (tipo === "pj") {
    const custoAnual = salarioBase * 12;
    return (
      <Card className="card-shadow border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Resumo de Custos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <CustoLine label="Valor Mensal" value={fmt(salarioBase)} />
          <Separator className="my-2" />
          <CustoLine label="Custo Anual (12 meses)" value={fmt(custoAnual)} highlight />
        </CardContent>
      </Card>
    );
  }

  // CLT calculations
  const inss = calcularINSS(salarioBase, params.faixasINSS);
  const baseIRRF = salarioBase - inss;
  const irrf = calcularIRRF(baseIRRF, dependentesIRRF, params.faixasIRRF, params.deducaoDependenteIRRF);
  const fgts = Math.round(salarioBase * params.aliquotaFGTS * 100) / 100;
  const inssPatronal = Math.round(salarioBase * params.aliquotaINSSPatronal * 100) / 100;
  const totalEncargos = fgts + inssPatronal;
  const custoTotalMensal = salarioBase + totalEncargos;
  const salarioLiquido = salarioBase - inss - irrf;
  const custoAnual = custoTotalMensal * 12;
  // 13o + 1/3 férias provisioned monthly
  const provisao13 = salarioBase / 12;
  const provisaoFerias = salarioBase / 12;
  const provisaoTercoFerias = provisaoFerias / 3;
  const provisaoTotal = provisao13 + provisaoFerias + provisaoTercoFerias;
  const custoTotalComProvisao = custoTotalMensal + provisaoTotal;

  return (
    <Card className="card-shadow border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          Resumo de Custos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        {/* Proventos */}
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Salário</p>
        <CustoLine label="Salário Base" value={fmt(salarioBase)} />
        
        <Separator className="my-2" />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Descontos do Empregado</p>
        <CustoLine label={`INSS Empregado`} value={`- ${fmt(inss)}`} />
        <CustoLine label={`IRRF`} value={`- ${fmt(irrf)}`} />
        <CustoLine label="Salário Líquido (est.)" value={fmt(Math.max(salarioLiquido, 0))} highlight />

        <Separator className="my-2" />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
          <Calculator className="h-3 w-3 inline mr-1" />
          Encargos do Empregador
        </p>
        <CustoLine label={`FGTS (${pct(params.aliquotaFGTS)})`} value={fmt(fgts)} />
        <CustoLine label={`INSS Patronal (${pct(params.aliquotaINSSPatronal)})`} value={fmt(inssPatronal)} />
        <CustoLine label="Total Encargos" value={fmt(totalEncargos)} />

        <Separator className="my-2" />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
          <TrendingUp className="h-3 w-3 inline mr-1" />
          Provisões Mensais
        </p>
        <CustoLine label="13º Salário (1/12)" value={fmt(Math.round(provisao13 * 100) / 100)} />
        <CustoLine label="Férias (1/12)" value={fmt(Math.round(provisaoFerias * 100) / 100)} />
        <CustoLine label="1/3 Férias" value={fmt(Math.round(provisaoTercoFerias * 100) / 100)} />

        <Separator className="my-3" />
        <CustoLine label="Custo Mensal (sal + encargos)" value={fmt(custoTotalMensal)} />
        <CustoLine label="Custo Mensal c/ Provisões" value={fmt(Math.round(custoTotalComProvisao * 100) / 100)} highlight />
        <CustoLine label="Custo Anual Estimado" value={fmt(Math.round(custoTotalComProvisao * 12 * 100) / 100)} highlight />
      </CardContent>
    </Card>
  );
}
