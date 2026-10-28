import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Inbox, Loader2, PackageCheck, Undo2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEstadoTela } from "@/lib/navegacao";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Selo } from "@/components/ui/selo";
import { SeloServicoCorreios } from "./expedicao-sp/SeloServicoCorreios";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { cn } from "@/lib/utils";
import { fmtDataHora } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { EstacaoConferencia } from "./expedicao-sp/EstacaoConferencia";
import { DespachoB2b } from "./expedicao-sp/DespachoB2b";
import { EstacaoDespacho } from "./expedicao-sp/EstacaoDespacho";
import { EstacaoEmbalagem } from "./expedicao-sp/EstacaoEmbalagem";
import { EstacaoDocumentos } from "./expedicao-sp/EstacaoDocumentos";
import { EstacaoSeparacao } from "./expedicao-sp/EstacaoSeparacao";
import { TrilhaPedido } from "./expedicao-sp/TrilhaPedido";
import { SolicitacaoNf } from "./expedicao-sp/SolicitacaoNf";
import type { GrupoColeta } from "./expedicao-sp/EstacaoDespacho";
import {
  ColunaQuadro,
  pedidoEhB2B, colunasQuadro, tempoParado, CENTRO_SITE_SP,
  embalagemDoPedido, modoEntregaVendaDireta, pedidoEhVendaDireta, rotuloEntregaVendaDireta,
  type CancelamentoMesa, type Estacao, type EventoMesa, type ItemConferido, type PedidoMesa,
} from "./expedicao-sp/tipos";
import {
  useAguardandoNfMesa, useCancelamentosMesaSp, useCaixasSugeridas, useChecklistEmbalagem, useDevolverFila, useDespachar, useDespacharLote, useEmbalar, useEncerrarCancelado, useEventosMesaSp,
  useIdentidadesMesaSp, useImagensProdutosMesa, useItensPedidoMesa, useMarcacoesEmbalagem, useMarcarRotina, useModaisEntrega, useTrocarModal,
  useEtapasMesaSp, useIniciarConferencia, usePedidosMesaSp, usePuxarPedido, useVoltarSeparacao, useRegistrarConferencia, useRegrasModal, useVdModosModal,
} from "./expedicao-sp/useMesaSp";

/**
 * Mesa de Expedição SP — frente `frente-descida-b2c-split-sp`.
 *
 * Operação real: ~10 pedidos/dia, UM operador, uma bancada. Por isso a tela é
 * uma só e o pedido a atravessa: Fila → Separação → Conferência → Embalagem →
 * Despacho. Nada de navegar entre telas com a caixa na mão.
 *
 * FONTE-ÚNICA: estágio macro é `pedidos.estagio`; a sub-estação é derivada do
 * etapa vem PRONTA de `vw_mesa_sp_quadro`. A tela não deriva estação nenhuma —
 * até a entrada em conferência é transição gravada (`fn_mesa_sp_iniciar_conferencia`).
 */

/** Qual modal a embalagem registrou — o despacho começa por ele. */
function modalDoEmbalado(eventos: EventoMesa[]): string | null {
  return embalagemDoPedido(eventos)?.modal ?? null;
}

export default function ExpedicaoSp() {
  const pedidosQ = usePedidosMesaSp();
  // TELA-LEMBRA-ONDE-EU-ESTAVA: filtro de CD na URL ("" = Todos; sem CD conta como Site SP).
  const [navMesa, setNavMesa] = useEstadoTela({ cd: "" });
  const filtroCd = navMesa.cd;
  // Opções: CDs habilitados em algum canal (centro_canal) do mesmo estabelecimento do Site SP + os que aparecem nos pedidos.
  const cdsMesaQ = useQuery({
    queryKey: ["mesa-sp", "cds-filtro"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: cc, error } = await sb.from("centro_canal").select("centro_codigo").eq("habilitado", true);
      if (error) throw error;
      const cods = [...new Set(((cc ?? []) as { centro_codigo: string }[]).map((r) => r.centro_codigo))];
      if (!cods.includes(CENTRO_SITE_SP)) cods.push(CENTRO_SITE_SP);
      const { data: cds, error: e2 } = await sb.from("centro_distribuicao").select("id, codigo, nome, rotulo_curto, centro_fiscal_id").in("codigo", cods);
      if (e2) throw e2;
      const lista = (cds ?? []) as { id: string; codigo: string; nome: string | null; rotulo_curto: string | null; centro_fiscal_id: string | null }[];
      const sp = lista.find((c) => c.codigo === CENTRO_SITE_SP);
      const estabSp = sp ? (sp.centro_fiscal_id ?? sp.id) : null;
      return lista.filter((c) => (c.centro_fiscal_id ?? c.id) === estabSp)
        .map((c) => ({ codigo: c.codigo, rotulo: c.rotulo_curto ?? c.nome ?? c.codigo }));
    },
  });
  const opcoesCd = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cdsMesaQ.data ?? []) m.set(c.codigo, c.rotulo);
    for (const p of pedidosQ.data ?? []) if (p.cd_codigo) m.set(p.cd_codigo, p.cd_rotulo ?? p.cd_codigo);
    if (filtroCd && !m.has(filtroCd)) m.set(filtroCd, filtroCd);
    return [...m.entries()].map(([codigo, rotulo]) => ({ codigo, rotulo }));
  }, [pedidosQ.data, filtroCd, cdsMesaQ.data]);
  const pedidos = useMemo(
    () => (pedidosQ.data ?? []).filter((p) => !filtroCd || (p.cd_codigo ?? CENTRO_SITE_SP) === filtroCd),
    [pedidosQ.data, filtroCd],
  );
  const eventosQ = useEventosMesaSp(pedidos.map((p) => p.id));
  const identidadesQ = useIdentidadesMesaSp(pedidos.map((p) => p.id));
  const modaisQ = useModaisEntrega();
  const regrasQ = useRegrasModal();
  const vdModosQ = useVdModosModal();
  const aguardandoNfQ = useAguardandoNfMesa();
  const aguardandoNfPorPedido = useMemo(
    () => new Map((aguardandoNfQ.data ?? []).map((l) => [l.pedido_id, l])),
    [aguardandoNfQ.data],
  );
  const cancelamentosQ = useCancelamentosMesaSp(pedidos.map((p) => p.id));
  const cancelamentos = useMemo(
    () => cancelamentosQ.data ?? new Map<string, CancelamentoMesa>(),
    [cancelamentosQ.data],
  );
  const [devolverAberto, setDevolverAberto] = useState(false);
  const [motivoDevolver, setMotivoDevolver] = useState("");
  const [encerrarAberto, setEncerrarAberto] = useState(false);

  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const eventosPorPedido = useMemo(() => {
    const mapa = new Map<string, EventoMesa[]>();
    for (const e of eventosQ.data ?? []) {
      const lista = mapa.get(e.pedido_id);
      if (lista) lista.push(e);
      else mapa.set(e.pedido_id, [e]);
    }
    return mapa;
  }, [eventosQ.data]);

  const etapasQ = useEtapasMesaSp();
  const colunas = useMemo(() => colunasQuadro(etapasQ.data ?? []), [etapasQ.data]);
  /** Etapa de cada pedido: só o que a view devolveu. */
  const estacaoDe = useMemo(
    () => new Map(pedidos.map((p) => [p.id, p.etapa as Estacao])),
    [pedidos],
  );

  const fila = pedidos.filter((p) => p.etapa === "fila");
  /** "Puxar próximo" pula pedido com cancelamento solicitado. */
  const proximoDaFila = fila.find((p) => !cancelamentos.has(p.id)) ?? null;
  const naMesa = pedidos.filter((p) => {
    const estacao = estacaoDe.get(p.id);
    return estacao === "separacao" || estacao === "conferencia" || estacao === "embalagem" || estacao === "documentos";
  });
  const modalPorCodigo = useMemo(
    () => new Map((modaisQ.data ?? []).map((modal) => [modal.codigo, modal])),
    [modaisQ.data],
  );
  const prontos = pedidos.filter((p) => estacaoDe.get(p.id) === "despacho");
  const aguardandoNf = pedidos.filter((p) => estacaoDe.get(p.id) === "aguardando_nf");
  const nfEmitida = pedidos.filter((p) => estacaoDe.get(p.id) === "nf_emitida");
  const aguardandoRetirada = prontos.filter((p) => {
    const codigo = embalagemDoPedido(eventosPorPedido.get(p.id) ?? [])?.modal;
    return codigo ? modalPorCodigo.get(codigo)?.sem_despacho === true : false;
  });
  const prontosDespacho = prontos.filter((p) => !aguardandoRetirada.some((r) => r.id === p.id));

  /** Pedidos da mesa agrupados por estação, na ordem da bancada. */
  const gruposMesa = useMemo(
    () =>
      colunas
        .filter((c) => c.codigo === "separacao" || c.codigo === "conferencia" || c.codigo === "embalagem" || c.codigo === "documentos")
        .map((c) => ({ estacao: c.codigo, rotulo: c.rotulo, doGrupo: naMesa.filter((p) => p.etapa === c.codigo) }))
        .filter(({ doGrupo }) => doGrupo.length > 0),
    [naMesa, colunas],
  );

  // Seleção segue a bancada: o pedido que está na mesa é o pedido da tela.
  useEffect(() => {
    if (selecionadoId && pedidos.some((p) => p.id === selecionadoId)) return;
    setSelecionadoId(naMesa[0]?.id ?? aguardandoRetirada[0]?.id ?? prontosDespacho[0]?.id ?? fila[0]?.id ?? aguardandoNf[0]?.id ?? nfEmitida[0]?.id ?? null);
  }, [pedidos, naMesa, aguardandoRetirada, prontosDespacho, fila, aguardandoNf, nfEmitida, selecionadoId]);

  const selecionado = pedidos.find((p) => p.id === selecionadoId) ?? null;
  const identidadesSelecionado = selecionado ? identidadesQ.data?.get(selecionado.id) : undefined;
  const eventosSelecionado = selecionado ? eventosPorPedido.get(selecionado.id) ?? [] : [];
  const estacaoSelecionada = selecionado ? estacaoDe.get(selecionado.id) ?? "fila" : "fila";
  const selecionadoEhB2B = selecionado ? pedidoEhB2B(selecionado.canal) : false;
  const selecionadoEhVD = selecionado ? pedidoEhVendaDireta(selecionado.id_externo) : false;
  const modoEntregaSelecionado = selecionadoEhVD ? modoEntregaVendaDireta(selecionado?.endereco_entrega) : null;
  const modalVdSelecionado = modoEntregaSelecionado
    ? vdModosQ.data?.find((item) => item.modo.toLowerCase() === modoEntregaSelecionado)?.modal_codigo ?? null
    : null;
  const cancelamentoSelecionado = selecionado ? cancelamentos.get(selecionado.id) ?? null : null;
  const bloqueado = cancelamentoSelecionado != null;
  const podeDevolver =
    estacaoSelecionada === "separacao" || estacaoSelecionada === "conferencia" || estacaoSelecionada === "embalagem";
  const selecionadoAguardandoRetirada = selecionado
    ? aguardandoRetirada.some((pedido) => pedido.id === selecionado.id)
    : false;

  const itensQ = useItensPedidoMesa(selecionado?.id ?? null);
  // Fotos de conferência visual por SKU — se a leitura falhar, a mesa segue sem fotos.
  const imagensQ = useImagensProdutosMesa(
    (itensQ.data ?? []).map((i) => i.sku).filter((s): s is string => !!s),
  );
  const caixasQ = useCaixasSugeridas(
    selecionado && estacaoSelecionada === "embalagem" ? selecionado.id : null,
  );

  const puxar = usePuxarPedido();
  const conferir = useRegistrarConferencia();
  const embalar = useEmbalar();
  const trocarModal = useTrocarModal();
  const despachar = useDespachar();
  const despacharLote = useDespacharLote();
  const devolver = useDevolverFila();
  const encerrar = useEncerrarCancelado();
  const checklistQ = useChecklistEmbalagem();
  // Marcação da rotina é ato gravado: a lista vem do banco DESTE pedido, então
  // trocar de pedido já traz a rotina dele — não há estado de tela para zerar.
  const marcacoesQ = useMarcacoesEmbalagem(selecionado?.id ?? null);
  const marcarRotina = useMarcarRotina();

  /**
   * Fila de coleta: TODA a mesa em despacho, agrupada pelo modal que a embalagem
   * registrou. O Correios não busca um pedido, busca as caixas do dia — por isso
   * a lista não é a do pedido selecionado. Modal desconhecido na dimensão fica
   * num grupo próprio, sem lote: caixa invisível seria pior que caixa estranha.
   */
  const gruposColeta = useMemo<GrupoColeta[]>(() => {
    const porModal = new Map<string, GrupoColeta>();
    for (const p of prontosDespacho) {
      const emb = embalagemDoPedido(eventosPorPedido.get(p.id) ?? []);
      if (!emb) continue;
      const codigo = emb.modal ?? "SEM_MODAL";
      const dim = (modaisQ.data ?? []).find((m) => m.codigo === codigo) ?? null;
      const grupo = porModal.get(codigo) ?? {
        modalCodigo: codigo,
        modalNome: dim?.nome ?? (emb.modal ?? "Modal não registrado"),
        temRastreioAutomatico: dim?.tem_rastreio_automatico ?? false,
        semDespacho: dim?.sem_despacho ?? false,
        caixas: [],
      };
      grupo.caixas.push({
        pedido_id: p.id,
        id_externo: p.id_externo,
        cliente: p.cliente_nome ?? "cliente sem nome",
        volumes: emb.volumes,
        peso_kg: emb.peso_kg,
        embaladoEm: emb.criado_em,
      });
      porModal.set(codigo, grupo);
    }
    // Quem espera mais tempo primeiro, dentro do grupo e entre grupos.
    const grupos = [...porModal.values()];
    for (const g of grupos) g.caixas.sort((a, b) => a.embaladoEm.localeCompare(b.embaladoEm));
    return grupos.sort((a, b) => a.caixas[0].embaladoEm.localeCompare(b.caixas[0].embaladoEm));
  }, [prontosDespacho, eventosPorPedido, modaisQ.data]);

  const iniciarConferencia = useIniciarConferencia();
  const voltarSeparacao = useVoltarSeparacao();

  function registrarConferencia(itens: ItemConferido[], ok: boolean, motivo: string | null) {
    if (!selecionado) return;
    const pedidoId = selecionado.id;
    conferir.mutate(
      { p_pedido_id: pedidoId, p_itens: itens, p_ok: ok, p_motivo: motivo },
    );
  }

  const erro = pedidosQ.error ?? cdsMesaQ.error ?? eventosQ.error ?? identidadesQ.error ?? modaisQ.error ?? regrasQ.error ?? etapasQ.error ?? vdModosQ.error ?? cancelamentosQ.error;

  return (
    <PageShell variant="dados">
      <PageHeader
        icone={PackageCheck}
        titulo="Mesa de Expedição SP"
        estado={
          pedidosQ.isLoading
            ? "Carregando a bancada…"
            : `${fila.length} na fila · ${naMesa.length} na mesa · ${prontosDespacho.length + nfEmitida.length} prontos p/ despacho · ${aguardandoRetirada.length} aguardando retirada · ${aguardandoNf.length} aguardando NF`
        }
      />

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">CD</span>
        <Select value={filtroCd || "__todos"} onValueChange={(v) => setNavMesa({ cd: v === "__todos" ? "" : v })}>
          <SelectTrigger className="h-8 w-[160px]" aria-label="Filtrar por CD"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__todos">Todos</SelectItem>
            {opcoesCd.map((o) => <SelectItem key={o.codigo} value={o.codigo}>{o.rotulo}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Quadro da bancada: uma coluna por etapa ativa de `mesa_sp_etapa`. */}
      <QuadroBancada
        colunas={colunas}
        pedidos={pedidos}
        cancelamentos={cancelamentos}
        selecionadoId={selecionadoId}
        onSelecionar={setSelecionadoId}
      />

      {erro && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive-strong">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {formatError(erro)}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        {/* ── Coluna 1: fila de entrada e pedidos já na bancada ───────────── */}
        <div className="space-y-4 lg:col-span-3">
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">Fila · {fila.length}</p>

              {pedidosQ.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : fila.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum pedido aguardando — pedidos da matriz SP aparecem aqui.
                </p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {fila.map((p) => (
                      <li key={p.id}>
                        <LinhaPedido
                          pedido={p}
 cancelamento={cancelamentos.get(p.id)}
                          ativo={p.id === selecionadoId}
                          rotulo="na fila"
                          onSelecionar={() => setSelecionadoId(p.id)}
                        />
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    onClick={() => proximoDaFila && puxar.mutate({ p_pedido_id: proximoDaFila.id })}
                    disabled={puxar.isPending || !proximoDaFila}
                  >
                    {puxar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                    Puxar próximo
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">Na mesa · {naMesa.length}</p>
              {naMesa.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Bancada livre. Puxe o próximo da fila para começar.
                </p>
              ) : (
                <div className="space-y-3">
                  {gruposMesa.map(({ estacao, rotulo, doGrupo }) => (
                    <div key={estacao} className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {rotulo} · {doGrupo.length}
                      </p>
                      <ul className="space-y-2">
                        {doGrupo.map((p) => (
                          <li key={p.id}>
                            <LinhaPedido
                              pedido={p}
 cancelamento={cancelamentos.get(p.id)}
                              ativo={p.id === selecionadoId}
                              onSelecionar={() => setSelecionadoId(p.id)}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {aguardandoRetirada.length > 0 && <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">Aguardando retirada · {aguardandoRetirada.length}</p>
              <ul className="space-y-2">
                {aguardandoRetirada.map((p) => (
                  <li key={p.id}>
                    <LinhaPedido pedido={p} cancelamento={cancelamentos.get(p.id)} ativo={p.id === selecionadoId} rotulo="balcão" onSelecionar={() => setSelecionadoId(p.id)} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>}

          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">
                {colunas.find((c) => c.codigo === "aguardando_nf")?.rotulo ?? "aguardando_nf"} · {aguardandoNf.length}
              </p>
              {aguardandoNfQ.isError && (
                <p className="text-xs text-destructive">{formatError(aguardandoNfQ.error)}</p>
              )}
              {aguardandoNf.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum B2B embalado aguardando NF.</p>
              ) : (
                <ul className="space-y-2">
                  {aguardandoNf.map((p) => {
                    const emb = embalagemDoPedido(eventosPorPedido.get(p.id) ?? []);
                    return (
                      <li key={p.id} className="space-y-1.5">
                        <LinhaPedido
                          pedido={p}
                          cancelamento={cancelamentos.get(p.id)}
                          ativo={p.id === selecionadoId}
                          rotulo={medidasColeta(emb?.volumes ?? null, emb?.peso_kg ?? null)}
                          onSelecionar={() => setSelecionadoId(p.id)}
                        />
                        <div className="pl-2">
                          <SolicitacaoNf linha={aguardandoNfPorPedido.get(p.id)} compacto />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">
                Prontos p/ despacho · {prontosDespacho.length + nfEmitida.length}
              </p>
              {nfEmitida.length > 0 && (
                <ul className="space-y-2">
                  {nfEmitida.map((p) => {
                    const emb = embalagemDoPedido(eventosPorPedido.get(p.id) ?? []);
                    const nf = identidadesQ.data?.get(p.id)?.nf_refs;
                    return (
                      <li key={p.id}>
                        <LinhaPedido
                          pedido={p}
 cancelamento={cancelamentos.get(p.id)}
                          ativo={p.id === selecionadoId}
                          rotulo={`${nf ? `NF ${nf} · ` : ""}${medidasColeta(emb?.volumes ?? null, emb?.peso_kg ?? null)}`}
                          onSelecionar={() => setSelecionadoId(p.id)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
              {prontosDespacho.length === 0 && nfEmitida.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma caixa pronta para despacho.
                </p>
              ) : (
                <div className="space-y-3">
                  {gruposColeta.map((grupo) => (
                    <div key={grupo.modalCodigo} className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {grupo.modalNome} · {grupo.caixas.length}
                      </p>
                      <ul className="space-y-2">
                        {grupo.caixas.map((caixa) => (
                          <li key={caixa.pedido_id}>
                            <button
                              type="button"
                              onClick={() => setSelecionadoId(caixa.pedido_id)}
                              className={cn(
                                "w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent",
                                caixa.pedido_id === selecionadoId && "border-primary bg-accent",
                              )}
                            >
                              <span className="block truncate text-sm">
                                {caixa.id_externo} · {caixa.cliente}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {medidasColeta(caixa.volumes, caixa.peso_kg)} · {esperaColeta(caixa.embaladoEm)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Coluna 2: a estação do pedido selecionado ───────────────────── */}
        <div className="space-y-4 lg:col-span-6">
          {!selecionado ? (
            <EstadoVazio
              icone={Inbox}
              titulo="Bancada vazia"
              mensagem="Nenhum pedido aguardando — pedidos da matriz SP aparecem aqui assim que a bifurcação B2C ligar."
            />
          ) : (
            <>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                    <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">
                       {selecionado.cliente_nome ?? "cliente sem nome"}
                    </p>
                     <IdentidadesPedido
                       sncf={selecionado.id_externo}
                       bling={identidadesSelecionado?.bling_pedido_numero}
                       nf={identidadesSelecionado?.nf_refs}
                       loja={identidadesSelecionado?.order_name}
                     />
                     {selecionadoEhB2B && (
                       <div className="flex flex-wrap items-center gap-2">
                         <Selo estado="info">B2B</Selo>
                         <span className="text-xs text-muted-foreground">
                           {selecionado.cliente_nome ?? "razão social não informada"}
                         </span>
                       </div>
                     )}
                     {(() => {
                       const embSel = embalagemDoPedido(eventosSelecionado);
                       const correios = embSel?.modal
                         ? modalPorCodigo.get(embSel.modal)?.exige_etiqueta_correios === true
                         : !!selecionado.servico_correios;
                       return correios ? (
                         <SeloServicoCorreios
                           servico={selecionado.servico_correios}
                           freteValor={selecionado.frete_cliente_valor}
                           freteGratis={selecionado.frete_gratis}
                         />
                       ) : null;
                     })()}
                     {selecionadoEhVD && (
                       <div className="flex flex-wrap items-center gap-2">
                         <Selo estado="info">Site SP · venda direta</Selo>
                         <span className="text-xs text-muted-foreground">
                           Entrega: {rotuloEntregaVendaDireta(modoEntregaSelecionado)}
                         </span>
                       </div>
                     )}
                    <p className="text-xs text-muted-foreground">
                      {formatBRL(selecionado.valor_liquido)} · recebido {fmtDataHora(selecionado.recebido_em)}
                    </p>
                    {cancelamentoSelecionado && (
                      <div className="space-y-0.5">
                        <Selo estado="destructive">Cancelamento solicitado · {cancelamentoSelecionado.numero}</Selo>
                        {cancelamentoSelecionado.motivo && (
                          <p className="text-xs text-muted-foreground">Motivo: {cancelamentoSelecionado.motivo}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {podeDevolver && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setMotivoDevolver(""); setDevolverAberto(true); }}
                        disabled={devolver.isPending}
                      >
                        <Undo2 aria-hidden="true" />
                        Devolver p/ fila
                      </Button>
                    )}
                    <Selo estado={selecionado.estourou_limite ? "warning" : "info"}>
                      {selecionado.etapa_rotulo ?? selecionado.etapa} · {tempoParado(selecionado.minutos_parado)}
                    </Selo>
                  </div>
                </CardContent>
              </Card>

              {cancelamentoSelecionado && (
                <div className="flex items-start justify-between gap-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive-strong">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      Cliente pediu cancelamento ({cancelamentoSelecionado.numero}). Não siga com este pedido — devolva os itens à prateleira.
                    </span>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setEncerrarAberto(true)}
                    className="shrink-0"
                  >
                    Itens na prateleira · encerrar pedido
                  </Button>
                </div>
              )}

              {cancelamentoSelecionado && (
                <AlertDialog open={encerrarAberto} onOpenChange={setEncerrarAberto}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Encerrar {selecionado.id_externo}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Confirme que os itens já voltaram à prateleira. O pedido sai da mesa como cancelado.
                        O reembolso e a NF seguem no funil de devolução ({cancelamentoSelecionado.numero}).
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={encerrar.isPending}>Voltar</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={encerrar.isPending}
                        onClick={(e) => {
                          e.preventDefault();
                          const pedidoId = selecionado.id;
                          encerrar.mutate(
                            { p_pedido_id: pedidoId },
                            {
                              onSuccess: () => {
                                setSelecionadoId(null);
                                setEncerrarAberto(false);
                              },
                            },
                          );
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {encerrar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                        Confirmar e encerrar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              <Dialog open={devolverAberto} onOpenChange={setDevolverAberto}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Devolver {selecionado.id_externo} para a fila</DialogTitle>
                    <DialogDescription>
                      O pedido volta para pré-separação. Informe o motivo — ele fica na trilha do pedido.
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    value={motivoDevolver}
                    onChange={(e) => setMotivoDevolver(e.target.value)}
                    placeholder="Motivo da devolução"
                    rows={3}
                  />
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDevolverAberto(false)} disabled={devolver.isPending}>
                      Voltar
                    </Button>
                    <Button
                      disabled={motivoDevolver.trim() === "" || devolver.isPending}
                      onClick={() => {
                        const pedidoId = selecionado.id;
                        devolver.mutate(
                          { p_pedido_id: pedidoId, p_motivo: motivoDevolver.trim() },
                          {
                            onSuccess: () => {
                              setDevolverAberto(false);
                            },
                          },
                        );
                      }}
                    >
                      {devolver.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                      Devolver p/ fila
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {estacaoSelecionada === "nf_emitida" && (() => {
                const emb = embalagemDoPedido(eventosSelecionado);
                const nf = identidadesSelecionado?.nf_refs;
                return (
                  <DespachoB2b
                    pedidoId={selecionado.id}
                    modalCodigo={emb?.modal ?? null}
                    modais={modaisQ.data ?? []}
                    medidas={`Embalado ${emb?.volumes ?? "?"} vol · ${emb?.peso_kg ?? "?"} kg`}
                    nfRotulo={nf ? `NF ${nf}` : null}
                    clienteNome={selecionado.cliente_nome}
                    despachando={despachar.isPending}
                    bloqueado={bloqueado}
                    onDespachar={(modal, referencia, executor) =>
                      despachar.mutate({
                        p_pedido_id: selecionado.id,
                        p_modal: modal,
                        p_referencia: referencia,
                        p_executor: executor,
                      })
                    }
                  />
                );
              })()}

              {estacaoSelecionada === "aguardando_nf" && (
                <Card>
                  <CardContent className="space-y-2 p-4">
                    {(() => {
                      const emb = embalagemDoPedido(eventosSelecionado);
                      const medidas = `Embalado ${emb?.volumes ?? "?"} vol · ${emb?.peso_kg ?? "?"} kg`;
                      return estacaoSelecionada === "aguardando_nf" ? (
                        <div className="space-y-2">
                          <p className="text-sm">{medidas} — aguardando a NF do Fiscal (matriz SP).</p>
                          <SolicitacaoNf linha={aguardandoNfPorPedido.get(selecionado.id)} bloqueado={bloqueado} />
                        </div>
                      ) : (
                        <p className="text-sm">{medidas} — NF emitida, despacho em breve.</p>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {estacaoSelecionada === "fila" && (
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <p className="text-sm text-muted-foreground">
                      Pedido roteado para a Mesa SP, ainda em pré-separação. Puxar
                      leva o estágio para “em separação” e abre a picking list.
                    </p>
                    <Button
                      onClick={() => puxar.mutate({ p_pedido_id: selecionado.id })}
                      disabled={puxar.isPending || bloqueado}
                    >
                      {puxar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                      Puxar este pedido
                    </Button>
                  </CardContent>
                </Card>
              )}

              {estacaoSelecionada === "separacao" && (
                <EstacaoSeparacao
                  itens={itensQ.data ?? []}
                  carregando={itensQ.isLoading}
                  pedido={selecionado}
                   identidades={identidadesSelecionado}
                  onConcluir={() => iniciarConferencia.mutate({ p_pedido_id: selecionado.id })}
                  imagens={imagensQ.data ?? new Map()}
                  bloqueado={bloqueado}
                />
              )}

              {estacaoSelecionada === "conferencia" && (
                <EstacaoConferencia
                  pedidoId={selecionado.id}
                  itens={itensQ.data ?? []}
                  imagens={imagensQ.data ?? new Map()}
                  carregando={itensQ.isLoading}
                  registrando={conferir.isPending}
                  onRegistrar={registrarConferencia}
                  onVoltarSeparacao={() => voltarSeparacao.mutate({ p_pedido_id: selecionado.id })}
                  bloqueado={bloqueado}
                />
              )}

              {estacaoSelecionada === "embalagem" && (
                <EstacaoEmbalagem
                  pedidoId={selecionado.id}
                  enderecoEntrega={selecionado.endereco_entrega}
                  modoVendaDireta={modoEntregaSelecionado}
                  modalVendaDireta={modalVdSelecionado}
                  modalPreferido={selecionadoEhB2B ? "TRANSPORTADORA" : null}
                  servicoCorreios={{ servico: selecionado.servico_correios, freteValor: selecionado.frete_cliente_valor, freteGratis: selecionado.frete_gratis }}
                  itens={itensQ.data ?? []}
                  modais={modaisQ.data ?? []}
                  regras={regrasQ.data ?? []}
                  checklist={checklistQ.data ?? []}
                  marcados={marcacoesQ.data ?? []}
                  marcandoItemId={marcarRotina.isPending ? marcarRotina.variables?.p_item_id ?? null : null}
                  onAlternarMarcacao={(itemId, marcado) =>
                    marcarRotina.mutate({
                      p_pedido_id: selecionado.id,
                      p_item_id: itemId,
                      p_marcado: marcado,
                    })
                  }
                  caixas={caixasQ.data ?? []}
                  carregandoCaixas={caixasQ.isLoading}
                  erroCaixas={caixasQ.error ? formatError(caixasQ.error) : null}
                  salvando={embalar.isPending || trocarModal.isPending}
                  bloqueado={bloqueado}
                  onEmbalar={(pesoKg, volumes, modal, checklist, caixaCodigo, motivoTroca) => {
                    const args = {
                      p_pedido_id: selecionado.id,
                      p_peso_kg: pesoKg,
                      p_volumes: volumes,
                      p_modal: modal,
                      p_checklist: checklist,
                      p_caixa_codigo: caixaCodigo,
                    };
                    if (motivoTroca) {
                      trocarModal.mutate(
                        { p_pedido_id: selecionado.id, p_modal: modal, p_motivo: motivoTroca },
                        { onSuccess: () => embalar.mutate(args) },
                      );
                    } else {
                      embalar.mutate(args);
                    }
                  }}
                />
              )}

              {estacaoSelecionada === "documentos" && (() => {
                const emb = embalagemDoPedido(eventosSelecionado);
                return (
                  <EstacaoDocumentos
                    pedido={selecionado}
                    itens={itensQ.data ?? []}
                    embalagem={emb}
                    modalNome={emb?.modal ? modalPorCodigo.get(emb.modal)?.nome ?? emb.modal : null}
                    bloqueado={bloqueado}
                  />
                );
              })()}

              {estacaoSelecionada === "despacho" && (
                <EstacaoDespacho
                  pedidoId={selecionado.id}
                  modais={modaisQ.data ?? []}
                  modalEmbalado={modalDoEmbalado(eventosSelecionado)}
                  despachando={despachar.isPending}
                  onDespachar={(modal, referencia, executor) =>
                    despachar.mutate({
                      p_pedido_id: selecionado.id,
                      p_modal: modal,
                      p_referencia: referencia,
                      p_executor: executor,
                    })
                  }
                  gruposColeta={selecionadoAguardandoRetirada ? [] : gruposColeta}
                  despachandoLote={despacharLote.isPending}
                  bloqueado={bloqueado}
                  idExterno={selecionado.id_externo}
                  clienteNome={selecionado.cliente_nome}
                  onRetiradaRegistrada={() => setSelecionadoId(null)}
                  onDespacharLote={(modalCodigo, pedidoIds) =>
                    {
                      const ids = pedidoIds.filter((id) => !cancelamentos.has(id));
                      if (ids.length > 0) despacharLote.mutate({ p_modal: modalCodigo, p_pedido_ids: ids });
                    }
                  }
                />
              )}
            </>
          )}
        </div>

        {/* ── Coluna 3: trilha do pedido ──────────────────────────────────── */}
        <div className="lg:col-span-3">
          {selecionado && <TrilhaPedido eventos={eventosSelecionado} />}
        </div>
      </div>
    </PageShell>
  );
}

function IdentidadesPedido({
  sncf, bling, nf, loja,
}: {
  sncf: string;
  bling?: string | null;
  nf?: string | null;
  loja?: string | null;
}) {
  const partes = [
    { rotulo: "SNCF", valor: sncf },
    { rotulo: "Bling", valor: bling },
    { rotulo: "NF", valor: nf },
    { rotulo: "Loja", valor: loja },
  ].filter((item): item is { rotulo: string; valor: string } => Boolean(item.valor));

  return (
    <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
      {partes.map((item, indice) => (
        <span key={item.rotulo}>
          {indice > 0 && <span aria-hidden="true">· </span>}
          {item.rotulo} <span className="font-mono">{item.valor}</span>
        </span>
      ))}
    </p>
  );
}

function esperaColeta(iso: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  return `há ${Math.floor(horas / 24)}d`;
}

function medidasColeta(volumes: number | null, pesoKg: number | null): string {
  const partes = [volumes != null ? `${volumes} vol.` : "volumes não registrados"];
  if (pesoKg != null) partes.push(`${pesoKg} kg`);
  return partes.join(" · ");
}

function LinhaPedido({
  pedido, ativo, rotulo, onSelecionar, cancelamento,
}: {
  pedido: PedidoMesa;
  cancelamento?: CancelamentoMesa;
  ativo: boolean;
  /** Opcional: quando a linha já vive num grupo de estação, o rótulo é o grupo. */
  rotulo?: string;
  onSelecionar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelecionar}
      className={cn(
        "w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent",
        ativo && "border-primary bg-accent",
      )}
    >
      <span className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="truncate">{pedido.id_externo}</span>
        {pedidoEhVendaDireta(pedido.id_externo) && <Selo estado="info">Site SP · venda direta</Selo>}
        {pedidoEhB2B(pedido.canal) && <Selo estado="info">B2B</Selo>}
        {cancelamento && <Selo estado="destructive">Cancelamento solicitado · {cancelamento.numero}</Selo>}
      </span>
      <span className="block truncate text-xs text-muted-foreground">
        {pedido.cliente_nome ?? "cliente sem nome"}
        {rotulo ? ` · ${rotulo}` : ""}
      </span>
      <span className={cn("block truncate text-xs", pedido.estourou_limite ? "text-warning-strong" : "text-muted-foreground")}>
        {pedido.etapa_rotulo ?? pedido.etapa} · {tempoParado(pedido.minutos_parado)}
      </span>
      {pedidoEhVendaDireta(pedido.id_externo) && (
        <span className="block truncate text-xs text-muted-foreground">
          Entrega: {rotuloEntregaVendaDireta(modoEntregaVendaDireta(pedido.endereco_entrega))}
        </span>
      )}
    </button>
  );
}

function QuadroBancada({
  colunas, pedidos, cancelamentos, selecionadoId, onSelecionar,
}: {
  colunas: ColunaQuadro[];
  pedidos: PedidoMesa[];
  cancelamentos: Map<string, CancelamentoMesa>;
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
}) {
  if (colunas.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {colunas.map((c) => {
        const doGrupo = pedidos.filter((p) => c.etapas.includes(p.etapa));
        return (
          <div
            key={c.codigo}
            className={cn(
              "flex min-w-[150px] flex-1 flex-col rounded-md border p-1.5",
              doGrupo.length === 0 ? "bg-muted/40 text-muted-foreground" : "bg-card",
            )}
          >
            <p className="mb-1 flex shrink-0 items-center justify-between text-xs font-medium">
              <span className="truncate">{c.rotulo}</span>
              <span>{doGrupo.length}</span>
            </p>
            <ul className="h-[180px] space-y-0.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
              {doGrupo.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelecionar(p.id)}
                    className={cn(
                      "w-full rounded border px-1 py-0.5 text-left text-[11px] leading-tight transition-colors hover:bg-accent",
                      p.estourou_limite && "border-warning/60 bg-warning/10",
                      p.id === selecionadoId && "border-primary bg-accent",
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-0.5">
                      <span className="font-medium">{p.id_externo}</span>
                      {pedidoEhVendaDireta(p.id_externo) && <Selo estado="info">VD</Selo>}
                      {pedidoEhB2B(p.canal) && <Selo estado="info">B2B</Selo>}
                      {p.cd_codigo && p.cd_codigo !== CENTRO_SITE_SP && p.cd_rotulo && <Selo estado="info">{p.cd_rotulo}</Selo>}
                      {cancelamentos.has(p.id) && <Selo estado="destructive">Cancel.</Selo>}
                    </span>
                    <span className="block truncate text-muted-foreground">{p.cliente_nome ?? "cliente sem nome"}</span>
                    <span className={cn("block", p.estourou_limite ? "text-warning-strong" : "text-muted-foreground")}>
                      {tempoParado(p.minutos_parado)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
