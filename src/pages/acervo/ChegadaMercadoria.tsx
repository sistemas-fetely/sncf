import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PackageCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CadastroPedidoCompra from "@/pages/acervo/CadastroPedidoCompra";
import DeParaFornecedor from "@/pages/acervo/DeParaFornecedor";
import RateioNfTab from "@/components/compras/RateioNfTab";
import PendenciasTab from "@/components/compras/PendenciasTab";
import PainelTab from "@/components/compras/PainelTab";
import ImportarPiPedidoTab from "@/components/compras/ImportarPiPedidoTab";
import ImportarPI from "@/pages/acervo/ImportarPI";


import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
interface AbaMercadoria {
  value: string;
  label: string;
  grupo: "gestao" | "ferramenta";
  render: () => JSX.Element;
}

// Container de abas para o domínio "Compra de Mercadoria" (importacao_pedido).
// Abas novas podem ser acrescentadas apenas estendendo o array ABAS.
const ABAS: AbaMercadoria[] = [
  { value: "painel", label: "Painel", grupo: "gestao", render: () => <PainelTab /> },
  { value: "pendencias", label: "Pendências", grupo: "gestao", render: () => <PendenciasTab /> },
  { value: "novo", label: "Novo pedido", grupo: "ferramenta", render: () => <CadastroPedidoCompra vista="novo" /> },
  { value: "importar-pi", label: "Importar linhas da PI", grupo: "ferramenta", render: () => <ImportarPiPedidoTab /> },
  { value: "cadastro-pi", label: "Cadastro de produto (PI)", grupo: "ferramenta", render: () => <ImportarPI embutido /> },
  { value: "de-para", label: "De-para de fornecedor", grupo: "ferramenta", render: () => <DeParaFornecedor /> },
  { value: "rateio-nf", label: "Rateio de NF", grupo: "ferramenta", render: () => <RateioNfTab /> },
];

const gestao = ABAS.filter((a) => a.grupo === "gestao");
const ferramenta = ABAS.filter((a) => a.grupo === "ferramenta");

export default function ChegadaMercadoria() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  // Compatibilidade com links antigos: embarques/acompanhamento viraram visões
  // do Painel; recebimento-loja mora agora em Transferências Internas.
  useEffect(() => {
    const v = params.get("aba");
    if (v === "recebimento-loja") {
      navigate("/pedidos/transferencias?aba=receber", { replace: true });
      return;
    }
    if (v !== "embarques" && v !== "acompanhamento") return;
    const next = new URLSearchParams(params);
    next.set("aba", "painel");
    next.set("visao", v === "embarques" ? "embarque" : "pedido");
    setParams(next, { replace: true });
  }, [params, setParams, navigate]);
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
          {gestao.map((a) => (
            <TabsTrigger key={a.value} value={a.value}>
              {a.label}
            </TabsTrigger>
          ))}
          <span aria-hidden className="mx-2 h-5 w-px bg-border self-center" />
          {ferramenta.map((a) => (
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
