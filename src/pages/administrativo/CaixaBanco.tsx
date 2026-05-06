/**
 * Movimentações (Caixa & Banco) — tela única (Refator B, 03/05/2026).
 *
 * Refator A (02/05/2026) dividiu em 2 abas — desenho não funcionou.
 * Refator B reverte pra tela única com:
 *   1. Pills Fetely (Tudo / A pagar / Realizado) substituem abas
 *   2. Coluna única de ícones de qualidade no fim da linha
 *   3. 5 KPIs globais (não respeitam pill, só período/conta/busca)
 *   4. Tag "(Cartão · venc...)" migra pra coluna Forma de Pagamento
 *   5. Borda lateral colorida via classBordaTemporal (igual Contas a Pagar)
 *   6. IA (Sparkles) habilitada apenas em linhas realizadas
 *
 * Doutrinas: #5 (ícone email cor universal), #11 (não duplicar helper de borda).
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Wallet,
  Search,
  Receipt,
  FolderTree,
  Paperclip,
  Link2,
  CircleDollarSign,
  AlertTriangle,
  MailCheck,
  Repeat,
  CreditCard,
  CalendarRange,
  AlertOctagon,
  CalendarClock,
  RefreshCcw,
  Sparkles,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useFiltrosPersistentes } from "@/hooks/useFiltrosPersistentes";
import ContaPagarDetalheDrawer from "@/components/financeiro/ContaPagarDetalheDrawer";
import SugestaoIADialog from "@/components/financeiro/SugestaoIADialog";
import FilaRevisaoIADialog from "@/components/financeiro/FilaRevisaoIADialog";
import {
  getCompromissoInfoMap,
  type CompromissoInfo,
} from "@/lib/financeiro/get-compromisso-info";
import {
  getStatusFlagsMap,
  type FlagsContaPagar,
} from "@/lib/financeiro/get-status-flags";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { getMeioPagamentoIcon } from "@/lib/financeiro/meio-pagamento-icon";
import { classBordaTemporal } from "@/lib/financeiro/is-vencimento-futuro";
import { cn } from "@/lib/utils";
import { CardKPI, CardKPIDuplo } from "./CaixaBanco/CardKPI";

import {
  type Lancamento,
  type ContaBancariaLite,
  statusVisual,
  isAtrasada,
  diasAtraso,
  getQualidadeNF,
  getQualidadeCategoria,
  getQualidadeVinculado,
  getQualidadeConciliado,
  corClass,
} from "./CaixaBanco/utils";

type FormaPgtoLite = { id: string; nome: string };
type Parceiro = { id: string; razao_social: string | null };
type CategoriaLite = { id: string; nome: string };
type FiltroTipo = "tudo" | "apagar" | "realizado";
type FiltroQualidade =
  | "todos"
  | "nf_tem" | "nf_falta"
  | "categoria_tem" | "categoria_falta"
  | "doc_tem" | "doc_falta"
  | "vinculado_tem" | "vinculado_falta"
  | "conciliado_tem" | "conciliado_falta";

export default function CaixaBanco() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tipoParam = (searchParams.get("tipo") as FiltroTipo) || "tudo";
  const setTipo = (v: FiltroTipo) => {
    const next = new URLSearchParams(searchParams);
    if (v === "tudo") next.delete("tipo");
    else next.set("tipo", v);
    setSearchParams(next, { replace: true });
  };

  const [contaBancariaFilter, setContaBancariaFilter] = useFiltrosPersistentes<string>(
    "caixabanco_conta",
    "todas",
  );
  const [busca, setBusca] = useFiltrosPersistentes<string>("caixabanco_busca", "");
  const [contaIdDrawer, setContaIdDrawer] = useState<string | null>(null);
  const [filtroContador, setFiltroContador] = useState<"todos" | "enviados" | "nao_enviados">("todos");
  const [mostrarSoInconsistentes, setMostrarSoInconsistentes] = useState(false);
  const [aplicandoIA, setAplicandoIA] = useState(false);
  const [sugestaoMovId, setSugestaoMovId] = useState<string | null>(null);
  const [filaIAOpen, setFilaIAOpen] = useState(false);
  const [filtroQual, setFiltroQual] = useState<FiltroQualidade>("todos");

  // Query principal — view unificada
  const { data: lancamentos, isLoading } = useQuery({
    queryKey: ["lancamentos-caixa-banco"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_lancamentos_caixa_banco")
        .select("*")
        .in("status_conta_pagar", ["aguardando_pagamento", "paga"])
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return (data || []) as Lancamento[];
    },
  });

  const { data: contasBancarias } = useQuery({
    queryKey: ["contas-bancarias-lite"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao, cor")
        .order("nome_exibicao");
      return (data || []) as ContaBancariaLite[];
    },
  });

  const { data: formasPagamento } = useQuery({
    queryKey: ["formas-pagamento-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("formas_pagamento").select("id, nome");
      return (data || []) as FormaPgtoLite[];
    },
  });

  const { data: parceiros } = useQuery({
    queryKey: ["parceiros-lite"],
    queryFn: async () => {
      const { data } = await supabase
        .from("parceiros_comerciais")
        .select("id, razao_social");
      return (data || []) as Parceiro[];
    },
  });

  const { data: categorias } = useQuery({
    queryKey: ["plano-contas-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("plano_contas").select("id, nome");
      return (data || []) as CategoriaLite[];
    },
  });

  const idsCP = useMemo(
    () =>
      (lancamentos || [])
        .filter((l) => l.origem_view === "conta_pagar")
        .map((l) => l.id),
    [lancamentos],
  );

  const { data: compromissoInfoMap = new Map<string, CompromissoInfo>() } = useQuery({
    queryKey: ["compromisso-info-map-caixa-banco", idsCP.join(",")],
    enabled: idsCP.length > 0,
    queryFn: () => getCompromissoInfoMap(idsCP),
  });

  const { data: statusFlagsMap = new Map<string, FlagsContaPagar>() } = useQuery({
    queryKey: ["status-flags-map-caixa-banco", idsCP.join(",")],
    enabled: idsCP.length > 0,
    queryFn: () => getStatusFlagsMap(idsCP),
  });

  const movIds = useMemo(
    () =>
      Array.from(
        new Set(
          (lancamentos || [])
            .map((l) => l.movimentacao_bancaria_id)
            .filter((x): x is string => !!x),
        ),
      ),
    [lancamentos],
  );

  const { data: inconsistMap = new Map<string, { categoria_inconsistente: boolean | null; inconsistencia_motivo: string | null }>() } = useQuery({
    queryKey: ["mov-inconsist-map", movIds.join(",")],
    enabled: movIds.length > 0,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("movimentacoes_bancarias")
        .select("id, categoria_inconsistente, inconsistencia_motivo")
        .in("id", movIds);
      if (error) throw error;
      const m = new Map<string, { categoria_inconsistente: boolean | null; inconsistencia_motivo: string | null }>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data || []).forEach((r: any) =>
        m.set(r.id, {
          categoria_inconsistente: r.categoria_inconsistente,
          inconsistencia_motivo: r.inconsistencia_motivo,
        }),
      );
      return m;
    },
  });

  const lancamentoIds = useMemo(
    () => (lancamentos || []).map((l) => l.id).filter(Boolean),
    [lancamentos],
  );

  const { data: nfMap } = useQuery({
    queryKey: ["nfs-vinculadas-mov", lancamentoIds.join(",")],
    enabled: lancamentoIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("nfs_stage")
        .select("conta_pagar_id, categoria_id")
        .in("conta_pagar_id", lancamentoIds);
      if (error) throw error;
      const map = new Map<string, string | null>();
      (data || []).forEach(
        (nf: { conta_pagar_id: string | null; categoria_id: string | null }) => {
          if (nf.conta_pagar_id) map.set(nf.conta_pagar_id, nf.categoria_id);
        },
      );
      return map;
    },
  });

  const { data: contadorMap } = useQuery({
    queryKey: ["contador-enviados-mov", lancamentoIds.join(",")],
    enabled: lancamentoIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("remessas_contador_itens")
        .select("conta_id, remessas_contador!inner(enviada_em, descricao)")
        .in("conta_id", lancamentoIds);
      if (error) throw error;
      const map = new Map<string, { enviada_em: string; descricao: string | null }>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data || []).forEach((it: any) => {
        const r = it.remessas_contador;
        if (!r || !it.conta_id) return;
        const existing = map.get(it.conta_id);
        if (!existing || new Date(r.enviada_em) > new Date(existing.enviada_em)) {
          map.set(it.conta_id, { enviada_em: r.enviada_em, descricao: r.descricao });
        }
      });
      return map;
    },
  });

  // Enriquecimento com flags de inconsistência
  const lancamentosEnriched = useMemo(() => {
    return (lancamentos || []).map((l) => {
      if (!l.movimentacao_bancaria_id) return l;
      const inc = inconsistMap.get(l.movimentacao_bancaria_id);
      if (!inc) return l;
      return {
        ...l,
        categoria_inconsistente: inc.categoria_inconsistente,
        inconsistencia_motivo: inc.inconsistencia_motivo,
      };
    });
  }, [lancamentos, inconsistMap]);

  // Maps de lookup
  const mapFormas = useMemo(() => {
    const m: Record<string, string> = {};
    (formasPagamento || []).forEach((f) => (m[f.id] = f.nome));
    return m;
  }, [formasPagamento]);

  const mapParceiros = useMemo(() => {
    const m: Record<string, string> = {};
    (parceiros || []).forEach((p) => {
      if (p.razao_social) m[p.id] = p.razao_social;
    });
    return m;
  }, [parceiros]);

  const mapCategorias = useMemo(() => {
    const m: Record<string, string> = {};
    (categorias || []).forEach((c) => (m[c.id] = c.nome));
    return m;
  }, [categorias]);

  const nomeParceiro = (l: Lancamento): string =>
    (l.parceiro_id && mapParceiros[l.parceiro_id]) || l.fornecedor_cliente || "—";

  // Filtros globais (busca + conta bancária) — afetam KPIs e tabela
  const filteredGlobal = useMemo(() => {
    let list = lancamentosEnriched;
    if (contaBancariaFilter !== "todas") {
      list = list.filter((l) => l.pago_em_conta_id === contaBancariaFilter);
    }
    if (busca.trim()) {
      const t = busca.toLowerCase();
      list = list.filter((l) => {
        const parceiroNome =
          (l.parceiro_id && mapParceiros[l.parceiro_id]) || l.fornecedor_cliente || "";
        return (
          l.descricao?.toLowerCase().includes(t) ||
          parceiroNome.toLowerCase().includes(t) ||
          (l.nf_numero || "").toLowerCase().includes(t)
        );
      });
    }
    return list;
  }, [lancamentosEnriched, contaBancariaFilter, busca, mapParceiros]);

  // Splits por status visual (preserva critério das antigas abas)
  const { listaAPagar, listaRealizado } = useMemo(() => {
    const aPagar: Lancamento[] = [];
    const realizado: Lancamento[] = [];
    for (const l of filteredGlobal) {
      const sv = statusVisual(l);
      if (sv === "aguardando_pagamento") aPagar.push(l);
      else if (sv === "paga") realizado.push(l);
    }
    return { listaAPagar: aPagar, listaRealizado: realizado };
  }, [filteredGlobal]);

  // KPIs globais — usam filteredGlobal (período/conta/busca), NÃO respeitam pill
  const kpis = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const iniMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59);
    const iniAnt = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fimAnt = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59);
    const iniProx = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    const fimProx = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0, 23, 59, 59);

    const dataPgto = (l: Lancamento) => l.data_pagamento || l.pago_em;

    // Pagas (pelo status visual)
    const pagas = listaRealizado;
    const pagosMesAtual = pagas.filter((l) => {
      const d = dataPgto(l);
      if (!d) return false;
      const v = new Date(d.length === 10 ? d + "T00:00:00" : d);
      return v >= iniMes && v <= fimMes;
    });
    const pagosMesAnterior = pagas.filter((l) => {
      const d = dataPgto(l);
      if (!d) return false;
      const v = new Date(d.length === 10 ? d + "T00:00:00" : d);
      return v >= iniAnt && v <= fimAnt;
    });

    // A pagar próximo mês — usa listaAPagar (status aguardando_pagamento) + venc no próximo mês
    const aPagarProxMes = listaAPagar.filter((l) => {
      if (!l.data_vencimento) return false;
      const v = new Date(l.data_vencimento + "T00:00:00");
      return v >= iniProx && v <= fimProx;
    });

    // Conciliado / Sem conciliação — sobre pagas do mês atual
    const semConc = pagosMesAtual.filter((l) => !l.conciliado_em && l.status_caixa !== "conciliado");
    const conciliadas = pagosMesAtual.filter((l) => l.conciliado_em || l.status_caixa === "conciliado");

    const sumValor = (arr: Lancamento[]) =>
      arr.reduce((s, l) => s + Number(l.valor || 0), 0);

    return {
      pagosMesAnterior: { qtd: pagosMesAnterior.length, valor: sumValor(pagosMesAnterior) },
      pagosMesAtual: { qtd: pagosMesAtual.length, valor: sumValor(pagosMesAtual) },
      aPagarProxMes: { qtd: aPagarProxMes.length, valor: sumValor(aPagarProxMes) },
      semConciliacao: { qtd: semConc.length, valor: sumValor(semConc) },
      conciliado: { qtd: conciliadas.length, valor: sumValor(conciliadas) },
    };
  }, [listaAPagar, listaRealizado]);

  // Lista pós-pill (base pros KPIs Qualidade)
  const listaFiltradaPorPill = useMemo(() => {
    if (tipoParam === "apagar") return listaAPagar;
    if (tipoParam === "realizado") return listaRealizado;
    return [...listaAPagar, ...listaRealizado];
  }, [tipoParam, listaAPagar, listaRealizado]);

  // KPIs Qualidade — respeitam pill + filtros globais, NÃO respeitam filtroQual
  const kpisQualidade = useMemo(() => {
    const base = listaFiltradaPorPill;
    const total = base.length;
    const comNF = base.filter((l) => getQualidadeNF(l, nfMap).cor === "verde").length;
    const comCat = base.filter((l) => getQualidadeCategoria(l, nfMap).cor === "verde").length;
    const comDoc = base.filter((l) => statusFlagsMap.get(l.id)?.tem_doc_pendente !== true).length;
    const comVinc = base.filter((l) =>
      l.vinculada_cartao || l.origem_view === "cartao_lancamento" || l.movimentacao_bancaria_id,
    ).length;
    const comConc = base.filter((l) =>
      l.conciliado_em || l.status_caixa === "conciliado",
    ).length;
    return {
      NF: { tem: comNF, falta: total - comNF, total },
      Categoria: { tem: comCat, falta: total - comCat, total },
      Documento: { tem: comDoc, falta: total - comDoc, total },
      Vinculado: { tem: comVinc, falta: total - comVinc, total },
      Conciliado: { tem: comConc, falta: total - comConc, total },
    };
  }, [listaFiltradaPorPill, nfMap, statusFlagsMap]);

  // Lista exibida na tabela = pill + filtros adicionais (contador / inconsistências / qualidade)
  const listaExibida = useMemo(() => {
    let list: Lancamento[] = listaFiltradaPorPill;

    if (filtroContador !== "todos") {
      list = list.filter((l) => {
        if (l.origem_view !== "conta_pagar") return false;
        const enviado = contadorMap?.has(l.id) === true;
        return filtroContador === "enviados" ? enviado : !enviado;
      });
    }
    if (mostrarSoInconsistentes) {
      list = list.filter((l) => l.categoria_inconsistente === true);
    }
    if (filtroQual !== "todos") {
      list = list.filter((l) => {
        switch (filtroQual) {
          case "nf_tem": return getQualidadeNF(l, nfMap).cor === "verde";
          case "nf_falta": return getQualidadeNF(l, nfMap).cor !== "verde";
          case "categoria_tem": return getQualidadeCategoria(l, nfMap).cor === "verde";
          case "categoria_falta": return getQualidadeCategoria(l, nfMap).cor !== "verde";
          case "doc_tem": return statusFlagsMap.get(l.id)?.tem_doc_pendente !== true;
          case "doc_falta": return statusFlagsMap.get(l.id)?.tem_doc_pendente === true;
          case "vinculado_tem":
            return !!(l.vinculada_cartao || l.origem_view === "cartao_lancamento" || l.movimentacao_bancaria_id);
          case "vinculado_falta":
            return !(l.vinculada_cartao || l.origem_view === "cartao_lancamento" || l.movimentacao_bancaria_id);
          case "conciliado_tem":
            return !!(l.conciliado_em || l.status_caixa === "conciliado");
          case "conciliado_falta":
            return !(l.conciliado_em || l.status_caixa === "conciliado");
          default: return true;
        }
      });
    }
    return list;
  }, [listaFiltradaPorPill, filtroContador, mostrarSoInconsistentes, contadorMap, filtroQual, nfMap, statusFlagsMap]);

  async function handleAplicarIAEmMassa() {
    setAplicandoIA(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("aplicar_ia_categoria_em_massa");
      if (error) throw error;
      const aplicadas = (data as { aplicadas?: number } | null)?.aplicadas || 0;
      qc.invalidateQueries({ queryKey: ["lancamentos-caixa-banco"] });
      qc.invalidateQueries({ queryKey: ["ia-fila-ambiguos"] });
      setFilaIAOpen(true);
      if (aplicadas > 0) {
        toast.info(`${aplicadas} resolvidas direto. Vamos pelos ambíguos juntos.`);
      }
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null
            ? (e as { message?: string }).message ?? JSON.stringify(e)
            : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setAplicandoIA(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      {/* HEADER STICKY */}
      <div className="sticky top-0 z-20 bg-background px-6 pt-6 pb-3 border-b space-y-3 backdrop-blur">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Wallet className="h-6 w-6 text-admin" />
              Movimentações
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Espinha dorsal financeira (realizado + comprometido).
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative w-full sm:w-72">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar parceiro, descrição ou NF..."
              className="pl-9"
            />
          </div>

          <Select value={contaBancariaFilter} onValueChange={setContaBancariaFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Conta bancária" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as contas</SelectItem>
              {(contasBancarias || []).map((cb) => (
                <SelectItem key={cb.id} value={cb.id}>
                  {cb.nome_exibicao}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* CONTEÚDO COM SCROLL */}
      <div className="flex-1 overflow-auto px-6 pb-6 pt-3 space-y-3">
        {/* 5 KPIs globais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <CardKPI
            titulo="Pago mês anterior"
            valor={formatBRL(kpis.pagosMesAnterior.valor)}
            sublinha={`${kpis.pagosMesAnterior.qtd} contas`}
            cor="purple"
            ativo={false}
            onClick={() => {}}
            icone={CalendarRange}
          />
          <CardKPI
            titulo="Pago este mês"
            valor={formatBRL(kpis.pagosMesAtual.valor)}
            sublinha={`${kpis.pagosMesAtual.qtd} contas`}
            cor="amber"
            ativo={false}
            onClick={() => {}}
            icone={AlertOctagon}
          />
          <CardKPI
            titulo="A pagar próximo mês"
            valor={formatBRL(kpis.aPagarProxMes.valor)}
            sublinha={`${kpis.aPagarProxMes.qtd} contas`}
            cor="blue"
            ativo={false}
            onClick={() => {}}
            icone={CalendarClock}
          />
          <CardKPI
            titulo="Sem conciliação"
            valor={formatBRL(kpis.semConciliacao.valor)}
            sublinha={`${kpis.semConciliacao.qtd} pagas s/ OFX`}
            cor="red"
            ativo={false}
            onClick={() => {}}
            icone={RefreshCcw}
          />
          <CardKPI
            titulo="Conciliado"
            valor={formatBRL(kpis.conciliado.valor)}
            sublinha={`${kpis.conciliado.qtd} batidas no extrato`}
            cor="teal"
            ativo={false}
            onClick={() => {}}
            icone={CheckCircle2}
          />
        </div>

        {/* KPIs Qualidade */}
        <div className="border border-emerald-300 bg-emerald-50/20 rounded-xl p-2">
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-medium mb-1.5 px-1">
            Qualidade
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <CardKPIDuplo
              titulo="NF" icone={Receipt} cor="fetely"
              total={kpisQualidade.NF.total}
              qtdTem={kpisQualidade.NF.tem} qtdFalta={kpisQualidade.NF.falta}
              ativoTem={filtroQual === "nf_tem"} ativoFalta={filtroQual === "nf_falta"}
              onClickTem={() => setFiltroQual(filtroQual === "nf_tem" ? "todos" : "nf_tem")}
              onClickFalta={() => setFiltroQual(filtroQual === "nf_falta" ? "todos" : "nf_falta")}
            />
            <CardKPIDuplo
              titulo="Categoria" icone={FolderTree} cor="fetely"
              total={kpisQualidade.Categoria.total}
              qtdTem={kpisQualidade.Categoria.tem} qtdFalta={kpisQualidade.Categoria.falta}
              ativoTem={filtroQual === "categoria_tem"} ativoFalta={filtroQual === "categoria_falta"}
              onClickTem={() => setFiltroQual(filtroQual === "categoria_tem" ? "todos" : "categoria_tem")}
              onClickFalta={() => setFiltroQual(filtroQual === "categoria_falta" ? "todos" : "categoria_falta")}
            />
            <CardKPIDuplo
              titulo="Documento" icone={Paperclip} cor="fetely"
              total={kpisQualidade.Documento.total}
              qtdTem={kpisQualidade.Documento.tem} qtdFalta={kpisQualidade.Documento.falta}
              ativoTem={filtroQual === "doc_tem"} ativoFalta={filtroQual === "doc_falta"}
              onClickTem={() => setFiltroQual(filtroQual === "doc_tem" ? "todos" : "doc_tem")}
              onClickFalta={() => setFiltroQual(filtroQual === "doc_falta" ? "todos" : "doc_falta")}
            />
            <CardKPIDuplo
              titulo="Vinculado" icone={Link2} cor="fetely"
              total={kpisQualidade.Vinculado.total}
              qtdTem={kpisQualidade.Vinculado.tem} qtdFalta={kpisQualidade.Vinculado.falta}
              ativoTem={filtroQual === "vinculado_tem"} ativoFalta={filtroQual === "vinculado_falta"}
              onClickTem={() => setFiltroQual(filtroQual === "vinculado_tem" ? "todos" : "vinculado_tem")}
              onClickFalta={() => setFiltroQual(filtroQual === "vinculado_falta" ? "todos" : "vinculado_falta")}
            />
            <CardKPIDuplo
              titulo="Conciliado" icone={CircleDollarSign} cor="fetely"
              total={kpisQualidade.Conciliado.total}
              qtdTem={kpisQualidade.Conciliado.tem} qtdFalta={kpisQualidade.Conciliado.falta}
              ativoTem={filtroQual === "conciliado_tem"} ativoFalta={filtroQual === "conciliado_falta"}
              onClickTem={() => setFiltroQual(filtroQual === "conciliado_tem" ? "todos" : "conciliado_tem")}
              onClickFalta={() => setFiltroQual(filtroQual === "conciliado_falta" ? "todos" : "conciliado_falta")}
            />
          </div>
        </div>

        {/* Filtros adicionais (Contador + Inconsistências + IA) */}
        <div className="border border-zinc-200 bg-white/60 rounded-xl p-2">
          <div className="flex gap-2 flex-wrap items-center">
            <Select
              value={filtroContador}
              onValueChange={(v) =>
                setFiltroContador(v as "todos" | "enviados" | "nao_enviados")
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Contador: todos</SelectItem>
                <SelectItem value="enviados">Contador: enviados</SelectItem>
                <SelectItem value="nao_enviados">Contador: pendentes</SelectItem>
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMostrarSoInconsistentes(!mostrarSoInconsistentes)}
              className={cn(
                "gap-1",
                mostrarSoInconsistentes &&
                  "bg-amber-600 hover:bg-amber-700 text-white border-amber-600",
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Inconsistências
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleAplicarIAEmMassa}
              disabled={aplicandoIA}
              className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 ml-auto"
            >
              {aplicandoIA ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Resolver com IA
            </Button>
          </div>
        </div>

        {/* Tabela única */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : listaExibida.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhum lançamento com os filtros atuais.
          </div>
        ) : (
          <>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parceiro</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Pago em</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Forma PG</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Tags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listaExibida.map((l) => {
                    const sv = statusVisual(l);
                    const isRealizado = sv === "paga";
                    const atrasada = isAtrasada(l);
                    const dias = diasAtraso(l);
                    const formaNome = l.forma_pagamento_id && mapFormas[l.forma_pagamento_id];
                    const categoriaNome = l.categoria_id && mapCategorias[l.categoria_id];
                    const flags = statusFlagsMap.get(l.id);
                    const docPendente = !!flags?.tem_doc_pendente;
                    const remessa = contadorMap?.get(l.id);
                    const enviadoContador = !!remessa;
                    const qNF = getQualidadeNF(l, nfMap);
                    const qCat = getQualidadeCategoria(l, nfMap);
                    const qVinc = getQualidadeVinculado(l);
                    const qConc = getQualidadeConciliado(l);
                    const ci = compromissoInfoMap.get(l.id);
                    const ehCartao =
                      l.vinculada_cartao || l.origem_view === "cartao_lancamento";

                    return (
                      <TableRow
                        key={l.id}
                        className={cn(
                          "cursor-pointer hover:bg-muted/50 transition-colors",
                          // Borda lateral colorida (Doutrina #11 — reusa Contas a Pagar)
                          classBordaTemporal(l.data_vencimento, atrasada, sv),
                        )}
                        onClick={() => {
                          if (l.origem_view === "cartao_lancamento") {
                            navigate("/administrativo/faturas-cartao");
                          } else {
                            onOpenContaDrawer(l.id);
                          }
                        }}
                      >
                        <TableCell className="max-w-[180px]">
                          <div className="truncate" title={nomeParceiro(l)}>
                            {nomeParceiro(l)}
                          </div>
                        </TableCell>

                        {/* Descrição (sem tag — tag migrou pra Forma PG) */}
                        <TableCell className="max-w-[220px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="truncate text-xs text-muted-foreground"
                              title={l.descricao}
                            >
                              {l.descricao}
                            </span>
                            {ci?.tipo === "recorrente" && (
                              <span
                                className="shrink-0"
                                title={`Recorrente — ${ci.titulo}`}
                              >
                                <Repeat className="h-3.5 w-3.5 text-indigo-600" />
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-xs">
                          <div className="flex items-center gap-1.5">
                            <span>{formatDateBR(l.data_vencimento)}</span>
                            {atrasada && (
                              <Badge
                                variant="destructive"
                                className="text-[10px] py-0 px-1.5"
                              >
                                {dias}d
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-xs">
                          {l.data_pagamento ? (
                            formatDateBR(l.data_pagamento)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5">
                            {categoriaNome ? (
                              <div className="truncate max-w-[160px]" title={categoriaNome}>
                                {categoriaNome}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                            {l.categoria_inconsistente && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] py-0 px-1.5 h-4 border-amber-400 text-amber-700 bg-amber-50 gap-1 whitespace-nowrap shrink-0"
                                    >
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                      Inconsistente
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="text-xs">
                                      {l.inconsistencia_motivo ||
                                        "Categoria diverge da NF vinculada."}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>

                        {/* Forma PG (com tag Cartão embaixo) */}
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            {(() => {
                              if (!formaNome) return <span>—</span>;
                              const ico = getMeioPagamentoIcon(formaNome);
                              if (ico) {
                                return (
                                  <span
                                    className="flex items-center gap-1.5 whitespace-nowrap"
                                    title={formaNome}
                                  >
                                    <ico.Icon
                                      className={`h-4 w-4 ${ico.cor} shrink-0`}
                                    />
                                    <span>{formaNome}</span>
                                  </span>
                                );
                              }
                              return <span>{formaNome}</span>;
                            })()}
                            {ehCartao && (
                              <Badge
                                variant="outline"
                                className="text-[9px] py-0 px-1.5 h-4 border-violet-300 text-violet-700 bg-violet-50/50 gap-1 self-start"
                              >
                                <CreditCard className="h-2.5 w-2.5" />
                                Cartão
                                {l.fatura_vencimento && (
                                  <span className="ml-0.5 opacity-80">
                                    · venc{" "}
                                    {new Date(l.fatura_vencimento).toLocaleDateString(
                                      "pt-BR",
                                    )}
                                  </span>
                                )}
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-right font-mono whitespace-nowrap">
                          {formatBRL(l.valor)}
                        </TableCell>

                        {/* Coluna única de ícones de qualidade no fim */}
                        <TableCell className="min-w-[140px]">
                          <TooltipProvider>
                            <div className="flex items-center gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Receipt
                                    className={cn(
                                      "h-3.5 w-3.5 cursor-help",
                                      corClass(qNF.cor),
                                    )}
                                    strokeWidth={2.2}
                                  />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="text-xs">📄 {qNF.motivo}</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {/* Categoria — IA habilitada apenas em realizadas */}
                                  <FolderTree
                                    className={cn(
                                      "h-3.5 w-3.5",
                                      corClass(qCat.cor),
                                      isRealizado && qCat.temSugestaoIA
                                        ? "cursor-pointer hover:scale-125 transition-transform"
                                        : "cursor-help",
                                    )}
                                    strokeWidth={2.2}
                                    onClick={
                                      isRealizado && qCat.temSugestaoIA
                                        ? (e) => {
                                            e.stopPropagation();
                                            setSugestaoMovId(l.id);
                                          }
                                        : undefined
                                    }
                                  />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="text-xs">🏷️ {qCat.motivo}</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Paperclip
                                    className={cn(
                                      "h-3.5 w-3.5 cursor-help",
                                      docPendente ? "text-red-500" : "text-emerald-600",
                                    )}
                                    strokeWidth={2.2}
                                  />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="text-xs">
                                    {docPendente
                                      ? "Documento pendente"
                                      : "Documento anexado/OK"}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Link2
                                    className={cn(
                                      "h-3.5 w-3.5 cursor-help",
                                      corClass(qVinc.cor),
                                    )}
                                    strokeWidth={2.2}
                                  />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="text-xs">🔗 {qVinc.motivo}</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <CircleDollarSign
                                    className={cn(
                                      "h-3.5 w-3.5 cursor-help",
                                      corClass(qConc.cor),
                                    )}
                                    strokeWidth={2.2}
                                  />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="text-xs">💰 {qConc.motivo}</p>
                                </TooltipContent>
                              </Tooltip>
                              {/* Contador (só pra contas_pagar) */}
                              {l.origem_view === "conta_pagar" && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <MailCheck
                                      className={cn(
                                        "h-3.5 w-3.5 cursor-help",
                                        enviadoContador
                                          ? "text-emerald-600"
                                          : "text-zinc-300",
                                      )}
                                      strokeWidth={2.2}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="text-xs">
                                      {enviadoContador
                                        ? `📨 Enviado em ${new Date(
                                            remessa!.enviada_em,
                                          ).toLocaleDateString("pt-BR")}${
                                            remessa!.descricao
                                              ? ` (${remessa!.descricao})`
                                              : ""
                                          }`
                                        : "📭 Ainda não enviado ao contador"}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              {listaExibida.length}{" "}
              {listaExibida.length === 1 ? "lançamento" : "lançamentos"}
            </p>
          </>
        )}
      </div>

      <ContaPagarDetalheDrawer
        contaId={contaIdDrawer}
        onClose={() => setContaIdDrawer(null)}
      />

      {sugestaoMovId && (
        <SugestaoIADialog
          movId={sugestaoMovId}
          onClose={() => setSugestaoMovId(null)}
          onApply={() => {
            qc.invalidateQueries({ queryKey: ["lancamentos-caixa-banco"] });
            setSugestaoMovId(null);
          }}
        />
      )}

      <FilaRevisaoIADialog open={filaIAOpen} onClose={() => setFilaIAOpen(false)} />
    </div>
  );

  function onOpenContaDrawer(id: string) {
    setContaIdDrawer(id);
  }
}
