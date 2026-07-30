import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface CentroLinha {
  sku: string;
  centro: string;
  centro_uf: string | null;
  centro_tipo: string | null;
  fiscal_sadio: number | null;
  fiscal_bloqueado: number | null;
  fisico_total: number | null;
  furo: number | null;
  reservado: number | null;
  disponivel: number | null;
  contagem_em: string | null;
}

interface PosicaoLinha {
  sku: string;
  centro: string;
  condicao: string;
  condicao_rotulo: string | null;
  fiscal: number | null;
  fisico: number | null;
  furo: number | null;
  furo_a_investigar: number | null;
  verdade_primaria: string | null;
}

function n(v: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(Number(v ?? 0));
}

function dataCurta(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

interface Props {
  sku: string | null;
  nome: string | null;
  onClose: () => void;
}

export function DetalheEstoqueSkuSheet({ sku, nome, onClose }: Props) {
  const aberto = !!sku;

  const centrosQ = useQuery({
    queryKey: ["estoque-centro", sku],
    enabled: aberto,
    queryFn: async (): Promise<CentroLinha[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_estoque_centro")
        .select("sku,centro,centro_uf,centro_tipo,fiscal_sadio,fiscal_bloqueado,fisico_total,furo,reservado,disponivel,contagem_em")
        .eq("sku", sku);
      if (error) throw error;
      return (data ?? []) as CentroLinha[];
    },
  });

  const posicoesQ = useQuery({
    queryKey: ["estoque-posicao", sku],
    enabled: aberto,
    queryFn: async (): Promise<PosicaoLinha[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_estoque_posicao")
        .select("sku,centro,condicao,condicao_rotulo,fiscal,fisico,furo,furo_a_investigar,verdade_primaria")
        .eq("sku", sku);
      if (error) throw error;
      return (data ?? []) as PosicaoLinha[];
    },
  });

  return (
    <Sheet open={aberto} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-mono text-base">{sku}</SheetTitle>
          <SheetDescription>{nome ?? "—"}</SheetDescription>
        </SheetHeader>

        <section className="mt-6">
          <h3 className="text-sm font-medium mb-2">Por centro</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Centro</TableHead>
                  <TableHead className="text-right">Sadio</TableHead>
                  <TableHead className="text-right">Bloqueado</TableHead>
                  <TableHead className="text-right">Físico</TableHead>
                  <TableHead className="text-right">Reservado</TableHead>
                  <TableHead className="text-right">Disponível</TableHead>
                  <TableHead className="text-right">Contagem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {centrosQ.isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : (centrosQ.data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Sem posição por centro.</TableCell></TableRow>
                ) : (
                  (centrosQ.data ?? []).map((c) => (
                    <TableRow key={c.centro}>
                      <TableCell>
                        <div className="font-medium">{c.centro}</div>
                        <div className="text-xs text-muted-foreground">
                          {[c.centro_uf, c.centro_tipo].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{n(c.fiscal_sadio)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(c.fiscal_bloqueado)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(c.fisico_total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(c.reservado)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{n(c.disponivel)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{dataCurta(c.contagem_em)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-medium mb-2">Por condição</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Centro / condição</TableHead>
                  <TableHead className="text-right">Fiscal</TableHead>
                  <TableHead className="text-right">Físico</TableHead>
                  <TableHead className="text-right">Furo</TableHead>
                  <TableHead className="text-right">A investigar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posicoesQ.isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : (posicoesQ.data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Sem posição registrada.</TableCell></TableRow>
                ) : (
                  (posicoesQ.data ?? []).map((p, i) => (
                    <TableRow key={`${p.centro}-${p.condicao}-${i}`}>
                      <TableCell>
                        <div className="text-sm">{p.condicao_rotulo ?? p.condicao}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.centro}
                          {p.verdade_primaria ? ` · verdade: ${p.verdade_primaria}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{n(p.fiscal)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(p.fisico)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{n(p.furo)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.furo_a_investigar === null || p.furo_a_investigar === undefined ? (
                          <span className="text-xs text-muted-foreground">esperado</span>
                        ) : (
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 font-normal">
                            {n(p.furo_a_investigar)}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </SheetContent>
    </Sheet>
  );
}
