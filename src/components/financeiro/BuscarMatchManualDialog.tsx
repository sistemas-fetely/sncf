import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Check } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

interface Movimentacao {
  id: string;
  data_transacao: string;
  descricao: string;
  valor: number;
}

interface ContaParaMatch {
  id: string;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  fornecedor_cliente: string | null;
  nf_numero: string | null;
  parceiros_comerciais?: { razao_social: string | null } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  movimentacao: Movimentacao | null;
  contas: ContaParaMatch[];
  onMatch: (contaId: string) => void;
}

export function BuscarMatchManualDialog({
  open,
  onOpenChange,
  movimentacao,
  contas,
  onMatch,
}: Props) {
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    if (!busca.trim()) {
      // Sem busca, ordena por proximidade de valor à movimentação
      if (!movimentacao) return contas.slice(0, 50);
      const valorMov = Math.abs(movimentacao.valor);
      return contas
        .slice()
        .sort((a, b) => {
          const da = Math.abs(Math.abs(a.valor) - valorMov);
          const db = Math.abs(Math.abs(b.valor) - valorMov);
          return da - db;
        })
        .slice(0, 50);
    }
    const t = busca.toLowerCase().trim();
    return contas
      .filter((c) => {
        const nome =
          c.parceiros_comerciais?.razao_social || c.fornecedor_cliente || "";
        return (
          nome.toLowerCase().includes(t) ||
          (c.nf_numero || "").toLowerCase().includes(t) ||
          String(c.valor).includes(t)
        );
      })
      .slice(0, 100);
  }, [contas, busca, movimentacao]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-admin" />
            Buscar lançamento para conciliar
          </DialogTitle>
          <DialogDescription>
            {movimentacao && (
              <>
                Movimentação: <strong>{movimentacao.descricao}</strong> ·{" "}
                {formatDateBR(movimentacao.data_transacao)} ·{" "}
                <span className="font-mono">{formatBRL(movimentacao.valor)}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por parceiro, NF ou valor..."
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-[400px] overflow-y-auto rounded border">
            {filtradas.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma conta encontrada com este termo.
              </div>
            ) : (
              <div className="divide-y">
                {filtradas.map((c) => {
                  const valorMatch =
                    movimentacao &&
                    Math.abs(Math.abs(c.valor) - Math.abs(movimentacao.valor)) < 0.01;
                  return (
                    <div
                      key={c.id}
                      className="p-3 hover:bg-muted/50 flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {c.parceiros_comerciais?.razao_social || c.fornecedor_cliente}
                          </span>
                          {c.nf_numero && (
                            <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                              NF {c.nf_numero}
                            </Badge>
                          )}
                          {valorMatch && (
                            <Badge className="text-[9px] py-0 px-1.5 bg-success/10 text-success hover:bg-success/10">
                              ✓ Mesmo valor
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Venc: {formatDateBR(c.data_vencimento)}
                          {c.data_pagamento && ` · Pago: ${formatDateBR(c.data_pagamento)}`}
                        </div>
                      </div>
                      <div className="font-mono text-sm whitespace-nowrap">
                        {formatBRL(c.valor)}
                      </div>
                      <Button
                        size="sm"
                        className="gap-1 h-8"
                        onClick={() => onMatch(c.id)}
                      >
                        <Check className="h-3 w-3" />
                        Conciliar
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {!busca && (
            <p className="text-[10px] text-muted-foreground">
              Ordenado por proximidade de valor. Digite pra buscar.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
