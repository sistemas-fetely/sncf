import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { CategoriaCombobox } from "@/components/financeiro/CategoriaCombobox";
import { useCategoriasPlano } from "@/hooks/useCategoriasPlano";
import { useFormasPagamento } from "@/hooks/financeiro/useFormasPagamento";
import { extractError } from "@/lib/extract-error";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Etapa = "loading" | "escolher" | "criar";

interface CprCandidato {
  cpr_id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  status: string;
}

interface BoletoStage {
  id: string;
  valor: number | null;
  vencimento: string | null;
  beneficiario_nome: string | null;
  beneficiario_cnpj: string | null;
  cpr_match_candidatos: CprCandidato[] | null;
  ged_documento_id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gedDocumentoId: string | null;
  /** Nome do documento, pra sugerir descrição */
  nomeDocumento?: string;
}

export function RotearBoletoDialog({
  open,
  onOpenChange,
  gedDocumentoId,
  nomeDocumento,
}: Props) {
  const qc = useQueryClient();
  const { data: categoriasAll = [] } = useCategoriasPlano();
  const { data: meios = [] } = useFormasPagamento();

  // Doutrina #07.6 — apenas categorias folha do tipo despesa
  const categorias = (() => {
    const arr = categoriasAll as Array<{ id: string; parent_id?: string | null }>;
    const idsComFilhos = new Set(
      arr.map((c) => c.parent_id).filter((id): id is string => Boolean(id)),
    );
    return arr.filter((c) => !idsComFilhos.has(c.id)) as typeof categoriasAll;
  })();

  const [etapa, setEtapa] = useState<Etapa>("loading");
  const [boleto, setBoleto] = useState<BoletoStage | null>(null);
  const [candidatos, setCandidatos] = useState<CprCandidato[]>([]);
  const [cprEscolhida, setCprEscolhida] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [formaPagamentoId, setFormaPagamentoId] = useState<string | null>(null);
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);

  type EtapaCpr = "criar" | "oferta_lote" | "executando_lote";
  const [etapaCpr, setEtapaCpr] = useState<EtapaCpr>("criar");
  const [pendentesLote, setPendentesLote] = useState<{
    qtd: number;
    ids: string[];
    parceiro_nome: string | null;
  } | null>(null);
  const [dadosLote, setDadosLote] = useState<{
    categoria_id: string;
    forma_pagamento_id: string;
  } | null>(null);

  useEffect(() => {
    if (!open || !gedDocumentoId) return;
    setEtapaCpr("criar");
    setPendentesLote(null);
    setDadosLote(null);
    void iniciar();
  }, [open, gedDocumentoId]);

  async function iniciar() {
    setEtapa("loading");
    setCprEscolhida(null);
    setCategoriaId(null);
    setFormaPagamentoId(null);
    setDescricao(nomeDocumento ?? "");
    try {
      const { data, error } = await supabase.rpc("rotear_documento_para_boleto", {
        p_ged_documento_id: gedDocumentoId!,
      });
      if (error) throw error;
      const res = data as {
        status_ancoragem?: string;
        boleto_stage_id?: string;
        cpr_id?: string;
        cpr_descricao?: string;
        candidatos?: CprCandidato[];
        boleto?: BoletoStage;
        message?: string;
        ja_roteado?: boolean;
        mensagem?: string;
      };

      // RPC idempotente: já existe boleto_stage — apenas informa e segue fluxo normal
      if (res.ja_roteado && res.mensagem) {
        toast.info(res.mensagem, { duration: 8000 });
      }

      if (res.status_ancoragem === "ancorado_automatico") {
        toast.success(
          `Boleto ancorado em CPR ${res.cpr_descricao ?? ""} (auto-match)`,
          { duration: 8000 },
        );
        invalidar();
        onOpenChange(false);
        return;
      }

      // carrega boleto pra exibir
      const { data: bol } = await supabase
        .from("boleto_stage")
        .select(
          "id, valor, vencimento, beneficiario_nome, beneficiario_cnpj, cpr_match_candidatos, ged_documento_id",
        )
        .eq("ged_documento_id", gedDocumentoId!)
        .maybeSingle();

      if (bol) {
        setBoleto(bol as unknown as BoletoStage);
      }

      if (res.status_ancoragem === "aguardando_escolha_operador") {
        setCandidatos(res.candidatos ?? ((bol?.cpr_match_candidatos as unknown) as CprCandidato[]) ?? []);
        setEtapa("escolher");
      } else {
        setEtapa("criar");
      }
    } catch (e) {
      const msg = extractError(e);
      if (msg.includes("Resolução de parceiro pendente")) {
        toast.error(
          "Resolva o parceiro deste documento antes de rotear. Clique no chip amarelo na coluna Parceiro.",
          { duration: 15000 },
        );
      } else {
        toast.error("Erro ao rotear: " + msg, { duration: 15000 });
      }
      onOpenChange(false);
    }
  }

  function invalidar() {
    qc.invalidateQueries({ queryKey: ["repositorio-documentos"] });
    qc.invalidateQueries({ queryKey: ["repositorio-kpis"] });
    qc.invalidateQueries({ queryKey: ["contas-pagar"] });
    qc.invalidateQueries({ queryKey: ["boleto-stage"] });
  }

  async function ancorar() {
    if (!boleto || !cprEscolhida) return;
    setSalvando(true);
    try {
      const { error } = await supabase.rpc("ancorar_boleto_em_cpr", {
        p_boleto_stage_id: boleto.id,
        p_cpr_id: cprEscolhida,
      });
      if (error) throw error;
      toast.success("Boleto ancorado em CPR");
      invalidar();
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro: " + extractError(e), { duration: 15000 });
    } finally {
      setSalvando(false);
    }
  }

  async function criar(fechar: boolean) {
    if (!boleto) return;
    // Validações cliente (espelham a RPC — Doutrina #120)
    if (!categoriaId) {
      toast.error("Selecione a categoria");
      return;
    }
    if (!formaPagamentoId) {
      toast.error("Selecione a forma de pagamento");
      return;
    }
    setSalvando(true);
    try {
      const { data, error } = await (supabase as any).rpc("criar_cpr_de_boleto", {
        p_boleto_stage_id: boleto.id,
        p_categoria_id: categoriaId,
        p_forma_pagamento_id: formaPagamentoId,
        p_descricao_extra: descricao || undefined,
      });
      if (error) throw error;
      const res = (data ?? {}) as { ok?: boolean; cpr_id?: string };
      toast.success(
        res?.cpr_id
          ? "CPR criada com sucesso a partir do boleto"
          : "CPR criada",
      );
      invalidar();

      // Doutrina #119 — verifica se há outros boletos pendentes do mesmo parceiro
      const { data: contagem } = await (supabase as any).rpc(
        "contar_boletos_pendentes_mesmo_parceiro",
        { p_boleto_stage_id_referencia: boleto.id },
      );
      const c = (contagem ?? {}) as {
        qtd?: number;
        ids?: string[];
        parceiro_nome?: string | null;
      };
      const qtd = c.qtd ?? 0;

      if (qtd > 0) {
        setPendentesLote({
          qtd,
          ids: c.ids ?? [],
          parceiro_nome: c.parceiro_nome ?? null,
        });
        setDadosLote({
          categoria_id: categoriaId,
          forma_pagamento_id: formaPagamentoId,
        });
        setEtapaCpr("oferta_lote");
      } else {
        if (fechar) onOpenChange(false);
      }
    } catch (e) {
      toast.error("Erro ao criar CPR: " + extractError(e), { duration: 15000 });
    } finally {
      setSalvando(false);
    }
  }

  async function aplicarLote() {
    if (!pendentesLote || !dadosLote) return;
    setSalvando(true);
    setEtapaCpr("executando_lote");
    try {
      const { data, error } = await (supabase as any).rpc(
        "criar_cpr_de_boleto_em_lote",
        {
          p_boleto_stage_ids: pendentesLote.ids,
          p_categoria_id: dadosLote.categoria_id,
          p_forma_pagamento_id: dadosLote.forma_pagamento_id,
        },
      );
      if (error) throw error;
      const res = (data ?? {}) as {
        qtd_sucesso?: number;
        qtd_falha?: number;
        falhas?: Array<{ erro?: string }>;
      };
      const sucesso = res.qtd_sucesso ?? 0;
      const falha = res.qtd_falha ?? 0;

      if (falha === 0) {
        toast.success(`${sucesso} CPR(s) criada(s) em lote`);
      } else if (sucesso === 0) {
        toast.error(
          `Nenhuma CPR criada. Falhas: ${
            res.falhas?.map((f) => f.erro).join("; ") ?? "desconhecido"
          }`,
          { duration: 15000 },
        );
      } else {
        toast.warning(`${sucesso} CPR(s) criada(s), ${falha} falharam`, {
          duration: 12000,
        });
      }
      invalidar();
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao aplicar em lote: " + extractError(e), { duration: 15000 });
      setEtapaCpr("oferta_lote");
    } finally {
      setSalvando(false);
    }
  }

  function pularLote() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !salvando && onOpenChange(v)}>
      <DialogContent className="max-w-2xl">
        {etapa === "loading" && (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {etapa === "escolher" && boleto && (
          <>
            <DialogHeader>
              <DialogTitle>Múltiplas CPRs candidatas — qual ancorar?</DialogTitle>
              <DialogDescription>
                {boleto.beneficiario_nome ?? "—"} · {formatBRL(boleto.valor ?? 0)} · venc.{" "}
                {formatDateBR(boleto.vencimento)}
              </DialogDescription>
            </DialogHeader>

            <RadioGroup value={cprEscolhida ?? ""} onValueChange={setCprEscolhida} className="space-y-2">
              {candidatos.map((c) => (
                <label
                  key={c.cpr_id}
                  className="flex items-start gap-3 rounded border p-3 cursor-pointer hover:bg-accent"
                >
                  <RadioGroupItem value={c.cpr_id} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.descricao}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBRL(c.valor)} · venc. {formatDateBR(c.data_vencimento)} ·{" "}
                      <span className="capitalize">{c.status}</span>
                    </p>
                  </div>
                </label>
              ))}
            </RadioGroup>

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button variant="outline" onClick={() => setEtapa("criar")}>
                Criar CPR nova mesmo assim
              </Button>
              <Button
                disabled={!cprEscolhida || salvando}
                onClick={ancorar}
                className="bg-[#1A4A3A] hover:bg-[#1A4A3A]/90"
              >
                {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Ancorar
              </Button>
            </DialogFooter>
          </>
        )}

        {etapa === "criar" && boleto && etapaCpr === "criar" && (
          <>
            <DialogHeader>
              <DialogTitle>Criar nova CPR a partir deste boleto</DialogTitle>
              <DialogDescription>
                {boleto.beneficiario_nome ?? "—"} · {formatBRL(boleto.valor ?? 0)} · venc.{" "}
                {formatDateBR(boleto.vencimento)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <Label>Categoria *</Label>
                <CategoriaCombobox
                  options={categorias}
                  value={categoriaId}
                  onChange={setCategoriaId}
                  placeholder="Selecionar categoria"
                />
              </div>
              <div>
                <Label>Forma de pagamento <span className="text-red-500">*</span></Label>
                <Select
                  value={formaPagamentoId ?? undefined}
                  onValueChange={(v) => setFormaPagamentoId(v)}
                >
                  <SelectTrigger
                    className={!formaPagamentoId ? "border-amber-300" : ""}
                  >
                    <SelectValue placeholder="Selecione a forma de pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {meios.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                variant="secondary"
                onClick={() => criar(false)}
                disabled={salvando || !categoriaId || !formaPagamentoId}
              >
                Criar
              </Button>
              <Button
                onClick={() => criar(true)}
                disabled={salvando || !categoriaId || !formaPagamentoId}
                className="bg-[#1A4A3A] hover:bg-[#1A4A3A]/90"
              >
                {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar e fechar
              </Button>
            </DialogFooter>
          </>
        )}

        {etapaCpr === "oferta_lote" && pendentesLote && (
          <>
            <DialogHeader>
              <DialogTitle>Criar CPR para outros boletos?</DialogTitle>
              <DialogDescription>
                Aplique a mesma categoria e forma de pagamento aos demais.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-emerald-900">CPR criada com sucesso</p>
                  <p className="text-sm text-emerald-800 mt-1">
                    O boleto foi vinculado a uma nova CPR aberta.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-amber-900">
                      Há {pendentesLote.qtd} outro{pendentesLote.qtd > 1 ? "s" : ""} boleto
                      {pendentesLote.qtd > 1 ? "s" : ""}{" "}
                      {pendentesLote.parceiro_nome
                        ? `de ${pendentesLote.parceiro_nome}`
                        : "do mesmo parceiro"}{" "}
                      aguardando ancoragem
                    </p>
                    <p className="text-sm text-amber-800 mt-2">
                      Criar CPR para todos com a mesma categoria e forma de pagamento?
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      Cada CPR usará a descrição padrão do boleto (nome do arquivo).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={pularLote} disabled={salvando}>
                Não, só este
              </Button>
              <Button
                className="bg-[#1A4A3A] hover:bg-[#1A4A3A]/90"
                onClick={aplicarLote}
                disabled={salvando}
              >
                {salvando
                  ? "Aplicando..."
                  : `Sim, criar CPR para os ${pendentesLote.qtd}`}
              </Button>
            </DialogFooter>
          </>
        )}

        {etapaCpr === "executando_lote" && (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-[#1A4A3A]" />
            <p className="text-sm text-muted-foreground">Aplicando em lote...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
