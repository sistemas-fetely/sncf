import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link2, Link2Off, Search, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePedidosComplementares } from "@/hooks/pedidos/usePedidosComplementares";
import { useVincularComplementar } from "@/hooks/pedidos/useVincularComplementar";
import { usePermissoesDoUsuario } from "@/hooks/usePermissoesDoUsuario";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  pedido_id: string;
  pedido_origem_id: string | null;
  id_externo: string;
}

function useOrigem(pedido_origem_id: string | null) {
  return useQuery({
    queryKey: ["pedido-origem", pedido_origem_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pedidos")
        .select("id, id_externo, valor_liquido, estagio")
        .eq("id", pedido_origem_id!)
        .maybeSingle();
      return data as any;
    },
    enabled: !!pedido_origem_id,
  });
}

export function ComplementarSection({ pedido_id, pedido_origem_id, id_externo }: Props) {
  const navigate = useNavigate();
  const vincular = useVincularComplementar();
  const { data: complementares } = usePedidosComplementares(pedido_id);
  const { data: origem } = useOrigem(pedido_origem_id);
  const { data: permissoes } = usePermissoesDoUsuario();
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const podeSplit = isSuperAdmin || (permissoes?.has("operacao.split_pedido") ?? false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [resultado, setResultado] = useState<any>(null);
  const [buscando, setBuscando] = useState(false);
  const [errosBusca, setErroBusca] = useState<string | null>(null);

  const temComplementares = !!complementares && complementares.length > 0;
  const temOrigem = !!pedido_origem_id;

  if (!temOrigem && !temComplementares && !podeSplit) return null;

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

  const handleDesvincular = async () => {
    await vincular.mutateAsync({ pedido_id, pedido_origem_id: null });
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          Complementar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {temOrigem && origem && (
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Complementar de</span>
                <button
                  className="font-medium inline-flex items-center gap-1 hover:underline"
                  onClick={() => navigate(`/casa-dos-pedidos/${origem.id}`)}
                >
                  {origem.id_externo}
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{fmtBRL.format(origem.valor_liquido ?? 0)}</span>
                {podeSplit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDesvincular}
                    disabled={vincular.isPending}
                    title="Remover vínculo"
                  >
                    <Link2Off className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {temComplementares && (
          <div className="space-y-2">
            {complementares!.map((c: any) => (
              <div key={c.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Complementado por</span>
                    <button
                      className="font-medium inline-flex items-center gap-1 hover:underline"
                      onClick={() => navigate(`/casa-dos-pedidos/${c.id}`)}
                    >
                      {c.id_externo}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{c.estagio}</Badge>
                    <span className="text-sm font-medium">{fmtBRL.format(c.valor_liquido ?? 0)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
                  <Badge variant="secondary" className="mt-1 text-xs">{resultado.estagio}</Badge>
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
