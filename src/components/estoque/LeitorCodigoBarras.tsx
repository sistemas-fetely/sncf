import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ScanBarcode, Undo2, Loader2 } from "lucide-react";
import { useResolverCodigoBarras } from "@/hooks/estoque/useResolverCodigoBarras";
import { normalizarGtin, unidadesCodigoBarras } from "@/lib/estoque/resolverCodigoBarras";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { sugerirProdutos, type ProdutoCatalogo } from "@/lib/estoque/contagemSessao";

export interface LeituraCodigo { sku: string; unidades: number }
export const normalizarCodigo = normalizarGtin;

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
  /** Catálogo para sugestões por nome/código quando o texto tem letras. */
  catalogo?: ProdutoCatalogo[];
  grande?: boolean;
  placeholder?: string;
}

export function LeitorCodigoBarras({ onLeitura, onDesfazer, validarSku, autoFocus = true, catalogo, grande = false, placeholder }: Props) {
  const [codigo, setCodigo] = useState("");
  const [qtd, setQtd] = useState("1");
  const [historico, setHistorico] = useState<LeituraCodigo[]>([]);
  const [caixa, setCaixa] = useState<{ sku: string; codigo: string; mult: number } | null>(null);
  const [pecasCaixa, setPecasCaixa] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const [ativo, setAtivo] = useState(-1);
  const sugestoes = useMemo(() => (catalogo ? sugerirProdutos(catalogo, codigo) : []), [catalogo, codigo]);
  const codigosQ = useResolverCodigoBarras();

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
    setCodigo("");
    const mult = multiplicador();
    setQtd("1");
    if (!bruto.trim()) { focar(); return; }
    const c = codigosQ.resolver(bruto);
    if (!c) {
      toast.error(`Código não encontrado: ${bruto.trim()}`);
      bip(false); focar(); return;
    }
    const recusa = validarSku?.(c.sku) ?? null;
    if (recusa) { toast.error(recusa); bip(false); focar(); return; }
    const unidades = unidadesCodigoBarras(c, mult);
    if (unidades === null) {
      setPecasCaixa("");
      setCaixa({ sku: c.sku, codigo: bruto.trim(), mult });
      return;
    }
    aceitar(c.sku, unidades);
    focar();
  }

  function escolher(p: ProdutoCatalogo) {
    const mult = multiplicador();
    setCodigo(""); setQtd("1"); setAtivo(-1);
    const recusa = validarSku?.(p.sku) ?? null;
    if (recusa) { toast.error(recusa); bip(false); focar(); return; }
    aceitar(p.sku, mult);
    focar();
  }

  function teclar(e: KeyboardEvent<HTMLInputElement>) {
    if (sugestoes.length > 0 && e.key === "ArrowDown") { e.preventDefault(); setAtivo((a) => Math.min(sugestoes.length - 1, a + 1)); return; }
    if (sugestoes.length > 0 && e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(-1, a - 1)); return; }
    if (e.key === "Escape") { setAtivo(-1); setCodigo(""); return; }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (ativo >= 0 && sugestoes[ativo]) { escolher(sugestoes[ativo]); return; }
    // Código/SKU exato tem prioridade; sem correspondência e com sugestões, usa a primeira.
    const exato = codigosQ.resolver(codigo);
    if (!exato && sugestoes.length > 0) { escolher(sugestoes[0]); return; }
    setAtivo(-1);
    ler();
  }

  function confirmarCaixa() {
    if (!caixa) return;
    const p = Math.floor(Number(pecasCaixa));
    if (isNaN(p) || p < 1) { toast.error("Informe quantas peças tem a caixa"); return; }
    aceitar(caixa.sku, p);
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
          onChange={(e) => { setCodigo(e.target.value); setAtivo(-1); }}
          onKeyDown={teclar}
          placeholder={codigosQ.isLoading ? "Carregando códigos…" : placeholder ?? "Bipar código"}
          aria-label="Bipar código"
          aria-expanded={sugestoes.length > 0}
          autoComplete="off"
          disabled={codigosQ.isLoading}
          className={cn(grande ? "h-12 w-[min(520px,80vw)] pl-9 text-base" : "h-9 w-[240px] pl-8 font-mono")}
        />
        {sugestoes.length > 0 && (
          <ul role="listbox" className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
            {sugestoes.map((p, i) => (
              <li
                key={p.sku} role="option" aria-selected={i === ativo}
                onMouseDown={(e) => { e.preventDefault(); escolher(p); }}
                onMouseEnter={() => setAtivo(i)}
                className={cn("flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-sm", i === ativo && "bg-accent text-accent-foreground")}
              >
                <span className="font-mono text-xs text-muted-foreground">{p.cod_cadastro ?? p.sku}</span>
                <span className="truncate">{p.nome_comercial ?? p.sku}</span>
                {p.cor_nome && <span className="truncate text-xs text-muted-foreground">{p.cor_nome}</span>}
              </li>
            ))}
          </ul>
        )}
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
            <DialogTitle>Quantas unidades contar?</DialogTitle>
            <DialogDescription>Código {caixa?.codigo} · {caixa?.sku}{caixa && caixa.mult > 1 ? ` · × ${caixa.mult} caixas` : ""}</DialogDescription>
          </DialogHeader>
          <Input
            type="number" min={1} step={1} autoFocus value={pecasCaixa}
            onChange={(e) => setPecasCaixa(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmarCaixa(); } }}
            aria-label="Total de unidades"
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
