import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Selo } from "@/components/ui/selo";
import { Loader2, ShieldAlert } from "lucide-react";
import { useEmpurrarXpm } from "@/hooks/pedidos/useEmpurrarXpm";
import { DividirRemessaDialog } from "@/components/pedidos/dialogs/DividirRemessaDialog";
import { BlocoFaltaEstoqueXpm } from "@/components/pedidos/BlocoFaltaEstoqueXpm";
import type { ItemPreviaEstoqueXpm } from "@/hooks/pedidos/usePreviaEstoqueXpm";

const MIN_MOTIVO = 15;

interface ItemRemessaSplit {
  descricao?: string;
  sku?: string;
  quantidade: number;
  valor_unitario: number;
}

interface Props {
  pedidoId: string;
  idExterno: string;
  itens: ItemPreviaEstoqueXpm[];
  fotoEm: string | null;
  /** Split existente desta página — caminho PADRÃO, não construímos outro. */
  split?: { remessaId: string; codigo: string; itens: ItemRemessaSplit[] };
  /** Sem permissão o gatilho aparece DESABILITADO com o motivo. */
  podeForcar?: boolean;
}

/**
 * OVERRIDE-TEM-NOME: furar SÓ o bloqueio de estoque (`acao.forcar_xpm_estoque`).
 * Dividir o pedido vem primeiro; forçar é a saída de exceção.
 */
export function ForcarXpmEstoqueDialog({
  pedidoId, idExterno, itens, fotoEm, split, podeForcar = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const empurrar = useEmpurrarXpm();

  const valido = motivo.trim().length >= MIN_MOTIVO;


  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setMotivo(""); }}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          disabled={!podeForcar}
          title={podeForcar ? undefined : "Ação de gerente"}
          className="w-full gap-1.5 whitespace-normal h-auto text-xs leading-tight py-2 text-muted-foreground"
        >
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          {podeForcar
            ? "Falta estoque — ver opções"
            : "Falta estoque — ver opções (Ação de gerente)"}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Falta estoque na XPM para {idExterno}</DialogTitle>
          <DialogDescription>
            O que a XPM tem hoje não cobre o pedido. Escolha entre mandar agora
            só o que existe ou forçar o envio inteiro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <BlocoFaltaEstoqueXpm itens={itens} fotoEm={fotoEm} />


          <p className="text-xs text-muted-foreground">
            Divida quando o item realmente falta; force quando a foto está velha
            ou a mercadoria chega antes do separador.
          </p>

          {split && (
            <DividirRemessaDialog
              remessaId={split.remessaId}
              pedidoId={pedidoId}
              codigo={split.codigo}
              itens={split.itens}
              triggerLabel="Dividir pedido (split) — mandar só o que existe"
              triggerTitle={`Dividir ${split.codigo} em duas`}
              triggerFullWidth
            />
          )}

          <div className="space-y-2 pt-1">
            <Selo estado="warning">Ação de exceção</Selo>
            <Label htmlFor="motivo-forcar-estoque" className="text-xs">
              Motivo (fica registrado no histórico do pedido)
            </Label>
            <Textarea
              id="motivo-forcar-estoque"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ex.: item chega esta semana pela MIRA-2026-001, adiantando a separação dos outros itens"
            />
            <p className="text-xs text-muted-foreground">
              {motivo.trim().length}/{MIN_MOTIVO} caracteres mínimos
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!valido || empurrar.isPending}
            onClick={async () => {
              try {
                await empurrar.mutateAsync({
                  pedido_id: pedidoId,
                  forcar: ["estoque"],
                  motivo: motivo.trim(),
                });
                setOpen(false);
                setMotivo("");
              } catch { /* toast de erro já sai do hook */ }
            }}
          >
            {empurrar.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Forçando…</>
            ) : (
              "Forçar mesmo assim"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
