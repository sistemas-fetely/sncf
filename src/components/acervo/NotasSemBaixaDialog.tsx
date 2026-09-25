import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileWarning, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatError } from "@/lib/format-error";
import { fmtData } from "@/lib/data";

type NotaPendente = {
  nf_chave: string;
  nf_numero: string | null;
  nf_data: string | null;
  cnpj_emitente: string | null;
  centro_sugerido: string | null;
  itens: number | null;
  unidades: number | null;
  cfops: string | string[] | null;
  destinatario: string | null;
};
type Centro = { codigo: string; nome: string | null };
type DetalhePrevia = {
  sku: string; qtd: number; cfop: string | null; motivo_saida: string | null; motivo_entrada: string | null;
  saldo_saida_antes: number | null; saldo_saida_depois: number | null;
};
type Previa = { itens: number; detalhe: DetalhePrevia[] };

export const CHAVE_NOTAS_SEM_BAIXA = ["baixa-pendente-nf"];
const NENHUM = "__nenhum__";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function useNotasSemBaixa() {
  return useQuery({
    queryKey: CHAVE_NOTAS_SEM_BAIXA,
    queryFn: async () => {
      const { data, error } = await sb.from("vw_baixa_pendente_nf").select("*").order("nf_data");
      if (error) throw error;
      return (data ?? []) as NotaPendente[];
    },
  });
}

const fmtCfops = (c: NotaPendente["cfops"]) => (Array.isArray(c) ? c.join(", ") : c ?? "—");

export function NotasSemBaixaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const notas = useNotasSemBaixa();
  const [nota, setNota] = useState<NotaPendente | null>(null);

  return <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setNota(null); }}>
    <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
      {nota ? <FormResolver nota={nota} onVoltar={() => setNota(null)} onConcluido={() => { setNota(null); onOpenChange(false); }} /> : <>
        <DialogHeader>
          <DialogTitle>Notas sem baixa</DialogTitle>
          <DialogDescription>Notas fiscais com baixa de estoque pendente. Resolva cada nota lançando o movimento ou dispensando.</DialogDescription>
        </DialogHeader>
        {notas.error && <p className="text-sm text-destructive">Não foi possível carregar as notas: {formatError(notas.error)}</p>}
        {notas.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> :
          !notas.error && <Table>
            <TableHeader><TableRow>
              <TableHead>NF</TableHead><TableHead>Data</TableHead><TableHead>CFOP</TableHead><TableHead>Destinatário</TableHead>
              <TableHead className="text-right">Itens</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead>Centro sugerido</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {(notas.data ?? []).map(n => <TableRow key={n.nf_chave}>
                <TableCell className="font-medium">{n.nf_numero ?? "—"}</TableCell>
                <TableCell>{n.nf_data ? fmtData(n.nf_data) : "—"}</TableCell>
                <TableCell>{fmtCfops(n.cfops)}</TableCell>
                <TableCell className="max-w-56 truncate">{n.destinatario ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{n.itens ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">{n.unidades ?? 0}</TableCell>
                <TableCell>{n.centro_sugerido ?? "—"}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => setNota(n)}>Resolver</Button></TableCell>
              </TableRow>)}
              {!notas.data?.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhuma nota pendente.</TableCell></TableRow>}
            </TableBody>
          </Table>}
      </>}
    </DialogContent>
  </Dialog>;
}

function FormResolver({ nota, onVoltar, onConcluido }: { nota: NotaPendente; onVoltar: () => void; onConcluido: () => void }) {
  const qc = useQueryClient();
  const centros = useQuery({
    queryKey: ["centro-distribuicao-ativos"],
    queryFn: async () => {
      const { data, error } = await sb.from("centro_distribuicao").select("codigo, nome").eq("ativo", true).order("codigo");
      if (error) throw error;
      return (data ?? []) as Centro[];
    },
  });
  const [modo, setModo] = useState<"lancar" | "dispensar">("lancar");
  const [saida, setSaida] = useState(nota.centro_sugerido ?? "");
  const [entrada, setEntrada] = useState(NENHUM);
  const [motivo, setMotivo] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [paramsPrevia, setParamsPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState<"previa" | "confirmar" | null>(null);

  const params = useMemo(() => ({
    p_nf_chave: nota.nf_chave,
    p_modo: modo,
    p_centro_saida: modo === "lancar" ? saida || null : null,
    p_centro_entrada: modo === "lancar" && entrada !== NENHUM ? entrada : null,
    p_motivo: motivo.trim(),
  }), [nota.nf_chave, modo, saida, entrada, motivo]);
  const chave = JSON.stringify(params);
  const validacao = !params.p_motivo ? "Informe o motivo." : modo === "lancar" && !saida ? "Escolha o centro de saída." : null;
  const podeConfirmar = !!previa && paramsPrevia === chave && !erro && !validacao;

  async function chamar(dry: boolean) {
    setErro(null);
    setCarregando(dry ? "previa" : "confirmar");
    try {
      const { data, error } = await sb.rpc("fn_estoque_resolver_baixa_pendente", { ...params, p_dry_run: dry });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.erro ?? data.mensagem ?? "A operação foi recusada pelo banco.");
      if (dry) {
        setPrevia({ itens: Number(data?.itens ?? 0), detalhe: (data?.detalhe ?? []) as DetalhePrevia[] });
        setParamsPrevia(chave);
      } else {
        if (!data?.ok) throw new Error("O banco não confirmou a gravação.");
        toast.success(`Baixa da NF ${nota.nf_numero ?? ""} resolvida.`);
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["conciliacao-estoque-fila"] }),
          qc.invalidateQueries({ queryKey: CHAVE_NOTAS_SEM_BAIXA }),
        ]);
        onConcluido();
      }
    } catch (e) {
      const msg = formatError(e);
      setErro(msg);
      if (dry) { setPrevia(null); setParamsPrevia(null); }
      else toast.error(msg);
    } finally {
      setCarregando(null);
    }
  }

  return <>
    <DialogHeader>
      <DialogTitle>Resolver NF {nota.nf_numero ?? "—"}</DialogTitle>
      <DialogDescription>{nota.destinatario ?? "—"} · {nota.itens ?? 0} itens · {nota.unidades ?? 0} unidades · CFOP {fmtCfops(nota.cfops)}</DialogDescription>
    </DialogHeader>
    <div className="space-y-4">
      <RadioGroup value={modo} onValueChange={(v) => setModo(v as "lancar" | "dispensar")} className="flex gap-6">
        <div className="flex items-center gap-2"><RadioGroupItem value="lancar" id="modo-lancar" /><Label htmlFor="modo-lancar">Lançar movimento</Label></div>
        <div className="flex items-center gap-2"><RadioGroupItem value="dispensar" id="modo-dispensar" /><Label htmlFor="modo-dispensar">Dispensar sem movimento</Label></div>
      </RadioGroup>
      {centros.error && <p className="text-sm text-destructive">Não foi possível carregar os centros: {formatError(centros.error)}</p>}
      {modo === "lancar" && <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5"><Label>Centro de saída</Label>
          <Select value={saida} onValueChange={setSaida}>
            <SelectTrigger aria-label="Centro de saída"><SelectValue placeholder="Escolha o centro" /></SelectTrigger>
            <SelectContent>{(centros.data ?? []).map(c => <SelectItem key={c.codigo} value={c.codigo}>{c.codigo}{c.nome ? ` — ${c.nome}` : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Centro de entrada</Label>
          <Select value={entrada} onValueChange={setEntrada}>
            <SelectTrigger aria-label="Centro de entrada"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NENHUM}>— nenhum (a mercadoria saiu da empresa)</SelectItem>
              {(centros.data ?? []).map(c => <SelectItem key={c.codigo} value={c.codigo}>{c.codigo}{c.nome ? ` — ${c.nome}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>}
      <div className="space-y-1.5"><Label htmlFor="motivo-baixa">Motivo</Label>
        <Textarea id="motivo-baixa" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Por que esta nota está sendo resolvida assim" />
      </div>
      {erro && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}
      {previa && paramsPrevia === chave && <div className="space-y-2">
        <p className="text-sm font-medium">Prévia: {previa.itens} itens</p>
        <div className="max-h-80 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>SKU</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead>CFOP</TableHead>
              <TableHead>Motivo saída</TableHead><TableHead>Motivo entrada</TableHead><TableHead className="text-right">Saldo saída (antes → depois)</TableHead>
            </TableRow></TableHeader>
            <TableBody>{previa.detalhe.map((d, i) => <TableRow key={`${d.sku}-${i}`}>
              <TableCell className="font-mono text-xs">{d.sku}</TableCell>
              <TableCell className="text-right tabular-nums">{d.qtd}</TableCell>
              <TableCell>{d.cfop ?? "—"}</TableCell>
              <TableCell>{d.motivo_saida ?? "—"}</TableCell>
              <TableCell>{d.motivo_entrada ?? "—"}</TableCell>
              <TableCell className={`text-right tabular-nums ${Number(d.saldo_saida_depois) < 0 ? "text-destructive" : ""}`}>{d.saldo_saida_antes ?? "—"} → {d.saldo_saida_depois ?? "—"}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div>
      </div>}
      {validacao && <p className="text-xs text-muted-foreground">{validacao}</p>}
    </div>
    <DialogFooter className="gap-2">
      <Button variant="ghost" onClick={onVoltar} disabled={!!carregando}>Voltar à lista</Button>
      <Button variant="outline" onClick={() => chamar(true)} disabled={!!validacao || !!carregando}>
        {carregando === "previa" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ver prévia
      </Button>
      <Button onClick={() => chamar(false)} disabled={!podeConfirmar || !!carregando} title={podeConfirmar ? undefined : "Veja a prévia com estes parâmetros antes de confirmar"}>
        {carregando === "confirmar" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar
      </Button>
    </DialogFooter>
  </>;
}

export { FileWarning };
