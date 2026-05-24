import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, CornerDownRight, Trash2, Replace } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdicionarLinhaDropdown } from "./AdicionarLinhaDropdown";
import { SubstituirItemDialog } from "./SubstituirItemDialog";
import { InputMoedaBR } from "./InputMoedaBR";
import type {
  LinhaCompra,
  PedidoCompraItemRow,
  StatusLinha,
  TipoLinha,
} from "@/lib/compras/types";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const tipoBadge: Record<TipoLinha, { label: string; cls: string }> = {
  produto: { label: "Produto", cls: "bg-secondary text-secondary-foreground" },
  frete: {
    label: "Frete",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  servico: {
    label: "Serviço",
    cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
  extra: {
    label: "Extra",
    cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  },
  desconto: {
    label: "Desconto",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
};

const statusBadge: Record<StatusLinha, { label: string; cls: string }> = {
  comprada: {
    label: "Veio",
    cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  },
  nao_comprada: {
    label: "Faltou",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  substituida: {
    label: "Trocado",
    cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  },
};

interface Props {
  linhas: LinhaCompra[];
  onChange: (linhas: LinhaCompra[]) => void;
  pedidoItens: PedidoCompraItemRow[];
  readonly?: boolean;
}

function newLocalId() {
  return `l_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;
}

function recomputeLinha(
  l: LinhaCompra,
  pedidoItens: PedidoCompraItemRow[],
): LinhaCompra {
  let descricao = l.descricao_livre || "";
  if (!descricao && l.pedido_item_id) {
    const it = pedidoItens.find((p) => p.id === l.pedido_item_id);
    if (it) descricao = it.descricao;
  }
  if (!descricao && l.substitui_pedido_item_id) {
    const it = pedidoItens.find((p) => p.id === l.substitui_pedido_item_id);
    if (it) descricao = `Substituto de: ${it.descricao}`;
  }
  if (!descricao) descricao = tipoBadge[l.tipo_linha].label;
  return {
    ...l,
    _descricao_exibicao: descricao,
    _valor_total:
      Number(l.quantidade_real || 0) * Number(l.valor_unitario_real || 0),
  };
}

export function LinhasCompraEditor({ linhas, onChange, pedidoItens, readonly }: Props) {
  const [substituirOpen, setSubstituirOpen] = useState(false);
  const [substituirLocalId, setSubstituirLocalId] = useState<string | null>(null);
  const [substituirItemOriginal, setSubstituirItemOriginal] =
    useState<PedidoCompraItemRow | null>(null);
  const [revertOnCancel, setRevertOnCancel] = useState<{ id: string; prevStatus: StatusLinha } | null>(
    null,
  );

  const total = useMemo(
    () =>
      linhas
        .filter((l) => l.status_linha === "comprada")
        .reduce(
          (s, l) =>
            l.tipo_linha === "desconto" ? s - l._valor_total : s + l._valor_total,
          0,
        ),
    [linhas],
  );

  const updateLinha = (id: string, patch: Partial<LinhaCompra>) => {
    onChange(
      linhas.map((l) =>
        l._local_id === id ? recomputeLinha({ ...l, ...patch }, pedidoItens) : l,
      ),
    );
  };

  const removeLinha = (id: string) => {
    onChange(linhas.filter((l) => l._local_id !== id));
  };

  const handleAdd = (tipo: TipoLinha) => {
    const novaQtd = tipo === "frete" || tipo === "extra" ? 1 : 1;
    const nova: LinhaCompra = recomputeLinha(
      {
        _local_id: newLocalId(),
        tipo_linha: tipo,
        status_linha: "comprada",
        pedido_item_id: null,
        substitui_pedido_item_id: null,
        descricao_livre: "",
        quantidade_real: novaQtd,
        valor_unitario_real: 0,
        _descricao_exibicao: "",
        _valor_total: 0,
      },
      pedidoItens,
    );
    onChange([...linhas, nova]);
  };

  const cicloStatus = (linha: LinhaCompra) => {
    if (linha.status_linha === "comprada") {
      // → nao_comprada: zera
      updateLinha(linha._local_id, {
        status_linha: "nao_comprada",
        quantidade_real: 0,
        valor_unitario_real: 0,
      });
    } else if (linha.status_linha === "nao_comprada") {
      // → substituida: abre dialog. Se cancelar, reverte pra nao_comprada.
      if (!linha.pedido_item_id) {
        // sem item de pedido associado, vai direto pra comprada
        const it = linha.substitui_pedido_item_id
          ? pedidoItens.find((p) => p.id === linha.substitui_pedido_item_id)
          : null;
        updateLinha(linha._local_id, {
          status_linha: "comprada",
          quantidade_real: it ? Number(it.quantidade) : 1,
          valor_unitario_real: it ? Number(it.valor_estimado_unitario) : 0,
        });
        return;
      }
      const itOriginal = pedidoItens.find((p) => p.id === linha.pedido_item_id) || null;
      setSubstituirItemOriginal(itOriginal);
      setSubstituirLocalId(linha._local_id);
      setRevertOnCancel({ id: linha._local_id, prevStatus: "nao_comprada" });
      setSubstituirOpen(true);
    } else {
      // substituida → comprada: restaura
      const it = linha.pedido_item_id
        ? pedidoItens.find((p) => p.id === linha.pedido_item_id)
        : null;
      updateLinha(linha._local_id, {
        status_linha: "comprada",
        quantidade_real: it ? Number(it.quantidade) : linha.quantidade_real || 1,
        valor_unitario_real: it ? Number(it.valor_estimado_unitario) : linha.valor_unitario_real,
      });
    }
  };

  const handleConfirmarSubstituicao = (sub: {
    descricao_livre: string;
    quantidade_real: number;
    valor_unitario_real: number;
  }) => {
    if (!substituirLocalId) return;
    const original = linhas.find((l) => l._local_id === substituirLocalId);
    if (!original) return;

    // Marca a linha original como substituida (preserva pedido_item_id)
    const novaLinhas: LinhaCompra[] = [];
    for (const l of linhas) {
      if (l._local_id === substituirLocalId) {
        novaLinhas.push(
          recomputeLinha(
            {
              ...l,
              status_linha: "substituida",
              quantidade_real: 0,
              valor_unitario_real: 0,
            },
            pedidoItens,
          ),
        );
        // Linha nova de substituto, logo abaixo
        novaLinhas.push(
          recomputeLinha(
            {
              _local_id: newLocalId(),
              tipo_linha: "produto",
              status_linha: "comprada",
              pedido_item_id: null,
              substitui_pedido_item_id: l.pedido_item_id,
              descricao_livre: sub.descricao_livre,
              quantidade_real: sub.quantidade_real,
              valor_unitario_real: sub.valor_unitario_real,
              _descricao_exibicao: "",
              _valor_total: 0,
            },
            pedidoItens,
          ),
        );
      } else {
        novaLinhas.push(l);
      }
    }
    onChange(novaLinhas);
    setRevertOnCancel(null);
    setSubstituirLocalId(null);
    setSubstituirItemOriginal(null);
  };

  const handleSubstituirCancel = () => {
    // Mantém status nao_comprada (já estava)
    setRevertOnCancel(null);
    setSubstituirLocalId(null);
    setSubstituirItemOriginal(null);
  };

  const abrirSubstituirDireto = (linha: LinhaCompra) => {
    if (!linha.pedido_item_id) return;
    const itOriginal = pedidoItens.find((p) => p.id === linha.pedido_item_id) || null;
    setSubstituirItemOriginal(itOriginal);
    setSubstituirLocalId(linha._local_id);
    setRevertOnCancel({ id: linha._local_id, prevStatus: linha.status_linha });
    setSubstituirOpen(true);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Linhas da compra</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Marque o que aconteceu com cada item do pedido na hora da compra. Click no badge da coluna "Resultado" pra alternar entre Veio / Faltou / Trocado.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[90px]">Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-[110px]">Qtd</TableHead>
              <TableHead className="w-[140px]">Valor unit.</TableHead>
              <TableHead className="w-[110px] text-right">Subtotal</TableHead>
              <TableHead className="w-[120px] text-center">Resultado</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                  Nenhuma linha. Use "Adicionar linha" abaixo.
                </TableCell>
              </TableRow>
            )}
            {linhas.map((l) => {
              const isSubstituto = !!l.substitui_pedido_item_id;
              const isSubstituida = l.status_linha === "substituida";
              const isNaoComprada = l.status_linha === "nao_comprada";
              const isComprada = l.status_linha === "comprada";
              const ehProdutoOuServico =
                l.tipo_linha === "produto" || l.tipo_linha === "servico";
              const qtdInvalid =
                isComprada && ehProdutoOuServico && !(l.quantidade_real > 0);
              const valorInvalid = isComprada && !(l.valor_unitario_real > 0);
              const linhaInativaCls = isNaoComprada
                ? "opacity-60"
                : isSubstituida
                  ? "opacity-60"
                  : "";
              const isLinhaPedido = !!l.pedido_item_id && l.tipo_linha === "produto";
              const podeEditarDescricao =
                !readonly && (l.tipo_linha !== "produto" || !l.pedido_item_id);

              return (
                <TableRow key={l._local_id} className={cn(linhaInativaCls)}>
                  <TableCell>
                    <Badge className={cn("text-[10px]", tipoBadge[l.tipo_linha].cls)}>
                      {tipoBadge[l.tipo_linha].label}
                    </Badge>
                    {isSubstituto && (
                      <Badge variant="outline" className="ml-1 text-[9px]">
                        Substituto
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className={cn(isSubstituida && "line-through")}>
                    <div
                      className={cn(
                        "flex items-start gap-1",
                        isSubstituto && "ml-6",
                      )}
                    >
                      {isSubstituto && (
                        <CornerDownRight className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />
                      )}
                      {podeEditarDescricao ? (
                        <Input
                          value={l.descricao_livre || ""}
                          onChange={(e) =>
                            updateLinha(l._local_id, { descricao_livre: e.target.value })
                          }
                          placeholder={tipoBadge[l.tipo_linha].label}
                          className="h-8"
                          disabled={readonly || isSubstituida || isNaoComprada}
                        />
                      ) : (
                        <span className="text-sm">{l._descricao_exibicao}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={l.quantidade_real}
                      onChange={(e) =>
                        updateLinha(l._local_id, {
                          quantidade_real: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      disabled={readonly || !isComprada}
                      className={cn("h-8 w-full text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none", qtdInvalid && "border-destructive")}
                    />
                  </TableCell>
                  <TableCell>
                    <InputMoedaBR
                      value={l.valor_unitario_real}
                      onChange={(v) => updateLinha(l._local_id, { valor_unitario_real: v })}
                      disabled={readonly || !isComprada}
                      invalid={valorInvalid}
                    />
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {fmtBRL(l._valor_total)}
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      type="button"
                      onClick={() => !readonly && cicloStatus(l)}
                      disabled={readonly}
                      className={cn(
                        "cursor-pointer hover:opacity-80 transition-opacity",
                        readonly && "cursor-default",
                      )}
                    >
                      <Badge className={cn("text-[10px]", statusBadge[l.status_linha].cls)}>
                        {statusBadge[l.status_linha].label}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={readonly}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isLinhaPedido && !isSubstituida && (
                          <DropdownMenuItem onClick={() => abrirSubstituirDireto(l)}>
                            <Replace className="h-4 w-4 mr-2" />
                            Substituir
                          </DropdownMenuItem>
                        )}
                        {!isLinhaPedido && (
                          <DropdownMenuItem
                            onClick={() => removeLinha(l._local_id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remover
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between mt-4">
          <AdicionarLinhaDropdown onAdd={handleAdd} disabled={readonly} />
          <div className="text-sm">
            <span className="text-muted-foreground">Total: </span>
            <span className="text-lg font-bold">{fmtBRL(total)}</span>
          </div>
        </div>
      </CardContent>

      <SubstituirItemDialog
        open={substituirOpen}
        onOpenChange={setSubstituirOpen}
        itemOriginal={substituirItemOriginal}
        onConfirm={handleConfirmarSubstituicao}
        onCancel={handleSubstituirCancel}
      />
    </Card>
  );
}
