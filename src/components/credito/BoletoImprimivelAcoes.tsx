import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { BotaoBaixarBoletoPdf } from "@/components/credito/BotaoBaixarBoletoPdf";

/**
 * BOLETO IMPRIMÍVEL — Cobrança Direta carteira 1 Safra: o beneficiário imprime
 * o próprio boleto. O renderizador é a edge function `gerar-boleto-pdf`.
 *
 * ANÁLISE DE RISCO (revisada 09/09/2026): o banco não aceita pagamento de
 * título não registrado, então não existe dinheiro em limbo. Pior caso: o
 * cliente tenta pagar, dá erro e liga. Bloquear o envio, por outro lado, custa
 * CERTO e RECORRENTE (processo não fecha no dia). Logo: caminho comum flui —
 * sem tarja no PDF e envio liberado já em `remessa_gerada`. A exceção real
 * (rejeição de boleto já enviado) é instrumentada com alerta alto em
 * `AlertaBoletoRejeitadoEnviado`.
 */

/** Estados em que o instrumento morreu: não imprime nem envia. */
const MOTIVO_BLOQUEIO: Record<string, string> = {
  baixa_remessa_gerada:
    "Baixa já pedida ao banco: este boleto está sendo baixado — não imprimir nem enviar.",
  baixado_banco:
    "Boleto já baixado no banco — o documento não é mais pagável.",
};

export function BoletoImprimivelAcoes({
  tituloId,
  boletoStatus,
  codigoRejeicao,
  linhaDigitavel,
  codigoBarras,
  onEnviar,
  enviando,
}: {
  tituloId: string;
  boletoStatus: string | null;
  codigoRejeicao?: string | null;
  linhaDigitavel: string | null;
  codigoBarras: string | null;
  onEnviar: () => void;
  enviando?: boolean;
}) {
  // FAIL-LOUD: nada de PDF com dado inventado — diz qual campo falta.
  const faltando: string[] = [];
  if (!linhaDigitavel) faltando.push("linha digitável");
  if (!codigoBarras) faltando.push("código de barras");

  const motivoEstado =
    boletoStatus === "rejeitado"
      ? `Boleto rejeitado pelo banco${codigoRejeicao ? ` (motivo ${codigoRejeicao})` : ""} — reemitir.`
      : boletoStatus
        ? MOTIVO_BLOQUEIO[boletoStatus]
        : undefined;

  const motivoDesabilitado =
    faltando.length > 0
      ? `Falta ${faltando.join(" e ")} — gere a remessa de entrada no Safra antes de imprimir.`
      : motivoEstado;

  const emConfirmacao = boletoStatus === "remessa_gerada";
  const podeEnviar =
    !motivoDesabilitado &&
    (boletoStatus === "registrado" || boletoStatus === "remessa_gerada");

  const motivoEnvio = podeEnviar
    ? undefined
    : (motivoDesabilitado ??
      "Só é possível enviar ao cliente quando existe boleto vivo para o título.");

  const botaoEnviar = (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      disabled={!podeEnviar || enviando}
      onClick={() => podeEnviar && onEnviar()}
    >
      <Mail className="h-3.5 w-3.5 mr-1.5" />
      {enviando ? "Enviando..." : "Enviar boleto ao cliente"}
    </Button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <BotaoBaixarBoletoPdf
          tituloId={tituloId}
          variant="outline"
          rotulo="Baixar boleto (PDF)"
          desabilitado={!!motivoDesabilitado}
          motivoDesabilitado={motivoDesabilitado}
        />
        {motivoEnvio ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">{botaoEnviar}</span>
              </TooltipTrigger>
              <TooltipContent>{motivoEnvio}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          botaoEnviar
        )}
      </div>

      {emConfirmacao && !motivoDesabilitado && (
        // Contexto, não bloqueio.
        <p className="text-xs text-muted-foreground">
          Registro em confirmação no banco. O boleto entra no DDA do cliente após
          a confirmação (hoje mesmo, se a remessa saiu antes das 17h).
        </p>
      )}
    </div>
  );
}

export default BoletoImprimivelAcoes;
