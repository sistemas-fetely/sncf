import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LinhaInvestimentoCombobox } from "./LinhaInvestimentoCombobox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Plus, ChevronsUpDown, Check, Paperclip, Sparkles } from "lucide-react";
import { NfStageVinculadaCard } from "@/components/financeiro/NfStageVinculadaCard";
import { NfStageBuscadorModal } from "@/components/financeiro/NfStageBuscadorModal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  CategoriaCombobox,
  CategoriaOption,
} from "@/components/financeiro/CategoriaCombobox";
import { ParceiroFormSheet, Parceiro } from "@/components/financeiro/ParceiroFormSheet";
import { CategoriaFormDialog } from "@/components/financeiro/CategoriaFormDialog";
import { formatBRL } from "@/lib/format-currency";
import { addMonths } from "date-fns";
import { useCentrosCusto } from "@/hooks/financeiro/useCentrosCusto";
import { useUnidades } from "@/hooks/useUnidades";

type FormaPgto = { id: string; nome: string; codigo: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialData?: {
    nfStageId: string;
    nfStageDocumentoId?: string;
    parceiroId?: string | null;
    fornecedorNome?: string;
    valor?: number;
    dataEmissao?: string;
    dataVencimento?: string;
    categoriaId?: string | null;
    descricao?: string | null;
  };
}

export function NovaContaPagarSheet({ open, onOpenChange, initialData }: Props) {
  const qc = useQueryClient();

  const [parceiroId, setParceiroId] = useState<string | null>(null);
  const [parceiroOpen, setParceiroOpen] = useState(false);
  const [parceiroFormOpen, setParceiroFormOpen] = useState(false);
  const [parceiroPrefill, setParceiroPrefill] = useState<{ razao_social?: string; cnpj?: string } | null>(null);
  const [parceiroObrigatorio, setParceiroObrigatorio] = useState(false);
  const [categoriaFormOpen, setCategoriaFormOpen] = useState(false);

  const [descricao, setDescricao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [valor, setValor] = useState("");
  const [dataVenc, setDataVenc] = useState("");
  const [dataEmissao, setDataEmissao] = useState("");
  const [competenciaMes, setCompetenciaMes] = useState("");
  const [competenciaTocada, setCompetenciaTocada] = useState(false);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [centroCustoId, setCentroCustoId] = useState<string | null>(null);
  const [linhaInvestimentoId, setLinhaInvestimentoId] = useState<string | null>(null);
  const [unidadeId, setUnidadeId] = useState<string | null>(null);
  const [formaPgtoId, setFormaPgtoId] = useState<string>("");
  const [cartaoId, setCartaoId] = useState<string>("");
  const [parcelas, setParcelas] = useState(1);
  const [nfStageId, setNfStageId] = useState<string | null>(null);
  const [nfStageBuscaOpen, setNfStageBuscaOpen] = useState(false);

  // Dados bancários do fornecedor pra esta despesa
  const [dadosBancariosBanco, setDadosBancariosBanco] = useState("");
  const [dadosBancariosAgencia, setDadosBancariosAgencia] = useState("");
  const [dadosBancariosConta, setDadosBancariosConta] = useState("");
  const [pixChave, setPixChave] = useState("");
  const [pixTipo, setPixTipo] = useState("");
  // Controle: parceiro JÁ tinha dados (não precisa pedir) vs precisa preencher
  const [parceiroJaTemDados, setParceiroJaTemDados] = useState(false);
  const [editandoDadosBancarios, setEditandoDadosBancarios] = useState(false);

  // Pré-preenchimento via initialData (vindo do fluxo "Importar NF")
  useEffect(() => {
    if (open && initialData) {
      setNfStageId(initialData.nfStageId);
      if (initialData.parceiroId) setParceiroId(initialData.parceiroId);
      if (initialData.valor != null) {
        // initialData.valor é number JS (ex: 4542.79). Formata como string BR
        // (vírgula decimal) pra não conflitar com o parser BR do input.
        setValor(
          Number(initialData.valor).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        );
      }
      if (initialData.dataEmissao) setDataEmissao(initialData.dataEmissao);
      if (initialData.dataVencimento) setDataVenc(initialData.dataVencimento);
      if (initialData.categoriaId) setCategoriaId(initialData.categoriaId);
      if (initialData.descricao) setDescricao(initialData.descricao);
    }
  }, [open, initialData]);

  // Debounce da descrição (não dispara IA a cada tecla)
  const [descricaoDebounced, setDescricaoDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDescricaoDebounced(descricao), 600);
    return () => clearTimeout(t);
  }, [descricao]);

  // Estado: usuário aplicou a sugestão (não mostra mais)
  const [sugestaoAplicada, setSugestaoAplicada] = useState(false);

  // Busca sugestão de categoria
  const { data: sugestoes = [] } = useQuery({
    queryKey: ["sugerir-categoria", parceiroId, descricaoDebounced],
    enabled: descricaoDebounced.length >= 4 || !!parceiroId,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "sugerir_categoria_para_lancamento",
        {
          p_descricao: descricaoDebounced || null,
          p_cnpj: null,
          p_parceiro_id: parceiroId,
        }
      );
      if (error) throw error;
      return (data || []) as Array<{
        plano_contas_id: string;
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

  const { data: parceiros } = useQuery({
    queryKey: ["parceiros-fornecedores"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parceiros_comerciais")
        .select("id,razao_social,nome_fantasia,cnpj,plano_contas_id,centro_custo_id,canal_venda_id,forma_pagamento_padrao_id,tipos,tipo,cpf,cep,logradouro,numero,bairro,cidade,uf,telefone,email,segmento,tags,ativo,observacao,origem,dados_bancarios,pix_chave,pix_tipo")
        .contains("tipos", ["fornecedor"])
        .eq("ativo", true)
        .order("razao_social");
      if (error) throw error;
      return data as unknown as Parceiro[];
    },
  });

  const { data: centrosCusto = [] } = useCentrosCusto();
  const { data: unidades = [] } = useUnidades();

  const { data: categorias } = useQuery({
    queryKey: ["plano-contas-flat"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plano_contas")
        .select("id,codigo,nome,nivel,parent_id")
        .eq("ativo", true)
        .order("codigo");
      if (error) throw error;
      return data as CategoriaOption[];
    },
  });

  const { data: formasPgto } = useQuery({
    queryKey: ["formas-pagamento"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formas_pagamento")
        .select("id,nome,codigo")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as FormaPgto[];
    },
  });

  const { data: cartoes } = useQuery({
    queryKey: ["cartoes-credito-ativos"],
    enabled: open,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cartoes_credito")
        .select("id, nome, ultimos_digitos, ativo")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        nome: string;
        ultimos_digitos: string | null;
        ativo: boolean;
      }>;
    },
  });

  // Auto preenche categoria/centro/dados bancários se parceiro tem
  useEffect(() => {
    if (!parceiroId || !parceiros) return;
    const p = parceiros.find((x) => x.id === parceiroId);
    if (!p) return;
    if (p.plano_contas_id && !categoriaId) setCategoriaId(p.plano_contas_id);
    if (p.centro_custo_id && !centroCustoId) setCentroCustoId(p.centro_custo_id);
    if (p.forma_pagamento_padrao_id && !formaPgtoId) setFormaPgtoId(p.forma_pagamento_padrao_id);

    // Dados bancários
    const db = (p as { dados_bancarios?: { banco?: string; agencia?: string; conta?: string } | null }).dados_bancarios;
    const banco = db?.banco || "";
    const agencia = db?.agencia || "";
    const conta = db?.conta || "";
    const pixCh = (p as { pix_chave?: string | null }).pix_chave || "";
    const pixTp = (p as { pix_tipo?: string | null }).pix_tipo || "";

    setDadosBancariosBanco(banco);
    setDadosBancariosAgencia(agencia);
    setDadosBancariosConta(conta);
    setPixChave(pixCh);
    setPixTipo(pixTp);

    const temAlgum = !!(banco || agencia || conta || pixCh);
    setParceiroJaTemDados(temAlgum);
    setEditandoDadosBancarios(false);
  }, [parceiroId, parceiros]); // eslint-disable-line

  useEffect(() => {
    if (!open) {
      setParceiroId(null);
      setDescricao("");
      setObservacao("");
      setValor("");
      setDataVenc("");
      setDataEmissao("");
      setCompetenciaMes("");
      setCompetenciaTocada(false);
      setCategoriaId(null);
      setCentroCustoId(null);
      setLinhaInvestimentoId(null);
      setUnidadeId(null);
      setFormaPgtoId("");
      setParcelas(1);
      setNfStageId(null);
      setDescricaoDebounced("");
      setSugestaoAplicada(false);
      setDadosBancariosBanco("");
      setDadosBancariosAgencia("");
      setDadosBancariosConta("");
      setPixChave("");
      setPixTipo("");
      setParceiroJaTemDados(false);
      setEditandoDadosBancarios(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || competenciaTocada) return;
    const base = dataEmissao ? new Date(dataEmissao + "T00:00:00") : new Date();
    const mm = String(base.getMonth() + 1).padStart(2, "0");
    setCompetenciaMes(base.getFullYear() + "-" + mm);
  }, [open, dataEmissao, competenciaTocada]);

  const valorNum = Number(valor.replace(/\./g, "").replace(",", ".")) || 0;

  /**
   * Divisão de centavos que sempre soma exato ao total.
   * Ex: R$ 10,00 em 3× → 3,33 + 3,33 + 3,34 (última leva o resto).
   * Evita drift de R$ 0,01 que apareceria com `valorNum / parcelas` direto.
   */
  function valorDaParcela(total: number, qtdParcelas: number, indice: number): number {
    if (qtdParcelas <= 1) return total;
    const totalCentavos = Math.round(total * 100);
    const baseCentavos = Math.floor(totalCentavos / qtdParcelas);
    const restoCentavos = totalCentavos - baseCentavos * qtdParcelas;
    const centavosFinal =
      indice === qtdParcelas - 1
        ? baseCentavos + restoCentavos
        : baseCentavos;
    return centavosFinal / 100;
  }

  // Pra preview no UI (todas iguais menos a última quando há resto)
  const valorParcela = parcelas > 0 ? valorNum / parcelas : valorNum;

  // Forma de pagamento ativa decide quais campos são obrigatórios
  const formaSel = formasPgto?.find((f) => f.id === formaPgtoId);
  const codFormaPgto = formaSel?.codigo?.toLowerCase() || "";
  const exigePix = codFormaPgto === "pix";
  const exigeBanco =
    codFormaPgto === "ted" ||
    codFormaPgto === "transferencia" ||
    codFormaPgto === "transferencia_bancaria" ||
    codFormaPgto === "doc";
  // Modelo 3D — cartão é instância específica de meio
  const exigeCartao =
    codFormaPgto === "cartao_credito" ||
    codFormaPgto === "cartao_debito" ||
    codFormaPgto.includes("cartao") ||
    codFormaPgto.includes("cartão");
  const mostrarCamposBancarios =
    !!parceiroId && (exigePix || exigeBanco) && (!parceiroJaTemDados || editandoDadosBancarios);

  // Limpa cartão se forma de pagamento muda pra não-cartão
  useEffect(() => {
    if (!exigeCartao && cartaoId) setCartaoId("");
  }, [exigeCartao, cartaoId]);

  // Vindo de boleto via import: trava parcelas + bloqueia valor/vencimento
  const veioDeBoleto = !!initialData?.nfStageDocumentoId;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!parceiroId) throw new Error("Parceiro / Fornecedor é obrigatório");
      if (!descricao.trim()) throw new Error("Descrição é obrigatória");
      if (!valorNum || valorNum <= 0) throw new Error("Valor inválido");
      if (!dataVenc) throw new Error("Data de vencimento obrigatória");
      if (!competenciaMes) throw new Error("Mês de competência é obrigatório");

      // Validações específicas por forma de pagamento
      if (exigeCartao && !cartaoId) {
        throw new Error("Cartão é obrigatório quando forma de pagamento é Cartão");
      }
      if (exigePix && !pixChave.trim()) {
        throw new Error("Chave PIX é obrigatória para pagamento via PIX");
      }
      if (exigeBanco) {
        if (!dadosBancariosBanco.trim()) throw new Error("Banco é obrigatório para TED/Transferência");
        if (!dadosBancariosAgencia.trim()) throw new Error("Agência é obrigatória para TED/Transferência");
        if (!dadosBancariosConta.trim()) throw new Error("Conta é obrigatória para TED/Transferência");
      }

      const parceiro = parceiros?.find((p) => p.id === parceiroId);
      const fornecedorNome = parceiro?.razao_social || null;
      const baseDate = new Date(dataVenc + "T00:00:00");
      const grupoId = parcelas > 1 ? crypto.randomUUID() : null;

      const rows = [];
      for (let i = 0; i < parcelas; i++) {
        // addMonths clampa data de borda (31/01 → 28/02 ao invés de 03/03)
        const venc = addMonths(baseDate, i);
        rows.push({
          tipo: "pagar",
          descricao: parcelas > 1 ? `${descricao.trim()} (${i + 1}/${parcelas})` : descricao.trim(),
          observacao: observacao.trim() || null,
          // Distribuição de centavos: última parcela leva o resto pra somar exato
          valor: valorDaParcela(valorNum, parcelas, i),
          data_vencimento: venc.toISOString().slice(0, 10),
          nf_data_emissao: dataEmissao || null,
          plano_contas_id: categoriaId,
          parceiro_id: parceiroId,
          
          fornecedor_cliente: fornecedorNome,
          centro_custo_id: centroCustoId,
          linha_investimento_id: linhaInvestimentoId,
          unidade_id: unidadeId,
          forma_pagamento_id: formaPgtoId || null,
          cartao_id: cartaoId || null,
          parcelas,
          parcela_atual: i + 1,
          parcela_grupo_id: grupoId,
          status: "aberto",
          origem: "manual",
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inseridas, error } = await (supabase as any)
        .from("contas_pagar_receber")
        .insert(rows)
        .select("id, parcela_atual");
      if (error) throw error;

      // Vincula NF do Repositório à primeira parcela (modelo N:1).
      if (nfStageId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const primeira = (inseridas || []).find((r: any) => r.parcela_atual === 1);
        if (primeira) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: vincErr } = await (supabase as any).rpc("vincular_nf_a_conta", {
            p_nf_id: nfStageId,
            p_conta_id: primeira.id,
          });
          if (vincErr) {
            console.warn("Falha ao vincular NF à CPR recém-criada:", vincErr);
          }
        }
      }

      // Auto-salva dados bancários no parceiro quando:
      // - usuário preencheu E
      // - parceiro não tinha (primeira vez) OU usuário editou explicitamente
      if (parceiroId && (exigePix || exigeBanco) && (!parceiroJaTemDados || editandoDadosBancarios)) {
        const update: Record<string, unknown> = {};
        if (exigeBanco) {
          update.dados_bancarios = {
            banco: dadosBancariosBanco.trim() || null,
            agencia: dadosBancariosAgencia.trim() || null,
            conta: dadosBancariosConta.trim() || null,
          };
        }
        if (exigePix) {
          update.pix_chave = pixChave.trim() || null;
          if (pixTipo) update.pix_tipo = pixTipo;
        }
        if (Object.keys(update).length > 0) {
          await supabase
            .from("parceiros_comerciais")
            .update(update as never)
            .eq("id", parceiroId);
        }
      }

      // Status do stage é recalculado automaticamente por trigger no banco
      // (ver função recalcular_status_nf_stage / Fase E)
    },
    onSuccess: () => {
      toast.success(parcelas > 1 ? `${parcelas} parcelas registradas!` : "Despesa registrada!");
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      setNfStageId(null);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const parceiroSelected = parceiros?.find((p) => p.id === parceiroId);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nova Despesa</SheetTitle>
            <SheetDescription>Registre um novo compromisso financeiro.</SheetDescription>
          </SheetHeader>

          <div className="space-y-5 py-4">
            {/* Parceiro */}
            <div>
              <div className="flex items-center justify-between">
                <Label>Parceiro / Fornecedor *</Label>
                <button
                  type="button"
                  onClick={() => setParceiroFormOpen(true)}
                  className="text-xs text-admin hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Novo
                </button>
              </div>
              <Popover open={parceiroOpen} onOpenChange={setParceiroOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {parceiroSelected ? parceiroSelected.razao_social : (
                      <span className="text-muted-foreground">Selecione um parceiro</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar por nome ou CNPJ..." />
                    <CommandList>
                      <CommandEmpty>Nenhum parceiro encontrado.</CommandEmpty>
                      <CommandGroup>
                        {(parceiros || []).map((p) => (
                          <CommandItem
                            key={p.id}
                            value={`${p.razao_social} ${p.cnpj || ""}`}
                            onSelect={() => {
                              setParceiroId(p.id);
                              setParceiroOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", parceiroId === p.id ? "opacity-100" : "opacity-0")} />
                            <div className="flex-1">
                              <div className="text-sm">{p.razao_social}</div>
                              {p.cnpj && <div className="text-xs text-muted-foreground font-mono">{p.cnpj}</div>}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>Descrição *</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Label className="m-0">Prova fiscal (NF/Recibo)</Label>
                <span className="text-xs text-muted-foreground">opcional</span>
              </div>
              {nfStageId ? (
                <NfStageVinculadaCard
                  nfStageId={nfStageId}
                  onRemover={() => setNfStageId(null)}
                />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-2 font-normal"
                  onClick={() => setNfStageBuscaOpen(true)}
                >
                  <Paperclip className="h-4 w-4" />
                  Anexar do Repositório de NFs
                </Button>
              )}
              <p className="text-xs text-muted-foreground mt-1.5">
                Se a NF/recibo já está no repositório, vincule aqui. Se ainda não está, deixe em branco — você pode anexar depois.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Valor *</Label>
                <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" disabled={veioDeBoleto} />
              </div>
              <div>
                <Label>Vencimento *</Label>
                <Input type="date" value={dataVenc} onChange={(e) => setDataVenc(e.target.value)} disabled={veioDeBoleto} />
              </div>
              <div>
                <Label>Emissão</Label>
                <Input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
              </div>
            </div>
            {veioDeBoleto && (
              <p className="text-[10px] text-muted-foreground -mt-2">
                Valor e vencimento vêm do boleto importado.
              </p>
            )}

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">Classificação</p>
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <Label>Categoria / Conta</Label>
                  <button
                    type="button"
                    onClick={() => setCategoriaFormOpen(true)}
                    className="text-xs text-admin hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Nova
                  </button>
                </div>
                <CategoriaCombobox
                  options={categorias || []}
                  value={categoriaId}
                  onChange={setCategoriaId}
                  placeholder="Selecione uma categoria"
                />
                {topSugestao && !categoriaId && !sugestaoAplicada && topSugestao.score >= 60 && (
                  <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-blue-900 dark:text-blue-200">
                          <Sparkles className="h-3.5 w-3.5" />
                          Sugestão IA: {topSugestao.categoria_codigo} {topSugestao.categoria_nome}
                        </div>
                        <div className="text-xs text-blue-800/80 dark:text-blue-300/80 mt-0.5">
                          {topSugestao.motivo} · baseado em {topSugestao.amostra_count}{" "}
                          {topSugestao.amostra_count === 1 ? "lançamento" : "lançamentos"} similar
                          {topSugestao.amostra_count === 1 ? "" : "es"}
                        </div>
                        {topSugestao.amostra_descricao && (
                          <div className="text-xs text-blue-700/70 dark:text-blue-300/60 mt-1 italic truncate">
                            ex: "{topSugestao.amostra_descricao}"
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0 border-blue-300 bg-white hover:bg-blue-100 dark:bg-blue-900/40"
                        onClick={() => {
                          setCategoriaId(topSugestao.plano_contas_id);
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
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <Label>Centro de custo</Label>
                  <Select
                    value={centroCustoId ?? "_none"}
                    onValueChange={(v) => setCentroCustoId(v === "_none" ? null : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Sem centro de custo —</SelectItem>
                      {centrosCusto.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Linha de Investimento</Label>
                  <LinhaInvestimentoCombobox
                    value={linhaInvestimentoId}
                    onChange={setLinhaInvestimentoId}
                  />
                </div>
                <div>
                  <Label>Unidade</Label>
                  <Select
                    value={unidadeId ?? "_none"}
                    onValueChange={(v) => setUnidadeId(v === "_none" ? null : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Sem unidade —</SelectItem>
                      {unidades.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <h3 className="text-sm font-medium">Pagamento</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Forma de pagamento</Label>
                  <Select value={formaPgtoId || "_none"} onValueChange={(v) => setFormaPgtoId(v === "_none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">—</SelectItem>
                      {formasPgto?.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Parcelas</Label>
                  <Input
                    type="number"
                    min={1}
                    max={veioDeBoleto ? 1 : 36}
                    value={parcelas}
                    onChange={(e) => setParcelas(Math.max(1, Number(e.target.value) || 1))}
                    disabled={veioDeBoleto}
                  />
                  {veioDeBoleto && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Boleto importado — parcela única (cada boleto vira 1 despesa).
                    </p>
                  )}
                </div>
              </div>

              {exigeCartao && (
                <div>
                  <Label>Cartão *</Label>
                  <Select value={cartaoId || "_none"} onValueChange={(v) => setCartaoId(v === "_none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cartão" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Selecione —</SelectItem>
                      {cartoes?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}{c.ultimos_digitos ? ` ····${c.ultimos_digitos}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(!cartoes || cartoes.length === 0) && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Nenhum cartão ativo cadastrado.
                    </p>
                  )}
                </div>
              )}

              {parcelas > 1 && valorNum > 0 && (
                <p className="text-xs text-muted-foreground">
                  {parcelas}× de <strong>{formatBRL(valorParcela)}</strong> mensais
                </p>
              )}

              {/* Dados bancários — exibidos conforme forma de pagamento */}
              {parceiroId && (exigePix || exigeBanco) && parceiroJaTemDados && !editandoDadosBancarios && (
                <div className="rounded-md bg-muted/40 border px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      {exigeBanco && (
                        <div>
                          <span className="text-muted-foreground">Banco:</span>{" "}
                          {dadosBancariosBanco || "—"} · Ag {dadosBancariosAgencia || "—"} · CC{" "}
                          {dadosBancariosConta || "—"}
                        </div>
                      )}
                      {exigePix && (
                        <div>
                          <span className="text-muted-foreground">PIX:</span>{" "}
                          {pixChave || "—"}
                          {pixTipo && (
                            <span className="text-muted-foreground"> ({pixTipo})</span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditandoDadosBancarios(true)}
                      className="text-admin hover:underline text-xs"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              )}

              {mostrarCamposBancarios && (
                <div className="space-y-3 rounded-md border-l-2 border-admin/50 pl-3 py-1">
                  {!parceiroJaTemDados && (
                    <p className="text-xs text-muted-foreground">
                      Preencha os dados bancários do fornecedor — serão salvos automaticamente para próximos pagamentos.
                    </p>
                  )}
                  {exigeBanco && (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Banco *</Label>
                        <Input
                          value={dadosBancariosBanco}
                          onChange={(e) => setDadosBancariosBanco(e.target.value)}
                          placeholder="Ex: Itaú"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Agência *</Label>
                        <Input
                          value={dadosBancariosAgencia}
                          onChange={(e) => setDadosBancariosAgencia(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Conta *</Label>
                        <Input
                          value={dadosBancariosConta}
                          onChange={(e) => setDadosBancariosConta(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                  {exigePix && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Label className="text-xs">Chave PIX *</Label>
                        <Input
                          value={pixChave}
                          onChange={(e) => setPixChave(e.target.value)}
                          placeholder="CNPJ, e-mail, celular, etc."
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Tipo</Label>
                        <Select value={pixTipo || "_none"} onValueChange={(v) => setPixTipo(v === "_none" ? "" : v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">—</SelectItem>
                            <SelectItem value="cnpj">CNPJ</SelectItem>
                            <SelectItem value="cpf">CPF</SelectItem>
                            <SelectItem value="email">E-mail</SelectItem>
                            <SelectItem value="celular">Celular</SelectItem>
                            <SelectItem value="aleatoria">Aleatória</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {parceiroJaTemDados && (
                    <button
                      type="button"
                      onClick={() => setEditandoDadosBancarios(false)}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Cancelar edição
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ParceiroFormSheet
        open={parceiroFormOpen}
        onOpenChange={(v) => {
          setParceiroFormOpen(v);
          if (!v) {
            setParceiroPrefill(null);
            setParceiroObrigatorio(false);
          }
        }}
        categorias={categorias || []}
        onSaved={(id) => {
          setParceiroId(id);
          setParceiroPrefill(null);
          setParceiroObrigatorio(false);
        }}
        prefill={parceiroPrefill || undefined}
        obrigatorio={parceiroObrigatorio}
      />
      <CategoriaFormDialog
        open={categoriaFormOpen}
        onOpenChange={setCategoriaFormOpen}
        options={categorias || []}
        onSaved={(id) => setCategoriaId(id)}
      />
      <NfStageBuscadorModal
        open={nfStageBuscaOpen}
        onOpenChange={setNfStageBuscaOpen}
        valorEsperado={valorNum > 0 ? valorNum : undefined}
        fornecedorEsperado={parceiroSelected?.razao_social || undefined}
        parceiroId={parceiroId}
        onSelecionar={async (id) => {
          setNfStageId(id);
          setNfStageBuscaOpen(false);

          // Busca dados da NF e preenche campos vazios
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: nf } = await (supabase as any)
            .from("nfs_stage")
            .select("valor, nf_data_emissao, data_vencimento, descricao, plano_contas_id, parceiro_id, fornecedor_razao_social, fornecedor_cliente, fornecedor_cnpj")
            .eq("id", id)
            .maybeSingle();

          if (!nf) return;

          if (!parceiroId && nf.parceiro_id) {
            setParceiroId(nf.parceiro_id);
          } else if (!parceiroId && !nf.parceiro_id && nf.fornecedor_cnpj) {
            // Gap 2.1: NF tem CNPJ mas parceiro não está cadastrado
            // Abre cadastro de parceiro pré-preenchido em modo obrigatório
            setParceiroPrefill({
              razao_social: nf.fornecedor_razao_social || nf.fornecedor_cliente || undefined,
              cnpj: nf.fornecedor_cnpj,
            });
            setParceiroObrigatorio(true);
            setParceiroFormOpen(true);
          }
          if (!descricao) {
            const fornecedor = nf.fornecedor_razao_social || nf.fornecedor_cliente;
            const desc = nf.descricao || (fornecedor ? `Pagamento ${fornecedor}` : "");
            if (desc) setDescricao(desc);
          }
          if (!valor && nf.valor) {
            setValor(
              Number(nf.valor).toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
            );
          }
          if (!dataEmissao && nf.nf_data_emissao) setDataEmissao(nf.nf_data_emissao);
          if (!dataVenc && (nf.data_vencimento || nf.nf_data_emissao)) {
            setDataVenc(nf.data_vencimento || nf.nf_data_emissao);
          }
          if (!categoriaId && nf.plano_contas_id) setCategoriaId(nf.plano_contas_id);

          toast.success("Dados da NF preenchidos automaticamente");
        }}
      />
    </>
  );
}
