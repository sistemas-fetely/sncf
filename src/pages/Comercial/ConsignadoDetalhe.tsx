import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertTriangle, Plus, Trash2, ExternalLink, HandCoins, Boxes, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { useContaCorrenteCliente } from "./Consignados";

const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

interface TituloRow {
  id: string;
  numero_titulo: string | null;
  valor_atual: number | null;
  status: string | null;
  data_emissao_nf: string | null;
  pedido_id: string | null;
}

interface EstoqueRow {
  parceiro_id: string;
  sku: string | null;
  qtd_enviada: number | null;
  qtd_devolvida: number | null;
  qtd_vendida_reportada: number | null;
  estoque_estimado: number | null;
}

interface EventoRow {
  id: string;
  pedido_id: string | null;
  tipo_evento: string;
  descricao: string | null;
  criado_em: string;
}

interface MovRow {
  id: string;
  data_transacao: string | null;
  descricao: string | null;
  valor: number | null;
  contraparte_nome: string | null;
  contraparte_documento: string | null;
}

function ErroBloco({ error }: { error: unknown }) {
  return (
    <div className="flex items-center gap-2 p-4 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4" />
      {(error as Error)?.message ?? "Falha ao carregar"}
    </div>
  );
}

export default function ConsignadoDetalhe() {
  const { parceiroId } = useParams<{ parceiroId: string }>();
  const qc = useQueryClient();

  const parceiroQ = useQuery({
    queryKey: ["consignado-parceiro", parceiroId],
    enabled: !!parceiroId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social, nome_fantasia, cnpj")
        .eq("id", parceiroId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null } | null;
    },
  });

  const contaQ = useContaCorrenteCliente(parceiroId);
  const cc = contaQ.data?.[0];
  const cnpjDigitos = soDigitos(parceiroQ.data?.cnpj);

  // pedidos do parceiro (base dos joins de títulos e eventos)
  const pedidosQ = useQuery({
    queryKey: ["consignado-pedidos", parceiroId],
    enabled: !!parceiroId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pedidos")
        .select("id, id_externo")
        .eq("parceiro_id", parceiroId);
      if (error) throw error;
      return (data ?? []) as { id: string; id_externo: string | null }[];
    },
  });
  const pedidoIds = useMemo(() => (pedidosQ.data ?? []).map((p) => p.id), [pedidosQ.data]);
  const pedidoRef = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const p of pedidosQ.data ?? []) m.set(p.id, p.id_externo);
    return m;
  }, [pedidosQ.data]);

  const titulosQ = useQuery({
    queryKey: ["consignado-titulos", parceiroId, pedidoIds.length],
    enabled: !!parceiroId && pedidosQ.isSuccess,
    queryFn: async (): Promise<TituloRow[]> => {
      if (pedidoIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("titulo_a_receber")
        .select("id, numero_titulo, valor_atual, status, data_emissao_nf, pedido_id")
        .eq("tipo_pagamento", "conta_corrente")
        .in("pedido_id", pedidoIds)
        .order("data_emissao_nf", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as TituloRow[];
    },
  });

  const estoqueQ = useQuery({
    queryKey: ["consignado-estoque", parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<EstoqueRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_estoque_estimado_parceiro")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .order("sku");
      if (error) throw error;
      return (data ?? []) as EstoqueRow[];
    },
  });

  const eventosQ = useQuery({
    queryKey: ["consignado-devolucoes", parceiroId, pedidoIds.length],
    enabled: !!parceiroId && pedidosQ.isSuccess,
    queryFn: async (): Promise<EventoRow[]> => {
      if (pedidoIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("pedido_eventos")
        .select("id, pedido_id, tipo_evento, descricao, criado_em")
        .in("tipo_evento", ["devolucao", "devolucao_estornada"])
        .in("pedido_id", pedidoIds)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventoRow[];
    },
  });

  // ── Acerto mensal ────────────────────────────────────────────
  const [acertoAberto, setAcertoAberto] = useState(false);
  const [movSelecionada, setMovSelecionada] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Record<string, unknown> | null>(null);

  const movsQ = useQuery({
    queryKey: ["consignado-movs-elegiveis", parceiroId, cnpjDigitos],
    enabled: acertoAberto && !!cnpjDigitos,
    queryFn: async (): Promise<MovRow[]> => {
      const { data, error } = await (supabase as any)
        .from("movimentacoes_bancarias")
        .select("id, data_transacao, descricao, valor, contraparte_nome, contraparte_documento")
        .eq("classe", "abatimento_conta_corrente_cliente")
        .eq("conciliado", false)
        .order("data_transacao", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as MovRow[]).filter(
        (m) => soDigitos(m.contraparte_documento) === cnpjDigitos
      );
    },
  });

  const aplicarAcerto = useMutation({
    mutationFn: async (movimentacaoId: string) => {
      const { data, error } = await (supabase as any).rpc(
        "registrar_acerto_conta_corrente_cliente",
        { p_movimentacao_id: movimentacaoId }
      );
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    onSuccess: (data) => {
      setResultado(data);
      setMovSelecionada(null);
      toast.success("Acerto aplicado");
      qc.invalidateQueries({ queryKey: ["consignados-conta-corrente"] });
      qc.invalidateQueries({ queryKey: ["consignado-titulos"] });
      qc.invalidateQueries({ queryKey: ["consignado-movs-elegiveis"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Relatório de vendas ──────────────────────────────────────
  const [vendasAberto, setVendasAberto] = useState(false);
  const [linhas, setLinhas] = useState<{ sku: string; quantidade: string }[]>([
    { sku: "", quantidade: "" },
  ]);
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState(() => new Date().toISOString().slice(0, 10));
  const [fonteArquivo, setFonteArquivo] = useState("");
  const [observacao, setObservacao] = useState("");

  const lancarVendas = useMutation({
    mutationFn: async () => {
      const payload = linhas
        .filter((l) => l.sku.trim() && Number(l.quantidade) > 0)
        .map((l) => ({
          parceiro_id: parceiroId,
          sku: l.sku.trim(),
          quantidade: Number(l.quantidade),
          periodo_inicio: periodoInicio || null,
          periodo_fim: periodoFim || null,
          data_recebimento: dataRecebimento || null,
          fonte_arquivo: fonteArquivo.trim() || null,
          observacao: observacao.trim() || null,
        }));
      if (payload.length === 0) throw new Error("Informe pelo menos um SKU com quantidade.");
      const { error } = await (supabase as any).from("consignado_venda_reportada").insert(payload);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} linha(s) lançada(s)`);
      setVendasAberto(false);
      setLinhas([{ sku: "", quantidade: "" }]);
      setObservacao("");
      setFonteArquivo("");
      qc.invalidateQueries({ queryKey: ["consignado-estoque", parceiroId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nome = parceiroQ.data?.razao_social ?? "Parceiro";

  const cards: { label: string; valor: string }[] = [
    { label: "Documentado", valor: formatBRL(cc?.documentado) },
    { label: "Pago", valor: formatBRL(cc?.pago) },
    { label: "Saldo devedor", valor: formatBRL(cc?.saldo_devedor) },
    { label: "Último pagamento", valor: formatDateBR(cc?.ultimo_pagamento) },
    { label: "Títulos", valor: String(cc?.n_titulos ?? 0) },
    { label: "Pagamentos", valor: String(cc?.n_pagamentos ?? 0) },
    { label: "Haver disponível", valor: formatBRL(cc?.haver_disponivel) },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <CasaPageHeader
        breadcrumb={[
          { label: "Comercial" },
          { label: "Consignados", to: "/comercial/consignados" },
          { label: nome },
        ]}
        title={nome}
        subtitle={parceiroQ.data?.cnpj ? `CNPJ ${parceiroQ.data.cnpj} · regime conta corrente` : "Regime conta corrente"}
      />

      {/* ═══ BLOCO FINANCEIRO ═══ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="font-serif text-xl flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-gold" /> Financeiro
          </h2>
          <Dialog
            open={acertoAberto}
            onOpenChange={(o) => {
              setAcertoAberto(o);
              if (!o) { setResultado(null); setMovSelecionada(null); }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">Aplicar acerto mensal</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Acerto mensal — {nome}</DialogTitle>
              </DialogHeader>
              {resultado ? (
                <div className="space-y-2 text-sm">
                  <p className="font-medium">Acerto registrado:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>Títulos pagos: <strong className="text-foreground">{String(resultado.titulos_pagos ?? "—")}</strong></li>
                    <li>Valor aplicado em títulos: <strong className="text-foreground">{formatBRL(Number(resultado.valor_aplicado_titulos ?? 0))}</strong></li>
                    <li>Sobra em haver: <strong className="text-foreground">{formatBRL(Number(resultado.sobra_haver ?? 0))}</strong></li>
                  </ul>
                </div>
              ) : movsQ.isError ? (
                <ErroBloco error={movsQ.error} />
              ) : movsQ.isLoading ? (
                <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (movsQ.data ?? []).length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground text-center">
                  Nenhuma movimentação elegível (classe abatimento conta corrente, não conciliada, CNPJ do parceiro).
                </p>
              ) : (
                <div className="max-h-80 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8" />
                        <TableHead>Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(movsQ.data ?? []).map((m) => (
                        <TableRow
                          key={m.id}
                          className={cn("cursor-pointer", movSelecionada === m.id && "bg-muted")}
                          onClick={() => setMovSelecionada(m.id)}
                        >
                          <TableCell>
                            <input type="radio" checked={movSelecionada === m.id} onChange={() => setMovSelecionada(m.id)} />
                          </TableCell>
                          <TableCell className="text-xs">{formatDateBR(m.data_transacao)}</TableCell>
                          <TableCell className="text-xs">
                            {m.descricao ?? "—"}
                            <span className="block text-muted-foreground">{m.contraparte_nome ?? ""}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{formatBRL(m.valor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <DialogFooter>
                {resultado ? (
                  <Button onClick={() => setAcertoAberto(false)}>Fechar</Button>
                ) : (
                  <Button
                    disabled={!movSelecionada || aplicarAcerto.isPending}
                    onClick={() => movSelecionada && aplicarAcerto.mutate(movSelecionada)}
                  >
                    {aplicarAcerto.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Confirmar acerto
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {contaQ.isError ? (
          <Card><CardContent className="p-0"><ErroBloco error={contaQ.error} /></CardContent></Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {cards.map((c) => (
              <Card key={c.label}>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
                  <p className="text-lg font-medium tabular-nums mt-1">{c.valor}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Títulos em conta corrente</CardTitle></CardHeader>
          <CardContent className="p-0">
            {titulosQ.isError ? (
              <ErroBloco error={titulosQ.error} />
            ) : titulosQ.isLoading ? (
              <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (titulosQ.data ?? []).length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">Nenhum título em conta corrente.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead className="text-right">Valor atual</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Emissão NF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(titulosQ.data ?? []).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium text-sm">{t.numero_titulo ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {t.pedido_id ? (
                          <Link to={`/pedidos/${t.pedido_id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                            {pedidoRef.get(t.pedido_id) ?? "pedido"} <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{formatBRL(t.valor_atual)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[11px]">{t.status ?? "—"}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateBR(t.data_emissao_nf)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ═══ BLOCO ESTOQUE ═══ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="font-serif text-xl flex items-center gap-2">
            <Boxes className="h-4 w-4 text-gold" /> Estoque estimado
          </h2>
          <Dialog open={vendasAberto} onOpenChange={setVendasAberto}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">Lançar relatório de vendas</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Relatório de vendas — {nome}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Período início</Label>
                    <Input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Período fim</Label>
                    <Input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Recebido em</Label>
                    <Input type="date" value={dataRecebimento} onChange={(e) => setDataRecebimento(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fonte / arquivo</Label>
                    <Input value={fonteArquivo} onChange={(e) => setFonteArquivo(e.target.value)} placeholder="planilha.xlsx" />
                  </div>
                </div>

                <div className="space-y-2">
                  {linhas.map((l, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        {i === 0 && <Label className="text-xs">SKU</Label>}
                        <Input
                          value={l.sku}
                          onChange={(e) => setLinhas((prev) => prev.map((p, j) => j === i ? { ...p, sku: e.target.value } : p))}
                          placeholder="SKU"
                        />
                      </div>
                      <div className="w-28 space-y-1">
                        {i === 0 && <Label className="text-xs">Qtd</Label>}
                        <Input
                          type="number"
                          min="0"
                          value={l.quantidade}
                          onChange={(e) => setLinhas((prev) => prev.map((p, j) => j === i ? { ...p, quantidade: e.target.value } : p))}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={linhas.length === 1}
                        onClick={() => setLinhas((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setLinhas((prev) => [...prev, { sku: "", quantidade: "" }])}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar linha
                  </Button>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Observação</Label>
                  <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button disabled={lancarVendas.isPending} onClick={() => lancarVendas.mutate()}>
                  {lancarVendas.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Lançar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {estoqueQ.isError ? (
              <ErroBloco error={estoqueQ.error} />
            ) : estoqueQ.isLoading ? (
              <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (estoqueQ.data ?? []).length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">Nenhum SKU consignado neste parceiro.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Enviado</TableHead>
                    <TableHead className="text-right">Devolvido</TableHead>
                    <TableHead className="text-right">Vendido reportado</TableHead>
                    <TableHead className="text-right">Estoque estimado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(estoqueQ.data ?? []).map((e) => (
                    <TableRow key={e.sku ?? Math.random()}>
                      <TableCell className="font-mono text-xs">{e.sku ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{Number(e.qtd_enviada ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{Number(e.qtd_devolvida ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{Number(e.qtd_vendida_reportada ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{Number(e.estoque_estimado ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ═══ BLOCO DEVOLUÇÕES ═══ */}
      <section className="space-y-4">
        <h2 className="font-serif text-xl flex items-center gap-2">
          <Undo2 className="h-4 w-4 text-gold" /> Devoluções
        </h2>
        <Card>
          <CardContent className="p-0">
            {eventosQ.isError ? (
              <ErroBloco error={eventosQ.error} />
            ) : eventosQ.isLoading ? (
              <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (eventosQ.data ?? []).length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">Nenhuma devolução registrada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Pedido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(eventosQ.data ?? []).map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(ev.criado_em).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px]",
                            ev.tipo_evento === "devolucao_estornada" && "text-muted-foreground"
                          )}
                        >
                          {ev.tipo_evento === "devolucao" ? "Devolução" : "Devolução estornada"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{ev.descricao ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {ev.pedido_id ? (
                          <Link to={`/pedidos/${ev.pedido_id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                            {pedidoRef.get(ev.pedido_id) ?? "pedido"} <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
