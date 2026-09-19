import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Inbox, Loader2, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Selo } from "@/components/ui/selo";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { cn } from "@/lib/utils";
import { fmtDataHora } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { EstacaoConferencia } from "./expedicao-sp/EstacaoConferencia";
import { EstacaoDespacho } from "./expedicao-sp/EstacaoDespacho";
import { EstacaoEmbalagem } from "./expedicao-sp/EstacaoEmbalagem";
import { EstacaoSeparacao } from "./expedicao-sp/EstacaoSeparacao";
import { TrilhaPedido } from "./expedicao-sp/TrilhaPedido";
import type { GrupoColeta } from "./expedicao-sp/EstacaoDespacho";
import {
  ESTACOES, ESTAGIO_FILA, ROTULO_ESTACAO,
  embalagemDoPedido, estacaoBase,
  type Estacao, type EventoMesa, type ItemConferido, type PedidoMesa,
} from "./expedicao-sp/tipos";
import {
  useChecklistEmbalagem, useDespachar, useDespacharLote, useEmbalar, useEventosMesaSp,
  useIdentidadesMesaSp, useItensPedidoMesa, useModaisEntrega, usePedidosMesaSp, usePuxarPedido,
  useRegistrarConferencia, useRegrasModal,
} from "./expedicao-sp/useMesaSp";

/**
 * Mesa de Expedição SP — frente `frente-descida-b2c-split-sp`.
 *
 * Operação real: ~10 pedidos/dia, UM operador, uma bancada. Por isso a tela é
 * uma só e o pedido a atravessa: Fila → Separação → Conferência → Embalagem →
 * Despacho. Nada de navegar entre telas com a caixa na mão.
 *
 * FONTE-ÚNICA: estágio macro é `pedidos.estagio`; a sub-estação é derivada do
 * último evento `mesa_*` que as RPCs gravaram. A tela não guarda status próprio
 * — o único estado local é a navegação Separação → Conferência, que não existe
 * no banco porque não é transição, é gesto de tela.
 */

/** Qual modal a embalagem registrou — o despacho começa por ele. */
function modalDoEmbalado(eventos: EventoMesa[]): string | null {
  return embalagemDoPedido(eventos)?.modal ?? null;
}

export default function ExpedicaoSp() {
  const pedidosQ = usePedidosMesaSp();
  const pedidos = useMemo(() => pedidosQ.data ?? [], [pedidosQ.data]);
  const eventosQ = useEventosMesaSp(pedidos.map((p) => p.id));
  const identidadesQ = useIdentidadesMesaSp(pedidos.map((p) => p.id));
  const modaisQ = useModaisEntrega();
  const regrasQ = useRegrasModal();

  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  /**
   * Pedidos que o operador levou da Separação para a Conferência. Vive só aqui:
   * a conferência não tem evento de entrada, e inventar um seria inventar status.
   */
  const [emConferencia, setEmConferencia] = useState<Set<string>>(new Set());

  const eventosPorPedido = useMemo(() => {
    const mapa = new Map<string, EventoMesa[]>();
    for (const e of eventosQ.data ?? []) {
      const lista = mapa.get(e.pedido_id);
      if (lista) lista.push(e);
      else mapa.set(e.pedido_id, [e]);
    }
    return mapa;
  }, [eventosQ.data]);

  /** Estação de cada pedido: base do banco + o avanço local para conferência. */
  const estacaoDe = useMemo(() => {
    const mapa = new Map<string, Estacao>();
    for (const p of pedidos) {
      const base = estacaoBase(p.estagio, eventosPorPedido.get(p.id) ?? []);
      if (base === "despachado") continue; // saiu da mesa
      mapa.set(p.id, base === "separacao" && emConferencia.has(p.id) ? "conferencia" : base);
    }
    return mapa;
  }, [pedidos, eventosPorPedido, emConferencia]);

  const fila = pedidos.filter((p) => p.estagio === ESTAGIO_FILA);
  const naMesa = pedidos.filter((p) => {
    const estacao = estacaoDe.get(p.id);
    return estacao === "separacao" || estacao === "conferencia" || estacao === "embalagem";
  });
  const aguardandoColeta = pedidos.filter((p) => estacaoDe.get(p.id) === "despacho");

  /** Pedidos da mesa agrupados por estação, na ordem da bancada. */
  const gruposMesa = useMemo(
    () =>
      ESTACOES
        .filter((estacao) => estacao !== "despacho")
        .map((estacao) => ({ estacao, doGrupo: naMesa.filter((p) => estacaoDe.get(p.id) === estacao) }))
        .filter(({ doGrupo }) => doGrupo.length > 0),
    [naMesa, estacaoDe],
  );

  // Seleção segue a bancada: o pedido que está na mesa é o pedido da tela.
  useEffect(() => {
    if (selecionadoId && pedidos.some((p) => p.id === selecionadoId)) return;
    setSelecionadoId(naMesa[0]?.id ?? aguardandoColeta[0]?.id ?? fila[0]?.id ?? null);
  }, [pedidos, naMesa, aguardandoColeta, fila, selecionadoId]);

  const selecionado = pedidos.find((p) => p.id === selecionadoId) ?? null;
  const identidadesSelecionado = selecionado ? identidadesQ.data?.get(selecionado.id) : undefined;
  const eventosSelecionado = selecionado ? eventosPorPedido.get(selecionado.id) ?? [] : [];
  const estacaoSelecionada = selecionado ? estacaoDe.get(selecionado.id) ?? "fila" : "fila";

  const itensQ = useItensPedidoMesa(selecionado?.id ?? null);

  const puxar = usePuxarPedido();
  const conferir = useRegistrarConferencia();
  const embalar = useEmbalar();
  const despachar = useDespachar();
  const despacharLote = useDespacharLote();
  const checklistQ = useChecklistEmbalagem();

  /**
   * Fila de coleta: TODA a mesa em despacho, agrupada pelo modal que a embalagem
   * registrou. O Correios não busca um pedido, busca as caixas do dia — por isso
   * a lista não é a do pedido selecionado. Modal desconhecido na dimensão fica
   * num grupo próprio, sem lote: caixa invisível seria pior que caixa estranha.
   */
  const gruposColeta = useMemo<GrupoColeta[]>(() => {
    const porModal = new Map<string, GrupoColeta>();
    for (const p of aguardandoColeta) {
      const emb = embalagemDoPedido(eventosPorPedido.get(p.id) ?? []);
      if (!emb) continue;
      const codigo = emb.modal ?? "SEM_MODAL";
      const dim = (modaisQ.data ?? []).find((m) => m.codigo === codigo) ?? null;
      const grupo = porModal.get(codigo) ?? {
        modalCodigo: codigo,
        modalNome: dim?.nome ?? (emb.modal ?? "Modal não registrado"),
        temRastreioAutomatico: dim?.tem_rastreio_automatico ?? false,
        caixas: [],
      };
      grupo.caixas.push({
        pedido_id: p.id,
        id_externo: p.id_externo,
        cliente: p.cliente_nome_snapshot ?? "cliente sem nome",
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
  }, [aguardandoColeta, eventosPorPedido, modaisQ.data]);

  /** Contadores do cabeçalho — uma leitura só da bancada inteira. */
  const contadores = useMemo(() => {
    const base: Record<Estacao, number> = {
      fila: 0, separacao: 0, conferencia: 0, embalagem: 0, despacho: 0,
    };
    for (const estacao of estacaoDe.values()) base[estacao] += 1;
    return base;
  }, [estacaoDe]);

  function marcarEmConferencia(pedidoId: string, entrar: boolean) {
    setEmConferencia((atual) => {
      const proximo = new Set(atual);
      if (entrar) proximo.add(pedidoId);
      else proximo.delete(pedidoId);
      return proximo;
    });
  }

  function registrarConferencia(itens: ItemConferido[], ok: boolean, motivo: string | null) {
    if (!selecionado) return;
    const pedidoId = selecionado.id;
    conferir.mutate(
      { p_pedido_id: pedidoId, p_itens: itens, p_ok: ok, p_motivo: motivo },
      // Conferência OK leva o pedido para a Embalagem (evento novo manda). O
      // avanço local sai de cena nos dois casos: quem responde agora é o banco.
      { onSuccess: () => marcarEmConferencia(pedidoId, false) },
    );
  }

  const erro = pedidosQ.error ?? eventosQ.error ?? identidadesQ.error ?? modaisQ.error ?? regrasQ.error;

  return (
    <PageShell variant="dados">
      <PageHeader
        icone={PackageCheck}
        titulo="Mesa de Expedição SP"
        estado={
          pedidosQ.isLoading
            ? "Carregando a bancada…"
            : `${fila.length} na fila · ${naMesa.length} na mesa · ${aguardandoColeta.length} aguardando coleta`
        }
      />

      {/* Contadores por estação: o operador vê a bancada inteira de um olhar. */}
      <div className="flex flex-wrap gap-2">
        {ESTACOES.map((e) => (
          <Selo key={e} estado={contadores[e] > 0 ? "info" : "muted"}>
            {ROTULO_ESTACAO[e]} · {contadores[e]}
          </Selo>
        ))}
      </div>

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
                          ativo={p.id === selecionadoId}
                          rotulo="na fila"
                          onSelecionar={() => setSelecionadoId(p.id)}
                        />
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    onClick={() => puxar.mutate({ p_pedido_id: fila[0].id })}
                    disabled={puxar.isPending}
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
                  {gruposMesa.map(({ estacao, doGrupo }) => (
                    <div key={estacao} className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {ROTULO_ESTACAO[estacao]} · {doGrupo.length}
                      </p>
                      <ul className="space-y-2">
                        {doGrupo.map((p) => (
                          <li key={p.id}>
                            <LinhaPedido
                              pedido={p}
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

          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">
                Aguardando coleta · {aguardandoColeta.length}
              </p>
              {aguardandoColeta.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma caixa aguardando coleta.
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
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                       {selecionado.cliente_nome_snapshot ?? "cliente sem nome"}
                    </p>
                     <IdentidadesPedido
                       sncf={selecionado.id_externo}
                       bling={identidadesSelecionado?.bling_pedido_numero}
                       nf={identidadesSelecionado?.nf_refs}
                       loja={identidadesSelecionado?.order_name}
                     />
                    <p className="text-xs text-muted-foreground">
                      {formatBRL(selecionado.valor_liquido)} · recebido {fmtDataHora(selecionado.recebido_em)}
                    </p>
                  </div>
                  <Selo estado="info">{ROTULO_ESTACAO[estacaoSelecionada]}</Selo>
                </CardContent>
              </Card>

              {estacaoSelecionada === "fila" && (
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <p className="text-sm text-muted-foreground">
                      Pedido roteado para a Mesa SP, ainda em pré-separação. Puxar
                      leva o estágio para “em separação” e abre a picking list.
                    </p>
                    <Button
                      onClick={() => puxar.mutate({ p_pedido_id: selecionado.id })}
                      disabled={puxar.isPending}
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
                  onConcluir={() => marcarEmConferencia(selecionado.id, true)}
                />
              )}

              {estacaoSelecionada === "conferencia" && (
                <EstacaoConferencia
                  pedidoId={selecionado.id}
                  itens={itensQ.data ?? []}
                  carregando={itensQ.isLoading}
                  registrando={conferir.isPending}
                  onRegistrar={registrarConferencia}
                  onVoltarSeparacao={() => marcarEmConferencia(selecionado.id, false)}
                />
              )}

              {estacaoSelecionada === "embalagem" && (
                <EstacaoEmbalagem
                  enderecoEntrega={selecionado.endereco_entrega}
                  modais={modaisQ.data ?? []}
                  regras={regrasQ.data ?? []}
                  checklist={checklistQ.data ?? []}
                  salvando={embalar.isPending}
                  onEmbalar={(pesoKg, volumes, modal, checklist) =>
                    embalar.mutate({
                      p_pedido_id: selecionado.id,
                      p_peso_kg: pesoKg,
                      p_volumes: volumes,
                      p_modal: modal,
                      p_checklist: checklist,
                    })
                  }
                />
              )}

              {estacaoSelecionada === "despacho" && (
                <EstacaoDespacho
                  modais={modaisQ.data ?? []}
                  modalEmbalado={modalDoEmbalado(eventosSelecionado)}
                  despachando={despachar.isPending}
                  onDespachar={(modal, referencia) =>
                    despachar.mutate({
                      p_pedido_id: selecionado.id,
                      p_modal: modal,
                      p_referencia: referencia,
                    })
                  }
                  gruposColeta={gruposColeta}
                  despachandoLote={despacharLote.isPending}
                  onDespacharLote={(modalCodigo, pedidoIds) =>
                    despacharLote.mutate({ p_modal: modalCodigo, p_pedido_ids: pedidoIds })
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
  pedido, ativo, rotulo, onSelecionar,
}: {
  pedido: PedidoMesa;
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
      <span className="block truncate text-sm">{pedido.id_externo}</span>
      <span className="block truncate text-xs text-muted-foreground">
        {pedido.cliente_nome_snapshot ?? "cliente sem nome"}
        {rotulo ? ` · ${rotulo}` : ""}
      </span>
    </button>
  );
}
