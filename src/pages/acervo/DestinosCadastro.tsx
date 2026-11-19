import { useAbaUrl } from "@/hooks/useAbaUrl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProdutoAbas } from "@/components/produto/ProdutoAbas";
import { XpmCadastroPainel } from "@/components/acervo/XpmCadastroPainel";
import { ShopifyCadastroPainel } from "@/components/acervo/ShopifyCadastroPainel";
import { ShopifyAgrupamentos } from "@/components/acervo/ShopifyAgrupamentos";
import { BlingCardPainel } from "@/components/acervo/BlingCardPainel";
import { CadastroBlingSync } from "@/components/acervo/CadastroBlingSync";
import { BlocoSincronizacao, ROTINAS_CADASTRO_SHOPIFY } from "@/components/acervo/PainelSyncEstoque";

export default function DestinosCadastro() {
  const [aba, setAba] = useAbaUrl("bling");
  const [shopifySecao, setShopifySecao] = useAbaUrl("cadastro", undefined, "shopify_secao");

  return (
    <PageShell>
      <PageHeader
        titulo="Destinos de Cadastro"
        estado="Cadastra os produtos nos sistemas de destino (Bling, XPM e Shopify), a partir da matriz do SNCF."
      />

      <ProdutoAbas />

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="bling">Bling</TabsTrigger>
          <TabsTrigger value="xpm">XPM</TabsTrigger>
          <TabsTrigger value="shopify">Shopify</TabsTrigger>
        </TabsList>

        <TabsContent value="bling" className="mt-4 space-y-6">
          <CadastroBlingSync />
          <BlingCardPainel />
        </TabsContent>

        <TabsContent value="xpm" className="mt-4">
          <XpmCadastroPainel />
        </TabsContent>

        <TabsContent value="shopify" className="mt-4 space-y-4">
          <Tabs value={shopifySecao} onValueChange={setShopifySecao}>
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="cadastro">Fila de cadastro</TabsTrigger>
              <TabsTrigger value="agrupamentos">Agrupamentos (variações)</TabsTrigger>
            </TabsList>
            <TabsContent value="cadastro" forceMount className="space-y-4 data-[state=inactive]:hidden">
              <BlocoSincronizacao rotinas={ROTINAS_CADASTRO_SHOPIFY} />
              <ShopifyCadastroPainel />
            </TabsContent>
            <TabsContent value="agrupamentos"><ShopifyAgrupamentos /></TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
