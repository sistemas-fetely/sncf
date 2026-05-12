import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, Plus, ChevronDown, ChevronUp } from "lucide-react";
import type { ItemEdit } from "@/lib/compras/types";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

interface Props {
  items: ItemEdit[];
  onChange: (items: ItemEdit[]) => void;
  readOnly?: boolean;
}

export function ItensList({ items, onChange, readOnly }: Props) {
  const visiveis = items.filter((i) => i._action !== "delete");
  const total = visiveis.reduce(
    (s, i) => s + Number(i.quantidade || 0) * Number(i.valor_estimado_unitario || 0),
    0,
  );

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
          />
        ))}
      </div>

      {visiveis.length > 0 && (
        <div className="flex justify-end pt-2 border-t">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total estimado</div>
            <div className="text-xl font-semibold">{fmtBRL(total)}</div>
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
}: {
  item: ItemEdit;
  onChange: (patch: Partial<ItemEdit>) => void;
  onRemove: () => void;
  readOnly?: boolean;
  canRemove: boolean;
}) {
  const [showSpec, setShowSpec] = useState(!!item.especificacao_tecnica);
  const [urlInput, setUrlInput] = useState("");

  const subtotal = Number(item.quantidade || 0) * Number(item.valor_estimado_unitario || 0);

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
    <Card className="p-4 relative">
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
          aria-label="Remover item"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div className="space-y-3">
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
              min={0}
              step="0.0001"
              value={item.quantidade}
              onChange={(e) => onChange({ quantidade: parseFloat(e.target.value) || 0 })}
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
