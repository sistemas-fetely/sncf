import { useState } from "react";
import { usePrimeiroPagamentoFila } from "@/hooks/credito/usePrimeiroPagamentoFila";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, Info } from "lucide-react";
import { formatCNPJ } from "@/lib/cnpj";
import { formatBRL } from "@/lib/format-currency";
import { ConfirmarPagamentoDialog } from "@/components/pedidos/dialogs/ConfirmarPagamentoDialog";

const fmtDate = (iso: string) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export default function PrimeiroPagamentoTab() {
  const [busca, setBusca] = useState("");
  const { data, isLoading } = usePrimeiroPagamentoFila({ busca: busca || undefined });
  const total = data?.length ?? 0;

  // REFERENCIA-SEMPRE: uma única tela de confirmação, modo SOPS (anexo opcional).
  const [confirmando, setConfirmando] = useState<{ pedidoId: string } | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {total} portão(ões) aguardando confirmação de pagamento
      </p>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Confirme o pagamento quando o cliente quitar o portão. O pedido então avança para pré-faturamento com os títulos definitivos.
          Portão em <strong>cartão</strong> tem caminho próprio: uma autorização cobre a venda inteira, então ele fecha pela captura (NSU) e não por confirmação manual.
        </AlertDescription>
      </Alert>

      <div className="relative max-w-sm">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por ID, razão social ou CNPJ..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Parceiro</TableHead>
              <TableHead className="text-right">Valor do portão</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Dias aguardando</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-6">
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && total === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhum portão aguardando pagamento.
                </TableCell>
              </TableRow>
            )}
            {data?.map((p) => (
              <TableRow key={p.portao_id}>
                <TableCell>
                  <span className="font-mono text-xs font-medium text-primary">
                    {p.id_externo}
                  </span>
                </TableCell>
                <TableCell>
                  <p className="text-sm font-medium">{p.parceiro_nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.parceiro_cnpj ? formatCNPJ(p.parceiro_cnpj) : "—"}
                  </p>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatBRL(p.valor)}
                </TableCell>
                <TableCell>{fmtDate(p.data_vencimento)}</TableCell>
                <TableCell className="text-sm capitalize">{p.tipo_pagamento}</TableCell>
                <TableCell className="text-sm">
                  {p.dias_aguardando} dia{p.dias_aguardando !== 1 ? "s" : ""}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    onClick={() => setConfirmando({ pedidoId: p.pedido_id })}
                  >
                    {p.tipo_pagamento === "cartao" ? "Confirmar captura" : "Confirmar pagamento"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {confirmando && (
        <ConfirmarPagamentoDialog
          pedidoId={confirmando.pedidoId}
          aberto
          aoFechar={() => setConfirmando(null)}
          modo="sops"
        />
      )}
    </div>
  );
}
