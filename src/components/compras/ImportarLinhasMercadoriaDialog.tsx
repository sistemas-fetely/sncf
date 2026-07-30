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
import { AlertTriangle, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  parsearPlanilhaMercadoria,
  linhasParaTexto,
  type ResultadoParseMercadoria,
} from "@/lib/compras/templatePedidoMercadoria";

type Modo = "substituir" | "adicionar";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  temTextoAtual: boolean;
  onImportar: (texto: string, modo: Modo) => void;
}

export default function ImportarLinhasMercadoriaDialog({
  open,
  onOpenChange,
  temTextoAtual,
  onImportar,
}: Props) {
  const [fileName, setFileName] = useState("");
  const [resultado, setResultado] = useState<ResultadoParseMercadoria | null>(null);
  const [modo, setModo] = useState<Modo>("substituir");
  const [carregando, setCarregando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const limpar = () => {
    setFileName("");
    setResultado(null);
    setModo("substituir");
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
      const res = await parsearPlanilhaMercadoria(file);
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
    onImportar(linhasParaTexto(validas), modo);
    toast.success(
      `${validas.length} ${validas.length === 1 ? "linha levada" : "linhas levadas"} para o campo de linhas.`,
    );
    if (invalidas.length > 0) {
      toast.warning(
        `${invalidas.length} ${invalidas.length === 1 ? "linha descartada" : "linhas descartadas"}.`,
      );
    }
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar linhas de planilha</DialogTitle>
          <DialogDescription>
            Colunas <code>codigo_fornecedor</code>, <code>quantidade</code> e{" "}
            <code>preco_unitario</code>. As linhas lidas preenchem o campo de linhas — o fluxo de
            Conferir e Gravar continua o mesmo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
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
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <FileSpreadsheet className="h-3 w-3" /> {fileName}
              </div>
            )}
          </div>

          {carregando && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lendo planilha...
            </div>
          )}

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
                descartada(s)
              </div>

              <div className="max-h-72 overflow-y-auto border rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2 text-left w-16">Linha</th>
                      <th className="p-2 text-left">Código / Problema</th>
                      <th className="p-2 text-right w-24">Qtd</th>
                      <th className="p-2 text-right w-28">Preço unit.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validas.map((v) => (
                      <tr key={`v-${v.linhaPlanilha}`} className="border-t">
                        <td className="p-2 text-muted-foreground">{v.linhaPlanilha}</td>
                        <td className="p-2 font-mono">{v.codigo}</td>
                        <td className="p-2 text-right">{v.quantidade}</td>
                        <td className="p-2 text-right">{v.preco_unitario}</td>
                      </tr>
                    ))}
                    {invalidas.map((iv) => (
                      <tr key={`i-${iv.linhaPlanilha}`} className="border-t bg-destructive/10">
                        <td className="p-2 text-muted-foreground">{iv.linhaPlanilha}</td>
                        <td className="p-2 text-destructive" colSpan={3}>
                          {iv.erro}
                          {iv.codigo && (
                            <span className="text-muted-foreground"> · "{iv.codigo}"</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {validas.length === 0 && invalidas.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-muted-foreground">
                          Nenhuma linha encontrada na planilha.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {temTextoAtual && (
                <div>
                  <Label className="mb-2 block">Como aplicar</Label>
                  <RadioGroup value={modo} onValueChange={(v) => setModo(v as Modo)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="substituir" id="merc-substituir" />
                      <Label htmlFor="merc-substituir" className="font-normal cursor-pointer">
                        Substituir o que já está no campo
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="adicionar" id="merc-adicionar" />
                      <Label htmlFor="merc-adicionar" className="font-normal cursor-pointer">
                        Acrescentar ao final
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
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
            Levar {validas.length} {validas.length === 1 ? "linha" : "linhas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
