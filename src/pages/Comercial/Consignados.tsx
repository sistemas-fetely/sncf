import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2, AlertTriangle, ChevronRight } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

import { PageShell } from "@/components/layout/PageShell";
interface ParceiroConsignado {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
}

interface ContaCorrenteRow {
  parceiro_id: string;
  cnpj: string | null;
  nome: string | null;
  documentado: number | null;
  n_titulos: number | null;
  pago: number | null;
  n_pagamentos: number | null;
  saldo_devedor: number | null;
  ultimo_pagamento: string | null;
  haver_disponivel: number | null;
}

export function useParceirosConsignados() {
  return useQuery({
    queryKey: ["consignados-parceiros"],
    queryFn: async (): Promise<ParceiroConsignado[]> => {
      const { data: formas, error: errForma } = await (supabase as any)
        .from("formas_pagamento")
        .select("id")
        .eq("codigo", "conta_corrente");
      if (errForma) throw errForma;
      const ids = ((formas ?? []) as { id: string }[]).map((f) => f.id);
      if (ids.length === 0) return [];

      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social, nome_fantasia, cnpj")
        .in("forma_pagamento_padrao_id", ids)
        .eq("ativo", true)
        .order("razao_social");
      if (error) throw error;
      return (data ?? []) as ParceiroConsignado[];
    },
  });
}

export function useContaCorrenteCliente(parceiroId?: string) {
  return useQuery({
    queryKey: ["consignados-conta-corrente", parceiroId ?? "todos"],
    queryFn: async (): Promise<ContaCorrenteRow[]> => {
      let q = (supabase as any).from("vw_conta_corrente_cliente").select("*");
      if (parceiroId) q = q.eq("parceiro_id", parceiroId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ContaCorrenteRow[];
    },
  });
}

export default function Consignados({ embutido = false }: { embutido?: boolean } = {}) {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const parceirosQ = useParceirosConsignados();
  const contaQ = useContaCorrenteCliente();

  const saldoPorParceiro = useMemo(() => {
    const m = new Map<string, ContaCorrenteRow>();
    for (const r of contaQ.data ?? []) m.set(r.parceiro_id, r);
    return m;
  }, [contaQ.data]);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (parceirosQ.data ?? []).filter((p) =>
      !termo ||
      p.razao_social?.toLowerCase().includes(termo) ||
      (p.nome_fantasia ?? "").toLowerCase().includes(termo) ||
      (p.cnpj ?? "").replace(/\D/g, "").includes(termo.replace(/\D/g, ""))
    );
  }, [parceirosQ.data, busca]);

  const isError = parceirosQ.isError || contaQ.isError;

  const Wrapper = embutido
    ? ({ children }: { children: React.ReactNode }) => (
        <div className="space-y-6">{children}</div>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <PageShell className="md:p-8">{children}</PageShell>
      );

  return (
    <Wrapper>
      {!embutido && (
        <CasaPageHeader
          breadcrumb={[{ label: "Comercial" }, { label: "Consignados" }]}
          title="Consignados"
          subtitle="Parceiros em regime de conta corrente"
        />
      )}


      {isError && (
        <Card className="mb-4 border-destructive">
          <CardContent className="p-4 flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Falha ao carregar dados: {(parceirosQ.error as Error)?.message ?? (contaQ.error as Error)?.message}
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar parceiro ou CNPJ..."
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {parceirosQ.isLoading ? (
            <div className="p-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : linhas.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Nenhum parceiro em regime de conta corrente.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parceiro</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead className="text-right">Documentado</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead className="text-right">Saldo devedor</TableHead>
                  <TableHead>Último pagamento</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((p) => {
                  const cc = saldoPorParceiro.get(p.id);
                  const saldo = Number(cc?.saldo_devedor ?? 0);
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/comercial/consignados/${p.id}`)}
                    >
                      <TableCell className="font-medium">
                        {p.razao_social}
                        {p.nome_fantasia && (
                          <span className="block text-xs text-muted-foreground">{p.nome_fantasia}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{p.cnpj ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{formatBRL(cc?.documentado)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{formatBRL(cc?.pago)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge
                          variant="outline"
                          className={saldo > 0 ? "border-warning/40 text-warning" : "text-muted-foreground"}
                        >
                          {formatBRL(saldo)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateBR(cc?.ultimo_pagamento)}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
