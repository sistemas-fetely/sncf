import { useMemo } from "react";
import { Loader2, Upload, X } from "lucide-react";
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
    const naoDup = nfs.filter((n) => !n._duplicata).length;
    const sel = nfs.filter((n) => n._selecionada && !n._duplicata).length;
    const dup = nfs.filter((n) => n._duplicata).length;
    return { naoDup, sel, dup };
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
                    ) : (
                      <Badge className="bg-success hover:bg-success text-success-foreground">
                        Novo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
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
