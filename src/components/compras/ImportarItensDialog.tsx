import { useRef, useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  parsearPlanilhaItens,
  type ResultadoParse,
} from "@/lib/compras/templateItens";
import type { ItemEdit } from "@/lib/compras/types";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

type Modo = "adicionar" | "substituir";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itensAtuais: ItemEdit[];
  onImportar: (novosItens: ItemEdit[], modo: Modo) => void;
}

export function ImportarItensDialog({ open, onOpenChange, itensAtuais, onImportar }: Props) {
  const [fileName, setFileName] = useState<string>("");
  const [resultado, setResultado] = useState<ResultadoParse | null>(null);
  const [modo, setModo] = useState<Modo>("adicionar");
  const [carregando, setCarregando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const limpar = () => {
    setFileName("");
    setResultado(null);
    setModo("adicionar");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) limpar();
    onOpenChange(v);
  };

  const handleFile = async (file: File) => {
    setCarregando(true);
    setResultado(null);
    setFileName(file.name);
    try {
      const res = await parsearPlanilhaItens(file);
      setResultado(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível ler o arquivo";
      toast.error(`Falha ao ler planilha: ${msg}`);
      setResultado({
        erroGlobal: "Arquivo corrompido ou formato não suportado. Envie um .xlsx ou .xls válido.",
        validas: [],
        invalidas: [],
      });
    } finally {
      setCarregando(false);
    }
  };

  const validas = resultado?.validas ?? [];
  const invalidas = resultado?.invalidas ?? [];
  const podeConfirmar = validas.length > 0 && !resultado?.erroGlobal;

  const confirmar = () => {
    if (!podeConfirmar) return;
    const baseOrdem =
      modo === "substituir"
        ? 0
        : itensAtuais.filter((i) => i._action !== "delete").length;
    const novos: ItemEdit[] = validas.map((v, idx) => ({
      descricao: v.descricao,
      quantidade: v.quantidade,
      valor_estimado_unitario: v.valor_estimado_unitario,
      urls: v.urls,
      especificacao_tecnica: v.especificacao_tecnica,
      ordem: baseOrdem + idx,
      _action: "create",
    }));
    onImportar(novos, modo);
    toast.success(`${novos.length} ${novos.length === 1 ? "item importado" : "itens importados"}`);
    if (invalidas.length > 0) {
      toast.warning(
        `${invalidas.length} ${invalidas.length === 1 ? "linha descartada" : "linhas descartadas"} por problemas de preenchimento.`,
      );
    }
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar itens de planilha</DialogTitle>
          <DialogDescription>
            Envie um arquivo .xlsx ou .xls seguindo o template. As linhas serão validadas antes de qualquer importação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Arquivo</Label>
            <Input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              disabled={carregando}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            {fileName && (
              <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                <FileSpreadsheet className="h-3 w-3" /> {fileName}
              </div>
            )}
          </div>

          {resultado?.erroGlobal && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>{resultado.erroGlobal}</div>
            </div>
          )}

          {resultado && !resultado.erroGlobal && (
            <>
              <div className="text-sm">
                <span className="font-semibold">{validas.length}</span>{" "}
                {validas.length === 1 ? "linha válida" : "linhas válidas"}
                {" · "}
                <span className={cn(invalidas.length > 0 && "text-destructive font-semibold")}>
                  {invalidas.length}
                </span>{" "}
                {invalidas.length === 1 ? "com problema" : "com problema"}
              </div>

              <div className="max-h-72 overflow-y-auto border rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2 text-left w-12">Linha</th>
                      <th className="p-2 text-left">Descrição / Problema</th>
                      <th className="p-2 text-right w-16">Qtd</th>
                      <th className="p-2 text-right w-24">Unit.</th>
                      <th className="p-2 text-right w-28">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validas.map((v) => (
                      <tr key={`v-${v.linhaPlanilha}`} className="border-t">
                        <td className="p-2 text-muted-foreground">{v.linhaPlanilha}</td>
                        <td className="p-2">{v.descricao}</td>
                        <td className="p-2 text-right">{v.quantidade}</td>
                        <td className="p-2 text-right">{fmtBRL(v.valor_estimado_unitario)}</td>
                        <td className="p-2 text-right font-medium">
                          {fmtBRL(v.quantidade * v.valor_estimado_unitario)}
                        </td>
                      </tr>
                    ))}
                    {invalidas.map((iv) => (
                      <tr
                        key={`i-${iv.linhaPlanilha}`}
                        className="border-t bg-destructive/10"
                      >
                        <td className="p-2 text-muted-foreground">{iv.linhaPlanilha}</td>
                        <td className="p-2 text-destructive" colSpan={4}>
                          {iv.erro}
                          {typeof iv.raw.descricao === "string" && iv.raw.descricao.trim() && (
                            <span className="text-muted-foreground">
                              {" "}· "{String(iv.raw.descricao).trim().slice(0, 60)}"
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {validas.length === 0 && invalidas.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-muted-foreground">
                          Nenhuma linha encontrada na planilha.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <Label className="mb-2 block">Como aplicar</Label>
                <RadioGroup value={modo} onValueChange={(v) => setModo(v as Modo)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="adicionar" id="modo-adicionar" />
                    <Label htmlFor="modo-adicionar" className="font-normal cursor-pointer">
                      Adicionar aos itens atuais
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="substituir" id="modo-substituir" />
                    <Label htmlFor="modo-substituir" className="font-normal cursor-pointer">
                      Substituir os itens atuais
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!podeConfirmar}
            onClick={confirmar}
            style={{ backgroundColor: "#1A4A3A", color: "white" }}
          >
            Importar {validas.length} {validas.length === 1 ? "item" : "itens"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
