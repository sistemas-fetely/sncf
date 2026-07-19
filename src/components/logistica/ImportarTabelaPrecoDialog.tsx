import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useImportarTabelaPreco } from "@/hooks/logistica/useTabelasPreco";

const COLUNAS_ZONA = [
  "tarifa_code",
  "uf",
  "zona_nome",
  "ate_10",
  "ate_20",
  "ate_35",
  "ate_50",
  "ate_70",
  "fpk",
  "fv_pct",
  "txa",
] as const;

interface ZonaParseada {
  linha: number;
  tarifa_code: string;
  uf: string;
  zona_nome: string;
  pesos: Record<string, number>;
  kg_adicional: number;
  fv_pct: number;
  txa: number;
  erros: string[];
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  const n2 = Number(String(v));
  return Number.isFinite(n2) ? n2 : null;
}

function numOpcional(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function ImportarTabelaPrecoDialog({
  open,
  onOpenChange,
  transportadoraId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transportadoraId: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState("");
  const [modal, setModal] = useState("rodoviario");
  const [vigenciaInicio, setVigenciaInicio] = useState("");
  const [vigenciaDescricao, setVigenciaDescricao] = useState("");

  // taxas globais
  const [grisPct, setGrisPct] = useState("");
  const [grisBase, setGrisBase] = useState<string>("frete");
  const [grisMinimo, setGrisMinimo] = useState("");
  const [admPct, setAdmPct] = useState("");
  const [txColeta, setTxColeta] = useState("");
  const [pedagio100kg, setPedagio100kg] = useState("");
  const [suframa, setSuframa] = useState("");
  const [tas, setTas] = useState("");

  const [zonas, setZonas] = useState<ZonaParseada[]>([]);
  const [fileName, setFileName] = useState("");

  const mut = useImportarTabelaPreco();

  const { validas, comErro } = useMemo(() => {
    let ok = 0;
    let err = 0;
    for (const z of zonas) (z.erros.length ? err++ : ok++);
    return { validas: ok, comErro: err };
  }, [zonas]);

  function reset() {
    setNome("");
    setModal("rodoviario");
    setVigenciaInicio("");
    setVigenciaDescricao("");
    setGrisPct("");
    setGrisBase("frete");
    setGrisMinimo("");
    setAdmPct("");
    setTxColeta("");
    setPedagio100kg("");
    setSuframa("");
    setTas("");
    setZonas([]);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(f: File) {
    setFileName(f.name);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const parsed: ZonaParseada[] = rows.map((r, i) => {
        const erros: string[] = [];
        const tarifa_code = String(r.tarifa_code ?? "").trim();
        const uf = String(r.uf ?? "").trim().toUpperCase();
        const zona_nome = String(r.zona_nome ?? "").trim();
        if (!tarifa_code) erros.push("tarifa_code vazio");
        if (!uf) erros.push("uf vazio");

        const pesos: Record<string, number> = {};
        for (const c of ["ate_10", "ate_20", "ate_35", "ate_50", "ate_70"]) {
          const n = toNum(r[c]);
          if (n === null) erros.push(`${c} inválido`);
          else pesos[c] = n;
        }
        const fpk = toNum(r.fpk);
        if (fpk === null) erros.push("fpk inválido");
        const fv = toNum(r.fv_pct);
        const txa = toNum(r.txa);

        return {
          linha: i + 2,
          tarifa_code,
          uf,
          zona_nome,
          pesos,
          kg_adicional: fpk ?? 0,
          fv_pct: fv ?? 0,
          txa: txa ?? 0,
          erros,
        };
      });
      setZonas(parsed);
    } catch (e) {
      toast.error("Falha ao ler arquivo: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function importar() {
    if (!nome.trim() || !vigenciaInicio || zonas.length === 0 || comErro > 0) return;

    const taxas: Record<string, unknown> = {};
    const gp = numOpcional(grisPct);
    if (gp !== null) taxas.gris_pct = gp;
    if (grisBase) taxas.gris_base = grisBase;
    const gm = numOpcional(grisMinimo);
    if (gm !== null) taxas.gris_minimo = gm;
    const ap = numOpcional(admPct);
    if (ap !== null) taxas.adm_pct = ap;
    const tc = numOpcional(txColeta);
    if (tc !== null) taxas.tx_coleta = tc;
    const p100 = numOpcional(pedagio100kg);
    if (p100 !== null) taxas.pedagio_por_100kg = p100;
    const sf = numOpcional(suframa);
    if (sf !== null) taxas.suframa = sf;
    const tt = numOpcional(tas);
    if (tt !== null) taxas.tas = tt;

    const zonasPayload = zonas.map((z) => ({
      tarifa_code: z.tarifa_code,
      uf: z.uf,
      zona_nome: z.zona_nome,
      pesos: z.pesos,
      kg_adicional: z.kg_adicional,
      fv_pct: z.fv_pct,
      txa: z.txa,
    }));

    try {
      const res = await mut.mutateAsync({
        transportadora_id: transportadoraId,
        nome: nome.trim(),
        modal,
        vigencia_inicio: vigenciaInicio,
        vigencia_descricao: vigenciaDescricao.trim() || null,
        taxas,
        zonas: zonasPayload,
      });
      toast.success(`${res.zonas_inseridas} zonas importadas`);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao importar: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  const podeImportar =
    !!nome.trim() &&
    !!vigenciaInicio &&
    zonas.length > 0 &&
    comErro === 0 &&
    !mut.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova versão de tabela de preço</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Nome *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Tabela 2026" />
            </div>
            <div>
              <Label>Modal</Label>
              <Select value={modal} onValueChange={setModal}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rodoviario">Rodoviário</SelectItem>
                  <SelectItem value="aereo">Aéreo</SelectItem>
                  <SelectItem value="expresso">Expresso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vigência início *</Label>
              <Input type="date" value={vigenciaInicio} onChange={(e) => setVigenciaInicio(e.target.value)} />
            </div>
            <div>
              <Label>Descrição da vigência</Label>
              <Input value={vigenciaDescricao} onChange={(e) => setVigenciaDescricao(e.target.value)} placeholder="Ex: Reajuste anual" />
            </div>
          </section>

          <section className="rounded-md border p-3 space-y-3">
            <div className="text-sm font-medium">Taxas globais (opcionais)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">GRIS %</Label>
                <Input value={grisPct} onChange={(e) => setGrisPct(e.target.value)} placeholder="0,30" />
              </div>
              <div>
                <Label className="text-xs">GRIS base</Label>
                <Select value={grisBase} onValueChange={setGrisBase}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="frete">Frete</SelectItem>
                    <SelectItem value="mercantil">Mercantil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">GRIS mínimo (R$)</Label>
                <Input value={grisMinimo} onChange={(e) => setGrisMinimo(e.target.value)} placeholder="5,00" />
              </div>
              <div>
                <Label className="text-xs">Adm %</Label>
                <Input value={admPct} onChange={(e) => setAdmPct(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label className="text-xs">Tx. coleta (R$)</Label>
                <Input value={txColeta} onChange={(e) => setTxColeta(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label className="text-xs">Pedágio /100kg (R$)</Label>
                <Input value={pedagio100kg} onChange={(e) => setPedagio100kg(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label className="text-xs">SUFRAMA (R$)</Label>
                <Input value={suframa} onChange={(e) => setSuframa(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label className="text-xs">TAS (R$)</Label>
                <Input value={tas} onChange={(e) => setTas(e.target.value)} placeholder="0,00" />
              </div>
            </div>
          </section>

          <section className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Planilha de zonas</div>
              <div className="text-xs text-muted-foreground">
                Colunas: {COLUNAS_ZONA.join(", ")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
            </div>

            {zonas.length > 0 && (
              <>
                <div className="flex items-center gap-3 text-sm">
                  <Badge className="bg-emerald-600 hover:bg-emerald-600">{validas} válidas</Badge>
                  {comErro > 0 && (
                    <Badge variant="destructive">
                      <AlertCircle className="h-3 w-3 mr-1" /> {comErro} com erro
                    </Badge>
                  )}
                </div>
                <div className="max-h-64 overflow-auto border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1">#</th>
                        <th className="text-left px-2 py-1">tarifa</th>
                        <th className="text-left px-2 py-1">uf</th>
                        <th className="text-left px-2 py-1">zona</th>
                        <th className="text-right px-2 py-1">≤10</th>
                        <th className="text-right px-2 py-1">≤70</th>
                        <th className="text-right px-2 py-1">fpk</th>
                        <th className="text-left px-2 py-1">erros</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zonas.map((z) => (
                        <tr key={z.linha} className={z.erros.length ? "bg-destructive/10" : "border-t"}>
                          <td className="px-2 py-1">{z.linha}</td>
                          <td className="px-2 py-1">{z.tarifa_code}</td>
                          <td className="px-2 py-1">{z.uf}</td>
                          <td className="px-2 py-1">{z.zona_nome}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{z.pesos.ate_10 ?? "—"}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{z.pesos.ate_70 ?? "—"}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{z.kg_adicional}</td>
                          <td className="px-2 py-1 text-destructive">{z.erros.join("; ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancelar
          </Button>
          <Button onClick={importar} disabled={!podeImportar}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
