/**
 * ENTRADAS A RECONHECER — trabalho de conciliação (Finanças).
 *
 * A visão de negócio do cliente (lista + detalhe) vive em /cliente e /cliente/:id.
 * Aqui só a fila de créditos bancários sem dono.
 */
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EntradasReconhecerTab } from "@/components/financeiro/EntradasReconhecerTab";

export default function ContaCliente() {
  return (
    <div className="space-y-4">
      <PageHeader titulo="Entradas a Reconhecer" icone={Inbox} />
      <EntradasReconhecerTab />
    </div>
  );
}
