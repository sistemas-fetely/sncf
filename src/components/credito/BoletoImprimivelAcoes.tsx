import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Mail } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { BotaoBaixarBoletoPdf } from "@/components/credito/BotaoBaixarBoletoPdf";

/**
 * BOLETO IMPRIMÍVEL — Cobrança Direta carteira 1 Safra: o beneficiário imprime
 * o próprio boleto. O renderizador é a edge function `gerar-boleto-pdf`
 * (pdf-lib + I25), reaproveitada aqui pelo mesmo motor de download já usado na
 * tela Banco (`BotaoBaixarBoletoPdf`).
 *
 * Duas portas separadas de propósito:
 *  - BAIXAR serve para CONFERÊNCIA interna e fica liberado sempre que existir
 *    linha digitável + código de barras.
 *  - ENVIAR ao cliente exige `boleto_status = 'registrado'`.
 */

/** Estados em que o boleto não deve nem ser impresso: o instrumento morreu ou nunca nasceu. */
const MOTIVO_BLOQUEIO: Record<string, string> = {
  rejeitado:
    "Boleto rejeitado pelo banco — não existe instrumento registrado para imprimir. Corrija a rejeição e gere nova remessa.",
  baixa_remessa_gerada:
    "Baixa já pedida ao banco: este boleto está morrendo. Imprimir agora entregaria um documento que o banco vai baixar.",
  baixado_banco:
    "Boleto já baixado no banco — o documento não é mais pagável.",
};

export function BoletoImprimivelAcoes({
  tituloId,
  boletoStatus,
  linhaDigitavel,
  codigoBarras,
  onEnviar,
  enviando,
}: {
  tituloId: string;
  boletoStatus: string | null;
  linhaDigitavel: string | null;
  codigoBarras: string | null;
  onEnviar: () => void;
  enviando?: boolean;
}) {
  // FAIL-LOUD: nada de PDF com dado inventado — diz qual campo falta.
  const faltando: string[] = [];
  if (!linhaDigitavel) faltando.push("linha digitável");
  if (!codigoBarras) faltando.push("código de barras");

  const motivoEstado = boletoStatus ? MOTIVO_BLOQUEIO[boletoStatus] : undefined;
  const motivoDesabilitado =
    faltando.length > 0
      ? `Falta ${faltando.join(" e ")} — gere a remessa de entrada no Safra antes de imprimir.`
      : motivoEstado;

  const aguardandoRegistro = boletoStatus === "remessa_gerada";
  const podeEnviar = boletoStatus === "registrado";

  const motivoEnvio = podeEnviar
    ? undefined
    : aguardandoRegistro
      ? "Aguardando confirmação de registro no banco — o cliente receberia um boleto que o banco ainda não conhece."
      : (motivoEstado ??
        "Só é possível enviar ao cliente quando o banco confirma o registro do boleto.");

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

      {aguardandoRegistro && !motivoDesabilitado && (
        <Alert className="border-warning/40 bg-warning/10">
          <AlertTriangle className="h-4 w-4 !text-warning" />
          <AlertDescription className="text-warning text-xs">
            Aguardando confirmação de registro no banco — não enviar ao cliente
            ainda. O PDF sai com tarja de conferência.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default BoletoImprimivelAcoes;
