import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { fmtDataHora } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { contaCorrenteFornecedores, linhaPendente, rotuloMes, situacaoEntrada, situacaoMes, type RotinaContasPagar } from "@/lib/despesas/rotina";

// Typed boundary for the existing RPC until the generated client includes its signature.
const consultarRotina = supabase.rpc.bind(supabase) as unknown as (nome: "fn_contas_pagar_rotina") => PromiseLike<{
  data: RotinaContasPagar | null;
  error: { message: string } | null;
}>;

export function HojeTab({ abrirClassificar }: { abrirClassificar: () => void }) {
  const rotina = useQuery({
    queryKey: ["contas-pagar-rotina"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await consultarRotina("fn_contas_pagar_rotina");
      if (error) throw error;
      if (!data) throw new Error("A consulta da rotina não retornou dados.");
      return data;
    },
  });
  const data = rotina.data;
  const precisa = data?.precisa_de_voce;
  const resolvido = data?.sistema_resolveu_7_dias;
  const linhas = precisa ? [
    { rotulo: "Despesas a classificar", quantidade: precisa.classificar.grupos, detalhe: `${precisa.classificar.grupos} grupos · ${precisa.classificar.itens} itens`, valor: precisa.classificar.valor, apoio: `${precisa.classificar.grupos_com_sugestao} já com sugestão`, destino: null },
    { rotulo: "Pago sem destino", quantidade: precisa.pago_sem_destino.debitos, detalhe: `${precisa.pago_sem_destino.debitos} débitos`, valor: precisa.pago_sem_destino.valor, apoio: `${precisa.pago_sem_destino.com_sugestao} com par sugerido`, destino: "/administrativo/conciliacao-despesas" },
    { rotulo: "Títulos vencidos em aberto", quantidade: precisa.vencidos.titulos, detalhe: `${precisa.vencidos.titulos} títulos`, valor: precisa.vencidos.valor, apoio: "", destino: "/administrativo/contas-pagar?kpi=vencido" },
    { rotulo: "A pagar nos próximos 7 dias", quantidade: precisa.a_pagar_7_dias.titulos, detalhe: `${precisa.a_pagar_7_dias.titulos} títulos`, valor: precisa.a_pagar_7_dias.valor, apoio: "", destino: "/administrativo/contas-pagar" },
    { rotulo: "Notas novas sem título", quantidade: precisa.notas_sem_titulo.notas, detalhe: `${precisa.notas_sem_titulo.notas} notas`, valor: precisa.notas_sem_titulo.valor, apoio: "", destino: "/administrativo/nf-a-gerar-titulo?aba=sem-titulo" },
  ] : [];
  const contaCorrente = contaCorrenteFornecedores(data);
  const indicadores = resolvido ? [
    { rotulo: "Baixas automáticas", ...resolvido.baixas_automaticas },
    { rotulo: "Títulos que nasceram sozinhos", ...resolvido.titulos_nascidos_sozinhos },
    { rotulo: "Despesas classificadas por regra", ...resolvido.classificadas_por_regra },
    { rotulo: "Duplicados barrados", ...resolvido.duplicados_barrados },
  ] : [];

  return <div className="space-y-6" data-testid="despesas-hoje">
    <div className="flex flex-wrap items-center justify-end gap-2">
      {data && <span className="text-xs text-muted-foreground">{fmtDataHora(data.gerado_em)}</span>}
      <Button variant="ghost" size="sm" disabled={rotina.isFetching} onClick={() => void rotina.refetch()}>
        <RefreshCw className={cn("h-4 w-4", rotina.isFetching && "animate-spin motion-reduce:animate-none")} />Atualizar
      </Button>
    </div>
    {rotina.error && <div role="alert" className="rounded-md border border-destructive bg-card p-4 text-sm text-destructive">{formatError(rotina.error)}</div>}
    {rotina.isPending && <div aria-label="Carregando rotina" className="space-y-6">
      {[0, 1, 2, 3].map((i) => <div key={i} className="space-y-3"><Skeleton className="h-6 w-64" /><Skeleton className="h-40 w-full" /></div>)}
    </div>}
    {data && resolvido && <>
      <section className="space-y-3" aria-labelledby="rotina-precisa">
        <h2 id="rotina-precisa" className="text-lg font-medium">Precisa de você</h2>
        <div className="divide-y divide-border rounded-md border bg-card text-card-foreground">
          {linhas.map((linha) => {
            const estado = linhaPendente(linha.quantidade);
            return <div key={linha.rotulo} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)_minmax(8rem,auto)_auto]", estado.esmaecida && "opacity-50")}>
              <div className="min-w-0"><p className="font-medium">{linha.rotulo}</p><p className="text-xs text-muted-foreground">{estado.esmaecida ? "Nada pendente" : linha.apoio}</p></div>
              <span className="text-sm tabular-nums">{linha.detalhe}</span>
              <span className="font-medium tabular-nums sm:text-right">{formatBRL(linha.valor)}</span>
              <div className="min-w-16 text-right">{estado.podeAbrir && (linha.destino
                ? <Button asChild variant="link" size="sm"><Link to={linha.destino} aria-label={`Abrir ${linha.rotulo}`}>Abrir</Link></Button>
                : <Button variant="link" size="sm" onClick={abrirClassificar} aria-label={`Abrir ${linha.rotulo}`}>Abrir</Button>)}</div>
            </div>;
          })}
        </div>
      </section>
      {contaCorrente.length > 0 && <section className="space-y-3" aria-labelledby="rotina-conta-corrente">
        <h2 id="rotina-conta-corrente" className="text-lg font-medium">Conta corrente de fornecedores</h2>
        <div className="grid gap-3 xl:grid-cols-2">
          {contaCorrente.map((fornecedor) => <div key={fornecedor.cnpj ?? fornecedor.nome} className="flex flex-col gap-3 rounded-md border bg-card p-4 text-card-foreground">
            <div className="min-w-0">
              <p className="break-words font-medium">{fornecedor.nome}</p>
              <p className="text-xs text-muted-foreground">Nota não gera título — a obrigação é o saldo</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saldo devedor</p>
              <p className="text-2xl font-medium tabular-nums">{formatBRL(fornecedor.saldo)}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div><p className="text-xs text-muted-foreground">Vencido</p><p className={cn("text-sm font-medium tabular-nums", fornecedor.vencido > 0 && "text-destructive")}>{formatBRL(fornecedor.vencido)}</p></div>
              <div><p className="text-xs text-muted-foreground">A vencer</p><p className="text-sm font-medium tabular-nums">{formatBRL(fornecedor.a_vencer)}</p></div>
              <div><p className="text-xs text-muted-foreground">Sem vencimento na nota</p><p className="text-sm font-medium tabular-nums">{formatBRL(fornecedor.sem_vencimento)}</p></div>
            </div>
            <p className="break-words text-xs text-muted-foreground">
              Notas: {formatBRL(fornecedor.documentado)} · Pago: {formatBRL(fornecedor.pago)} · Último pagamento: {fornecedor.ultimo_pagamento ? formatDateBR(fornecedor.ultimo_pagamento) : "—"} · {fornecedor.notas_abertas} {fornecedor.notas_abertas === 1 ? "nota em aberto" : "notas em aberto"}
            </p>
          </div>)}
        </div>
      </section>}
      <section className="space-y-3" aria-labelledby="rotina-resolvido">
        <h2 id="rotina-resolvido" className="text-lg font-medium">O sistema resolveu sozinho · últimos 7 dias</h2>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {indicadores.map((indicador) => <div key={indicador.rotulo} className="flex flex-col justify-between gap-2 rounded-md border bg-card p-4 text-card-foreground">
            <p className="text-sm text-muted-foreground">{indicador.rotulo}</p>
            <p className="text-2xl font-medium tabular-nums">{indicador.qtd}</p>
            <p className="text-sm tabular-nums">{formatBRL(indicador.valor)}</p>
          </div>)}
        </div>
        <p className="text-sm text-muted-foreground">Classificação: {resolvido.classificadas_por_regra.qtd} por regra · {resolvido.classificadas_a_mao.qtd} à mão</p>
        {resolvido.classificadas_por_regra.qtd === 0 && <p className="text-sm text-muted-foreground">Confirme grupos em A classificar para o sistema passar a classificar sozinho.</p>}
      </section>
      <section className="space-y-3" aria-labelledby="rotina-entradas">
        <h2 id="rotina-entradas" className="text-lg font-medium">As entradas estão em dia?</h2>
        <div className="rounded-md border bg-card text-card-foreground">
          <Table className="table-fixed"><TableHeader><TableRow><TableHead>Entrada</TableHead><TableHead>Último dado</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
            <TableBody>{[...data.entradas].sort((a, b) => a.ordem - b.ordem).map((entrada) => {
              const estado = situacaoEntrada(entrada.dias);
              return <TableRow key={entrada.entrada}><TableCell className="break-words">{entrada.entrada}</TableCell><TableCell>{formatDateBR(entrada.ultima_data)}</TableCell><TableCell className={cn("break-words", estado.tom)}>{estado.texto}</TableCell></TableRow>;
            })}</TableBody>
          </Table>
        </div>
        <Button asChild variant="link" size="sm" className="px-0"><Link to="/administrativo/extrato-importacao">Importar extratos e relatórios</Link></Button>
      </section>
      <section className="space-y-3" aria-labelledby="rotina-meses">
        <h2 id="rotina-meses" className="text-lg font-medium">Fechamento por mês</h2>
        <p className="text-sm text-muted-foreground">Um mês está pronto para fechar quando não há despesa sem conta nem débito sem destino.</p>
        <div className="rounded-md border bg-card text-card-foreground">
          <Table className="table-fixed"><TableHeader><TableRow><TableHead>Mês</TableHead><TableHead>Despesas sem conta</TableHead><TableHead>Débitos sem destino</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
            <TableBody>{data.meses.map((mes) => {
              const estado = situacaoMes(mes);
              return <TableRow key={mes.mes}><TableCell>{rotuloMes(mes.mes)}</TableCell><TableCell className="tabular-nums"><span className="block font-medium">{mes.despesas_sem_conta}</span><span className="text-xs text-muted-foreground">{formatBRL(mes.valor_sem_conta)}</span></TableCell><TableCell className="tabular-nums"><span className="block font-medium">{mes.debitos_sem_destino}</span><span className="text-xs text-muted-foreground">{formatBRL(mes.valor_sem_destino)}</span></TableCell><TableCell className={cn("break-words", estado.tom)}>{estado.texto}</TableCell></TableRow>;
            })}</TableBody>
          </Table>
        </div>
      </section>
    </>}
  </div>;
}