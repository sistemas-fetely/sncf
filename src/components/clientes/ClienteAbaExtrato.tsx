/**
 * Extrato da conta do cliente. Data desc, sinal +/− colorido.
 * A única escrita é registrar recebimento — cliente já pré-selecionado.
 *
 * Lançamentos que nasceram na conta corrente (`recebimento_conta` /
 * `estorno_conta` na view) expandem e mostram onde o dinheiro foi alocado
 * (`conta_cliente_alocacao` → título). A leitura é sob demanda, ao expandir.
 */
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Paperclip, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import {
  useContaClienteLancamentos,
  type ContaClienteLancamento,
} from "@/hooks/financeiro/useContaCliente";
import { useEnviarComprovanteCliente } from "@/hooks/comercial/useComprovantePagamento";
import { RegistrarRecebimentoDialog } from "@/components/financeiro/RegistrarRecebimentoDialog";

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function meioBanco(meio: string | null | undefined, banco: string | null | undefined) {
  const partes: string[] = [];
  if (meio) {
    const m = meio.trim();
    const normalizado = m === m.toLowerCase()
      ? m.charAt(0).toUpperCase() + m.slice(1)
      : m;
    partes.push(normalizado);
  }
  if (banco) partes.push(banco.trim());
  return partes.length ? partes.join(" · ") : "—";
}

/** Lançamento vindo da conta corrente (origem conta_cliente_lancamento). */
function ehLancamentoDeConta(l: ContaClienteLancamento) {
  return l.tipo === "recebimento_conta" || l.tipo === "estorno_conta";
}

interface AlocacaoLinha {
  id: string;
  valor: number;
  modo: string;
  numero_titulo: string | null;
  valor_atual: number | null;
  status_titulo: string | null;
  vencimento_titulo: string | null;
}

interface AlocacoesLancamento {
  valor_lancamento: number;
  alocacoes: AlocacaoLinha[];
}

/**
 * Alocações de um lançamento da conta — sob demanda (só dispara ao expandir).
 * A view do extrato não expõe o id do lançamento, então a amarra é pela
 * chave natural: parceiro + data + valor + meio.
 */
function useAlocacoesLancamento(l: ContaClienteLancamento | null, aberto: boolean) {
  return useQuery({
    queryKey: ["conta-cliente-alocacoes", l?.parceiro_id, l?.data, l?.valor, l?.meio],
    enabled: aberto && !!l,
    queryFn: async (): Promise<AlocacoesLancamento> => {
      let q = supabase
        .from("conta_cliente_lancamento")
        .select("id, valor")
        .eq("parceiro_id", l!.parceiro_id)
        .eq("data_recebimento", l!.data)
        .eq("valor", l!.valor)
        .order("criado_em", { ascending: true })
        .limit(1);
      if (l!.meio) q = q.eq("meio", l!.meio);
      const { data: lancs, error: erroLanc } = await q;
      if (erroLanc) throw erroLanc;
      const lanc = lancs?.[0];
      if (!lanc) return { valor_lancamento: Number(l!.valor ?? 0), alocacoes: [] };

      const { data: als, error: erroAl } = await supabase
        .from("conta_cliente_alocacao")
        .select(
          "id, valor, modo, titulo:titulo_a_receber(numero_titulo, valor_atual, status, data_vencimento_atual)",
        )
        .eq("lancamento_id", lanc.id)
        .order("criado_em", { ascending: true });
      if (erroAl) throw erroAl;

      return {
        valor_lancamento: Number(lanc.valor ?? 0),
        alocacoes: (als ?? []).map((a) => ({
          id: a.id,
          valor: Number(a.valor ?? 0),
          modo: a.modo,
          numero_titulo: a.titulo?.numero_titulo ?? null,
          valor_atual: a.titulo?.valor_atual ?? null,
          status_titulo: a.titulo?.status ?? null,
          vencimento_titulo: a.titulo?.data_vencimento_atual ?? null,
        })),
      };
    },
  });
}

/** Detalhe "Alocado em" de um lançamento da conta corrente. */
function AlocacoesDetalhe({ l }: { l: ContaClienteLancamento }) {
  const aloc = useAlocacoesLancamento(l, true);

  if (aloc.isLoading) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" /> carregando alocações
      </p>
    );
  }

  if (aloc.isError) {
    return (
      <p className="text-xs text-destructive">
        {(aloc.error as Error)?.message ?? "Falha ao carregar as alocações."}
      </p>
    );
  }

  const alocacoes = aloc.data?.alocacoes ?? [];
  const valorLancamento = aloc.data?.valor_lancamento ?? Number(l.valor ?? 0);

  if (alocacoes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Alocado em:</span>{" "}
        Livre (não alocado) — {formatBRL(valorLancamento)}
      </p>
    );
  }

  const totalAlocado = alocacoes.reduce((acc, a) => acc + a.valor, 0);
  const livre = valorLancamento - totalAlocado;

  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Alocado em
      </p>
      <ul className="space-y-0.5">
        {alocacoes.map((a) => (
          <li key={a.id} className="text-xs flex flex-wrap items-center gap-x-2">
            <span className="font-medium">{a.numero_titulo ?? "—"}</span>
            <span>{formatBRL(a.valor)}</span>
            <span className="text-muted-foreground">{a.modo}</span>
            <span className="text-muted-foreground">
              {a.status_titulo ?? "—"}
              {a.vencimento_titulo ? ` · venc. ${dataBR(a.vencimento_titulo)}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {livre > 0.004 && (
        <p className="text-xs text-muted-foreground">
          Livre (não alocado) — {formatBRL(livre)}
        </p>
      )}
    </div>
  );
}

export function ClienteAbaExtrato({
  parceiroId,
  clienteNome,
}: {
  parceiroId: string;
  clienteNome: string | null;
}) {
  const lancamentos = useContaClienteLancamentos(parceiroId);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const inputComprovanteRef = useRef<HTMLInputElement>(null);
  const enviarComprovanteCliente = useEnviarComprovanteCliente(parceiroId);

  function alternar(chave: string) {
    setAbertos((prev) => ({ ...prev, [chave]: !prev[chave] }));
  }

  async function anexarComprovante(file: File) {
    try {
      // FAIL-LOUD: await de verdade; o erro sai no toast do hook.
      await enviarComprovanteCliente.mutateAsync(file);
    } catch {
      /* toast já saiu */
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          Todo dinheiro entra na conta do CNPJ; o pedido debita o saldo.
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={inputComprovanteRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void anexarComprovante(file);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={enviarComprovanteCliente.isPending}
            onClick={() => inputComprovanteRef.current?.click()}
          >
            {enviarComprovanteCliente.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Paperclip className="h-3.5 w-3.5" />
            )}
            Anexar comprovante
          </Button>
          <RegistrarRecebimentoDialog parceiroId={parceiroId} parceiroNome={clienteNome}>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Registrar recebimento
            </Button>
          </RegistrarRecebimentoDialog>
        </div>
      </div>

      {lancamentos.isLoading && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> carregando
        </p>
      )}

      {lancamentos.isError && (
        <p className="text-xs text-destructive">
          {(lancamentos.error as any)?.message ?? "Falha ao carregar o extrato."}
        </p>
      )}

      {lancamentos.data && lancamentos.data.length === 0 && (
        <p className="text-xs text-muted-foreground">Sem lançamentos.</p>
      )}

      {lancamentos.data && lancamentos.data.length > 0 && (
        <div className="rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Referência</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Meio · Banco</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lancamentos.data.map((l, i) => {
                const credito = Number(l.sinal ?? 0) >= 0;
                const chave = `${l.titulo_id ?? l.ref}-${i}`;
                const expansivel = ehLancamentoDeConta(l);
                const aberto = !!abertos[chave];
                return [
                  <TableRow
                    key={chave}
                    className={cn(expansivel && "cursor-pointer")}
                    onClick={expansivel ? () => alternar(chave) : undefined}
                  >
                    <TableCell className="w-8 pr-0">
                      {expansivel &&
                        (aberto ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        ))}
                    </TableCell>
                    <TableCell className="text-xs">{dataBR(l.data)}</TableCell>
                    <TableCell className="text-xs">{l.tipo}</TableCell>
                    <TableCell className="text-xs">{l.ref ?? "—"}</TableCell>
                    <TableCell className="text-xs">{l.pedido_ref ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {dataBR(l.vencimento)}
                      {l.vencido_aberto && (
                        <span className="ml-1 text-[10px] text-destructive">vencido</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{dataBR(l.data_pagamento)}</TableCell>
                    <TableCell className="text-[11px]">{meioBanco(l.meio, l.banco)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right text-xs font-medium",
                        credito ? "text-success" : "text-foreground",
                      )}
                    >
                      {credito ? "+" : "−"}
                      {formatBRL(Math.abs(Number(l.valor ?? 0)))}
                    </TableCell>
                  </TableRow>,
                  expansivel && aberto ? (
                    <TableRow key={`${chave}-detalhe`} className="hover:bg-transparent">
                      <TableCell />
                      <TableCell colSpan={8} className="bg-muted/30 py-2">
                        <AlocacoesDetalhe l={l} />
                      </TableCell>
                    </TableRow>
                  ) : null,
                ];
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
