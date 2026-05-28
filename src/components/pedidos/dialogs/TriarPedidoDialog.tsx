import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CreditCard, QrCode, Receipt, AlertCircle, CheckCircle2 } from "lucide-react";
import { useTransicionarPedido } from "@/hooks/pedidos/useTransicionarPedido";
import { podePularAnaliseParaBoleto } from "@/lib/pedidoTransicoes";
import type { EstagioPedido } from "@/types/pedido";

type Trilha = "cartao" | "pix" | "boleto";

interface Props {
  pedido_id: string;
  perfil_credito: string | null | undefined;
}

export function TriarPedidoDialog({ pedido_id, perfil_credito }: Props) {
  const [open, setOpen] = useState(false);
  const [trilha, setTrilha] = useState<Trilha | null>(null);
  const [proximaAcao, setProximaAcao] = useState("");
  const [motivo, setMotivo] = useState("");

  const transicionar = useTransicionarPedido();
  const boletoDireto = podePularAnaliseParaBoleto(perfil_credito);

  const handleConfirm = async () => {
    if (!trilha) return;

    let destino: EstagioPedido;
    let motivoFinal = motivo;

    if (trilha === "cartao") destino = "em_cobranca_cartao";
    else if (trilha === "pix") destino = "em_cobranca_pix";
    else if (boletoDireto) destino = "em_cobranca_boleto";
    else {
      destino = "em_analise_credito";
      if (!motivoFinal) {
        motivoFinal = `Boleto solicitado — perfil ${perfil_credito || "indefinido"} precisa de análise prévia`;
      }
    }

    await transicionar.mutateAsync({
      pedido_id,
      para_estagio: destino,
      proxima_acao: proximaAcao || undefined,
      motivo: motivoFinal || undefined,
    });

    setOpen(false);
    setTrilha(null);
    setMotivo("");
    setProximaAcao("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <ArrowRight className="h-4 w-4" />
          Triar e encaminhar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Triar pedido</DialogTitle>
          <DialogDescription>
            Como o cliente vai pagar? A trilha define a próxima etapa do fluxo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <TrilhaCard
              icone={<CreditCard className="h-8 w-8" />}
              titulo="Cartão"
              subtitulo="de crédito"
              cor="blue"
              ativa={trilha === "cartao"}
              onClick={() => setTrilha("cartao")}
            />
            <TrilhaCard
              icone={<QrCode className="h-8 w-8" />}
              titulo="PIX"
              subtitulo="chave ou QR"
              cor="cyan"
              ativa={trilha === "pix"}
              onClick={() => setTrilha("pix")}
            />
            <TrilhaCard
              icone={<Receipt className="h-8 w-8" />}
              titulo="Boleto"
              subtitulo={boletoDireto ? "direto · perfil OK" : "via análise"}
              badge={
                boletoDireto ? (
                  <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300 bg-emerald-50">
                    <CheckCircle2 className="h-3 w-3" />
                    direto
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50">
                    <AlertCircle className="h-3 w-3" />
                    análise
                  </Badge>
                )
              }
              cor="amber"
              ativa={trilha === "boleto"}
              onClick={() => setTrilha("boleto")}
            />
          </div>

          {trilha === "boleto" && !boletoDireto && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-900 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Boleto vai passar por análise de crédito
              </p>
              <p className="text-amber-800 mt-1">
                Perfil <strong>{perfil_credito || "indefinido"}</strong> não pula análise. O pedido vai pra Crédito antes de emitir o boleto.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Próxima ação (opcional)</Label>
            <Input
              value={proximaAcao}
              onChange={(e) => setProximaAcao(e.target.value)}
              placeholder="Ex: Enviar link de cartão, esperar pagamento, etc."
            />
          </div>

          <div className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Contexto pra próxima pessoa. Vai pro audit trail."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!trilha || transicionar.isPending}>
            {transicionar.isPending ? "Encaminhando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TrilhaCardProps {
  icone: React.ReactNode;
  titulo: string;
  subtitulo: string;
  cor: "blue" | "cyan" | "amber";
  ativa: boolean;
  badge?: React.ReactNode;
  onClick: () => void;
}

function TrilhaCard({ icone, titulo, subtitulo, cor, ativa, badge, onClick }: TrilhaCardProps) {
  const borderActive: Record<string, string> = {
    blue: "border-blue-500 ring-2 ring-blue-500/30 bg-blue-50/50",
    cyan: "border-cyan-500 ring-2 ring-cyan-500/30 bg-cyan-50/50",
    amber: "border-amber-500 ring-2 ring-amber-500/30 bg-amber-50/50",
  };
  const iconColor: Record<string, string> = {
    blue: "text-blue-600",
    cyan: "text-cyan-600",
    amber: "text-amber-600",
  };

  return (
    <Card
      className={`cursor-pointer transition-all hover:border-foreground/30 ${
        ativa ? borderActive[cor] : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="py-4 flex flex-col items-center text-center gap-2">
        <div className={iconColor[cor]}>{icone}</div>
        <div>
          <p className="font-semibold text-sm">{titulo}</p>
          <p className="text-xs text-muted-foreground">{subtitulo}</p>
        </div>
        {badge && <div>{badge}</div>}
      </CardContent>
    </Card>
  );
}
