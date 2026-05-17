import { useMemo } from "react";
import { Loader2, Upload, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import type { NFParsed } from "@/lib/financeiro/types";
import { cn } from "@/lib/utils";

interface Props {
  nfs: NFParsed[];
  onChange: (nfs: NFParsed[]) => void;
  onImport: () => void | Promise<void>;
  importing: boolean;
}

const TIPO_DOC_OPTIONS = [
  { value: "nfe", label: "NF-e" },
  { value: "nfse", label: "NFS-e" },
  { value: "recibo", label: "Recibo" },
  { value: "boleto", label: "Boleto" },
] as const;

function tipoArquivo(nf: NFParsed): "XML" | "PDF" {
  const src = (nf as any)._source as string | undefined;
  if (src?.includes("pdf")) return "PDF";
  if (src?.includes("xml")) return "XML";
  const name = nf._arquivo?.name?.toLowerCase() || "";
  if (name.endsWith(".pdf")) return "PDF";
  return "XML";
}

export function PreviewNFsImportSimples({ nfs, onChange, onImport, importing }: Props) {
  const totals = useMemo(() => {
    const naoDup = nfs.filter((n) => !n._duplicata && !n._ja_existe).length;
    const sel = nfs.filter((n) => n._selecionada && !n._duplicata && !n._ja_existe).length;
    const dup = nfs.filter((n) => n._duplicata).length;
    const jaExiste = nfs.filter((n) => n._ja_existe).length;
    return { naoDup, sel, dup, jaExiste };
  }, [nfs]);

  if (nfs.length === 0) return null;

  function toggle(idx: number, value: boolean) {
    const next = nfs.map((nf, i) => (i === idx ? { ...nf, _selecionada: value } : nf));
    onChange(next);
  }

  function toggleAll(value: boolean) {
    const next = nfs.map((nf) => (nf._duplicata ? nf : { ...nf, _selecionada: value }));
    onChange(next);
  }

  function clearAll() {
    onChange([]);
  }

  function setTipo(idx: number, tipo: string) {
    const next = nfs.map((nf, i) =>
      i === idx ? { ...nf, tipo_documento: tipo, confianca: "alta" as const } : nf
    );
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{totals.sel}</span> selecionadas de{" "}
          <span className="font-medium text-foreground">{totals.naoDup}</span>
          {totals.dup > 0 && (
            <span className="ml-2 text-destructive">
              ({totals.dup} duplicata{totals.dup === 1 ? "" : "s"})
            </span>
          )}
          {totals.jaExiste > 0 && (
            <span className="ml-2 text-slate-500">
              ({totals.jaExiste} já existente{totals.jaExiste === 1 ? "" : "s"})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={clearAll} disabled={importing}>
            <X className="h-4 w-4 mr-1" />
            Limpar
          </Button>
          <Button
            onClick={() => onImport()}
            disabled={totals.sel === 0 || importing}
            className="bg-admin hover:bg-admin/90 text-admin-foreground"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Importar para Stage
          </Button>
        </div>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={totals.sel > 0 && totals.sel === totals.naoDup}
                  onCheckedChange={(v) => toggleAll(!!v)}
                  aria-label="Selecionar todas"
                />
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>NF nº</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Arquivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nfs.map((nf, i) => {
              const tipo = tipoArquivo(nf);
              const ehBoleto = nf.tipo_documento === "boleto";
              return (
                <TableRow key={i} className={cn(nf._duplicata && "opacity-60")}>
                  <TableCell>
                    <Checkbox
                      checked={!!nf._selecionada}
                      disabled={!!nf._duplicata}
                      onCheckedChange={(v) => toggle(i, !!v)}
                    />
                  </TableCell>
                  <TableCell>
                    {nf._duplicata ? (
                      <Badge variant="destructive">Duplicata</Badge>
                    ) : nf._ambigua ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 text-amber-600" />
                          <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Ambígua</Badge>
                        </div>
                        {nf._candidatos_match?.[0] && (
                          <span
                            className="text-[10px] text-amber-700 cursor-help"
                            title={nf._candidatos_match
                              .map(
                                (c) =>
                                  `Score ${c.score}/4 — ${c.fornecedor} · NF ${c.nf_numero}${c.parcela ? ` (${c.parcela})` : ""} · R$ ${c.valor.toFixed(2)}`,
                              )
                              .join("\n")}
                          >
                            já existe NF {nf._candidatos_match[0].nf_numero}
                            {nf._candidatos_match[0].parcela
                              ? ` (${nf._candidatos_match[0].parcela})`
                              : ""}
                          </span>
                        )}
                  </div>
                ) : nf._ja_existe ? (
                  <Badge className="bg-slate-400 hover:bg-slate-400 text-white">Já existe</Badge>
                ) : (
                  <Badge className="bg-success hover:bg-success text-success-foreground">
                    Novo
                  </Badge>
                )}
                  </TableCell>
                  <TableCell>
                    {nf.confianca === "baixa" && !nf._duplicata ? (
                      <div className="flex flex-col gap-1">
                        <select
                          value={nf.tipo_documento || "recibo"}
                          onChange={(e) => setTipo(i, e.target.value)}
                          className="text-xs border rounded px-1.5 py-0.5 bg-background text-amber-700 border-amber-400 cursor-pointer"
                          title="Tipo não identificado com certeza — confirme"
                        >
                          {TIPO_DOC_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <span className="text-[10px] text-amber-600">confirme o tipo</span>
                      </div>
                    ) : ehBoleto ? (
                      <div className="flex items-center gap-1.5">
                        <Badge className="bg-blue-600 hover:bg-blue-600 text-white">BOLETO</Badge>
                        {nf.numero_parcela && nf.total_parcelas && (
                          <Badge variant="outline" className="text-[10px]">
                            {nf.numero_parcela}/{nf.total_parcelas}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <Badge
                        variant="outline"
                        className={cn(
                          tipo === "XML"
                            ? "border-admin text-admin"
                            : "border-muted-foreground text-muted-foreground",
                        )}
                      >
                        {tipo}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {nf.fornecedor_nome || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {nf.fornecedor_cnpj || "—"}
                  </TableCell>
                  <TableCell>{nf.nf_numero || "—"}</TableCell>
                  <TableCell>{formatDateBR(nf.nf_data_emissao)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatBRL(nf.valor)}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                    {nf._arquivo?.name || "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
