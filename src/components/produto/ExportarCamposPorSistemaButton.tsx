import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportCamposPorSistema } from "@/lib/exportCamposPorSistema";
import { rawMessage } from "@/lib/format-error";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";

export function ExportarCamposPorSistemaButton() {
  const { permitido } = usePermissaoAcaoOuSuperAdmin("acao.produto_exportar_campos_por_sistema");
  const [gerando, setGerando] = useState(false);
  const ocupado = useRef(false);
  async function exportar() {
    if (ocupado.current) return;
    ocupado.current = true;
    setGerando(true);
    try {
      const arquivo = await exportCamposPorSistema();
      const url = URL.createObjectURL(arquivo.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = arquivo.nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast.success(`Exportação concluída — ${arquivo.totais}`);
    } catch (erro) {
      toast.error(rawMessage(erro));
    } finally {
      ocupado.current = false;
      setGerando(false);
    }
  }
  if (!permitido) return null;
  return <Button size="sm" variant="outline" onClick={() => void exportar()} disabled={gerando}>
    {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
    {gerando ? "Gerando…" : "Exportar campos por sistema"}
  </Button>;
}