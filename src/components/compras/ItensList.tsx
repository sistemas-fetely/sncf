import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { X, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ItemEdit } from "@/lib/compras/types";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

function formatMoedaBR(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMoedaBR(raw: string): number {
  const clean = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  return parseFloat(clean) || 0;
}

function InputMoedaBR({
  value,
  onChange,
  disabled,
  ariaInvalid,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  ariaInvalid?: boolean;
}) {
  const [display, setDisplay] = useState(() => (value > 0 ? formatMoedaBR(value) : ""));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) setDisplay(value > 0 ? formatMoedaBR(value) : "");
  }, [value, isFocused]);

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
        R$
      </span>
      <Input
        type="text"
        inputMode="decimal"
        value={display}
        onChange={(e) => {
          setDisplay(e.target.value);
          onChange(parseMoedaBR(e.target.value));
        }}
        onFocus={() => {
          setIsFocused(true);
          if (value > 0) setDisplay(value.toFixed(2).replace(".", ","));
        }}
        onBlur={() => {
          setIsFocused(false);
          setDisplay(value > 0 ? formatMoedaBR(value) : "");
        }}
        disabled={disabled}
        placeholder="0,00"
        className="pl-10"
        aria-invalid={ariaInvalid}
      />
    </div>
  );
}

const itemStatusConfig: Record<string, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-muted text-muted-foreground" },
  comprado: { label: "Comprado", className: "bg-success/15 text-success" },
  cancelado: { label: "Cancelado", className: "bg-destructive/15 text-destructive" },
};

interface Props {
  items: ItemEdit[];
  onChange: (items: ItemEdit[]) => void;
  readOnly?: boolean;
  showItemStatus?: boolean;
}

export function ItensList({ items, onChange, readOnly, showItemStatus }: Props) {
  const visiveis = items.filter((i) => i._action !== "delete");
  const temCancelados = visiveis.some((i) => i.status === "cancelado");
  const totalOriginal = visiveis.reduce(
    (s, i) => s + Number(i.quantidade || 0) * Number(i.valor_estimado_unitario || 0),
    0,
  );
  const totalEfetivo = visiveis
    .filter((i) => i.status !== "cancelado")
    .reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_estimado_unitario || 0), 0);

  const updateAt = (idx: number, patch: Partial<ItemEdit>) => {
    const visIdx = items.indexOf(visiveis[idx]);
    const next = [...items];
    const cur = next[visIdx];
    const action = cur._action === "create" ? "create" : "update";
    next[visIdx] = { ...cur, ...patch, _action: action };
    onChange(next);
  };

  const addItem = () => {
    onChange([
      ...items,
      {
        descricao: "",
        quantidade: 1,
        valor_estimado_unitario: 0,
        urls: [],
        especificacao_tecnica: "",
        ordem: visiveis.length,
        _action: "create",
      },
    ]);
  };

  const removeAt = (idx: number) => {
    const visIdx = items.indexOf(visiveis[idx]);
    const next = [...items];
    const cur = next[visIdx];
    if (cur._action === "create") {
      next.splice(visIdx, 1);
    } else {
      next[visIdx] = { ...cur, _action: "delete" };
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Itens do pedido</h3>
          <Badge variant="secondary">{visiveis.length} {visiveis.length === 1 ? "item" : "itens"}</Badge>
        </div>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar item
          </Button>
        )}
      </div>

      {visiveis.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
          Nenhum item adicionado
        </p>
      )}

      <div className="space-y-3">
        {visiveis.map((it, idx) => (
          <ItemCard
            key={idx}
            item={it}
            onChange={(patch) => updateAt(idx, patch)}
            onRemove={() => removeAt(idx)}
            readOnly={readOnly}
            canRemove={visiveis.length > 1 && !readOnly}
            showStatus={showItemStatus}
          />
        ))}
      </div>

      {visiveis.length > 0 && (
        <div className="flex justify-end pt-2 border-t">
          <div className="text-right space-y-1">
            {temCancelados && showItemStatus ? (
              <>
                <div>
                  <div className="text-xs text-muted-foreground">Total estimado original</div>
                  <div className="text-sm line-through text-muted-foreground">{fmtBRL(totalOriginal)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total efetivo (sem cancelados)</div>
                  <div className="text-xl font-semibold">{fmtBRL(totalEfetivo)}</div>
                </div>
              </>
            ) : (
              <>
                <div className="text-xs text-muted-foreground">Total estimado</div>
                <div className="text-xl font-semibold">{fmtBRL(totalOriginal)}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ItemCard({
  item,
  onChange,
  onRemove,
  readOnly,
  canRemove,
  showStatus,
}: {
  item: ItemEdit;
  onChange: (patch: Partial<ItemEdit>) => void;
  onRemove: () => void;
  readOnly?: boolean;
  canRemove: boolean;
  showStatus?: boolean;
}) {
  const [showSpec, setShowSpec] = useState(!!item.especificacao_tecnica);
  const [urlInput, setUrlInput] = useState("");

  const subtotal = Number(item.quantidade || 0) * Number(item.valor_estimado_unitario || 0);
  const status = item.status;
  const statusCfg = status ? itemStatusConfig[status] : null;
  const isCancelado = status === "cancelado";

  const addUrl = () => {
    const v = urlInput.trim();
    if (!v) return;
    onChange({ urls: [...(item.urls || []), v] });
    setUrlInput("");
  };

  const removeUrl = (i: number) => {
    const next = [...(item.urls || [])];
    next.splice(i, 1);
    onChange({ urls: next });
  };

  return (
    <Card className={cn("p-4 relative", isCancelado && showStatus && "opacity-70")}>
      {showStatus && statusCfg && (
        <div className="absolute top-2 right-2">
          {isCancelado && item.cancelamento_motivo ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className={cn("border-0 cursor-help", statusCfg.className)}>
                    {statusCfg.label}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">{item.cancelamento_motivo}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Badge className={cn("border-0", statusCfg.className)}>{statusCfg.label}</Badge>
          )}
        </div>
      )}
      {canRemove && !showStatus && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
          aria-label="Remover item"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div className={cn("space-y-3", showStatus && statusCfg && "pr-24")}>
        <div>
          <Label>Descrição *</Label>
          <Input
            value={item.descricao}
            onChange={(e) => onChange({ descricao: e.target.value })}
            placeholder="O que precisa ser comprado"
            disabled={readOnly}
            aria-invalid={!item.descricao.trim()}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Quantidade *</Label>
            <Input
              type="number"
              min={1}
              step="1"
              value={item.quantidade}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                onChange({ quantidade: Math.max(1, isNaN(v) ? 1 : v) });
              }}
              disabled={readOnly}
              aria-invalid={!(item.quantidade > 0)}
            />
          </div>
          <div>
            <Label>Valor unitário R$ *</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={item.valor_estimado_unitario}
              onChange={(e) =>
                onChange({ valor_estimado_unitario: parseFloat(e.target.value) || 0 })
              }
              disabled={readOnly}
              aria-invalid={!(item.valor_estimado_unitario > 0)}
            />
          </div>
          <div className="flex flex-col justify-end pb-2">
            <div className="text-xs text-muted-foreground">Subtotal</div>
            <div className="text-sm font-semibold">{fmtBRL(subtotal)}</div>
          </div>
        </div>

        <div>
          <Label className="text-xs">URLs de referência (opcional)</Label>
          <div className="flex flex-wrap gap-1 mb-1">
            {(item.urls || []).map((u, i) => (
              <Badge key={i} variant="secondary" className="gap-1">
                <a href={u} target="_blank" rel="noreferrer" className="truncate max-w-[180px]">
                  {u}
                </a>
                {!readOnly && (
                  <button type="button" onClick={() => removeUrl(i)} aria-label="Remover URL">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
          {!readOnly && (
            <div className="flex gap-2">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addUrl();
                  }
                }}
                placeholder="https://..."
              />
              <Button type="button" variant="outline" size="sm" onClick={addUrl}>
                + URL
              </Button>
            </div>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowSpec(!showSpec)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {showSpec ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showSpec ? "Ocultar especificação" : "Adicionar especificação técnica"}
          </button>
          {showSpec && (
            <Textarea
              className="mt-1"
              value={item.especificacao_tecnica}
              onChange={(e) => onChange({ especificacao_tecnica: e.target.value })}
              placeholder="Detalhes técnicos, modelo, cor, marca..."
              disabled={readOnly}
              rows={3}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
