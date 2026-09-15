import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Ticket } from "lucide-react";
import { iconeDaFila } from "@/pages/ChamadosCatalogo";

/**
 * FRENTE CHAMADOS — FASE 2: o chamado nasce dentro do pedido.
 * O pedido já vem vinculado (badge fixo) e a RPC `abrir_chamado_catalogo`
 * resolve o pedido pelo id_externo, grava chamado.pedido_id e ecoa a mensagem
 * no feed do pedido. FAIL-LOUD: erro do Postgres vai pro toast, dialog fica aberto.
 */

interface CampoExtra {
  chave: string;
  rotulo: string;
  tipo: string;
}

interface ItemCatalogo {
  cadeira: string | null;
  codigo: string | null;
  item: string | null;
  descricao: string | null;
  entidade_tipo_exigida: string | null;
  campos_extras: CampoExtra[] | null;
  prazo_primeira_resposta_h: number | null;
  fila_id: string | null;
  fila: string | null;
  fila_icone: string | null;
  fila_ordem: number | null;
}

type TipoChamado = "incidente" | "requisicao" | "duvida";

const TIPOS: { valor: TipoChamado; rotulo: string }[] = [
  { valor: "requisicao", rotulo: "Requisição" },
  { valor: "incidente", rotulo: "Incidente" },
  { valor: "duvida", rotulo: "Dúvida" },
];

export const CHAVE_CHAMADOS_PEDIDO = "chamados-do-pedido";

interface Props {
  pedidoId: string;
  pedidoIdExterno: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AbrirChamadoPedidoDialog({ pedidoId, pedidoIdExterno, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [item, setItem] = useState<ItemCatalogo | null>(null);
  const [tipo, setTipo] = useState<TipoChamado>("requisicao");
  const [descricao, setDescricao] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const catalogo = useQuery({
    queryKey: ["catalogo-arvore-chamados"],
    enabled: open,
    queryFn: async (): Promise<ItemCatalogo[]> => {
      const { data, error } = await supabase.from("vw_catalogo_arvore").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as ItemCatalogo[];
    },
  });

  const porFila = useMemo(() => {
    const mapa = new Map<
      string,
      { nome: string; icone: string | null; ordem: number; itens: ItemCatalogo[] }
    >();
    for (const i of catalogo.data ?? []) {
      if (i.entidade_tipo_exigida !== "pedido") continue;
      const chave = i.fila_id ?? "__outros__";
      const atual = mapa.get(chave);
      if (atual) {
        atual.itens.push(i);
        continue;
      }
      mapa.set(chave, {
        nome: i.fila ?? "Outros",
        icone: i.fila_icone ?? null,
        ordem: i.fila_id ? (i.fila_ordem ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER,
        itens: [i],
      });
    }
    return [...mapa.entries()]
      .map(([chave, v]) => ({ chave, ...v }))
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [catalogo.data]);

  const camposExtras = (item?.campos_extras ?? []) as CampoExtra[];
  const invalido =
    !item ||
    !descricao.trim() ||
    camposExtras.some((c) => !(extras[c.chave] ?? "").trim());

  function selecionar(i: ItemCatalogo) {
    setItem(i);
    setTipo("requisicao");
    setDescricao("");
    setExtras({});
  }

  function fechar(v: boolean) {
    onOpenChange(v);
    if (!v) {
      setItem(null);
      setDescricao("");
      setExtras({});
    }
  }

  async function enviar() {
    if (!item) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc("abrir_chamado_catalogo", {
        p_assunto_codigo: item.codigo,
        p_descricao: descricao.trim(),
        p_tipo: tipo,
        p_pedido_ref: pedidoIdExterno,
        p_campos: extras,
      });
      if (error) throw error;
      const r = data as {
        ok: boolean;
        chamado_id?: string;
        numero?: string;
        cadeira?: string;
        erro?: string;
      } | null;
      if (!r?.ok || !r.chamado_id) {
        throw new Error(r?.erro ?? "O banco não confirmou a abertura do chamado.");
      }
      await qc.invalidateQueries({ queryKey: [CHAVE_CHAMADOS_PEDIDO, pedidoId] });
      invalidarPedido(qc, pedidoId);
      toast.success(
        `Chamado ${r.numero ?? ""} aberto — ${r.cadeira ?? item.cadeira ?? "—"}`,
        {
          action: {
            label: "Ver chamado",
            onClick: () => {
              window.location.assign(`/chamados/${r.chamado_id}`);
            },
          },
        },
      );
      fechar(false);
    } catch (e) {
      console.error("[AbrirChamadoPedidoDialog] falha ao abrir chamado:", e);
      toast.error(formatError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-muted-foreground" />
            Abrir chamado
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span>Pedido vinculado:</span>
            <Badge variant="secondary">{pedidoIdExterno}</Badge>
          </DialogDescription>
        </DialogHeader>

        {!item ? (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {catalogo.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Não foi possível carregar os serviços: {formatError(catalogo.error)}
                </AlertDescription>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => catalogo.refetch()}
                >
                  Tentar de novo
                </Button>
              </Alert>
            ) : catalogo.isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : porFila.length === 0 ? (
              <EstadoVazio
                icone={Search}
                titulo="Nenhum serviço de pedido no catálogo"
                mensagem="Fale com o Atendimento para cadastrar os serviços que exigem pedido."
              />
            ) : (
              porFila.map((f) => {
                const Icone = iconeDaFila(f.icone);
                return (
                  <div key={f.chave} className="space-y-2">
                    <p className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                      <Icone className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
                      {f.nome}
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {f.itens.map((i) => (
                        <button
                          key={i.codigo ?? i.item}
                          type="button"
                          onClick={() => selecionar(i)}
                          className="flex h-full flex-col items-start rounded-md border p-3 text-left transition-colors hover:border-primary/50"
                        >
                          <p className="text-sm font-medium">{i.item ?? "—"}</p>
                          {i.descricao && (
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {i.descricao}
                            </p>
                          )}
                          <p className="mt-auto pt-1.5 text-[11px] text-muted-foreground">
                            {[
                              i.cadeira ?? "Sem área",
                              i.prazo_primeira_resposta_h != null
                                ? `resposta em ${i.prazo_primeira_resposta_h}h`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{item.item}</span>
                {" · "}
                {item.fila ?? "Outros"}
                {" · "}atendido por {item.cadeira ?? "—"}
              </p>
              <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setItem(null)}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Trocar serviço
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <ToggleGroup
                type="single"
                value={tipo}
                onValueChange={(v) => v && setTipo(v as TipoChamado)}
                className="justify-start"
              >
                {TIPOS.map((t) => (
                  <ToggleGroupItem key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            {camposExtras.map((c) => (
              <div key={c.chave} className="space-y-1.5">
                <Label htmlFor={`ch-extra-${c.chave}`}>{c.rotulo} *</Label>
                <Input
                  id={`ch-extra-${c.chave}`}
                  value={extras[c.chave] ?? ""}
                  onChange={(e) =>
                    setExtras((prev) => ({ ...prev, [c.chave]: e.target.value }))
                  }
                />
              </div>
            ))}

            <div className="space-y-1.5">
              <Label htmlFor="ch-descricao">Descrição *</Label>
              <Textarea
                id="ch-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={5}
                placeholder="O que aconteceu, com número de nota, valor ou referência."
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => fechar(false)}>
            Cancelar
          </Button>
          <Button disabled={invalido || enviando} onClick={enviar}>
            {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Abrir chamado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Link auxiliar para a lista de chamados do pedido. */
export function LinkChamado({ id, numero }: { id: string; numero: string }) {
  return (
    <Link to={`/chamados/${id}`} className="text-sm font-medium text-primary hover:underline">
      {numero}
    </Link>
  );
}
