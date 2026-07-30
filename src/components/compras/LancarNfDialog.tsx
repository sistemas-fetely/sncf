import { useState } from "react";
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

interface PreviaNf {
  nf_existe?: boolean;
  linhas?: number;
  soma_linhas?: number;
  valor_produtos_informado?: number;
  divergencia?: number;
  linhas_sem_depara?: number;
  itens?: Array<{
    item_seq: number;
    codigo_nf: string;
    ncm: string | null;
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
}

const EMPTY = {
  numero: "",
  serie: "2",
  chave_acesso: "",
  data_emissao: "",
  data_saida: "",
  processo: "",
  container: "",
  valor_produtos: "",
  valor_ipi: "",
  valor_total: "",
  peso_bruto: "",
  peso_liquido: "",
  volumes: "",
};

interface LinhaNf {
  codigo_nf: string;
  ncm: string | null;
  quantidade: number;
  valor_unit: number;
  ipi_aliq: number | null;
  _erro?: string;
}

function parsearLinhasNf(texto: string): LinhaNf[] {
  return texto
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const p = l.split(/[\t;]/).map((x) => x.trim());
      if (p.length < 4) {
        return {
          codigo_nf: l,
          ncm: null,
          quantidade: NaN,
          valor_unit: NaN,
          ipi_aliq: null,
          _erro: "esperado: codigo TAB ncm TAB quantidade TAB valor_unit [TAB ipi_aliq]",
        };
      }
      return {
        codigo_nf: p[0],
        ncm: p[1] || null,
        quantidade: parsearNumero(p[2]),
        valor_unit: parsearNumero(p[3]),
        ipi_aliq: p[4] ? parsearNumero(p[4]) : null,
      };
    });
}

const num = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = parsearNumero(s);
  return isNaN(n) ? null : n;
};

export default function LancarNfDialog({ open, onOpenChange, pedidoId, fornecedorId }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY });
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<PreviaNf | null>(null);

  const set = (k: keyof typeof EMPTY, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setPrevia(null);
  };

  const montarPayload = () => {
    const linhas = parsearLinhasNf(texto);
    if (linhas.length === 0) throw new Error("Cole ao menos uma linha da NF.");
    const invalidas = linhas.filter((l) => l._erro);
    if (invalidas.length > 0) {
      throw new Error(
        `${invalidas.length} linha(s) mal formatada(s). Use TAB ou ponto-e-vírgula entre os campos.`,
      );
    }
    if (!form.numero.trim()) throw new Error("Informe o número da NF.");
    const p_nf = {
      fornecedor_id: fornecedorId,
      numero: form.numero.trim(),
      serie: form.serie.trim() || null,
      chave_acesso: form.chave_acesso.trim() || null,
      data_emissao: form.data_emissao || null,
      data_saida: form.data_saida || null,
      processo: form.processo.trim() || null,
      container: form.container.trim() || null,
      valor_produtos: num(form.valor_produtos),
      valor_ipi: num(form.valor_ipi),
      valor_total: num(form.valor_total),
      peso_bruto: num(form.peso_bruto),
      peso_liquido: num(form.peso_liquido),
      volumes: num(form.volumes),
    };
    const p_linhas = linhas.map((l) => ({
      codigo_nf: l.codigo_nf,
      ncm: l.ncm,
      quantidade: l.quantidade,
      valor_unit: l.valor_unit,
      ipi_aliq: l.ipi_aliq,
    }));
    return { p_nf, p_linhas };
  };

  const conferirMut = useMutation({
    mutationFn: async () => {
      const { p_nf, p_linhas } = montarPayload();
      const { data, error } = await (supabase as any).rpc("lancar_nf_importacao", {
        p_nf,
        p_linhas,
        p_pedido_ids: [pedidoId],
        p_confirmar: false,
      });
      if (error) throw error;
      return data as PreviaNf;
    },
    onSuccess: (d) => {
      setPrevia(d);
      toast.success("Conferência concluída. Revise antes de gravar.");
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const gravarMut = useMutation({
    mutationFn: async () => {
      const { p_nf, p_linhas } = montarPayload();
      const { data, error } = await (supabase as any).rpc("lancar_nf_importacao", {
        p_nf,
        p_linhas,
        p_pedido_ids: [pedidoId],
        p_confirmar: true,
      });
      if (error) throw error;
      return data as PreviaNf & { nf_id?: number; linhas_gravadas?: number };
    },
    onSuccess: (d) => {
      const acao = d.nf_existe ? "atualizada" : "criada";
      toast.success(
        `NF ${form.numero} ${acao} — ${d.linhas_gravadas ?? d.linhas ?? 0} linha(s), ${d.linhas_sem_depara ?? 0} sem de-para.`,
      );
      qc.invalidateQueries({ queryKey: ["pedido-mercadoria-detalhe", pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedido-mercadoria-nfs", pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedido-mercadoria-conferencia-nf"] });
      qc.invalidateQueries({ queryKey: ["importacao-pedido-lista"] });
      setForm({ ...EMPTY });
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
          <DialogTitle>Lançar NF</DialogTitle>
          <DialogDescription>
            Idempotente por número + série. Confira antes de gravar.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="xml">
          <TabsList>
            <TabsTrigger value="xml">Do XML capturado</TabsTrigger>
            <TabsTrigger value="manual">Digitar manualmente</TabsTrigger>
          </TabsList>

          <TabsContent value="xml" className="space-y-4 pt-2">
            <LancarNfXmlTab
              pedidoId={pedidoId}
              fornecedorId={fornecedorId}
              onGravado={() => onOpenChange(false)}
            />
          </TabsContent>

          <TabsContent value="manual" className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              Use só como exceção: NF em papel, ou fornecedor que não manda XML.
            </p>


        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label>Número *</Label>
            <Input value={form.numero} onChange={(e) => set("numero", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Série</Label>
            <Input value={form.serie} onChange={(e) => set("serie", e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Chave de acesso</Label>
            <Input value={form.chave_acesso} onChange={(e) => set("chave_acesso", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Data de emissão</Label>
            <Input type="date" value={form.data_emissao} onChange={(e) => set("data_emissao", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Data de saída</Label>
            <Input type="date" value={form.data_saida} onChange={(e) => set("data_saida", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Processo</Label>
            <Input value={form.processo} onChange={(e) => set("processo", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Container</Label>
            <Input value={form.container} onChange={(e) => set("container", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Valor dos produtos</Label>
            <Input value={form.valor_produtos} onChange={(e) => set("valor_produtos", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Valor do IPI</Label>
            <Input value={form.valor_ipi} onChange={(e) => set("valor_ipi", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Valor total</Label>
            <Input value={form.valor_total} onChange={(e) => set("valor_total", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Volumes</Label>
            <Input value={form.volumes} onChange={(e) => set("volumes", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Peso bruto</Label>
            <Input value={form.peso_bruto} onChange={(e) => set("peso_bruto", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Peso líquido</Label>
            <Input value={form.peso_liquido} onChange={(e) => set("peso_liquido", e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Linhas da NF</Label>
          <Textarea
            rows={7}
            className="font-mono text-xs"
            placeholder={"codigo_nf\tncm\tquantidade\tvalor_unit\tipi_aliq"}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setPrevia(null);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Um item por linha, separado por TAB ou ponto-e-vírgula. Vírgula é decimal, nunca
            separador de coluna. O valor total e a sequência dos itens são calculados pelo banco.
          </p>
        </div>

        {previa && (
          <div className="space-y-3 rounded-md border p-3">
            {previa.nf_existe && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
                <span>
                  Já existe NF com esse número e série. A gravação vai <b>atualizar</b> a NF
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
                <div className="text-xs text-muted-foreground">Valor de produtos informado</div>
                <div className="font-medium">
                  {Number(previa.valor_produtos_informado ?? 0).toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Divergência</div>
                <div className={divergente ? "font-semibold text-destructive" : "font-medium"}>
                  {Number(previa.divergencia ?? 0).toFixed(2)}
                </div>
              </div>
            </div>

            {divergente && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                A soma das linhas não bate com o valor de produtos informado. O banco vai recusar a
                gravação enquanto a divergência não for zero.
              </div>
            )}

            {Number(previa.linhas_sem_depara ?? 0) > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm space-y-1">
                <div>
                  {previa.linhas_sem_depara} linha(s) com código sem de-para para SKU. Isso não
                  impede gravar a NF — só deixa a alocação em SKU pendente.
                </div>
                <Link
                  to="/compras/mercadoria?aba=de-para"
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
                      <TableHead>Código</TableHead>
                      <TableHead>NCM</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Valor unit.</TableHead>
                      <TableHead className="text-right">Valor total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previa.itens!.map((it) => (
                      <TableRow key={`${it.item_seq}-${it.codigo_nf}`}>
                        <TableCell>{it.item_seq}</TableCell>
                        <TableCell className="font-mono text-xs">{it.codigo_nf}</TableCell>
                        <TableCell className="font-mono text-xs">{it.ncm ?? "—"}</TableCell>
                        <TableCell className="text-right">{Number(it.quantidade ?? 0)}</TableCell>
                        <TableCell className="text-right">
                          {Number(it.valor_unit ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(it.valor_total ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={it.status === "mapeado" ? "secondary" : "destructive"}>
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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

