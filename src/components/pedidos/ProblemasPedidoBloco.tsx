import { useState } from "react";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAbrirProblema, useProblemaTipos, useProblemasDoPedido, useResolverProblema,
} from "@/hooks/pedidos/useProblemasPedido";
import { BadgeTipoProblema } from "@/components/pedidos/ProblemasPedidoAba";

/**
 * PROBLEMA-NAO-RETROCEDE-ESTAGIO (11/09/2026): declarar problema NÃO muda o
 * estágio do pedido. Ele fica onde está e ganha esta marcação paralela, que
 * o faz aparecer também na aba "Resolução de Problema" da Casa dos Pedidos.
 */
export function ProblemasPedidoBloco({ pedidoId }: { pedidoId: string }) {
  const { data: problemas, isError, error } = useProblemasDoPedido(pedidoId);
  const [abrirOpen, setAbrirOpen] = useState(false);
  const [tipo, setTipo] = useState<string>("");
  const [descricao, setDescricao] = useState("");
  const [resolverId, setResolverId] = useState<string | null>(null);
  const [resolucao, setResolucao] = useState("");

  const { data: tipos, isError: tiposErro, error: tiposErroObj } = useProblemaTipos();
  const abrir = useAbrirProblema();
  const resolver = useResolverProblema();

  const tipoEscolhido = (tipos ?? []).find((t) => t.codigo === tipo);
  const lista = problemas ?? [];

  const declarar = async () => {
    // FAIL-LOUD: await de verdade; erro do banco vira toast pelo hook e o dialog fica aberto.
    await abrir.mutateAsync({ pedidoId, tipo, descricao: descricao.trim() });
    setAbrirOpen(false);
    setTipo("");
    setDescricao("");
  };

  const declararResolvido = async (problemaId: string) => {
    await resolver.mutateAsync({ problemaId, pedidoId, resolucao: resolucao.trim() });
    setResolverId(null);
    setResolucao("");
  };

  return (
    <div className="px-6 pt-4 space-y-3">
      {isError && (
        <Alert className="border-destructive/40 bg-destructive/10">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-destructive text-sm">
            Não foi possível ler os problemas deste pedido: {(error as Error)?.message ?? "erro desconhecido"}
          </AlertDescription>
        </Alert>
      )}

      {lista.length > 0 && (
        <Alert className="border-destructive/40 bg-destructive/10">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          <AlertDescription className="space-y-2">
            <p className="text-sm font-medium text-destructive">
              {lista.length === 1 ? "Este pedido tem 1 problema aberto" : `Este pedido tem ${lista.length} problemas abertos`}
              {" "}— o estágio continua o mesmo.
            </p>
            <div className="space-y-2">
              {lista.map((p) => (
                <div key={p.id} className="flex flex-wrap items-start gap-2 rounded-md border border-destructive/20 bg-background/60 px-2 py-1.5">
                  <BadgeTipoProblema linha={p} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-foreground break-words">{p.descricao ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      aberto por {p.aberto_por_nome ?? "—"} · {p.dias_aberto ?? 0} dia(s)
                      {p.libera_refaturamento ? " · libera refaturamento" : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setResolverId(p.id); setResolucao(""); }}>
                    Declarar resolvido
                  </Button>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Dialog open={abrirOpen} onOpenChange={(v) => { setAbrirOpen(v); if (!v) { setTipo(""); setDescricao(""); } }}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Declarar problema
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Declarar problema no pedido</DialogTitle>
            <DialogDescription>
              O pedido continua no estágio atual. Ele passa a aparecer também na aba
              "Resolução de Problema" até alguém declarar resolvido.
            </DialogDescription>
          </DialogHeader>

          {tiposErro && (
            <Alert className="border-destructive/40 bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-destructive text-sm">
                Não foi possível carregar os tipos de problema:{" "}
                {(tiposErroObj as Error)?.message ?? "erro desconhecido"}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo do problema</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {(tipos ?? []).map((t) => (
                    <SelectItem key={t.codigo} value={t.codigo}>
                      {t.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tipoEscolhido?.descricao && (
                <p className="text-xs text-muted-foreground">{tipoEscolhido.descricao}</p>
              )}
              {tipoEscolhido?.libera_refaturamento && (
                <p className="text-xs text-warning">
                  Este tipo libera refaturamento: o reenvio ao Bling passa a ficar disponível
                  em qualquer estágio enquanto o problema estiver aberto.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Descrição (obrigatória)</Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={4}
                placeholder="O que aconteceu, com número de nota, valor ou referência."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbrirOpen(false)}>Cancelar</Button>
            <Button
              disabled={!tipo || descricao.trim().length === 0 || abrir.isPending}
              onClick={declarar}
            >
              {abrir.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Declarar problema
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resolverId} onOpenChange={(v) => { if (!v) { setResolverId(null); setResolucao(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Declarar problema resolvido</DialogTitle>
            <DialogDescription>
              Descreva o que foi feito. O pedido sai da aba de problemas e continua no estágio dele.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Resolução (obrigatória)</Label>
            <Textarea
              value={resolucao}
              onChange={(e) => setResolucao(e.target.value)}
              rows={4}
              placeholder="O que foi feito para resolver."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolverId(null)}>Cancelar</Button>
            <Button
              disabled={resolucao.trim().length === 0 || resolver.isPending}
              onClick={() => resolverId && declararResolvido(resolverId)}
            >
              {resolver.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Declarar resolvido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
