import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { useTransicionarAnalise } from "@/hooks/credito/useTransicionarAnalise";
import { useNavigate } from "react-router-dom";
import type { CamposDecisao } from "../FormDecisaoCredito";
import type { SugestaoIA } from "@/types/credito";

interface Props {
  analise_id: string;
  campos: CamposDecisao;
  sugestaoIA: SugestaoIA | null;
  comRessalva?: boolean;
}

function calcularDelta(campos: CamposDecisao, ia: SugestaoIA | null) {
  if (!ia) return null;
  const delta: Record<string, { ia: unknown; joseph: unknown }> = {};
  const compare = (k: string, valorIA: unknown, valorJ: unknown) => {
    const eqArr =
      Array.isArray(valorIA) &&
      Array.isArray(valorJ) &&
      JSON.stringify([...valorIA].sort()) === JSON.stringify([...valorJ].sort());
    if (!eqArr && valorIA !== valorJ) {
      delta[k] = { ia: valorIA, joseph: valorJ };
    }
  };
  compare("perfil_aplicado", ia.perfil_aplicado, campos.perfil_aplicado);
  compare("limite_concedido", ia.limite_concedido, campos.limite_concedido);
  compare("prazo_max_dias", ia.prazo_max_dias, campos.prazo_max_dias);
  compare("formas_aceitas", ia.formas_aceitas, campos.formas_aceitas);
  compare("parecer_final", ia.parecer_final, campos.parecer_final);
  if (campos.contexto_anotacao) {
    delta.contexto_anotacao_joseph = { ia: null, joseph: campos.contexto_anotacao };
  }
  return Object.keys(delta).length > 0 ? delta : null;
}

export function AprovarDialog({ analise_id, campos, sugestaoIA, comRessalva = false }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState(campos.ressalva);
  const navigate = useNavigate();
  const transicionar = useTransicionarAnalise();

  const ressalvaValida = !comRessalva || motivo.trim().length >= 10;

  const handleConfirm = async () => {
    if (!ressalvaValida) return;
    const delta = calcularDelta(campos, sugestaoIA);
    await transicionar.mutateAsync({
      analise_id,
      acao: comRessalva ? "aprovado_com_ressalva" : "aprovado",
      motivo: comRessalva ? motivo.trim() : undefined,
      perfil_aplicado: campos.perfil_aplicado,
      limite_concedido: campos.limite_concedido,
      prazo_max_dias: campos.prazo_max_dias,
      formas_aceitas: campos.formas_aceitas,
      parecer_final: campos.parecer_final,
      ressalva: comRessalva ? motivo.trim() : undefined,
      validade_ate: campos.validade_ate || undefined,
      delta_ia: delta,
    });
    setOpen(false);
    navigate("/credito");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {comRessalva ? (
          <Button variant="secondary" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            Aprovar com ressalva
          </Button>
        ) : (
          <Button className="gap-2 bg-green-600 hover:bg-green-700 text-white">
            <CheckCircle2 className="h-4 w-4" />
            Aprovar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {comRessalva ? "Aprovar com ressalva" : "Aprovar análise"}
          </DialogTitle>
          <DialogDescription>
            {comRessalva
              ? "Aprovação condicionada. A ressalva fica registrada e Mariana repassa pro lojista."
              : "A análise será finalizada com os campos preenchidos no formulário. Cliente fica liberado pra fluxo de venda."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Perfil</p>
              <p className="font-medium">{campos.perfil_aplicado}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Limite</p>
              <p className="font-medium">R$ {campos.limite_concedido.toLocaleString("pt-BR")}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Prazo</p>
              <p className="font-medium">{campos.prazo_max_dias} dias</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Formas</p>
              <p className="font-medium capitalize">
                {campos.formas_aceitas.join(", ") || "—"}
              </p>
            </div>
          </div>

          {comRessalva && (
            <div className="space-y-2 pt-2">
              <Label>Ressalva (mínimo 10 caracteres)</Label>
              <Textarea
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex: Aprovado com limite reduzido enquanto cliente constrói histórico."
              />
              <p className="text-xs text-muted-foreground">
                {motivo.trim().length}/10 caracteres
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Voltar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!ressalvaValida || transicionar.isPending}
            className={comRessalva ? "" : "bg-green-600 hover:bg-green-700"}
          >
            {transicionar.isPending ? "Aprovando..." : "Confirmar aprovação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
