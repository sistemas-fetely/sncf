import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CadastroPedidoCompra from "@/pages/compras/CadastroPedidoCompra";
import DeParaFornecedor from "@/pages/compras/DeParaFornecedor";
import RateioNfTab from "@/components/compras/RateioNfTab";
import PendenciasTab from "@/components/compras/PendenciasTab";

import { PageShell } from "@/components/layout/PageShell";
interface AbaMercadoria {
  value: string;
  label: string;
  render: () => JSX.Element;
}

// Container de abas para o domínio "Compra de Mercadoria" (importacao_pedido).
// Abas novas podem ser acrescentadas apenas estendendo o array ABAS.
const ABAS: AbaMercadoria[] = [
  {
    value: "acompanhamento",
    label: "Acompanhamento",
    render: () => <CadastroPedidoCompra vista="acompanhamento" />,
  },
  { value: "pendencias", label: "Pendências", render: () => <PendenciasTab /> },
  { value: "novo", label: "Novo pedido", render: () => <CadastroPedidoCompra vista="novo" /> },
  { value: "de-para", label: "De-para de fornecedor", render: () => <DeParaFornecedor /> },
  { value: "rateio-nf", label: "Rateio de NF", render: () => <RateioNfTab /> },
];


export default function ComprasMercadoria() {
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
    <PageShell>
      <div className="flex items-center gap-3">
        <div
          className="p-2 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "#1A4A3A" }}
        >
          <ShoppingBag className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-medium">Compras de Mercadoria</h1>
          <p className="text-sm text-muted-foreground">
            Importação e compra nacional de produtos para revenda.
          </p>
        </div>
      </div>

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
