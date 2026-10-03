import { useParams, useSearchParams } from "react-router-dom";
import { BarraImpressao } from "@/components/impressao/BarraImpressao";
import { EstilosExtrato, ExtratoRepresentanteDocumento } from "./ExtratoRepresentanteDocumento";

export default function RepresentanteExtratoImpressao() {
  const { vendedorId = "" } = useParams();
  const [params] = useSearchParams();
  return (
    <main className="documento-extrato">
      <EstilosExtrato />
      <BarraImpressao />
      <ExtratoRepresentanteDocumento vendedorId={vendedorId} competencia={params.get("competencia")} mostrarSeletor />
    </main>
  );
}
