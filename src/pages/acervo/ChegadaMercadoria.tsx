import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PackageCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CadastroPedidoCompra from "@/pages/acervo/CadastroPedidoCompra";
import DeParaFornecedor from "@/pages/acervo/DeParaFornecedor";
import RateioNfTab from "@/components/compras/RateioNfTab";
import RecebimentoCentroTab from "@/components/compras/RecebimentoCentroTab";
import PendenciasTab from "@/components/compras/PendenciasTab";
import EmbarquesTab from "@/components/compras/EmbarquesTab";
import ImportarPiPedidoTab from "@/components/compras/ImportarPiPedidoTab";


import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
interface AbaMercadoria {
  value: string;
  label: string;
  render: () => JSX.Element;
}

// Container de abas para o domínio "Compra de Mercadoria" (importacao_pedido).
// Abas novas podem ser acrescentadas apenas estendendo o array ABAS.
const ABAS: AbaMercadoria[] = [
  { value: "embarques", label: "Embarques", render: () => <EmbarquesTab /> },
  {
    value: "acompanhamento",
    label: "Acompanhamento",
    render: () => <CadastroPedidoCompra vista="acompanhamento" />,
  },
  { value: "pendencias", label: "Pendências", render: () => <PendenciasTab /> },
  { value: "recebimento-loja", label: "Recebimento na loja", render: () => <RecebimentoCentroTab /> },
  { value: "novo", label: "Novo pedido", render: () => <CadastroPedidoCompra vista="novo" /> },
  { value: "de-para", label: "De-para de fornecedor", render: () => <DeParaFornecedor /> },
  { value: "rateio-nf", label: "Rateio de NF", render: () => <RateioNfTab /> },
  { value: "importar-pi", label: "Importar PI", render: () => <ImportarPiPedidoTab /> },
];



export default function ChegadaMercadoria() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const abaAtual = useMemo(() => {
    const v = params.get("aba");
    return ABAS.some((a) => a.value === v) ? (v as string) : ABAS[0].value;
  }, [params]);

  const onChange = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("aba", v);
    setParams(next, { replace: true });
  };

  return (
    <PageShell variant="dados">
      <PageHeader
        icone={PackageCheck}
        titulo="Chegada de Mercadoria"
        estado="Chegada de mercadoria: operador logístico, loja (Site SP), NF, ficha XPM e custo."
      />


      <Tabs value={abaAtual} onValueChange={onChange}>
        <TabsList>
          {ABAS.map((a) => (
            <TabsTrigger key={a.value} value={a.value}>
              {a.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {ABAS.map((a) => (
          <TabsContent key={a.value} value={a.value} className="mt-4">
            {abaAtual === a.value ? a.render() : null}
          </TabsContent>
        ))}
      </Tabs>
    </PageShell>
  );
}
