import { FileText } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { AbaNotas } from "@/components/nfs-venda/AbaNotas";
import { AbaPedidosFiscais } from "@/components/nfs-venda/AbaPedidosFiscais";

export default function NfsVenda() {
  const [aba, setAba] = useAbaUrl("notas");
  return <PageShell>
    <PageHeader titulo="NFs de Venda" icone={FileText} estado="Notas fiscais de venda emitidas e os pedidos fiscais que as originam · sincronização automática a cada 10 min" />
    <Tabs value={aba === "pedidos" ? "pedidos" : "notas"} onValueChange={setAba}>
      <TabsList><TabsTrigger value="notas">Notas</TabsTrigger><TabsTrigger value="pedidos">Pedidos Fiscais</TabsTrigger></TabsList>
      <TabsContent value="notas" className="mt-4"><AbaNotas /></TabsContent>
      <TabsContent value="pedidos" className="mt-4"><AbaPedidosFiscais /></TabsContent>
    </Tabs>
  </PageShell>;
}