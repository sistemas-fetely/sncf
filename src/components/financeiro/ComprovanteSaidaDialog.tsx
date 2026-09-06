import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import { Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";

/**
 * Comprovante de SAÍDA do título a pagar. Prova, não estado: registrar aqui
 * nunca move `status` — quem move é `fn_titulo_pagar_transicionar`.
 *
 * O dedup é por hash do arquivo no banco: o mesmo PDF não prova dois títulos.
 * A leitura por IA é best-effort — se falhar, o comprovante entra sem os campos
 * lidos, porque o anexo é a prova e a leitura é só conveniência.
 */

const MIMES_OK = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contaId: string;
  descricao: string;
  valor: number;
}

export function ComprovanteSaidaDialog({ open, onOpenChange, contaId, descricao, valor }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);

  function fechar() {
    setArquivo(null);
    if (inputRef.current) inputRef.current.value = "";
    onOpenChange(false);
  }

  async function enviar() {
    if (!arquivo) return;
    if (!MIMES_OK.includes(arquivo.type)) {
      toast.error("Aceito apenas PDF, PNG, JPEG ou WebP.");
      return;
    }
    setEnviando(true);
    try {
      const hash = await sha256Hex(arquivo);
      const path = `saida/${contaId}/${Date.now()}-${arquivo.name.replace(/[^\w.\-]/g, "_")}`;

      const { error: erroUpload } = await supabase.storage
        .from("comprovantes-pagamento")
        .upload(path, arquivo, { contentType: arquivo.type || undefined, upsert: false });
      if (erroUpload) throw erroUpload;

      // Leitura por IA: best-effort, nunca bloqueia o registro.
      let lido: {
        valor?: number;
        data?: string;
        beneficiario_cnpj?: string;
        confianca?: string;
      } | null = null;
      try {
        const { data, error } = await supabase.functions.invoke("ler-comprovante-pagamento", {
          body: { storage_path: path },
        });
        if (!error && data && !(data as { error?: string }).error) {
          lido = data as typeof lido;
        }
      } catch {
        lido = null;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: res, error } = await (supabase as any).rpc("fn_comprovante_saida_registrar", {
        p_conta_pagar_id: contaId,
        p_storage_path: path,
        p_hash_arquivo: hash,
        p_mime_type: arquivo.type || "application/octet-stream",
        p_tamanho_bytes: arquivo.size,
        p_valor_lido: lido?.valor ?? null,
        p_data_lida: lido?.data ?? null,
        p_beneficiario_cnpj_lido: lido?.beneficiario_cnpj ?? null,
        p_confianca_ia: lido?.confianca ?? null,
        p_payload_ia: lido ?? null,
      });
      if (error) throw error;

      if (!res?.ok) {
        toast.error(res?.motivo || "Comprovante recusado", { duration: 8000 });
        return;
      }

      const alertas = (res.alertas ?? []) as string[];
      if (alertas.length > 0) {
        toast.warning(`Comprovante registrado com avisos: ${alertas.join(" · ")}`, {
          duration: 10000,
        });
      } else {
        toast.success("Comprovante de saída registrado");
      }

      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["conta-pagar-detalhe", contaId] });
      fechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { duration: 8000 });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : fechar())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anexar comprovante de pagamento</DialogTitle>
          <DialogDescription>
            {descricao} · {formatBRL(valor)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="comprovante-saida">Arquivo (PDF ou imagem)</Label>
          <Input
            id="comprovante-saida"
            ref={inputRef}
            type="file"
            accept=".pdf,image/png,image/jpeg,image/webp"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
          <p className="text-[11px] text-muted-foreground">
            O mesmo arquivo não pode provar dois títulos — o sistema recusa arquivo repetido.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={fechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={!arquivo || enviando}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Anexar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ComprovanteSaidaDialog;
