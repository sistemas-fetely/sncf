import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, Gift, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardIndicador } from "@/components/ui/card-indicador";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Selo } from "@/components/ui/selo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RodapePaginacao, DEFAULT_PAGE_SIZE, type PageSizeOption } from "@/components/tabela/RodapePaginacao";
import { fmtData } from "@/lib/data";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { ConcederBonificacaoDialog } from "./ConcederBonificacaoDialog";

export const QK_BONIFICACOES_SEM_REGISTRO = "bonificacoes-sem-registro";

export interface BonificacaoSemRegistro {
  pedido_id: string;
  id_externo: string | null;
  parceiro_id: string;
  cliente: string | null;
  data_pedido: string | null;
  estagio: string | null;
  estagio_rotulo: string | null;
  valor_bruto: number | null;
  itens: number | null;
  quantidade: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function useBonificacoesSemRegistro(parceiroId?: string, enabled = true) {
  return useQuery({
    queryKey: [QK_BONIFICACOES_SEM_REGISTRO, parceiroId ?? "todas"],
    staleTime: 0,
    enabled,
    queryFn: async (): Promise<BonificacaoSemRegistro[]> => {
      let q = sb
        .from("vw_bonificacao_sem_registro")
        .select("pedido_id, id_externo, parceiro_id, cliente, data_pedido, estagio, estagio_rotulo, valor_bruto, itens, quantidade")
        .order("data_pedido", { ascending: false });
      if (parceiroId) q = q.eq("parceiro_id", parceiroId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function estagioFinal(estagio: string | null) {
  return ["entregue", "encerrado", "cancelado", "devolvido"].includes(estagio ?? "");
}

export function BonificacoesPendentesTab() {
  const q = useBonificacoesSemRegistro();
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [tamanhoPagina, setTamanhoPagina] = useState(DEFAULT_PAGE_SIZE);
  const [registro, setRegistro] = useState<BonificacaoSemRegistro | null>(null);

  const lista = q.data ?? [];
  const totalValor = lista.reduce((s, l) => s + Number(l.valor_bruto ?? 0), 0);
  const filtrada = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return lista;
    return lista.filter((l) =>
      `${l.cliente ?? ""} ${l.id_externo ?? ""}`.toLocaleLowerCase("pt-BR").includes(termo),
    );
  }, [busca, lista]);

  useEffect(() => setPagina(1), [busca, tamanhoPagina]);
  const totalPaginas = Math.max(1, Math.ceil(filtrada.length / tamanhoPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const exibidas = filtrada.slice((paginaAtual - 1) * tamanhoPagina, paginaAtual * tamanhoPagina);

  return (
    <div className="space-y-4">
      {q.isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar os pedidos bonificados</AlertTitle>
          <AlertDescription>{formatError(q.error)}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <CardIndicador
          compacto
          rotulo="Pedidos sem registro"
          tom={!q.isError && lista.length > 0 ? "atencao" : "neutro"}
          valor={q.isLoading ? <Skeleton className="h-6 w-12" /> : q.isError ? "—" : lista.length}
        />
        <CardIndicador
          compacto
          rotulo="Valor sem registro"
          valor={q.isLoading ? <Skeleton className="h-6 w-28" /> : q.isError ? "—" : formatBRL(totalValor)}
        />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente ou pedido"
          className="h-8 pl-8"
        />
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : q.isError ? null : filtrada.length === 0 ? (
        <EstadoVazio
          icone={Gift}
          mensagem={busca.trim() ? "Nenhum pedido bonificado corresponde a esta busca." : "Todo pedido bonificado está registrado."}
        />
      ) : (
        <div className="rounded-md border border-border/60 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Estágio</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {exibidas.map((l) => (
                <TableRow key={l.pedido_id}>
                  <TableCell className="text-xs font-medium">{l.id_externo ?? l.pedido_id.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs">
                    <Link className="font-medium hover:underline" to={`/cliente/${l.parceiro_id}?aba=bonificacoes`}>
                      {l.cliente ?? "Cliente"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{fmtData(l.data_pedido)}</TableCell>
                  <TableCell>
                    <Selo estado={estagioFinal(l.estagio) ? "success" : "info"}>{l.estagio_rotulo ?? l.estagio ?? "—"}</Selo>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {Number(l.itens ?? 0)} · {Number(l.quantidade ?? 0)} un
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium tabular-nums">{formatBRL(Number(l.valor_bruto ?? 0))}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setRegistro(l)}>Registrar</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <RodapePaginacao
            total={filtrada.length}
            pagina={paginaAtual}
            tamanhoPagina={tamanhoPagina}
            tela="cliente_bonificacoes_pendentes"
            onPagina={setPagina}
            onTamanhoPagina={(n) => setTamanhoPagina(n as PageSizeOption)}
          />
        </div>
      )}

      {registro && (
        <ConcederBonificacaoDialog
          parceiroId={registro.parceiro_id}
          instrumentoInicial="pedido_bonificado"
          pedidoInicial={registro.pedido_id}
          open
          onOpenChange={(v) => { if (!v) setRegistro(null); }}
        />
      )}
    </div>
  );
}