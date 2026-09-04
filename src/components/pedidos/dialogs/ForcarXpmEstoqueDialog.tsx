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

function fmtFoto(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).replace(", ", " ");
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
  const foto = fmtFoto(fotoEm ?? itens[0]?.foto_em ?? null);

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
          <table className="w-full text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="font-normal py-1">SKU</th>
                <th className="font-normal py-1">Item</th>
                <th className="font-normal py-1 text-right">Pede</th>
                <th className="font-normal py-1 text-right">Tem</th>
                <th className="font-normal py-1 text-right">Falta</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it) => (
                <tr key={it.sku} className="border-t border-border">
                  <td className="py-1">{it.sku}</td>
                  <td className="py-1">{it.nome}</td>
                  <td className="py-1 text-right">{it.pedida}</td>
                  <td className="py-1 text-right">{it.disponivel}</td>
                  <td className="py-1 text-right text-destructive">{it.falta}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {foto && (
            <p className="text-xs text-muted-foreground">Posição da XPM de {foto}</p>
          )}

          {itens.filter((it) => !!it.compra_pedidos).map((it) => (
            <p key={`compra-${it.sku}`} className="text-xs text-muted-foreground tabular-nums">
              Compra aberta {it.compra_pedidos}: {it.compra_a_faturar ?? 0} un a faturar,{" "}
              {it.compra_em_transito ?? 0} un em trânsito — saldo de compra, não
              previsão de entrega.
            </p>
          ))}

          <p className="text-xs text-muted-foreground">
            Se o saldo realmente faltar, a XPM corta o item e pode cancelar o
            documento — e o cancelamento não volta pelo espelho, então o pedido
            fica parado no SNCF sem aviso.
          </p>

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
