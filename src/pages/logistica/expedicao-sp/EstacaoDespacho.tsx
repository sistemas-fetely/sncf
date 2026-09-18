import { useEffect, useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { ModalEntrega } from "./tipos";

/**
 * Estação 5 — Despacho. O modal já vem do evento `mesa_embalado` (é o que a
 * embalagem decidiu); trocar aqui é possível, mas é exceção, não fluxo.
 *
 * REFERÊNCIA: obrigatória para modal SEM rastreio automático (Lalamove, Motoboy)
 * — é ela que vira o `trackingInfo` do fulfillment no Shopify. A RPC valida por
 * `tem_rastreio_automatico`; a UI pede antes para o operador não levar EXCEPTION
 * na cara depois de fechar a caixa.
 */
interface Props {
  modais: ModalEntrega[];
  /** Modal registrado na embalagem — `metadata->>'modal'` do evento mesa_embalado. */
  modalEmbalado: string | null;
  despachando: boolean;
  onDespachar: (modal: string, referencia: string | null) => void;
}

export function EstacaoDespacho({ modais, modalEmbalado, despachando, onDespachar }: Props) {
  const [modal, setModal] = useState<string>(modalEmbalado ?? "");
  const [referencia, setReferencia] = useState("");

  useEffect(() => {
    if (modalEmbalado) setModal(modalEmbalado);
  }, [modalEmbalado]);

  const escolhido = modais.find((m) => m.codigo === modal) ?? null;
  const exigeReferencia = escolhido != null && !escolhido.tem_rastreio_automatico;
  const podeDespachar =
    modal !== "" && (!exigeReferencia || referencia.trim() !== "");

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mesa-sp-despacho-modal">Modal</Label>
            <Select value={modal} onValueChange={setModal}>
              <SelectTrigger id="mesa-sp-despacho-modal">
                <SelectValue placeholder="Escolher modal" />
              </SelectTrigger>
              <SelectContent>
                {modais.map((m) => (
                  <SelectItem key={m.codigo} value={m.codigo}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {exigeReferencia && (
            <div className="space-y-1.5">
              <Label htmlFor="mesa-sp-referencia">Referência do despacho</Label>
              <Input
                id="mesa-sp-referencia"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="ID da corrida (Lalamove) ou nome do portador"
              />
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {exigeReferencia
            ? "Sem rastreio automático: a referência é o que o cliente vai ver no e-mail do Shopify."
            : "Modal com rastreio automático: o código vem da varredura dos Correios, não daqui."}
        </p>

        <Button onClick={() => onDespachar(modal, referencia.trim() || null)} disabled={!podeDespachar || despachando}>
          {despachando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Truck aria-hidden="true" />}
          Despachar
        </Button>
      </CardContent>
    </Card>
  );
}
