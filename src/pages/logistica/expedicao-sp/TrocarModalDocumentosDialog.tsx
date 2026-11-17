import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatError } from "@/lib/format-error";
import { opcoesTrocaModal, podeTrocarModalDocumentos } from "@/lib/logistica/trocaModalMesa";
import { useModaisEntrega, useTrocarModal } from "./useMesaSp";

interface Props {
  pedidoId: string;
  modalEmbalado: string | null;
  bloqueado: boolean;
  onFechar: () => void;
}

export function TrocarModalDocumentosDialog({ pedidoId, modalEmbalado, bloqueado, onFechar }: Props) {
  const qc = useQueryClient();
  const modaisQ = useModaisEntrega();
  const vigenteQ = useQuery({
    queryKey: ["mesa-sp", "modal-do-pedido", pedidoId],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_mesa_sp_modal_do_pedido", { p_pedido_id: pedidoId });
      if (error) throw new Error(error.message);
      return data as string | null;
    },
  });
  const trocar = useTrocarModal();
  const [modal, setModal] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const vigente = vigenteQ.data ?? modalEmbalado;
  const opcoes = opcoesTrocaModal(modaisQ.data ?? [], vigente);
  const pendente = confirmando || trocar.isPending;
  const pode = podeTrocarModalDocumentos({ modal, vigente, motivo, bloqueado, pendente })
    && opcoes.some((opcao) => opcao.codigo === modal)
    && !modaisQ.isLoading && !modaisQ.error && !vigenteQ.isFetching && !vigenteQ.error;

  async function confirmar() {
    if (!pode) return;
    setConfirmando(true);
    setErro(null);
    try {
      const resultado = await trocar.mutateAsync({ p_pedido_id: pedidoId, p_modal: modal, p_motivo: motivo.trim() });
      if (resultado && typeof resultado === "object" && "ok" in resultado && resultado.ok === false) {
        throw new Error("erro" in resultado ? String(resultado.erro) : "Troca de modal não confirmada pelo banco.");
      }
      // Includes documents, current modal and order events; wait before closing.
      await qc.invalidateQueries({ queryKey: ["mesa-sp"] });
      toast.success("Modal trocado — refaça os documentos.");
      onFechar();
    } catch (e) {
      setErro(formatError(e));
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pendente) onFechar(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Trocar modal</DialogTitle>
          <DialogDescription>{modaisQ.data?.find((opcao) => opcao.codigo === vigente)?.nome ?? "Modal vigente"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="documentos-novo-modal">Modal</Label>
          <Select value={modal} onValueChange={setModal} disabled={bloqueado || pendente || modaisQ.isLoading || vigenteQ.isFetching || !!modaisQ.error || !!vigenteQ.error}>
            <SelectTrigger id="documentos-novo-modal"><SelectValue placeholder="Escolher" /></SelectTrigger>
            <SelectContent>{opcoes.map((opcao) => <SelectItem key={opcao.codigo} value={opcao.codigo}>{opcao.nome}</SelectItem>)}</SelectContent>
          </Select>
          {!modaisQ.isLoading && !modaisQ.error && !vigenteQ.isFetching && !vigenteQ.error && opcoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum outro modal ativo disponível.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="documentos-motivo-modal">Motivo da troca <span aria-hidden="true" className="text-destructive">*</span></Label>
          <Textarea id="documentos-motivo-modal" value={motivo} onChange={(event) => setMotivo(event.target.value)} disabled={bloqueado || pendente} required minLength={5} rows={3} />
        </div>
        {(erro || modaisQ.error || vigenteQ.error) && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive">{erro ?? formatError(modaisQ.error ?? vigenteQ.error)}</p>}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={pendente} onClick={onFechar}>Cancelar</Button>
          <Button type="button" className="h-auto min-h-10 whitespace-normal" disabled={!pode} onClick={() => void confirmar()}>
            {pendente && <Loader2 className="shrink-0 animate-spin" aria-hidden="true" />}
            Trocar modal e refazer documentos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}