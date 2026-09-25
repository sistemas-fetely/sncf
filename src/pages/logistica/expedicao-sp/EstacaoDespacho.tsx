import { useEffect, useState } from "react";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Selo } from "@/components/ui/selo";
import type { ModalEntrega } from "./tipos";

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
  volumes: number | null;
  peso_kg: number | null;
  /** Momento do `mesa_embalado` — a espera é contada daqui. */
  embaladoEm: string;
}

export interface GrupoColeta {
  modalCodigo: string;
  modalNome: string;
  temRastreioAutomatico: boolean;
  caixas: CaixaAguardandoColeta[];
}

interface Props {
  modais: ModalEntrega[];
  /** Modal registrado na embalagem — `metadata->>'modal'` do evento mesa_embalado. */
  modalEmbalado: string | null;
  despachando: boolean;
  onDespachar: (modal: string, referencia: string | null) => void;
  gruposColeta: GrupoColeta[];
  despachandoLote: boolean;
  onDespacharLote: (modalCodigo: string, pedidoIds: string[]) => void;
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
  modais, modalEmbalado, despachando, onDespachar,
  gruposColeta, despachandoLote, onDespacharLote,
}: Props) {
  const [modal, setModal] = useState<string>(modalEmbalado ?? "");
  const perm = usePermissaoAcaoOuSuperAdmin("acao.expedicao_sp_operar");
  const semPerm = perm.carregando || !perm.permitido;
  const tituloPerm = !perm.permitido && !perm.carregando ? "Sem permissão: acao.expedicao_sp_operar" : undefined;
  const [referencia, setReferencia] = useState("");

  useEffect(() => {
    if (modalEmbalado) setModal(modalEmbalado);
  }, [modalEmbalado]);

  const escolhido = modais.find((m) => m.codigo === modal) ?? null;
  const exigeReferencia = escolhido != null && !escolhido.tem_rastreio_automatico;
  const podeDespachar =
    modal !== "" && (!exigeReferencia || referencia.trim() !== "");
  const temRastreioAutomatico = escolhido?.tem_rastreio_automatico === true;

  if (gruposColeta.length === 0 && temRastreioAutomatico) return null;

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
                    <Button
                      size="sm"
                      onClick={() =>
                        onDespacharLote(grupo.modalCodigo, grupo.caixas.map((c) => c.pedido_id))
                      }
                      disabled={despachandoLote || semPerm}
                      title={tituloPerm}
                    >
                      {despachandoLote
                        ? <Loader2 className="animate-spin" aria-hidden="true" />
                        : <Truck aria-hidden="true" />}
                      {grupo.modalNome} coletou — despachar {grupo.caixas.length}
                    </Button>
                  )}
                </div>

                {!grupo.temRastreioAutomatico && (
                  <p className="text-xs text-muted-foreground">
                    Sem rastreio automático: não há despacho em lote — cada pedido sai
                    abaixo, um a um, com a referência da corrida.
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
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {medidas(c)}
                        </span>
                      </div>
                      <Selo estado="warning">{esperaDesde(c.embaladoEm)}</Selo>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!temRastreioAutomatico && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mesa-sp-despacho-modal">Modal</Label>
                <Select value={modal} onValueChange={setModal}>
                  <SelectTrigger id="mesa-sp-despacho-modal">
                    <SelectValue placeholder="Escolher modal" />
                  </SelectTrigger>
                  <SelectContent>
                    {modais.map((m) => (
                      <SelectItem key={m.codigo} value={m.codigo}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {exigeReferencia && (
                <div className="space-y-1.5">
                  <Label htmlFor="mesa-sp-referencia">Referência do despacho</Label>
                  <Input
                    id="mesa-sp-referencia"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    placeholder="ID da corrida (Lalamove) ou nome do portador"
                  />
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Sem rastreio automático: a referência é o que o cliente vai ver no e-mail do Shopify.
            </p>

            <Button onClick={() => onDespachar(modal, referencia.trim() || null)} disabled={!podeDespachar || despachando || semPerm} title={tituloPerm}>
              {despachando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Truck aria-hidden="true" />}
              Despachar
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
