import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Link2, Loader2, CheckCircle2, XCircle, RotateCcw, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format-currency";
import { VincularLancamentoModal } from "./VincularLancamentoModal";

interface Lancamento {
  id: string;
  descricao: string;
  valor: number;
  data_compra: string;
  status: string;
  conta_pagar_id?: string | null;
  fatura_id?: string | null;
}

interface Props {
  lancamento: Lancamento;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  conciliado: { label: "Vinculada", cls: "bg-success/10 text-success border-success/40", icon: Link2 },
  virou_despesa: { label: "Virou despesa", cls: "bg-info/10 text-info border-info/40", icon: CheckCircle2 },
  ignorado: { label: "Ignorada", cls: "bg-muted/10 text-muted-foreground border-border/40", icon: XCircle },
};

/**
 * Detecta padrão de parcelas na descrição do lançamento.
 * Retorna { atual, total } se encontrar, null caso contrário.
 * Cobre: "01/03", "1/3", "(01/03)", "[01/03]", "E01/03", "01-03",
 *        "parcela 1 de 3", "1 de 3"
 */
function detectarParcelas(descricao: string): { atual: number; total: number } | null {
  if (!descricao) return null;
  const desc = descricao.toLowerCase();

  const padraoDeY = desc.match(/(?:parcela\s+)?(\d{1,3})\s+de\s+(\d{1,3})/);
  if (padraoDeY) {
    const atual = parseInt(padraoDeY[1], 10);
    const total = parseInt(padraoDeY[2], 10);
    if (atual > 0 && total > 0 && atual <= total) return { atual, total };
  }

  const padraoBarra = desc.match(/[\(\[]?\s*[a-z]?(\d{1,3})\s*[/\-]\s*(\d{1,3})\s*[\)\]]?/);
  if (padraoBarra) {
    const atual = parseInt(padraoBarra[1], 10);
    const total = parseInt(padraoBarra[2], 10);
    if (atual > 0 && total > 0 && atual <= total && total <= 60) {
      return { atual, total };
    }
  }

  return null;
}

export function AcoesLancamentoCartao({ lancamento }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [vincularOpen, setVincularOpen] = useState(false);
  const qc = useQueryClient();

  const finalizado = lancamento.status !== "pendente";

  async function handleCriarContaAuto() {
    setSalvando(true);
    try {
      const padrao = detectarParcelas(lancamento.descricao || "");
      const totalParcelas = padrao ? padrao.total : 1;
      const gerarTodas = padrao !== null && padrao.atual === 1 && padrao.total > 1;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: resultado, error } = await (supabase as any).rpc(
        "criar_despesa_de_lancamento_v2",
        {
          p_lancamento_id: lancamento.id,
          p_total_parcelas: gerarTodas ? totalParcelas : 1,
          p_gerar_todas: gerarTodas,
        }
      );
      if (error) throw error;
      if (!resultado?.ok) {
        toast.error(resultado?.erro || "Erro ao criar despesa");
        return;
      }
      const qtd = resultado.qtd_contas_criadas || 1;
      const msg = resultado.vinculou_existente
        ? resultado.mensagem || `Vinculado a parcela existente: ${resultado.descricao}`
        : qtd > 1
        ? `Conta criada com ${qtd} parcelas: ${resultado.descricao}`
        : padrao && padrao.atual > 1
        ? `Parcela ${padrao.atual}/${padrao.total} criada: ${resultado.descricao}`
        : `Conta criada: ${resultado.descricao} — ${formatBRL(resultado.valor)}`;
      toast.success(msg, { duration: 5000 });
      qc.invalidateQueries({ queryKey: ["fatura-lancamentos"] });
      qc.invalidateQueries({ queryKey: ["faturas-cartao"] });
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message :
        typeof e === "object" && e !== null
          ? ((e as { message?: string }).message ?? JSON.stringify(e))
          : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setSalvando(false);
    }
  }

  async function handleReativar() {
    setSalvando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: resultado, error } = await (supabase as any).rpc(
        "reativar_lancamento",
        { p_lancamento_id: lancamento.id }
      );
      if (error) throw error;
      if (!resultado?.ok) {
        toast.error(resultado?.erro || "Não foi possível reativar");
        return;
      }
      toast.success("Lançamento voltou pra pendente");
      qc.invalidateQueries({ queryKey: ["fatura-lancamentos"] });
      qc.invalidateQueries({ queryKey: ["faturas-cartao"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setSalvando(false);
    }
  }

  async function handleIgnorar() {
    setSalvando(true);
    try {
      const { error } = await supabase
        .from("fatura_cartao_lancamentos")
        .update({
          status: "ignorado",
          updated_at: new Date().toISOString(),
        })
        .eq("id", lancamento.id);
      if (error) throw error;
      toast.success("Lançamento ignorado");
      qc.invalidateQueries({ queryKey: ["fatura-lancamentos"] });
      qc.invalidateQueries({ queryKey: ["faturas-cartao"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setSalvando(false);
    }
  }

  if (finalizado) {
    const cfg = STATUS_CONFIG[lancamento.status];
    if (!cfg) return null;
    const IconCmp = cfg.icon;
    return (
      <div className="flex items-center gap-1">
        <Badge variant="outline" className={`text-[10px] py-0 px-1.5 h-5 gap-1 ${cfg.cls}`}>
          <IconCmp className="h-2.5 w-2.5" />
          {cfg.label}
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
          onClick={handleReativar}
          disabled={salvando}
          title="Voltar pra pendente"
        >
          {salvando ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RotateCcw className="h-2.5 w-2.5" />}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px] gap-1 border-warning/40 text-warning hover:bg-warning/10"
          onClick={() => setVincularOpen(true)}
          disabled={salvando}
        >
          <Link2 className="h-2.5 w-2.5" />
          Vincular
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px] gap-1 border-info/40 text-info hover:bg-info/10"
          onClick={handleCriarContaAuto}
          disabled={salvando}
          title="Criar conta a pagar (detecta parcelas automaticamente)"
        >
          {salvando ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Plus className="h-2.5 w-2.5" />}
          Criar Conta
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px] gap-1 border-border/40 text-muted-foreground hover:bg-muted/10"
          onClick={handleIgnorar}
          disabled={salvando}
          title="Ocultar este lançamento"
        >
          {salvando ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <EyeOff className="h-2.5 w-2.5" />}
          Ignorar
        </Button>
      </div>

      <VincularLancamentoModal
        open={vincularOpen}
        onOpenChange={setVincularOpen}
        lancamento={lancamento}
      />
    </>
  );
}
