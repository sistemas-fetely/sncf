import { useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Headset } from "lucide-react";
import { useAbrirSolicitacao } from "@/hooks/pedidos/useSolicitacoesComercial";

/**
 * UM COMPONENTE, DOIS PONTOS DE MONTAGEM: a mesma ação é usada no ícone da
 * linha da mesa e no botão dentro do dialog. Não existe segunda implementação.
 *
 * A tabela aceita apenas três tipos canônicos (`trocar_forma_pagamento`,
 * `novo_link`, `outro`). As intenções que o Comercial precisa nomear mas que
 * não têm tipo próprio no banco viajam como `outro` com o assunto no detalhe.
 */
const INTENCOES: { valor: string; rotulo: string; tipo: string }[] = [
  { valor: "novo_link", rotulo: "Gerar novo link de pagamento", tipo: "novo_link" },
  { valor: "trocar_forma_pagamento", rotulo: "Trocar forma de pagamento", tipo: "trocar_forma_pagamento" },
  { valor: "segunda_via_nf", rotulo: "Segunda via da NF", tipo: "outro" },
  { valor: "alterar_endereco", rotulo: "Alterar endereço de entrega", tipo: "outro" },
  { valor: "antecipar", rotulo: "Antecipar entrega", tipo: "outro" },
  { valor: "cancelar", rotulo: "Cancelar pedido", tipo: "outro" },
  { valor: "outro", rotulo: "Outro", tipo: "outro" },
];

interface Props {
  pedidoId: string;
  /** "icone" para a linha da tabela, "botao" para dentro do dialog. */
  modo?: "icone" | "botao";
  /** Item de menu já renderizado por fora (overflow "…"). */
  gatilho?: ReactNode;
  aberto?: boolean;
  onAbertoChange?: (v: boolean) => void;
}

export function SolicitarSopsAcao({
  pedidoId,
  modo = "icone",
  gatilho,
  aberto,
  onAbertoChange,
}: Props) {
  const [internoAberto, setInternoAberto] = useState(false);
  const controlado = aberto !== undefined;
  const open = controlado ? !!aberto : internoAberto;
  const setOpen = (v: boolean) => (controlado ? onAbertoChange?.(v) : setInternoAberto(v));

  const [intencao, setIntencao] = useState("novo_link");
  const [detalhe, setDetalhe] = useState("");
  const abrir = useAbrirSolicitacao(pedidoId);
  const valido = detalhe.trim().length >= 5;
  // Gate nominal no COMPONENTE da ação: vale para a linha e para o dialog.
  const { podeSolicitarSops } = usePermissoesMesa();
  if (!podeSolicitarSops) return null;

  const enviar = async () => {
    const escolhida = INTENCOES.find((i) => i.valor === intencao) ?? INTENCOES[INTENCOES.length - 1];
    const texto =
      escolhida.tipo === "outro" && escolhida.valor !== "outro"
        ? `[${escolhida.rotulo}] ${detalhe.trim()}`
        : detalhe.trim();
    try {
      await abrir.mutateAsync({ tipo: escolhida.tipo, detalhe: texto });
      setDetalhe("");
      setOpen(false);
    } catch {
      /* FAIL-LOUD: o hook já mostrou a mensagem do banco */
    }
  };

  return (
    <>
      {gatilho
        ? gatilho
        : modo === "icone" ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Solicitar ao SOPS"
            onClick={() => setOpen(true)}
          >
            <Headset className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
            <Headset className="h-4 w-4" />
            Solicitar ao SOPS
          </Button>
        )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Solicitar ao SOPS</AlertDialogTitle>
            <AlertDialogDescription>
              A solicitação entra na fila do SOPS e fica registrada na timeline do pedido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={intencao} onValueChange={setIntencao}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTENCOES.map((i) => (
                    <SelectItem key={i.valor} value={i.valor}>
                      {i.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Detalhe (obrigatório)</Label>
              <Textarea
                rows={3}
                value={detalhe}
                onChange={(e) => setDetalhe(e.target.value)}
                placeholder="Explique o que o SOPS precisa fazer (mínimo 5 caracteres)."
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={abrir.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!valido || abrir.isPending}
              onClick={(e) => {
                e.preventDefault();
                void enviar();
              }}
            >
              {abrir.isPending ? "Enviando..." : "Enviar solicitação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
