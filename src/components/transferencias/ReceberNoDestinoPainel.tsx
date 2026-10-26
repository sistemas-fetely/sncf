import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Loader2 } from "lucide-react";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ReceberTransferenciaDialog } from "@/components/estoque/ReceberTransferenciaDialog";
import { Link, useSearchParams } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTrsAtrasados, useTrsNaturezaDivergente } from "@/components/transferencias/AlertasTransferenciaFisica";
import { GavetaTransferencia } from "@/components/transferencias/GavetaTransferencia";
import { formatError } from "@/lib/format-error";
import { fmtData } from "@/lib/data";
import { EstagioBadge } from "@/components/pedidos/BadgesPedido";
import { ESTAGIO_LABELS, type EstagioPedido } from "@/types/pedido";

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
  destinoRotulo: string | null;
  nf_numero: string | null;
  nf_data_emissao: string | null;
  finalidade: string | null;
}
interface Recebida {
  pedido_id: string;
  data_recebimento: string;
  divergencias: unknown[] | null;
  id_externo: string | null;
}

function SeloEstagio({ estagio }: { estagio: string | null }) {
  if (!estagio) return <span className="text-sm text-muted-foreground">—</span>;
  if (estagio in ESTAGIO_LABELS) {
    return <EstagioBadge estagio={estagio as EstagioPedido} />;
  }
  return <Badge variant="outline">{estagio}</Badge>;
}

export function ReceberNoDestinoPainel() {
  const qc = useQueryClient();
  const [receber, setReceber] = useState<Linha | null>(null);
  const [gaveta, setGaveta] = useState<{ id: string; linha?: Linha; rec?: Recebida } | null>(null);

  const pendentesQ = useQuery({
    queryKey: ["recebimento-loja", "pendentes"],
    queryFn: async (): Promise<Linha[]> => {
      const { data: nat, error: eN } = await (supabase as any)
        .from("naturezas_operacao").select("id").eq("exige_receber_destino", true);
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
      const rotulos = new Map<string, string>();
      if (centroIds.length) {
        const { data: cs, error: eC } = await (supabase as any)
          .from("centro_distribuicao").select("id, codigo, ativo, tipo, rotulo_curto, nome").in("id", centroIds);
        if (eC) throw eC;
        ((cs ?? []) as { id: string; codigo: string; ativo: boolean; tipo: string | null; rotulo_curto: string | null; nome: string | null }[]).forEach((c) => {
          rotulos.set(c.id, c.rotulo_curto ?? c.nome ?? c.codigo);
          if (c.ativo === true && (c.tipo === "armazem" || c.tipo === "showroom") && c.codigo !== "XPM-SC") codigos.set(c.id, c.codigo);
        });
      }
      const alvoBruto = abertos.filter((p) => p.destino_centro_id && codigos.has(p.destino_centro_id));
      if (!alvoBruto.length) return [];
      // Venda fora (Casa 22) segue pela remessa 5904 e nunca é recebida aqui — mesma regra do Painel.
      const { data: vs, error: eV } = await (supabase as any)
        .from("v_transferencias_internas").select("id, nf_numero, nf_data_emissao, finalidade_codigo, finalidade_rotulo").in("id", alvoBruto.map((p) => p.id));
      if (eV) throw eV;
      const vm = new Map(((vs ?? []) as any[]).map((x) => [x.id, x]));
      const alvo = alvoBruto.filter((p) => vm.get(p.id)?.finalidade_codigo !== "venda_fora");
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
        nf_numero: vm.get(p.id)?.nf_numero ?? null,
        nf_data_emissao: vm.get(p.id)?.nf_data_emissao ?? null,
        finalidade: vm.get(p.id)?.finalidade_rotulo ?? null,
        destinoRotulo: p.destino_centro_id ? rotulos.get(p.destino_centro_id) ?? null : null,
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
      // Venda fora (Casa 22) não é recebida nesta aba — mesma regra do Painel.
      const { data: vs, error: eV } = await (supabase as any)
        .from("v_transferencias_internas").select("id, finalidade_codigo").in("id", rs.map((r) => r.pedido_id));
      if (eV) throw eV;
      const vendaFora = new Set(
        ((vs ?? []) as { id: string; finalidade_codigo: string | null }[])
          .filter((x) => x.finalidade_codigo === "venda_fora")
          .map((x) => x.id)
      );
      const proprios = rs.filter((r) => !vendaFora.has(r.pedido_id));
      if (!proprios.length) return [];
      const { data: peds, error: e2 } = await (supabase as any)
        .from("pedidos").select("id, id_externo").in("id", proprios.map((r) => r.pedido_id));
      if (e2) throw e2;
      const m = new Map(((peds ?? []) as { id: string; id_externo: string | null }[]).map((p) => [p.id, p.id_externo]));
      return proprios.map((r) => ({ ...r, id_externo: m.get(r.pedido_id) ?? null }));
    },
  });

  useEffect(() => {
    if (pendentesQ.isError) toast.error(formatError(pendentesQ.error));
  }, [pendentesQ.isError, pendentesQ.error]);
  useEffect(() => {
    if (recebidasQ.isError) toast.error(formatError(recebidasQ.error));
  }, [recebidasQ.isError, recebidasQ.error]);

  const pendentes = pendentesQ.data ?? [];
  const atrasQ = useTrsAtrasados();
  const divQ = useTrsNaturezaDivergente();
  const diasAtraso = new Map((atrasQ.data ?? []).map((a) => [a.id_externo, a.dias_em_transito]));
  const divergentes = new Set((divQ.data ?? []).map((d) => d.id_externo));

  // Link vindo do alerta do Painel: ?receber_trs=TRS-xxxx abre o recebimento desse TRS.
  const [params, setParams] = useSearchParams();
  const alvoTrs = params.get("receber_trs");
  useEffect(() => {
    if (!alvoTrs || !pendentesQ.isSuccess) return;
    const l = pendentes.find((p) => p.id_externo === alvoTrs);
    if (l && !divergentes.has(alvoTrs)) setReceber(l);
    else if (!l) toast.error(`${alvoTrs} não está na lista a receber.`);
    setParams((p) => { const n = new URLSearchParams(p); n.delete("receber_trs"); return n; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvoTrs, pendentesQ.isSuccess, divQ.isSuccess]);
  const recebidas = recebidasQ.data ?? [];

  return (
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
                  <TableHead>NF</TableHead>
                  <TableHead>Emissão NF</TableHead>
                  <TableHead>Finalidade</TableHead>
                  <TableHead>Estágio</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Peças</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendentes.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => setGaveta({ id: p.id, linha: p })}>
                    <TableCell className="font-medium tabular-nums"><button type="button" className="underline-offset-2 hover:underline">{p.id_externo ?? p.id.slice(0, 8)}</button></TableCell>
                    <TableCell className="text-sm">{fmtData(p.data_pedido)}</TableCell>
                    <TableCell className="tabular-nums">{p.nf_numero ?? "—"}</TableCell>
                    <TableCell className="text-sm">{p.nf_data_emissao ? fmtData(p.nf_data_emissao) : "—"}</TableCell>
                    <TableCell className="text-sm">{p.finalidade ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <SeloEstagio estagio={p.estagio} />
                        {p.id_externo && diasAtraso.has(p.id_externo) && (
                          <Badge variant="outline" className="border-warning/50 bg-warning/10 text-warning-foreground">há {diasAtraso.get(p.id_externo)} dias</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.itens}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.pecas}</TableCell>
                    <TableCell>{p.destinoRotulo ?? p.destinoCodigo ?? "—"}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {p.id_externo && divergentes.has(p.id_externo) ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0}><Button size="sm" disabled>Receber</Button></span>
                          </TooltipTrigger>
                          <TooltipContent>NF com natureza errada — fale com o fiscal</TooltipContent>
                        </Tooltip>
                      ) : (
                        <BotaoGuardado slug="acao.trs_receber_destino" rotuloAcao="Receber transferência no centro de destino" size="sm" onClick={() => setReceber(p)}>Receber</BotaoGuardado>
                      )}
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
                        <TableRow key={r.pedido_id} className="cursor-pointer" onClick={() => setGaveta({ id: r.pedido_id, rec: r })}>
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

      <div className="text-right">
        <Link to="/vendas/produto/estoque/inventario" className="text-sm text-muted-foreground hover:text-foreground hover:underline">Fazer inventário →</Link>
      </div>

      <GavetaTransferencia
        pedidoId={gaveta?.id ?? null}
        onClose={() => setGaveta(null)}
        recebimento={gaveta?.rec ?? null}
        onReceber={gaveta?.linha && !(gaveta.linha.id_externo && divergentes.has(gaveta.linha.id_externo)) ? () => { const l = gaveta.linha!; setGaveta(null); setReceber(l); } : undefined}
      />

      {receber && (
        <ReceberTransferenciaDialog
          aberto
          onFechar={() => setReceber(null)}
          pedidoId={receber.id}
          titulo={receber.id_externo ?? receber.id.slice(0, 8)}
          destinoCodigo={receber.destinoCodigo}
          destinoRotulo={receber.destinoRotulo}
          onRecebido={() => {
            void qc.invalidateQueries({ queryKey: ["recebimento-loja"] });
            void qc.invalidateQueries({ queryKey: ["transferencias-internas"] });
            void qc.invalidateQueries({ queryKey: ["trs-recebimento"] });
          }}
        />
      )}
    </div>
  );
}
