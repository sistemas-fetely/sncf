import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";

export type AlvoContraparte = {
  vendedor_id: string;
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  documento?: string | null;
};

/** Máscara só visual: CPF até 11 dígitos, CNPJ acima. Validação é da RPC. */
export function mascaraDoc(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11)
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}

export function VincularContraparteDialog({ alvo, onClose }: { alvo: AlvoContraparte | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ doc: "", razao: "", email: "", tel: "", pix: "", pixTipo: "", core: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (alvo) {
      setF({ doc: mascaraDoc(alvo.documento ?? ""), razao: alvo.nome ?? "", email: alvo.email ?? "", tel: alvo.telefone ?? "", pix: "", pixTipo: "", core: "" });
      setErro(null);
    }
  }, [alvo]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: k === "doc" ? mascaraDoc(e.target.value) : e.target.value }));
  const nul = (s: string) => (s.trim() ? s.trim() : null);

  async function confirmar() {
    if (!alvo) return;
    setSalvando(true); setErro(null);
    try {
      const { data, error } = await (supabase as any).rpc("fn_representante_vincular_parceiro", {
        p_vendedor_id: alvo.vendedor_id, p_documento: f.doc, p_razao_social: nul(f.razao), p_email: nul(f.email),
        p_telefone: nul(f.tel), p_pix_chave: nul(f.pix), p_pix_tipo: nul(f.pixTipo), p_registro_core: nul(f.core),
      });
      if (error) throw error;
      const r = (data ?? {}) as { ok?: boolean; erro?: string; alerta?: string };
      if (r.ok !== true) { setErro(r.erro ?? `O banco não confirmou o vínculo: ${JSON.stringify(data)}`); return; }
      toast.success(`Contraparte vinculada a ${alvo.nome ?? "representante"}.`);
      if (r.alerta) toast.warning(r.alerta);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["representante-kpi"] }),
        qc.invalidateQueries({ queryKey: ["vendedores-espelho"] }),
        qc.invalidateQueries({ queryKey: ["vendedor-cadastro"] }),
      ]);
      onClose();
    } catch (e) {
      setErro(formatError(e));
    } finally {
      setSalvando(false);
    }
  }

  const campo = (id: keyof typeof f, label: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="space-y-1">
      <Label htmlFor={`vc-${id}`}>{label}</Label>
      <Input id={`vc-${id}`} value={f[id]} onChange={set(id)} {...extra} />
    </div>
  );

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular contraparte</DialogTitle>
          <DialogDescription>Cria ou liga o cadastro em parceiros comerciais para que {alvo?.nome ?? "o representante"} possa receber comissão.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{campo("doc", "CPF/CNPJ *", { inputMode: "numeric", placeholder: "000.000.000-00" })}</div>
          <div className="sm:col-span-2">{campo("razao", "Razão social / Nome")}</div>
          {campo("email", "E-mail", { type: "email" })}
          {campo("tel", "Telefone")}
          {campo("pix", "Chave PIX")}
          {campo("pixTipo", "Tipo da chave PIX", { placeholder: "cpf, cnpj, email, telefone, aleatoria" })}
          <div className="sm:col-span-2">{campo("core", "Registro CORE")}</div>
        </div>
        {erro && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={confirmar} disabled={salvando || !f.doc.replace(/\D/g, "")}>
            {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Confirmar vínculo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
