import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { fmtBRL, fmtCompetencia, fmtData } from "./fmt";

interface Extrato {
  competencia_pagamento: string | null;
  pagar_ate: string | null;
  vendedor_id: string | null;
  representante: string | null;
  email_contato: string | null;
  notas: number | null;
  valor_a_pagar: number | null;
  nfs: string | null;
  tudo_lancado_cpr: boolean | null;
}

interface DetalheComissao {
  representante: string | null;
  email_contato: string | null;
  competencia: string | null;
  status_apuracao: string | null;
  nf: string | null;
  nf_emissao: string | null;
  pedido: string | null;
  cliente: string | null;
  valor_pedido: number | string | null;
  base_comissionavel: number | string | null;
  desconto_pct: number | string | null;
  ajuste_pp: number | string | null;
  pct_efetivo: number | string | null;
  comissao_da_nota: number | string | null;
  numero_titulo: string | null;
  numero_parcela: number | string | null;
  total_parcelas: number | string | null;
  valor_parcela: number | string | null;
  vencimento: string | null;
  status_titulo: string | null;
  pago_em: string | null;
  situacao_parcela: string | null;
  dias_atraso: number | string | null;
  comissao_da_parcela: number | string | null;
  valor_liberado: number | string | null;
  data_liquidacao: string | null;
  competencia_pagamento: string | null;
}

const SITUACAO_PARCELA: Record<string, string> = {
  liberada: "Liberada",
  paga_aguarda_liberacao: "Paga, aguarda liberação",
  vencida: "Vencida",
  a_vencer: "A vencer",
};

/** Moeda no CSV: sempre 2 casas com vírgula decimal (padrão Excel BR). */
function moedaCsv(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "";
}

/** Percentuais no CSV: até 4 casas com vírgula decimal, sem sufixo. */
function pctCsv(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

/** Data no CSV: dd/MM/yyyy; vazio quando nulo (nada de "—" no arquivo). */
function dataCsv(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

async function baixarCsv(competencia: string) {
  try {
    const linhas: DetalheComissao[] = [];
    const TAM = 1000;
    for (let offset = 0; ; offset += TAM) {
      const { data, error } = await (supabase as any)
        .from("vw_comissao_detalhe")
        .select("*")
        .eq("competencia_pagamento", competencia)
        .range(offset, offset + TAM - 1);
      if (error) throw error;
      linhas.push(...((data ?? []) as DetalheComissao[]));
      if ((data ?? []).length < TAM) break;
    }
    if (linhas.length === 0) {
      toast.error(
        "Nenhuma parcela encontrada para esta competência — nenhum arquivo foi exportado.",
      );
      return;
    }

    const cab = [
      "Representante",
      "E-mail",
      "Competência",
      "Status apuração",
      "NF",
      "Emissão NF",
      "Pedido",
      "Cliente",
      "Valor do pedido",
      "Base comissionável",
      "Desconto %",
      "Ajuste p.p.",
      "% efetivo",
      "Comissão da nota",
      "Título",
      "Parcela",
      "Valor da parcela",
      "Vencimento",
      "Status do título",
      "Pago em",
      "Situação",
      "Dias em atraso",
      "Comissão da parcela",
      "Valor liberado",
      "Data liquidação",
      "Competência pagamento",
    ];
    const corpo = linhas.map((l) => [
      l.representante ?? "",
      l.email_contato ?? "",
      fmtCompetencia(l.competencia),
      l.status_apuracao ?? "",
      l.nf ?? "",
      dataCsv(l.nf_emissao),
      l.pedido ?? "",
      l.cliente ?? "",
      moedaCsv(l.valor_pedido),
      moedaCsv(l.base_comissionavel),
      pctCsv(l.desconto_pct),
      pctCsv(l.ajuste_pp),
      pctCsv(l.pct_efetivo),
      moedaCsv(l.comissao_da_nota),
      l.numero_titulo ?? "",
      l.numero_parcela != null && l.total_parcelas != null
        ? `${l.numero_parcela}/${l.total_parcelas}`
        : "",
      moedaCsv(l.valor_parcela),
      dataCsv(l.vencimento),
      l.status_titulo ?? "",
      dataCsv(l.pago_em),
      SITUACAO_PARCELA[l.situacao_parcela ?? ""] ?? l.situacao_parcela ?? "",
      String(l.dias_atraso ?? 0),
      moedaCsv(l.comissao_da_parcela),
      moedaCsv(l.valor_liberado),
      dataCsv(l.data_liquidacao),
      fmtCompetencia(l.competencia_pagamento),
    ]);
    const csv = [cab, ...corpo]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `comissoes_detalhe_${competencia.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(
      `Extrato detalhado de ${fmtCompetencia(competencia)} exportado (${linhas.length} linha${linhas.length === 1 ? "" : "s"}).`,
    );
  } catch (e) {
    toast.error(`Falha ao exportar: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function AbaExtrato() {
  const q = useQuery({
    queryKey: ["comissao-extrato"],
    queryFn: async (): Promise<Extrato[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_comissao_extrato_mensal")
        .select("*")
        .order("competencia_pagamento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Extrato[];
    },
  });

  const grupos = useMemo(() => {
    const mapa = new Map<string, Extrato[]>();
    for (const l of q.data ?? []) {
      const k = l.competencia_pagamento ?? "—";
      mapa.set(k, [...(mapa.get(k) ?? []), l]);
    }
    return [...mapa.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [q.data]);

  const hoje = new Date().toISOString().slice(0, 10);

  if (q.isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Falha ao carregar extrato: {(q.error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  if (q.isLoading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (grupos.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          Nenhuma comissão liberada até agora. O extrato só nasce quando o cliente paga uma parcela.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {grupos.map(([competencia, linhas]) => {
        const total = linhas.reduce((s, l) => s + Number(l.valor_a_pagar ?? 0), 0);
        const atraso = linhas.some(
          (l) => l.pagar_ate && l.pagar_ate < hoje && l.tudo_lancado_cpr === false,
        );
        return (
          <Card key={competencia}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-base">
                  Competência {fmtCompetencia(competencia)}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Total a pagar {fmtBRL(total)} · pagar até {fmtData(linhas[0]?.pagar_ate)}
                </p>
              </div>
              <Button variant="outline" onClick={() => baixarCsv(competencia, linhas)}>
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {atraso && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Prazo de pagamento vencido e ainda há comissão sem lançamento em contas a pagar.
                  </AlertDescription>
                </Alert>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Representante</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead className="text-right">Notas</TableHead>
                    <TableHead>NFs incluídas</TableHead>
                    <TableHead>Pagar até</TableHead>
                    <TableHead className="text-right">Valor a pagar</TableHead>
                    <TableHead>CPR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => (
                    <TableRow key={`${competencia}-${l.vendedor_id}`}>
                      <TableCell className="font-medium">{l.representante ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {l.email_contato ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">{Number(l.notas ?? 0)}</TableCell>
                      <TableCell className="max-w-[280px] text-xs">{l.nfs ?? "—"}</TableCell>
                      <TableCell>{fmtData(l.pagar_ate)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {fmtBRL(l.valor_a_pagar)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.tudo_lancado_cpr ? (
                          "Lançado"
                        ) : (
                          <span className="text-destructive">Pendente</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
