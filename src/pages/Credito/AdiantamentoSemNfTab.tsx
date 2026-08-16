import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import { formatCNPJ } from "@/lib/cnpj";
import { formatBRL } from "@/lib/format-currency";
import { useAdiantamentoSemNf } from "@/hooks/credito/useAdiantamentoSemNf";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

export default function AdiantamentoSemNfTab() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const { data, isLoading } = useAdiantamentoSemNf(busca || undefined);

  const linhas = data ?? [];
  const total = linhas.reduce((s, r) => s + r.saldo, 0);
  const qtdIntegral = linhas.filter((r) => r.cobre_pedido_inteiro).length;
  const qtdSemPlano = linhas.filter((r) => r.sem_plano).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Adiantamento s/ NF</p>
            <p className="text-2xl font-medium">{formatBRL(total)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {linhas.length} lançamento{linhas.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Cobre o pedido inteiro</p>
            <p className="text-2xl font-medium">{qtdIntegral}</p>
          </CardContent>
        </Card>
        <Card className={qtdSemPlano > 0 ? "border-destructive" : undefined}>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Sem plano</p>
            <p className={`text-2xl font-medium ${qtdSemPlano > 0 ? "text-destructive" : ""}`}>
              {qtdSemPlano}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por cliente, pedido ou CNPJ..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead>Recebido em</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Cobertura</TableHead>
              <TableHead>Situação</TableHead>
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
            {!isLoading && linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhum adiantamento sem NF.
                </TableCell>
              </TableRow>
            )}
            {linhas.map((r) => (
              <TableRow
                key={r.adiantamento_id}
                className="cursor-pointer"
                onClick={() => navigate(`/pedidos/${r.pedido_id}`)}
              >
                <TableCell>
                  <p className="text-sm font-medium">{r.cliente}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.cnpj ? formatCNPJ(r.cnpj) : "—"}
                  </p>
                </TableCell>
                <TableCell>
                  <p className="font-mono text-xs font-medium text-primary">
                    {r.pedido ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.pedido_estagio ?? "—"}</p>
                </TableCell>
                <TableCell className="text-sm capitalize">{r.forma ?? "—"}</TableCell>
                <TableCell className="text-sm">{fmtDate(r.recebido_em)}</TableCell>
                <TableCell className="text-right font-medium">{formatBRL(r.saldo)}</TableCell>
                <TableCell>
                  {r.cobre_pedido_inteiro ? (
                    <Badge className="bg-success hover:bg-success text-white">
                      Integral
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      {r.pct_pedido != null ? `${r.pct_pedido}%` : "—"}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {r.sem_plano ? (
                    <Badge variant="destructive">Sem plano — vai faturar sem título</Badge>
                  ) : (
                    <Badge variant="secondary">Aguardando NF</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {linhas.length} lançamento{linhas.length !== 1 ? "s" : ""} · {formatBRL(total)} · dinheiro
        do cliente já recebido — vira título quando a NF sair
      </p>
    </div>
  );
}
