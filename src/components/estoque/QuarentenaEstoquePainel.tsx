import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";

interface LinhaQuarentena {
  sku: string;
  centro: string;
  fiscal: number;
  ultimo_mov: string | null;
}

// Códigos reais de estoque_condicao (conferidos no banco): 'sadio' e 'nao_conforme' ativos; avaria ativa é 'avarias'.
const PARA_SADIO = "sadio";
const PARA_AVARIA = "avarias";
const PARA_NAO_CONFORME = "nao_conforme";

async function carregar(): Promise<{ linhas: LinhaQuarentena[]; nomes: Map<string, string> }> {
  const linhas: LinhaQuarentena[] = [];
  for (let de = 0; ; de += 1000) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("vw_estoque_posicao")
      .select("sku,centro,fiscal,ultimo_mov")
      .eq("condicao", "quarentena")
      .neq("fiscal", 0)
      .order("sku")
      .order("centro")
      .range(de, de + 999);
    if (error) throw error;
    linhas.push(...((data ?? []) as LinhaQuarentena[]));
    if ((data ?? []).length < 1000) break;
  }
  const nomes = new Map<string, string>();
  const skus = [...new Set(linhas.map((l) => l.sku))];
  for (let i = 0; i < skus.length; i += 200) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("sncf_produtos")
      .select("sku,nome_comercial")
      .in("sku", skus.slice(i, i + 200));
    if (error) throw error;
    for (const p of (data ?? []) as { sku: string; nome_comercial: string | null }[]) {
      if (p.nome_comercial) nomes.set(p.sku, p.nome_comercial);
    }
  }
  return { linhas, nomes };
}

const fmt = (n: number) => n.toLocaleString("pt-BR");
function fmtData(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export function QuarentenaEstoquePainel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["vw_estoque_posicao", "quarentena"], queryFn: carregar });
  const [alvo, setAlvo] = useState<{ linha: LinhaQuarentena; para: string } | null>(null);
  const [qtd, setQtd] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const linhas = q.data?.linhas ?? [];
  const totais = useMemo(
    () => ({ unidades: linhas.reduce((s, l) => s + Number(l.fiscal), 0), skus: new Set(linhas.map((l) => l.sku)).size }),
    [linhas],
  );

  function abrir(linha: LinhaQuarentena, para: string) {
    setAlvo({ linha, para });
    setQtd(String(linha.fiscal));
    setObs("");
  }

  const qtdNum = Number(qtd.replace(",", "."));
  const qtdValida = alvo != null && Number.isFinite(qtdNum) && qtdNum > 0 && qtdNum <= Number(alvo.linha.fiscal);

  async function confirmar() {
    if (!alvo || !qtdValida) return;
    setSalvando(true);
    try {
      const { error } = await supabase.rpc("reclassificar_condicao_estoque" as never, {
        p_sku: alvo.linha.sku,
        p_centro: alvo.linha.centro,
        p_de: "quarentena",
        p_para: alvo.para,
        p_quantidade: qtdNum,
        p_obs: obs.trim() || null,
      } as never);
      if (error) throw error;
      await qc.invalidateQueries({
        predicate: (x) => typeof x.queryKey[0] === "string" && (x.queryKey[0] as string).startsWith("vw_estoque"),
      });
      toast.success(alvo.para === PARA_SADIO ? "Liberado para venda" : alvo.para === PARA_NAO_CONFORME ? "Marcado como não conforme" : "Marcado como avaria");
      setAlvo(null);
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:max-w-md">
        <div className="rounded-md border bg-card p-3">
          <span className="text-[11px] text-muted-foreground">Unidades em quarentena</span>
          <div className="text-[21px] font-medium tabular-nums">{q.isSuccess ? fmt(totais.unidades) : "—"}</div>
        </div>
        <div className="rounded-md border bg-card p-3">
          <span className="text-[11px] text-muted-foreground">SKUs</span>
          <div className="text-[21px] font-medium tabular-nums">{q.isSuccess ? fmt(totais.skus) : "—"}</div>
        </div>
      </div>

      {q.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Falha ao carregar a quarentena: {formatError(q.error)}
        </div>
      )}

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
      ) : q.isSuccess && linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma mercadoria em quarentena.</p>
      ) : q.isSuccess ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Centro</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead>Último movimento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={`${l.sku}|${l.centro}`}>
                  <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                  <TableCell className="text-sm">{q.data?.nomes.get(l.sku) ?? "—"}</TableCell>
                  <TableCell className="text-sm">{l.centro}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(Number(l.fiscal))}</TableCell>
                  <TableCell className="text-sm">{fmtData(l.ultimo_mov)}</TableCell>
                  <TableCell className="text-right space-x-2 whitespace-nowrap">
                    <Button size="sm" variant="outline" onClick={() => abrir(l, PARA_SADIO)}>Liberar p/ venda</Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => abrir(l, PARA_AVARIA)}>Marcar avaria</Button>
                    <Button size="sm" variant="outline" onClick={() => abrir(l, PARA_NAO_CONFORME)}>Não conforme</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={!!alvo} onOpenChange={(v) => { if (!v && !salvando) setAlvo(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{alvo?.para === PARA_SADIO ? "Liberar para venda" : alvo?.para === PARA_NAO_CONFORME ? "Marcar não conforme" : "Marcar avaria"}</DialogTitle>
            <DialogDescription>
              {alvo?.linha.sku} · {alvo?.linha.centro} · saldo em quarentena {alvo ? fmt(Number(alvo.linha.fiscal)) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Quantidade</Label>
              <Input type="number" min={1} max={alvo?.linha.fiscal} value={qtd} onChange={(e) => setQtd(e.target.value)} disabled={salvando} />
              {!qtdValida && <p className="text-xs text-destructive">Informe de 1 até o saldo da linha.</p>}
            </div>
            <div className="space-y-1">
              <Label>Observação (opcional)</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} disabled={salvando} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvo(null)} disabled={salvando}>Cancelar</Button>
            <Button onClick={() => void confirmar()} disabled={!qtdValida || salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
