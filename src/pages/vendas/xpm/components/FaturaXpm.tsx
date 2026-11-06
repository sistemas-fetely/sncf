// FaturaXpm — peças da antiga aba Faturamento, agora dentro da aba única
// (Projeção + fatura): botão de importação e a fatura completa em painel lateral.
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type Fatura = {
  id: string; competencia: string; versao: number; origem: string; arquivo_nome: string | null;
  storage_path: string | null; simulado: boolean; valor_total: number | null; valor_desconto: number;
  valor_faturar: number | null; valor_minimo: number | null; status: string; nfs_numero: string | null;
  observacao: string | null; erro: string | null;
};
type LinhaF = {
  id: string; servico_chave: string; descricao_original: string | null; uom_original: string | null;
  qtde_cobrada: number | null; preco_cobrado: number | null; valor_cobrado: number; qtde_medida: number | null;
  divergencia_qtde: number | null; divergencia_valor: number | null; status: string; nota: string | null; ordem: number | null;
};
type Dim = { chave: string; processo: string; descricao: string; ordem: number };
type Conf = {
  pedido_ref: string | null; un_fatura: number | null; un_sncf: number | null; diferenca: number | null;
  situacao: string | null; data_fatura: string | null; data_sncf: string | null; nf_fatura: string | null;
  nf_sncf: string | null; linhas_fatura: number | null;
};

const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numBR = (v: number | null | undefined, d = 2) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d });
const dataBr = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const compBr = (c: string) => `${MES[Number(c.slice(5, 7)) - 1]}/${c.slice(0, 4)}`;

async function lerErro(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const t = await error.context.text();
    try { return JSON.parse(t).error ?? t; } catch { return t; }
  }
  return error instanceof Error ? error.message : String(error);
}

export function ImportarFaturaBotao() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function importar(file: File) {
    setEnviando(true);
    try {
      const path = `upload/${Date.now()}-${file.name}`;
      const { error: ue } = await supabase.storage.from("xpm-faturas").upload(path, file, { upsert: false });
      if (ue) throw new Error(`Upload: ${ue.message}`);
      const { data, error } = await supabase.functions.invoke("importar-fatura-xpm", { body: { storage_path: path } });
      if (error) throw new Error(await lerErro(error));
      const avisos: string[] = data?.avisos ?? [];
      toast.success(`Fatura ${compBr(data.competencia)} v${data.versao} importada — ${data.linhas} linhas`, {
        description: avisos.length ? avisos.join(" · ") : undefined,
        duration: avisos.length ? 12000 : 5000,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["xpm-fatura"] }),
        qc.invalidateQueries({ queryKey: ["xpm-projecao-mensal"] }),
        qc.invalidateQueries({ queryKey: ["xpm-fatura-natureza"] }),
      ]);
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsm,.xlsx" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); }} />
      <Button size="sm" onClick={() => inputRef.current?.click()} disabled={enviando}>
        {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
        Importar fatura
      </Button>
    </>
  );
}

function CardValor({ titulo, valor, sub }: { titulo: string; valor: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{titulo}</div>
        <div className="text-lg font-semibold whitespace-nowrap truncate">{valor}</div>
        {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function useFaturaXpm(id: string | null | undefined) {
  return useQuery({
    queryKey: ["xpm-fatura", "um", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.from("xpm_fatura").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Fatura | null;
    },
  });
}

function ComparativoServicos({ dims }: { dims: Map<string, Dim> | undefined }) {
  const faturas = useQuery({
    queryKey: ["xpm-fatura", "lista"],
    queryFn: async () => {
      const { data, error } = await db.from("xpm_fatura").select("*").order("competencia", { ascending: false }).order("versao", { ascending: false });
      if (error) throw error;
      return data as Fatura[];
    },
  });
  const vigentes = useMemo(
    () => (faturas.data ?? []).filter((f) => f.status !== "substituida" && f.status !== "erro_leitura").slice(0, 6).reverse(),
    [faturas.data],
  );
  const comparativo = useQuery({
    queryKey: ["xpm-fatura", "comparativo", vigentes.map((f) => f.id).join(",")],
    enabled: vigentes.length > 0,
    queryFn: async () => {
      const { data, error } = await db.from("xpm_fatura_linha").select("fatura_id, servico_chave, valor_cobrado").in("fatura_id", vigentes.map((f) => f.id));
      if (error) throw error;
      const m = new Map<string, Map<string, number>>();
      for (const r of data as { fatura_id: string; servico_chave: string; valor_cobrado: number }[]) {
        const x = m.get(r.servico_chave) ?? new Map<string, number>();
        x.set(r.fatura_id, (x.get(r.fatura_id) ?? 0) + Number(r.valor_cobrado));
        m.set(r.servico_chave, x);
      }
      return m;
    },
  });
  const erro = faturas.error ?? comparativo.error;
  if (erro) return <div className="text-sm text-destructive">Erro no comparativo: {(erro as Error).message}</div>;
  if (vigentes.length === 0) return null;
  return (
    <Card>
      <CardHeader className="py-3"><CardTitle className="text-sm">Comparativo por serviço</CardTitle></CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Serviço</TableHead>
              {vigentes.map((f) => <TableHead key={f.id} className="text-right whitespace-nowrap">{compBr(f.competencia)}</TableHead>)}
              <TableHead className="text-right">Var. %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...(comparativo.data?.entries() ?? [])]
              .sort((a, b) => (dims?.get(a[0])?.ordem ?? 999) - (dims?.get(b[0])?.ordem ?? 999))
              .map(([chave, m]) => {
                const ult = m.get(vigentes[vigentes.length - 1].id) ?? 0;
                const ant = vigentes.length > 1 ? (m.get(vigentes[vigentes.length - 2].id) ?? 0) : 0;
                const varp = ant ? ((ult - ant) / Math.abs(ant)) * 100 : null;
                return (
                  <TableRow key={chave}>
                    <TableCell className="max-w-[16rem] truncate" title={dims?.get(chave)?.descricao ?? chave}>{dims?.get(chave)?.descricao ?? chave}</TableCell>
                    {vigentes.map((f) => {
                      const v = m.get(f.id) ?? 0;
                      return <TableCell key={f.id} className={cn("text-right whitespace-nowrap", v === 0 && "text-muted-foreground")}>{brl(v)}</TableCell>;
                    })}
                    <TableCell className={cn("text-right whitespace-nowrap", varp != null && varp > 0 && "text-destructive", varp != null && varp < 0 && "text-success")}>
                      {varp == null ? "—" : `${varp > 0 ? "+" : ""}${varp.toFixed(1)}%`}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function FaturaCompletaSheet({ faturaId, open, onOpenChange }: { faturaId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const fat = useFaturaXpm(open ? faturaId : null);
  const sel = fat.data;
  const dims = useQuery({
    queryKey: ["xpm-servico-dim"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.from("xpm_servico_dim").select("chave, processo, descricao, ordem");
      if (error) throw error;
      return new Map((data as Dim[]).map((d) => [d.chave, d]));
    },
  });
  const linhas = useQuery({
    queryKey: ["xpm-fatura", "linhas", faturaId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.from("xpm_fatura_linha").select("*").eq("fatura_id", faturaId).order("ordem");
      if (error) throw error;
      return data as LinhaF[];
    },
  });
  const conf = useQuery({
    queryKey: ["xpm-fatura", "conf", faturaId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.from("vw_xpm_fatura_expedicao_conf").select("*").eq("fatura_id", faturaId);
      if (error) throw error;
      return ((data ?? []) as Conf[]).sort((a, b) =>
        Math.abs(Number(b.diferenca ?? 0)) - Math.abs(Number(a.diferenca ?? 0)) || (a.pedido_ref ?? "").localeCompare(b.pedido_ref ?? ""));
    },
  });
  const confDiv = useMemo(() => (conf.data ?? []).filter((c) => Number(c.diferenca ?? 0) !== 0).length, [conf.data]);

  async function abrirArquivo() {
    if (!sel?.storage_path) return;
    const { data, error } = await supabase.storage.from("xpm-faturas").createSignedUrl(sel.storage_path, 300);
    if (error || !data) { toast.error(`Não foi possível abrir o arquivo: ${error?.message}`); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-6xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Fatura XPM {sel ? `${compBr(sel.competencia)} · v${sel.versao}` : ""}</SheetTitle>
        </SheetHeader>
        {fat.error ? <div className="text-sm text-destructive mt-4">Erro: {(fat.error as Error).message}</div>
          : fat.isLoading ? <Skeleton className="h-24 w-full mt-4" />
          : !sel ? <div className="text-sm text-muted-foreground mt-4">Fatura não encontrada.</div> : (
          <div className="space-y-4 mt-4">
            {(sel.erro || sel.observacao) && (
              <div className={cn("rounded-md border px-3 py-2 text-sm flex gap-2", sel.erro ? "border-destructive/40 text-destructive" : "border-warning/40 text-warning")}>
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">{sel.erro ?? sel.observacao}</span>
              </div>
            )}
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 10rem), 1fr))" }}>
              <CardValor titulo={sel.simulado ? "Simulado total" : "Valor total"} valor={brl(sel.valor_total)} />
              <CardValor titulo="Desconto" valor={brl(sel.valor_desconto)} />
              <CardValor titulo="A faturar" valor={brl(sel.valor_faturar)} />
              <CardValor titulo="Mínimo" valor={brl(sel.valor_minimo)} />
              <CardValor titulo="Status" valor={<Badge variant="outline">{sel.status}</Badge>} sub={`versão ${sel.versao}`} />
              <CardValor titulo="Origem / arquivo" valor={sel.origem}
                sub={sel.storage_path ? (
                  <button className="underline inline-flex items-center gap-1" title={sel.arquivo_nome ?? ""} onClick={abrirArquivo}>
                    <FileSpreadsheet className="h-3 w-3" />{sel.arquivo_nome ?? "abrir"}
                  </button>
                ) : (sel.arquivo_nome ?? "—")} />
              <CardValor titulo="NFS-e" valor={sel.nfs_numero ?? "—"} />
            </div>

            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Linhas da fatura</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {linhas.error ? <div className="p-3 text-sm text-destructive">{(linhas.error as Error).message}</div> : linhas.isLoading ? <Skeleton className="h-24 m-3" /> : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Processo</TableHead><TableHead>Serviço</TableHead><TableHead>UOM</TableHead>
                        <TableHead className="text-right">Qtde cobrada</TableHead><TableHead className="text-right">Preço</TableHead>
                        <TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Medido SNCF</TableHead>
                        <TableHead className="text-right">Divergência</TableHead><TableHead>Status</TableHead><TableHead>Nota</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(linhas.data ?? []).map((l) => {
                        const d = dims.data?.get(l.servico_chave);
                        return (
                          <TableRow key={l.id} className={cn(Number(l.valor_cobrado) === 0 && "text-muted-foreground")}>
                            <TableCell className="whitespace-nowrap">{d?.processo ?? "—"}</TableCell>
                            <TableCell className="max-w-[18rem] truncate" title={l.descricao_original ?? d?.descricao ?? ""}>{l.descricao_original ?? d?.descricao}</TableCell>
                            <TableCell className="whitespace-nowrap">{l.uom_original ?? "—"}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{numBR(l.qtde_cobrada)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{brl(l.preco_cobrado)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap font-medium">{brl(l.valor_cobrado)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{l.qtde_medida == null ? "" : numBR(l.qtde_medida)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{l.divergencia_valor == null ? "" : brl(l.divergencia_valor)}</TableCell>
                            <TableCell><Badge variant="outline">{l.status}</Badge></TableCell>
                            <TableCell className="max-w-[16rem] truncate text-xs" title={l.nota ?? ""}>{l.nota}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Conferência pedido a pedido
                  {conf.data && <span className="ml-2 font-normal text-muted-foreground">{conf.data.length} pedidos · {confDiv} com diferença</span>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto max-h-[28rem]">
                {conf.error ? <div className="p-3 text-sm text-destructive">{(conf.error as Error).message}</div> : conf.isLoading ? <Skeleton className="h-24 m-3" /> : (conf.data ?? []).length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">Sem conferência para esta fatura.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Pedido</TableHead><TableHead className="text-right">Un. fatura</TableHead>
                        <TableHead className="text-right">Un. SNCF</TableHead><TableHead className="text-right">Diferença</TableHead>
                        <TableHead>Situação</TableHead><TableHead>Data fatura / SNCF</TableHead><TableHead>NF fatura / SNCF</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(conf.data ?? []).map((c, i) => (
                        <TableRow key={`${c.pedido_ref}-${i}`}>
                          <TableCell className="whitespace-nowrap font-medium">{c.pedido_ref ?? "—"}</TableCell>
                          <TableCell className="text-right">{numBR(c.un_fatura, 0)}</TableCell>
                          <TableCell className="text-right">{numBR(c.un_sncf, 0)}</TableCell>
                          <TableCell className={cn("text-right", Number(c.diferenca ?? 0) !== 0 && "text-destructive font-medium")}>{numBR(c.diferenca, 0)}</TableCell>
                          <TableCell><Badge variant="outline">{c.situacao ?? "—"}</Badge></TableCell>
                          <TableCell className="whitespace-nowrap">{dataBr(c.data_fatura)} / {dataBr(c.data_sncf)}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.nf_fatura ?? "—"} / {c.nf_sncf ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            {open && <ComparativoServicos dims={dims.data} />}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
