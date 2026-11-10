import { useState } from "react";
import { CodProduto } from "@/components/produto/CodProduto";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { queryCodigosBarras } from "@/hooks/estoque/useResolverCodigoBarras";
import { resolverCodigoBarras, unidadesCodigoBarras, type IndiceBarras } from "@/lib/estoque/resolverCodigoBarras";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatError } from "@/lib/format-error";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ModoImportacao = "somar" | "substituir";
interface LinhaPrevia { linha: number; codigo: string; quantidade: string; sku?: string; qtd?: number; via?: string; erro?: string }

const COLS_COD = ["codigo", "código", "ean", "sku", "cod"];
const COLS_QTD = ["quantidade", "qtd", "qtde"];

function baixarModelo() {
  const ws = XLSX.utils.aoa_to_sheet([["codigo", "quantidade"], ["7890000000000", 10], ["01561", 2]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventario");
  XLSX.writeFile(wb, "modelo_inventario.xlsx");
}

export function resolverContagemImportada(brutas: { linha: number; codigo: string; quantidade: string }[], indice: IndiceBarras): LinhaPrevia[] {
  return brutas.map((b) => {
    const q = Number(String(b.quantidade).replace(",", "."));
    if (!b.codigo) return { ...b, erro: "Código vazio" };
    if (!Number.isFinite(q) || q < 0 || !Number.isInteger(q)) return { ...b, erro: "Quantidade inválida" };
    const codigo = resolverCodigoBarras(b.codigo, indice);
    if (!codigo) return { ...b, erro: "Código não encontrado" };
    const unidades = unidadesCodigoBarras(codigo, q);
    if (unidades === null) return { ...b, erro: "Caixa (DUN) sem conteúdo definido — informe unidades por EAN, cód. ou SKU" };
    return { ...b, sku: codigo.sku, qtd: unidades, via: codigo.tipo === "dun" ? `DUN × ${codigo.innerQtd}` : codigo.tipo.toUpperCase() };
  });
}

export function ImportarContagemDialog({ onAplicar }: { onAplicar: (itens: { sku: string; qtd: number }[], modo: ModoImportacao) => void }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [previa, setPrevia] = useState<LinhaPrevia[] | null>(null);
  const [modo, setModo] = useState<ModoImportacao>("somar");

  async function ler(f: File) {
    setCarregando(true); setPrevia(null);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
      if (!rows.length) throw new Error("Planilha vazia");
      const chaves = Object.keys(rows[0]);
      const achar = (lista: string[]) => chaves.find((k) => lista.includes(k.trim().toLowerCase()));
      const kc = achar(COLS_COD); const kq = achar(COLS_QTD);
      if (!kc || !kq) throw new Error("A planilha precisa das colunas \"codigo\" (ou ean/sku/cod) e \"quantidade\"");
      const brutas = rows.map((r, i) => ({ linha: i + 2, codigo: String(r[kc] ?? "").trim(), quantidade: String(r[kq] ?? "").trim() }))
        .filter((b) => b.codigo || b.quantidade);
      setPrevia(resolverContagemImportada(brutas, await qc.ensureQueryData(queryCodigosBarras)));
    } catch (e) {
      toast.error(`Falha ao ler planilha: ${formatError(e)}`);
    } finally { setCarregando(false); }
  }

  const ok = (previa ?? []).filter((p) => !p.erro);
  const erros = (previa ?? []).filter((p) => p.erro);

  function aplicar() {
    const agg = new Map<string, number>();
    ok.forEach((p) => { if (p.sku && p.qtd != null) agg.set(p.sku, (agg.get(p.sku) ?? 0) + p.qtd); });
    onAplicar([...agg.entries()].map(([sku, qtd]) => ({ sku, qtd })), modo);
    toast.success(`${agg.size} produtos preenchidos — revise e clique em Registrar contagem`);
    setAberto(false); setPrevia(null);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}><FileSpreadsheet className="mr-1 h-4 w-4" /> Importar planilha</Button>
      <Dialog open={aberto} onOpenChange={(o) => { setAberto(o); if (!o) setPrevia(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar planilha de contagem</DialogTitle>
            <DialogDescription>
              Colunas: <span className="font-mono">codigo</span> (EAN, DUN, SKU ou código de cadastro) e <span className="font-mono">quantidade</span>.{" "}
              <button type="button" className="underline" onClick={baixarModelo}>Baixar modelo</button>
            </DialogDescription>
          </DialogHeader>
          <Input type="file" accept=".xlsx,.xls,.csv" aria-label="Arquivo da planilha" onChange={(e) => { const f = e.target.files?.[0]; if (f) void ler(f); e.target.value = ""; }} />
          {carregando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo…</div>}
          {previa && (
            <div className="space-y-3">
              <p className="text-sm"><span className="font-medium text-success">{ok.length} linhas OK</span> · <span className={erros.length ? "font-medium text-destructive" : "text-muted-foreground"}>{erros.length} com erro</span></p>
              <div className="max-h-72 overflow-auto rounded-md border">
                <Table className="text-[12px]">
                  <TableHeader><TableRow><TableHead>Linha</TableHead><TableHead>Código</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead>Resultado</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {[...erros, ...ok].map((p) => (
                      <TableRow key={p.linha}>
                        <TableCell className="tabular-nums">{p.linha}</TableCell>
                        <TableCell className="font-mono">{p.codigo || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.qtd ?? p.quantidade}</TableCell>
                        <TableCell className={p.erro ? "text-destructive" : ""}>{p.erro ?? <span className="inline-flex items-center gap-1"><CodProduto chave={p.sku} variant="compacto" /> · {p.via}</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <RadioGroup value={modo} onValueChange={(v) => setModo(v as ModoImportacao)} className="flex gap-4">
                <div className="flex items-center gap-2"><RadioGroupItem value="somar" id="m-somar" /><Label htmlFor="m-somar">Somar ao que já foi contado</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="substituir" id="m-subst" /><Label htmlFor="m-subst">Substituir</Label></div>
              </RadioGroup>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button disabled={!ok.length} onClick={aplicar}>Aplicar {ok.length ? `(${ok.length})` : ""}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
