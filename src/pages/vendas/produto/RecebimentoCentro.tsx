import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Loader2, PackageCheck } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ReceberTransferenciaDialog } from "@/components/estoque/ReceberTransferenciaDialog";
import { ContagemCentroPainel } from "@/components/estoque/ContagemCentroPainel";
import { formatError } from "@/lib/format-error";
import { fmtData } from "@/lib/data";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ESTAGIOS = ["em_transito", "em_transporte", "entregue"];

interface Linha {
  id: string;
  id_externo: string | null;
  data_pedido: string | null;
  estagio: string | null;
  itens: number;
  pecas: number;
  destinoCodigo: string | null;
}
interface Recebida {
  pedido_id: string;
  data_recebimento: string;
  divergencias: unknown[] | null;
  id_externo: string | null;
}

export default function RecebimentoCentro() {
  const qc = useQueryClient();
  const [receber, setReceber] = useState<Linha | null>(null);

  const pendentesQ = useQuery({
    queryKey: ["recebimento-loja", "pendentes"],
    queryFn: async (): Promise<Linha[]> => {
      const { data: nat, error: eN } = await (supabase as any)
        .from("naturezas_operacao").select("id").eq("codigo", "transferencia_interna");
      if (eN) throw eN;
      const natIds = ((nat ?? []) as { id: string }[]).map((n) => n.id);
      if (!natIds.length) return [];
      const { data: peds, error: eP } = await (supabase as any)
        .from("pedidos")
        .select("id, id_externo, data_pedido, estagio, destino_centro_id")
        .in("natureza_operacao_id", natIds)
        .in("estagio", ESTAGIOS)
        .not("destino_centro_id", "is", null)
        .order("data_pedido", { ascending: false })
        .limit(500);
      if (eP) throw eP;
      const lista = (peds ?? []) as any[];
      if (!lista.length) return [];
      const ids = lista.map((p) => p.id);
      const { data: rec, error: eR } = await (supabase as any)
        .from("trs_recebimento").select("pedido_id").in("pedido_id", ids);
      if (eR) throw eR;
      const jaRec = new Set(((rec ?? []) as { pedido_id: string }[]).map((r) => r.pedido_id));
      const abertos = lista.filter((p) => !jaRec.has(p.id));
      if (!abertos.length) return [];
      // Inclusão: centros ativos de chegada física Fetely (armazém/showroom), fora do XPM-SC (contado pelo próprio XPM).
      const centroIds = [...new Set(abertos.map((p) => p.destino_centro_id).filter(Boolean))];
      const codigos = new Map<string, string>();
      if (centroIds.length) {
        const { data: cs, error: eC } = await (supabase as any)
          .from("centro_distribuicao").select("id, codigo, ativo, tipo").in("id", centroIds);
        if (eC) throw eC;
        ((cs ?? []) as { id: string; codigo: string; ativo: boolean; tipo: string | null }[]).forEach((c) => {
          if (c.ativo === true && (c.tipo === "armazem" || c.tipo === "showroom") && c.codigo !== "XPM-SC") codigos.set(c.id, c.codigo);
        });
      }
      const alvo = abertos.filter((p) => p.destino_centro_id && codigos.has(p.destino_centro_id));
      if (!alvo.length) return [];
      const { data: its, error: eI } = await (supabase as any)
        .from("pedido_itens").select("pedido_id, quantidade").in("pedido_id", alvo.map((p) => p.id));
      if (eI) throw eI;
      const agg = new Map<string, { itens: number; pecas: number }>();
      ((its ?? []) as { pedido_id: string; quantidade: number }[]).forEach((i) => {
        const a = agg.get(i.pedido_id) ?? { itens: 0, pecas: 0 };
        a.itens += 1;
        a.pecas += Number(i.quantidade ?? 0);
        agg.set(i.pedido_id, a);
      });
      return alvo.map((p) => ({
        id: p.id,
        id_externo: p.id_externo,
        data_pedido: p.data_pedido,
        estagio: p.estagio,
        itens: agg.get(p.id)?.itens ?? 0,
        pecas: agg.get(p.id)?.pecas ?? 0,
        destinoCodigo: p.destino_centro_id ? codigos.get(p.destino_centro_id) ?? null : null,
      }));
    },
  });

  const recebidasQ = useQuery({
    queryKey: ["recebimento-loja", "recebidas"],
    queryFn: async (): Promise<Recebida[]> => {
      const { data, error } = await (supabase as any)
        .from("trs_recebimento")
        .select("pedido_id, data_recebimento, divergencias")
        .order("criado_em", { ascending: false })
        .limit(20);
      if (error) throw error;
      const rs = (data ?? []) as Recebida[];
      if (!rs.length) return [];
      const { data: peds, error: e2 } = await (supabase as any)
        .from("pedidos").select("id, id_externo").in("id", rs.map((r) => r.pedido_id));
      if (e2) throw e2;
      const m = new Map(((peds ?? []) as { id: string; id_externo: string | null }[]).map((p) => [p.id, p.id_externo]));
      return rs.map((r) => ({ ...r, id_externo: m.get(r.pedido_id) ?? null }));
    },
  });

  useEffect(() => {
    if (pendentesQ.isError) toast.error(formatError(pendentesQ.error));
  }, [pendentesQ.isError, pendentesQ.error]);
  useEffect(() => {
    if (recebidasQ.isError) toast.error(formatError(recebidasQ.error));
  }, [recebidasQ.isError, recebidasQ.error]);

  const pendentes = pendentesQ.data ?? [];
  const recebidas = recebidasQ.data ?? [];

  return (
    <PageShell>
      <PageHeader
        titulo="Recebimento no Centro"
        breadcrumb={[{ label: "Produto" }, { label: "Recebimento no Centro" }]}
        icone={PackageCheck}
        estado="Chegada física de transferência em centro sem sistema próprio"
      />
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Chegada física em centro sem sistema próprio (ex.: Site SP). Transferências vindas de SC e contagem da prateleira. Fornecedor entregando direto: use 'Receber fora do XPM' na NF do pedido (aba Embarques/Acompanhamento).
      </p>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Transferências a receber</h3>
        {pendentesQ.isLoading ? (
          <div className="flex justify-center p-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : pendentesQ.isError ? (
          <p className="text-sm text-destructive">Falha ao carregar: {formatError(pendentesQ.error)}</p>
        ) : pendentes.length === 0 ? (
          <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">Nenhuma transferência para a loja aguardando recebimento.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Estágio</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Peças</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendentes.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium tabular-nums">{p.id_externo ?? p.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-sm">{fmtData(p.data_pedido)}</TableCell>
                    <TableCell><Badge variant="outline">{p.estagio ?? "—"}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{p.itens}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.pecas}</TableCell>
                    <TableCell>{p.destinoCodigo ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <BotaoGuardado slug="acao.trs_receber_destino" rotuloAcao="Receber transferência no centro de destino" size="sm" onClick={() => setReceber(p)}>Receber</BotaoGuardado>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1">
              <ChevronDown className="h-4 w-4" /> Recebidas ({recebidas.length})
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {recebidas.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nenhum recebimento registrado.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Recebido em</TableHead>
                      <TableHead>Diferenças</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recebidas.map((r) => {
                      const n = Array.isArray(r.divergencias) ? r.divergencias.length : 0;
                      return (
                        <TableRow key={r.pedido_id}>
                          <TableCell className="tabular-nums">{r.id_externo ?? r.pedido_id.slice(0, 8)}</TableCell>
                          <TableCell>{fmtData(r.data_recebimento)}</TableCell>
                          <TableCell className={n > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>
                            {n > 0 ? `${n} ${n === 1 ? "diferença" : "diferenças"}` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Contagem da prateleira</h3>
        <ContagemCentroPainel />
      </section>

      {receber && (
        <ReceberTransferenciaDialog
          aberto
          onFechar={() => setReceber(null)}
          pedidoId={receber.id}
          titulo={receber.id_externo ?? receber.id.slice(0, 8)}
          destinoCodigo={receber.destinoCodigo}
          onRecebido={() => {
            void qc.invalidateQueries({ queryKey: ["recebimento-loja"] });
            void qc.invalidateQueries({ queryKey: ["transferencias-internas"] });
            void qc.invalidateQueries({ queryKey: ["trs-recebimento"] });
          }}
        />
      )}
    </div>
    </PageShell>
  );
}
