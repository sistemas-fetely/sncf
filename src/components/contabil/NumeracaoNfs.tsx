/**
 * Canceladas, inutilizadas e buracos de numeração das NFs do mês (fn_contabil_nf_numeracao).
 * A API do Bling não expõe inutilizações: quem inutiliza no Bling registra aqui a faixa e o protocolo.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Selo } from "@/components/ui/selo";
import { usePermissaoAcao } from "@/hooks/usePermissaoAcao";
import { rawMessage } from "@/lib/format-error";
import { resumirNumeracao, type LinhaNumeracao } from "@/lib/contabil/numeracaoNf";

const cnpjFmt = (c: string | null) => c && c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : "não identificado";
const dataBr = (d: string | null) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—";
const ROTULO: Record<string, string> = { cancelada: "Cancelada", inutilizada: "Inutilizada", nao_autorizada: "Não autorizada", buraco: "Não identificada", entrada_propria: "NF de entrada própria" };

export function useNumeracaoNfs(competencia: string | null) {
  return useQuery({
    queryKey: ["contabil-nf-numeracao", competencia],
    enabled: !!competencia,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_contabil_nf_numeracao", { p_competencia: competencia });
      if (error) throw error;
      return (data ?? []) as LinhaNumeracao[];
    },
  });
}

export function NumeracaoNfs({ competencia }: { competencia: string }) {
  const qc = useQueryClient();
  const q = useNumeracaoNfs(competencia);
  const { permitido } = usePermissaoAcao("acao.nf_inutilizacao.registrar");
  const [form, setForm] = useState<{ cnpj: string; serie: string; ini: string; fim: string; data: string; protocolo: string; just: string } | null>(null);
  const registrar = useMutation({
    mutationFn: async () => {
      const f = form!;
      const { error } = await (supabase as any).rpc("fn_nf_inutilizacao_registrar", {
        p_emitente_cnpj: f.cnpj, p_serie: f.serie, p_inicial: Number(f.ini), p_final: Number(f.fim || f.ini),
        p_data: f.data, p_protocolo: f.protocolo, p_justificativa: f.just,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Inutilização registrada"); setForm(null); qc.invalidateQueries({ queryKey: ["contabil-nf-numeracao"] }); },
    onError: (e) => toast.error(rawMessage(e), { duration: Infinity, closeButton: true }),
  });

  const linhas = q.data ?? [];
  const r = resumirNumeracao(linhas);
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm" aria-label="Canceladas e inutilizadas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">Canceladas e inutilizadas</h2>
          <p className="text-xs text-muted-foreground">Canceladas {r.canceladas} · inutilizadas {r.inutilizadas} · não identificadas {r.buracos}{r.naoAutorizadas ? ` · não autorizadas ${r.naoAutorizadas}` : ""}</p>
        </div>
        {r.pendentesNoPrazo > 0 && <Selo estado="destructive">{r.pendentesNoPrazo} número(s) a inutilizar até {dataBr(r.prazo)}</Selo>}
      </div>
      {q.error ? <p className="text-sm text-destructive">{rawMessage(q.error)}</p> : q.isLoading ? <p className="text-sm text-muted-foreground">Verificando numeração…</p> : linhas.length === 0 ? <p className="text-sm text-muted-foreground">Sem canceladas nem buracos de numeração no mês.</p> : (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground"><th className="py-1 text-left font-normal">Emitente</th><th className="text-left font-normal">Série</th><th className="text-right font-normal">Número</th><th className="pl-3 text-left font-normal">Ocorrência</th><th className="text-left font-normal">Data</th><th /></tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={`${l.emitente_cnpj}-${l.serie}-${l.numero}-${l.ocorrencia}`} className="border-t">
                  <td className="py-1.5 tabular-nums">{cnpjFmt(l.emitente_cnpj)}</td>
                  <td>{l.serie}</td>
                  <td className="text-right tabular-nums">{l.numero}</td>
                  <td className="pl-3"><Selo estado={l.ocorrencia === "buraco" || l.ocorrencia === "nao_autorizada" ? "warning" : "muted"}>{ROTULO[l.ocorrencia] ?? l.ocorrencia}</Selo>
                    {l.ocorrencia !== "cancelada" && <span className="ml-2 text-xs text-muted-foreground">{l.detalhe}</span>}</td>
                  <td className="tabular-nums">{dataBr(l.data_emissao)}</td>
                  <td className="text-right">{(l.ocorrencia === "buraco" || l.ocorrencia === "nao_autorizada") && permitido && l.emitente_cnpj && (
                    <Button size="sm" variant="ghost" onClick={() => setForm({ cnpj: l.emitente_cnpj!, serie: l.serie, ini: String(l.numero), fim: String(l.numero), data: new Date().toISOString().slice(0, 10), protocolo: "", just: "" })}>Registrar inutilização</Button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Faça a inutilização no Bling (Notas fiscais de saída → Mais ações → Inutilizar numeração) e registre aqui o protocolo.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input aria-label="Número inicial" value={form.ini} onChange={(e) => setForm({ ...form, ini: e.target.value })} placeholder="Número inicial" />
            <Input aria-label="Número final" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} placeholder="Número final" />
            <Input aria-label="Data da inutilização" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            <Input aria-label="Protocolo" value={form.protocolo} onChange={(e) => setForm({ ...form, protocolo: e.target.value })} placeholder="Protocolo SEFAZ" />
            <Input aria-label="Justificativa" className="sm:col-span-2" value={form.just} onChange={(e) => setForm({ ...form, just: e.target.value })} placeholder="Justificativa (mín. 15 caracteres)" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={registrar.isPending || form.just.trim().length < 15} onClick={() => registrar.mutate()}>Registrar</Button>
            <Button size="sm" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
          </div>
        </div>
      )}
    </section>
  );
}
