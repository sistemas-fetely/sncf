import { useEffect, useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { ModalEntrega } from "./tipos";

/**
 * Despacho do B2B expedido pelo Site SP: só em `faturado` (depois da NF), só
 * individual (não entra no despacho em lote). Referência obrigatória — é o
 * CT-e / nº da coleta que acompanha a carga.
 */
interface Props {
  modais: ModalEntrega[];
  medidas: string;
  nfRotulo: string | null;
  despachando: boolean;
  onDespachar: (modal: string, referencia: string) => void;
}

const MODAL_PADRAO = "TRANSPORTADORA";

export function DespachoB2b({ modais, medidas, nfRotulo, despachando, onDespachar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [modal, setModal] = useState(MODAL_PADRAO);
  const [referencia, setReferencia] = useState("");

  useEffect(() => {
    if (aberto) setModal(MODAL_PADRAO);
  }, [aberto]);

  const opcoes = modais.filter((m) => !m.sem_despacho);
  const pode = modal !== "" && referencia.trim() !== "" && !despachando;

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">
            {medidas}
            {nfRotulo ? ` — ${nfRotulo}` : ""} — pronto para despacho.
          </p>
          <BotaoGuardado
            slug="acao.expedicao_sp_operar"
            rotuloAcao="Despachar pedido B2B"
            onClick={() => { setReferencia(""); setAberto(true); }}
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
            <DialogDescription>
              Informe a transportadora e a referência da coleta. O pedido sai da Mesa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="b2b-despacho-modal">Modal</Label>
              <Select value={modal} onValueChange={setModal}>
                <SelectTrigger id="b2b-despacho-modal">
                  <SelectValue placeholder="Escolher modal" />
                </SelectTrigger>
                <SelectContent>
                  {opcoes.map((m) => (
                    <SelectItem key={m.codigo} value={m.codigo}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b2b-despacho-ref">CT-e / nº da coleta / transportadora</Label>
              <Input
                id="b2b-despacho-ref"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Obrigatório"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={despachando}>
              Cancelar
            </Button>
            <Button
              disabled={!pode}
              onClick={() => { onDespachar(modal, referencia.trim()); setAberto(false); }}
            >
              {despachando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Truck aria-hidden="true" />}
              Despachar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
