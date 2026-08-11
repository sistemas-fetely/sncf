import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import type { ExtratoLinha } from "@/hooks/useExtratoConta";

function Campo({
  rotulo,
  valor,
}: {
  rotulo: string;
  valor: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </p>
      <p className="text-sm break-words">{valor ?? "—"}</p>
    </div>
  );
}

export function ExtratoLinhaSheet({
  linha,
  onClose,
}: {
  linha: ExtratoLinha | null;
  onClose: () => void;
}) {
  const l = linha;
  return (
    <Sheet open={!!l} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {l && (
          <>
            <SheetHeader>
              <SheetTitle className="text-base">
                {l.descricao || "Lançamento"}
              </SheetTitle>
              <SheetDescription>
                {formatDateBR(l.data_transacao)} · {l.conta_nome || "—"}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Valor
                </p>
                <p
                  className={
                    "text-2xl font-bold " +
                    (l.sentido === "entrada" ? "text-success" : "text-destructive")
                  }
                >
                  {l.sentido === "saida" ? "-" : ""}
                  {formatBRL(Number(l.valor_abs ?? l.valor ?? 0))}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-2">
                  <Badge variant="outline" className="text-[10px]">
                    {l.sentido === "entrada" ? "Entrada" : "Saída"}
                  </Badge>
                  {l.conciliado && (
                    <Badge variant="secondary" className="text-[10px]">
                      Conciliado
                    </Badge>
                  )}
                  {l.descartada && (
                    <Badge variant="outline" className="text-[10px]">
                      Descartada
                    </Badge>
                  )}
                  {l.conta_no_saldo === false && (
                    <Badge variant="outline" className="text-[10px]">
                      Fora do saldo
                    </Badge>
                  )}
                  {l.categoria_inconsistente && (
                    <Badge variant="outline" className="text-[10px]">
                      Categoria inconsistente
                    </Badge>
                  )}
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Data da transação" valor={formatDateBR(l.data_transacao)} />
                <Campo
                  rotulo="Data / hora"
                  valor={
                    l.data_hora
                      ? new Date(l.data_hora).toLocaleString("pt-BR")
                      : "—"
                  }
                />
                <Campo rotulo="Contraparte" valor={l.contraparte_nome || "—"} />
                <Campo rotulo="Documento" valor={l.contraparte_documento || "—"} />
                <Campo rotulo="Meio" valor={l.tipo_meio || "—"} />
                <Campo rotulo="Classe" valor={l.classe || "—"} />
                <Campo rotulo="Classe definida por" valor={l.classe_definida_por || "—"} />
                <Campo rotulo="Origem" valor={l.origem || "—"} />
                <Campo rotulo="Plano de contas" valor={l.plano_contas_nome || "—"} />
                <Campo rotulo="Centro de custo" valor={l.centro_custo_id || "—"} />
                {l.informativa_fonte && (
                  <Campo rotulo="Fonte informativa" valor={l.informativa_fonte} />
                )}
                <Campo rotulo="Fonte de importação" valor={l.fonte_importacao_id || "—"} />
                <Campo rotulo="Duplicada de" valor={l.duplicada_de || "—"} />
                <Campo rotulo="Casada com" valor={l.casada_com_id || "—"} />
              </div>

              {(l.referencia_pedido || l.conta_pagar_id || l.par_transferencia_id) && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Vínculos
                    </p>
                    {l.referencia_pedido && (
                      <Button asChild variant="outline" size="sm" className="w-full justify-between">
                        <Link to={`/pedidos?busca=${encodeURIComponent(l.referencia_pedido)}`}>
                          Pedido {l.referencia_pedido}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                    {l.conta_pagar_id && (
                      <Button asChild variant="outline" size="sm" className="w-full justify-between">
                        <Link to="/administrativo/contas-pagar">
                          Conta a pagar vinculada
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                    {l.par_transferencia_id && (
                      <Button asChild variant="outline" size="sm" className="w-full justify-between">
                        <Link to="/administrativo/extrato-pares">
                          Par de transferência
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </>
              )}

              <Separator />
              <Campo rotulo="ID do lançamento" valor={<span className="font-mono text-xs">{l.id}</span>} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
