import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useSolicitacoesAbertas,
  useAtenderSolicitacao,
  SOLICITACAO_TIPO_ROTULO,
  type SolicitacaoComercial,
} from "@/hooks/pedidos/useSolicitacoesComercial";

function diasDesde(iso: string): number {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

export function SolicitacoesSopsAba() {
  const { data: solicitacoes = [], isLoading } = useSolicitacoesAbertas();
  const atender = useAtenderSolicitacao();
  const [alvo, setAlvo] = useState<SolicitacaoComercial | null>(null);
  const [nota, setNota] = useState("");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (solicitacoes.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Nenhuma solicitação aberta.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pedido</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Detalhe</TableHead>
            <TableHead className="w-[110px]">Aberta há</TableHead>
            <TableHead className="w-[160px]">Por</TableHead>
            <TableHead className="w-[120px] text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {solicitacoes.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <Link
                  to={`/pedidos/${s.pedido_id}`}
                  className="font-medium text-primary underline underline-offset-2 hover:no-underline"
                >
                  {s.pedido_id_externo || s.pedido_id.slice(0, 8)}
                </Link>
                <p className="text-xs text-muted-foreground truncate">{s.cliente_razao || "—"}</p>
              </TableCell>
              <TableCell className="text-sm">
                {SOLICITACAO_TIPO_ROTULO[s.tipo] || s.tipo}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-[320px]">
                {s.detalhe || "—"}
              </TableCell>
              <TableCell className="text-sm tabular-nums">{diasDesde(s.criado_em)}d</TableCell>
              <TableCell className="text-sm text-muted-foreground truncate">
                {s.criado_por_nome || "—"}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAlvo(s);
                    setNota("");
                  }}
                >
                  Atendida
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar solicitação como atendida</AlertDialogTitle>
            <AlertDialogDescription>
              {alvo ? `${SOLICITACAO_TIPO_ROTULO[alvo.tipo] || alvo.tipo} · pedido ${alvo.pedido_id_externo || ""}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Observação (opcional)</label>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={atender.isPending}
              onClick={async (e) => {
                e.preventDefault();
                if (!alvo) return;
                try {
                  await atender.mutateAsync({ solicitacaoId: alvo.id, nota: nota.trim() || null });
                  setAlvo(null);
                } catch {
                  /* toast já exibido pelo hook */
                }
              }}
            >
              {atender.isPending ? "Salvando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
