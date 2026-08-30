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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { useTransicionarAnalise } from "@/hooks/credito/useTransicionarAnalise";
import { useFormasPagamento } from "@/hooks/financeiro/useFormasPagamento";
import { useDefinirPortaoAnalise } from "@/hooks/credito/useDefinirPortaoAnalise";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import type { CamposDecisao } from "../FormDecisaoCredito";
import type { SugestaoIA } from "@/types/credito";

interface Props {
  analise_id: string;
  pedido_id: string;
  campos: CamposDecisao;
  sugestaoIA: SugestaoIA | null;
  comRessalva?: boolean;
}

type PortaoEscolha = "regra" | "exigir" | "liberar";

const PORTAO_VALOR: Record<PortaoEscolha, boolean | null> = {
  regra: null,
  exigir: true,
  liberar: false,
};

const PORTAO_EXPLICACAO: Record<PortaoEscolha, string> = {
  regra: "O pedido segue o comportamento normal da forma de pagamento escolhida.",
  exigir: "A mercadoria só sai depois que o pagamento for confirmado.",
  liberar:
    "A mercadoria sai sem esperar o pagamento. O cliente será cobrado depois.",
};


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

export function AprovarDialog({ analise_id, pedido_id, campos, sugestaoIA, comRessalva = false }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState(campos.ressalva);
  const [portao, setPortao] = useState<PortaoEscolha>("regra");
  const [motivoPortao, setMotivoPortao] = useState("");
  const navigate = useNavigate();
  const transicionar = useTransicionarAnalise();
  const definirPortao = useDefinirPortaoAnalise();
  const { toast } = useToast();
  const formasQ = useFormasPagamento(true);
  const rotuloForma = (codigo: string) =>
    formasQ.data?.find((f) => f.codigo === codigo)?.nome ?? codigo;

  const ressalvaValida = !comRessalva || motivo.trim().length >= 10;
  const portaoValor = PORTAO_VALOR[portao];
  const motivoPortaoValido = portaoValor === null || motivoPortao.trim().length >= 10;

  const handleConfirm = async () => {
    if (!ressalvaValida || !motivoPortaoValido) return;
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

    if (portaoValor !== null) {
      try {
        await definirPortao.mutateAsync({
          pedido_id,
          valor: portaoValor,
          motivo: motivoPortao.trim(),
        });
      } catch {
        toast({
          title: "Análise aprovada, mas a regra de liberação não foi salva. Tente de novo pelo pedido.",
          variant: "destructive",
        });
        return;
      }
    }

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
          <Button className="gap-2 bg-success hover:bg-success text-white">
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
              <p className="font-medium">
                {campos.formas_aceitas.map(rotuloForma).join(", ") || "—"}
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

          <div className="space-y-2 pt-2 border-t">
            <Label>Liberação da mercadoria</Label>
            <RadioGroup
              value={portao}
              onValueChange={(v) => setPortao(v as PortaoEscolha)}
              className="gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="regra" id="portao-regra" />
                <Label htmlFor="portao-regra" className="font-normal">
                  Seguir a regra da forma de pagamento
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="exigir" id="portao-exigir" />
                <Label htmlFor="portao-exigir" className="font-normal">
                  Exigir pagamento antes de liberar
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="liberar" id="portao-liberar" />
                <Label htmlFor="portao-liberar" className="font-normal">
                  Liberar sem esperar o pagamento
                </Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">{PORTAO_EXPLICACAO[portao]}</p>

            {portaoValor !== null && (
              <div className="space-y-2 pt-1">
                <Label>Motivo</Label>
                <Textarea
                  rows={3}
                  value={motivoPortao}
                  onChange={(e) => setMotivoPortao(e.target.value)}
                  placeholder="Ex: Cliente com histórico limpo há 2 anos, libera sem esperar captura."
                />
                <p className="text-xs text-muted-foreground">
                  {motivoPortao.trim().length}/10 caracteres
                </p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Voltar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !ressalvaValida ||
              !motivoPortaoValido ||
              transicionar.isPending ||
              definirPortao.isPending
            }
            className={comRessalva ? "" : "bg-success hover:bg-success"}
          >
            {transicionar.isPending || definirPortao.isPending
              ? "Aprovando..."
              : "Confirmar aprovação"}
          </Button>

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
