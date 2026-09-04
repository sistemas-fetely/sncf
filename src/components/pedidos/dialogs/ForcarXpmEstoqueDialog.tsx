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
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { DividirRemessaDialog } from "@/components/pedidos/dialogs/DividirRemessaDialog";
import { BlocoFaltaEstoqueXpm } from "@/components/pedidos/BlocoFaltaEstoqueXpm";
import type { PreviaEstoqueXpm } from "@/hooks/pedidos/usePreviaEstoqueXpm";
import {
  placeholderMotivoEstoque, rotuloAlcadaNivel, rotuloBotaoOverrideEstoque,
} from "@/lib/pedidos/xpm";

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
  /** Veredito cruzado das duas leituras — quem manda no override e na alçada. */
  previa: PreviaEstoqueXpm;
  /** Split existente desta página — caminho PADRÃO, não construímos outro. */
  split?: { remessaId: string; codigo: string; itens: ItemRemessaSplit[] };
}

/**
 * OVERRIDE-TEM-NOME: o código e a permissão do override vêm do veredito
 * (`estoque` = falta real, nível 4 · `estoque_divergente` = divergência, nível 3).
 * Em falta real, dividir o pedido vem primeiro; em fila disputada a peça existe,
 * então o split perde o destaque.
 */
export function ForcarXpmEstoqueDialog({ pedidoId, idExterno, previa, split }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const empurrar = useEmpurrarXpm();
  const { permitido: podeForcar } = usePermissaoAcaoOuSuperAdmin(previa.permissao_slug ?? "");

  const veredito = previa.veredito;
  const overrideCodigo = previa.override_codigo;
  const motivoAlcada = rotuloAlcadaNivel(previa.nivel_ref);
  const faltaReal = veredito === "falta_real";
  const valido = motivo.trim().length >= MIN_MOTIVO;

  // Sem código de override o banco não aceita furar: não oferecemos o caminho.
  if (!overrideCodigo) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setMotivo(""); }}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="w-full gap-1.5 whitespace-normal h-auto text-xs leading-tight py-2 text-muted-foreground"
        >
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          {previa.veredito_rotulo
            ? `${previa.veredito_rotulo} — ver opções`
            : "Falta estoque — ver opções"}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Estoque não cobre {idExterno}</DialogTitle>
          <DialogDescription>
            {previa.veredito_rotulo ?? "As duas leituras de estoque não cobrem o pedido."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <BlocoFaltaEstoqueXpm itens={previa.itens} fotoEm={previa.foto_em} />

          {faltaReal ? (
            <p className="text-xs text-muted-foreground">
              Divida quando o item realmente falta; force quando a foto está velha
              ou a mercadoria chega antes do separador.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              A peça existe — a decisão aqui é de prioridade, não de saldo.
            </p>
          )}

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
            {!podeForcar && (
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {motivoAlcada}.
              </p>
            )}
            <Label htmlFor="motivo-forcar-estoque" className="text-xs">
              {veredito === "fila_disputada"
                ? "Motivo da prioridade (fica registrado no histórico dos pedidos)"
                : "Motivo (fica registrado no histórico do pedido)"}
            </Label>
            <Textarea
              id="motivo-forcar-estoque"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder={placeholderMotivoEstoque(veredito)}
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
            variant="secondary"
            disabled={!podeForcar || !valido || empurrar.isPending}
            title={podeForcar ? undefined : motivoAlcada}
            onClick={async () => {
              try {
                await empurrar.mutateAsync({
                  pedido_id: pedidoId,
                  forcar: [overrideCodigo],
                  motivo: motivo.trim(),
                });
                setOpen(false);
                setMotivo("");
              } catch { /* toast de erro já sai do hook */ }
            }}
          >
            {empurrar.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Enviando…</>
            ) : (
              rotuloBotaoOverrideEstoque(veredito)
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
