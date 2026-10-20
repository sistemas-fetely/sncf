import { useEffect, useMemo, useRef, useState } from "react";
import { useCodigoProdutoMap } from "@/hooks/useCodigoProdutoMap";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ScanBarcode, Undo2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatError } from "@/lib/format-error";

export interface LeituraCodigo { sku: string; unidades: number }
interface Codigo { sku: string; unidades: number | null; tipo: string | null }

/** Normaliza código de barras: só dígitos, sem zeros à esquerda. */
export function normalizarCodigo(c: string | null | undefined): string {
  return (c ?? "").trim().replace(/\D/g, "").replace(/^0+/, "");
}

let audioCtx: AudioContext | null = null;
function bip(agudo: boolean) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = agudo ? "sine" : "square";
    o.frequency.value = agudo ? 1400 : 220;
    g.gain.value = 0.08;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + (agudo ? 0.08 : 0.25));
  } catch { /* som é acessório */ }
}

interface Props {
  onLeitura: (l: LeituraCodigo) => void;
  onDesfazer: (l: LeituraCodigo) => void;
  validarSku?: (sku: string) => string | null;
  autoFocus?: boolean;
}

export function LeitorCodigoBarras({ onLeitura, onDesfazer, validarSku, autoFocus = true }: Props) {
  const [codigo, setCodigo] = useState("");
  const [qtd, setQtd] = useState("1");
  const [historico, setHistorico] = useState<LeituraCodigo[]>([]);
  const [caixa, setCaixa] = useState<{ sku: string; codigo: string; mult: number } | null>(null);
  const [pecasCaixa, setPecasCaixa] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const { resolver: resolverCod } = useCodigoProdutoMap();

  const codigosQ = useQuery({
    queryKey: ["vw_codigo_barras"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const mapa = new Map<string, Codigo>();
      const passo = 1000;
      for (let de = 0; ; de += passo) {
        const { data, error } = await supabase
          .from("vw_codigo_barras").select("codigo,sku,unidades,tipo").range(de, de + passo - 1);
        if (error) throw error;
        (data ?? []).forEach((r) => {
          const k = normalizarCodigo(r.codigo);
          if (k && r.sku) mapa.set(k, { sku: r.sku, unidades: r.unidades == null ? null : Number(r.unidades), tipo: r.tipo });
        });
        if (!data || data.length < passo) break;
      }
      return mapa;
    },
  });

  useEffect(() => {
    if (codigosQ.isError) toast.error(`Falha ao carregar códigos de barras: ${formatError(codigosQ.error)}`);
  }, [codigosQ.isError, codigosQ.error]);

  const focar = () => setTimeout(() => ref.current?.focus(), 0);
  useEffect(() => { if (autoFocus) focar(); }, [autoFocus]);

  const multiplicador = () => {
    const m = Math.floor(Number(qtd));
    return isNaN(m) || m < 1 ? 1 : m;
  };

  function aceitar(sku: string, unidades: number) {
    const l = { sku, unidades };
    onLeitura(l);
    setHistorico((h) => [...h, l]);
    bip(true);
  }

  function ler() {
    const bruto = codigo;
    const k = normalizarCodigo(bruto);
    setCodigo("");
    const mult = multiplicador();
    setQtd("1");
    if (!k) { focar(); return; }
    const mapa = codigosQ.data;
    // Fallback: cod_cadastro ou SKU digitado (sem código de barras) resolve para o SKU, 1 peça.
    const viaCadastro = resolverCod(bruto);
    const c = mapa?.get(k) ?? (viaCadastro.cadastrado && viaCadastro.sku ? { sku: viaCadastro.sku, unidades: 1, tipo: "sku" } : undefined);
    if (!c) {
      toast.error(`Código ${bruto.trim()} não cadastrado`);
      bip(false); focar(); return;
    }
    const recusa = validarSku?.(c.sku) ?? null;
    if (recusa) { toast.error(recusa); bip(false); focar(); return; }
    if (c.tipo === "dun" && (c.unidades == null || c.unidades <= 0)) {
      setPecasCaixa("");
      setCaixa({ sku: c.sku, codigo: bruto.trim(), mult });
      return;
    }
    aceitar(c.sku, (c.tipo === "dun" ? Number(c.unidades) : 1) * mult);
    focar();
  }

  function confirmarCaixa() {
    if (!caixa) return;
    const p = Math.floor(Number(pecasCaixa));
    if (isNaN(p) || p < 1) { toast.error("Informe quantas peças tem a caixa"); return; }
    aceitar(caixa.sku, p * caixa.mult);
    setCaixa(null);
    focar();
  }

  function desfazer() {
    const ult = historico[historico.length - 1];
    if (!ult) return;
    onDesfazer(ult);
    setHistorico((h) => h.slice(0, -1));
    focar();
  }

  const pecas = useMemo(() => historico.reduce((s, l) => s + l.unidades, 0), [historico]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
      <div className="relative">
        <ScanBarcode className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={ref}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ler(); } }}
          placeholder={codigosQ.isLoading ? "Carregando códigos…" : "Bipar código"}
          aria-label="Bipar código"
          disabled={codigosQ.isLoading}
          className="h-9 w-[240px] pl-8 font-mono"
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-sm text-muted-foreground">×</span>
        <Input
          type="number" min={1} step={1} value={qtd}
          onChange={(e) => setQtd(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focar(); } }}
          aria-label="Quantidade por leitura"
          className="h-9 w-16 text-right tabular-nums"
        />
      </div>
      {codigosQ.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      <Button type="button" variant="outline" size="sm" onClick={desfazer} disabled={historico.length === 0}>
        <Undo2 className="mr-1 h-4 w-4" /> Desfazer último
      </Button>
      <span className="ml-auto text-sm text-muted-foreground tabular-nums">
        {historico.length} leituras · {pecas} peças
      </span>

      <Dialog open={!!caixa} onOpenChange={(o) => { if (!o) { setCaixa(null); focar(); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Quantas peças tem esta caixa?</DialogTitle>
            <DialogDescription>Código {caixa?.codigo} · {caixa?.sku}{caixa && caixa.mult > 1 ? ` · × ${caixa.mult} caixas` : ""}</DialogDescription>
          </DialogHeader>
          <Input
            type="number" min={1} step={1} autoFocus value={pecasCaixa}
            onChange={(e) => setPecasCaixa(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmarCaixa(); } }}
            aria-label="Peças por caixa"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCaixa(null); focar(); }}>Cancelar</Button>
            <Button onClick={confirmarCaixa}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LeitorCodigoBarras;
