import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
}

export function NovaContaPagarSheet({ open, onOpenChange }: Props) {
  const qc = useQueryClient();

  const [parceiroId, setParceiroId] = useState<string | null>(null);
  const [parceiroOpen, setParceiroOpen] = useState(false);
  const [parceiroFormOpen, setParceiroFormOpen] = useState(false);
  const [categoriaFormOpen, setCategoriaFormOpen] = useState(false);

  const [descricao, setDescricao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [valor, setValor] = useState("");
  const [dataVenc, setDataVenc] = useState("");
  const [dataEmissao, setDataEmissao] = useState("");
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [centroCustoId, setCentroCustoId] = useState<string | null>(null);
  const [unidadeId, setUnidadeId] = useState<string | null>(null);
  const [formaPgtoId, setFormaPgtoId] = useState<string>("");
  const [parcelas, setParcelas] = useState(1);
  const [nfStageId, setNfStageId] = useState<string | null>(null);
  const [nfStageBuscaOpen, setNfStageBuscaOpen] = useState(false);

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

  const { data: parceiros } = useQuery({
    queryKey: ["parceiros-fornecedores"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parceiros_comerciais")
        .select("id,razao_social,nome_fantasia,cnpj,categoria_padrao_id,centro_custo_id,canal_venda_id,forma_pagamento_padrao_id,tipos,tipo,cpf,cep,logradouro,numero,bairro,cidade,uf,telefone,email,segmento,tags,ativo,observacao,origem")
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

  // Auto preenche categoria/centro se parceiro tem padrão
  useEffect(() => {
    if (!parceiroId || !parceiros) return;
    const p = parceiros.find((x) => x.id === parceiroId);
    if (!p) return;
    if (p.categoria_padrao_id && !categoriaId) setCategoriaId(p.categoria_padrao_id);
    if (p.centro_custo_id && !centroCustoId) setCentroCustoId(p.centro_custo_id);
    if (p.forma_pagamento_padrao_id && !formaPgtoId) setFormaPgtoId(p.forma_pagamento_padrao_id);
  }, [parceiroId, parceiros]); // eslint-disable-line

  useEffect(() => {
    if (!open) {
      setParceiroId(null);
      setDescricao("");
      setObservacao("");
      setValor("");
      setDataVenc("");
      setDataEmissao("");
      setCategoriaId(null);
      setCentroCustoId(null);
      setUnidadeId(null);
      setFormaPgtoId("");
      setParcelas(1);
      setNfStageId(null);
      setDescricaoDebounced("");
      setSugestaoAplicada(false);
    }
  }, [open]);

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

  const mutation = useMutation({
    mutationFn: async () => {
      if (!descricao.trim()) throw new Error("Descrição é obrigatória");
      if (!valorNum || valorNum <= 0) throw new Error("Valor inválido");
      if (!dataVenc) throw new Error("Data de vencimento obrigatória");

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
          conta_id: categoriaId,
          parceiro_id: parceiroId,
          
          fornecedor_cliente: fornecedorNome,
          centro_custo_id: centroCustoId,
          unidade_id: unidadeId,
          forma_pagamento_id: formaPgtoId || null,
          parcelas,
          parcela_atual: i + 1,
          parcela_grupo_id: grupoId,
          status: "aberto",
          origem: "manual",
          nf_stage_id: nfStageId,
        });
      }
      const { error } = await supabase.from("contas_pagar_receber").insert(rows);
      if (error) throw error;
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
                <Label>Parceiro / Fornecedor</Label>
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
                <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label>Vencimento *</Label>
                <Input type="date" value={dataVenc} onChange={(e) => setDataVenc(e.target.value)} />
              </div>
              <div>
                <Label>Emissão</Label>
                <Input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
              </div>
            </div>

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
                          setCategoriaId(topSugestao.categoria_id);
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
              <div className="grid grid-cols-2 gap-3">
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

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">Pagamento</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Forma de pagamento</Label>
                  <Select value={formaPgtoId || "_none"} onValueChange={(v) => setFormaPgtoId(v === "_none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">—</SelectItem>
                      {(formasPgto || []).map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Parcelas</Label>
                  <Input
                    type="number"
                    min={1}
                    max={36}
                    value={parcelas}
                    onChange={(e) => setParcelas(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
              </div>
              {parcelas > 1 && valorNum > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {parcelas}× de <strong>{formatBRL(valorParcela)}</strong> mensais
                </p>
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
        onOpenChange={setParceiroFormOpen}
        categorias={categorias || []}
        onSaved={(id) => setParceiroId(id)}
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
        onSelecionar={(id) => {
          setNfStageId(id);
          setNfStageBuscaOpen(false);
        }}
      />
    </>
  );
}
