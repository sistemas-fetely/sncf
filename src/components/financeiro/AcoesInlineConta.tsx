import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRightLeft, Paperclip, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { NfStageBuscadorModal } from "./NfStageBuscadorModal";
import { cn } from "@/lib/utils";

/**
 * EIXO PROVAS do título a pagar (reforma ESTADO × PROVAS, Camada 3b — 02/09/2026).
 *
 * ESTADO-NÃO-É-PROVA: um título tem UM estado exclusivo, com transições legais,
 * e VÁRIAS provas independentes. Antes deste arquivo ter sido reescrito, ele
 * misturava as duas coisas num checklist de 4 ícones, onde "Aprovado" (estado)
 * parecia irmão de "NF anexada" (prova).
 *
 * Aqui ficam SÓ as provas. O estado vive no menu de ações da tela, alimentado por
 * `titulo_pagar_transicao_dim` via `fn_titulo_pagar_transicionar`.
 *
 * SAÍRAM daqui:
 *  - Ícone "Aprovar" (ThumbsUp): virou ação do eixo ESTADO na Camada 3a.
 *    LACUNA REGISTRADA: ele chamava `aprovar_cpr_em_cascata`, que aprovava todas
 *    as parcelas do mesmo `parcela_grupo_id` de uma vez. Hoje isso são 2 títulos
 *    em 1 grupo. `fn_titulo_pagar_transicionar` age em UM título. Se a aprovação
 *    em cascata voltar a importar, ela deve nascer DENTRO da RPC, nunca como
 *    UPDATE paralelo.
 *  - Ícone "Email" (Send): o adapter de e-mail foi aposentado por decisão de
 *    02/09/2026. `enviado_para_pagamento` saiu do trilho.
 *  - Leitura de `status_efetivo`: era alias morto de `status` (só divergia em
 *    'aguardando_pagamento', valor que não está no CHECK e tem 0 linhas).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Conta = Record<string, any> & {
  id: string;
  status: string;
  descricao: string;
  valor: number;
  movimentacao_bancaria_id?: string | null;
  nf_numero_repositorio?: string | null;
  comprovante_url?: string | null;
};

interface Props {
  conta: Conta;
  onAbrirEditandoBanco?: (contaId: string) => void;
}

type EstadoIcone = "feito" | "pendente" | "na";

const COR_ICONE: Record<EstadoIcone, string> = {
  feito: "text-success hover:bg-success/10",
  pendente: "text-destructive hover:bg-destructive/10",
  na: "text-muted-foreground cursor-not-allowed hover:bg-transparent",
};

/** Estados em que o título ainda não saiu do caixa — pagar ainda faz sentido. */
const AGUARDANDO_PAGAMENTO = ["aprovado", "programado"];

export default function AcoesInlineConta({ conta, onAbrirEditandoBanco }: Props) {
  const qc = useQueryClient();

  const [lancandoMov, setLancandoMov] = useState(false);
  const [showAnexarNF, setShowAnexarNF] = useState(false);
  const [vinculandoNF, setVinculandoNF] = useState(false);

  const extractMsg = (e: unknown) =>
    e instanceof Error
      ? e.message
      : typeof e === "object" && e !== null
        ? ((e as { message?: string }).message ?? JSON.stringify(e))
        : String(e);

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  const status = conta.status;

  // PROVA 1 — NF: existe se há referência no Repositório (D-60/D-64).
  const temNF = !!conta.nf_numero_repositorio;
  const estadoNF: EstadoIcone = temNF ? "feito" : "pendente";

  // PROVA 2 — Movimentação bancária.
  const temMov = !!conta.movimentacao_bancaria_id;
  const estadoMov: EstadoIcone = temMov
    ? "feito"
    : AGUARDANDO_PAGAMENTO.includes(status)
      ? "pendente"
      : "na";

  // PROVA 3 — Comprovante. SOMENTE LEITURA: não existe mecanismo de anexo de
  // comprovante de SAÍDA no sistema (`comprovante_pagamento` tem `pedido_id`
  // NOT NULL — é comprovante de ENTRADA). Por isso o ícone nunca fica vermelho:
  // vermelho promete uma ação que não existe. Cinza = ausente, verde = presente.
  const temComprovante = !!conta.comprovante_url;
  const estadoComprovante: EstadoIcone = temComprovante ? "feito" : "na";

  async function handleSelecionarNFDoStage(nfStageId: string) {
    setVinculandoNF(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error } = await (supabase as any).rpc("vincular_nf_a_conta", {
        p_nf_id: nfStageId,
        p_conta_id: conta.id,
      });
      if (error) throw error;
      if (!result?.ok && !result?.success) {
        const msg = result?.erro || result?.error || "Falha ao vincular NF";
        toast.error(typeof msg === "string" ? msg : "Falha ao vincular NF");
        return;
      }
      toast.success("NF vinculada à conta");
      setShowAnexarNF(false);
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["conta-pagar-detalhe", conta.id] });
      qc.invalidateQueries({ queryKey: ["nfs-stage"] });
    } catch (e) {
      toast.error("Erro: " + extractMsg(e));
    } finally {
      setVinculandoNF(false);
    }
  }

  async function handleLancarMov() {
    if (estadoMov !== "pendente") {
      if (estadoMov === "feito") toast.info("Pagamento já confirmado");
      else toast.info("Aprove ou programe o título antes de marcar como pago");
      return;
    }
    setLancandoMov(true);
    try {
      // Prova, não estado: esta RPC cria a movimentação e NÃO escreve `status`.
      // Quem move o estado é `fn_titulo_pagar_transicionar`, pelo menu de ações.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error } = await (supabase as any).rpc("gerar_movimentacao_de_conta", {
        p_conta_id: conta.id,
      });
      if (error) throw error;
      if (!result?.ok) {
        const erroMsg = (result?.erro as string) || "";
        if (erroMsg.includes("pago_em_conta_id") && onAbrirEditandoBanco) {
          toast.warning("Antes de marcar como paga, escolha o banco onde foi/será paga.", {
            duration: 4000,
          });
          onAbrirEditandoBanco(conta.id);
          return;
        }
        toast.error(erroMsg || "Erro ao lançar em movimentação");
        return;
      }
      toast.success(result?.ja_existia ? "Pagamento já estava confirmado" : "Movimentação lançada");
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["lancamentos-caixa-banco"] });
    } catch (e) {
      toast.error("Erro: " + extractMsg(e));
    } finally {
      setLancandoMov(false);
    }
  }

  const tooltipNF = temNF
    ? "NF anexada"
    : "Sem NF anexada — clique para anexar do Repositório";
  const tooltipMov =
    estadoMov === "feito"
      ? "Movimentação lançada"
      : estadoMov === "pendente"
        ? "Lançar movimentação (marcar como paga)"
        : "Aprove ou programe o título antes";
  const tooltipComprovante = temComprovante
    ? "Comprovante anexado"
    : "Sem comprovante — ainda não há anexo de comprovante de saída no sistema";

  return (
    <div className="flex items-center gap-1">
      {/* PROVA 1 — NF */}
      <Button
        size="icon"
        variant="ghost"
        className={cn("h-7 w-7", COR_ICONE[estadoNF])}
        title={tooltipNF}
        disabled={vinculandoNF}
        onClick={(e) => {
          if (estadoNF === "pendente") {
            e.stopPropagation();
            setShowAnexarNF(true);
          }
        }}
      >
        {vinculandoNF ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Paperclip className="h-3.5 w-3.5" />
        )}
      </Button>

      {/* PROVA 2 — Movimentação bancária */}
      <Button
        size="icon"
        variant="ghost"
        className={cn("h-7 w-7", COR_ICONE[estadoMov])}
        title={tooltipMov}
        disabled={lancandoMov}
        onClick={stop(handleLancarMov)}
      >
        {lancandoMov ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ArrowRightLeft className="h-3.5 w-3.5" />
        )}
      </Button>

      {/* PROVA 3 — Comprovante (somente leitura) */}
      <Button
        size="icon"
        variant="ghost"
        className={cn("h-7 w-7", COR_ICONE[estadoComprovante])}
        title={tooltipComprovante}
        onClick={(e) => e.stopPropagation()}
      >
        <Receipt className="h-3.5 w-3.5" />
      </Button>

      <NfStageBuscadorModal
        open={showAnexarNF}
        onOpenChange={setShowAnexarNF}
        valorEsperado={conta.valor}
        fornecedorEsperado={conta.fornecedor_cliente || undefined}
        parceiroId={conta.parceiro_id || undefined}
        onSelecionar={handleSelecionarNFDoStage}
      />
    </div>
  );
}
