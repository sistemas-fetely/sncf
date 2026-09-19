/**
 * ConciliacaoPorCliente — o recebível lido no eixo canônico da Fetely:
 * CLIENTE (conta corrente) → TÍTULOS → PROVA. O pedido é rastro, nunca o eixo.
 *
 * Três níveis, uma tabela por nível, carregamento sob demanda:
 *  N1 vw_conta_cliente_saldo   — saldo, vencido em aberto, a vencer
 *  N2 vw_ciclo_titulo          — títulos do cliente + escada (elo_caixa)
 *  N3 movimentacao + conta_cliente_alocacao — a prova
 *
 * FAIL-LOUD: todo fetch joga o erro do banco; nada de estado vazio disfarçado.
 */
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Inbox, AlertTriangle } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { estaVencido } from "@/lib/data";

type ClienteRow = {
  parceiro_id: string | null;
  nome_exibicao: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  saldo: number | null;
  vencido_em_aberto: number | null;
  a_vencer: number | null;
};

type TituloRow = {
  titulo_id: string | null;
  numero_titulo: string | null;
  numero_parcela: number | null;
  total_parcelas: number | null;
  valor_atual: number | null;
  data_vencimento_atual: string | null;
  data_pagamento: string | null;
  status: string | null;
  elo_caixa: string | null;
  nf_ref: string | null;
  pedido_ref: string | null;
  movimentacao_id: string | null;
  mov_data: string | null;
  mov_valor: number | null;
  mov_conta: string | null;
  mov_descricao: string | null;
};

/** Escada de prova a partir de elo_caixa (BADGE-LÊ-A-MESMA-FONTE-DA-TELA). */
function escadaDoElo(
  elo: string | null,
  status: string | null
): { label: string; classe: string } {
  switch (elo) {
    case "caixa_confirmado":
      return { label: "Conciliado", classe: "bg-success/10 text-success-strong" };
    case "quitado_por_haver":
      return { label: "Quitado s/ caixa", classe: "bg-info/10 text-info-strong" };
    case "aguarda_safrapay":
      return { label: "Compensando", classe: "bg-warning/10 text-warning-strong" };
    case "pago_sem_rastro":
      return { label: "Pago sem prova", classe: "bg-warning/10 text-warning-strong" };
    case "cancelado":
    case "devolvido":
      return { label: elo === "cancelado" ? "Cancelado" : "Devolvido", classe: "bg-muted text-muted-foreground" };
    case "previsto":
    case "previsto_vencido":
    case "sem_previsao":
      if ((status || "").toLowerCase() === "aberto")
        return { label: "Recebível", classe: "bg-secondary text-secondary-foreground" };
      return { label: elo ?? "—", classe: "bg-muted text-muted-foreground" };
    default:
      return { label: elo ?? "—", classe: "bg-muted text-muted-foreground" };
  }
}

const num = (v: number | null | undefined) => Number(v ?? 0);

function TituloProva({ titulo }: { titulo: TituloRow }) {
  const tituloId = titulo.titulo_id ?? "";
  const { data, isLoading, error } = useQuery({
    queryKey: ["concil-por-cliente", "alocacoes", tituloId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conta_cliente_alocacao")
        .select("id, lancamento_id, valor, modo")
        .eq("titulo_id", tituloId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tituloId,
  });

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-destructive-strong">
        <AlertTriangle className="h-4 w-4" />
        {error.message}
      </div>
    );
  }

  const temCaixa = !!titulo.movimentacao_id;
  const alocacoes = data ?? [];

  return (
    <div className="space-y-1 px-3 py-2 text-sm">
      {temCaixa && (
        <div>
          <span className="text-muted-foreground">Caixa: </span>
          {formatDateBR(titulo.mov_data)} · {formatBRL(titulo.mov_valor)} ·{" "}
          {titulo.mov_conta ?? "—"} · {titulo.mov_descricao ?? "—"}
        </div>
      )}
      {isLoading ? (
        <Skeleton className="h-4 w-64" />
      ) : (
        alocacoes.map((a) => (
          <div key={a.id}>
            <span className="text-muted-foreground">Alocação da conta: </span>
            {formatBRL(a.valor)} · modo {a.modo ?? "—"}
          </div>
        ))
      )}
      {!isLoading && !temCaixa && alocacoes.length === 0 && (
        <div className="text-muted-foreground">Sem prova vinculada.</div>
      )}
    </div>
  );
}

function TitulosDoCliente({ parceiroId }: { parceiroId: string }) {
  const [abertoTitulo, setAbertoTitulo] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["concil-por-cliente", "titulos", parceiroId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_ciclo_titulo")
        .select(
          "titulo_id, numero_titulo, numero_parcela, total_parcelas, valor_atual, data_vencimento_atual, data_pagamento, status, elo_caixa, nf_ref, pedido_ref, movimentacao_id, mov_data, mov_valor, mov_conta, mov_descricao"
        )
        .eq("parceiro_id", parceiroId);
      if (error) throw error;
      return (data ?? []) as TituloRow[];
    },
  });

  const titulos = useMemo(() => {
    const rows = [...(data ?? [])];
    const aberto = (t: TituloRow) => (t.status || "").toLowerCase() === "aberto";
    return rows.sort((a, b) => {
      const aa = aberto(a), ba = aberto(b);
      if (aa !== ba) return aa ? -1 : 1;
      if (aa) return (a.data_vencimento_atual ?? "9999").localeCompare(b.data_vencimento_atual ?? "9999");
      return (b.data_pagamento ?? "").localeCompare(a.data_pagamento ?? "");
    });
  }, [data]);

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-3 text-sm text-destructive-strong">
        <AlertTriangle className="h-4 w-4" />
        {error.message}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2 px-3 py-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  if (titulos.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-muted-foreground">
        Nenhum título para este cliente.
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <Table containerClassName="overflow-visible">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Título</TableHead>
            <TableHead>Parcela</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Vence</TableHead>
            <TableHead>Escada</TableHead>
            <TableHead>NF</TableHead>
            <TableHead>Pedido</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {titulos.map((t) => {
            const id = t.titulo_id ?? "";
            const escada = escadaDoElo(t.elo_caixa, t.status);
            const abertoStatus = (t.status || "").toLowerCase() === "aberto";
            const vencido = abertoStatus && estaVencido(t.data_vencimento_atual);
            const expandido = abertoTitulo === id;
            return (
              <Fragment key={id}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => setAbertoTitulo(expandido ? null : id)}
                >
                  <TableCell>
                    {expandido ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.numero_titulo ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {t.numero_parcela && t.total_parcelas
                      ? `${t.numero_parcela}/${t.total_parcelas}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBRL(t.valor_atual)}
                  </TableCell>
                  <TableCell className={vencido ? "text-destructive-strong" : undefined}>
                    {formatDateBR(t.data_vencimento_atual)}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${escada.classe} hover:${escada.classe}`} variant="secondary">
                      {escada.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.nf_ref ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {t.pedido_ref ?? "—"}
                  </TableCell>
                </TableRow>
                {expandido && (
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell />
                    <TableCell colSpan={7}>
                      <TituloProva titulo={t} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function ConciliacaoPorCliente() {
  const [busca, setBusca] = useState("");
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [abertoCliente, setAbertoCliente] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["concil-por-cliente", "clientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_conta_cliente_saldo")
        .select(
          "parceiro_id, nome_exibicao, razao_social, nome_fantasia, saldo, vencido_em_aberto, a_vencer"
        );
      if (error) throw error;
      return (data ?? []) as ClienteRow[];
    },
  });

  const clientes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const nomeDe = (c: ClienteRow) =>
      c.nome_exibicao || c.razao_social || c.nome_fantasia || "—";
    return (data ?? [])
      .filter((c) => !!c.parceiro_id)
      .filter((c) =>
        mostrarTodos
          ? true
          : num(c.saldo) !== 0 || num(c.vencido_em_aberto) > 0 || num(c.a_vencer) > 0
      )
      .filter((c) => (termo ? nomeDe(c).toLowerCase().includes(termo) : true))
      .sort(
        (a, b) =>
          num(b.vencido_em_aberto) - num(a.vencido_em_aberto) ||
          num(b.a_vencer) - num(a.a_vencer)
      )
      .map((c) => ({ ...c, _nome: nomeDe(c) }));
  }, [data, busca, mostrarTodos]);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-destructive/10 px-3 py-3 text-sm text-destructive-strong">
        <AlertTriangle className="h-4 w-4" />
        {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente…"
          className="max-w-xs"
        />
        <div className="flex items-center gap-2">
          <Switch
            id="concil-mostrar-todos"
            checked={mostrarTodos}
            onCheckedChange={setMostrarTodos}
          />
          <Label htmlFor="concil-mostrar-todos" className="text-sm text-muted-foreground">
            Mostrar todos
          </Label>
        </div>
      </div>

      <div className="rounded-md border border-border">
        <Table containerClassName="overflow-visible">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Saldo em conta</TableHead>
              <TableHead className="text-right">Vencido em aberto</TableHead>
              <TableHead className="text-right">A vencer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [0, 1, 2, 3, 4].map((i) => (
                <TableRow key={i}>
                  {[0, 1, 2, 3, 4].map((j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : clientes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  <Inbox className="mx-auto mb-2 h-5 w-5" />
                  Nenhum cliente com recebível ou saldo.
                </TableCell>
              </TableRow>
            ) : (
              clientes.map((c) => {
                const id = c.parceiro_id as string;
                const expandido = abertoCliente === id;
                return (
                  <Fragment key={id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setAbertoCliente(expandido ? null : id)}
                    >
                      <TableCell>
                        {expandido ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{c._nome}</TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          num(c.saldo) > 0 ? "text-success-strong" : ""
                        }`}
                      >
                        {formatBRL(c.saldo)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          num(c.vencido_em_aberto) > 0 ? "text-destructive-strong" : ""
                        }`}
                      >
                        {formatBRL(c.vencido_em_aberto)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL(c.a_vencer)}
                      </TableCell>
                    </TableRow>
                    {expandido && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={4} className="p-0">
                          <TitulosDoCliente parceiroId={id} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default ConciliacaoPorCliente;
