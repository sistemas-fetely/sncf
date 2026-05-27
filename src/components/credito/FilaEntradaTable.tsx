import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAnalisesFila } from "@/hooks/credito/useAnalisesFila";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ArrowRight } from "lucide-react";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function tempoNaFila(criadoEm: string): string {
  const ms = Date.now() - new Date(criadoEm).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}min`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function FilaEntradaTable() {
  const [busca, setBusca] = useState("");
  const navigate = useNavigate();
  const { data: analises, isLoading } = useAnalisesFila({
    estagio: "entrada",
    apenasAbertas: true,
    busca: busca || undefined,
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por CNPJ, razão social ou ID externo..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID Externo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Condição</TableHead>
              <TableHead>Na fila</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (!analises || analises.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum pedido na fila de Entrada.
                </TableCell>
              </TableRow>
            )}
            {analises?.map((a) => (
              <TableRow
                key={a.id}
                className="cursor-pointer"
                onClick={() => navigate(`/credito/analises/${a.id}`)}
              >
                <TableCell className="font-mono text-xs">{a.pedido_id_externo}</TableCell>
                <TableCell>
                  <p className="font-medium">{a.parceiro_razao || "Cliente não cadastrado"}</p>
                  <p className="text-xs text-muted-foreground">{a.parceiro_cnpj}</p>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {fmtBRL.format(a.pedido_valor_liquido)}
                </TableCell>
                <TableCell>{a.pedido_condicao}</TableCell>
                <TableCell className="text-muted-foreground">{tempoNaFila(a.criado_em)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="gap-1">
                    Abrir <ArrowRight className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {analises && analises.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {analises.length} pedido{analises.length !== 1 ? "s" : ""} na fila
        </p>
      )}
    </div>
  );
}
