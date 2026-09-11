/**
 * BOLETO JÁ ENVIADO AO CLIENTE FOI REJEITADO PELO BANCO.
 *
 * Princípio (09/09/2026): não bloquear o caminho comum por exceção rara — o
 * envio do boleto flui a partir de `remessa_gerada`. O risco real mora AQUI: o
 * banco recusou a entrada (ocorrência 03) de um boleto que o cliente já tem em
 * mãos. O cliente está com um documento inválido e precisa ser avisado.
 *
 * O alerta cai sozinho quando um novo boleto é registrado para o título (o
 * `boleto_status` deixa de ser 'rejeitado').
 *
 * Restrição: considera apenas títulos com status 'aberto'. Títulos
 * cancelados/pagos/devolvidos não entram porque não há boleto a reemitir.
 * Bloco somente LEITURA.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertOctagon } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { OPCOES_QUERY_RECEBIVEL } from "@/hooks/recebivel/useInvalidarRecebivel";
import { BlocoErroBoundary } from "@/components/BlocoErroBoundary";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Linha = {
  id: string;
  numero_titulo: string | null;
  valor_atual: number | null;
  data_vencimento_atual: string | null;
  boleto_enviado_em: string | null;
  boleto_codigo_rejeicao: string | null;
  nosso_numero_seq: string | null;
  conta?: { parceiro?: { razao_social?: string | null } | null } | null;
};

export function AlertaBoletoRejeitadoEnviado() {
  const { data: linhas = [] } = useQuery({
    queryKey: ["boletos-rejeitados-ja-enviados"],
    ...OPCOES_QUERY_RECEBIVEL,
    queryFn: async () => {
      const { data, error } = await sb
        .from("titulo_a_receber")
        .select(
          "id, numero_titulo, valor_atual, data_vencimento_atual, boleto_enviado_em, boleto_codigo_rejeicao, nosso_numero_seq, conta:contas_pagar_receber(parceiro:parceiros_comerciais(razao_social))",
        )
        .eq("boleto_status", "rejeitado")
        .eq("status", "aberto")
        .not("boleto_enviado_em", "is", null)
        .order("boleto_enviado_em", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as Linha[];
    },
  });

  if (linhas.length === 0) return null;

  return (
    <BlocoErroBoundary titulo="Boletos rejeitados já enviados">
      <Card className="border-destructive bg-destructive/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertOctagon className="h-4 w-4" />
            Boleto já enviado ao cliente foi REJEITADO pelo banco
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              {linhas.length}
            </Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            O cliente está com um boleto inválido. Reemitir e avisar o cliente. O
            alerta sai desta tela quando o novo boleto for registrado no banco.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Enviado em</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Nosso número rejeitado</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.numero_titulo || "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {l.conta?.parceiro?.razao_social || "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDateBR(l.boleto_enviado_em)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatDateBR(l.data_vencimento_atual)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{l.nosso_numero_seq || "—"}</TableCell>
                  <TableCell className="text-xs">
                    {l.boleto_codigo_rejeicao ? `motivo ${l.boleto_codigo_rejeicao}` : "não informado"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatBRL(Number(l.valor_atual ?? 0))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </BlocoErroBoundary>
  );
}

export default AlertaBoletoRejeitadoEnviado;
