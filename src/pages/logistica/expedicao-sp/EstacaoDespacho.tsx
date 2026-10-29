import { BotaoEtiquetaCorreios } from "./BotaoEtiquetaCorreios";
import { useRef, useState } from "react";
import { erroCodigoSro } from "@/lib/logistica/codigoSro";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { Loader2, Store, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormDespacho } from "./FormDespacho";
import { Selo } from "@/components/ui/selo";
import type { ModalEntrega } from "./tipos";
import { useQueryClient } from "@tanstack/react-query";
import { RegistrarRetiradaDialog, type LinhaVD } from "@/components/venda-direta/AcoesVendaDireta";

/**
 * Estação 5 — Despacho. O modal já vem do evento `mesa_embalado` (é o que a
 * embalagem decidiu); trocar aqui é possível, mas é exceção, não fluxo.
 *
 * REFERÊNCIA: obrigatória para modal SEM rastreio automático (Lalamove, Motoboy)
 * — é ela que vira o `trackingInfo` do fulfillment no Shopify. A RPC valida por
 * `tem_rastreio_automatico`; a UI pede antes para o operador não levar EXCEPTION
 * na cara depois de fechar a caixa.
 *
 * FILA DE COLETA: acima da ação individual, a mesa inteira que espera coleta,
 * agrupada por modal. O Correios não busca um pedido, busca as caixas do dia —
 * por isso o lote existe só para modal com rastreio automático.
 */
export interface CaixaAguardandoColeta {
  pedido_id: string;
  id_externo: string;
  cliente: string;
  /** Só dígitos, 8; null quando o pedido não tem CEP confiável. */
  cep: string | null;
  volumes: number | null;
  peso_kg: number | null;
  /** Momento do `mesa_embalado` — a espera é contada daqui. */
  embaladoEm: string;
}

export interface GrupoColeta {
  modalCodigo: string;
  modalNome: string;
  temRastreioAutomatico: boolean;
  semDespacho: boolean;
  caixas: CaixaAguardandoColeta[];
}

interface Props {
  pedidoId: string;
  modais: ModalEntrega[];
  /** Modal registrado na embalagem — `metadata->>'modal'` do evento mesa_embalado. */
  modalEmbalado: string | null;
  despachando: boolean;
  onDespachar: (modal: string, referencia: string | null, executor: string | null) => void;
  gruposColeta: GrupoColeta[];
  despachandoLote: boolean;
  onDespacharLote: (modalCodigo: string, itens: { pedido_id: string; referencia: string | null }[]) => void;
  /** Cancelamento solicitado no pedido selecionado: não despacha. */
  bloqueado?: boolean;
  /** Dados do pedido para o diálogo de retirada no balcão. */
  idExterno?: string | null;
  clienteNome?: string | null;
  /** Retirada registrada: a Mesa limpa a seleção (pedido vira entregue). */
  onRetiradaRegistrada?: () => void;
}

export function normalizarCodigo(v: string): string {
  return v.replace(/\s/g, "").toUpperCase();
}
/** Lote Correios só libera com todos os códigos no formato e sem repetição. */
export function loteCorreiosValido(codigos: string[]): boolean {
  const n = codigos.map(normalizarCodigo);
  return n.length > 0 && n.every((c) => erroCodigoSro(c) === null) && new Set(n).size === n.length;
}

/** Espera em linguagem de bancada: minutos até 1h, depois horas, depois dias. */
function esperaDesde(iso: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias}d`;
}

function medidas(caixa: CaixaAguardandoColeta): string {
  const partes: string[] = [];
  partes.push(caixa.volumes != null ? `${caixa.volumes} vol.` : "volumes não registrados");
  if (caixa.peso_kg != null) partes.push(`${caixa.peso_kg} kg`);
  return partes.join(" · ");
}

export function EstacaoDespacho({
  pedidoId, modais, modalEmbalado, despachando, onDespachar,
  gruposColeta, despachandoLote, onDespacharLote, bloqueado = false,
  idExterno = null, clienteNome = null, onRetiradaRegistrada,
}: Props) {
  const qc = useQueryClient();
  const [retirada, setRetirada] = useState<LinhaVD | null>(null);
  const perm = usePermissaoAcaoOuSuperAdmin("acao.expedicao_sp_operar");
  const semPerm = perm.carregando || !perm.permitido;
  const tituloPerm = !perm.permitido && !perm.carregando ? "Sem permissão: acao.expedicao_sp_operar" : undefined;
  const escolhido = modais.find((m) => m.codigo === modalEmbalado) ?? null;
  const semDespacho = escolhido?.sem_despacho === true;
  // Lote Correios: um código bipado por pedido (pedido_id → código).
  const [codigosLote, setCodigosLote] = useState<Record<string, string>>({});
  const refsLote = useRef<Record<string, HTMLInputElement | null>>({});
  const ehCorreiosGrupo = (cod: string) => modais.find((m) => m.codigo === cod)?.exige_etiqueta_correios === true;

  if (semDespacho) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Aguardando retirada no balcão</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Entregar ao cliente e registrar em Pedidos Site SP.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={bloqueado || semPerm}
              title={tituloPerm}
              onClick={() => setRetirada({ id: pedidoId, id_externo: idExterno, cliente_nome: clienteNome, valor_liquido: null })}
            >
              Registrar retirada
            </Button>
            <Button asChild variant="outline">
              <Link to={`/pedidos/venda-direta?pedido=${encodeURIComponent(pedidoId)}`}>
                Abrir pedido em Pedidos Site SP
              </Link>
            </Button>
          </div>
          <RegistrarRetiradaDialog
            linha={retirada}
            onClose={() => setRetirada(null)}
            onRegistrada={() => {
              void qc.invalidateQueries({ queryKey: ["mesa-sp"] });
              onRetiradaRegistrada?.();
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {gruposColeta.length > 0 && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <p className="text-sm font-medium">
              Aguardando coleta ·{" "}
              {gruposColeta.reduce((soma, g) => soma + g.caixas.length, 0)}
            </p>

            {gruposColeta.map((grupo) => (
              <div key={grupo.modalCodigo} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {grupo.modalNome} · {grupo.caixas.length}
                  </p>
                  {grupo.temRastreioAutomatico && (
                    <BotaoGuardado
                      slug="acao.expedicao_sp_operar"
                      rotuloAcao="Despachar lote"
                      contexto={{ modal: grupo.modalCodigo }}
                      size="sm"
                      onClick={() => {
                        const correios = ehCorreiosGrupo(grupo.modalCodigo);
                        onDespacharLote(grupo.modalCodigo, grupo.caixas.map((c) => ({
                          pedido_id: c.pedido_id,
                          referencia: correios ? normalizarCodigo(codigosLote[c.pedido_id] ?? "") : null,
                        })));
                        if (correios) setCodigosLote({});
                      }}
                      disabled={despachandoLote || (ehCorreiosGrupo(grupo.modalCodigo) && !loteCorreiosValido(grupo.caixas.map((c) => codigosLote[c.pedido_id] ?? "")))}
                    >
                      {despachandoLote
                        ? <Loader2 className="animate-spin" aria-hidden="true" />
                        : <Truck aria-hidden="true" />}
                      {grupo.modalNome} coletou — despachar {grupo.caixas.length}
                    </BotaoGuardado>
                  )}
                </div>

                {!grupo.temRastreioAutomatico && (
                  <p className="text-xs text-muted-foreground">
                    Sem despacho em lote — cada pedido sai abaixo, um a um.
                  </p>
                )}

                <ul className="space-y-1.5">
                  {grupo.caixas.map((c) => (
                    <li
                      key={c.pedido_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <span className="block truncate text-sm">
                          {c.id_externo} · {c.cliente}
                          {c.cep ? ` · CEP ${c.cep.slice(0, 5)}-${c.cep.slice(5)}` : ""}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {medidas(c)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {ehCorreiosGrupo(grupo.modalCodigo) && <BotaoEtiquetaCorreios pedidoId={c.pedido_id} />}
                        {grupo.temRastreioAutomatico && ehCorreiosGrupo(grupo.modalCodigo) && (() => {
                          const v = codigosLote[c.pedido_id] ?? "";
                          const n = normalizarCodigo(v);
                          const todos = grupo.caixas.map((x) => normalizarCodigo(codigosLote[x.pedido_id] ?? ""));
                          const repetido = n !== "" && todos.filter((t) => t === n).length > 1;
                          const invalido = n !== "" ? erroCodigoSro(n) : null;
                          return (
                            <div className="flex flex-col">
                              <Input
                                ref={(el) => { refsLote.current[c.pedido_id] = el; }}
                                aria-label={`Código do comprovante ${c.id_externo}`}
                                placeholder="Código do comprovante"
                                className="h-8 w-48 font-mono text-xs"
                                value={v}
                                onChange={(e) => setCodigosLote((s) => ({ ...s, [c.pedido_id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key !== "Enter") return;
                                  e.preventDefault();
                                  const i = grupo.caixas.findIndex((x) => x.pedido_id === c.pedido_id);
                                  const prox = grupo.caixas[i + 1];
                                  if (prox) refsLote.current[prox.pedido_id]?.focus();
                                }}
                              />
                              {(invalido || repetido) && (
                                <span className="text-xs text-destructive">
                                  {repetido ? "Código repetido no lote" : invalido}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        <Selo estado="warning">{esperaDesde(c.embaladoEm)}</Selo>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <FormDespacho
            pedidoId={pedidoId}
            modalCodigo={modalEmbalado}
            modais={modais}
            despachando={despachando}
            bloqueado={bloqueado}
            clienteNome={clienteNome}
            onDespachar={(ref, exec, modal) => onDespachar(modal, ref, exec)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
