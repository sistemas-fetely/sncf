import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatError } from "@/lib/format-error";
import { useDefinirPerfil, useFormas } from "./usePerfilPagamento";

export interface AlvoPerfil { parceiro_id: string; fornecedor: string; forma: string | null; prazo: number | null; base: string | null }

export function PerfilPagamentoDialog({ alvo, onClose }: { alvo: AlvoPerfil | null; onClose: () => void }) {
  const { formas, dimDe, erro } = useFormas();
  const [forma, setForma] = useState("");
  const [prazo, setPrazo] = useState("");
  useEffect(() => { setForma(alvo?.forma ?? ""); setPrazo(alvo?.prazo != null ? String(alvo.prazo) : ""); }, [alvo]);
  const salvar = useDefinirPerfil(onClose);
  const dim = dimDe(forma);
  const naoGera = dim ? !dim.gera_titulo : false;
  const n = Number(prazo);
  const prazoOk = naoGera || (prazo !== "" && Number.isInteger(n) && n >= 0 && n <= 365);

  return <Dialog open={!!alvo} onOpenChange={(o) => !o && onClose()}>
    <DialogContent>
      <DialogHeader><DialogTitle>Perfil de pagamento — {alvo?.fornecedor}</DialogTitle></DialogHeader>
      {erro && <p className="text-sm text-destructive">{formatError(erro)}</p>}
      {alvo?.base && <p className="text-xs text-muted-foreground">Sugestão: {alvo.base}</p>}
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Forma de pagamento</Label>
          <Select value={forma} onValueChange={setForma}><SelectTrigger><SelectValue placeholder="Escolha a forma" /></SelectTrigger>
            <SelectContent>{formas.map((f) => <SelectItem key={f.codigo} value={f.codigo}>{f.nome}</SelectItem>)}</SelectContent></Select>
        </div>
        {naoGera ? <div className="flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-2 text-sm"><AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" /><span>{dim?.motivo}</span></div>
          : <div className="space-y-1.5"><Label>Prazo em dias (0 = à vista)</Label><Input type="number" min={0} max={365} value={prazo} onChange={(e) => setPrazo(e.target.value)} /></div>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={!alvo || !forma || !prazoOk || salvar.isPending} onClick={() => alvo && salvar.mutate({ parceiro_id: alvo.parceiro_id, forma, prazo: naoGera ? null : n })}>
          {salvar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Salvar
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
