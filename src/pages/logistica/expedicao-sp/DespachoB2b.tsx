import { useState } from "react";
import { Truck } from "lucide-react";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FormDespacho } from "./FormDespacho";
import type { ModalEntrega } from "./tipos";

/**
 * Despacho do B2B expedido pelo Site SP: só em `faturado` (depois da NF), só
 * individual. O modal é o da embalagem (fixo); os campos seguem o modal —
 * Retirada pede "quem retirou" e fecha o pedido como entregue.
 */
interface Props {
  pedidoId: string;
  modalCodigo: string | null;
  modais: ModalEntrega[];
  medidas: string;
  nfRotulo: string | null;
  despachando: boolean;
  onDespachar: (modal: string, referencia: string | null, executor: string | null) => void;
  bloqueado?: boolean;
}

export function DespachoB2b({ pedidoId, modalCodigo, modais, medidas, nfRotulo, despachando, onDespachar, bloqueado = false }: Props) {
  const [aberto, setAberto] = useState(false);
  const nome = modais.find((m) => m.codigo === modalCodigo)?.nome ?? modalCodigo ?? "sem modal";

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">
            {medidas}
            {nfRotulo ? ` — ${nfRotulo}` : ""} — {nome} — pronto para despacho.
          </p>
          <BotaoGuardado
            slug="acao.expedicao_sp_operar"
            rotuloAcao="Despachar pedido B2B"
            onClick={() => setAberto(true)}
          >
            <Truck aria-hidden="true" />
            Despachar
          </BotaoGuardado>
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Despachar pedido B2B</DialogTitle>
            <DialogDescription>O pedido sai da Mesa pelo modal da embalagem.</DialogDescription>
          </DialogHeader>
          {aberto && (
            <FormDespacho
              pedidoId={pedidoId}
              modalCodigo={modalCodigo}
              modais={modais}
              despachando={despachando}
              bloqueado={bloqueado}
              onDespachar={(ref, exec) => {
                if (!modalCodigo) return;
                onDespachar(modalCodigo, ref, exec);
                setAberto(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
