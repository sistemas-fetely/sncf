import { useState } from "react";
import { Eye, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatError } from "@/lib/format-error";
import { previaZplCorreios, useAbrirPdfCorreios } from "./useMesaSp";

/** Prévia do ZPL da etiqueta Correios (Labelary) e alternativa "Abrir PDF dos Correios". */
export function AcoesEtiquetaCorreiosZpl({ prepostagemId, codigo, disabled }: { prepostagemId: string; codigo: string | null; disabled?: boolean }) {
  const pdf = useAbrirPdfCorreios();
  const [img, setImg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState(false);
  async function abrirPrevia() {
    setAberto(true); setErro(null); setCarregando(true);
    try { setImg(await previaZplCorreios(prepostagemId)); }
    catch (e) { setImg(null); setErro(formatError(e)); }
    finally { setCarregando(false); }
  }
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={abrirPrevia} disabled={disabled}>
        <Eye aria-hidden="true" />Prévia
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => pdf.mutate(prepostagemId)} disabled={disabled || pdf.isPending}>
        {pdf.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileText aria-hidden="true" />}Abrir PDF dos Correios
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Prévia da etiqueta Correios{codigo ? ` ${codigo}` : ""}</DialogTitle>
            <DialogDescription>Como a Zebra vai imprimir (10x15 cm). Nada é impresso nesta prévia.</DialogDescription>
          </DialogHeader>
          {carregando && <div className="flex justify-center py-10"><Loader2 className="animate-spin" aria-hidden="true" /></div>}
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          {img && !carregando && <img src={img} alt={`Prévia da etiqueta Correios ${codigo ?? ""}`} className="mx-auto max-h-[70vh] w-auto border bg-card" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
