import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Receipt, Plus, Wrench, CalendarRange, RefreshCw, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import LancarReembolsoSheet from "@/components/pessoas/reembolso/LancarReembolsoSheet";
import SolicitacaoDrawer from "@/components/pessoas/reembolso/SolicitacaoDrawer";
import {
  useSolicitacoes, useCiclos, useCicloDaData, formatarBRL, formatarData,
  ROTULO_ESTADO, type EstadoSolicitacao,
} from "@/hooks/useReembolso";

type Filtro = "todos" | EstadoSolicitacao;

const FILTROS: Array<{ valor: Filtro; rotulo: string }> = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "em_validacao", rotulo: "Em validação" },
  { valor: "devolvido", rotulo: "Devolvidos" },
  { valor: "aprovado", rotulo: "Aprovados" },
  { valor: "em_lote", rotulo: "Em lote" },
  { valor: "pago", rotulo: "Pagos" },
];

function BadgeEstado({ estado }: { estado: string }) {
  const tom =
    estado === "aprovado" || estado === "pago"
      ? "bg-success/10 text-success"
      : estado === "devolvido" || estado === "cancelado"
        ? "bg-destructive/10 text-destructive"
        : estado === "em_lote"
          ? "bg-primary/10 text-primary"
          : "bg-warning/10 text-warning";
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", tom)}>
      {ROTULO_ESTADO[estado] ?? estado}
    </span>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <div className="min-w-[120px]">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
    </div>
  );
}

export default function Reembolsos() {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [sheetAberto, setSheetAberto] = useState(false);
  const [solicitacaoAberta, setSolicitacaoAberta] = useState<string | null>(null);

  const listaQ = useSolicitacoes("todos");
  const ciclosQ = useCiclos();
  const hoje = new Date().toISOString().slice(0, 10);
  const cicloHojeQ = useCicloDaData(hoje);

  const todas = listaQ.data ?? [];

  const resumo = useMemo(() => {
    const mesAtual = hoje.slice(0, 7);
    let emValidacao = 0, aprovados = 0, emLote = 0, pagosMes = 0;
    for (const s of todas) {
      if (s.estado === "em_validacao") emValidacao++;
      if (s.estado === "aprovado") aprovados++;
      if (s.estado === "em_lote") emLote++;
      if (s.estado === "pago" && (s.data_aprovacao ?? s.created_at ?? "").slice(0, 7) === mesAtual) {
        pagosMes++;
      }
    }
    const cicloAberto = (ciclosQ.data ?? []).find((c) => c.estado === "aberto");
    return {
      emValidacao,
      aprovados,
      emLote,
      pagosMes,
      totalCiclo: cicloAberto?.total_aprovado ?? 0,
      referencia: cicloAberto?.referencia ?? null,
    };
  }, [todas, ciclosQ.data, hoje]);

  const filtradas = useMemo(
    () => (filtro === "todos" ? todas : todas.filter((s) => s.estado === filtro)),
    [todas, filtro],
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            Reembolsos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fila de operação: lançar o que chegou, resolver pendência e aprovar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setSheetAberto(true)}>
            <Plus className="h-4 w-4" />
            Lançar reembolso recebido
          </Button>
          <Button variant="outline" asChild>
            <Link to="/pessoas/reembolsos/ciclos">
              <CalendarRange className="h-4 w-4" />
              Ciclos e pagamentos
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/pessoas/reembolsos/saneamento">
              <Wrench className="h-4 w-4" />
              Sanear cadastro
            </Link>
          </Button>
        </div>
      </div>

      <Card className="card-shadow">
        <CardContent className="flex flex-wrap items-center gap-x-10 gap-y-4 py-4">
          <Resumo rotulo="Em validação" valor={resumo.emValidacao} />
          <Resumo rotulo="Aprovados" valor={resumo.aprovados} />
          <Resumo rotulo="Em lote" valor={resumo.emLote} />
          <Resumo rotulo="Pagos no mês" valor={resumo.pagosMes} />
          <Resumo
            rotulo={`Total do ciclo aberto${resumo.referencia ? ` (${resumo.referencia})` : ""}`}
            valor={formatarBRL(resumo.totalCiclo)}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f.valor}
            size="sm"
            variant={filtro === f.valor ? "default" : "outline"}
            onClick={() => setFiltro(f.valor)}
          >
            {f.rotulo}
          </Button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">
          {filtradas.length} reembolso{filtradas.length === 1 ? "" : "s"}
        </span>
      </div>

      {listaQ.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive space-y-2">
          <p className="break-words">
            Não foi possível carregar os reembolsos. {(listaQ.error as Error)?.message}
          </p>
          <Button size="sm" variant="outline" onClick={() => listaQ.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
          </Button>
        </div>
      ) : listaQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando reembolsos…
        </div>
      ) : filtradas.length === 0 ? (
        <Card className="card-shadow">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum reembolso neste filtro.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Pessoa</TableHead>
                <TableHead>Recebido em</TableHead>
                <TableHead className="text-right">Solicitado</TableHead>
                <TableHead className="text-right">Aprovado</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Pendências</TableHead>
                <TableHead>Ciclo se aprovar hoje</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => setSolicitacaoAberta(s.id)}
                >
                  <TableCell className="font-medium">{s.numero ?? "—"}</TableCell>
                  <TableCell>{s.nome_completo ?? "—"}</TableCell>
                  <TableCell>{formatarData(s.data_recebimento)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarBRL(s.valor_solicitado)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarBRL(s.valor_aprovado)}
                  </TableCell>
                  <TableCell>
                    <BadgeEstado estado={s.estado} />
                  </TableCell>
                  <TableCell>
                    {s.bloqueantes === 0 && s.avisos === 0 ? (
                      <Badge className="bg-success/10 text-success hover:bg-success/10">
                        Sem apontamento
                      </Badge>
                    ) : (
                      <span className="text-xs">
                        {s.bloqueantes > 0 && (
                          <span className="text-destructive font-medium">
                            {s.bloqueantes} bloqueante{s.bloqueantes === 1 ? "" : "s"}
                          </span>
                        )}
                        {s.bloqueantes > 0 && s.avisos > 0 && " · "}
                        {s.avisos > 0 && (
                          <span className="text-warning font-medium">
                            {s.avisos} aviso{s.avisos === 1 ? "" : "s"}
                          </span>
                        )}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.estado === "em_validacao" ? cicloHojeQ.data ?? "—" : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSolicitacaoAberta(s.id);
                      }}
                    >
                      Abrir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <LancarReembolsoSheet
        open={sheetAberto}
        onOpenChange={setSheetAberto}
        onCriado={(id) => setSolicitacaoAberta(id)}
      />
      <SolicitacaoDrawer
        solicitacaoId={solicitacaoAberta}
        onOpenChange={(v) => !v && setSolicitacaoAberta(null)}
      />
    </div>
  );
}
