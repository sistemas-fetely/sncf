import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, X, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { useCategoriasPlano } from "@/hooks/useCategoriasPlano";
import { useCentrosCusto } from "@/hooks/financeiro/useCentrosCusto";
import { CategoriaCombobox } from "./CategoriaCombobox";
import { LinhaInvestimentoCombobox } from "./LinhaInvestimentoCombobox";
import { cn } from "@/lib/utils";
import {
  getFamiliaContaPagar,
  getCamposVisiveis,
} from "@/lib/financeiro/familia-conta-pagar";

/**
 * Form de edição de Conta a Pagar — Fase 2 (29/04/2026).
 *
 * Doutrina cravada por Flavio:
 * - Edição liberada em status: rascunho, aberto, aprovado, enviado_para_pagamento
 * - Read-only automático em: paga, cancelado
 * - Campos NUNCA editáveis aqui: valor, parceiro_id, data_compra, status, meio_pagamento_id
 *   (rastreio fiel: muda só por fluxo, não por edição manual)
 * - Auditoria mínima: gravado editado_por + editado_em via RPC
 */

type ContaEditavel = {
  id: string;
  descricao: string;
  data_vencimento: string | null;
  conta_id: string | null;
  centro_custo_id: string | null;
  forma_pagamento_id: string | null;
  observacao: string | null;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_chave_acesso: string | null;
  nf_aplicavel?: boolean | null;
  nf_aplicavel_motivo?: string | null;
  status: string;
  parceiro_id?: string | null;
  pago_em_conta_id?: string | null;
  linha_investimento_id?: string | null;
  // Família (decide visibilidade dos campos)
  meio_pagamento_id?: string | null;
  meios_pagamento?: { codigo?: string | null } | null;
  origem?: string | null;
  formas_pagamento?: { codigo?: string | null; nome?: string | null } | null;
};

interface Props {
  conta: ContaEditavel;
  onSaved: () => void;
  onSaveAndClose?: () => void;
  onCancel: () => void;
  highlightCampo?: "pago_em_conta_id" | null;
}

const STATUS_READONLY = ["enviado_para_pagamento", "cancelado"];

// Status em que campos CRÍTICOS (categoria, centro custo, vencimento, meio, conta origem)
// ficam travados. Inclui `enviado_para_pagamento` porque o email já saiu pro financeiro —
// pacote enviado é imutável sem novo envio. Pra alterar = cancelar e recriar.
const STATUS_TRAVA_CRITICOS = ["enviado_para_pagamento", "cancelado"];

export function ContaPagarFormEdit({
  conta,
  onSaved,
  onSaveAndClose,
  onCancel,
  highlightCampo = null,
}: Props) {
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const pagoEmContaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlightCampo === "pago_em_conta_id" && pagoEmContaRef.current) {
      const t = setTimeout(() => {
        pagoEmContaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
      return () => clearTimeout(t);
    }
  }, [highlightCampo]);

  const isReadOnly = STATUS_READONLY.includes(conta.status);
  const criticosTravados = STATUS_TRAVA_CRITICOS.includes(conta.status);
  const enviadoAguardando = conta.status === "enviado_para_pagamento";

  // Família + visibilidade dos campos por origem.
  // Família B (cartão) e C (OFX já saiu) deixam data_vencimento, forma de
  // pagamento e pago_em_conta como readonly (vêm da fatura/transação).
  // Família A em pré-pagamento marca pago_em_conta como obrigatório.
  const familia = getFamiliaContaPagar({
    meio_codigo: conta.meios_pagamento?.codigo ?? null,
    origem: conta.origem ?? null,
  });
  const campos = getCamposVisiveis(familia, conta.status);
  const familiaLabel =
    familia === "B_cartao"
      ? "Cartão"
      : familia === "C_ja_saiu"
        ? "OFX"
        : null;
  const formaPagamentoNome = conta.formas_pagamento?.nome ?? null;
  // Helper: campo está em readonly por causa da família (não confundir
  // com isReadOnly global, que é por status terminal)
  const readonlyPorFamilia = (campo: keyof typeof campos) =>
    !isReadOnly && campos[campo] === "readonly";
  const obrigatorioPorFamilia = (campo: keyof typeof campos) =>
    campos[campo] === "obrigatorio";

  // Estado local do form
  const [descricao, setDescricao] = useState(conta.descricao || "");
  const [dataVencimento, setDataVencimento] = useState(conta.data_vencimento || "");
  const [contaId, setContaId] = useState(conta.conta_id || "__none__");
  const [centroCustoId, setCentroCustoId] = useState<string | null>(conta.centro_custo_id ?? null);
  const [formaPagamentoId, setFormaPagamentoId] = useState(conta.forma_pagamento_id || "__none__");
  const [observacao, setObservacao] = useState(conta.observacao || "");
  const [nfNumero, setNfNumero] = useState(conta.nf_numero || "");
  const [nfSerie, setNfSerie] = useState(conta.nf_serie || "");
  const [nfChave, setNfChave] = useState(conta.nf_chave_acesso || "");
  const [nfAplicavel, setNfAplicavel] = useState<boolean>(
    conta.nf_aplicavel === false ? false : true,
  );
  const [nfAplicavelMotivo, setNfAplicavelMotivo] = useState(
    conta.nf_aplicavel_motivo || "",
  );
  const [pagoEmContaId, setPagoEmContaId] = useState(conta.pago_em_conta_id || "__none__");
  const [parceiroIdAtribuir, setParceiroIdAtribuir] = useState<string | null>(null);
  const [linhaInvestimentoId, setLinhaInvestimentoId] = useState<string | null>(
    conta.linha_investimento_id ?? null,
  );

  // Chave de acesso oculta por padrão. Edição manual é caso raro
  // (correção/migração) — fluxo normal é a chave vir preenchida pela
  // vinculação com NF Stage.
  const [mostrarChave, setMostrarChave] = useState(false);

  // Debounce da descrição (não dispara IA a cada tecla)
  const [descricaoDebounced, setDescricaoDebounced] = useState(descricao);
  useEffect(() => {
    const t = setTimeout(() => setDescricaoDebounced(descricao), 600);
    return () => clearTimeout(t);
  }, [descricao]);

  // Sugestão de categoria via RPC (só se ainda não há categoria definida)
  const semCategoria = !contaId || contaId === "__none__";
  const { data: sugestoes = [] } = useQuery({
    queryKey: ["sugerir-categoria-edit", conta.id, descricaoDebounced],
    enabled: descricaoDebounced.length >= 4 && semCategoria && !isReadOnly,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "sugerir_categoria_para_lancamento",
        {
          p_descricao: descricaoDebounced || null,
          p_cnpj: null,
          p_parceiro_id: conta.parceiro_id || null,
        },
      );
      if (error) throw error;
      return (data || []) as Array<{
        categoria_id: string;
        categoria_codigo: string;
        categoria_nome: string;
        score: number;
        motivo: string;
        amostra_descricao: string;
        amostra_count: number;
      }>;
    },
  });

  const topSugestao = sugestoes[0];
  const [sugestaoAplicada, setSugestaoAplicada] = useState(false);

  // Reseta form quando conta muda
  useEffect(() => {
    setDescricao(conta.descricao || "");
    setDataVencimento(conta.data_vencimento || "");
    setContaId(conta.conta_id || "__none__");
    setCentroCustoId(conta.centro_custo_id ?? null);
    setFormaPagamentoId(conta.forma_pagamento_id || "__none__");
    setObservacao(conta.observacao || "");
    setNfNumero(conta.nf_numero || "");
    setNfSerie(conta.nf_serie || "");
    setNfChave(conta.nf_chave_acesso || "");
    setNfAplicavel(conta.nf_aplicavel === false ? false : true);
    setNfAplicavelMotivo(conta.nf_aplicavel_motivo || "");
    setPagoEmContaId(conta.pago_em_conta_id || "__none__");
    setLinhaInvestimentoId(conta.linha_investimento_id ?? null);
  }, [conta.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Categorias (plano de contas)
  const { data: categorias = [] } = useCategoriasPlano();

  // Formas de pagamento
  const { data: formasPgto = [] } = useQuery({
    queryKey: ["formas-pagamento-edit"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formas_pagamento")
        .select("id, nome, codigo")
        .order("nome");
      if (error) throw error;
      return data || [];
    },
  });

  // Contas bancárias ativas (pra "Pago em conta")
  const { data: contasBancarias = [] } = useQuery({
    queryKey: ["contas-bancarias-ativas"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao, banco")
        .eq("ativo", true)
        .order("nome_exibicao");
      if (error) throw error;
      return data || [];
    },
  });

  // Lista de parceiros — só carrega quando a conta é órfã (sem parceiro_id)
  const { data: parceirosLista } = useQuery({
    queryKey: ["parceiros-para-atribuir"],
    enabled: !conta.parceiro_id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select(
          "id, razao_social, cnpj, categoria_padrao_id, centro_custo_id, forma_pagamento_padrao_id",
        )
        .eq("ativo", true)
        .order("razao_social");
      if (error) throw error;
      return data as Array<{
        id: string;
        razao_social: string;
        cnpj: string | null;
        categoria_padrao_id: string | null;
        centro_custo_id: string | null;
        forma_pagamento_padrao_id: string | null;
      }>;
    },
  });

  // Centros de custo (tabela dimensão)
  const { data: centrosCusto = [] } = useCentrosCusto();

  async function aplicarPadroesParceiro() {
    if (!conta.parceiro_id) {
      toast.error("Esta conta não tem parceiro vinculado");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: parceiro, error } = await (supabase as any)
      .from("parceiros_comerciais")
      .select("categoria_padrao_id, centro_custo_id, forma_pagamento_padrao_id, razao_social")
      .eq("id", conta.parceiro_id)
      .single();

    if (error || !parceiro) {
      toast.error("Erro ao buscar parceiro: " + (error?.message || "não encontrado"));
      return;
    }

    let camposAplicados = 0;
    const detalhes: string[] = [];

    if (parceiro.categoria_padrao_id) {
      setContaId(parceiro.categoria_padrao_id);
      camposAplicados++;
      detalhes.push("Categoria");
    }
    if (parceiro.centro_custo_id) {
      setCentroCustoId(parceiro.centro_custo_id);
      camposAplicados++;
      detalhes.push("Centro de custo");
    }
    if (parceiro.forma_pagamento_padrao_id) {
      setFormaPagamentoId(parceiro.forma_pagamento_padrao_id);
      camposAplicados++;
      detalhes.push("Forma de pagamento");
    }

    if (camposAplicados === 0) {
      toast.info(
        `${parceiro.razao_social || "Parceiro"} não tem padrões cadastrados. ` +
          `Cadastre os padrões na tela de Parceiros pra economizar trabalho.`
      );
      return;
    }

    toast.success(
      `${camposAplicados} ${camposAplicados === 1 ? "campo aplicado" : "campos aplicados"}: ${detalhes.join(", ")}. Clique Salvar pra confirmar.`
    );
  }

  function atribuirParceiroEAplicarPadroes(id: string) {
    setParceiroIdAtribuir(id);
    const parceiro = (parceirosLista || []).find((p) => p.id === id);
    if (!parceiro) return;

    let aplicados = 0;
    const detalhes: string[] = [];

    if (parceiro.categoria_padrao_id) {
      setContaId(parceiro.categoria_padrao_id);
      aplicados++;
      detalhes.push("Categoria");
    }
    if (parceiro.centro_custo_id) {
      setCentroCustoId(parceiro.centro_custo_id);
      aplicados++;
      detalhes.push("Centro de custo");
    }
    if (parceiro.forma_pagamento_padrao_id) {
      setFormaPagamentoId(parceiro.forma_pagamento_padrao_id);
      aplicados++;
      detalhes.push("Forma de pagamento");
    }

    if (aplicados > 0) {
      toast.success(
        `${parceiro.razao_social} vinculado. ${aplicados} ${aplicados === 1 ? "campo aplicado" : "campos aplicados"}: ${detalhes.join(", ")}. Clique Salvar pra confirmar.`,
      );
    } else {
      toast.info(
        `${parceiro.razao_social} será vinculado. Sem padrões cadastrados no parceiro — preencha categoria/centro de custo manualmente.`,
      );
    }
  }

  async function handleSalvar(fecharDrawer: boolean = false) {
    if (isReadOnly) {
      toast.error("Conta com status read-only — edição bloqueada");
      return;
    }

    if (!nfAplicavel && !nfAplicavelMotivo.trim()) {
      toast.error("Informe o motivo de a NF não ser aplicável");
      return;
    }

    setSalvando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error } = await (supabase as any).rpc("atualizar_conta_pagar_v2", {
        p_id: conta.id,
        p_descricao: descricao || null,
        p_data_vencimento: dataVencimento || null,
        p_conta_id: contaId === "__none__" ? null : contaId,
        p_centro_custo: null,
        p_forma_pagamento_id: formaPagamentoId === "__none__" ? null : formaPagamentoId,
        p_observacao: observacao || null,
        p_nf_numero: nfNumero || null,
        p_nf_serie: nfSerie || null,
        p_nf_chave_acesso: nfChave || null,
      });

      if (error) throw error;
      if (!result?.ok) {
        toast.error(result?.erro || "Erro ao salvar");
        return;
      }

      // Atualiza centro_custo_id e pago_em_conta_id em paralelo (não estão na RPC v2)
      const novoPagoEmContaId =
        pagoEmContaId === "__none__" ? null : pagoEmContaId;
      const updatePayload: Record<string, unknown> = {};
      if (centroCustoId !== (conta.centro_custo_id ?? null)) {
        updatePayload.centro_custo_id = centroCustoId;
      }
      if (novoPagoEmContaId !== (conta.pago_em_conta_id ?? null)) {
        updatePayload.pago_em_conta_id = novoPagoEmContaId;
      }
      if (linhaInvestimentoId !== (conta.linha_investimento_id ?? null)) {
        updatePayload.linha_investimento_id = linhaInvestimentoId;
      }
      // Atribuição de parceiro — apenas se a conta era órfã e o operador escolheu um
      if (!conta.parceiro_id && parceiroIdAtribuir) {
        updatePayload.parceiro_id = parceiroIdAtribuir;
      }
      const novoNfAplicavel = nfAplicavel;
      const novoMotivo = nfAplicavel ? null : (nfAplicavelMotivo.trim() || null);
      if (novoNfAplicavel !== (conta.nf_aplicavel ?? true)) {
        updatePayload.nf_aplicavel = novoNfAplicavel;
      }
      if (novoMotivo !== (conta.nf_aplicavel_motivo ?? null)) {
        updatePayload.nf_aplicavel_motivo = novoMotivo;
      }
      if (Object.keys(updatePayload).length > 0) {
        updatePayload.updated_at = new Date().toISOString();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: errBanco } = await (supabase as any)
          .from("contas_pagar_receber")
          .update(updatePayload)
          .eq("id", conta.id);
        if (errBanco) throw errBanco;
      }

      toast.success("Conta atualizada");
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["conta-pagar-detalhe", conta.id] });
      
      qc.invalidateQueries({ queryKey: ["parceiros"] });
      qc.invalidateQueries({ queryKey: ["parceiros-para-atribuir"] });
      if (fecharDrawer && onSaveAndClose) {
        onSaveAndClose();
      } else {
        onSaved();
      }
    } catch (e) {
      let msg = "Erro desconhecido";
      if (e instanceof Error) msg = e.message;
      else if (typeof e === "string") msg = e;
      else if (e && typeof e === "object") {
        const obj = e as Record<string, unknown>;
        msg = String(obj.message || obj.error || obj.details || JSON.stringify(e));
      }
      console.error("Erro ao salvar conta:", e);
      toast.error("Erro: " + msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      {isReadOnly && (
        <div className="p-3 rounded-md bg-zinc-100 text-zinc-600 text-xs">
          Conta com status <strong>{conta.status}</strong> — leitura apenas.
        </div>
      )}

      {enviadoAguardando && (
        <div className="p-3 rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-xs space-y-1">
          <p className="font-medium">📧 Email de pagamento já enviado</p>
          <p>
            Campos críticos (categoria, centro de custo, meio de pagamento, vencimento, conta origem)
            estão travados. Descrição, observação e metadados fiscais permanecem editáveis.
            Pra alterar campos críticos, cancele esta CPR e crie uma nova.
          </p>
        </div>
      )}

      {/* Descrição */}
      <div className="space-y-1">
        <Label htmlFor="cp-edit-descricao">Descrição</Label>
        <Input
          id="cp-edit-descricao"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          disabled={isReadOnly || salvando}
        />
      </div>

      {/* Data de vencimento */}
      <div className="space-y-1">
        <Label htmlFor="cp-edit-vencimento">Data de vencimento</Label>
        <Input
          id="cp-edit-vencimento"
          type="date"
          value={dataVencimento}
          onChange={(e) => setDataVencimento(e.target.value)}
          disabled={criticosTravados || salvando || (readonlyPorFamilia("data_vencimento") && conta.origem !== "manual")}
        />
        {readonlyPorFamilia("data_vencimento") && familiaLabel && conta.origem !== "manual" && (
          <p className="text-[11px] text-muted-foreground">
            Definida pela origem ({familiaLabel}) — não editável aqui.
          </p>
        )}
      </div>

      {/* Seletor de parceiro — só aparece se conta é órfã (sem parceiro vinculado) */}
      {!conta.parceiro_id && !isReadOnly && (
        <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/40 p-3 space-y-2">
          <p className="text-[11px] text-amber-900 leading-snug">
            <strong>Sem parceiro vinculado.</strong> Selecione abaixo para
            classificar a despesa. Os padrões do parceiro (categoria, centro de
            custo, forma de pagamento) serão aplicados automaticamente.
          </p>
          <Select
            value={parceiroIdAtribuir ?? ""}
            onValueChange={(v) => atribuirParceiroEAplicarPadroes(v)}
            disabled={salvando}
          >
            <SelectTrigger className="h-9 bg-background">
              <SelectValue placeholder="Selecionar parceiro..." />
            </SelectTrigger>
            <SelectContent>
              {(parceirosLista || []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="font-medium">{p.razao_social}</span>
                  {p.cnpj && (
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      {p.cnpj}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {parceiroIdAtribuir && (
            <p className="text-[11px] text-emerald-700 leading-snug">
              ✓ Parceiro pronto pra ser vinculado. Confirme em Salvar.
            </p>
          )}
        </div>
      )}

      {/* Botão Buscar do Parceiro — doutrina "Parceiro é Verdade" */}
      {conta.parceiro_id && !isReadOnly && (
        <div className="rounded-md border border-dashed border-purple-300 bg-purple-50/40 p-2.5 flex items-center justify-between gap-3">
          <p className="text-[11px] text-purple-800 leading-snug flex-1">
            <strong>Parceiro é verdade.</strong> Buscar Categoria, Centro de custo e Forma de pagamento do cadastro.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 border-purple-300 text-purple-700 hover:bg-purple-100 shrink-0"
            onClick={aplicarPadroesParceiro}
            disabled={salvando}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            Buscar do Parceiro
          </Button>
        </div>
      )}

      {/* Categoria (plano de contas) */}
      <div className="space-y-1">
        <Label>Categoria (plano de contas)</Label>
        <CategoriaCombobox
          options={categorias}
          value={contaId === "__none__" ? null : contaId}
          onChange={(id) => setContaId(id || "__none__")}
          disabled={criticosTravados || salvando}
          placeholder="Selecionar categoria..."
          allowNull
        />

        {topSugestao
          && semCategoria
          && !sugestaoAplicada
          && topSugestao.score >= 60
          && !isReadOnly && (
            <div className="mt-2 rounded-md border border-blue-200 bg-blue-50/60 p-2.5">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-blue-900">
                    ✨ Sugestão IA: {topSugestao.categoria_codigo} {topSugestao.categoria_nome}
                  </div>
                  <div className="text-[11px] text-blue-700 mt-0.5">
                    {topSugestao.motivo} · baseado em {topSugestao.amostra_count}{" "}
                    {topSugestao.amostra_count === 1 ? "lançamento" : "lançamentos"} similar
                    {topSugestao.amostra_count === 1 ? "" : "es"}
                  </div>
                  {topSugestao.amostra_descricao && (
                    <div className="text-[11px] text-blue-600/80 mt-0.5 italic truncate">
                      ex: "{topSugestao.amostra_descricao}"
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 border-blue-300 text-blue-700 hover:bg-blue-100 shrink-0"
                  onClick={() => {
                    setContaId(topSugestao.categoria_id);
                    setSugestaoAplicada(true);
                    toast.success("Categoria aplicada");
                  }}
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Aplicar
                </Button>
              </div>
            </div>
          )}
      </div>

      {/* Centro de custo */}
      <div className="space-y-1">
        <Label>Centro de custo</Label>
        <Select
          value={centroCustoId ?? "__none__"}
          onValueChange={(v) => setCentroCustoId(v === "__none__" ? null : v)}
          disabled={criticosTravados || salvando}
        >
          <SelectTrigger>
            <SelectValue placeholder="Definir..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— Sem centro de custo —</SelectItem>
            {centrosCusto.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Linha de Investimento (opcional) */}
      <div className="space-y-1">
        <Label>Linha de Investimento (opcional)</Label>
        <LinhaInvestimentoCombobox
          value={linhaInvestimentoId}
          onChange={setLinhaInvestimentoId}
          disabled={criticosTravados || salvando}
        />
      </div>

      {/* Forma de pagamento */}
      <div className="space-y-1">
        <Label>Forma de pagamento</Label>
        <Select
          value={formaPagamentoId}
          onValueChange={setFormaPagamentoId}
          disabled={criticosTravados || salvando || readonlyPorFamilia("forma_pagamento_id")}
        >
          <SelectTrigger>
            <SelectValue placeholder="Definir..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— Não definido —</SelectItem>
            {formasPgto.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {readonlyPorFamilia("forma_pagamento_id") && familiaLabel && (
          <p className="text-[11px] text-muted-foreground">
            {familiaLabel === "Cartão"
              ? `Forma definida pela fatura${formaPagamentoNome ? `: ${formaPagamentoNome}` : ""}.`
              : `Forma definida pela transação OFX${formaPagamentoNome ? `: ${formaPagamentoNome}` : ""}.`}
          </p>
        )}
      </div>

      {/* Pago em conta (banco) */}
      <div
        ref={pagoEmContaRef}
        className={cn(
          "space-y-1 rounded-md transition-all",
          highlightCampo === "pago_em_conta_id" &&
            "ring-2 ring-rose-400 ring-offset-2 p-2 -m-2 bg-rose-50/40",
        )}
      >
        <Label className="flex items-center gap-2">
          Pago em conta (banco)
          {(highlightCampo === "pago_em_conta_id" ||
            (obrigatorioPorFamilia("pago_em_conta") && pagoEmContaId === "__none__")) && (
            <span className="text-[10px] font-medium text-rose-600">
              ← preencha pra continuar
            </span>
          )}
        </Label>
        <Select
          value={pagoEmContaId}
          onValueChange={setPagoEmContaId}
          disabled={criticosTravados || salvando || readonlyPorFamilia("pago_em_conta")}
        >
          <SelectTrigger
            className={cn(
              highlightCampo === "pago_em_conta_id" &&
                "border-rose-400 focus:ring-rose-400",
            )}
          >
            <SelectValue placeholder="Definir..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— sem definir —</SelectItem>
            {contasBancarias.map((cb: { id: string; nome_exibicao?: string | null; banco?: string | null }) => (
              <SelectItem key={cb.id} value={cb.id}>
                {cb.nome_exibicao || cb.banco || cb.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {readonlyPorFamilia("pago_em_conta") && familiaLabel ? (
          <p className="text-[11px] text-muted-foreground">
            {familiaLabel === "Cartão"
              ? "Pagamento via fatura do cartão — não definido por conta."
              : "Banco definido pela transação OFX original."}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Banco usado pra pagar essa conta. Necessário pra lançar em Movimentação.
          </p>
        )}
      </div>

      {/* NF aplicável (toggle + motivo) */}
      <div className="space-y-2 rounded-md border border-zinc-200 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <Label htmlFor="cp-edit-nf-aplicavel" className="text-sm">
              Esta despesa exige NF
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Desmarque para tributos, juros, despesas internas etc.
            </p>
          </div>
          <Switch
            id="cp-edit-nf-aplicavel"
            checked={nfAplicavel}
            onCheckedChange={setNfAplicavel}
            disabled={isReadOnly || salvando}
          />
        </div>
        {!nfAplicavel && (
          <div className="space-y-1">
            <Label htmlFor="cp-edit-nf-motivo" className="text-xs">
              Motivo <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="cp-edit-nf-motivo"
              value={nfAplicavelMotivo}
              onChange={(e) => setNfAplicavelMotivo(e.target.value)}
              disabled={isReadOnly || salvando}
              placeholder="Ex: Tributo federal, juros bancários…"
              maxLength={120}
            />
          </div>
        )}
      </div>

      {/* Dados NF */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="cp-edit-nf-numero">Nº da NF</Label>
          <Input
            id="cp-edit-nf-numero"
            value={nfNumero}
            onChange={(e) => setNfNumero(e.target.value)}
            disabled={isReadOnly || salvando}
            placeholder="Ex: 12345"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cp-edit-nf-serie">Série</Label>
          <Input
            id="cp-edit-nf-serie"
            value={nfSerie}
            onChange={(e) => setNfSerie(e.target.value)}
            disabled={isReadOnly || salvando}
            placeholder="Ex: 1"
          />
        </div>
      </div>

      {/* Chave de acesso — oculta por padrão */}
      {mostrarChave ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="cp-edit-nf-chave">Chave de acesso (44 dígitos)</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] text-muted-foreground"
              onClick={() => setMostrarChave(false)}
            >
              Ocultar
            </Button>
          </div>
          <Input
            id="cp-edit-nf-chave"
            value={nfChave}
            onChange={(e) => setNfChave(e.target.value)}
            disabled={isReadOnly || salvando}
            placeholder="Cole a chave manualmente, ou anexe a NF pelo Stage"
          />
          <p className="text-[11px] text-muted-foreground">
            Edição manual é raro — chave normalmente vem preenchida pelo vínculo com a NF do Stage.
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-md border border-dashed border-zinc-200 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Chave de acesso da NF</span>
            {nfChave ? (
              <span className="text-emerald-600 font-medium">✓ preenchida</span>
            ) : (
              <span className="text-zinc-400">— vazia</span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-[11px]"
            onClick={() => setMostrarChave(true)}
          >
            {nfChave ? "Ver/Editar" : "Adicionar manualmente"}
          </Button>
        </div>
      )}

      {/* Observação */}
      <div className="space-y-1">
        <Label htmlFor="cp-edit-obs">Observação</Label>
        <Textarea
          id="cp-edit-obs"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          disabled={isReadOnly || salvando}
          rows={3}
          placeholder="Notas internas sobre essa conta..."
        />
      </div>

      {/* Footer com botões */}
      <div className="flex gap-2 pt-2 border-t">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={salvando}
        >
          <X className="h-4 w-4 mr-1" />
          {isReadOnly ? "Fechar" : "Cancelar"}
        </Button>
        {!isReadOnly && (
          <>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => handleSalvar(false)}
              disabled={salvando}
              title="Salva e mantém o drawer aberto"
            >
              {salvando ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Salvar
            </Button>
            <Button
              className="flex-1"
              onClick={() => handleSalvar(true)}
              disabled={salvando}
              title="Salva e fecha o drawer"
            >
              {salvando ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Salvar e fechar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default ContaPagarFormEdit;
