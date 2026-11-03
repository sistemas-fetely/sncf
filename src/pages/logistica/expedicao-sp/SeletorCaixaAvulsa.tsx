import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DimCaixaTexto } from "@/lib/logistica/caixaEmbalagem";
import type { CaixaAtiva } from "./useMesaSp";

/**
 * MESA-SP-CAIXA-OBRIGATORIA: escolha da caixa usada — qualquer caixa ativa do cadastro
 * ou "Caixa avulsa" com C × L × A. Usado na Embalagem (quando a regra não sugere) e
 * no "Corrigir embalagem" da estação Documentos.
 */
export function SeletorCaixaAvulsa({
  caixas, codigo, avulsa, onCodigo, onAvulsa, mostrarCadastro = true,
}: {
  caixas: CaixaAtiva[];
  codigo: string | null;
  avulsa: DimCaixaTexto | null;
  onCodigo: (c: string | null) => void;
  onAvulsa: (d: DimCaixaTexto | null) => void;
  mostrarCadastro?: boolean;
}) {
  const btn = (ativo: boolean) => cn(
    "rounded-md border p-3 text-left transition-colors",
    ativo ? "border-success bg-success/10" : "border-border bg-card hover:border-foreground/30",
  );
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        {mostrarCadastro && caixas.map((c) => (
          <button key={c.codigo} type="button" aria-pressed={codigo === c.codigo} className={btn(codigo === c.codigo)}
            onClick={() => { onCodigo(c.codigo); onAvulsa(null); }}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold">{c.codigo}</span>
              <span className="truncate text-xs text-muted-foreground">{c.nome}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{c.comprimento_cm} x {c.largura_cm} x {c.altura_cm} cm</p>
          </button>
        ))}
        <button type="button" aria-pressed={avulsa !== null} className={btn(avulsa !== null)}
          onClick={() => { onCodigo(null); onAvulsa(avulsa ?? { c: "", l: "", a: "" }); }}>
          <span className="text-sm font-semibold">Caixa avulsa</span>
          <p className="mt-1 text-xs text-muted-foreground">fora do cadastro — informe C × L × A</p>
        </button>
      </div>
      {avulsa !== null && (
        <div className="flex flex-wrap items-center gap-2">
          {(["c", "l", "a"] as const).map((k, i) => (
            <div key={k} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground">×</span>}
              <Input inputMode="decimal" className="h-8 w-20" aria-label={{ c: "Comprimento (cm)", l: "Largura (cm)", a: "Altura (cm)" }[k]}
                placeholder={{ c: "C", l: "L", a: "A" }[k]} value={avulsa[k]}
                onChange={(e) => onAvulsa({ ...avulsa, [k]: e.target.value })} />
            </div>
          ))}
          <span className="text-xs text-muted-foreground">cm</span>
        </div>
      )}
    </div>
  );
}
