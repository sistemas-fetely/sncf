import { useAbaUrl } from "@/hooks/useAbaUrl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { XpmCadastroPainel } from "@/components/acervo/XpmCadastroPainel";
import { ShopifyCadastroPainel } from "@/components/acervo/ShopifyCadastroPainel";
import { BlingCardPainel } from "@/components/acervo/BlingCardPainel";

export default function DestinosCadastro() {
  const [aba, setAba] = useAbaUrl("bling");

  return (
    <PageShell>
      <PageHeader
        titulo="Destinos de Cadastro"
        estado="Cadastra os produtos nos sistemas de destino (Bling, XPM e Shopify), a partir da matriz do SNCF."
      />

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="bling">Bling</TabsTrigger>
          <TabsTrigger value="xpm">XPM</TabsTrigger>
          <TabsTrigger value="shopify">Shopify</TabsTrigger>
        </TabsList>

        <TabsContent value="bling" className="mt-4">
          <BlingCardPainel />
        </TabsContent>

        <TabsContent value="xpm" className="mt-4">
          <XpmCadastroPainel />
        </TabsContent>

        <TabsContent value="shopify" className="mt-4">
          <ShopifyCadastroPainel />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
