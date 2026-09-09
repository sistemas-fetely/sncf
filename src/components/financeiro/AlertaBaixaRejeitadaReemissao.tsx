/**
 * DOIS BOLETOS VIVOS — alerta destacado na tela de Banco.
 *
 * Contexto: na reemissão em um movimento, a baixa do boleto antigo e a entrada
 * do novo viajam no MESMO arquivo. Se o retorno REJEITAR a baixa (motivos 080,
 * 083, 112 ou rejeição de pedido de baixa), o boleto antigo continua vivo ao
 * lado do novo — o cliente pode pagar o errado. Não existe correção automática
 * possível aqui: exige decisão humana.
 *
 * Este bloco é somente LEITURA. Nenhum botão altera título ou boleto.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { OPCOES_QUERY_RECEBIVEL } from "@/hooks/recebivel/useInvalidarRecebivel";
import { BlocoErroBoundary } from "@/components/BlocoErroBoundary";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/** Motivos de rejeição de pedido de baixa no retorno CNAB 400 do Safra. */
const MOTIVOS_REJEICAO_BAIXA = ["080", "083", "112"];

type Ocorrencia = {
  id: string;
  data_ocorrencia: string | null;
  codigo_ocorrencia: string | null;
  ocorrencia_descricao: string | null;
  motivo_rejeicao: string | null;
  nosso_numero: string | null;
  sacado: string | null;
  titulo_id: string | null;
  numero_titulo: string | null;
  valor_titulo: number | null;
  tratado: boolean | null;
};

function ehRejeicaoDeBaixa(o: Ocorrencia): boolean {
  const motivos = (o.motivo_rejeicao ?? "").match(/\d{3}/g) ?? [];
  if (motivos.some((m) => MOTIVOS_REJEICAO_BAIXA.includes(m))) return true;
  const d = (o.ocorrencia_descricao ?? "").toLowerCase();
  return d.includes("baixa") && (d.includes("rejei") || d.includes("recus") || d.includes("nao acat") || d.includes("não acat"));
}

export function AlertaBaixaRejeitadaReemissao() {
  const { data: ocorrencias = [] } = useQuery({
    queryKey: ["safra-retorno-pendente"],
    ...OPCOES_QUERY_RECEBIVEL,
    queryFn: async () => {
      const { data, error } = await sb
        .from("vw_safra_retorno_pendente")
        .select("*")
        .order("data_ocorrencia", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as Ocorrencia[];
    },
  });

  const rejeicoes = useMemo(
    () => ocorrencias.filter((o) => !o.tratado && ehRejeicaoDeBaixa(o)),
    [ocorrencias],
  );

  if (rejeicoes.length === 0) return null;

  return (
    <BlocoErroBoundary titulo="Baixas rejeitadas">
      <Card className="border-destructive/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Baixa rejeitada pelo banco — dois boletos vivos para o mesmo título
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              {rejeicoes.length}
            </Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            O boleto novo foi registrado, mas o banco recusou a baixa do antigo. O cliente pode
            pagar o boleto errado. Exige decisão humana: pedir a baixa de novo ou cancelar o novo
            boleto. Não envie nenhum dos dois ao cliente antes de resolver.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Nosso número recusado</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rejeicoes.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="tabular-nums">{formatDateBR(o.data_ocorrencia)}</TableCell>
                  <TableCell className="font-mono text-xs">{o.numero_titulo || "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{o.sacado || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{o.nosso_numero || "—"}</TableCell>
                  <TableCell className="text-xs">
                    {o.codigo_ocorrencia ? `${o.codigo_ocorrencia} — ` : ""}
                    {o.ocorrencia_descricao || "?"}
                    {o.motivo_rejeicao ? ` (motivo ${o.motivo_rejeicao})` : ""}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatBRL(Number(o.valor_titulo ?? 0))}
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
