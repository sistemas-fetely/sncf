/** Venda fora: recebíveis da plataforma e faixa mês a mês (somente leitura das views). */
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatError } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { fmtData } from "@/lib/data";

const sb = supabase as any;
const mes = (iso: string) => { const [a, m] = iso.split("-"); return `${m}/${a}`; };

function Estado({ q, vazio, children }: { q: { isLoading: boolean; isError: boolean; error: unknown; data?: unknown[] }; vazio: string; children: React.ReactNode }) {
  if (q.isError) return <Alert variant="destructive" className="m-4 w-auto"><AlertDescription>{formatError(q.error)}</AlertDescription></Alert>;
  if (q.isLoading) return <div className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>;
  if (!(q.data ?? []).length) return <p className="p-6 text-center text-sm text-muted-foreground">{vazio}</p>;
  return <>{children}</>;
}

export function useVendaForaCompetencia(parceiroId: string) {
  return useQuery({
    queryKey: ["vw_venda_fora_competencia", parceiroId],
    queryFn: async () => {
      const { data, error } = await sb.from("vw_venda_fora_competencia").select("*").eq("parceiro_id", parceiroId).order("competencia", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function RecebiveisVendaFora({ parceiroId }: { parceiroId: string }) {
  const q = useQuery({
    queryKey: ["vw_venda_fora_recebivel", parceiroId],
    queryFn: async () => {
      const { data, error } = await sb.from("vw_venda_fora_recebivel").select("*").eq("parceiro_id", parceiroId).order("prevista_liquidacao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const badge = (s: string) => {
    const t = (s ?? "").toLowerCase();
    if (t.includes("liquid")) return <Badge className="bg-success/15 text-success hover:bg-success/15">liquidado</Badge>;
    if (t.includes("atras")) return <Badge variant="destructive">atrasado</Badge>;
    return <Badge variant="secondary">{s ?? "a receber"}</Badge>;
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Recebíveis da plataforma</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Estado q={q} vazio="Nenhum recebível importado.">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Prevista</TableHead><TableHead>Forma</TableHead><TableHead className="text-right">Unidades</TableHead>
              <TableHead className="text-right">A liquidar</TableHead><TableHead>Situação</TableHead><TableHead>Liquidado em</TableHead><TableHead>IDs de liquidação</TableHead>
            </TableRow></TableHeader>
            <TableBody>{(q.data ?? []).map((r, i) => (
              <TableRow key={i}>
                <TableCell>{fmtData(r.prevista_liquidacao)}</TableCell><TableCell>{r.forma_pagamento ?? "—"}</TableCell>
                <TableCell className="text-right">{r.unidades}</TableCell><TableCell className="text-right">{formatBRL(r.valor_a_liquidar)}</TableCell>
                <TableCell>{badge(r.situacao)}</TableCell><TableCell>{fmtData(r.data_liquidacao)}</TableCell>
                <TableCell className="max-w-[16rem] truncate text-xs" title={r.liquidacao_ids ?? ""}>{r.liquidacao_ids ?? "—"}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </Estado>
      </CardContent>
    </Card>
  );
}

export function MesAMesVendaFora({ parceiroId }: { parceiroId: string }) {
  const q = useVendaForaCompetencia(parceiroId);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Mês a mês</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Estado q={q} vazio="Nenhuma venda importada.">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Competência</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Receita bruta</TableHead>
              <TableHead className="text-right">Retido plataforma</TableHead><TableHead className="text-right">MDR</TableHead>
              <TableHead className="text-right">Líquido recebido</TableHead><TableHead className="text-right">Aluguel a pagar</TableHead>
            </TableRow></TableHeader>
            <TableBody>{(q.data ?? []).map((r) => (
              <TableRow key={r.competencia}>
                <TableCell>{mes(r.competencia)}</TableCell><TableCell className="text-right">{r.unidades}</TableCell>
                <TableCell className="text-right">{formatBRL(r.receita_bruta)}</TableCell><TableCell className="text-right">{formatBRL(r.retido_plataforma)}</TableCell>
                <TableCell className="text-right">{formatBRL(r.mdr)}</TableCell><TableCell className="text-right">{formatBRL(r.liquido_recebido)}</TableCell>
                <TableCell className="text-right">{formatBRL(r.aluguel_a_pagar)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </Estado>
      </CardContent>
    </Card>
  );
}
