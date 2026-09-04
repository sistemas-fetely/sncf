import { useState } from "react";
import { invalidarCompras } from "@/lib/compras/invalidar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
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
import { parsearNumero, VERDE } from "@/lib/compras/lancamento-utils";

interface PreviaInvoice {
  invoice_existe?: boolean;
  linhas?: number;
  soma_linhas?: number;
  valor_total_informado?: number;
  divergencia?: number;
  linhas_sem_sku?: number;
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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedidoId: number;
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

const STATUS_PROBLEMA = new Set(["sem_depara", "ambiguo"]);

export default function LancarInvoiceDialog({
  open,
  onOpenChange,
  pedidoId,
  fornecedorId,
  moedaPadrao,
}: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY, moeda: (moedaPadrao || "USD").toUpperCase() });
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<PreviaInvoice | null>(null);

  const set = (k: keyof typeof EMPTY, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setPrevia(null);
  };

  const montarPayload = () => {
    const linhas = parsearLinhasInvoice(texto);
    if (linhas.length === 0) throw new Error("Cole ao menos uma linha da invoice.");
    const invalidas = linhas.filter((l) => l._erro);
    if (invalidas.length > 0) {
      throw new Error(
        `${invalidas.length} linha(s) mal formatada(s). Use TAB ou ponto-e-vírgula entre os campos.`,
      );
    }
    if (!form.numero.trim()) throw new Error("Informe o número da invoice.");
    const p_inv = {
      fornecedor_id: fornecedorId,
      numero: form.numero.trim(),
      data_emissao: form.data_emissao || null,
      moeda: form.moeda.trim().toUpperCase() || null,
      incoterm: form.incoterm.trim() || null,
      valor_total: num(form.valor_total),
      container: form.container.trim() || null,
    };
    const p_linhas = linhas.map((l) => ({
      codigo_fornecedor: l.codigo_fornecedor,
      sku: l.sku,
      descricao: l.descricao,
      quantidade: l.quantidade,
      valor_unit: l.valor_unit,
    }));
    return { p_inv, p_linhas };
  };

  const conferirMut = useMutation({
    mutationFn: async () => {
      const { p_inv, p_linhas } = montarPayload();
      const { data, error } = await (supabase as any).rpc("lancar_invoice_importacao", {
        p_inv,
        p_linhas,
        p_pedido_ids: [pedidoId],
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
        p_pedido_ids: [pedidoId],
        p_confirmar: true,
      });
      if (error) throw error;
      return data as PreviaInvoice & { invoice_id?: number; linhas_gravadas?: number };
    },
    onSuccess: (d) => {
      const acao = d.invoice_existe ? "atualizada" : "criada";
      toast.success(
        `Invoice ${form.numero} ${acao} — ${d.linhas_gravadas ?? d.linhas ?? 0} linha(s), ${d.linhas_sem_sku ?? 0} sem SKU.`,
      );
      invalidarCompras(qc);
      setForm({ ...EMPTY, moeda: (moedaPadrao || "USD").toUpperCase() });
      setTexto("");
      setPrevia(null);
      onOpenChange(false);
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const divergente = !!previa && Number(previa.divergencia ?? 0) !== 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lançar Invoice</DialogTitle>
          <DialogDescription>
            Idempotente por número. Confira antes de gravar.
          </DialogDescription>
        </DialogHeader>

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
            banco tenta resolver pelo de-para. Vírgula é decimal.
          </p>
        </div>

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

            {divergente && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                A soma das linhas não bate com o valor total informado. O banco vai recusar a
                gravação enquanto a divergência não for zero.
              </div>
            )}

            {Number(previa.linhas_sem_sku ?? 0) > 0 && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm space-y-1">
                <div>
                  {previa.linhas_sem_sku} linha(s) sem SKU resolvido. Isso não impede gravar a
                  invoice — só deixa a alocação em SKU pendente.
                </div>
                <Link
                  to="/logistica/chegada-mercadoria?aba=de-para"
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
            disabled={conferirMut.isPending}
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
            disabled={!previa || gravarMut.isPending}
          >
            {gravarMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Gravar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
