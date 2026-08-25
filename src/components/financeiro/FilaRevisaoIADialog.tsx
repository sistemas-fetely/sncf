import { useState, useEffect } from "react";
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
import { Sparkles, Check, SkipForward, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fmtData } from "@/lib/data";

type Ambiguo = {
  tipo: "categoria" | "nf";
  conta_id: string;
  parcela_grupo_id: string | null;
  descricao: string;
  valor_referencia: number;
  qtd_parcelas: number;
};

type CandidatoNF = {
  nf_id: string;
  fornecedor_razao_social: string;
  fornecedor_cnpj: string;
  nf_numero: string;
  valor_nf: number;
  data_emissao: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itens?: any;
  nf_chave_acesso?: string;
  arquivo_nome?: string;
  nf_serie?: string;
};

type Similar = {
  conta_id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  parceiro_nome: string | null;
  cnpj: string | null;
  categoria_codigo: string;
  categoria_nome: string;
  match_score: number;
  match_motivo: string;
};

type CandidatoCategoria = {
  categoria_id: string;
  categoria_codigo: string;
  categoria_nome: string;
  score: number;
  motivo: string;
  amostra_descricao: string;
  amostra_count: number;
  similares: Similar[];
};

interface Props {
  open: boolean;
  onClose: () => void;
}

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v ?? 0);
}

function formatDate(d: string | null) {
  if (!d) return "—";
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${dd}/${m}/${y}`;
}

export default function FilaRevisaoIADialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [idx, setIdx] = useState(0);
  const [resolvendo, setResolvendo] = useState(false);

  useEffect(() => {
    if (open) setIdx(0);
  }, [open]);

  const { data: fila = [], isLoading: loadingFila } = useQuery({
    queryKey: ["ia-fila-ambiguos"],
    enabled: open,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("ia_listar_ambiguos");
      if (error) throw error;
      return (data || []) as Ambiguo[];
    },
  });

  const atual = fila[idx];

  const { data: candidatosNF = [] } = useQuery({
    queryKey: ["ia-candidatos-nf", atual?.conta_id],
    enabled: !!atual && atual.tipo === "nf",
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "ia_listar_nfs_candidatas",
        { p_conta_id: atual!.conta_id },
      );
      if (error) throw error;
      return (data || []) as CandidatoNF[];
    },
  });

  const { data: candidatosCat = [] } = useQuery({
    queryKey: ["ia-candidatos-cat", atual?.conta_id],
    enabled: !!atual && atual.tipo === "categoria",
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: conta } = await (supabase as any)
        .from("contas_pagar_receber")
        .select("descricao, parceiro_id, nf_cnpj_emitente")
        .eq("id", atual!.conta_id)
        .single();
      if (!conta) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "sugerir_categoria_para_lancamento",
        {
          p_descricao: conta.descricao,
          p_cnpj: conta.nf_cnpj_emitente,
          p_parceiro_id: conta.parceiro_id,
          p_conta_id: atual!.conta_id,
        },
      );
      if (error) throw error;
      // normaliza "similares" — pode vir como string JSON, array, ou null
      const normalized = (data || []).map((row: Record<string, unknown>) => {
        let sims = row.similares;
        if (typeof sims === "string") {
          try { sims = JSON.parse(sims); } catch { sims = []; }
        }
        if (!Array.isArray(sims)) sims = [];
        return { ...row, similares: sims };
      });
      return normalized as CandidatoCategoria[];
    },
  });



  function avancar() {
    if (idx + 1 >= fila.length) {
      toast.success("Fila zerada — todos os ambíguos resolvidos");
      qc.invalidateQueries({ queryKey: ["lancamentos-caixa-banco"] });
      onClose();
      return;
    }
    setIdx(idx + 1);
  }

  async function aplicarNF(nfId: string) {
    if (!atual) return;
    setResolvendo(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "vincular_nf_a_conta",
        { p_nf_id: nfId, p_conta_id: atual.conta_id },
      );
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.erro || "Erro");
        return;
      }
      if (atual.parcela_grupo_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: errUpd } = await (supabase as any)
          .from("contas_pagar_receber")
          .update({ tem_sugestao_nf: false })
          .eq("parcela_grupo_id", atual.parcela_grupo_id);
        if (errUpd) throw errUpd;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: errUpd } = await (supabase as any)
          .from("contas_pagar_receber")
          .update({ tem_sugestao_nf: false })
          .eq("id", atual.conta_id);
        if (errUpd) throw errUpd;
      }
      toast.success("NF vinculada");
      avancar();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message :
        typeof e === "object" && e !== null
          ? ((e as { message?: string }).message ?? JSON.stringify(e))
          : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setResolvendo(false);
    }
  }

  async function aplicarCategoria(catId: string) {
    if (!atual) return;
    setResolvendo(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("contas_pagar_receber")
        .update({
          plano_conta_id: catId,
          categoria_sugerida_ia: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", atual.conta_id);
      if (error) throw error;
      toast.success("Categoria aplicada");
      avancar();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message :
        typeof e === "object" && e !== null
          ? ((e as { message?: string }).message ?? JSON.stringify(e))
          : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setResolvendo(false);
    }
  }

  async function pular() {
    avancar();
  }

  async function descartar() {
    if (!atual) return;
    const campo =
      atual.tipo === "categoria" ? "categoria_sugerida_ia" : "tem_sugestao_nf";
    if (atual.parcela_grupo_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("contas_pagar_receber")
        .update({ [campo]: false })
        .eq("parcela_grupo_id", atual.parcela_grupo_id);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("contas_pagar_receber")
        .update({ [campo]: false })
        .eq("id", atual.conta_id);
    }
    avancar();
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-warning" />
            IA precisa da sua ajuda
          </DialogTitle>
          <DialogDescription>
            {fila.length > 0 && atual && `Caso ${idx + 1} de ${fila.length}`}
          </DialogDescription>
        </DialogHeader>

        {loadingFila ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !atual ? (
          <div className="text-center py-12 space-y-2">
            <Check className="h-8 w-8 mx-auto text-success" />
            <p className="text-sm font-medium">Nenhum ambíguo. Tudo OK!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header do caso */}
            <div className="border rounded-md p-3 bg-muted/30">
              <div className="text-xs font-medium text-muted-foreground">
                {atual.tipo === "categoria"
                  ? "🏷️ Categoria pendente"
                  : "📜 NF pendente"}
              </div>
              <div className="text-sm font-medium mt-1 truncate">
                {atual.descricao}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {atual.qtd_parcelas > 1
                  ? `${atual.qtd_parcelas} parcelas · Total: ${formatBRL(atual.valor_referencia)}`
                  : formatBRL(atual.valor_referencia)}
              </div>
            </div>

            {/* Candidatos */}
            <div className="space-y-2">
              {atual.tipo === "nf" &&
                candidatosNF.map((c) => (
                  <div
                    key={c.nf_id}
                    className="border rounded-md p-3 hover:bg-muted/30"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        {/* Linha 1: fornecedor + badge série */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">
                            {c.fornecedor_razao_social ?? "Sem fornecedor"}
                          </span>
                          {c.nf_serie && (
                            <Badge variant="outline" className="text-[10px]">
                              Série {c.nf_serie}
                            </Badge>
                          )}
                        </div>

                        {/* Linha 2: nº + data + valor */}
                        <div className="text-xs text-muted-foreground">
                          NF nº {c.nf_numero ?? "—"}
                          {c.data_emissao && ` • ${formatDate(c.data_emissao)}`}
                          {` • ${formatBRL(c.valor_nf)}`}
                        </div>

                        {/* Linha 3: CNPJ */}
                        {c.fornecedor_cnpj && (
                          <div className="text-xs text-muted-foreground">
                            CNPJ: {c.fornecedor_cnpj}
                          </div>
                        )}

                        {/* Caixa amarela: itens da NF — chave de desempate */}
                        {Array.isArray(c.itens) && c.itens.length > 0 && (
                          <div className="mt-2 p-2 bg-warning/10 border border-warning/40 rounded text-xs">
                            <div className="font-medium text-warning mb-1">
                              Itens da NF ({c.itens.length}):
                            </div>
                            <ul className="space-y-0.5 text-warning">
                              {c.itens.slice(0, 5).map((item: any, idx: number) => (
                                <li key={idx} className="truncate">
                                  • {item.descricao ?? item.nome ?? "Sem descrição"}
                                  {item.quantidade ? ` (${item.quantidade}x)` : ""}
                                </li>
                              ))}
                              {c.itens.length > 5 && (
                                <li className="text-warning italic">
                                  +{c.itens.length - 5} item(ns)
                                </li>
                              )}
                            </ul>
                          </div>
                        )}

                        {/* Rodapé técnico: arquivo + final da chave */}
                        {(c.arquivo_nome || c.nf_chave_acesso) && (
                          <div className="mt-2 text-[10px] text-muted-foreground space-y-0.5 border-t pt-1">
                            {c.arquivo_nome && (
                              <div className="truncate">📄 {c.arquivo_nome}</div>
                            )}
                            {c.nf_chave_acesso && (
                              <div className="font-mono">🔑 ...{c.nf_chave_acesso.slice(-12)}</div>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => aplicarNF(c.nf_id)}
                        disabled={resolvendo}
                        className="gap-1 bg-success hover:bg-success"
                      >
                        {resolvendo ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Esta
                      </Button>
                    </div>
                  </div>
                ))}

              {atual.tipo === "categoria" &&
                candidatosCat.map((c) => (
                  <div
                    key={c.categoria_id}
                    className="border rounded-md p-3 hover:bg-muted/30"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="text-sm font-medium">
                          <span className="font-mono text-xs text-muted-foreground mr-2">
                            {c.categoria_codigo}
                          </span>
                          {c.categoria_nome}
                          <span className="ml-2 inline-flex items-center rounded-full bg-warning/10 text-warning px-2 py-0.5 text-[10px] font-medium">
                            {c.score}%
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {c.motivo} · {c.amostra_count} similar
                          {c.amostra_count > 1 ? "es" : ""}
                        </div>
                        {c.amostra_descricao && (
                          <div className="text-[11px] text-muted-foreground italic truncate">
                            ex: "{c.amostra_descricao}"
                          </div>
                        )}
                        {c.similares && c.similares.length > 0 && (
                          <div className="mt-2">
                            <div className="text-[11px] font-medium text-info mb-1.5">
                              Lançamentos similares que a IA usou de base ({c.similares.length}):
                            </div>
                            <div className="space-y-1.5 pl-2 border-l-2 border-info/40">
                              {c.similares.map((s) => (
                                <div
                                  key={s.conta_id}
                                  className="text-[11px] bg-info/10 rounded px-2 py-1.5"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium truncate">{s.descricao}</div>
                                      <div className="text-[10px] text-muted-foreground mt-0.5">
                                        {formatBRL(Number(s.valor))}
                                        {" · "}
                                        {fmtData(s.data_vencimento)}
                                        {s.parceiro_nome && ` · ${s.parceiro_nome}`}
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className="inline-flex items-center rounded-full bg-info/10 text-info px-1.5 py-0.5 text-[9px] font-medium">
                                        {s.match_motivo} {s.match_score}%
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => aplicarCategoria(c.categoria_id)}
                        disabled={resolvendo}
                        className="gap-1 bg-success hover:bg-success"
                      >
                        {resolvendo ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Esta
                      </Button>
                    </div>
                  </div>
                ))}

              {atual.tipo === "nf" && candidatosNF.length === 0 && (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  Nenhuma NF candidata encontrada.
                </div>
              )}
              {atual.tipo === "categoria" && candidatosCat.length === 0 && (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  Nenhuma categoria sugerida.
                </div>
              )}
            </div>

            {/* Ações de fila */}
            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={descartar}
                disabled={resolvendo}
                className="gap-1 text-muted-foreground"
              >
                <X className="h-3 w-3" />
                Descartar (não perguntar mais)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={pular}
                disabled={resolvendo}
                className="gap-1"
              >
                Pular
                <SkipForward className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
