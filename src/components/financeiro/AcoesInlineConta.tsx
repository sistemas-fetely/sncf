import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ThumbsUp,
  Send,
  ArrowRightLeft,
  Paperclip,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import EnviarPagamentoDialog from "./EnviarPagamentoDialog";
import { NfStageBuscadorModal } from "./NfStageBuscadorModal";

import { cn } from "@/lib/utils";
import {
  getFamiliaContaPagar,
  getRegraIconeEmail,
} from "@/lib/financeiro/familia-conta-pagar";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Conta = Record<string, any> & {
  id: string;
  status: string;
  status_efetivo?: string | null;
  descricao: string;
  valor: number;
  tem_doc_pendente?: boolean | null;
  movimentacao_bancaria_id?: string | null;
  nf_numero_repositorio?: string | null;
  email_pagamento_enviado?: boolean | null;
  // Campos pra regra do ícone email (família + forma de pagamento)
  meio_pagamento_id?: string | null;
  meios_pagamento?: { codigo?: string | null } | null;
  origem?: string | null;
  formas_pagamento?: { codigo?: string | null; nome?: string | null; cobra_email?: boolean | null } | null;
};

interface Props {
  conta: Conta;
  onAbrirEditandoBanco?: (contaId: string) => void;
}

type EstadoIcone = "feito" | "pendente" | "na";

const COR_ICONE: Record<EstadoIcone, string> = {
  feito: "text-emerald-600 hover:bg-emerald-50",
  pendente: "text-rose-600 hover:bg-rose-50",
  na: "text-zinc-300 cursor-not-allowed hover:bg-transparent",
};

export default function AcoesInlineConta({ conta, onAbrirEditandoBanco }: Props) {
  const qc = useQueryClient();
  
  const [aprovando, setAprovando] = useState(false);
  const [lancandoMov, setLancandoMov] = useState(false);
  const [showEnviar, setShowEnviar] = useState(false);
  const [showAnexarNF, setShowAnexarNF] = useState(false);
  const [vinculandoNF, setVinculandoNF] = useState(false);

  async function handleSelecionarNFDoStage(nfStageId: string) {
    setVinculandoNF(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error } = await (supabase as any).rpc(
        "vincular_nf_a_conta",
        { p_nf_id: nfStageId, p_conta_id: conta.id },
      );
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

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  

  const extractMsg = (e: unknown) =>
    e instanceof Error
      ? e.message
      : typeof e === "object" && e !== null
        ? ((e as { message?: string }).message ?? JSON.stringify(e))
        : String(e);

  // ESTADOS — usa critérios robustos
  const status = conta.status;
  const statusEfetivo = conta.status_efetivo || status;

  // NF: tem se há referência no Repositório (Stage é validação pós-Movimentação — D-60/D-64)
  const temNF = !!conta.nf_numero_repositorio;

  const aprovado =
    status === "aprovado" ||
    status === "enviado_para_pagamento" ||
    status === "doc_pendente" ||
    statusEfetivo === "enviado_para_pagamento" ||
    statusEfetivo === "conciliado";

  const temMov = !!conta.movimentacao_bancaria_id;

  const estadoNF: EstadoIcone = temNF ? "feito" : "pendente";
  const estadoAprovar: EstadoIcone = aprovado ? "feito" : "pendente";

  const familia = getFamiliaContaPagar({
    meio_codigo: conta.meios_pagamento?.codigo ?? null,
    origem: conta.origem ?? null,
  });
  const regraEmail = getRegraIconeEmail({
    familia,
    forma_cobra_email: conta.formas_pagamento?.cobra_email ?? null,
    status,
    email_pagamento_enviado: conta.email_pagamento_enviado ?? null,
  });
  const estadoEmail: EstadoIcone =
    regraEmail === "verde" ? "feito"
    : regraEmail === "vermelho" ? "pendente"
    : "na";

  const estadoMov: EstadoIcone =
    temMov ? "feito"
    : status === "aprovado" ? "pendente"
    : "na";

  async function handleAprovar() {
    if (estadoAprovar !== "pendente") return;
    setAprovando(true);
    try {
      // Cartão vai direto pra enviado_para_pagamento (sem etapa de envio de email)
      const statusAlvo = conta.meios_pagamento?.codigo === "fatura_cartao" ? "enviado_para_pagamento" : "aprovado";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error } = await (supabase as any).rpc(
        "aprovar_cpr_em_cascata",
        { p_cpr_id: conta.id, p_status_alvo: statusAlvo },
      );
      if (error) throw error;
      if (!result?.ok) {
        throw new Error(result?.erro || "Falha ao aprovar");
      }
      const total = result.parcelas_aprovadas as number;
      if (total > 1) {
        toast.success(`${total} parcelas do pedido aprovadas`);
      } else {
        toast.success("Conta aprovada");
      }
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["conta-pagar-detalhe", conta.id] });
    } catch (e) {
      toast.error("Erro: " + extractMsg(e));
    } finally {
      setAprovando(false);
    }
  }

  async function handleLancarMov() {
    if (estadoMov !== "pendente") {
      if (estadoMov === "feito") toast.info("Pagamento já confirmado");
      else toast.info("Aprove antes de marcar como paga");
      return;
    }
    setLancandoMov(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error } = await (supabase as any).rpc(
        "gerar_movimentacao_de_conta",
        { p_conta_id: conta.id },
      );
      if (error) throw error;
      if (!result?.ok) {
        const erroMsg = (result?.erro as string) || "";
        if (erroMsg.includes("pago_em_conta_id") && onAbrirEditandoBanco) {
          toast.warning(
            "Antes de marcar como paga, escolha o banco onde foi/será paga.",
            { duration: 4000 },
          );
          onAbrirEditandoBanco(conta.id);
          return;
        }
        toast.error(erroMsg || "Erro ao lançar em movimentação");
        return;
      }
      toast.success(
        result?.ja_existia ? "Pagamento já estava confirmado" : "Marcada como paga",
      );
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["lancamentos-caixa-banco"] });
    } catch (e) {
      toast.error("Erro: " + extractMsg(e));
    } finally {
      setLancandoMov(false);
    }
  }

  function handleEmail() {
    if (estadoEmail === "na") {
      toast.info(
        "Email de pagamento não se aplica aqui (cartão, OFX, ou forma sem cobrança). Pra reenviar manualmente, abra o drawer.",
      );
      return;
    }
    if (estadoEmail === "feito") {
      toast.info("Email já enviado — abra o drawer pra reenviar se precisar");
      return;
    }
    setShowEnviar(true);
  }

  const tooltipNF = temNF
    ? "NF anexada"
    : "Sem NF anexada — abra o detalhe pra anexar do Repositório";
  const tooltipAprovar = aprovado ? "Já aprovada" : "Aprovar pagamento";
  const tooltipEmail =
    estadoEmail === "feito"
      ? "Email enviado"
      : estadoEmail === "pendente"
        ? "Enviar email de pagamento"
        : "Email não se aplica (cartão, OFX, ou forma sem cobrança)";
  const tooltipMov =
    estadoMov === "feito"
      ? "Pagamento confirmado"
      : estadoMov === "pendente"
        ? "Marcar como paga"
        : "Aprove antes de marcar como paga";

  return (
    <div className="flex items-center gap-1">
      {/* 1) NF — vermelho abre modal de anexar do Repositório; verde propaga pra abrir drawer. */}
      <Button
        size="icon"
        variant="ghost"
        className={cn("h-7 w-7", COR_ICONE[estadoNF])}
        title={estadoNF === "pendente" ? "Anexar NF do Repositório" : tooltipNF}
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

      {/* 2) Aprovar */}
      <Button
        size="icon"
        variant="ghost"
        className={cn("h-7 w-7", COR_ICONE[estadoAprovar])}
        title={tooltipAprovar}
        disabled={aprovando}
        onClick={stop(handleAprovar)}
      >
        {aprovando ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ThumbsUp className="h-3.5 w-3.5" />
        )}
      </Button>

      {/* 3) Email */}
      <Button
        size="icon"
        variant="ghost"
        className={cn("h-7 w-7", COR_ICONE[estadoEmail])}
        title={tooltipEmail}
        onClick={stop(handleEmail)}
      >
        <Send className="h-3.5 w-3.5" />
      </Button>

      {/* 4) Movimentação — oculto em enviado_para_pagamento (conciliação automática) */}
      {status !== "enviado_para_pagamento" && (
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
      )}

      {/* Modais */}
      {showEnviar && (
        <EnviarPagamentoDialog
          open={showEnviar}
          onOpenChange={setShowEnviar}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          conta={conta as any}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["contas-pagar"] });
          }}
        />
      )}

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
