import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { gerarPlanilhaCadastro, nomeArquivoCadastro, type RespostaExport } from "@/lib/acervo/planilha-cadastro-xlsx";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; inicialSoMedicao?: boolean; cods?: string[] | null }

export function ExportarPlanilhaCadastroDialog({ open, onOpenChange, inicialSoMedicao = false, cods = null }: Props) {
  const [soMedicao, setSoMedicao] = useState(inicialSoMedicao);
  useEffect(() => { if (open) setSoMedicao(inicialSoMedicao); }, [open, inicialSoMedicao]);
  const [erro, setErro] = useState<string | null>(null);

  const exportar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("exportar-planilha-produto", {
        body: cods ? { cods, so_aguardando_medicao: soMedicao } : { colecoes: null, so_aguardando_medicao: soMedicao },
      });
      if (error) {
        let m = error.message;
        try { const ctx = (error as { context?: Response }).context; const j = ctx ? await ctx.json() : null; if (j?.erro) m = j.erro; } catch { /* mantém */ }
        throw new Error(m);
      }
      const r = data as RespostaExport;
      if (!r?.ok) throw new Error(r?.erro ?? "Resposta inválida da exportação");
      if (!r.produtos.length) throw new Error("O FOP não devolveu nenhum produto para esse recorte.");
      const blob = await gerarPlanilhaCadastro(r);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = cods ? nomeArquivoCadastro(["formato_invalido"]) : nomeArquivoCadastro([]); a.click();
      URL.revokeObjectURL(url);
      return r.produtos.length;
    },
    onMutate: () => setErro(null),
    onSuccess: (n) => { toast.success(`Planilha gerada com ${n} produtos.`); onOpenChange(false); },
    onError: (e: Error) => { setErro(e.message); toast.error(e.message); },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportar planilha de cadastro</DialogTitle>
          <DialogDescription>
            Produtos lidos do FOP. Valores que só existem no SNCF vêm em amarelo, para confirmar. Sai sempre o catálogo inteiro.
          </DialogDescription>
        </DialogHeader>
        {cods && <p className="text-sm">{cods.length} produto(s) com formato inválido.</p>}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={soMedicao} onCheckedChange={(v) => setSoMedicao(v === true)} />
          Só aguardando medição (lista para o showroom)
        </label>
        {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => exportar.mutate()} disabled={exportar.isPending}>
            {exportar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            Gerar planilha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
