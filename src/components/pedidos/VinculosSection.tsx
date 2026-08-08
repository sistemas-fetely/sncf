import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link2, Link2Off, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useVincularComplementar } from "@/hooks/pedidos/useVincularComplementar";
import { usePermissoesDoUsuario } from "@/hooks/usePermissoesDoUsuario";
import { useAuth } from "@/contexts/AuthContext";
import { useVinculosPedido, type PedidoVinculo } from "@/hooks/pedidos/useVinculosPedido";
import { ESTAGIO_CORES } from "@/components/pedidos/BadgesPedido";
import { ESTAGIO_LABELS } from "@/types/pedido";
import type { EstagioPedido } from "@/types/pedido";
import { cn } from "@/lib/utils";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  pedido_id: string;
  id_externo: string;
  split_de_pedido_id: string | null;
  consolidado_em_pedido_id: string | null;
  pedido_origem_id: string | null;
  /** Ações de vínculo vindas de fora (ex.: consolidar outro pedido aqui). */
  acoesExtra?: ReactNode;
}

function rotuloEstagio(estagio: string) {
  return ESTAGIO_LABELS[estagio as EstagioPedido] ?? estagio;
}

/** Linha de vínculo: id_externo linkado + ponto de estágio. Sem valor, sem contagem. */
function LinhaVinculo({ pedido }: { pedido: PedidoVinculo }) {
  const cor = ESTAGIO_CORES[pedido.estagio as EstagioPedido] ?? "bg-muted-foreground";
  return (
    <Link
      to={`/pedidos/${pedido.id}`}
      title={`${pedido.id_externo} · ${rotuloEstagio(pedido.estagio)}`}
      className="flex items-start gap-1.5 text-xs leading-tight hover:underline"
    >
      <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", cor)} aria-hidden />
      <span className="break-all font-medium">{pedido.id_externo}</span>
    </Link>
  );
}

function Grupo({ rotulo, pedidos }: { rotulo: string; pedidos: PedidoVinculo[] }) {
  if (!pedidos.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {rotulo}
      </p>
      <div className="space-y-1">
        {pedidos.map((p) => <LinhaVinculo key={p.id} pedido={p} />)}
      </div>
    </div>
  );
}

export function VinculosSection({
  pedido_id,
  id_externo,
  split_de_pedido_id,
  consolidado_em_pedido_id,
  pedido_origem_id,
  acoesExtra,
}: Props) {
  const vincular = useVincularComplementar();
  const { data: vinculos } = useVinculosPedido({
    pedido_id,
    split_de_pedido_id,
    consolidado_em_pedido_id,
    pedido_origem_id,
  });
  const { data: permissoes } = usePermissoesDoUsuario();
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const podeSplit = isSuperAdmin || (permissoes?.has("operacao.split_pedido") ?? false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [busca, setBusca] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [resultado, setResultado] = useState<any>(null);
  const [buscando, setBuscando] = useState(false);
  const [errosBusca, setErroBusca] = useState<string | null>(null);

  const temOrigem = !!pedido_origem_id;
  const temAlgumVinculo =
    !!vinculos &&
    (vinculos.remessas.length > 0 ||
      !!vinculos.remessa_de ||
      !!vinculos.consolidado_em ||
      vinculos.consolidou.length > 0 ||
      !!vinculos.origem ||
      vinculos.complementares.length > 0);

  const temAcoes = podeSplit || !!acoesExtra;
  if (!temAlgumVinculo && !temAcoes) return null;

  const handleBuscar = async () => {
    if (!busca.trim()) return;
    setBuscando(true);
    setErroBusca(null);
    setResultado(null);
    try {
      const { data } = await (supabase as any)
        .from("pedidos")
        .select("id, id_externo, valor_liquido, estagio, parceiro_id")
        .ilike("id_externo", `%${busca.trim()}%`)
        .neq("id", pedido_id)
        .limit(1)
        .maybeSingle();
      if (!data) setErroBusca("Pedido não encontrado.");
      else setResultado(data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setErroBusca(e.message);
    } finally {
      setBuscando(false);
    }
  };

  const handleVincular = async () => {
    if (!resultado) return;
    await vincular.mutateAsync({ pedido_id, pedido_origem_id: resultado.id });
    setDialogOpen(false);
    setBusca("");
    setResultado(null);
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          Vínculos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {vinculos && (
          <>
            <Grupo rotulo="Remessas" pedidos={vinculos.remessas} />
            <Grupo rotulo="Remessa de" pedidos={vinculos.remessa_de ? [vinculos.remessa_de] : []} />
            <Grupo rotulo="Consolidado em" pedidos={vinculos.consolidado_em ? [vinculos.consolidado_em] : []} />
            <Grupo rotulo="Consolidou" pedidos={vinculos.consolidou} />
            {vinculos.origem && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Origem
                </p>
                <div className="flex items-start justify-between gap-1">
                  <LinhaVinculo pedido={vinculos.origem} />
                  {podeSplit && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      onClick={() => vincular.mutate({ pedido_id, pedido_origem_id: null })}
                      disabled={vincular.isPending}
                      title="Remover vínculo de complementar"
                    >
                      <Link2Off className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
            <Grupo rotulo="Complementado por" pedidos={vinculos.complementares} />
          </>
        )}

        {podeSplit && !temOrigem && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 w-full whitespace-normal h-auto text-xs leading-tight py-2"
            onClick={() => setDialogOpen(true)}
          >
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            Vincular como complementar de…
          </Button>
        )}

        {acoesExtra}

        <Dialog open={dialogOpen} onOpenChange={(v) => { if (!vincular.isPending) setDialogOpen(v); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Vincular pedido complementar</DialogTitle>
              <DialogDescription>
                Busque o pedido original do qual {id_externo} é complementar.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="ID externo do pedido…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
                />
                <Button onClick={handleBuscar} disabled={buscando || !busca.trim()}>
                  {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {errosBusca && (
                <Alert variant="destructive">
                  <AlertDescription>{errosBusca}</AlertDescription>
                </Alert>
              )}

              {resultado && (
                <div className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{resultado.id_externo}</div>
                    <div className="text-sm">{fmtBRL.format(resultado.valor_liquido ?? 0)}</div>
                  </div>
                  <Badge variant="secondary" className="mt-1 text-xs">
                    {rotuloEstagio(resultado.estagio)}
                  </Badge>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={vincular.isPending}>
                Cancelar
              </Button>
              <Button onClick={handleVincular} disabled={!resultado || vincular.isPending} className="gap-1.5">
                {vincular.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Vinculando…</>
                ) : (
                  <><Link2 className="h-4 w-4" />Vincular</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
