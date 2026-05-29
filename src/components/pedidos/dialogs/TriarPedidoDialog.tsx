import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowRight, Zap, X, GitBranch } from "lucide-react";
import { useTransicionarPedido } from "@/hooks/pedidos/useTransicionarPedido";
import { podePularAnaliseCredito } from "@/lib/pedidoTransicoes";
import type { EstagioPedido } from "@/types/pedido";

type Acao = "analise" | "pular" | "cancelar";

interface Props {
  pedido_id: string;
  perfil_credito: string | null | undefined;
  estagio_atual: EstagioPedido;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost";
}

export function TriarPedidoDialog({
  pedido_id,
  perfil_credito,
  estagio_atual: _estagio_atual,
  triggerLabel = "Triar pedido",
  triggerVariant = "default",
}: Props) {
  const [open, setOpen] = useState(false);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [motivo, setMotivo] = useState("");

  const transicionar = useTransicionarPedido();
  const podePular = podePularAnaliseCredito(perfil_credito);

  // F-3.2: parser de condicao + trigger tr_pedido_pular_analise cravados.
  // Pular análise cria análise shell, parseia condição e gera títulos automaticamente.
  const pularDisponivel = true;

  const handleConfirm = async () => {
    if (!acao) return;

    if (acao === "cancelar" && !motivo.trim()) return;

    let destino: EstagioPedido;
    if (acao === "analise") destino = "em_analise_credito";
    else if (acao === "pular") destino = "credito_aprovado";
    else destino = "cancelado";

    await transicionar.mutateAsync({
      pedido_id,
      para_estagio: destino,
      motivo: motivo || (acao === "analise" ? "Encaminhado pra análise de crédito" : undefined),
    });

    setOpen(false);
    setAcao(null);
    setMotivo("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerVariant} className="gap-2">
          <ArrowRight className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Triar pedido</DialogTitle>
          <DialogDescription>
            Decida o próximo passo. A triagem encaminha o pedido pra análise de crédito,
            pula análise (perfis dispensados) ou cancela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <AcaoCard
            ativa={acao === "analise"}
            onClick={() => setAcao("analise")}
            icone={<GitBranch className="h-5 w-5 text-blue-600" />}
            titulo="Encaminhar pra Análise de Crédito"
            descricao="Padrão. Análise verifica limite, prazo e perfil antes de aprovar."
          />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <AcaoCard
                    ativa={acao === "pular"}
                    onClick={() => pularDisponivel && podePular && setAcao("pular")}
                    desabilitada={!pularDisponivel || !podePular}
                    icone={<Zap className="h-5 w-5 text-emerald-600" />}
                    titulo="Pular Análise (perfil dispensa)"
                    descricao={
                      podePular
                        ? `Perfil ${perfil_credito} dispensa análise — aprovação direta.`
                        : "Disponível pra perfis Premium e Recorrente Bom Pagador."
                    }
                  />
                </div>
              </TooltipTrigger>
              {!podePular && (
                <TooltipContent side="bottom" className="max-w-xs">
                  Perfil <strong>{perfil_credito || "indefinido"}</strong> precisa passar pela análise.
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          <AcaoCard
            ativa={acao === "cancelar"}
            onClick={() => setAcao("cancelar")}
            icone={<X className="h-5 w-5 text-destructive" />}
            titulo="Cancelar pedido"
            descricao="Encerra o pedido. Motivo obrigatório."
            destrutiva
          />
        </div>

        {acao === "cancelar" && (
          <div className="space-y-2">
            <Label>Motivo do cancelamento</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Cliente desistiu, divergência de preço, etc."
              rows={2}
            />
          </div>
        )}

        {acao === "analise" && (
          <div className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Algo que a Crédito precisa saber? Vai pro audit trail."
              rows={2}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !acao ||
              (acao === "cancelar" && !motivo.trim()) ||
              transicionar.isPending
            }
            variant={acao === "cancelar" ? "destructive" : "default"}
          >
            {transicionar.isPending ? "Aplicando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AcaoCardProps {
  ativa: boolean;
  onClick: () => void;
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  desabilitada?: boolean;
  destrutiva?: boolean;
}

function AcaoCard({ ativa, onClick, icone, titulo, descricao, desabilitada, destrutiva }: AcaoCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitada}
      className={[
        "w-full text-left rounded-md border p-3 flex items-start gap-3 transition-colors",
        ativa
          ? destrutiva
            ? "border-destructive bg-destructive/5 ring-2 ring-destructive/20"
            : "border-foreground/40 bg-accent ring-2 ring-foreground/10"
          : "border-border hover:bg-accent/60",
        desabilitada ? "opacity-50 cursor-not-allowed hover:bg-transparent" : "cursor-pointer",
      ].join(" ")}
    >
      <div className="shrink-0 mt-0.5">{icone}</div>
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </div>
    </button>
  );
}
