import { useMemo, useRef, useState } from "react";
import { invalidarCompras } from "@/lib/compras/invalidar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, AlertTriangle, CheckCircle2, ExternalLink, FileUp, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { parsearNumero, VERDE } from "@/lib/compras/lancamento-utils";

interface PreviaInvoice {
  invoice_existe?: boolean;
  linhas?: number;
  soma_linhas?: number;
  valor_total_informado?: number;
  divergencia?: number;
  linhas_sem_sku?: number;
  linhas_fora_dos_pedidos?: number;
  por_pedido?: Array<{ numero_pedido?: string | null; pedido_id?: number; linhas?: number }> | Record<string, number> | null;
  itens?: Array<{
    item_seq: number;
    codigo_fornecedor: string;
    sku: string | null;
    descricao: string | null;
    quantidade: number;
    valor_unit: number;
    valor_total: number;
    status: string;
  }>;
}

interface RespostaGravar extends PreviaInvoice {
  invoice_id?: number;
  linhas_gravadas?: number;
  qtd_confirmada?: {
    linhas_pedido_atualizadas?: number;
    skus_ambiguos?: unknown[] | null;
  } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Compatibilidade: pedido único (detalhe do pedido). */
  pedidoId?: number;
  /** Lista de pedidos do embarque (porta da remessa). Tem precedência. */
  pedidoIds?: number[];
  fornecedorId: string | null;
  moedaPadrao?: string | null;
}

const EMPTY = {
  numero: "",
  data_emissao: "",
  moeda: "USD",
  incoterm: "",
  valor_total: "",
  container: "",
};

interface LinhaInv {
  codigo_fornecedor: string;
  sku: string | null;
  descricao: string | null;
  quantidade: number;
  valor_unit: number;
  _erro?: string;
}

/** Linha lida do PDF (editável). Campos numéricos guardados como texto para edição. */
interface LinhaPdf {
  item_seq: string;
  marca: string;
  ean: string;
  descricao: string;
  quantidade: string;
  valor_unit: string;
  setup: string;
  valor_total: string;
}

function parsearLinhasInvoice(texto: string): LinhaInv[] {
  return texto
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const p = l.split(/[\t;]/).map((x) => x.trim());
      if (p.length < 5) {
        return {
          codigo_fornecedor: l,
          sku: null,
          descricao: null,
          quantidade: NaN,
          valor_unit: NaN,
          _erro: "esperado: codigo_fornecedor TAB sku TAB descricao TAB quantidade TAB valor_unit",
        };
      }
      return {
        codigo_fornecedor: p[0],
        sku: p[1] || null,
        descricao: p[2] || null,
        quantidade: parsearNumero(p[3]),
        valor_unit: parsearNumero(p[4]),
      };
    });
}

const num = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = parsearNumero(s);
  return isNaN(n) ? null : n;
};

/** Converte número vindo do PDF (ponto decimal) para texto editável. */
const paraTexto = (v: unknown) => (v === null || v === undefined ? "" : String(v));
/** Lê célula editada: aceita ponto ou vírgula decimal. */
const lerCelula = (s: string): number => {
  const t = s.trim();
  if (!t) return NaN;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return parsearNumero(t);
};

function eanValido(ean: string): boolean {
  const d = ean.replace(/\D/g, "");
  if (d.length !== 13) return false;
  const dig = d.split("").map(Number);
  const soma = dig.slice(0, 12).reduce((acc, x, i) => acc + x * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (soma % 10)) % 10 === dig[12];
}

function falhasLinha(l: LinhaPdf): string[] {
  const out: string[] = [];
  const q = lerCelula(l.quantidade);
  const u = lerCelula(l.valor_unit);
  const s = l.setup.trim() ? lerCelula(l.setup) : 0;
  const t = lerCelula(l.valor_total);
  if (!l.marca.trim()) out.push("sem marca");
  if ([q, u, s, t].some((x) => !Number.isFinite(x))) out.push("número inválido");
  else if (Math.abs(q * u + s - t) > 0.02) out.push(`qtd × unit + setup = ${(q * u + s).toFixed(2)} ≠ ${t.toFixed(2)}`);
  if (l.ean.trim() && !eanValido(l.ean)) out.push("EAN inválido");
  return out;
}

const STATUS_PROBLEMA = new Set(["sem_depara", "ambiguo"]);

function lerArquivoBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = String(r.result ?? "");
      resolve(res.replace(/^data:[^,]*,/, ""));
    };
    r.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(file);
  });
}

function normalizarPorPedido(p: PreviaInvoice["por_pedido"]): Array<{ rotulo: string; linhas: number }> {
  if (!p) return [];
  if (Array.isArray(p)) {
    return p.map((x) => ({
      rotulo: x.numero_pedido ?? (x.pedido_id != null ? `#${x.pedido_id}` : "—"),
      linhas: Number(x.linhas ?? 0),
    }));
  }
  return Object.entries(p).map(([k, v]) => ({ rotulo: k, linhas: Number(v ?? 0) }));
}

export default function LancarInvoiceDialog({
  open,
  onOpenChange,
  pedidoId,
  pedidoIds,
  fornecedorId,
  moedaPadrao,
}: Props) {
  const qc = useQueryClient();
  const pedidosEfetivos = useMemo(
    () => pedidoIds ?? (pedidoId != null ? [pedidoId] : []),
    [pedidoIds, pedidoId],
  );
  const [form, setForm] = useState({ ...EMPTY, moeda: (moedaPadrao || "USD").toUpperCase() });
  const [texto, setTexto] = useState("");
  const [linhasPdf, setLinhasPdf] = useState<LinhaPdf[] | null>(null);
  const [totalQtdPdf, setTotalQtdPdf] = useState<number | null>(null);
  const [avisosPdf, setAvisosPdf] = useState<string[]>([]);
  const [previa, setPrevia] = useState<PreviaInvoice | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof typeof EMPTY, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setPrevia(null);
  };

  const setCelula = (i: number, k: keyof LinhaPdf, v: string) => {
    setLinhasPdf((ls) => (ls ? ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)) : ls));
    setPrevia(null);
  };

  // ── conferência no cliente (só para linhas vindas do PDF) ──
  const conferencia = useMemo(() => {
    if (!linhasPdf) return null;
    const falhas = linhasPdf.map(falhasLinha);
    const somaValor = linhasPdf.reduce((a, l) => a + (lerCelula(l.valor_total) || 0), 0);
    const somaQtd = linhasPdf.reduce((a, l) => a + (lerCelula(l.quantidade) || 0), 0);
    const valorTotal = num(form.valor_total);
    const valorOk = valorTotal !== null && Math.abs(somaValor - valorTotal) <= 0.05;
    const qtdOk = totalQtdPdf === null || Math.abs(somaQtd - totalQtdPdf) < 0.0001;
    const linhasComFalha = falhas.filter((f) => f.length > 0).length;
    return {
      falhas,
      somaValor,
      somaQtd,
      valorTotal,
      valorOk,
      qtdOk,
      linhasComFalha,
      ok: valorOk && qtdOk && linhasComFalha === 0 && linhasPdf.length > 0,
    };
  }, [linhasPdf, form.valor_total, totalQtdPdf]);

  const lerPdfMut = useMutation({
    mutationFn: async (file: File) => {
      const arquivo_base64 = await lerArquivoBase64(file);
      const { data, error } = await supabase.functions.invoke("parse-invoice-pdf", {
        body: { arquivo_base64, nome_arquivo: file.name },
      });
      if (error) {
        let msg = error.message;
        try {
          const ctx = await (error as any).context?.json?.();
          if (ctx?.error) msg = ctx.error;
        } catch {
          /* mantém msg original */
        }
        throw new Error(msg);
      }
      if (!data?.ok) throw new Error(data?.error ?? "Leitura do PDF falhou.");
      return data as {
        cabecalho: {
          numero: string;
          data_emissao: string | null;
          moeda: string | null;
          incoterm: string | null;
          conteineres: string[];
          total_quantidade: number;
          total_valor: number;
        };
        linhas: Array<Record<string, unknown>>;
        avisos: string[];
      };
    },
    onSuccess: (d) => {
      const c = d.cabecalho;
      setForm({
        numero: c.numero ?? "",
        data_emissao: c.data_emissao ?? "",
        moeda: (c.moeda || moedaPadrao || "USD").toUpperCase(),
        incoterm: c.incoterm ?? "",
        valor_total: paraTexto(c.total_valor),
        container: (c.conteineres ?? []).join(", "),
      });
      setTotalQtdPdf(Number.isFinite(c.total_quantidade) && c.total_quantidade > 0 ? c.total_quantidade : null);
      setLinhasPdf(
        d.linhas.map((l) => ({
          item_seq: paraTexto(l.item_seq),
          marca: paraTexto(l.marca),
          ean: paraTexto(l.ean),
          descricao: paraTexto(l.descricao),
          quantidade: paraTexto(l.quantidade),
          valor_unit: paraTexto(l.valor_unit),
          setup: paraTexto(l.setup ?? 0),
          valor_total: paraTexto(l.valor_total),
        })),
      );
      setAvisosPdf(d.avisos ?? []);
      setPrevia(null);
      toast.success(`${d.linhas.length} linha(s) lidas do PDF. Confira antes de gravar.`);
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const montarPayload = () => {
    if (pedidosEfetivos.length === 0) throw new Error("Nenhum pedido informado para a invoice.");
    if (!form.numero.trim()) throw new Error("Informe o número da invoice.");
    let p_linhas: Array<Record<string, unknown>>;
    if (linhasPdf) {
      if (!conferencia?.ok) {
        throw new Error("A conferência das linhas do PDF não fecha. Corrija as linhas destacadas.");
      }
      p_linhas = linhasPdf.map((l) => ({
        item_seq: Number(lerCelula(l.item_seq)) || null,
        codigo_fornecedor: l.marca.trim(),
        descricao: l.descricao.trim() || null,
        quantidade: lerCelula(l.quantidade),
        valor_unit: lerCelula(l.valor_unit),
        valor_total: lerCelula(l.valor_total),
      }));
    } else {
      const linhas = parsearLinhasInvoice(texto);
      if (linhas.length === 0) throw new Error("Cole ao menos uma linha da invoice ou leia o PDF.");
      const invalidas = linhas.filter((l) => l._erro);
      if (invalidas.length > 0) {
        throw new Error(
          `${invalidas.length} linha(s) mal formatada(s). Use TAB ou ponto-e-vírgula entre os campos.`,
        );
      }
      p_linhas = linhas.map((l) => ({
        codigo_fornecedor: l.codigo_fornecedor,
        sku: l.sku,
        descricao: l.descricao,
        quantidade: l.quantidade,
        valor_unit: l.valor_unit,
      }));
    }
    const p_inv = {
      fornecedor_id: fornecedorId,
      numero: form.numero.trim(),
      data_emissao: form.data_emissao || null,
      moeda: form.moeda.trim().toUpperCase() || null,
      incoterm: form.incoterm.trim() || null,
      valor_total: num(form.valor_total),
      container: form.container.trim() || null,
    };
    return { p_inv, p_linhas };
  };

  const conferirMut = useMutation({
    mutationFn: async () => {
      const { p_inv, p_linhas } = montarPayload();
      const { data, error } = await (supabase as any).rpc("lancar_invoice_importacao", {
        p_inv,
        p_linhas,
        p_pedido_ids: pedidosEfetivos,
        p_confirmar: false,
      });
      if (error) throw error;
      return data as PreviaInvoice;
    },
    onSuccess: (d) => {
      setPrevia(d);
      toast.success("Conferência concluída. Revise antes de gravar.");
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const gravarMut = useMutation({
    mutationFn: async () => {
      const { p_inv, p_linhas } = montarPayload();
      const { data, error } = await (supabase as any).rpc("lancar_invoice_importacao", {
        p_inv,
        p_linhas,
        p_pedido_ids: pedidosEfetivos,
        p_confirmar: true,
      });
      if (error) throw error;
      return data as RespostaGravar;
    },
    onSuccess: async (d) => {
      const acao = d.invoice_existe ? "atualizada" : "criada";
      toast.success(
        `Invoice ${form.numero} ${acao} — ${d.linhas_gravadas ?? d.linhas ?? 0} linha(s), ${d.linhas_sem_sku ?? 0} sem SKU.`,
      );
      const atualizadas = d.qtd_confirmada?.linhas_pedido_atualizadas;
      if (atualizadas != null) {
        toast.info(`Quantidade confirmada atualizada em ${atualizadas} linha(s) de pedido.`);
      }
      const ambiguos = d.qtd_confirmada?.skus_ambiguos ?? [];
      if (Array.isArray(ambiguos) && ambiguos.length > 0) {
        toast.warning(
          `${ambiguos.length} SKU(s) ambíguo(s) — quantidade confirmada não atualizada: ${ambiguos
            .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
            .join(", ")}`,
        );
      }
      invalidarCompras(qc);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["importacao-embarques"] }),
        qc.invalidateQueries({ queryKey: ["importacao-embarque-painel"] }),
        qc.invalidateQueries({ queryKey: ["importacao-pedidos-painel"] }),
        qc.invalidateQueries({ queryKey: ["embarque-documentos"] }),
      ]);
      setForm({ ...EMPTY, moeda: (moedaPadrao || "USD").toUpperCase() });
      setTexto("");
      setLinhasPdf(null);
      setTotalQtdPdf(null);
      setAvisosPdf([]);
      setPrevia(null);
      onOpenChange(false);
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const divergente = !!previa && Number(previa.divergencia ?? 0) !== 0;
  const bloqueadoPdf = !!linhasPdf && !conferencia?.ok;
  const porPedido = normalizarPorPedido(previa?.por_pedido);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lançar Invoice</DialogTitle>
          <DialogDescription>
            Idempotente por número. Confira antes de gravar.
            {pedidosEfetivos.length > 1 ? ` Vale para ${pedidosEfetivos.length} pedidos do embarque.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) lerPdfMut.mutate(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={lerPdfMut.isPending}
          >
            {lerPdfMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <FileUp className="h-4 w-4 mr-2" />
            )}
            {lerPdfMut.isPending ? "Lendo PDF…" : "Ler PDF"}
          </Button>
          {linhasPdf && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setLinhasPdf(null);
                setTotalQtdPdf(null);
                setAvisosPdf([]);
                setPrevia(null);
              }}
            >
              Descartar linhas do PDF
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Número *</Label>
            <Input value={form.numero} onChange={(e) => set("numero", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Data de emissão</Label>
            <Input
              type="date"
              value={form.data_emissao}
              onChange={(e) => set("data_emissao", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Moeda</Label>
            <Input
              value={form.moeda}
              maxLength={5}
              onChange={(e) => set("moeda", e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Incoterm</Label>
            <Input
              value={form.incoterm}
              onChange={(e) => set("incoterm", e.target.value.toUpperCase())}
              placeholder="FOB / CIF"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Valor total</Label>
            <Input value={form.valor_total} onChange={(e) => set("valor_total", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Container</Label>
            <Input value={form.container} onChange={(e) => set("container", e.target.value)} />
          </div>
        </div>

        {avisosPdf.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm space-y-0.5">
            {avisosPdf.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" /> {a}
              </div>
            ))}
          </div>
        )}

        {linhasPdf && conferencia ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Label>Linhas lidas do PDF</Label>
              <span className={cn("font-medium", conferencia.ok ? "text-success" : "text-destructive")}>
                {linhasPdf.length} linhas lidas · soma confere {conferencia.ok ? "✓" : "✗"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div className={conferencia.valorOk ? "" : "text-destructive"}>
                Soma das linhas {conferencia.somaValor.toFixed(2)} · valor total{" "}
                {conferencia.valorTotal === null ? "—" : conferencia.valorTotal.toFixed(2)}
                {conferencia.valorOk ? " ✓" : " ✗ (tolerância 0,05)"}
              </div>
              <div className={conferencia.qtdOk ? "" : "text-destructive"}>
                Soma das quantidades {conferencia.somaQtd} · total do PDF{" "}
                {totalQtdPdf ?? "não informado"}
                {conferencia.qtdOk ? " ✓" : " ✗"}
              </div>
              {conferencia.linhasComFalha > 0 && (
                <div className="text-destructive">
                  {conferencia.linhasComFalha} linha(s) com problema — corrija as células destacadas.
                </div>
              )}
            </div>
            <div className="max-h-[45vh] overflow-auto rounded-md border">
              <Table containerClassName="overflow-visible">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-14">Item</TableHead>
                    <TableHead className="w-24">Marca</TableHead>
                    <TableHead className="w-36">EAN</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-20 text-right">Qtd</TableHead>
                    <TableHead className="w-24 text-right">Unit</TableHead>
                    <TableHead className="w-20 text-right">Setup</TableHead>
                    <TableHead className="w-24 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhasPdf.map((l, i) => {
                    const f = conferencia.falhas[i];
                    const cel = (k: keyof LinhaPdf, cls?: string) => (
                      <Input
                        className={cn("h-7 px-1.5 text-xs", cls)}
                        value={l[k]}
                        onChange={(e) => setCelula(i, k, e.target.value)}
                      />
                    );
                    return (
                      <Fragment key={i}>
                        <TableRow className={cn(f.length > 0 && "bg-warning/10")}>
                          <TableCell className="p-1">{cel("item_seq")}</TableCell>
                          <TableCell className="p-1">{cel("marca", "font-mono")}</TableCell>
                          <TableCell className="p-1">{cel("ean", "font-mono")}</TableCell>
                          <TableCell className="p-1">{cel("descricao")}</TableCell>
                          <TableCell className="p-1">{cel("quantidade", "text-right")}</TableCell>
                          <TableCell className="p-1">{cel("valor_unit", "text-right")}</TableCell>
                          <TableCell className="p-1">{cel("setup", "text-right")}</TableCell>
                          <TableCell className="p-1">{cel("valor_total", "text-right")}</TableCell>
                        </TableRow>
                        {f.length > 0 && (
                          <TableRow className="bg-warning/10">
                            <TableCell colSpan={8} className="py-1 text-xs text-warning-foreground">
                              <AlertTriangle className="inline h-3 w-3 mr-1 text-warning" />
                              {f.join(" · ")}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Linhas da invoice</Label>
            <Textarea
              rows={7}
              className="font-mono text-xs"
              placeholder={"codigo_fornecedor\tsku\tdescricao\tquantidade\tvalor_unit"}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setPrevia(null);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Um item por linha, separado por TAB ou ponto-e-vírgula. O SKU é opcional — se vazio, o
              banco tenta resolver pelo de-para. Vírgula é decimal. Ou use "Ler PDF".
            </p>
          </div>
        )}

        {previa && (
          <div className="space-y-3 rounded-md border p-3">
            {previa.invoice_existe && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-warning" />
                <span>
                  Já existe invoice com esse número. A gravação vai <b>atualizar</b> a invoice
                  existente, não criar outra.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Linhas</div>
                <div className="font-medium">{previa.linhas ?? 0}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Soma das linhas</div>
                <div className="font-medium">{Number(previa.soma_linhas ?? 0).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Valor total informado</div>
                <div className="font-medium">
                  {Number(previa.valor_total_informado ?? 0).toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Divergência</div>
                <div className={divergente ? "font-medium text-destructive" : "font-medium"}>
                  {Number(previa.divergencia ?? 0).toFixed(2)}
                </div>
              </div>
            </div>

            {porPedido.length > 0 && (
              <div className="text-sm">
                <span className="text-xs text-muted-foreground mr-2">Por pedido:</span>
                {porPedido.map((p) => `${p.rotulo}: ${p.linhas} linhas`).join(" · ")}
              </div>
            )}

            {Number(previa.linhas_fora_dos_pedidos ?? 0) > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-warning" />
                {previa.linhas_fora_dos_pedidos} linha(s) não pertencem a nenhum dos pedidos
                informados.
              </div>
            )}

            {divergente && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                A soma das linhas não bate com o valor total informado. O banco vai recusar a
                gravação enquanto a divergência não for zero.
              </div>
            )}

            {Number(previa.linhas_sem_sku ?? 0) > 0 && (
              <div className="rounded-md border border-info/40 bg-info/10 p-2 text-sm space-y-1">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 text-info" />
                  {previa.linhas_sem_sku} linha(s) sem produto cadastrado — gravam como pendência.
                </div>
                <Link
                  to="/vendas/produto/chegada-mercadoria?aba=de-para"
                  className="inline-flex items-center gap-1 text-xs underline"
                >
                  Abrir de-para de fornecedor <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}

            {(previa.itens?.length ?? 0) > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Código fornecedor</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Valor unit.</TableHead>
                      <TableHead className="text-right">Valor total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previa.itens!.map((it) => (
                      <TableRow key={`${it.item_seq}-${it.codigo_fornecedor}`}>
                        <TableCell>{it.item_seq}</TableCell>
                        <TableCell className="font-mono text-xs">{it.codigo_fornecedor}</TableCell>
                        <TableCell className="font-mono text-xs">{it.sku ?? "—"}</TableCell>
                        <TableCell className="max-w-[220px] truncate">
                          {it.descricao ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">{Number(it.quantidade ?? 0)}</TableCell>
                        <TableCell className="text-right">
                          {Number(it.valor_unit ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(it.valor_total ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={STATUS_PROBLEMA.has(it.status) ? "destructive" : "secondary"}
                          >
                            {it.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => conferirMut.mutate()}
            disabled={conferirMut.isPending || bloqueadoPdf}
          >
            {conferirMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Conferir
          </Button>
          <Button
            style={{ backgroundColor: VERDE }}
            className="text-white hover:opacity-90"
            onClick={() => gravarMut.mutate()}
            disabled={!previa || gravarMut.isPending || bloqueadoPdf}
          >
            {gravarMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Gravar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
