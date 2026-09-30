/**
 * Modelo venda_fora: fechamento mensal do ciclo. O saldo que ficou no centro
 * do parceiro no último dia do mês é baixado como vendido via
 * `fn_consignado_venda_fora_fechar_ciclo` (prévia dry_run → confirmação).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { formatError } from "@/lib/format-error";
import { fmtData, fmtDataHora, hojeISO } from "@/lib/data";

type Previa = {
  ok?: boolean; erro?: string; gravado?: boolean; ciclo_id?: string; competencia?: string; corte?: string; centro?: string;
  itens?: number; unidades?: number; retornos_na_competencia?: number; aviso?: string | null;
  previa?: { sku: string; qtd: number; nome: string | null }[];
};
type Ciclo = { competencia: string; data_corte: string | null; itens: number | null; unidades: number | null; documento: string | null; obs: string | null; fechado_em: string | null };
const TH = "sticky top-0 bg-background z-10";

function mesMMAAAA(iso: string) { const [a, m] = iso.split("-"); return `${m}/${a}`; }

export function FecharCicloVendaForaPainel({ parceiroId, vigenciaInicio }: { parceiroId: string; vigenciaInicio?: string | null }) {
  const sb = supabase as any;
  const hoje = hojeISO();
  const mesAtual = `${hoje.slice(0, 7)}-01`;
  const meses = useMemo(() => {
    const ini = vigenciaInicio ? `${vigenciaInicio.slice(0, 7)}-01` : mesAtual;
    const out: string[] = [];
    let [a, m] = ini.split("-").map(Number);
    for (let i = 0; i < 240; i++) {
      const s = `${a}-${String(m).padStart(2, "0")}-01`;
      if (s > mesAtual) break;
      out.push(s);
      m++; if (m > 12) { m = 1; a++; }
    }
    if (!out.length) out.push(mesAtual);
    return out.reverse();
  }, [vigenciaInicio, mesAtual]);

  const [competencia, setCompetencia] = useState(mesAtual);
  const [documento, setDocumento] = useState("");
  const [obs, setObs] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [aberto, setAberto] = useState(false);
  const [rodando, setRodando] = useState<"previa" | "gravar" | null>(null);

  const ciclosQ = useQuery({
    queryKey: ["consignado-ciclo", parceiroId],
    queryFn: async () => {
      const { data, error } = await sb.from("consignado_ciclo").select("competencia, data_corte, itens, unidades, documento, obs, fechado_em")
        .eq("parceiro_id", parceiroId).order("competencia", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Ciclo[];
    },
  });

  function mudou() { setPrevia(null); }

  async function chamar(dry: boolean) {
    if (!dry && !documento.trim()) { toast.error("Informe o documento."); return; }
    setRodando(dry ? "previa" : "gravar");
    try {
      const { data, error } = await sb.rpc("fn_consignado_venda_fora_fechar_ciclo", {
        p_parceiro_id: parceiroId, p_competencia: competencia, p_documento: documento.trim() || null, p_obs: obs.trim() || null, p_dry_run: dry,
      });
      if (error) throw error;
      const r = (data ?? {}) as Previa;
      if (r.ok === false) throw new Error(r.erro ?? "O banco recusou o fechamento.");
      if (dry) { setPrevia(r); setAberto(true); return; }
      if (!r.gravado) throw new Error(r.erro ?? "O ciclo não foi gravado.");
      toast.success(`Ciclo ${mesMMAAAA(competencia)} fechado: ${r.itens ?? 0} itens · ${r.unidades ?? 0} unidades vendidas`);
      setAberto(false); setPrevia(null); setDocumento(""); setObs("");
      await ciclosQ.refetch();
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setRodando(null);
    }
  }

  const podeConfirmar = !!previa && previa.ok !== false && !!documento.trim();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fechar ciclo do mês</CardTitle>
          <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1">
            <li>Emita no Bling o retorno (1904) do que não vendeu e lance em Remessas e extrato.</li>
            <li>Feche o ciclo: o que ficou no parceiro no último dia do mês é baixado como vendido.</li>
            <li>Emita a nova remessa (5904) e vincule em Remessas e extrato.</li>
          </ol>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Competência</Label>
              <Select value={competencia} onValueChange={v => { setCompetencia(v); mudou(); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{meses.map(m => <SelectItem key={m} value={m}>{mesMMAAAA(m)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Documento *</Label>
              <Input value={documento} placeholder="Relatório Sublimity 09/2026" onChange={e => { setDocumento(e.target.value); mudou(); }} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Observação</Label>
            <Textarea rows={2} value={obs} onChange={e => { setObs(e.target.value); mudou(); }} />
          </div>
          <Button variant="outline" onClick={() => chamar(true)} disabled={!!rodando}>
            {rodando === "previa" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ver prévia
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Ciclos fechados</CardTitle></CardHeader>
        <CardContent className="p-0">
          {ciclosQ.isError ? <Alert variant="destructive" className="m-4 w-auto"><AlertDescription>{formatError(ciclosQ.error)}</AlertDescription></Alert> :
            ciclosQ.isLoading ? <div className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> :
            (ciclosQ.data ?? []).length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nenhum ciclo fechado.</p> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Competência</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead>Documento</TableHead><TableHead>Fechado em</TableHead>
                </TableRow></TableHeader>
                <TableBody>{ciclosQ.data!.map(c => (
                  <TableRow key={c.competencia}>
                    <TableCell>{mesMMAAAA(c.competencia)}</TableCell>
                    <TableCell className="text-right">{c.unidades ?? 0}</TableCell>
                    <TableCell>{c.documento ?? "—"}</TableCell>
                    <TableCell>{fmtDataHora(c.fechado_em)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={o => { if (!o && !rodando) setAberto(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] !flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Fechar ciclo {mesMMAAAA(competencia)}</DialogTitle>
            <DialogDescription>Documento: {documento.trim() || "— (obrigatório para fechar)"}</DialogDescription>
          </DialogHeader>
          {previa && (
            <div className="shrink-0 space-y-3">
              <p className="text-sm font-medium">
                Corte em {fmtData(previa.corte)} · {previa.centro ?? "—"} · {previa.itens ?? 0} itens · {previa.unidades ?? 0} unidades vendidas · {previa.retornos_na_competencia ?? 0} retorno(s) lançado(s)
              </p>
              {previa.aviso && (
                <Alert className="border-warning/50 bg-warning/10"><AlertDescription>{previa.aviso}</AlertDescription></Alert>
              )}
              {!documento.trim() && <p className="text-sm text-destructive">Informe o documento no formulário para fechar o ciclo.</p>}
            </div>
          )}
          {previa && (previa.previa ?? []).length > 0 && (
            <div className="flex-1 min-h-0 overflow-y-auto border-t pt-3">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className={TH}>SKU</TableHead><TableHead className={TH}>Produto</TableHead><TableHead className={`${TH} text-right`}>Qtd vendida</TableHead>
                </TableRow></TableHeader>
                <TableBody>{previa.previa!.map((l, i) => (
                  <TableRow key={i}><TableCell className="font-mono">{l.sku}</TableCell><TableCell>{l.nome ?? "—"}</TableCell><TableCell className="text-right">{l.qtd}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </div>
          )}
          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setAberto(false)} disabled={!!rodando}>Cancelar</Button>
            <BotaoGuardado slug="acao.consignado_ciclo_fechar" rotuloAcao="Fechar ciclo de consignado venda fora" onClick={() => chamar(false)} disabled={!podeConfirmar || !!rodando}>
              {rodando === "gravar" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Fechar ciclo
            </BotaoGuardado>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FecharCicloVendaForaPainel;
