import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2, Play } from "lucide-react";
import { fmtBRL, fmtPct, isBloqueada, motivoBloqueio } from "./fmt";

interface Candidata {
  nf_numero: string | null;
  pedido: string | null;
  representante: string | null;
  base_comissionavel: number | null;
  desconto_regua_pct: number | null;
  ajuste_pp: number | null;
  linha: string | null;
  base_linha: number | null;
  pct_base: number | null;
  pct_efetivo: number | null;
  comissao_linha: number | null;
  situacao: string | null;
}

interface Nota {
  nf_numero: string;
  pedido: string | null;
  representante: string | null;
  base_comissionavel: number;
  desconto_regua_pct: number;
  ajuste_pp: number;
  total: number;
  situacao: string | null;
  linhas: Candidata[];
}

export function AbaApurar() {
  const qc = useQueryClient();
  const [apurando, setApurando] = useState(false);

  const q = useQuery({
    queryKey: ["comissao-candidata"],
    queryFn: async (): Promise<Candidata[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_comissao_candidata")
        .select(
          "nf_numero, pedido, representante, base_comissionavel, desconto_regua_pct, ajuste_pp, linha, base_linha, pct_base, pct_efetivo, comissao_linha, situacao",
        )
        .order("nf_numero", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Candidata[];
    },
  });

  const notas = useMemo<Nota[]>(() => {
    const mapa = new Map<string, Nota>();
    for (const l of q.data ?? []) {
      const chave = l.nf_numero ?? "—";
      let n = mapa.get(chave);
      if (!n) {
        n = {
          nf_numero: chave,
          pedido: l.pedido,
          representante: l.representante,
          base_comissionavel: Number(l.base_comissionavel ?? 0),
          desconto_regua_pct: Number(l.desconto_regua_pct ?? 0),
          ajuste_pp: Number(l.ajuste_pp ?? 0),
          total: 0,
          situacao: l.situacao,
          linhas: [],
        };
        mapa.set(chave, n);
      }
      n.linhas.push(l);
      n.total += Number(l.comissao_linha ?? 0);
      if (isBloqueada(l.situacao)) n.situacao = l.situacao;
    }
    return [...mapa.values()];
  }, [q.data]);

  const bloqueadas = notas.filter((n) => isBloqueada(n.situacao));
  const apuraveis = notas.filter((n) => !isBloqueada(n.situacao));

  async function apurar() {
    setApurando(true);
    try {
      const { data, error } = await (supabase as any).rpc("fn_comissao_apurar_pendentes");
      if (error) throw error;
      const r = (data ?? {}) as Record<string, unknown>;
      const qtd = Number(r.apuradas ?? r.total ?? 0);
      const valor = Number(r.valor_total ?? r.valor ?? 0);
      const bloq = Number(r.bloqueadas ?? 0);
      toast.success(
        `${qtd} nota(s) apurada(s) · ${fmtBRL(valor)}${bloq ? ` · ${bloq} bloqueada(s)` : ""}`,
      );
      await qc.invalidateQueries({ queryKey: ["comissao-candidata"] });
      await qc.invalidateQueries({ queryKey: ["comissao-posicao"] });
      await qc.invalidateQueries({ queryKey: ["comissao-extrato"] });
    } catch (e) {
      toast.error(`Falha ao apurar: ${(e as Error).message}`);
    } finally {
      setApurando(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base">Notas a apurar</CardTitle>
          <p className="text-xs text-muted-foreground">
            A comissão nasce na nota fiscal. A base é o valor total da NF menos o frete.
          </p>
        </div>
        <Button onClick={apurar} disabled={apurando || apuraveis.length === 0}>
          {apurando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Apurar pendentes
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Falha ao carregar notas candidatas: {(q.error as Error).message}
            </AlertDescription>
          </Alert>
        )}

        {bloqueadas.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {bloqueadas.length} nota(s) bloqueada(s) e fora da apuração até o motivo ser resolvido.
            </AlertDescription>
          </Alert>
        )}

        {q.isLoading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : notas.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma nota pendente de apuração.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Representante</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>NF</TableHead>
                <TableHead className="text-right">Base comissionável</TableHead>
                <TableHead className="text-right">Desconto</TableHead>
                <TableHead className="text-right">Comissão da nota</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notas.map((n) => {
                const motivo = motivoBloqueio(n.situacao);
                return (
                  <TableRow key={n.nf_numero} className={motivo ? "bg-destructive/5" : undefined}>
                    <TableCell className="font-medium">{n.representante ?? "—"}</TableCell>
                    <TableCell>{n.pedido ?? "—"}</TableCell>
                    <TableCell>{n.nf_numero}</TableCell>
                    <TableCell className="text-right">{fmtBRL(n.base_comissionavel)}</TableCell>
                    <TableCell className="text-right">{fmtPct(n.desconto_regua_pct)}</TableCell>
                    <TableCell className="text-right font-medium">{fmtBRL(n.total)}</TableCell>
                    <TableCell className="text-xs">
                      {motivo ? (
                        <span className="text-destructive">Bloqueada · {motivo}</span>
                      ) : n.situacao === "aguardando_diretoria" ? (
                        <Badge variant="outline">Aguardando diretoria</Badge>
                      ) : (
                        <Badge variant="secondary">Apurável</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
