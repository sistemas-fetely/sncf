import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { CardIndicador } from "@/components/ui/card-indicador";
import { TabelaFetely } from "@/components/ui/tabela-fetely";
import { RodapePaginacao, DEFAULT_PAGE_SIZE } from "@/components/tabela/RodapePaginacao";
import { Selo, type EstadoSelo } from "@/components/ui/selo";
import { ParaQueServe } from "@/components/compras/ParaQueServe";
import { CodProduto } from "@/components/produto/CodProduto";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDataHora } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import { normalizarBusca } from "@/lib/normalizar-busca";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Status = "ok" | "em_transito" | "persistente";
type Linha = {
  sku: string; cod_cadastro: string | null; nome_comercial: string | null; grupo: string | null;
  data_posicao: string; xpm_total: number | null; sncf_saldo: number | null; diferenca: number | null;
  dias_divergente: number | null; status: Status; sentido: string | null;
};

const STATUS: { valor: Status; rotulo: string; estado: EstadoSelo }[] = [
  { valor: "persistente", rotulo: "Persistente", estado: "warning" },
  { valor: "em_transito", rotulo: "Em trânsito", estado: "info" },
  { valor: "ok", rotulo: "OK", estado: "success" },
];
const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("pt-BR");
const comSinal = (n: number | null) => (n == null ? "—" : n > 0 ? `+${fmt(n)}` : fmt(n));
const corSentido = (s: string | null) =>
  s === "XPM tem mais" ? "text-info-strong" : s === "Sistema tem mais" ? "text-destructive" : "text-muted-foreground";

export default function ConciliacaoXpm() {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Status | "todos">("persistente");
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState<number>(DEFAULT_PAGE_SIZE);
  const [aberto, setAberto] = useState<Linha | null>(null);

  const q = useQuery({
    queryKey: ["conciliacao-xpm", "posicao"],
    queryFn: async (): Promise<Linha[]> => {
      const out: Linha[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await sb.from("vw_xpm_conciliacao_estoque").select("*").range(de, de + 999);
        if (error) throw error;
        out.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      return out;
    },
  });

  const resumo = useMemo(() => {
    const r = { ok: 0, em_transito: 0, persistente: 0, somaTransito: 0, somaPersistente: 0 };
    for (const l of q.data ?? []) {
      r[l.status] = (r[l.status] ?? 0) + 1;
      if (l.status === "em_transito") r.somaTransito += Math.abs(l.diferenca ?? 0);
      if (l.status === "persistente") r.somaPersistente += Math.abs(l.diferenca ?? 0);
    }
    return r;
  }, [q.data]);
  const dataPosicao = q.data?.[0]?.data_posicao ?? null;

  const filtradas = useMemo(() => {
    const t = normalizarBusca(busca.trim());
    return (q.data ?? [])
      .filter((l) => filtro === "todos" || l.status === filtro)
      .filter((l) => !t || [l.sku, l.cod_cadastro, l.nome_comercial].some((v) => normalizarBusca(v ?? "").includes(t)))
      .sort((a, b) => Math.abs(b.diferenca ?? 0) - Math.abs(a.diferenca ?? 0));
  }, [q.data, busca, filtro]);
  const pag = filtradas.slice((pagina - 1) * tamanho, pagina * tamanho);

  const serie = useQuery({
    queryKey: ["conciliacao-xpm", "serie", aberto?.sku],
    enabled: !!aberto,
    queryFn: async () => {
      const { data, error } = await sb.from("xpm_conciliacao_diaria")
        .select("data_posicao, xpm_total, sncf_saldo, diferenca")
        .eq("sku", aberto!.sku).order("data_posicao", { ascending: false }).limit(15);
      if (error) throw error;
      return (data ?? []) as { data_posicao: string; xpm_total: number; sncf_saldo: number; diferenca: number }[];
    },
  });

  const chips = [...STATUS.map((s) => ({ v: s.valor as Status | "todos", r: s.rotulo })), { v: "todos" as const, r: "Todos" }];

  return (
    <PageShell variant="dados">
      <PageHeader titulo="Conciliação XPM × Sistema" icone={Scale} />
      <div className="space-y-4">
        <ParaQueServe>
          Compara todo dia o estoque físico da XPM com o saldo do sistema. Diferença de até 2 dias costuma ser NF emitida
          ainda não expedida; acima disso é furo a investigar.
        </ParaQueServe>

        <section className="space-y-3 rounded-lg border bg-card p-4" aria-label="Resumo da posição">
          <p className="text-xs text-muted-foreground">
            Posição XPM: <span className="text-foreground">{dataPosicao ? fmtDataHora(dataPosicao) : "—"}</span>
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <CardIndicador rotulo="OK" valor={`${fmt(resumo.ok)} SKUs`} />
            <CardIndicador rotulo="Em trânsito" valor={`${fmt(resumo.em_transito)} SKUs`}
              nota={<>{fmt(resumo.somaTransito)} un. de diferença · NF x expedição, some sozinho</>} />
            <CardIndicador rotulo="Persistente" tom="atencao" valor={`${fmt(resumo.persistente)} SKUs`}
              nota={<>{fmt(resumo.somaPersistente)} un. de diferença · investigar</>} />
          </div>
        </section>

        <TabelaFetely
          busca={{ valor: busca, aoMudar: (v) => { setBusca(v); setPagina(1); }, placeholder: "Buscar por código ou produto" }}
          filtros={<div className="flex flex-wrap gap-1">{chips.map((c) => (
            <Button key={c.v} size="sm" variant={filtro === c.v ? "default" : "outline"} className="rounded-full"
              onClick={() => { setFiltro(c.v); setPagina(1); }}>{c.r}</Button>
          ))}</div>}
          carregando={q.isLoading}
          erro={q.error ? formatError(q.error) : null}
          aoTentarNovamente={() => q.refetch()}
          vazio={{ mensagem: "Nenhuma posição da XPM ainda." }}
          total={q.data?.length ?? 0}
          exibidos={filtradas.length}
          rotulo="SKUs"
        >
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">XPM</TableHead>
                  <TableHead className="text-right">Sistema</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead className="text-right">Dias divergente</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pag.map((l) => {
                  const st = STATUS.find((s) => s.valor === l.status);
                  return (
                    <TableRow key={l.sku} className="cursor-pointer" onClick={() => setAberto(l)}>
                      <TableCell><CodProduto chave={l.sku} /></TableCell>
                      <TableCell>{l.nome_comercial ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(l.xpm_total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(l.sncf_saldo)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", corSentido(l.sentido))} title={l.sentido ?? undefined}>
                        {comSinal(l.diferenca)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.dias_divergente ?? 0}</TableCell>
                      <TableCell><Selo estado={st?.estado}>{st?.rotulo ?? l.status}</Selo></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <RodapePaginacao total={filtradas.length} pagina={pagina} tamanhoPagina={tamanho}
              onPagina={setPagina} onTamanhoPagina={(n) => { setTamanho(n); setPagina(1); }} />
          </div>
        </TabelaFetely>
      </div>

      <Sheet open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{aberto && <CodProduto chave={aberto.sku} />}</SheetTitle>
            <SheetDescription>{aberto?.nome_comercial ?? ""} · últimos 15 dias</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {serie.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {serie.error && <p className="text-sm text-destructive">{formatError(serie.error)}</p>}
            {serie.data && (serie.data.length === 0
              ? <p className="text-sm text-muted-foreground">Sem histórico para este SKU.</p>
              : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Data</TableHead><TableHead className="text-right">XPM</TableHead>
                    <TableHead className="text-right">Sistema</TableHead><TableHead className="text-right">Diferença</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{serie.data.map((d) => (
                    <TableRow key={d.data_posicao}>
                      <TableCell>{fmtDataHora(d.data_posicao)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(d.xpm_total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(d.sncf_saldo)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums",
                        d.diferenca > 0 ? "text-info-strong" : d.diferenca < 0 ? "text-destructive" : "text-muted-foreground")}>
                        {comSinal(d.diferenca)}
                      </TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              ))}
          </div>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
