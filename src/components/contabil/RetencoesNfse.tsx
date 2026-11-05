import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissaoAcao } from "@/hooks/usePermissaoAcao";
import { rawMessage } from "@/lib/format-error";

type Candidato = { movimentacao_id: string; data_transacao: string; valor: number; descricao: string; contraparte_nome: string | null; conta: string | null; exato: boolean; mesmo_favorecido: boolean };
type Item = {
  nfs_stage_id: string; numero: string | null; emissao: string; prestador: string | null; bruto: number; ir: number; pis: number; cofins: number; csll: number; inss: number;
  liquido: number; observacoes: string[]; grupo?: "emitida" | "paga_no_mes" | "em_aberto"; situacao: "vinculado" | "candidato" | "multiplos" | "nao_localizado";
  pagamento: { movimentacao_id: string; data: string; valor: number; descricao: string } | null; candidatos: Candidato[];
};
type Resposta = { total_nfse: number; lidas: number; com_retencao: number; erros_leitura: { numero: string | null; erro: string }[]; pdf: { com_pdf: number; sem_pdf: number }; itens: Item[]; pagas_no_mes?: Item[]; em_aberto?: Item[] };

async function erroDaEdge(error: unknown): Promise<never> {
  const ctx = (error as { context?: Response }).context;
  const body = ctx ? await ctx.json().catch(() => null) : null;
  throw new Error(body?.erro ?? (error as Error).message);
}

export function useRetencoesNfse(competencia: string | null) {
  return useQuery({
    queryKey: ["contabil-retencoes-nfse", competencia], enabled: !!competencia,
    queryFn: async (): Promise<Resposta> => {
      const { data, error } = await supabase.functions.invoke("gerar-pacote-contador-v2", { body: { retencoes: true, competencia } });
      if (error) await erroDaEdge(error);
      if (!data?.ok) throw new Error(data?.erro ?? "Falha ao ler retenções");
      return data;
    },
  });
}

const brl = (n: number | null | undefined) => n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dBr = (d?: string | null) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—";
const mm = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`;
const rotulo = { vinculado: "Pago (confirmado)", candidato: "Candidato encontrado", multiplos: "Mais de um candidato — escolher", nao_localizado: "Pagamento não localizado" } as const;

export function RetencoesNfse({ competencia }: { competencia: string }) {
  const q = useRetencoesNfse(competencia), qc = useQueryClient();
  const { permitido } = usePermissaoAcao("acao.contabil_nfse_pagamento.confirmar");
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const confirmar = useMutation({
    mutationFn: async ({ item, mov }: { item: Item; mov: string }) => {
      const { error } = await supabase.rpc("fn_contabil_nfse_pagamento_confirmar", { p_nfs_stage_id: item.nfs_stage_id, p_movimentacao_id: mov, p_valor_liquido: item.liquido });
      if (error) throw error;
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["contabil-retencoes-nfse"] }); toast.success("Pagamento confirmado"); },
    onError: (e) => toast.error(rawMessage(e), { duration: Infinity, closeButton: true }),
  });
  const pdfs = useMutation({
    mutationFn: async () => {
      let geradas = 0; const erros: string[] = [];
      for (let volta = 0; volta < 10; volta++) {
        const { data, error } = await supabase.functions.invoke("nf-arquivos-retrofit", { body: { tipo: "nfse_resumo", competencia: competencia.slice(0, 7) } });
        if (error) await erroDaEdge(error);
        if (!data?.ok) throw new Error(data?.erro ?? "Falha ao gerar PDFs");
        geradas += data.geradas; erros.push(...data.erros.map((e: { numero: string; erro: string }) => `NFS-e ${e.numero}: ${e.erro}`));
        if (!data.restantes || !data.geradas) break;
      }
      if (erros.length) throw new Error(`${geradas} PDF(s) gerados; falharam: ${erros.join("; ")}`);
      return geradas;
    },
    onSuccess: async (n) => { await qc.invalidateQueries({ queryKey: ["contabil-retencoes-nfse"] }); toast.success(`${n} PDF(s) de NFS-e gerados`); },
    onError: (e) => toast.error(rawMessage(e), { duration: Infinity, closeButton: true }),
  });

  return (
    <section className="space-y-3" aria-label="Retenções de NFS-e do mês">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Retenções de NFS-e do mês</h2>
        {q.data && <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{q.data.total_nfse} NFS-e · {q.data.pdf.com_pdf} com PDF</span>
          {q.data.pdf.sem_pdf > 0 && <Button size="sm" variant="outline" disabled={pdfs.isPending} onClick={() => pdfs.mutate()}><FileText className="mr-1.5 h-4 w-4" />{pdfs.isPending ? "Gerando…" : `Gerar PDFs das NFS-e (${q.data.pdf.sem_pdf})`}</Button>}
        </div>}
      </div>
      {q.error ? <p className="text-sm text-destructive">{rawMessage(q.error)}</p> : q.isLoading ? <p className="text-sm text-muted-foreground">Lendo NFS-e do mês…</p> : q.data && (
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          {q.data.erros_leitura.some((e) => (e as { grupo?: string }).grupo === "em_aberto") && <p className="mb-2 text-xs text-warning">{q.data.erros_leitura.filter((e) => (e as { grupo?: string }).grupo === "em_aberto").length} NFS-e dos 12 meses anteriores sem XML lido — não foi possível saber se têm retenção em aberto.</p>}
          {q.data.erros_leitura.length > 0 && <div className="mb-3 space-y-1">{q.data.erros_leitura.filter((e) => (e as { grupo?: string }).grupo !== "em_aberto").map((e) => <p key={`${e.numero}-${e.erro}`} className="text-xs text-warning">NFS-e {e.numero ?? "?"}: {e.erro}</p>)}</div>}
          {[
            { titulo: "Emitidas neste mês", itens: q.data.itens, vazio: `Nenhuma NFS-e com retenção em ${q.data.lidas} lidas.` },
            { titulo: "Emitidas antes · pagas neste mês", itens: q.data.pagas_no_mes ?? [], vazio: null },
            { titulo: "Em aberto de meses anteriores (entram no mês do pagamento)", itens: q.data.em_aberto ?? [], vazio: null },
          ].filter((g) => g.itens.length || g.vazio).map((g) => (
            <div key={g.titulo} className="mb-4 last:mb-0">
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">{g.titulo}</h3>
              {!g.itens.length ? <p className="text-sm text-muted-foreground">{g.vazio}</p> : (
            <div className="overflow-x-auto rounded-md border bg-background">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground"><tr>
                  {["NFS-e", "Prestador", "Emissão", "Bruto", "IR", "PIS", "COFINS", "CSLL", "INSS", "Líquido", "Pagamento"].map((h) => <th key={h} className={`px-2 py-1.5 font-normal ${["NFS-e", "Prestador", "Emissão", "Pagamento"].includes(h) ? "text-left" : "text-right"}`}>{h}</th>)}
                </tr></thead>
                <tbody>{g.itens.map((i) => {
                  const opcoes = i.situacao === "candidato" ? [] : i.candidatos;
                  const sel = escolha[i.nfs_stage_id];
                  return (
                    <tr key={i.nfs_stage_id} className="border-t align-top">
                      <td className="px-2 py-2">{i.numero}
                        {i.grupo === "paga_no_mes" && <div className="mt-1"><Selo estado="info">Emitida em {mm(i.emissao)} · paga neste mês</Selo></div>}
                        {i.grupo === "em_aberto" && <div className="mt-1"><Selo estado="warning">Em aberto desde {mm(i.emissao)}</Selo></div>}
                      </td>
                      <td className="px-2 py-2 max-w-[180px]">{i.prestador}{i.observacoes.map((o) => <p key={o} className="mt-1 text-[11px] text-muted-foreground">{o}</p>)}</td>
                      <td className="px-2 py-2">{dBr(i.emissao)}</td>
                      {[i.bruto, i.ir, i.pis, i.cofins, i.csll, i.inss, i.liquido].map((v, k) => <td key={k} className="px-2 py-2 text-right tabular-nums">{brl(v)}</td>)}
                      <td className="px-2 py-2 min-w-[260px]">
                        <Selo estado={i.situacao === "vinculado" ? "success" : i.situacao === "candidato" ? "info" : "warning"}>{rotulo[i.situacao]}</Selo>
                        {i.pagamento && <p className="mt-1">{dBr(i.pagamento.data)} · {brl(i.pagamento.valor)}<br /><span className="text-muted-foreground">{i.pagamento.descricao}</span></p>}
                        {i.situacao === "candidato" && i.pagamento && <Button size="sm" className="mt-2" disabled={!permitido || confirmar.isPending} onClick={() => confirmar.mutate({ item: i, mov: i.pagamento!.movimentacao_id })}><CheckCircle2 className="mr-1.5 h-4 w-4" />Confirmar pagamento</Button>}
                        {i.situacao !== "candidato" && opcoes.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Select value={sel} onValueChange={(v) => setEscolha((s) => ({ ...s, [i.nfs_stage_id]: v }))}>
                              <SelectTrigger className="h-8 w-[240px] text-xs" aria-label={`Escolher pagamento da NFS-e ${i.numero}`}><SelectValue placeholder={i.situacao === "vinculado" ? "Trocar pagamento…" : "Escolher movimentação…"} /></SelectTrigger>
                              <SelectContent>{opcoes.map((c) => <SelectItem key={c.movimentacao_id} value={c.movimentacao_id} className="text-xs">{dBr(c.data_transacao)} · {brl(c.valor)}{c.exato ? " · valor exato" : ""} · {c.descricao.slice(0, 40)}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button size="sm" variant="outline" disabled={!sel || !permitido || confirmar.isPending} onClick={() => sel && confirmar.mutate({ item: i, mov: sel })}>Confirmar pagamento</Button>
                          </div>
                        )}
                        {i.situacao === "nao_localizado" && !opcoes.length && <p className="mt-1 text-muted-foreground">Nenhum débito próximo de {brl(i.liquido)} desde 5 dias antes da emissão até hoje.</p>}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
