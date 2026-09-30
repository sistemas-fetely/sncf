import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function VincularRascunhoDialog({ retornoId, aberto, onOpenChange, onSuccess }: { retornoId: string; aberto: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void }) {
  const [id, setId] = useState(""); const [numero, setNumero] = useState("");
  const salvar = useMutation({ mutationFn: async () => { const blingId = Number(id); if (!Number.isSafeInteger(blingId) || !numero.trim()) throw new Error("Informe o ID do Bling e o número da NF."); const { error } = await supabase.rpc("reg_retorno_registrar", { p_retorno_nf_id: retornoId, p_status: "rascunho", p_bling_nfe_id: blingId, p_numero: numero.trim() }); if (error) throw error; }, onSuccess: () => { toast.success("Rascunho vinculado."); onOpenChange(false); onSuccess(); }, onError: (e) => toast.error(rawMessage(e)) });
  return <Dialog open={aberto} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Vincular rascunho existente</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-1.5"><Label>ID do Bling</Label><Input inputMode="numeric" value={id} onChange={(e) => setId(e.target.value)} /></div><div className="space-y-1.5"><Label>Número da NF</Label><Input value={numero} onChange={(e) => setNumero(e.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>Confirmar</Button></DialogFooter></DialogContent></Dialog>;
}
