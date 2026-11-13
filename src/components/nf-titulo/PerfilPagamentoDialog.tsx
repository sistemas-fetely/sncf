import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatError } from "@/lib/format-error";
import { parseParcelasDias, type ResultadoSalvo } from "./perfilPagamento";
import { useDefinirPerfil, useFormas } from "./usePerfilPagamento";

export interface AlvoPerfil { parceiro_id: string; fornecedor: string; forma: string | null; prazo: number | null; parcelas?: number[] | null; base: string | null }

export function PerfilPagamentoDialog({ alvo, onClose, onSalvo }: { alvo: AlvoPerfil | null; onClose: () => void; onSalvo?: (parceiroId: string, r: ResultadoSalvo) => void }) {
  const { formas, dimDe, erro } = useFormas();
  const [forma, setForma] = useState("");
  const [prazo, setPrazo] = useState("");
  const [parcelasTexto, setParcelasTexto] = useState("");
  useEffect(() => { setForma(alvo?.forma ?? ""); setPrazo(alvo?.prazo != null ? String(alvo.prazo) : ""); setParcelasTexto(alvo?.parcelas?.join("/") ?? ""); }, [alvo]);
  const salvar = useDefinirPerfil((id, r) => { onSalvo?.(id, r); onClose(); });
  const dim = dimDe(forma);
  const naoGera = dim ? !dim.gera_titulo : false;
  const parse = parseParcelasDias(parcelasTexto);
  const parcelas = parse.parcelas && parse.parcelas.length >= 2 ? parse.parcelas : null;
  const n = parcelas ? parcelas[0] : Number(prazo);
  const prazoOk = naoGera || (!parse.erro && (parcelas !== null || (prazo !== "" && Number.isInteger(n) && n >= 0 && n <= 365)));

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
          : <><div className="space-y-1.5"><Label htmlFor="perfil-prazo">Prazo em dias (0 = à vista)</Label><Input id="perfil-prazo" type="number" min={0} max={365} disabled={parcelas !== null} value={parcelas ? String(parcelas[0]) : prazo} onChange={(e) => setPrazo(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="perfil-parcelas">Parcelas (dias)</Label><Input id="perfil-parcelas" placeholder="ex.: 30/60" value={parcelasTexto} onChange={(e) => setParcelasTexto(e.target.value)} aria-invalid={!!parse.erro} aria-describedby="perfil-parcelas-ajuda" />
              <p id="perfil-parcelas-ajuda" className="text-xs text-muted-foreground">Deixe vazio para pagamento único. Com parcelas, a nota sem duplicata nasce com um título por parcela, valor dividido igual.</p>
              {parse.erro && <p role="alert" className="text-sm text-destructive">{parse.erro}</p>}
            </div></>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={!alvo || !forma || !prazoOk || salvar.isPending} onClick={async () => { if (!alvo) return; try { await salvar.mutateAsync({ parceiro_id: alvo.parceiro_id, forma, prazo: naoGera ? null : n, parcelas: naoGera ? null : parcelas }); } catch { /* onError shows the original message. */ } }}>
          {salvar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Salvar
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
