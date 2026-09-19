import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { CentroB2c, PedidoB2cRow } from "@/hooks/vendas/useB2c";

/**
 * ENTRADA-B2C-POR-FASES — SISTEMA SUGERE / HUMANO DECIDE.
 * A tag CD-SP do Shopify e a regra de CEP apenas sugerem; quem grava o destino
 * é o operador. Divergir da sugestão pede confirmação, nunca bloqueio.
 */

/** 'XPM-SC' → 'SC' · 'SITE-SP' → 'SP'. Sem lista fixa: lê o próprio código. */
export function abreviarCd(codigo: string | null | undefined, nome?: string | null): string {
  if (codigo) {
    const partes = codigo.split(/[-_/\s]/).filter(Boolean);
    const ultimo = partes[partes.length - 1];
    if (ultimo && ultimo.length <= 3) return ultimo.toUpperCase();
    return codigo;
  }
  return nome?.trim() || "—";
}

/** Nome curto para o toggle: "XPM-SC" · "Site SP" vem do nome da tabela. */
export function nomeCurtoCd(c: CentroB2c): string {
  return c.nome?.trim() || c.codigo;
}

interface CelulaProps {
  pedido: PedidoB2cRow;
  centros: CentroB2c[];
  processando: boolean;
  onEscolher: (pedido: PedidoB2cRow, centro: CentroB2c) => void;
}

/** Célula de "Próxima ação" para pedido parado aguardando o destino. */
export function EscolhaCdCelula({ pedido, centros, processando, onEscolher }: CelulaProps) {
  const sugerido = pedido.cd_sugerido;
  const sugeridoCentro = centros.find((c) => c.codigo === sugerido);
  const veioDaTag = !!pedido.tag_shopify;

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">
        {sugeridoCentro
          ? `Sugerido: ${nomeCurtoCd(sugeridoCentro)}${veioDaTag ? " (tag)" : ""}`
          : "Escolha o CD para liberar a descida"}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {centros.map((c) => {
          const ehSugerido = c.codigo === sugerido;
          return (
            <Button
              key={c.codigo}
              type="button"
              size="sm"
              variant={ehSugerido ? "default" : "outline"}
              disabled={processando}
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onEscolher(pedido, c);
              }}
            >
              {processando && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {nomeCurtoCd(c)}
            </Button>
          );
        })}
      </div>
      {pedido.divergencia_cep_tag && (
        <div className="text-[11px] text-warning-strong">tag e CEP discordam</div>
      )}
      {Number(pedido.horas_aguardando_cd ?? 0) > 2 && (
        <div className="text-[11px] text-warning-strong">
          há {Math.floor(Number(pedido.horas_aguardando_cd))}h sem CD
        </div>
      )}
    </div>
  );
}

interface CelulaCdProps {
  pedido: PedidoB2cRow;
}

/** Coluna CD — mostra o CD efetivo, com o tom apagado quando é inferido. */
export function CelulaCdEfetivo({ pedido }: CelulaCdProps) {
  const sigla = abreviarCd(pedido.cd_efetivo_codigo, pedido.cd_efetivo_nome);
  const inferido = pedido.cd_efetivo_fonte === "historico";

  if (!pedido.cd_efetivo_codigo && !pedido.cd_efetivo_nome) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="flex items-center gap-1">
      {inferido ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs text-muted-foreground/60">{sigla}</span>
          </TooltipTrigger>
          <TooltipContent>Inferido: só a XPM operou até 19/09/2026</TooltipContent>
        </Tooltip>
      ) : (
        <span className="text-xs">{sigla}</span>
      )}
      {pedido.divergencia_fiscal && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            NF saiu por CNPJ diferente do CD escolhido — a esteira segue a NF
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

interface BarraProps {
  qtd: number;
  centros: CentroB2c[];
  processando: boolean;
  onEnviar: (centro: CentroB2c) => void;
  onLimpar: () => void;
}

/** Barra de ação em lote para os pedidos marcados. */
export function BarraLoteCd({ qtd, centros, processando, onEnviar, onLimpar }: BarraProps) {
  if (qtd === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <span className="text-xs">
        {qtd} pedido{qtd !== 1 ? "s" : ""} selecionado{qtd !== 1 ? "s" : ""}
      </span>
      {centros.map((c) => (
        <Button
          key={c.codigo}
          type="button"
          size="sm"
          variant="outline"
          disabled={processando}
          className="h-7 px-2 text-xs"
          onClick={() => onEnviar(c)}
        >
          {processando && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Enviar {qtd} pedido{qtd !== 1 ? "s" : ""} para {nomeCurtoCd(c)}
        </Button>
      ))}
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onLimpar}>
        Limpar seleção
      </Button>
    </div>
  );
}

interface ConfirmaProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sugeridoNome: string | null;
  escolhidoNome: string | null;
  onConfirmar: () => void;
}

/** Divergiu da sugestão: confirma, não bloqueia. */
export function ConfirmaCdDivergente({
  open,
  onOpenChange,
  sugeridoNome,
  escolhidoNome,
  onConfirmar,
}: ConfirmaProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar {escolhidoNome ?? "o CD escolhido"}?</AlertDialogTitle>
          <AlertDialogDescription>
            A sugestão é {sugeridoNome ?? "outro CD"}. A escolha do humano vale — confirme para
            liberar a descida ao Bling.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmar}>Confirmar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface ToggleProps {
  centros: CentroB2c[];
  valor: string;
  onChange: (v: string) => void;
}

/** Toggle Total / CD — filtra a tela inteira por cd_efetivo_codigo. */
export function ToggleCdB2c({ centros, valor, onChange }: ToggleProps) {
  const opcoes = [{ codigo: "todos", rotulo: "Total" }].concat(
    centros.map((c) => ({ codigo: c.codigo, rotulo: nomeCurtoCd(c) })),
  );
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-1">
      {opcoes.map((o) => (
        <button
          key={o.codigo}
          type="button"
          onClick={() => onChange(o.codigo)}
          className={cn(
            "rounded px-3 py-1 text-xs font-medium transition-colors",
            valor === o.codigo
              ? "bg-gold-soft text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}
