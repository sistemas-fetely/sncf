import { FileText } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { AbaNotas } from "@/components/nfs-venda/AbaNotas";
import { AbaPedidosFiscais } from "@/components/nfs-venda/AbaPedidosFiscais";
import { AbaDivergencias } from "@/components/nfs-venda/AbaDivergencias";
import { usePedidosFiscais } from "@/components/nfs-venda/usePedidosFiscais";

export default function NfsVenda() {
  const [aba, setAba] = useAbaUrl("notas");
  const { data: pedidos = [] } = usePedidosFiscais();
  const divergencias = pedidos.filter((p) => p.divergencia != null).length;
  return <PageShell>
    <PageHeader titulo="NFs de Venda" icone={FileText} estado="Notas fiscais de venda emitidas e os pedidos fiscais que as originam · sincronização automática a cada 10 min" />
    <Tabs value={["notas", "pedidos", "divergencias"].includes(aba) ? aba : "notas"} onValueChange={setAba}>
      <TabsList><TabsTrigger value="notas">Notas</TabsTrigger><TabsTrigger value="pedidos">Pedidos Fiscais</TabsTrigger><TabsTrigger value="divergencias">Divergências{divergencias > 0 ? ` · ${divergencias}` : ""}</TabsTrigger></TabsList>
      <TabsContent value="notas" className="mt-4"><AbaNotas /></TabsContent>
      <TabsContent value="pedidos" className="mt-4"><AbaPedidosFiscais /></TabsContent>
      <TabsContent value="divergencias" className="mt-4"><AbaDivergencias /></TabsContent>
    </Tabs>
  </PageShell>;
}