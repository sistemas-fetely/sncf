import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PessoaKanban } from "@/hooks/credito/useCobrancaKanban";
import { hojeIsoLocal } from "./cores";

export type ModoRaiaDialog =
  | { modo: "mover"; rotuloRaia: string }
  | { modo: "atribuir"; atual: string | null }
  | { modo: "data"; atual: string | null };

export const SEM_PESSOA = "__sem__";

export function RaiaDialog({
  estado, pessoas, salvando, onCancelar, onConfirmar,
}: {
  estado: ModoRaiaDialog | null;
  pessoas: PessoaKanban[];
  salvando: boolean;
  onCancelar: () => void;
  onConfirmar: (v: { retornoEm?: string; observacao?: string; responsavel?: string | null }) => void;
}) {
  const [data, setData] = useState("");
  const [obs, setObs] = useState("");
  const [pessoa, setPessoa] = useState<string>(SEM_PESSOA);
  const hoje = hojeIsoLocal();

  useEffect(() => {
    if (!estado) return;
    setObs("");
    setData(estado.modo === "data" ? (estado.atual ?? "") : "");
    setPessoa(estado.modo === "atribuir" ? (estado.atual ?? SEM_PESSOA) : SEM_PESSOA);
  }, [estado]);

  const precisaData = estado?.modo === "mover" || estado?.modo === "data";
  const dataInvalida = precisaData && (!data || data < hoje);

  return (
    <Dialog open={!!estado} onOpenChange={(v) => { if (!v) onCancelar(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {estado?.modo === "mover" && `Mover para ${estado.rotuloRaia}`}
            {estado?.modo === "atribuir" && "Atribuir pessoa"}
            {estado?.modo === "data" && "Alterar data de retorno"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {precisaData && (
            <div className="space-y-1">
              <Label htmlFor="raia-retorno">Data de retorno</Label>
              <Input id="raia-retorno" type="date" min={hoje} value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          )}
          {estado?.modo === "atribuir" && (
            <div className="space-y-1">
              <Label>Responsável</Label>
              <Select value={pessoa} onValueChange={setPessoa}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_PESSOA}>Sem responsável</SelectItem>
                  {pessoas.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {estado?.modo === "mover" && (
            <div className="space-y-1">
              <Label htmlFor="raia-obs">Observação (opcional)</Label>
              <Textarea id="raia-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
          <Button
            disabled={salvando || dataInvalida}
            onClick={() =>
              onConfirmar({
                retornoEm: precisaData ? data : undefined,
                observacao: obs.trim() || undefined,
                responsavel: estado?.modo === "atribuir" ? (pessoa === SEM_PESSOA ? null : pessoa) : undefined,
              })
            }
          >
            {salvando ? "Salvando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
