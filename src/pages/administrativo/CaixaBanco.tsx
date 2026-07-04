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
import { SortableTableHead, ordenarPor, type SortState } from "@/components/shared/SortableTableHead";
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
  AlertTriangle,
  MailCheck,
  Repeat,
  CreditCard,
  CalendarRange,
  AlertOctagon,
  CalendarClock,
  Sparkles,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useFiltrosPersistentes } from "@/hooks/useFiltrosPersistentes";
import ContaPagarDetalheDrawer from "@/components/financeiro/ContaPagarDetalheDrawer";
import SugestaoIADialog from "@/components/financeiro/SugestaoIADialog";
import BuscarNFStageDialog from "@/components/financeiro/BuscarNFStageDialog";
import VisualizarDocumentoModal from "@/components/financeiro/VisualizarDocumentoModal";
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
  getQualidadeDocumento,
  getQualidadeCategoria,
  corClass,
} from "./CaixaBanco/utils";
import MovimentacoesGerencial from "@/components/financeiro/MovimentacoesGerencial";

type FormaPgtoLite = { id: string; nome: string };
type Parceiro = { id: string; razao_social: string | null };
type CategoriaLite = { id: string; nome: string };
type FiltroTipo = "tudo" | "apagar" | "realizado" | "receitas" | "gerencial";

type Receita = {
  id: string;
  data_transacao: string;
  descricao: string | null;
  valor: number;
  plano_contas_id: string | null;
  centro_custo_id: string | null;
  conta_bancaria_id: string;
  origem: string | null;
};

type TituloAReceber = {
  id: string;
  numero_titulo: string | null;
  data_vencimento_atual: string | null;
  valor_atual: number | null;
  valor_bruto: number | null;
  boleto_status: string | null;
  tipo_pagamento: string | null;
  conta: { parceiro: { razao_social: string | null } | null } | null;
};

type FiltroQualidade =
  | "todos"
  | "doc_tem" | "doc_falta"
  | "categoria_tem" | "categoria_falta";

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
  const [aplicandoIA, setAplicandoIA] = useState(false);
  const [sugestaoMovId, setSugestaoMovId] = useState<string | null>(null);
  const [buscarNFContaId, setBuscarNFContaId] = useState<string | null>(null);
  const [buscarNFDescricao, setBuscarNFDescricao] = useState("");
  const [buscarNFValor, setBuscarNFValor] = useState(0);
  const [filaIAOpen, setFilaIAOpen] = useState(false);
  const [filtroQual, setFiltroQual] = useState<FiltroQualidade>("todos");
  const [receitaSubView, setReceitaSubView] = useState<"a_receber" | "recebido">("a_receber");
  const [modalDocNfId, setModalDocNfId] = useState<string | null>(null);
  const [modalDocOpen, setModalDocOpen] = useState(false);
  const [sort, setSort] = useState<SortState<
    "parceiro" | "descricao" | "vencimento" | "pago_em" | "valor"
  > | null>(null);

  function handleClickIconeDocumento(
    l: Lancamento,
    qDoc: { cor: "verde" | "vermelho"; nfStageId: string | null },
  ) {
    if (qDoc.cor === "verde" && qDoc.nfStageId) {
      setModalDocNfId(qDoc.nfStageId);
      setModalDocOpen(true);
    } else if (l.origem_view === "conta_pagar") {
      setBuscarNFContaId(l.id);
      setBuscarNFDescricao(l.descricao ?? "");
      setBuscarNFValor(Number(l.valor ?? 0));
    }
  }

  // Query principal — view unificada
  const { data: lancamentos, isLoading } = useQuery({
    queryKey: ["lancamentos-caixa-banco"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_lancamentos_caixa_banco")
        .select("*")
        .in("status_conta_pagar", ["enviado_para_pagamento"])
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return (data || []) as Lancamento[];
    },
  });

  // forma_pagamento_id vem direto da view vw_lancamentos_caixa_banco

  // Receitas — direto de movimentacoes_bancarias (tipo=credito sem CPR vinculada)
  const { data: receitas = [] } = useQuery<Receita[]>({
    queryKey: ["receitas-caixa-banco", contaBancariaFilter],
    enabled: tipoParam === "receitas",
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("movimentacoes_bancarias")
        .select(
          "id, data_transacao, descricao, valor, plano_contas_id, centro_custo_id, conta_bancaria_id, origem",
        )
        .eq("tipo", "credito")
        .is("conta_pagar_id", null);
      if (contaBancariaFilter !== "todas") q = q.eq("conta_bancaria_id", contaBancariaFilter);
      const { data, error } = await q.order("data_transacao", { ascending: false });
      if (error) throw error;
      return (data || []) as Receita[];
    },
  });

  const receitasFiltradas = useMemo(() => {
    if (!busca.trim()) return receitas;
    const t = busca.toLowerCase();
    return receitas.filter((r) => (r.descricao || "").toLowerCase().includes(t));
  }, [receitas, busca]);

  // A receber — títulos em aberto (sem FK conta_bancaria — filtro de banco não se aplica aqui)
  const { data: titulosAReceber = [] } = useQuery<TituloAReceber[]>({
    queryKey: ["titulos-a-receber-caixa"],
    enabled: tipoParam === "receitas" && receitaSubView === "a_receber",
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("titulo_a_receber")
        .select(`
          id, numero_titulo, data_vencimento_atual, valor_atual, valor_bruto,
          boleto_status, tipo_pagamento,
          conta:contas_pagar_receber(
            parceiro:parceiros_comerciais(razao_social)
          )
        `)
        .not("status", "in", "(pago,pago_com_atraso,pago_judicial,cancelado,cancelado_recuperacao,baixado_por_perda)")
        .order("data_vencimento_atual", { ascending: true });
      if (error) throw error;
      return (data || []) as TituloAReceber[];
    },
  });

  const titulosFiltrados = useMemo(() => {
    if (!busca.trim()) return titulosAReceber;
    const q = busca.toLowerCase();
    return titulosAReceber.filter(
      (t) =>
        (t.numero_titulo || "").toLowerCase().includes(q) ||
        (t.conta?.parceiro?.razao_social || "").toLowerCase().includes(q),
    );
  }, [titulosAReceber, busca]);

  const totalAReceber = useMemo(
    () => titulosFiltrados.reduce((s, t) => s + Number(t.valor_atual ?? t.valor_bruto ?? 0), 0),
    [titulosFiltrados],
  );

  const totalReceitas = useMemo(
    () => receitasFiltradas.reduce((acc, r) => acc + Number(r.valor || 0), 0),
    [receitasFiltradas],
  );

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

  const { data: meiosPagamento } = useQuery({
    queryKey: ["meios-pagamento-lite"],
    queryFn: async () => {
      const { data } = await supabase
        .from("meios_pagamento")
        .select("id, nome, codigo");
      return (data || []) as Array<{ id: string; nome: string; codigo: string }>;
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

  // Map lancamento.id → nf_stage_id (uma NF representativa por CPR).
  const { data: nfMap } = useQuery({
    queryKey: ["nfs-vinculadas-mov", lancamentoIds.join(",")],
    enabled: lancamentoIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const map = new Map<string, string | null>();

      // Lookup 1: NFs que apontam pra CPR (nfs_stage.conta_pagar_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: nfsPorConta } = await (supabase as any)
        .from("nfs_stage")
        .select("id, conta_pagar_id")
        .in("conta_pagar_id", lancamentoIds)
        .not("conta_pagar_id", "is", null);
      (nfsPorConta || []).forEach((nf: { id: string; conta_pagar_id: string | null }) => {
        if (nf.conta_pagar_id && !map.has(nf.conta_pagar_id)) {
          map.set(nf.conta_pagar_id, nf.id);
        }
      });

      // Lookup 2: Lançamentos de cartão com NF vinculada (campo próprio do domínio cartão)
      const idsCartao = (lancamentos || [])
        .filter((l) => l.origem_view === "cartao_lancamento")
        .map((l) => l.id);
      if (idsCartao.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: cartaoComNF } = await (supabase as any)
          .from("fatura_cartao_lancamentos")
          .select("id, nf_stage_id")
          .in("id", idsCartao)
          .not("nf_stage_id", "is", null);
        (cartaoComNF || []).forEach((lanc: { id: string; nf_stage_id: string | null }) => {
          if (lanc.nf_stage_id) map.set(lanc.id, lanc.nf_stage_id);
        });
      }

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

  const mapMeios = useMemo(() => {
    const m: Record<string, string> = {};
    (meiosPagamento || []).forEach((mp) => (m[mp.id] = mp.nome));
    return m;
  }, [meiosPagamento]);

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
      const jaPago =
        !!l.movimentacao_bancaria_id ||
        l.status_caixa === "pago" ||
        l.status_caixa === "conciliado";
      if (jaPago) realizado.push(l);
      else aPagar.push(l);
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

    // A pagar próximo mês — usa listaAPagar (status enviado_para_pagamento) + venc no próximo mês
    const aPagarProxMes = listaAPagar.filter((l) => {
      if (!l.data_vencimento) return false;
      const v = new Date(l.data_vencimento + "T00:00:00");
      return v >= iniProx && v <= fimProx;
    });

    // Conciliado / Sem conciliação — sobre TODOS os pagos (qualquer mês)
    // "Sem conciliação" = pagos mas sem movimentacao_bancaria_id e não são cartão
    // Esse é o backlog real: saiu dinheiro mas não bateu no extrato
    const semConc = listaRealizado.filter(
      (l) => !l.movimentacao_bancaria_id && !l.vinculada_cartao && l.origem_view !== "cartao_lancamento"
    );
    const conciliadas = listaRealizado.filter(
      (l) => l.movimentacao_bancaria_id || l.vinculada_cartao || l.origem_view === "cartao_lancamento"
    );

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

  // KPIs Qualidade — 2 ícones (Doc, Categoria)
  const kpisQualidade = useMemo(() => {
    const base = listaFiltradaPorPill;
    const total = base.length;
    const comDoc = base.filter((l) => getQualidadeDocumento(l, nfMap).cor === "verde").length;
    const comCat = base.filter((l) => getQualidadeCategoria(l).cor === "verde").length;
    return {
      Documento: { tem: comDoc, falta: total - comDoc, total },
      Categoria: { tem: comCat, falta: total - comCat, total },
    };
  }, [listaFiltradaPorPill, nfMap]);

  // Lista exibida na tabela = pill + filtros adicionais (contador / inconsistências / qualidade)
  const listaExibida = useMemo(() => {
    let list: Lancamento[] = listaFiltradaPorPill;

    if (filtroQual !== "todos") {
      list = list.filter((l) => {
        switch (filtroQual) {
          case "doc_tem": return getQualidadeDocumento(l, nfMap).cor === "verde";
          case "doc_falta": return getQualidadeDocumento(l, nfMap).cor !== "verde";
          case "categoria_tem": return getQualidadeCategoria(l).cor === "verde";
          case "categoria_falta": return getQualidadeCategoria(l).cor !== "verde";
          default: return true;
        }
      });
    }
    return ordenarPor(list, sort, {
      parceiro: (l) => (l.parceiro_id && mapParceiros[l.parceiro_id]) || "",
      descricao: (l) => l.descricao || "",
      vencimento: (l) => l.data_vencimento || "",
      pago_em: (l) => l.data_pagamento || "",
      valor: (l) => l.valor || 0,
    });
  }, [listaFiltradaPorPill, filtroQual, nfMap, sort, mapParceiros]);

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

          {/* Pills de tipo */}
          <div className="flex gap-1 ml-auto">
            {([
              { key: "tudo", label: "Tudo" },
              { key: "apagar", label: "A pagar" },
              { key: "realizado", label: "Realizado" },
              { key: "receitas", label: "Receitas" },
              { key: "gerencial", label: "Gerencial" },
            ] as { key: FiltroTipo; label: string }[]).map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={tipoParam === p.key ? "default" : "outline"}
                onClick={() => setTipo(p.key)}
                className={tipoParam === p.key ? "bg-admin hover:bg-admin/90" : ""}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* CONTEÚDO COM SCROLL */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6 pt-3 space-y-3">
        {/* KPIs — escondidos no modo Receitas */}
        {tipoParam !== "receitas" && (
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
          <CardKPIDuplo
            titulo="Conciliado" icone={CheckCircle2} cor="fetely"
            total={kpis.conciliado.qtd + kpis.semConciliacao.qtd}
            qtdTem={kpis.conciliado.qtd}
            qtdFalta={kpis.semConciliacao.qtd}
            ativoTem={false}
            ativoFalta={false}
            onClickTem={() => {}}
            onClickFalta={() => {}}
          />
          <CardKPIDuplo
            titulo="NF / Recibo" icone={Receipt} cor="fetely"
            total={kpisQualidade.Documento.total}
            qtdTem={kpisQualidade.Documento.tem} qtdFalta={kpisQualidade.Documento.falta}
            ativoTem={filtroQual === "doc_tem"} ativoFalta={filtroQual === "doc_falta"}
            onClickTem={() => setFiltroQual(filtroQual === "doc_tem" ? "todos" : "doc_tem")}
            onClickFalta={() => setFiltroQual(filtroQual === "doc_falta" ? "todos" : "doc_falta")}
          />
        </div>
        )}

        {/* Botão IA — escondido no modo Receitas */}
        {tipoParam !== "receitas" && (
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={handleAplicarIAEmMassa}
            disabled={aplicandoIA}
            className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
          >
            {aplicandoIA ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Classificar pendentes
          </Button>
        </div>
        )}

        {/* Aba Receitas — A receber + Recebido */}
        {tipoParam === "receitas" && (
          <div className="space-y-3">
            {/* Sub-pills */}
            <div className="flex gap-2">
              {(["a_receber", "recebido"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setReceitaSubView(v)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    receitaSubView === v
                      ? "bg-emerald-600 text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {v === "a_receber" ? "A receber" : "Recebido"}
                </button>
              ))}
            </div>

            {/* Sub-view: A receber */}
            {receitaSubView === "a_receber" && (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-medium">
                    A receber
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({titulosFiltrados.length} {titulosFiltrados.length === 1 ? "título" : "títulos"})
                    </span>
                  </h2>
                  <div className="text-sm font-mono text-emerald-700">
                    Total: {formatBRL(totalAReceber)}
                  </div>
                </div>

                {titulosFiltrados.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    Nenhum título a receber com os filtros atuais.
                  </div>
                ) : (
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vencimento</TableHead>
                          <TableHead>Título</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Forma</TableHead>
                          <TableHead>Boleto</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {titulosFiltrados.map((t) => {
                          const hoje = new Date().toISOString().slice(0, 10);
                          const venceu = (t.data_vencimento_atual ?? "9999") < hoje;
                          const bsCfg: Record<string, { label: string; cls: string }> = {
                            pendente:       { label: "Pendente",       cls: "bg-gray-100 text-gray-600" },
                            remessa_gerada: { label: "Remessa gerada", cls: "bg-yellow-100 text-yellow-800" },
                            registrado:     { label: "Registrado",     cls: "bg-blue-100 text-blue-800" },
                            pago_manual:    { label: "Pago (manual)",  cls: "bg-emerald-100 text-emerald-800" },
                            pago_banco:     { label: "Pago (Safra)",   cls: "bg-green-700 text-white" },
                            rejeitado:      { label: "Rejeitado",      cls: "bg-red-100 text-red-800" },
                            vencido:        { label: "Vencido",        cls: "bg-orange-100 text-orange-800" },
                          };
                          const bs = t.boleto_status ? bsCfg[t.boleto_status] : null;
                          return (
                            <TableRow key={t.id}>
                              <TableCell className="whitespace-nowrap text-xs">
                                {t.data_vencimento_atual
                                  ? new Date(t.data_vencimento_atual + "T00:00:00").toLocaleDateString("pt-BR")
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-xs">{t.numero_titulo ?? "—"}</TableCell>
                              <TableCell className="text-xs">
                                {t.conta?.parceiro?.razao_social ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {t.tipo_pagamento?.replace("_", " ") ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {bs ? (
                                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${bs.cls}`}>
                                    {bs.label}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono whitespace-nowrap text-emerald-700">
                                {formatBRL(Number(t.valor_atual ?? t.valor_bruto ?? 0))}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            {/* Sub-view: Recebido */}
            {receitaSubView === "recebido" && (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-medium">
                    Recebido
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({receitasFiltradas.length} {receitasFiltradas.length === 1 ? "lançamento" : "lançamentos"})
                    </span>
                  </h2>
                  <div className="text-sm font-mono text-emerald-700">
                    Total: {formatBRL(totalReceitas)}
                  </div>
                </div>

                {receitasFiltradas.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    Nenhuma receita recebida no período/filtros atuais.
                  </div>
                ) : (
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead>Conta Bancária</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receitasFiltradas.map((r) => {
                          const cat = (categorias || []).find((c) => c.id === r.plano_contas_id);
                          const cb = (contasBancarias || []).find((b) => b.id === r.conta_bancaria_id);
                          return (
                            <TableRow key={r.id}>
                              <TableCell className="whitespace-nowrap text-xs">
                                {new Date(r.data_transacao + "T00:00:00").toLocaleDateString("pt-BR")}
                              </TableCell>
                              <TableCell className="text-xs">{r.descricao || "—"}</TableCell>
                              <TableCell className="text-xs">
                                {cat ? cat.nome : <span className="text-muted-foreground">— sem categoria</span>}
                              </TableCell>
                              <TableCell className="text-xs">{cb?.nome_exibicao || "—"}</TableCell>
                              <TableCell className="text-right font-mono whitespace-nowrap text-emerald-700">
                                +{formatBRL(Number(r.valor))}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tabela única (despesas) */}
        {tipoParam !== "receitas" && (
        <>
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
                    <SortableTableHead column="parceiro" sort={sort} onSort={setSort}>Parceiro</SortableTableHead>
                    <SortableTableHead column="descricao" sort={sort} onSort={setSort}>Descrição</SortableTableHead>
                    <SortableTableHead column="vencimento" sort={sort} onSort={setSort}>Vencimento</SortableTableHead>
                    <TableHead>Enviado em</TableHead>
                    <TableHead>Conta</TableHead>
                    <SortableTableHead column="pago_em" sort={sort} onSort={setSort}>Pago em</SortableTableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Forma de Pagamento</TableHead>
                    <SortableTableHead column="valor" sort={sort} onSort={setSort} align="right" className="text-right">Valor</SortableTableHead>
                    <TableHead>Tags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listaExibida.map((l) => {
                    const sv = statusVisual(l);
                    const isRealizado =
                      !!l.movimentacao_bancaria_id ||
                      l.status_caixa === "pago" ||
                      l.status_caixa === "conciliado";
                    const atrasada = isAtrasada(l);
                    const dias = diasAtraso(l);
                    const formaId = l.forma_pagamento_id;
                    const formaNome = formaId ? mapFormas[formaId] : null;
                    // Modelo 3D: quando há cartão, mostra nome do cartão (instância)
                    // em vez do meio genérico ("Cartão de Crédito").
                    const meioDisplay = l.cartao_nome || formaNome;
                    const categoriaNome = l.plano_contas_id && mapCategorias[l.plano_contas_id];
                    const flags = statusFlagsMap.get(l.id);
                    const remessa = contadorMap?.get(l.id);
                    const enviadoContador = !!remessa;
                    const qDoc = getQualidadeDocumento(l, nfMap);
                    const qCat = getQualidadeCategoria(l);
                    const ci = compromissoInfoMap.get(l.id);


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
                          {l.data_enviada_para_pagamento ? (
                            formatDateBR(l.data_enviada_para_pagamento)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          {l.conta_bancaria_nome ? (
                            <span className="text-xs">{l.conta_bancaria_nome}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-xs">
                          {l.pago_em ? (
                            formatDateBR(l.pago_em)
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
                              if (!meioDisplay) return <span>—</span>;
                              // Ícone segue o tipo de meio (formaNome), texto usa nome do cartão se houver
                              const ico = formaNome ? getMeioPagamentoIcon(formaNome) : null;
                              if (ico) {
                                return (
                                  <span
                                    className="flex items-center gap-1.5 whitespace-nowrap"
                                    title={meioDisplay}
                                  >
                                    <ico.Icon
                                      className={`h-4 w-4 ${ico.cor} shrink-0`}
                                    />
                                    <span>{meioDisplay}</span>
                                  </span>
                                );
                              }
                              return <span>{meioDisplay}</span>;
                            })()}
                            {l.fatura_id && (
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

                        {/* Coluna única de ícones — clicáveis com ação direta */}
                        <TableCell
                          className="min-w-[140px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <TooltipProvider>
                            <div className="flex items-center gap-2">
                              {/* ÍCONE 1: NF / Recibo */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => handleClickIconeDocumento(l, qDoc)}
                                    className="focus:outline-none"
                                  >
                                    <Receipt
                                      className={cn(
                                        "h-3.5 w-3.5 cursor-pointer hover:scale-125 transition-transform",
                                        corClass(qDoc.cor),
                                      )}
                                      strokeWidth={2.2}
                                    />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="text-xs">📄 {qDoc.motivo}</p>
                                  {qDoc.cor !== "verde" && (
                                    <p className="text-[10px] text-muted-foreground">
                                      Clique para vincular NF
                                    </p>
                                  )}
                                  {qDoc.cor === "verde" && (
                                    <p className="text-[10px] text-muted-foreground">
                                      Clique para visualizar
                                    </p>
                                  )}
                                </TooltipContent>
                              </Tooltip>

                              {/* ÍCONE 2: Categoria */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (qCat.cor !== "verde" && l.origem_view === "conta_pagar") {
                                        onOpenContaDrawer(l.id);
                                      }
                                    }}
                                    className="focus:outline-none"
                                  >
                                    <FolderTree
                                      className={cn(
                                        "h-3.5 w-3.5",
                                        corClass(qCat.cor),
                                        qCat.cor !== "verde" && l.origem_view === "conta_pagar"
                                          ? "cursor-pointer hover:scale-125 transition-transform"
                                          : "cursor-help",
                                      )}
                                      strokeWidth={2.2}
                                    />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="text-xs">🏷️ {qCat.motivo}</p>
                                  {qCat.cor !== "verde" && l.origem_view === "conta_pagar" && (
                                    <p className="text-[10px] text-muted-foreground">
                                      Clique para classificar
                                    </p>
                                  )}
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
        </>
        )}
      </div>

      <ContaPagarDetalheDrawer
        contaId={contaIdDrawer}
        onClose={() => setContaIdDrawer(null)}
      />

      {buscarNFContaId && (
        <BuscarNFStageDialog
          open={!!buscarNFContaId}
          onOpenChange={(open) => { if (!open) setBuscarNFContaId(null); }}
          contaId={buscarNFContaId}
          contaDescricao={buscarNFDescricao}
          contaValor={buscarNFValor}
          onVinculado={() => setBuscarNFContaId(null)}
        />
      )}

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

      <VisualizarDocumentoModal
        nfStageId={modalDocNfId}
        open={modalDocOpen}
        onOpenChange={(o) => {
          setModalDocOpen(o);
          if (!o) setModalDocNfId(null);
        }}
      />
    </div>
  );

  function onOpenContaDrawer(id: string) {
    setContaIdDrawer(id);
  }
}
