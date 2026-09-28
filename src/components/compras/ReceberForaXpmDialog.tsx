import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { invalidarCompras } from "@/lib/compras/invalidar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Centro {
  codigo: string;
  nome: string;
  rotulo_curto: string | null;
}

interface LinhaSku {
  sku: string;
  descricao: string | null;
  declarado: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nfId: number;
  nfNumero: string;
}

export default function ReceberForaXpmDialog({ open, onOpenChange, nfId, nfNumero }: Props) {
  const qc = useQueryClient();
  const hoje = format(new Date(), "yyyy-MM-dd");
  const [centro, setCentro] = useState("");
  const [dataReceb, setDataReceb] = useState(hoje);
  const [valores, setValores] = useState<Record<string, { recebido: string; avaria: string }>>({});

  const centrosQ = useQuery({
    queryKey: ["centros-recebimento-fora-xpm"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("centro_distribuicao")
        .select("codigo, nome, rotulo_curto")
        .eq("ativo", true)
        .in("tipo", ["armazem", "showroom"])
        .neq("codigo", "XPM-SC")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Centro[];
    },
  });

  const linhasQ = useQuery({
    queryKey: ["nf-linhas-sku", nfId],
    enabled: open && Number.isFinite(nfId),
    queryFn: async () => {
      const { data: linhas, error: e1 } = await (supabase as any)
        .from("importacao_nf_linha")
        .select("id, codigo_nf, descricao, quantidade")
        .eq("nf_id", nfId)
        .order("item_seq");
      if (e1) throw e1;
      const lista = (linhas ?? []) as Array<{
        id: string;
        codigo_nf: string;
        descricao: string | null;
        quantidade: number;
      }>;
      if (lista.length === 0) return [] as LinhaSku[];
      const { data: skus, error: e2 } = await (supabase as any)
        .from("importacao_nf_linha_sku")
        .select("nf_linha_id, sku, quantidade")
        .in(
          "nf_linha_id",
          lista.map((l) => l.id),
        );
      if (e2) throw e2;
      const descPorLinha = new Map(lista.map((l) => [l.id, l.descricao ?? l.codigo_nf]));
      const porSku = new Map<string, LinhaSku>();
      ((skus ?? []) as Array<{ nf_linha_id: string; sku: string; quantidade: number }>).forEach(
        (s) => {
          const atual = porSku.get(s.sku) ?? {
            sku: s.sku,
            descricao: descPorLinha.get(s.nf_linha_id) ?? null,
            declarado: 0,
          };
          atual.declarado += Number(s.quantidade ?? 0);
          porSku.set(s.sku, atual);
        },
      );
      return [...porSku.values()].sort((a, b) => a.sku.localeCompare(b.sku));
    },
  });

  const linhas = linhasQ.data ?? [];

  // Centro sugerido pelo destinatário da NF (matriz SP x filial SC).
  const sugestaoQ = useQuery({
    queryKey: ["nf-centro-sugerido", nfId],
    enabled: open && Number.isFinite(nfId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("nf_centro_sugerido", {
        p_nf_id: nfId,
      });
      if (error) throw error;
      return (data ?? null) as {
        destinatario_cnpj: string | null;
        centro_codigo: string | null;
        centro_rotulo: string | null;
      } | null;
    },
  });
  const sugestao = sugestaoQ.data ?? null;

  const formatarCnpj = (c: string) =>
    c.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*$/, "$1.$2.$3/$4-$5");

  // Pré-seleciona o centro sugerido (quando não é XPM) ao abrir.
  useEffect(() => {
    if (
      open &&
      sugestao?.centro_codigo &&
      sugestao.centro_codigo !== "XPM-SC" &&
      !centro
    ) {
      setCentro(sugestao.centro_codigo);
    }
  }, [open, sugestao, centro]);

  const valorDe = (sku: string, declarado: number) =>
    valores[sku] ?? { recebido: String(declarado), avaria: "0" };

  const setValor = (sku: string, declarado: number, campo: "recebido" | "avaria", v: string) =>
    setValores((m) => ({ ...m, [sku]: { ...valorDe(sku, declarado), [campo]: v } }));

  const totais = useMemo(() => {
    let declarado = 0;
    let recebido = 0;
    let avaria = 0;
    linhas.forEach((l) => {
      const v = valorDe(l.sku, l.declarado);
      declarado += l.declarado;
      recebido += Number(v.recebido) || 0;
      avaria += Number(v.avaria) || 0;
    });
    return { declarado, recebido, avaria };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, valores]);

  const divergente = totais.recebido !== totais.declarado;
  const comAvaria = totais.avaria > 0;

  const receberMut = useMutation({
    mutationFn: async () => {
      const p_rows = linhas.map((l) => {
        const v = valorDe(l.sku, l.declarado);
        return {
          sku: l.sku,
          recebido: Number(v.recebido) || 0,
          nao_conforme: Number(v.avaria) || 0,
        };
      });
      const { data, error } = await (supabase as any).rpc("receber_nf_fora_xpm", {
        p_nf_id: nfId,
        p_centro_codigo: centro,
        p_data_recebimento: dataReceb,
        p_rows,
      });
      if (error) throw error;
      return data as {
        termo: string;
        entradas_cobertas: number;
        entradas_avarias: number;
        tarefas: number;
      };
    },
    onSuccess: (d) => {
      toast.success(
        `Recebimento ${d.termo}: ${d.entradas_cobertas} entradas, ${d.entradas_avarias} avarias, ${d.tarefas} tarefas`,
      );
      qc.invalidateQueries({ queryKey: ["pedido-mercadoria-nfs"] });
      qc.invalidateQueries({ queryKey: ["nf-recebimento"] });
      invalidarCompras(qc);
      setCentro("");
      setDataReceb(hoje);
      setValores({});
      onOpenChange(false);
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const podeConfirmar =
    !!centro && !!dataReceb && linhas.length > 0 && !receberMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receber NF {nfNumero} fora do XPM</DialogTitle>
          <DialogDescription>
            Para mercadoria entregue direto num centro sem passar pelo XPM. Gera as entradas de
            estoque no centro escolhido.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Centro de recebimento *</Label>
            <Select value={centro} onValueChange={setCentro}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o centro…" />
              </SelectTrigger>
              <SelectContent>
                {(centrosQ.data ?? []).map((c) => (
                  <SelectItem key={c.codigo} value={c.codigo}>
                    {c.rotulo_curto ?? c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sugestao?.centro_codigo && sugestao.centro_codigo !== "XPM-SC" && (
              <p className="text-xs text-muted-foreground">
                Sugerido pelo destinatário da NF (CNPJ{" "}
                {sugestao.destinatario_cnpj ? formatarCnpj(sugestao.destinatario_cnpj) : "—"})
              </p>
            )}
            {sugestao?.centro_codigo &&
              sugestao.centro_codigo !== "XPM-SC" &&
              centro &&
              centro !== sugestao.centro_codigo && (
                <p className="text-xs text-warning">
                  Centro diferente do destinatário da NF ({sugestao.centro_rotulo ?? sugestao.centro_codigo})
                </p>
              )}
          </div>
          <div className="space-y-1.5">
            <Label>Data do recebimento</Label>
            <Input
              type="date"
              value={dataReceb}
              max={hoje}
              onChange={(e) => setDataReceb(e.target.value)}
            />
          </div>
        </div>

        {sugestao?.centro_codigo === "XPM-SC" && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Esta NF foi emitida para a filial SC (XPM). O recebimento normal é pelo termo de
              conferência do XPM. Só continue se a mercadoria realmente chegou em outro centro.
            </span>
          </div>
        )}

        {linhasQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando linhas da NF...
          </div>
        ) : linhasQ.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
            {formatError(linhasQ.error)}
          </div>
        ) : linhas.length === 0 ? (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
            Conclua o de-para de SKU (Lançar NF) antes de receber.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Declarado na NF</TableHead>
                  <TableHead className="text-right w-28">Recebido</TableHead>
                  <TableHead className="text-right w-24">Avaria</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => {
                  const v = valorDe(l.sku, l.declarado);
                  return (
                    <TableRow key={l.sku}>
                      <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                      <TableCell className="text-sm">{l.descricao ?? "—"}</TableCell>
                      <TableCell className="text-right">{l.declarado}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-24 ml-auto text-right"
                          value={v.recebido}
                          onChange={(e) => setValor(l.sku, l.declarado, "recebido", e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-20 ml-auto text-right"
                          value={v.avaria}
                          onChange={(e) => setValor(l.sku, l.declarado, "avaria", e.target.value)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {linhas.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-6 text-sm">
              <span className="text-muted-foreground">
                Declarado: <b className="text-foreground">{totais.declarado}</b>
              </span>
              <span className="text-muted-foreground">
                Recebido: <b className="text-foreground">{totais.recebido}</b>
              </span>
              <span className="text-muted-foreground">
                Avaria: <b className="text-foreground">{totais.avaria}</b>
              </span>
            </div>
            {(divergente || comAvaria) && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {divergente && "Recebido diferente do declarado: vai gerar falta/excesso. "}
                  {comAvaria && "Avaria entra segregada e abre tarefa."}
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => receberMut.mutate()}
            disabled={!podeConfirmar}
          >
            {receberMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Registrar recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
