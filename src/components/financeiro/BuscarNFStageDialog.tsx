import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sparkles,
  Loader2,
  Link2,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Clock,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";

type CandidatoNF = {
  nf_id: string;
  nf_numero: string;
  nf_chave_acesso: string;
  fornecedor_razao_social: string;
  fornecedor_cliente: string;
  fornecedor_cnpj: string;
  nf_data_emissao: string;
  valor_total: number;
  descricao: string;
  categoria_id: string | null;
  categoria_codigo: string | null;
  categoria_nome: string | null;
  score: number;
  motivos: string;
};

type CandidatoCPR = {
  cprId: string;
  descricao: string;
  parcela: string | null;
  dataVencimento: string | null;
  distanciaDias: number;
  valor: number;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contaId: string;
  contaDescricao: string;
  contaValor: number;
  onVinculado?: () => void;
}

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v ?? 0);
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${dd}/${m}/${y}`;
}

function extrairParcela(descricao: string | null): string | null {
  if (!descricao) return null;
  const match = descricao.match(/(\d+\/\d+)/);
  return match ? match[1] : null;
}

export default function BuscarNFStageDialog({
  open,
  onOpenChange,
  contaId,
  contaDescricao,
  contaValor,
  onVinculado,
}: Props) {
  const qc = useQueryClient();
  const [vinculando, setVinculando] = useState<string | null>(null);

  // Estado pra fluxo de múltiplos candidatos
  const [nfEscolhida, setNfEscolhida] = useState<CandidatoNF | null>(null);
  const [candidatosCPR, setCandidatosCPR] = useState<CandidatoCPR[] | null>(null);
  const [carregandoCandidatos, setCarregandoCandidatos] = useState(false);
  const [cprSelecionado, setCprSelecionado] = useState<string>("");

  useEffect(() => {
    if (!open) {
      setNfEscolhida(null);
      setCandidatosCPR(null);
      setCprSelecionado("");
    }
  }, [open]);

  // Busca info do compromisso parcelado (se houver)
  const { data: compromissoInfo } = useQuery({
    queryKey: ["compromisso-info-busca-nf", contaId],
    enabled: open && !!contaId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: conta } = await (supabase as any)
        .from("contas_pagar_receber")
        .select("compromisso_parcelado_id")
        .eq("id", contaId)
        .maybeSingle();
      const compId = conta?.compromisso_parcelado_id;
      if (!compId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: comp } = await (supabase as any)
        .from("compromissos_parcelados")
        .select("id, descricao, valor_total, qtd_parcelas")
        .eq("id", compId)
        .maybeSingle();
      return comp || null;
    },
  });

  const valorParaMatch = Number(compromissoInfo?.valor_total ?? contaValor ?? 0);

  const { data: candidatos = [], isLoading } = useQuery({
    queryKey: ["buscar-nfs-stage", contaId],
    enabled: open && !!contaId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "buscar_nfs_stage_para_conta",
        { p_conta_id: contaId }
      );
      if (error) throw error;
      return (data || []) as CandidatoNF[];
    },
  });

  // Pré-seleciona menor distância
  useEffect(() => {
    if (candidatosCPR && candidatosCPR.length > 0 && !cprSelecionado) {
      setCprSelecionado(candidatosCPR[0].cprId);
    }
  }, [candidatosCPR, cprSelecionado]);

  async function handleClickVincular(nf: CandidatoNF) {
    // Antes de vincular, verifica se há múltiplos candidatos CPR pra essa NF
    setCarregandoCandidatos(true);
    setNfEscolhida(nf);
    try {
      // 1) Descobre parceiro_id da conta atual (pra usar como referência de parceiro)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: contaAtual } = await (supabase as any)
        .from("contas_pagar_receber")
        .select("parceiro_id")
        .eq("id", contaId)
        .maybeSingle();
      const parceiroId = contaAtual?.parceiro_id;

      if (!parceiroId) {
        // Sem parceiro_id → vincula direto
        await doVincular(nf.nf_id, contaId);
        return;
      }

      const valorNF = Number(nf.valor_total || 0);
      // 2) Busca CPRs do mesmo parceiro com valor próximo
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cprsCandidatas } = await (supabase as any)
        .from("contas_pagar_receber")
        .select("id, descricao, valor, data_vencimento, parceiro_id")
        .eq("parceiro_id", parceiroId)
        .eq("tipo", "pagar")
        .neq("status", "cancelado")
        .gte("valor", valorNF - 0.05)
        .lte("valor", valorNF + 0.05);

      const lista = (cprsCandidatas || []) as Array<{
        id: string;
        descricao: string;
        valor: number;
        data_vencimento: string | null;
      }>;

      // Garante que a conta atual está na lista (caso valor difira ligeiramente)
      const incluiAtual = lista.some((c) => c.id === contaId);
      if (!incluiAtual) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: cAtual } = await (supabase as any)
          .from("contas_pagar_receber")
          .select("id, descricao, valor, data_vencimento")
          .eq("id", contaId)
          .maybeSingle();
        if (cAtual) lista.push(cAtual);
      }

      if (lista.length <= 1) {
        // Caso simples: vincula direto à conta atual
        await doVincular(nf.nf_id, contaId);
        return;
      }

      // 3) Calcula distância temporal
      const dataNF = nf.nf_data_emissao
        ? new Date(nf.nf_data_emissao.slice(0, 10) + "T00:00:00")
        : null;
      const ordenados: CandidatoCPR[] = lista
        .map((cpr) => {
          const dataVenc = cpr.data_vencimento
            ? new Date(cpr.data_vencimento.slice(0, 10) + "T00:00:00")
            : null;
          const distanciaDias =
            dataNF && dataVenc
              ? Math.abs(
                  Math.floor(
                    (dataNF.getTime() - dataVenc.getTime()) / (1000 * 60 * 60 * 24),
                  ),
                )
              : 999999;
          return {
            cprId: cpr.id,
            descricao: cpr.descricao || "—",
            parcela: extrairParcela(cpr.descricao),
            dataVencimento: cpr.data_vencimento,
            distanciaDias,
            valor: Number(cpr.valor || 0),
          };
        })
        .sort((a, b) => a.distanciaDias - b.distanciaDias);

      setCandidatosCPR(ordenados);
      setCprSelecionado(ordenados[0]?.cprId || "");
    } catch (e) {
      toast.error("Erro ao buscar candidatos: " + formatError(e));
      setNfEscolhida(null);
    } finally {
      setCarregandoCandidatos(false);
    }
  }

  async function doVincular(nfId: string, cprId: string) {
    setVinculando(nfId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("vincular_nf_a_conta", {
        p_nf_id: nfId,
        p_conta_id: cprId,
      });
      if (error) throw error;
      if (!data?.ok && !data?.success) {
        const errMsg = data?.erro || data?.error || data?.message;
        toast.error(typeof errMsg === "string" ? errMsg : "Erro ao vincular NF");
        return;
      }
      toast.success("NF vinculada — dados enriquecidos");
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["conta-pagar-detalhe", cprId] });
      qc.invalidateQueries({ queryKey: ["nfs-anexadas-cpr", cprId] });
      qc.invalidateQueries({ queryKey: ["nfs-stage"] });
      qc.invalidateQueries({ queryKey: ["nfs-vinculadas-mov"] });
      qc.invalidateQueries({ queryKey: ["lancamentos-caixa-banco"] });
      if (onVinculado) onVinculado();
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao vincular: " + formatError(e));
    } finally {
      setVinculando(null);
    }
  }

  const menorDistancia = useMemo(
    () =>
      candidatosCPR && candidatosCPR.length > 0
        ? Math.min(...candidatosCPR.map((c) => c.distanciaDias))
        : 0,
    [candidatosCPR],
  );

  // ========== RENDER ==========
  // Modo "escolher CPR entre múltiplos candidatos"
  if (nfEscolhida && candidatosCPR && candidatosCPR.length > 1) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Múltiplas parcelas encontradas
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1">
                <div className="text-sm">
                  NF nº <strong>{nfEscolhida.nf_numero || "—"}</strong> ·{" "}
                  {formatBRL(Number(nfEscolhida.valor_total))} · emitida em{" "}
                  <strong>{formatDate(nfEscolhida.nf_data_emissao)}</strong>
                </div>
                <div className="text-xs">
                  Confirme qual parcela corresponde a esta NF.
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="text-sm text-amber-900">
              {candidatosCPR.length} parcelas em aberto deste parceiro com mesmo valor.
              IA sugeriu a mais próxima da data da NF.
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900 space-y-1">
              <div className="font-medium">Como escolher a parcela correta:</div>
              <ul className="list-disc list-inside space-y-0.5 text-blue-800">
                <li>
                  NF emitida em:{" "}
                  <strong>{formatDate(nfEscolhida.nf_data_emissao)}</strong>
                </li>
                <li>Verifique a data de vencimento mais próxima da emissão</li>
                <li>Confira o número da parcela quando disponível</li>
              </ul>
            </div>
          </div>

          <RadioGroup
            value={cprSelecionado}
            onValueChange={setCprSelecionado}
            className="space-y-2"
          >
            {candidatosCPR.map((cand) => {
              const isSugerido = cand.distanciaDias === menorDistancia;
              return (
                <label
                  key={cand.cprId}
                  htmlFor={cand.cprId}
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    cprSelecionado === cand.cprId
                      ? "border-emerald-400 bg-emerald-50/40"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <RadioGroupItem
                    value={cand.cprId}
                    id={cand.cprId}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {cand.parcela && (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-bold bg-slate-100 border-slate-300"
                        >
                          {cand.parcela}
                        </Badge>
                      )}
                      <span className="font-semibold text-sm">
                        {formatBRL(cand.valor)}
                      </span>
                      {isSugerido && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-blue-50 text-blue-700 border-blue-200"
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          IA sugere
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs flex-wrap">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        Venc: {formatDate(cand.dataVencimento)}
                      </span>
                      <span
                        className={cn(
                          "flex items-center gap-1 font-medium",
                          cand.distanciaDias === 999999 && "text-muted-foreground",
                          cand.distanciaDias <= 7 && "text-emerald-600",
                          cand.distanciaDias > 7 && cand.distanciaDias <= 30 && "text-blue-600",
                          cand.distanciaDias > 30 && cand.distanciaDias < 999999 && "text-orange-600",
                        )}
                      >
                        <Clock className="h-3 w-3" />
                        {cand.distanciaDias === 999999
                          ? "—"
                          : cand.distanciaDias === 0
                            ? "Mesmo dia"
                            : cand.distanciaDias === 1
                              ? "1 dia de diferença"
                              : `${cand.distanciaDias} dias de diferença`}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {cand.descricao}
                    </div>
                  </div>
                </label>
              );
            })}
          </RadioGroup>

          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setNfEscolhida(null);
                setCandidatosCPR(null);
                setCprSelecionado("");
              }}
              disabled={!!vinculando}
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Voltar
            </Button>
            <Button
              onClick={() => doVincular(nfEscolhida.nf_id, cprSelecionado)}
              disabled={!cprSelecionado || !!vinculando}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {vinculando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Link2 className="h-3.5 w-3.5 mr-1" />
              )}
              Confirmar Vínculo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-600" />
            Buscar NF em Stage
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1">
              <div>
                Conta: <span className="font-medium">{contaDescricao}</span> —{" "}
                {formatBRL(contaValor)}
              </div>
              {compromissoInfo && (
                <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                  ✨ Buscando NF do compromisso completo (
                  {compromissoInfo.qtd_parcelas} parcelas) —{" "}
                  <span className="font-medium">
                    {formatBRL(Number(compromissoInfo.valor_total))}
                  </span>
                </div>
              )}
              <div className="text-xs">
                IA busca match por CNPJ, valor, razão social, nome fantasia e
                data de emissão.
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : candidatos.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground space-y-2">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p>Nenhuma NF compatível encontrada em Stage.</p>
              <p className="text-xs">
                Use o botão "Anexar NF" pra subir um PDF/XML manualmente.
              </p>
            </div>
          ) : (
            candidatos.map((c) => (
              <div
                key={c.nf_id}
                className="border rounded-lg overflow-hidden transition-colors hover:border-emerald-300"
              >
                <div className="p-3 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">
                      {c.fornecedor_razao_social ||
                        c.fornecedor_cliente ||
                        "—"}
                    </span>
                    <Badge
                      className={
                        c.score >= 80
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]"
                          : c.score >= 60
                            ? "bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px]"
                            : "bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]"
                      }
                    >
                      {c.score}% match
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    NF nº {c.nf_numero || "—"} · {formatDate(c.nf_data_emissao)}{" "}
                    · {formatBRL(c.valor_total)}
                    {(() => {
                      if (
                        valorParaMatch > 0 &&
                        Math.abs(c.valor_total - valorParaMatch) < 0.01
                      ) {
                        return (
                          <span className="text-emerald-700 font-medium">
                            {" "}
                            (= {formatBRL(valorParaMatch)})
                          </span>
                        );
                      }
                      if (!contaValor || contaValor <= 0) return null;
                      const ratio = c.valor_total / contaValor;
                      const ratioRounded = Math.round(ratio);
                      if (
                        ratioRounded >= 2 &&
                        ratioRounded <= 36 &&
                        Math.abs(ratio - ratioRounded) <= 0.02
                      ) {
                        return (
                          <span className="text-blue-700 font-medium">
                            {" "}
                            ({ratioRounded}x {formatBRL(contaValor)})
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </p>

                  {c.fornecedor_cnpj && (
                    <p className="text-xs text-muted-foreground">
                      CNPJ {c.fornecedor_cnpj}
                    </p>
                  )}
                  {c.categoria_codigo && (
                    <p className="text-xs text-muted-foreground">
                      📁 {c.categoria_codigo} {c.categoria_nome}
                    </p>
                  )}
                  {c.motivos && (
                    <p className="text-[11px] text-blue-600">✨ {c.motivos}</p>
                  )}
                </div>

                <div className="px-3 py-2 bg-muted/30 border-t border-dashed flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    Verifica parcelas em aberto antes de vincular
                  </span>
                  <Button
                    size="sm"
                    onClick={() => handleClickVincular(c)}
                    disabled={!!vinculando || carregandoCandidatos}
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {(vinculando === c.nf_id ||
                      (carregandoCandidatos &&
                        nfEscolhida?.nf_id === c.nf_id)) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" />
                    )}
                    Vincular
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
