import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, PackageCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatError } from "@/lib/format-error";
import { fmtDataHora } from "@/lib/data";
import { cn } from "@/lib/utils";
import { BlocoFiscalDevolucao } from "./FiscalDevolucao";
import { ordenarCorrecoes, prazoCancelamento, textoReenvio } from "./correcaoNf";

const sb = supabase as any;
export const QK_CORRECOES = ["vw_devolucao_funil", "correcoes-nf"];
const ddMMHHmm = (v: string) => new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Linha = {
  id: string; numero: string | null; status: string | null; fiscal_acao: string | null; pedido_ref: string | null;
  nf_numero: string | null; nf_cancelada: boolean; prazo: string | null; reenvio_status: string | null; reenvio_erro: string | null;
  nf_nova: string | null; chamado_id: string | null; criado_em: string | null;
};

async function emBlocos<T>(tabela: string, cols: string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from(tabela).select(cols).in("id", ids.slice(i, i + 200));
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

export function useCorrecoesNf() {
  return useQuery({
    queryKey: QK_CORRECOES,
    queryFn: async (): Promise<Linha[]> => {
      const { data, error } = await sb.from("devolucao")
        .select("id,numero,status,fiscal_acao,nf_original_id,pedido_id,reenvio_status,reenvio_erro,nf_substituta_id,chamado_id,criado_em")
        .eq("finalidade", "refaturar");
      if (error) throw error;
      const ds = (data ?? []) as any[];
      const nfIds = [...new Set(ds.flatMap((d) => [d.nf_original_id, d.nf_substituta_id]).filter(Boolean))] as string[];
      const pedIds = [...new Set(ds.map((d) => d.pedido_id).filter(Boolean))] as string[];
      const [nfs, peds] = await Promise.all([
        emBlocos<any>("nfs_emitidas", "id,numero,situacao,emitida_em,autorizada_em,data_emissao", nfIds),
        emBlocos<any>("pedidos", "id,id_externo", pedIds),
      ]);
      const nfMap = new Map(nfs.map((n) => [n.id, n]));
      const pedMap = new Map(peds.map((p) => [p.id, p.id_externo as string | null]));
      return ds.map((d) => {
        const nf = d.nf_original_id ? nfMap.get(d.nf_original_id) ?? null : null;
        const sub = d.nf_substituta_id ? nfMap.get(d.nf_substituta_id) : null;
        return {
          id: d.id, numero: d.numero ?? null, status: d.status ?? null, fiscal_acao: d.fiscal_acao ?? null,
          pedido_ref: d.pedido_id ? pedMap.get(d.pedido_id) ?? null : null,
          nf_numero: nf?.numero != null ? String(nf.numero) : null, nf_cancelada: nf?.situacao === "cancelada",
          prazo: prazoCancelamento(d.fiscal_acao, nf), reenvio_status: d.reenvio_status ?? null, reenvio_erro: d.reenvio_erro ?? null,
          nf_nova: sub?.numero != null ? String(sub.numero) : null, chamado_id: d.chamado_id ?? null, criado_em: d.criado_em ?? null,
        };
      });
    },
  });
}

type Props = {
  ehFinal: (status: string | null) => boolean;
  nfResolvida: (id: string) => boolean;
  filtro: "abertas" | "concluidas";
  setFiltro: (v: "abertas" | "concluidas") => void;
  onMudou: () => Promise<void> | void;
};

export function CorrecoesNfLista({ ehFinal, nfResolvida, filtro, setFiltro, onMudou }: Props) {
  const q = useCorrecoesNf();
  const [expandido, setExpandido] = useState<string | null>(null);
  const linhas = useMemo(() => {
    const todas = (q.data ?? []).map((l) => ({ ...l, aberta: !ehFinal(l.status) }));
    return ordenarCorrecoes(todas.filter((l) => (filtro === "abertas" ? l.aberta : !l.aberta)));
  }, [q.data, ehFinal, filtro]);

  const caminho = (l: Linha) => {
    if (l.fiscal_acao === "cancelar_nf") {
      if (l.nf_cancelada || nfResolvida(l.id)) return "NF original cancelada";
      return `Cancelar no Bling até ${l.prazo ? ddMMHHmm(l.prazo) : "—"}`;
    }
    if (l.fiscal_acao === "nf_devolucao" || l.fiscal_acao === "nota_credito") return "NF de entrada";
    return "—";
  };
  const vencido = (l: Linha & { aberta: boolean }) =>
    l.aberta && l.fiscal_acao === "cancelar_nf" && !l.nf_cancelada && !nfResolvida(l.id) && !!l.prazo && Date.now() > new Date(l.prazo).getTime();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <ToggleGroup type="single" size="sm" variant="outline" value={filtro} onValueChange={(v) => v && setFiltro(v as typeof filtro)}>
          <ToggleGroupItem value="abertas">Abertas</ToggleGroupItem>
          <ToggleGroupItem value="concluidas">Concluídas</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {q.isError && <Alert variant="destructive" className="mb-4"><AlertDescription>{formatError(q.error)}</AlertDescription></Alert>}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-[150px]">Correção</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>NF original</TableHead>
              <TableHead>Caminho fiscal</TableHead>
              <TableHead>Reenvio</TableHead>
              <TableHead>Chamado</TableHead>
              <TableHead className="w-[130px] whitespace-nowrap">Aberta em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : linhas.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground"><PackageCheck className="h-5 w-5 mx-auto mb-2 opacity-60" />Nenhuma correção encontrada.</TableCell></TableRow>
            ) : linhas.map((l) => {
              const aberto = expandido === l.id;
              const st = textoReenvio(l.reenvio_status, l.nf_nova, l.reenvio_erro);
              return (
                <Fragment key={l.id}>
                  <TableRow data-foco-id={l.id} className="cursor-pointer" onClick={() => setExpandido(aberto ? null : l.id)}>
                    <TableCell>{aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="font-medium">{l.numero ?? "—"}</TableCell>
                    <TableCell className="text-sm">{l.pedido_ref ?? "—"}</TableCell>
                    <TableCell className="text-sm tabular-nums">{l.nf_numero ? `nº ${l.nf_numero}` : "—"}</TableCell>
                    <TableCell className={cn("text-sm", vencido(l) && "text-destructive")}>{caminho(l)}{vencido(l) && " · vencido"}</TableCell>
                    <TableCell className={cn("text-sm", l.reenvio_status === "erro" ? "text-destructive" : l.reenvio_status === "concluido" ? "text-success" : "")}>
                      <span className="line-clamp-2">{st ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
                      {l.chamado_id ? <Link to={`/chamados/${l.chamado_id}`} className="text-primary underline-offset-2 hover:underline">Ver chamado</Link> : "—"}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums whitespace-nowrap">{l.criado_em ? fmtDataHora(l.criado_em) : "—"}</TableCell>
                  </TableRow>
                  {aberto && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell />
                      <TableCell colSpan={7} className="py-4">
                        <BlocoFiscalDevolucao devolucaoId={l.id} nfResolvida={nfResolvida(l.id)} onMudou={async () => { await q.refetch(); await onMudou(); }} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {!q.isLoading && <div className="mt-2 text-xs text-muted-foreground">{linhas.length} {filtro === "abertas" ? "aberta(s)" : "concluída(s)"}</div>}
    </div>
  );
}

export function contarCorrecoesAbertas(linhas: { status: string | null }[] | undefined, ehFinal: (s: string | null) => boolean) {
  return (linhas ?? []).filter((l) => !ehFinal(l.status)).length;
}
