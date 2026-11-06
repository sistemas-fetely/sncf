import { Controller, useFieldArray, useForm } from "react-hook-form";
import { CodProduto } from "@/components/produto/CodProduto";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEstadoTela } from "@/lib/navegacao";
import { TransferenciaInternaPainel } from "@/components/estoque/TransferenciaInternaPainel";
import { BaixaUsoForm } from "@/components/transferencias/BaixaUsoForm";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { usePermissoesTela } from "@/hooks/usePermissoesTela";
import { ListaLotesRetorno } from "@/components/regularizacao/ListaLotesRetorno";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { EstagioBadge } from "@/components/pedidos/BadgesPedido";
import { ESTAGIO_LABELS, type EstagioPedido } from "@/types/pedido";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { parseDataPura } from "@/lib/data";
import { Loader2, PackageCheck } from "lucide-react";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { PainelReposicaoSp } from "@/components/estoque/central/PainelReposicaoSp";
import { lerCargaReposicao, type AbaReposicao, type CargaReposicao, type FreteReposicao } from "@/lib/estoque/reposicaoSp";
import { invalidarEstoque } from "@/hooks/estoque/useCentralEstoque";
import { ComoVaiReposicao } from "@/components/transferencias/ComoVaiReposicao";


interface CentroDestino {
  codigo: string;
  rotulo_curto: string | null;
  nome: string;
}

const schema = z.object({
  destino: z.string().trim().min(1, "Informe o destino da transferência"),
  finalidade: z.string(),
  observacao: z.string().trim(),
  itens: z
    .array(
      z.object({
        sku: z.string().trim().min(1, "Selecione um produto do catálogo"),
        nome: z.string().optional(),
        quantidade: z.coerce.number().int().positive("Quantidade deve ser maior que zero"),
      })
    )
    .min(1, "Adicione ao menos 1 item"),
});

type FormValues = z.infer<typeof schema>;

const VAZIO: FormValues = { destino: "", finalidade: "", observacao: "", itens: [{ sku: "", nome: "", quantidade: 1 }] };

interface FinalidadeTransferencia {
  codigo: string;
  rotulo: string;
  descricao: string | null;
  exige_descricao: boolean;
}

interface ProdutoCatalogo {
  sku: string;
  ean?: string | null;
  nome_completo: string | null;
  preco_custo: number | null;
}

interface LinhaColada {
  sku: string;
  quantidade: number;
  qtdValida: boolean;
  produto: ProdutoCatalogo | null;
}

/** Combobox de SKU: só aceita SKU vindo de uma seleção real do catálogo. */
export function SkuCombobox({
  value,
  nome,
  onSelect,
  invalido,
  ariaLabel,
  buscaEan = false,
  onEanExato,
}: {
  value: string;
  nome?: string;
  onSelect: (p: ProdutoCatalogo) => void;
  invalido?: boolean;
  ariaLabel: string;
  /** Liga busca por EAN (substring) e leitura de EAN completo. Padrão desligado. */
  buscaEan?: boolean;
  onEanExato?: (p: ProdutoCatalogo) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [debounced, setDebounced] = useState("");
  const [eanNaoCadastrado, setEanNaoCadastrado] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(termo.trim()), 300);
    return () => clearTimeout(t);
  }, [termo]);

  async function buscar(bruto: string): Promise<ProdutoCatalogo[]> {
    const t = bruto.replace(/[,()%*]/g, " ").trim();
    const dig = bruto.replace(/\D/g, "");
    const filtros = [`sku.ilike.%${t}%`, `cod_cadastro.ilike.%${t}%`, `nome_completo.ilike.%${t}%`];
    if (buscaEan && dig.length >= 2) filtros.push(`ean.ilike.%${dig}%`);
    const { data, error } = await supabase
      .from("sncf_produtos")
      .select(buscaEan ? "sku, cod_cadastro, nome_completo, preco_custo, ean, ativo" : "sku, cod_cadastro, nome_completo, preco_custo")
      .or(filtros.join(","))
      .order("sku")
      .limit(20);
    if (error) throw error;
    return (data ?? []) as unknown as ProdutoCatalogo[];
  }

  const buscaQ = useQuery({
    queryKey: ["transferencia-busca-sku", buscaEan, debounced],
    enabled: aberto && debounced.length >= 2,
    queryFn: () => buscar(debounced),
  });

  async function aoEnter() {
    if (!buscaEan || !onEanExato) return false;
    const dig = termo.replace(/\D/g, "");
    if (![8, 12, 13, 14].includes(dig.length) || /[^\d\s]/.test(termo.trim())) return false;
    try {
      const { data, error } = await supabase
        .from("sncf_produtos")
        .select("sku, cod_cadastro, nome_completo, preco_custo, ean, ativo")
        .eq("ativo", true)
        .ilike("ean", `%${dig.replace(/^0+/, "")}%`)
        .limit(50);
      if (error) throw error;
      const alvo = dig.replace(/^0+/, "");
      const exatos = ((data ?? []) as unknown as ProdutoCatalogo[]).filter(
        (p) => (p.ean ?? "").replace(/\D/g, "").replace(/^0+/, "") === alvo
      );
      if (exatos.length === 1) {
        onEanExato(exatos[0]);
        setTermo("");
        setDebounced("");
        setEanNaoCadastrado(null);
        setAberto(false);
        return true;
      }
      if (exatos.length === 0) setEanNaoCadastrado(dig);
      return false;
    } catch (e) {
      toast.error(`Falha na busca por EAN: ${(e as Error).message}`);
      return false;
    }
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={aberto}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            invalido && "border-destructive"
          )}
        >
          <span className="truncate">{value || (buscaEan ? "Buscar SKU, nome ou EAN…" : "Buscar SKU ou nome…")}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[480px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={buscaEan ? "Buscar SKU, nome ou EAN…" : "Digite SKU ou nome…"}
            value={termo}
            onValueChange={(v) => { setTermo(v); setEanNaoCadastrado(null); }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !buscaEan) return;
              const dig = termo.replace(/\D/g, "");
              if ([8, 12, 13, 14].includes(dig.length)) {
                e.preventDefault();
                e.stopPropagation();
                void aoEnter();
              }
            }}
          />
          <CommandList>
            {eanNaoCadastrado && termo.replace(/\D/g, "") === eanNaoCadastrado ? (
              <p className="p-3 text-sm text-destructive">EAN não cadastrado</p>
            ) : debounced.length < 2 ? (
              <CommandEmpty>Digite ao menos 2 caracteres.</CommandEmpty>
            ) : buscaQ.isFetching ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : buscaQ.isError ? (
              <p className="p-3 text-sm text-destructive">
                Falha na busca: {(buscaQ.error as Error).message}
              </p>
            ) : (
              <>
                <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                <CommandGroup>
                  {(buscaQ.data ?? []).map((p) => (
                    <CommandItem
                      key={p.sku}
                      value={p.sku}
                      onSelect={() => {
                        onSelect(p);
                        setAberto(false);
                        setTermo("");
                      }}
                    >
                      <Check className={cn("h-4 w-4", value === p.sku ? "opacity-100" : "opacity-0")} />
                      <span className="font-mono font-medium tabular-nums">{(p as any).cod_cadastro ?? p.sku}</span>
                      {(p as any).cod_cadastro && <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>}
                      <span className="truncate text-muted-foreground">{p.nome_completo ?? ""}</span>
                      {buscaEan && p.ean && (
                        <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">EAN {p.ean}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Quebra o texto colado do Excel: TAB; senão vírgula/;; senão múltiplos espaços. */
export function parsearColagem(texto: string): { sku: string; qtdTexto: string }[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => {
      let partes = l.split("\t");
      if (partes.length < 2) partes = l.split(/[,;]/);
      if (partes.length < 2) partes = l.split(/\s{2,}|\s+/);
      return { sku: (partes[0] ?? "").trim(), qtdTexto: (partes.length > 1 ? (partes[1] ?? "") : "").trim() };
    })
    .filter((p) => p.sku.length > 0);
}

/** Destinos válidos para transferência interna: armazéns e showrooms ativos. */
function useCentrosDestino() {
  return useQuery({
    queryKey: ["centros-destino-transferencia"],
    queryFn: async (): Promise<CentroDestino[]> => {
      const { data, error } = await supabase
        .from("centro_distribuicao")
        .select("codigo, rotulo_curto, nome")
        .eq("ativo", true)
        .in("tipo", ["armazem", "showroom"])
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as CentroDestino[];
    },
  });
}


/** Modo Simples Remessa: mesma entrada de itens, sem tipo/destino/sugestão; cria via criar_remessa. */
export interface ModoRemessa {
  naturezaCodigo: string;
  resumo: string;
}

const schemaRemessa = schema.extend({ destino: z.string() });

export function NovaTransferenciaForm({ onCriado, onCancelar, remessa, onBaixaCriada }: { onCriado: () => void; onCancelar: () => void; remessa?: ModoRemessa; onBaixaCriada?: () => void }) {
  const qc = useQueryClient();
  const location = useLocation();
  const cargaNav = lerCargaReposicao(location.state);
  const cargaAplicada = useRef<string | null>(null);
  const [preferenciaFrete, setPreferenciaFrete] = useState<AbaReposicao>(cargaNav?.aba ?? "carga");
  const [freteEscolhido, setFreteEscolhido] = useState<FreteReposicao | null>(null);

  // Regras dinâmicas (regularização / finalidade) lidas por ref no resolver.
  const regrasRef = useRef<{ regularizacao: boolean; finalidades: FinalidadeTransferencia[] }>({
    regularizacao: false,
    finalidades: [],
  });

  const form = useForm<FormValues>({
    resolver: (valores, ctx, opts) => {
      const base = remessa ? schemaRemessa : schema;
      const { regularizacao: reg, finalidades } = regrasRef.current;
      const dinamico = base.superRefine((v, c) => {
        if (remessa || reg) return;
        if (!v.finalidade) {
          c.addIssue({ code: z.ZodIssueCode.custom, path: ["finalidade"], message: "Escolha a finalidade" });
          return;
        }
        const f = finalidades.find((x) => x.codigo === v.finalidade);
        if (f?.exige_descricao && !v.observacao.trim()) {
          c.addIssue({ code: z.ZodIssueCode.custom, path: ["observacao"], message: "Descreva a transferência" });
        }
      });
      return zodResolver(dinamico)(valores, ctx, opts);
    },
    defaultValues: { ...VAZIO },
  });
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: "itens" });

  // ?sku= vindo da Central de Estoque: pré-inclui o item com a qtd sugerida (ou 1).
  const [searchParams] = useSearchParams();
  const skuUrl = remessa ? null : searchParams.get("sku");
  const skuAplicado = useRef<string | null>(null);
  useEffect(() => {
    if (!skuUrl || skuAplicado.current === skuUrl) return;
    skuAplicado.current = skuUrl;
    (async () => {
      const [prod, sug] = await Promise.all([
        supabase.from("sncf_produtos").select("sku, nome_completo").eq("sku", skuUrl).maybeSingle(),
        supabase.from("vw_reposicao_sp").select("qtd_sugerida").eq("sku", skuUrl),
      ]);
      if (prod.error) { toast.error(formatError(prod.error)); return; }
      if (sug.error) { toast.error(formatError(sug.error)); return; }
      if (!prod.data) { toast.error(`Produto ${skuUrl} não encontrado no catálogo.`); return; }
      const qtd = Math.max(0, ...(sug.data ?? []).map((r) => Number(r.qtd_sugerida ?? 0)));
      replace([{ sku: prod.data.sku, nome: prod.data.nome_completo ?? "", quantidade: qtd > 0 ? qtd : 1 }]);
    })();
  }, [skuUrl, replace]);

  const [modo, setModo] = useState<"item" | "colar" | "sugestao">("item");
  const [textoColado, setTextoColado] = useState("");
  const [textoProcessado, setTextoProcessado] = useState<string | null>(null);
  const [previa, setPrevia] = useState<LinhaColada[] | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [ignoradas, setIgnoradas] = useState(0);
  // Regularização: mercadoria já está fisicamente no destino — pedido nasce em
  // Pré-faturamento (natureza transferencia_regularizacao), sem passar pelo XPM.
  const [regularizacao, setRegularizacao] = useState(false);

  const finalidadesQ = useQuery({
    queryKey: ["transferencia-finalidades-manuais"],
    enabled: !remessa,
    queryFn: async (): Promise<FinalidadeTransferencia[]> => {
      const { data, error } = await supabase
        .from("transferencia_finalidade")
        .select("codigo, rotulo, descricao, exige_descricao")
        .eq("ativo", true)
        .eq("automatica", false)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as FinalidadeTransferencia[];
    },
  });
  useEffect(() => {
    if (finalidadesQ.isError) toast.error(formatError(finalidadesQ.error));
  }, [finalidadesQ.isError, finalidadesQ.error]);
  regrasRef.current = { regularizacao, finalidades: finalidadesQ.data ?? [] };
  const finalidadeAtual = form.watch("finalidade");
  const exigeDescricao =
    !remessa && !regularizacao && !!(finalidadesQ.data ?? []).find((f) => f.codigo === finalidadeAtual)?.exige_descricao;

  // Modo "Sugestão do motor": seleção por SKU (marcado + quantidade editável).
  const [sugNav, setSugNav] = useEstadoTela({ reposicao: "urgente" });

  const limparColagem = () => {
    setTextoColado("");
    setTextoProcessado(null);
    setPrevia(null);
    setErroPrevia(null);
    setIgnoradas(0);
  };

  const limparSugestao = () => {
    setFreteEscolhido(null);
  };

  const trocarModo = (novo: string) => {
    const m = novo as "item" | "colar" | "sugestao";
    if (m === modo) return;
    setModo(m);
    limparColagem();
    limparSugestao();
    replace(m === "item" ? [{ sku: "", nome: "", quantidade: 1 }] : []);
    form.clearErrors("itens");
  };

  // Tipo "Entre CDs de SP (sem NF)" vive na URL (?tipo=entre_cds) — a rota antiga redireciona para cá.
  const [tipoNav, setTipoNav] = useEstadoTela({ tipo: "" });
  const entreCds = !remessa && tipoNav.tipo === "entre_cds";
  const baixaUso = !remessa && tipoNav.tipo === "baixa_uso";

  const selecionarTipo = (novoRegularizacao: boolean) => {
    if (entreCds || baixaUso) setTipoNav({ tipo: "" });
    if (novoRegularizacao === regularizacao) return;
    setRegularizacao(novoRegularizacao);
    if (novoRegularizacao && modo === "sugestao") trocarModo("item");
  };

  const destinoAtual = form.watch("destino");
  useEffect(() => {
    limparSugestao();
  }, [destinoAtual]);

  const usarSugestao = (carga: CargaReposicao) => {
    form.setValue("destino", "SITE-SP", { shouldValidate: true });
    form.setValue("finalidade", "reposicao_site_sp", { shouldValidate: true });
    replace(carga.itens);
    setPreferenciaFrete(carga.aba);
    setModo("item");
    form.clearErrors("itens");
  };
  useEffect(() => {
    if (remessa || !cargaNav || cargaAplicada.current === location.key) return;
    cargaAplicada.current = location.key;
    usarSugestao(cargaNav);
  }, [location.key, remessa, replace]);

  const processarColagem = async () => {
    setErroPrevia(null);
    setIgnoradas(0);
    const linhas = parsearColagem(textoColado);
    if (linhas.length === 0) {
      setPrevia(null);
      setTextoProcessado(textoColado);
      replace([]);
      setErroPrevia("Nada para processar: cole ao menos uma linha com SKU e quantidade.");
      return;
    }
    setProcessando(true);
    try {
      // Quantidade vazia ou 0 → linha ignorada (não é erro). Negativa ou não inteira segue erro.
      const comQtd = linhas.map((l) => ({
        ...l,
        q: l.qtdTexto === "" ? null : Number(l.qtdTexto.replace(/\./g, "").replace(",", ".")),
      }));
      const ignoradasLista = comQtd.filter((l) => l.q === null || l.q === 0);
      const consideradas = comQtd.filter((l) => l.q !== null && l.q !== 0);
      setIgnoradas(ignoradasLista.length);
      if (consideradas.length === 0) {
        setPrevia(null);
        setTextoProcessado(textoColado);
        replace([]);
        setErroPrevia("Nada para processar: cole ao menos uma linha com SKU e quantidade.");
        return;
      }
      const skus = Array.from(new Set(consideradas.map((l) => l.sku)));
      const { data, error } = await supabase
        .from("sncf_produtos")
        .select("sku, nome_completo, preco_custo")
        .in("sku", skus);
      if (error) throw error;
      const mapa = new Map((data ?? []).map((p) => [p.sku as string, p as ProdutoCatalogo]));
      const resultado: LinhaColada[] = consideradas.map((l) => {
        const q = l.q as number;
        return {
          sku: l.sku,
          quantidade: q,
          qtdValida: Number.isInteger(q) && q > 0,
          produto: mapa.get(l.sku) ?? null,
        };
      });
      setPrevia(resultado);
      setTextoProcessado(textoColado);
      const tudoOk = resultado.every((r) => r.produto && r.qtdValida);
      replace(
        tudoOk
          ? resultado.map((r) => ({ sku: r.sku, nome: r.produto?.nome_completo ?? "", quantidade: r.quantidade }))
          : []
      );
      form.clearErrors("itens");
    } catch (e) {
      setPrevia(null);
      replace([]);
      setErroPrevia((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setProcessando(false);
    }
  };

  const previaComErro = !!previa?.some((r) => !r.produto || !r.qtdValida);
  const colagemPendente = modo === "colar" && (!previa || textoProcessado !== textoColado || previaComErro);
  const totalPrevia = (previa ?? []).reduce(
    (acc, r) => acc + (r.produto && r.qtdValida ? (r.produto.preco_custo ?? 0) * r.quantidade : 0),
    0
  );

  // Resumo da barra fixa: calculado dos itens atuais do formulário (só os com SKU).
  const itensAtuais = form.watch("itens") ?? [];
  const itensComSku = itensAtuais.filter((i) => i.sku?.trim());
  const totalPecasForm = itensComSku.reduce((acc, i) => acc + (Number(i.quantidade) || 0), 0);
  const previaValida = modo === "colar" && !!previa && !previaComErro && textoProcessado === textoColado;

  const centrosQ = useCentrosDestino();
  useEffect(() => {
    if (centrosQ.isError) toast.error(formatError(centrosQ.error));
  }, [centrosQ.isError, centrosQ.error]);
  useEffect(() => {
    if (!cargaNav || remessa || !centrosQ.data?.length || !finalidadesQ.data?.length) return;
    form.setValue("destino", "SITE-SP", { shouldValidate: true });
    form.setValue("finalidade", "reposicao_site_sp", { shouldValidate: true });
  }, [centrosQ.data, finalidadesQ.data, location.key, remessa]);

  const salvarFrete = async (pedidoId: string) => {
    if (!freteEscolhido || regularizacao || remessa) return;
    const { data, error } = await supabase.rpc("atualizar_frete_pedido", {
      p_pedido_id: pedidoId, p_transportadora_id: freteEscolhido.transportadoraId,
      p_frete_tipo: "CIF_ABSORVIDO", p_valor_frete: freteEscolhido.valor,
      p_estimativa_valor: freteEscolhido.valor,
      p_estimativa_json: { origem_cotacao: "reposicao_sp", transportadora_id: freteEscolhido.transportadoraId, servico: freteEscolhido.servico ?? null, servico_codigo: freteEscolhido.codigo ?? null, valor_estimado: freteEscolhido.valor, prazo_dias: freteEscolhido.prazo, ritmo: preferenciaFrete },
    });
    if (error) throw error;
    if (!(data as { ok?: boolean })?.ok) throw new Error("Frete não salvo.");
  };

  const pedidoCriadoRef = useRef<{ ok: boolean; pedido_id: string; id_externo: string; valor_bruto: number } | null>(null);
  const criar = useMutation({
    mutationFn: async (valores: FormValues) => {
      if (remessa) {
        const { data, error } = await (supabase as any).rpc("criar_remessa", {
          p_natureza_codigo: remessa.naturezaCodigo,
          p_itens: valores.itens.map((i) => ({ sku: i.sku.trim(), quantidade: i.quantidade })),
          p_observacao: valores.observacao.trim() ? valores.observacao.trim() : null,
        });
        if (error) throw error;
        return data as { ok: boolean; id_externo: string; valor_bruto: number };
      }
      if (pedidoCriadoRef.current) {
        await salvarFrete(pedidoCriadoRef.current.pedido_id);
        return pedidoCriadoRef.current;
      }
      const { data, error } = await supabase.rpc("criar_pedido_transferencia", {
        p_itens: valores.itens.map((i) => ({ sku: i.sku.trim(), quantidade: i.quantidade })),
        p_destino_codigo: valores.destino,
        p_observacao: valores.observacao.trim() ? valores.observacao.trim() : null,
        p_regularizacao: regularizacao,
        p_finalidade_codigo: regularizacao ? undefined : valores.finalidade,
      });
      if (error) throw error;
      const res = data as { ok: boolean; pedido_id: string; id_externo: string; valor_bruto: number };
      if (!res?.ok || !res.pedido_id) throw new Error("A transferência não foi criada.");
      pedidoCriadoRef.current = res;
      try { await salvarFrete(res.pedido_id); }
      catch (e) { throw new Error(`${res.id_externo} criada, mas o frete não foi salvo: ${formatError(e)}. Tente novamente para salvar o frete, sem criar outra TRS.`); }
      return res;
    },
    onSuccess: async (res) => {
      // FAIL-LOUD: a RPC devolve ok=false sem exceção → trata como erro.
      if (!res?.ok) {
        toast.error(remessa ? "A remessa não foi criada. Tente novamente." : "A transferência não foi criada. Tente novamente.");
        return;
      }
      if (remessa) {
        toast.success(`${res.id_externo} criada.`);
        void qc.invalidateQueries({ queryKey: ["simples-remessas"] });
        void qc.invalidateQueries({ queryKey: ["consumo-showroom"] });
        onCriado();
        return;
      }
      toast.success(
        regularizacao
          ? `${res.id_externo} criado — regularização, em Pré-faturamento.`
          : `${res.id_externo} criado — pedido entrou em Pré-Separação.`
      );
      await Promise.all([qc.invalidateQueries({ queryKey: ["transferencias-internas"] }), invalidarEstoque(qc)]);
      onCriado();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const onSubmit = form.handleSubmit((valores) => criar.mutate(valores));

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {remessa ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{remessa.resumo}</p>
            ) : (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Tipo</legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Button
                  type="button"
                  variant="outline"
                  aria-pressed={!entreCds && !baixaUso && !regularizacao}
                  onClick={() => selecionarTipo(false)}
                  className={cn(
                    "h-auto min-h-24 items-start justify-start whitespace-normal p-4 text-left",
                    !entreCds && !baixaUso && !regularizacao && "border-primary bg-primary/5 ring-1 ring-primary",
                  )}
                >
                  <span>
                    <span className="block font-medium">Física</span>
                    <span className="mt-1 block text-sm font-normal text-muted-foreground">
                      A mercadoria sai do XPM-SC, é separada, viaja e é conferida no destino.
                    </span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-pressed={!entreCds && !baixaUso && regularizacao}
                  onClick={() => selecionarTipo(true)}
                  className={cn(
                    "h-auto min-h-24 items-start justify-start whitespace-normal p-4 text-left",
                    !entreCds && !baixaUso && regularizacao && "border-primary bg-primary/5 ring-1 ring-primary",
                  )}
                >
                  <span>
                    <span className="block font-medium">Regularização</span>
                    <span className="mt-1 block text-sm font-normal text-muted-foreground">
                      A mercadoria já está no destino. Só a nota fiscal acompanha: não vai ao XPM e não passa por conferência.
                    </span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-pressed={entreCds}
                  onClick={() => setTipoNav({ tipo: "entre_cds" })}
                  className={cn(
                    "h-auto min-h-24 items-start justify-start whitespace-normal p-4 text-left",
                    entreCds && "border-primary bg-primary/5 ring-1 ring-primary",
                  )}
                >
                  <span>
                    <span className="block font-medium">Entre CDs de SP (sem NF)</span>
                    <span className="mt-1 block text-sm font-normal text-muted-foreground">
                      Peças mudam entre Site SP e Show Room, no mesmo endereço e mesmo CNPJ: sem NF, sem viagem, baixa e entrada na hora.
                    </span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-pressed={baixaUso}
                  onClick={() => setTipoNav({ tipo: "baixa_uso" })}
                  className={cn(
                    "h-auto min-h-24 items-start justify-start whitespace-normal p-4 text-left",
                    baixaUso && "border-primary bg-primary/5 ring-1 ring-primary",
                  )}
                >
                  <span>
                    <span className="block font-medium">Baixa para uso e feira</span>
                    <span className="mt-1 block text-sm font-normal text-muted-foreground">
                      Peças saem do estoque vendável de SP para uso da Fetely (mostruário, uso interno, brinde, feira). Sem viagem.
                    </span>
                  </span>
                </Button>
              </div>
            </fieldset>
            )}
            {!entreCds && !baixaUso && (<>
            <div className="grid gap-4 md:grid-cols-2">
              {!remessa && <div className="space-y-1.5">
                <label htmlFor="destino" className="text-sm font-medium">
                  Destino
                </label>
                <Controller
                  control={form.control}
                  name="destino"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="destino"
                        className={form.formState.errors.destino ? "border-destructive" : ""}
                      >
                        <SelectValue
                          placeholder={
                            centrosQ.isLoading
                              ? "Carregando destinos…"
                              : "Selecione o destino"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(centrosQ.data ?? []).map((c) => (
                          <SelectItem key={c.codigo} value={c.codigo}>
                            {c.rotulo_curto ?? c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.destino && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.destino.message}
                  </p>
                )}
              </div>}
              {!remessa && !regularizacao && <div className="space-y-1.5">
                <label htmlFor="finalidade" className="text-sm font-medium">
                  Finalidade
                </label>
                <Controller
                  control={form.control}
                  name="finalidade"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => { field.onChange(v); form.clearErrors("finalidade"); }}>
                      <SelectTrigger
                        id="finalidade"
                        className={form.formState.errors.finalidade ? "border-destructive" : ""}
                      >
                        <SelectValue placeholder={finalidadesQ.isLoading ? "Carregando finalidades…" : "Selecione a finalidade"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(finalidadesQ.data ?? []).map((f) => (
                          <SelectItem key={f.codigo} value={f.codigo}>
                            {f.rotulo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.finalidade && (
                  <p className="text-xs text-destructive">{form.formState.errors.finalidade.message}</p>
                )}
              </div>}
              <div className="space-y-1.5">
                <label htmlFor="observacao" className="text-sm font-medium">
                  {remessa || regularizacao ? "Observação" : "Descrição"}
                  {!exigeDescricao && <span className="font-normal text-muted-foreground"> (opcional)</span>}
                </label>
                <Textarea
                  id="observacao"
                  placeholder="Ex.: reposição para campanha de outono"
                  rows={2}
                  className={form.formState.errors.observacao ? "border-destructive" : ""}
                  {...form.register("observacao")}
                />
                {form.formState.errors.observacao && (
                  <p className="text-xs text-destructive">{form.formState.errors.observacao.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Itens</p>
                <Tabs value={modo} onValueChange={trocarModo}>
                  <TabsList>
                    <TabsTrigger value="item">Item a item</TabsTrigger>
                    <TabsTrigger value="colar">Colar da planilha</TabsTrigger>
                    {!regularizacao && !remessa && <TabsTrigger value="sugestao">Sugestão do motor</TabsTrigger>}
                  </TabsList>
                </Tabs>
              </div>

              {modo === "sugestao" ? (
                <PainelReposicaoSp aba={sugNav.reposicao === "carga" ? "carga" : "urgente"} onAba={v => setSugNav({ reposicao: v })} onUsar={usarSugestao} rotulo="Usar na transferência" />
              ) : modo === "item" ? (
                <>
                  <div className="space-y-2">
                    {fields.map((field, index) => {
                      const sku = form.watch(`itens.${index}.sku`);
                      const nome = form.watch(`itens.${index}.nome`);
                      const erroSku = form.formState.errors.itens?.[index]?.sku;
                      return (
                        <div key={field.id} className="flex items-start gap-2">
                          <div className="w-full max-w-xs">
                            <SkuCombobox
                              value={sku}
                              nome={nome}
                              invalido={!!erroSku}
                              ariaLabel={`SKU do item ${index + 1}`}
                              buscaEan={!remessa}
                              onSelect={(p) => {
                                form.setValue(`itens.${index}.sku`, p.sku, { shouldValidate: true });
                                form.setValue(`itens.${index}.nome`, p.nome_completo ?? "");
                              }}
                              onEanExato={(p) => {
                                const atuais = form.getValues("itens");
                                const ja = atuais.findIndex((i) => i.sku?.trim() === p.sku);
                                if (ja >= 0) {
                                  form.setValue(`itens.${ja}.quantidade`, (Number(atuais[ja].quantidade) || 0) + 1, { shouldValidate: true });
                                } else if (!atuais[index]?.sku?.trim()) {
                                  form.setValue(`itens.${index}.sku`, p.sku, { shouldValidate: true });
                                  form.setValue(`itens.${index}.nome`, p.nome_completo ?? "");
                                  form.setValue(`itens.${index}.quantidade`, 1, { shouldValidate: true });
                                } else {
                                  append({ sku: p.sku, nome: p.nome_completo ?? "", quantidade: 1 });
                                }
                                form.clearErrors("itens");
                              }}
                            />
                            {erroSku && <p className="mt-1 text-xs text-destructive">{erroSku.message}</p>}
                          </div>
                          <div className="w-28">
                            <Input
                              type="number"
                              min={1}
                              placeholder="Qtd."
                              aria-label={`Quantidade do item ${index + 1}`}
                              {...form.register(`itens.${index}.quantidade`)}
                            />
                            {form.formState.errors.itens?.[index]?.quantidade && (
                              <p className="mt-1 text-xs text-destructive">
                                {form.formState.errors.itens[index]?.quantidade?.message}
                              </p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remover item ${index + 1}`}
                            onClick={() => remove(index)}
                            disabled={fields.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {nome && (
                            <p className="self-center truncate text-xs text-muted-foreground">{nome}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {form.formState.errors.itens?.message && (
                    <p className="text-xs text-destructive">{form.formState.errors.itens.message}</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ sku: "", nome: "", quantidade: 1 })}
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar item
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  <Textarea
                    rows={8}
                    value={textoColado}
                    onChange={(e) => setTextoColado(e.target.value)}
                    placeholder="Cole aqui 2 colunas do Excel: SKU e Quantidade, uma linha por item"
                    className="font-mono text-xs"
                    aria-label="Itens colados da planilha"
                  />
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={processarColagem}
                      disabled={processando || !textoColado.trim()}
                    >
                      {processando && <Loader2 className="h-4 w-4 animate-spin" />}
                      Processar
                    </Button>
                    {ignoradas > 0 && previa && (
                      <p className="text-xs text-muted-foreground">
                        {ignoradas} {ignoradas === 1 ? "linha ignorada" : "linhas ignoradas"} (quantidade 0 ou vazia)
                      </p>
                    )}
                    {previa && textoProcessado !== textoColado && (
                      <p className="text-xs text-warning">Texto alterado — clique em Processar de novo.</p>
                    )}
                    {previaComErro && textoProcessado === textoColado && (
                      <p className="text-xs text-destructive">
                        Corrija as linhas em vermelho e processe de novo.
                      </p>
                    )}
                  </div>
                  {erroPrevia && <p className="text-xs text-destructive">{erroPrevia}</p>}
                  {previa && previa.length > 0 && (
                    <div className="max-h-[420px] overflow-y-auto rounded-md border">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-background">
                          <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead className="text-right">Quantidade</TableHead>
                            <TableHead className="text-right">Custo unitário</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previa.map((r, i) => (
                            <TableRow key={`${r.sku}-${i}`} className={!r.produto || !r.qtdValida ? "bg-destructive/5" : ""}>
                              <TableCell><CodProduto chave={r.sku} variant="compacto" /></TableCell>
                              <TableCell className="text-sm">
                                {r.produto ? (
                                  r.produto.nome_completo ?? "—"
                                ) : (
                                  <Badge variant="destructive">SKU não encontrado</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-sm">
                                {r.qtdValida ? (
                                  r.quantidade
                                ) : (
                                  <span className="text-destructive">Quantidade inválida</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-sm">
                                {r.produto ? formatBRL(r.produto.preco_custo) : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-sm">
                                {r.produto && r.qtdValida
                                  ? formatBRL((r.produto.preco_custo ?? 0) * r.quantidade)
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!remessa && !regularizacao && itensComSku.length > 0 && destinoAtual && <ComoVaiReposicao itens={itensComSku.map(i => ({ sku: i.sku, nome: i.nome ?? "", quantidade: Number(i.quantidade) || 0 }))} destino={destinoAtual} aba={preferenciaFrete} onEscolher={setFreteEscolhido} />}
            <div className="sticky bottom-0 z-20 -mx-6 flex items-center justify-between gap-4 border-t bg-background/95 px-6 py-3 backdrop-blur">
              <div className="text-sm text-muted-foreground">
                {regularizacao && (
                  <Badge className="mr-2" variant="secondary">
                    Regularização
                  </Badge>
                )}
                {!remessa && !destinoAtual && <span className="mr-2 text-warning">Escolha o destino.</span>}
                <span className="font-medium text-foreground">
                  {itensComSku.length} {itensComSku.length === 1 ? "SKU" : "SKUs"} · {totalPecasForm}{" "}
                  {totalPecasForm === 1 ? "kit" : "kits"}
                </span>
                {previaValida && <span> · Total a custo {formatBRL(totalPrevia)}</span>}
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={onCancelar}>
                  Cancelar
                </Button>
                {remessa ? (
                  <Button type="submit" disabled={criar.isPending || colagemPendente}>
                    {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Criar remessa
                  </Button>
                ) : (
                <BotaoGuardado
                  slug="acao.transferencia_criar"
                  rotuloAcao="Criar transferência interna"
                  type="submit"
                  disabled={criar.isPending || colagemPendente}
                >
                  {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Criar transferência
                </BotaoGuardado>
                )}
              </div>
            </div>
            </>)}
          </form>
          {entreCds && <div className="mt-4"><TransferenciaInternaPainel mostrarHistorico={false} rotuloBotao="Transferir agora" /></div>}
          {baixaUso && <div className="mt-4"><BaixaUsoForm onCriado={() => { setTipoNav({ tipo: "" }); (onBaixaCriada ?? onCriado)(); }} /></div>}
        </CardContent>
      </Card>
    </>
  );
}
