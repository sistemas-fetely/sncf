import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEstoqueCondicoes } from "@/hooks/estoque/useEstoqueCondicoes";
import {
  useRegistrarRetornoDevolucao,
  type RegistrarRetornoResult,
} from "@/hooks/estoque/useRegistrarRetornoDevolucao";
import type { RetornoPendentePedido } from "@/hooks/estoque/useDevolucoesRetornoPendente";

const CENTRO_PADRAO = "XPM-SC";
const CONDICAO_PADRAO = "__default__";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedido: RetornoPendentePedido | null;
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

export function ConferirRetornoDialog({ open, onOpenChange, pedido }: Props) {
  const { data: condicoes = [] } = useEstoqueCondicoes();
  const registrar = useRegistrarRetornoDevolucao();

  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [conds, setConds] = useState<Record<string, string>>({});
  const [docNumero, setDocNumero] = useState("");
  const [obs, setObs] = useState("");
  const [data, setData] = useState(hojeISO());
  const [centro, setCentro] = useState(CENTRO_PADRAO);
  const [resultado, setResultado] = useState<RegistrarRetornoResult | null>(null);

  const chave = pedido?.pedido_id ?? "";
  const [chaveAtual, setChaveAtual] = useState("");
  if (open && chave && chave !== chaveAtual) {
    setChaveAtual(chave);
    setQtds({});
    setConds({});
    setDocNumero(pedido?.nf ?? "");
    setObs("");
    setData(hojeISO());
    setCentro(CENTRO_PADRAO);
    setResultado(null);
  }

  const linhasValidas = useMemo(() => {
    if (!pedido) return [];
    return pedido.itens
      .map((it) => {
        const raw = qtds[it.sku];
        const qtd = Number(raw);
        if (!raw || !Number.isFinite(qtd) || qtd <= 0) return null;
        const cond = conds[it.sku];
        return {
          sku: it.sku,
          qtd,
          condicao: !cond || cond === CONDICAO_PADRAO ? null : cond,
        };
      })
      .filter((x): x is { sku: string; qtd: number; condicao: string | null } => x !== null);
  }, [pedido, qtds, conds]);

  const unidadesInformadas = linhasValidas.reduce((s, l) => s + l.qtd, 0);
  const excedeAlguma = pedido
    ? pedido.itens.some((it) => {
        const q = Number(qtds[it.sku]);
        return Number.isFinite(q) && q > Number(it.qtd_pendente ?? 0);
      })
    : false;

  async function handleGravar() {
    if (!pedido || linhasValidas.length === 0) return;
    try {
      const res = await registrar.mutateAsync({
        pedido_id: pedido.pedido_id,
        rows: linhasValidas,
        doc_numero: docNumero.trim() || null,
        obs: obs.trim() || null,
        centro: centro.trim() || CENTRO_PADRAO,
        data: new Date(`${data}T12:00:00`).toISOString(),
      });
      setResultado(res);
      const unid = res.unidades ?? unidadesInformadas;
      const itens = res.itens ?? linhasValidas.length;
      toast.success(`Retorno registrado: ${itens} item(ns), ${unid} unidade(s)`);
      if (res.aviso) toast.warning(String(res.aviso), { duration: 10000 });
      setQtds({});
      setConds({});
    } catch (e) {
      toast.error(formatError(e));
    }

  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Conferir retorno de devolução</DialogTitle>
          <DialogDescription>
            Pedido {pedido?.id_externo ?? "—"}
            {pedido?.nf ? ` · NF de saída ${pedido.nf}` : ""} · retorno parcial é permitido.
          </DialogDescription>
        </DialogHeader>

        {resultado?.aviso && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Aviso do estoque</AlertTitle>
            <AlertDescription>{String(resultado.aviso)}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>NF de devolução</Label>
            <Input
              value={docNumero}
              onChange={(e) => setDocNumero(e.target.value)}
              placeholder="Número da NF de devolução"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Centro</Label>
            <Input value={centro} onChange={(e) => setCentro(e.target.value)} />
          </div>
        </div>

        <div className="rounded-md border max-h-[45vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right w-[80px]">Saiu</TableHead>
                <TableHead className="text-right w-[90px]">Já voltou</TableHead>
                <TableHead className="text-right w-[90px]">Pendente</TableHead>
                <TableHead className="w-[110px]">Voltou agora</TableHead>
                <TableHead className="w-[170px]">Condição</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pedido?.itens ?? []).map((it) => {
                const q = Number(qtds[it.sku]);
                const excede = Number.isFinite(q) && q > Number(it.qtd_pendente ?? 0);
                return (
                  <TableRow key={it.sku}>
                    <TableCell className="font-mono text-xs">{it.sku}</TableCell>
                    <TableCell className="text-sm">{it.nome_comercial ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(it.qtd_saiu ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(it.qtd_ja_retornada ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {Number(it.qtd_pendente ?? 0)}
                    </TableCell>
                    <TableCell>
                      <Input
                        inputMode="numeric"
                        className={excede ? "border-destructive" : undefined}
                        value={qtds[it.sku] ?? ""}
                        onChange={(e) =>
                          setQtds((prev) => ({ ...prev, [it.sku]: e.target.value }))
                        }
                        placeholder="0"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={conds[it.sku] ?? CONDICAO_PADRAO}
                        onValueChange={(v) => setConds((prev) => ({ ...prev, [it.sku]: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={CONDICAO_PADRAO}>Padrão (quarentena)</SelectItem>
                          {condicoes.map((c) => (
                            <SelectItem key={c.codigo} value={c.codigo}>
                              {c.rotulo}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-1.5">
          <Label>Observação</Label>
          <Textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Estado da mercadoria, embalagem, divergências…"
            rows={2}
          />
        </div>

        {excedeAlguma && (
          <p className="text-xs text-destructive">
            Há quantidade maior que a pendente. O banco vai recusar.
          </p>
        )}

        <DialogFooter>
          <span className="mr-auto text-xs text-muted-foreground">
            {linhasValidas.length} item(ns) · {unidadesInformadas} unidade(s)
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={registrar.isPending}>
            Fechar
          </Button>
          <Button
            onClick={handleGravar}
            disabled={linhasValidas.length === 0 || registrar.isPending}
            className="gap-2"
          >
            {registrar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar retorno
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
