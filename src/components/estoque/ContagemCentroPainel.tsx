import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { FiltroColecao } from "@/components/acervo/BlingCardPainel";
import { formatError } from "@/lib/format-error";
import { hojeISO, fmtData } from "@/lib/data";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Linha {
  cod_cadastro: string | null;
  sku: string;
  nome_comercial: string | null;
  cor_nome: string | null;
  colecao: string | null;
  contabil: number | null;
  fisico: number | null;
}
interface Divergencia { sku: string; contabil: number; contado: number; diferenca: number }
interface Resultado { ok?: boolean; itens?: number; divergencias?: Divergencia[]; erro?: string }

const CENTRO_XPM = "XPM-SC";

export function ContagemCentroPainel() {
  const qc = useQueryClient();
  const [centro, setCentro] = useState("SITE-SP");
  const [data, setData] = useState(hojeISO());
  const [busca, setBusca] = useState("");
  const [colecoes, setColecoes] = useState<string[]>([]);
  const [contados, setContados] = useState<Record<string, string>>({});
  const [confirmar, setConfirmar] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const centrosQ = useQuery({
    queryKey: ["contagem-centros"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("centro_distribuicao").select("codigo,nome,rotulo_curto").eq("ativo", true).neq("codigo", CENTRO_XPM).order("codigo");
      if (error) throw error;
      return (data ?? []) as { codigo: string; nome: string | null; rotulo_curto: string | null }[];
    },
  });

  const linhasQ = useQuery({
    queryKey: ["vw_estoque_cockpit", "contagem", centro],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_estoque_cockpit")
        .select("cod_cadastro,sku,nome_comercial,cor_nome,colecao,contabil,fisico")
        .eq("centro", centro)
        .limit(5000);
      if (error) throw error;
      return ((data ?? []) as Linha[]).filter((l) => (l.contabil ?? 0) !== 0 || l.fisico != null);
    },
  });

  const linhas = linhasQ.data ?? [];
  const colecoesLista = useMemo(() => {
    const m = new Map<string, number>();
    linhas.forEach((l) => { if (l.colecao) m.set(l.colecao, (m.get(l.colecao) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [linhas]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return linhas
      .filter((l) => colecoes.length === 0 || (l.colecao != null && colecoes.includes(l.colecao)))
      .filter((l) => !t || [l.cod_cadastro, l.sku, l.nome_comercial].some((v) => (v ?? "").toLowerCase().includes(t)))
      .sort((a, b) => (a.cod_cadastro ?? a.sku).localeCompare(b.cod_cadastro ?? b.sku));
  }, [linhas, busca, colecoes]);

  const preenchidos = Object.entries(contados).filter(([, v]) => v !== "" && Number(v) >= 0 && !isNaN(Number(v)));
  const n = preenchidos.length;

  const registrar = useMutation({
    mutationFn: async () => {
      const itens = preenchidos.map(([sku, v]) => ({ sku, qtd: Number(v), condicao: "sadio" }));
      const { data: r, error } = await (supabase as any).rpc("fn_registrar_contagem", {
        p_centro_codigo: centro, p_data: data, p_itens: itens,
      });
      if (error) throw error;
      const res = (r ?? {}) as Resultado;
      if (res.ok === false) throw new Error(res.erro ?? "A contagem não foi registrada.");
      return res;
    },
    onSuccess: async (res) => {
      setResultado(res);
      setContados({});
      toast.success(`${res.itens ?? n} contagens registradas`);
      await qc.invalidateQueries({ queryKey: ["vw_estoque_cockpit"] });
      await qc.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes("estoque") });
      await linhasQ.refetch();
    },
    onError: (e) => toast.error(`Falha ao registrar contagem: ${formatError(e)}`),
  });

  const numeroInvalido = (v: string) => v !== "" && (isNaN(Number(v)) || Number(v) < 0);
  const centroRotulo = centrosQ.data?.find((c) => c.codigo === centro)?.rotulo_curto ?? centro;

  return (
    <section className="space-y-4 rounded-md border bg-card p-4">
      <div>
        <h2 className="text-base font-medium">Contagem física</h2>
        <p className="text-sm text-muted-foreground">
          Registre o que foi contado na prateleira. A contagem não altera o saldo contábil — a diferença aparece como divergência para decisão.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={centro} onValueChange={(v) => { setCentro(v); setContados({}); setResultado(null); }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Centro" /></SelectTrigger>
          <SelectContent>
            {(centrosQ.data ?? []).map((c) => (
              <SelectItem key={c.codigo} value={c.codigo}>{c.rotulo_curto ?? c.nome ?? c.codigo}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value > hojeISO() ? hojeISO() : e.target.value)} className="w-[160px]" aria-label="Data da contagem" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código, SKU ou nome" className="w-[280px]" />
        <FiltroColecao colecoes={colecoesLista} selecionadas={colecoes} onChange={setColecoes} />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground tabular-nums">{n} itens contados</span>
          <BotaoGuardado slug="acao.estoque_contagem_registrar" rotuloAcao="Registrar contagem" disabled={n === 0 || registrar.isPending || preenchidos.some(([, v]) => numeroInvalido(v)) || !data} onClick={() => setConfirmar(true)}>
            Registrar contagem ({n})
          </BotaoGuardado>
        </div>
      </div>

      {centrosQ.isError && <p className="text-sm text-destructive">Falha ao carregar centros: {formatError(centrosQ.error)}</p>}
      {linhasQ.isError && <p className="text-sm text-destructive">Falha ao carregar produtos: {formatError(linhasQ.error)}</p>}

      {resultado && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">
            {resultado.itens ?? 0} contagens registradas · {(resultado.divergencias ?? []).length} com diferença
          </p>
          {(resultado.divergencias ?? []).length > 0 && (
            <Table className="text-[12px]">
              <TableHeader><TableRow>
                <TableHead>Cód.</TableHead><TableHead className="text-right">Contábil</TableHead>
                <TableHead className="text-right">Contado</TableHead><TableHead className="text-right">Diferença</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(resultado.divergencias ?? []).map((d) => (
                  <TableRow key={d.sku}>
                    <TableCell className="font-mono">{d.sku}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.contabil}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.contado}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">{d.diferenca > 0 ? `+${d.diferenca}` : d.diferenca}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {linhasQ.isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Nenhum produto neste recorte</div>
      ) : (
        <div className="rounded-md border">
          <Table className="text-[12px]" containerClassName="max-h-[min(60vh,44rem)]">
            <TableHeader><TableRow>
              <TableHead className="w-[90px]">Cód.</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="w-[90px] text-right">Contábil</TableHead>
              <TableHead className="w-[130px] text-right">Última contagem</TableHead>
              <TableHead className="w-[120px] text-right">Contado</TableHead>
              <TableHead className="w-[100px] text-right">Diferença</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {visiveis.map((l) => {
                const v = contados[l.sku] ?? "";
                const dif = v !== "" && !numeroInvalido(v) ? Number(v) - (l.contabil ?? 0) : null;
                return (
                  <TableRow key={l.sku}>
                    <TableCell className="font-mono">{l.cod_cadastro ?? l.sku}</TableCell>
                    <TableCell>
                      <div className="truncate">{l.nome_comercial ?? "—"}</div>
                      {l.cor_nome && <div className="text-[11px] text-muted-foreground">{l.cor_nome}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.contabil ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.fisico ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number" min={0} step={1} inputMode="numeric" value={v}
                        aria-invalid={numeroInvalido(v)}
                        onChange={(e) => setContados((c) => ({ ...c, [l.sku]: e.target.value }))}
                        className={cn("ml-auto h-8 w-24 text-right tabular-nums", numeroInvalido(v) && "border-destructive")}
                      />
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", dif === 0 && "text-success", dif != null && dif !== 0 && "text-destructive")}>
                      {dif == null ? "" : dif > 0 ? `+${dif}` : dif}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar contagem</AlertDialogTitle>
            <AlertDialogDescription>Registrar {n} contagens no {centroRotulo} em {fmtData(data)}?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => registrar.mutate()}>Registrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export default ContagemCentroPainel;
