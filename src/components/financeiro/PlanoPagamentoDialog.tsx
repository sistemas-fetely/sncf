import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

export interface PlanoDocInput {
  id: string;
  nf_numero: string | null;
  fornecedor: string | null;
  valor: number;
  data_vencimento: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  doc: PlanoDocInput;
  onDone?: () => void;
}

interface Parcela {
  valor: number;
  vencimento: string; // YYYY-MM-DD
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y, (m - 1) + months, d));
  // Corrige overflow (ex: 31/jan +1mês → 03/mar): volta pro último dia do mês alvo se estourou
  if (base.getUTCMonth() !== ((m - 1 + months) % 12 + 12) % 12) {
    base.setUTCDate(0);
  }
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function distribuir(total: number, n: number, primeiroVenc: string): Parcela[] {
  const parcela = round2(total / n);
  const arr: Parcela[] = [];
  let soma = 0;
  for (let i = 0; i < n; i++) {
    let v = parcela;
    if (i === n - 1) v = round2(total - soma);
    soma = round2(soma + v);
    arr.push({ valor: v, vencimento: addMonthsISO(primeiroVenc, i) });
  }
  return arr;
}

export default function PlanoPagamentoDialog({ open, onOpenChange, doc, onDone }: Props) {
  const primeiroVencInicial = doc.data_vencimento || todayISO();
  const [numParcelas, setNumParcelas] = useState(1);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [gerando, setGerando] = useState(false);

  const { data: existentes, isLoading } = useQuery({
    queryKey: ["plano-pagamento-existente", doc.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_pagar_receber")
        .select("id, numero_parcela, total_parcelas, valor, data_vencimento, status")
        .eq("nfs_stage_documento_id", doc.id)
        .is("deleted_at", null)
        .neq("status", "cancelado")
        .order("numero_parcela");
      if (error) throw error;
      return data || [];
    },
  });

  const jaTemPlano = (existentes?.length || 0) > 0;

  useEffect(() => {
    if (open && !jaTemPlano) {
      setNumParcelas(1);
      setParcelas(distribuir(doc.valor, 1, primeiroVencInicial));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jaTemPlano, doc.id]);

  function alterarNumParcelas(v: number) {
    const n = Math.max(1, Math.min(36, Math.floor(v || 1)));
    setNumParcelas(n);
    setParcelas(distribuir(doc.valor, n, primeiroVencInicial));
  }

  function alterarLinha(idx: number, patch: Partial<Parcela>) {
    setParcelas((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  const soma = useMemo(
    () => round2(parcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0)),
    [parcelas],
  );
  const bate = Math.abs(soma - doc.valor) < 0.01;
  const podeGerar =
    bate && parcelas.length > 0 && parcelas.every((p) => p.valor > 0 && !!p.vencimento);

  async function gerar() {
    setGerando(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id || null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("gerar_plano_pagamento", {
        p_stage_id: doc.id,
        p_parcelas: parcelas.map((p) => ({ valor: p.valor, vencimento: p.vencimento })),
        p_user_id: uid,
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.erro || "Falha ao gerar plano");
        return;
      }
      toast.success(`Plano gerado: ${data.parcelas_criadas} parcela(s)`);
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plano de pagamento</DialogTitle>
          <DialogDescription>
            NF {doc.nf_numero || "—"} · {doc.fornecedor || "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded border p-3 bg-muted/30 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Valor total do documento</div>
          <div className="text-lg font-semibold font-mono">{formatBRL(doc.valor)}</div>
        </div>

        {isLoading ? (
          <div className="py-6 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando…
          </div>
        ) : jaTemPlano ? (
          <div className="space-y-2">
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Plano já gerado para este documento.
            </div>
            <div className="border rounded divide-y">
              {existentes!.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {p.numero_parcela}/{p.total_parcelas}
                    </span>
                    <span>{formatDateBR(p.data_vencimento)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono">{formatBRL(Number(p.valor))}</span>
                    <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Label htmlFor="num-parc" className="text-sm">Nº de parcelas</Label>
              <Input
                id="num-parc"
                type="number"
                min={1}
                max={36}
                value={numParcelas}
                onChange={(e) => alterarNumParcelas(Number(e.target.value))}
                className="w-24 h-8"
              />
            </div>

            <div className="border rounded max-h-[320px] overflow-auto">
              {parcelas.map((p, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center px-3 py-2 border-b last:border-b-0">
                  <div className="col-span-2 text-xs font-mono text-muted-foreground">
                    {i + 1}/{parcelas.length}
                  </div>
                  <div className="col-span-5">
                    <Input
                      type="date"
                      value={p.vencimento}
                      onChange={(e) => alterarLinha(i, { vencimento: e.target.value })}
                      className="h-8"
                    />
                  </div>
                  <div className="col-span-5">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={p.valor}
                      onChange={(e) => alterarLinha(i, { valor: Number(e.target.value) || 0 })}
                      className="h-8 text-right font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div
              className={`text-sm flex items-center justify-between px-3 py-2 rounded border ${
                bate
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}
            >
              <span>Soma das parcelas</span>
              <span className="font-mono">
                {formatBRL(soma)} de {formatBRL(doc.valor)}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {jaTemPlano ? "Fechar" : "Cancelar"}
          </Button>
          {!jaTemPlano && (
            <Button onClick={gerar} disabled={!podeGerar || gerando}>
              {gerando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gerar plano
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
