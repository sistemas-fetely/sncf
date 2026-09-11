import { Link } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useProblemasAbertos, type ProblemaLinha } from "@/hooks/pedidos/useProblemasPedido";
import { ESTAGIO_LABELS, type EstagioPedido } from "@/types/pedido";

const rotuloEstagio = (e: string) => ESTAGIO_LABELS[e as EstagioPedido] ?? e;

const brl = (v: number | null) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function BadgeTipoProblema({ linha }: { linha: ProblemaLinha }) {
  const cor = linha.tipo_cor ?? undefined;
  return (
    <Badge
      variant="outline"
      className="whitespace-nowrap"
      style={cor ? { borderColor: cor, color: cor } : undefined}
    >
      {linha.tipo_rotulo ?? linha.tipo_codigo}
    </Badge>
  );
}

/**
 * PROBLEMA-NAO-RETROCEDE-ESTAGIO: esta aba é uma SEGUNDA vista do mesmo pedido.
 * Ele continua aparecendo na aba do estágio dele; aqui aparece porque tem
 * problema aberto. Ao declarar resolvido, sai daqui e continua lá.
 */
export function ProblemasPedidoAba() {
  const { data, isLoading, isError, error } = useProblemasAbertos();

  if (isError) {
    return (
      <Alert className="border-destructive/40 bg-destructive/10">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <AlertDescription className="text-destructive text-sm">
          Não foi possível carregar os problemas abertos: {(error as Error)?.message ?? "erro desconhecido"}
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const linhas = data ?? [];
  if (linhas.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/40 px-3 py-10 text-center text-sm text-muted-foreground">
        Nenhum pedido com problema aberto.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pedido</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Estágio atual</TableHead>
            <TableHead>Problema</TableHead>
            <TableHead>Quem abriu</TableHead>
            <TableHead className="text-right">Dias aberto</TableHead>
            <TableHead>Descrição</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="font-mono text-xs whitespace-nowrap">
                <Link to={`/pedidos/${l.pedido_id}`} className="hover:underline">
                  {l.id_externo ?? l.pedido_id.slice(0, 8)}
                </Link>
              </TableCell>
              <TableCell className="max-w-[220px] truncate text-sm">
                {l.cliente_nome_snapshot ?? "—"}
              </TableCell>
              <TableCell className="text-right text-sm whitespace-nowrap">{brl(l.valor_liquido)}</TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                {l.estagio ? rotuloEstagio(l.estagio) : "—"}
                {l.estagio_na_abertura && l.estagio_na_abertura !== l.estagio && (
                  <span className="block text-[11px] text-muted-foreground">
                    abriu em {rotuloEstagio(l.estagio_na_abertura)}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <BadgeTipoProblema linha={l} />
                {l.libera_refaturamento && (
                  <span className="block text-[11px] text-muted-foreground">libera refaturamento</span>
                )}
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap">{l.aberto_por_nome ?? "—"}</TableCell>
              <TableCell className="text-right text-sm whitespace-nowrap">
                {l.dias_aberto ?? 0}
              </TableCell>
              <TableCell className="max-w-[320px] text-xs text-muted-foreground">
                <span className="line-clamp-2">{l.descricao ?? "—"}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
