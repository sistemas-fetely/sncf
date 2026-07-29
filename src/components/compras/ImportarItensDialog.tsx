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
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  parsearPlanilhaItens,
  type ResultadoParse,
  type CabecalhoPedidoImportado,
} from "@/lib/compras/templateItens";
import { useUnidadesMedida } from "@/hooks/compras/useUnidadesMedida";
import type { ItemEdit } from "@/lib/compras/types";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

type Modo = "adicionar" | "substituir";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itensAtuais: ItemEdit[];
  onImportar: (
    novosItens: ItemEdit[],
    modo: Modo,
    cabecalho: CabecalhoPedidoImportado | null,
  ) => void;
}

export function ImportarItensDialog({ open, onOpenChange, itensAtuais, onImportar }: Props) {
  const { data: unidades = [] } = useUnidadesMedida();
  const [fileName, setFileName] = useState<string>("");
  const [resultado, setResultado] = useState<ResultadoParse | null>(null);
  const [modo, setModo] = useState<Modo>("adicionar");
  const [aplicarCabecalho, setAplicarCabecalho] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const limpar = () => {
    setFileName("");
    setResultado(null);
    setModo("adicionar");
    setAplicarCabecalho(true);
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
      const res = await parsearPlanilhaItens(
        file,
        unidades.map((u) => ({ id: u.id, sigla: u.sigla, nome: u.nome })),
      );
      setResultado(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível ler o arquivo";
      toast.error(`Falha ao ler planilha: ${msg}`);
      setResultado({
        erroGlobal: "Arquivo corrompido ou formato não suportado. Envie um .xlsx ou .xls válido.",
        cabecalho: null,
        validas: [],
        invalidas: [],
      });
    } finally {
      setCarregando(false);
    }
  };

  const validas = resultado?.validas ?? [];
  const invalidas = resultado?.invalidas ?? [];
  const cabecalho = resultado?.cabecalho ?? null;
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
      unidade_id: v.unidade_id,
      ordem: baseOrdem + idx,
      _action: "create",
    }));
    onImportar(novos, modo, aplicarCabecalho ? cabecalho : null);
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

          {resultado && !resultado.erroGlobal && cabecalho && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="aplicar-cabecalho"
                  checked={aplicarCabecalho}
                  onCheckedChange={(v) => setAplicarCabecalho(v === true)}
                />
                <label htmlFor="aplicar-cabecalho" className="font-medium cursor-pointer">
                  Preencher os campos do pedido com estes dados
                </label>
              </div>
              <div className="text-xs text-muted-foreground italic">
                Aplicado apenas nos campos que estiverem vazios — não sobrescreve o que você já digitou.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs pt-1">
                {cabecalho.seu_nome && (
                  <div>
                    <span className="text-muted-foreground">Seu nome:</span>{" "}
                    <span className="font-medium">{cabecalho.seu_nome}</span>
                  </div>
                )}
                {cabecalho.precisa_ate && (
                  <div>
                    <span className="text-muted-foreground">Precisa até:</span>{" "}
                    <span className="font-medium">
                      {new Date(cabecalho.precisa_ate + "T00:00:00").toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                )}
                {cabecalho.o_que_precisa && (
                  <div className="md:col-span-2">
                    <span className="text-muted-foreground">O que precisa:</span>{" "}
                    <span className="font-medium">{cabecalho.o_que_precisa}</span>
                  </div>
                )}
                {cabecalho.por_que_precisa && (
                  <div className="md:col-span-2">
                    <span className="text-muted-foreground">Por que precisa:</span>{" "}
                    <span className="font-medium">{cabecalho.por_que_precisa}</span>
                  </div>
                )}
              </div>
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
                      <th className="p-2 text-left w-24">Unidade</th>
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
                        <td className="p-2">
                          {v.unidade_assumida ? (
                            <span className="text-muted-foreground italic">
                              {v.unidade_sigla} (assumido)
                            </span>
                          ) : (
                            v.unidade_sigla
                          )}
                        </td>
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
                        <td className="p-2 text-destructive" colSpan={5}>
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
                        <td colSpan={6} className="p-4 text-center text-muted-foreground">
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
