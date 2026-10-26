import { useQuery } from "@tanstack/react-query";
import { CodProduto } from "@/components/produto/CodProduto";
import { ArrowRight, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { EstagioBadge } from "@/components/pedidos/BadgesPedido";
import { ESTAGIO_LABELS, type EstagioPedido } from "@/types/pedido";
import { MiniaturaProduto } from "@/components/estoque/MiniaturaProduto";
import { useFotosPrincipais } from "@/hooks/useFotosProduto";
import { formatError } from "@/lib/format-error";
import { fmtData } from "@/lib/data";
import { formatBRL as formatCurrency } from "@/lib/format-currency";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface RecebimentoInfo { data_recebimento: string; divergencias: unknown[] | null }

interface Props {
  pedidoId: string | null;
  onClose: () => void;
  onReceber?: () => void;
  recebimento?: RecebimentoInfo | null;
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{rotulo}</div>
      <div className="text-sm">{children || "—"}</div>
    </div>
  );
}

export function GavetaTransferencia({ pedidoId, onClose, onReceber, recebimento }: Props) {
  const q = useQuery({
    queryKey: ["trs-gaveta", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data: v, error: e1 } = await (supabase as any).from("v_transferencias_internas").select("*").eq("id", pedidoId).maybeSingle();
      if (e1) throw e1;
      const { data: ped, error: e0 } = await (supabase as any).from("pedidos").select("observacao_pedido").eq("id", pedidoId).maybeSingle();
      if (e0) throw e0;
      const { data: nfs, error: e2 } = await (supabase as any).from("nfs_emitidas")
        .select("numero,serie,chave_acesso,data_emissao,situacao,pdf_url,xml_url,substituida_por_nf_id")
        .eq("pedido_venda_id", pedidoId).order("data_emissao", { ascending: false });
      if (e2) throw e2;
      const lista = (nfs ?? []) as any[];
      const nf = lista.find((n) => v?.nf_numero && n.numero === v.nf_numero) ?? lista.find((n) => !n.substituida_por_nf_id) ?? lista[0] ?? null;
      const { data: its, error: e3 } = await (supabase as any).from("pedido_itens")
        .select("id,sku,descricao,quantidade,valor_unitario,subtotal,ordem").eq("pedido_id", pedidoId).order("ordem");
      if (e3) throw e3;
      const itens = (its ?? []) as any[];
      const skus = [...new Set(itens.map((i) => i.sku).filter(Boolean))];
      const prods = new Map<string, { cod_cadastro: string | null; nome_comercial: string | null }>();
      if (skus.length) {
        const { data: ps, error: e4 } = await (supabase as any).from("sncf_produtos").select("sku,cod_cadastro,nome_comercial").in("sku", skus);
        if (e4) throw e4;
        (ps ?? []).forEach((p: any) => prods.set(p.sku, p));
      }
      const codsC = [v?.origem_codigo, v?.destino_codigo].filter(Boolean);
      const rotulos = new Map<string, string>();
      if (codsC.length) {
        const { data: cs, error: e5 } = await (supabase as any).from("centro_distribuicao").select("codigo,rotulo_curto,nome").in("codigo", codsC);
        if (e5) throw e5;
        (cs ?? []).forEach((c: any) => rotulos.set(c.codigo, c.rotulo_curto ?? c.nome ?? c.codigo));
      }
      return { v, rotulos, obs: ped?.observacao_pedido as string | null, nf, itens: itens.map((i) => ({ ...i, prod: prods.get(i.sku) ?? null })) };
    },
  });
  const d = q.data;
  const fotos = useFotosPrincipais((d?.itens ?? []).map((i: any) => i.prod?.cod_cadastro));
  const v = d?.v;
  const rot = (c: string | null) => (c ? d?.rotulos.get(c) ?? c : null);
  const pecas = (d?.itens ?? []).reduce((s: number, i: any) => s + Number(i.quantidade ?? 0), 0);
  const valor = (d?.itens ?? []).reduce((s: number, i: any) => s + Number(i.subtotal ?? Number(i.quantidade ?? 0) * Number(i.valor_unitario ?? 0)), 0);
  const divs = Array.isArray(recebimento?.divergencias) ? recebimento!.divergencias! : [];

  return (
    <Sheet open={!!pedidoId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="superficie-tabelas w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{v?.id_externo ?? "Transferência"}</SheetTitle>
        </SheetHeader>
        {q.isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : q.isError ? (
          <p className="p-4 text-sm text-destructive">Falha ao carregar: {formatError(q.error)}</p>
        ) : d && (
          <div className="mt-4 space-y-5">
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {v?.estagio && (v.estagio in ESTAGIO_LABELS ? <EstagioBadge estagio={v.estagio as EstagioPedido} /> : <Badge variant="outline">{v.estagio}</Badge>)}
                {v?.finalidade_rotulo && <Badge variant="secondary">{v.finalidade_rotulo}</Badge>}
              </div>
              <div className="flex items-center gap-2 text-sm font-medium">
                {rot(v?.origem_codigo) ?? "—"} <ArrowRight className="h-4 w-4 text-muted-foreground" /> {rot(v?.destino_codigo) ?? "—"}
              </div>
              {d.obs && <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm">{d.obs}</p>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Campo rotulo="Pedido">{fmtData(v?.data_pedido)}</Campo>
                <Campo rotulo="NF">{v?.nf_data_emissao ? fmtData(v.nf_data_emissao) : ""}</Campo>
                <Campo rotulo="Previsão">{v?.data_entrega_prevista ? fmtData(v.data_entrega_prevista) : ""}</Campo>
                <Campo rotulo="Entrega">{v?.entregue_em ? fmtData(v.entregue_em) : ""}</Campo>
                {recebimento && <Campo rotulo="Recebido em">{fmtData(recebimento.data_recebimento)}</Campo>}
              </div>
            </section>

            <section className="space-y-2 rounded-md border p-3">
              <h4 className="text-sm font-medium">Nota fiscal</h4>
              {d.nf ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <Campo rotulo="Número">{d.nf.numero}</Campo>
                    <Campo rotulo="Série">{d.nf.serie}</Campo>
                    <Campo rotulo="Emissão">{fmtData(d.nf.data_emissao)}</Campo>
                  </div>
                  <Campo rotulo="Chave"><span className="break-all font-mono text-[11px]">{d.nf.chave_acesso}</span></Campo>
                  <div className="flex gap-3 text-sm">
                    {d.nf.pdf_url && <a href={d.nf.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline"><FileText className="h-4 w-4" /> PDF</a>}
                    {d.nf.xml_url && <a href={d.nf.xml_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline"><FileText className="h-4 w-4" /> XML</a>}
                  </div>
                </>
              ) : <p className="text-sm text-muted-foreground">Sem NF emitida para este pedido.</p>}
            </section>

            {recebimento && (
              <section className="space-y-2 rounded-md border p-3">
                <h4 className="text-sm font-medium">Divergências no recebimento</h4>
                {divs.length === 0 ? <p className="text-sm text-muted-foreground">Recebido conforme.</p> : (
                  <ul className="space-y-1 text-sm">
                    {divs.map((x: any, i) => (
                      <li key={i} className="text-destructive">
                        {typeof x === "object" && x ? Object.entries(x).map(([k, val]) => `${k}: ${String(val)}`).join(" · ") : String(x)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <section className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h4 className="text-sm font-medium">Itens</h4>
                <span className="text-sm text-muted-foreground tabular-nums">{pecas} peças · {formatCurrency(valor)}</span>
              </div>
              <div className="rounded-md border">
                <Table className="text-[12px]">
                  <TableHeader><TableRow>
                    <TableHead className="w-[52px]" /><TableHead>Código</TableHead><TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead><TableHead className="text-right">Valor (custo)</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {d.itens.map((i: any) => (
                      <TableRow key={i.id}>
                        <TableCell><MiniaturaProduto url={i.prod?.cod_cadastro ? fotos.data?.get(i.prod.cod_cadastro) : null} nome={i.prod?.nome_comercial ?? i.descricao} /></TableCell>
                        <TableCell><CodProduto chave={i.sku} /></TableCell>
                        <TableCell>{i.prod?.nome_comercial ?? i.descricao ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(i.quantidade ?? 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(Number(i.subtotal ?? Number(i.quantidade ?? 0) * Number(i.valor_unitario ?? 0)))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            {onReceber && (
              <div className="flex justify-end">
                <BotaoGuardado slug="acao.trs_receber_destino" rotuloAcao="Receber transferência no centro de destino" onClick={onReceber}>Receber</BotaoGuardado>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
