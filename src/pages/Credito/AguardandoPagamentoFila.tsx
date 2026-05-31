import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { useAguardandoPagamentoFila } from "@/hooks/credito/useAguardandoPagamentoFila";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, Info } from "lucide-react";
import { formatCNPJ } from "@/lib/cnpj";
import { formatBRL } from "@/lib/format-currency";

export default function AguardandoPagamentoFila() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const { data, isLoading } = useAguardandoPagamentoFila({ busca: busca || undefined });

  const total = data?.length ?? 0;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Crédito", to: "/credito" },
          { label: "Aguardando pagamento" },
        ]}
        title="Aguardando pagamento"
        subtitle={`${total} pedido${total !== 1 ? "s" : ""} aguardando confirmação de entrada`}
      />

      <div className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Quando a última entrada for marcada como paga, o pedido avança
            automaticamente para pré-faturamento.
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
                <TableHead>ID Externo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Valor pedido</TableHead>
                <TableHead>Entradas</TableHead>
                <TableHead>Dias aguardando</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6">
                    <Skeleton className="h-10 w-full" />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && total === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum pedido aguardando pagamento.
                  </TableCell>
                </TableRow>
              )}
              {data?.map((p) => {
                const diasVariant =
                  p.dias_aguardando > 15
                    ? "destructive"
                    : p.dias_aguardando > 7
                      ? "secondary"
                      : "outline";
                return (
                  <TableRow
                    key={p.pedido_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/credito/aguardando-pagamento/${p.pedido_id}`)}
                  >
                    <TableCell>
                      <span className="font-mono text-xs font-semibold text-primary">
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
                      {formatBRL(p.valor_liquido)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.entradas_pendentes} de {p.entradas_total} pendente
                      {p.entradas_pendentes !== 1 ? "s" : ""}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={diasVariant}
                        className={
                          p.dias_aguardando > 15
                            ? ""
                            : p.dias_aguardando > 7
                              ? "bg-amber-500 text-white hover:bg-amber-500/90"
                              : ""
                        }
                      >
                        {p.dias_aguardando} dia{p.dias_aguardando !== 1 ? "s" : ""}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
