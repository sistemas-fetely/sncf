/**
 * Padrão PEDIDO-DE-ACESSO: registro das tentativas de uso de botões travados.
 * A permissão em si se concede no Console de Acesso; aqui fica a decisão.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { fmtDataHora } from "@/lib/data";
import { QUERY_KEY_PEDIDOS_ACESSO } from "@/components/acesso/BotaoGuardado";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RodapePaginacao, DEFAULT_PAGE_SIZE } from "@/components/tabela/RodapePaginacao";

export type PedidoAcesso = {
  id: number;
  user_id: string;
  permissao_slug: string;
  rota: string | null;
  rotulo_acao: string | null;
  vezes: number;
  status: string;
  primeiro_em: string;
  ultimo_em: string;
  resolvido_em: string | null;
  resolucao_nota: string | null;
  usuario_nome: string | null;
  permissao_nome: string | null;
  resolvido_por_nome: string | null;
};

const TH = "whitespace-nowrap bg-muted font-medium";

export function useContagemPedidosAbertos(habilitado: boolean) {
  return useQuery({
    queryKey: [...QUERY_KEY_PEDIDOS_ACESSO, "abertos-count"],
    enabled: habilitado,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count, error } = await (supabase as any)
        .from("vw_acesso_pedido")
        .select("id", { count: "exact", head: true })
        .eq("status", "aberto");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export default function PedidosAcessoTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("aberto");
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState<number>(DEFAULT_PAGE_SIZE);
  const [decidir, setDecidir] = useState<{ p: PedidoAcesso; s: "concedido" | "recusado" } | null>(null);
  const [nota, setNota] = useState("");

  const q = useQuery({
    queryKey: [...QUERY_KEY_PEDIDOS_ACESSO, "lista", status],
    queryFn: async (): Promise<PedidoAcesso[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let qb = (supabase as any).from("vw_acesso_pedido").select("*").order("ultimo_em", { ascending: false }).limit(2000);
      if (status !== "todos") qb = qb.eq("status", status);
      const { data, error } = await qb;
      if (error) throw error;
      return (data ?? []) as PedidoAcesso[];
    },
  });

  const resolver = useMutation({
    mutationFn: async (a: { id: number; s: string; nota: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_resolver_pedido_acesso", {
        p_id: a.id, p_status: a.s, p_nota: a.nota.trim() || null,
      });
      if (error) throw error;
      const r = data as { ok?: boolean; erro?: string } | null;
      if (r && r.ok === false) throw new Error(r.erro ?? "O banco recusou a decisão.");
    },
    onSuccess: (_d, a) => {
      toast.success(a.s === "concedido" ? "Pedido marcado como concedido." : "Pedido marcado como recusado.");
      setDecidir(null); setNota("");
      void qc.invalidateQueries({ queryKey: QUERY_KEY_PEDIDOS_ACESSO });
    },
    onError: (e) => toast.error(`Não foi possível registrar a decisão: ${formatError(e)}`),
  });

  const linhas = q.data ?? [];
  const pagAtual = useMemo(() => linhas.slice((pagina - 1) * tamanho, pagina * tamanho), [linhas, pagina, tamanho]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          A permissão em si se concede no Console de Acesso (por grupo). Aqui fica o registro da decisão.
        </p>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPagina(1); }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="aberto">Em aberto</SelectItem>
            <SelectItem value="concedido">Concedidos</SelectItem>
            <SelectItem value="recusado">Recusados</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {q.error ? (
        <p className="text-sm text-destructive">Erro ao carregar pedidos: {formatError(q.error)}</p>
      ) : q.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
      ) : linhas.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {status === "aberto" ? "Nenhum pedido de acesso em aberto." : "Nenhum pedido de acesso neste filtro."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Usuário</TableHead>
                <TableHead className={TH}>Permissão</TableHead>
                <TableHead className={TH}>Onde</TableHead>
                <TableHead className={`${TH} text-right`}>Vezes</TableHead>
                <TableHead className={TH}>Primeiro pedido</TableHead>
                <TableHead className={TH}>Último pedido</TableHead>
                <TableHead className={TH}>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagAtual.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.usuario_nome ?? "—"}</TableCell>
                  <TableCell>
                    <div>{p.permissao_nome ?? "—"}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{p.permissao_slug}</div>
                  </TableCell>
                  <TableCell>
                    <div>{p.rotulo_acao ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{p.rota ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.vezes}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDataHora(p.primeiro_em)}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDataHora(p.ultimo_em)}</TableCell>
                  <TableCell>
                    {p.status === "aberto" ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setDecidir({ p, s: "concedido" })}>Concedido</Button>
                        <Button size="sm" variant="outline" onClick={() => setDecidir({ p, s: "recusado" })}>Recusado</Button>
                      </div>
                    ) : (
                      <div className="text-xs">
                        <Badge variant={p.status === "concedido" ? "default" : "secondary"}>{p.status}</Badge>
                        <div className="mt-1 text-muted-foreground">
                          {p.resolvido_por_nome ?? "—"} · {fmtDataHora(p.resolvido_em)}
                        </div>
                        {p.resolucao_nota && <div className="text-muted-foreground">{p.resolucao_nota}</div>}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <RodapePaginacao
            total={linhas.length}
            pagina={pagina}
            tamanhoPagina={tamanho}
            tela="pedidos_acesso"
            onPagina={setPagina}
            onTamanhoPagina={(n) => { setTamanho(n); setPagina(1); }}
          />
        </div>
      )}

      <Dialog open={!!decidir} onOpenChange={(o) => { if (!o && !resolver.isPending) { setDecidir(null); setNota(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como {decidir?.s === "concedido" ? "concedido" : "recusado"}?</DialogTitle>
            <DialogDescription>
              {decidir?.p.usuario_nome ?? "Usuário"} · {decidir?.p.permissao_nome ?? decidir?.p.permissao_slug}
            </DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDecidir(null); setNota(""); }} disabled={resolver.isPending}>Cancelar</Button>
            <Button
              disabled={resolver.isPending}
              onClick={() => decidir && resolver.mutate({ id: decidir.p.id, s: decidir.s, nota })}
            >
              {resolver.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
