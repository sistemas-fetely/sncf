// Aba "Importar PI" da Chegada de Mercadoria.
// DESTINO: LINHA DE PEDIDO de importacao (importacao_linha), nunca produto.
// Mesmo ritual do importador de produto (/vendas/produto/importar-pi):
// upload -> stage -> conferir -> efetivar. Quem julga bloqueio e' o banco:
// fn_linha_conferir_lote / fn_linha_efetivar_lote. O front so apresenta.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, FileSpreadsheet, Info, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import {
  lerArquivo,
  detectarCabecalho,
  normalizar,
  type MatchSinonimo,
  type CabecalhoDetectado,
} from "@/lib/pi/lerPlanilhaPI";

const IGNORAR = "— ignorar —";

// Campos do stage de LINHA. Nenhum e' obrigatorio na UI: quem trava e' a RPC.
const CAMPOS_DESTINO = [
  "sku", "cod_cadastro", "ean", "ref_item", "ref_pi", "descricao", "colecao",
  "grupo_produto", "qtd_kits", "qtd_und_kit", "qtd_kits_inner", "qtd_inner_master",
  "total_caixas_master", "cbm_caixa_master", "cbm_total", "custo_fob_kit",
  "custo_fob_total", "custo_setup",
] as const;
type CampoDestino = (typeof CAMPOS_DESTINO)[number];

const CAMPOS_NUMERICOS = new Set<string>([
  "qtd_kits", "qtd_und_kit", "qtd_kits_inner", "qtd_inner_master",
  "total_caixas_master", "cbm_caixa_master", "cbm_total", "custo_fob_kit",
  "custo_fob_total", "custo_setup",
]);
const CAMPOS_IDENTIDADE = ["sku", "cod_cadastro", "ean"];

const CHAVE_PEDIDOS = ["importacao-pi-pedidos"] as const;

type LinhaStage = {
  id: string;
  linha_num: number;
  sku: string | null;
  cod_cadastro: string | null;
  ean: string | null;
  descricao: string | null;
  qtd_kits: number | null;
  custo_fob_kit: number | null;
  custo_fob_total: number | null;
  cbm_total: number | null;
  estado: string | null;
  motivo: string | null;
};

type Bloqueio = {
  bloqueio?: string;
  linhas?: number;
  detalhe?: string | null;
  exemplos?: unknown;
};
type RespostaConferir = {
  ok?: boolean;
  linhas?: number;
  bloqueios?: Bloqueio[];
  avisos?: Bloqueio[];
  total_fob?: number | null;
  total_setup?: number | null;
};

type LinhaPrevia = Record<string, unknown>;
type RespostaEfetivar = {
  ok?: boolean;
  inserira?: number;
  removera?: number;
  inseridas?: number;
  removidas?: number;
  linhas?: LinhaPrevia[];
  cabecalho?: Record<string, unknown> | null;
  erro?: string | null;
};

type PedidoOpcao = {
  id: number;
  numero_pedido: string | null;
  fabrica: string | null;
  ref: string | null;
  linhas: number;
};

function msgErro(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/row-level security|permission denied|policy/i.test(m)) {
    return `Sem permissão para gravar: hoje só super_admin escreve nesta importação. (${m})`;
  }
  return m;
}

function chaveColuna(nome: string, i: number): string {
  return nome || `coluna_${i + 1}`;
}

function textoCelula(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** "1.234,56" e "1234.56" viram numero; celula vazia vira null, nunca 0. */
function paraNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cru = String(v).trim().replace(/[^\d,.-]/g, "");
  if (!cru || cru === "-") return null;
  const pt = cru.includes(",") ? cru.replace(/\./g, "").replace(",", ".") : cru;
  const n = Number(pt);
  return Number.isFinite(n) ? n : null;
}

/** Codigo com zero a esquerda preservado — o Excel entrega numero e o zero se perde. */
function paraCodigo(v: unknown, tamanho: number): string | null {
  if (v === null || v === undefined || v === "") return null;
  const bruto = typeof v === "number" ? String(Math.round(v)) : String(v).trim();
  if (!bruto) return null;
  return /^\d+$/.test(bruto) && bruto.length < tamanho ? bruto.padStart(tamanho, "0") : bruto;
}

function coagir(campo: string, valor: unknown): unknown {
  if (CAMPOS_NUMERICOS.has(campo)) return paraNumero(valor);
  if (campo === "ean") return paraCodigo(valor, 13);
  if (campo === "cod_cadastro") return paraCodigo(valor, 5);
  const s = textoCelula(valor).trim();
  return s === "" ? null : s;
}

function num(v: number | null | undefined): string {
  return v === null || v === undefined
    ? "—"
    : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rotuloBloqueio(b: Bloqueio): string {
  return (b.bloqueio ?? "sem código").replace(/_/g, " ");
}

function exemplosTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" · ") || null;
  }
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

export default function ImportarPiPedidoTab() {
  const queryClient = useQueryClient();

  // passo 1
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [abas, setAbas] = useState<string[]>([]);
  const [matrizPorAba, setMatrizPorAba] = useState<Record<string, unknown[][]>>({});
  const [aba, setAba] = useState<string>("");
  const [lendo, setLendo] = useState(false);
  const [cabecalho, setCabecalho] = useState<CabecalhoDetectado | null>(null);
  const [semMatch, setSemMatch] = useState(false);
  const [linhaManual, setLinhaManual] = useState<string>("");
  const [pedidoId, setPedidoId] = useState<string>("");
  const [fornecedor, setFornecedor] = useState("");
  const [piNumero, setPiNumero] = useState("");
  const [modo, setModo] = useState<"inserir" | "substituir">("inserir");
  const [confirmaSubstituir, setConfirmaSubstituir] = useState("");

  // passo 2
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({});

  // passo 3
  const [gravando, setGravando] = useState(false);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [gravadas, setGravadas] = useState(0);
  const [conferindo, setConferindo] = useState(false);
  const [conferencia, setConferencia] = useState<RespostaConferir | null>(null);
  const [edicoes, setEdicoes] = useState<Record<string, Record<string, string>>>({});
  const [salvandoLinha, setSalvandoLinha] = useState<string | null>(null);

  // passo 4
  const [motivo, setMotivo] = useState("");
  const [efetivando, setEfetivando] = useState(false);
  const [previa, setPrevia] = useState<RespostaEfetivar | null>(null);
  const [efetivado, setEfetivado] = useState<RespostaEfetivar | null>(null);

  const sinonimosQuery = useQuery({
    queryKey: ["pi-coluna-sinonimo"],
    queryFn: async (): Promise<MatchSinonimo[]> => {
      const { data, error } = await supabase
        .from("pi_coluna_sinonimo")
        .select("campo, sinonimo, formato");
      if (error) throw new Error(error.message);
      return (data ?? []) as MatchSinonimo[];
    },
  });

  const pedidosQuery = useQuery({
    queryKey: CHAVE_PEDIDOS,
    queryFn: async (): Promise<PedidoOpcao[]> => {
      const { data: pedidos, error: erroPedidos } = await supabase
        .from("importacao_pedido")
        .select("id, numero_pedido, fabrica_id")
        .order("id", { ascending: false });
      if (erroPedidos) throw new Error(erroPedidos.message);

      const { data: fabricas, error: erroFabricas } = await supabase
        .from("importacao_fabrica")
        .select("id, codigo, nome");
      if (erroFabricas) throw new Error(erroFabricas.message);

      const { data: vinculos, error: erroVinculos } = await supabase
        .from("importacao_embarque_pedido")
        .select("pedido_id, importacao_embarque(ref_rocabella)");
      if (erroVinculos) throw new Error(erroVinculos.message);

      // contagem de linhas por pedido — paginado, o PostgREST corta em 1000
      const porPedido = new Map<number, number>();
      const BLOCO = 1000;
      for (let inicio = 0; ; inicio += BLOCO) {
        const { data, error } = await supabase
          .from("importacao_linha")
          .select("importacao_pedido_id")
          .range(inicio, inicio + BLOCO - 1);
        if (error) throw new Error(error.message);
        const pagina = (data ?? []) as { importacao_pedido_id: number | null }[];
        for (const l of pagina) {
          const pid = l.importacao_pedido_id;
          if (pid === null) continue;
          porPedido.set(pid, (porPedido.get(pid) ?? 0) + 1);
        }
        if (pagina.length < BLOCO) break;
      }

      const nomeFabrica = new Map<number, string>();
      for (const f of (fabricas ?? []) as { id: number; codigo: string; nome: string | null }[]) {
        nomeFabrica.set(f.id, f.nome ?? f.codigo);
      }
      const refEmbarque = new Map<number, string>();
      for (const v of (vinculos ?? []) as unknown as {
        pedido_id: number | null;
        importacao_embarque: { ref_rocabella: string | null } | null;
      }[]) {
        if (v.pedido_id === null) continue;
        const ref = v.importacao_embarque?.ref_rocabella;
        if (ref && !refEmbarque.has(v.pedido_id)) refEmbarque.set(v.pedido_id, ref);
      }


      const lista = ((pedidos ?? []) as {
        id: number; numero_pedido: string | null; fabrica_id: number | null;
      }[]).map((p) => ({
        id: p.id,
        numero_pedido: p.numero_pedido,
        fabrica: p.fabrica_id === null ? null : nomeFabrica.get(p.fabrica_id) ?? null,
        ref: refEmbarque.get(p.id) ?? null,
        linhas: porPedido.get(p.id) ?? 0,
      }));

      // sem linha primeiro — e' o caso que a importacao veio resolver
      return lista.sort((a, b) => a.linhas - b.linhas || b.id - a.id);
    },
  });

  const sinonimos = sinonimosQuery.data ?? [];
  const pedidos = pedidosQuery.data ?? [];
  const pedidoEscolhido = pedidos.find((p) => String(p.id) === pedidoId) ?? null;
  const matriz = aba ? (matrizPorAba[aba] ?? []) : [];

  function limparEtapas() {
    setLoteId(null);
    setConferencia(null);
    setPrevia(null);
    setEfetivado(null);
    setEdicoes({});
  }

  function aplicarDeteccao(m: unknown[][]) {
    const det = detectarCabecalho(m, sinonimos);
    setCabecalho(det);
    setSemMatch(det === null);
    setMapeamento(filtrarCampos(det?.mapeamentoSugerido ?? {}));
    setLinhaManual(det ? String(det.linhaCabecalho) : "");
    limparEtapas();
    if (det) {
      toast.success(
        `Cabeçalho na linha ${det.linhaCabecalho} — ${det.camposCasados} de ${det.colunas.length} colunas reconhecidas`,
      );
    } else {
      toast.error("Nenhuma coluna casou com os sinônimos conhecidos — informe a linha do cabeçalho à mão");
    }
  }

  /** O dicionario de sinonimos e' compartilhado com o importador de produto: descarta campo que nao existe no stage de linha. */
  function filtrarCampos(m: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(m)) {
      if ((CAMPOS_DESTINO as readonly string[]).includes(v)) out[k] = v;
    }
    return out;
  }

  async function onArquivo(file: File | undefined) {
    if (!file) return;
    if (sinonimosQuery.isPending) {
      toast.error("Sinônimos de coluna ainda carregando — tente de novo em um instante");
      return;
    }
    setLendo(true);
    try {
      const { abas: as, matrizPorAba: mpa } = await lerArquivo(file);
      if (as.length === 0) throw new Error("planilha sem abas");
      setArquivoNome(file.name);
      setAbas(as);
      setMatrizPorAba(mpa);
      setAba(as[0]);
      aplicarDeteccao(mpa[as[0]] ?? []);
      for (const linha of (mpa[as[0]] ?? []).slice(0, 25)) {
        let achou = false;
        for (const cel of linha ?? []) {
          const m = /\bp\.?\s*i\.?\s*[:#nº ]*([a-z0-9-]{2,})/i.exec(textoCelula(cel));
          if (m) { setPiNumero(m[1]); achou = true; break; }
        }
        if (achou) break;
      }
      toast.success(`${file.name} lido — ${as.length} aba(s)`);
    } catch (e) {
      toast.error(msgErro(e));
    } finally {
      setLendo(false);
    }
  }

  function trocarAba(nome: string) {
    setAba(nome);
    aplicarDeteccao(matrizPorAba[nome] ?? []);
  }

  function reprocessar() {
    const n = Number(linhaManual);
    if (!Number.isInteger(n) || n < 1 || n > matriz.length) {
      toast.error(`Linha de cabeçalho inválida — a planilha tem ${matriz.length} linhas`);
      return;
    }
    const largura = matriz.reduce((w, l) => Math.max(w, l?.length ?? 0), 1);
    const colunas = Array.from({ length: largura }, (_, i) =>
      textoCelula((matriz[n - 1] ?? [])[i]).trim(),
    );
    const indice = new Map<string, MatchSinonimo>();
    for (const s of sinonimos) {
      const k = normalizar(s.sinonimo);
      if (k && !indice.has(k)) indice.set(k, s);
    }
    const sugerido: Record<string, string> = {};
    let casados = 0;
    colunas.forEach((c, i) => {
      const s = indice.get(normalizar(c));
      if (!s) return;
      casados += 1;
      sugerido[chaveColuna(c, i)] = s.campo;
    });
    setCabecalho({
      linhaCabecalho: n,
      colunas,
      camposCasados: casados,
      mapeamentoSugerido: sugerido,
      formatoProvavel: null,
      usouDuasLinhas: false,
    });
    setSemMatch(casados === 0);
    setMapeamento(filtrarCampos(sugerido));
    limparEtapas();
    toast.success(`Reprocessado com cabeçalho na linha ${n} — ${casados} colunas reconhecidas`);
  }

  const linhas = useMemo(() => {
    if (!cabecalho) return [] as { linhaNum: number; bruto: Record<string, unknown>; campos: Record<string, unknown> }[];
    const saida: { linhaNum: number; bruto: Record<string, unknown>; campos: Record<string, unknown> }[] = [];
    for (let i = cabecalho.linhaCabecalho; i < matriz.length; i++) {
      const linha = matriz[i] ?? [];
      if (!linha.some((c) => textoCelula(c).trim() !== "")) continue;
      const bruto: Record<string, unknown> = {};
      const campos: Record<string, unknown> = {};
      cabecalho.colunas.forEach((nome, c) => {
        const chave = chaveColuna(nome, c);
        bruto[chave] = linha[c] ?? null;
        const campo = mapeamento[chave];
        if (!campo || campo === IGNORAR) return;
        campos[campo] = coagir(campo, linha[c]);
      });
      saida.push({ linhaNum: i + 1, bruto, campos });
    }
    return saida;
  }, [matriz, cabecalho, mapeamento]);

  const exemplos = useMemo(() => {
    if (!cabecalho) return {} as Record<string, string>;
    const out: Record<string, string> = {};
    cabecalho.colunas.forEach((nome, c) => {
      const chave = chaveColuna(nome, c);
      for (let i = cabecalho.linhaCabecalho; i < matriz.length; i++) {
        const v = textoCelula((matriz[i] ?? [])[c]).trim();
        if (v !== "") { out[chave] = v; break; }
      }
    });
    return out;
  }, [cabecalho, matriz]);

  const camposUsados = useMemo(
    () => Array.from(new Set(Object.values(mapeamento).filter((c) => c && c !== IGNORAR))),
    [mapeamento],
  );
  const temIdentidade = camposUsados.some((c) => CAMPOS_IDENTIDADE.includes(c));
  const substituirConfirmado =
    modo === "inserir" || normalizar(confirmaSubstituir) === "substituir";

  // ---------- PASSO 3: gravar + conferir ----------
  async function gravarEConferir() {
    if (!cabecalho) return;
    if (!pedidoEscolhido) {
      toast.error("Escolha o pedido de destino — a linha nasce presa a um pedido");
      return;
    }
    if (!substituirConfirmado) {
      toast.error('Modo substituir: escreva "substituir" para confirmar a remoção das linhas atuais');
      return;
    }
    if (linhas.length === 0) {
      toast.error("Nenhuma linha de dado abaixo do cabeçalho informado");
      return;
    }
    setGravando(true);
    try {
      const { data: lote, error: erroLote } = await supabase
        .from("importacao_linha_lote")
        .insert({
          arquivo_nome: arquivoNome ?? "sem-nome",
          formato: cabecalho.formatoProvavel,
          fornecedor: fornecedor.trim() || null,
          pi_numero: piNumero.trim() || null,
          pedido_id: pedidoEscolhido.id,
          linha_cabecalho: cabecalho.linhaCabecalho,
          total_linhas: linhas.length,
          mapeamento,
          modo,
        })
        .select("id")
        .single<{ id: string }>();
      if (erroLote) throw new Error(`importacao_linha_lote: ${erroLote.message}`);
      if (!lote?.id) throw new Error("importacao_linha_lote: não retornou id do lote");

      const rows = linhas.map((l) => ({
        lote_id: lote.id,
        linha_num: l.linhaNum,
        bruto: l.bruto,
        ...l.campos,
      }));
      const BLOCO = 500;
      let total = 0;
      for (let i = 0; i < rows.length; i += BLOCO) {
        const bloco = rows.slice(i, i + BLOCO);
        const { error } = await supabase
          .from("importacao_linha_stage")
          // o objeto e' montado a partir do mapeamento escolhido pelo humano
          .insert(bloco as never);
        if (error) throw new Error(`importacao_linha_stage: ${error.message}`);
        total += bloco.length;
      }

      setLoteId(lote.id);
      setGravadas(total);
      setConferencia(null);
      setPrevia(null);
      setEfetivado(null);
      setEdicoes({});
      toast.success(`${total} linha(s) em estágio`);
      await conferir(lote.id);
    } catch (e) {
      toast.error(msgErro(e));
    } finally {
      setGravando(false);
    }
  }

  const stageQuery = useQuery({
    queryKey: ["importacao-linha-stage", loteId],
    enabled: !!loteId,
    queryFn: async (): Promise<LinhaStage[]> => {
      const { data, error } = await supabase
        .from("importacao_linha_stage")
        .select(
          "id, linha_num, sku, cod_cadastro, ean, descricao, qtd_kits, custo_fob_kit, custo_fob_total, cbm_total, estado, motivo",
        )
        .eq("lote_id", loteId!)
        .order("linha_num");
      if (error) throw new Error(error.message);
      return (data ?? []) as LinhaStage[];
    },
  });
  const linhasStage = stageQuery.data ?? [];

  async function conferir(id?: string) {
    const alvo = id ?? loteId;
    if (!alvo) return;
    setConferindo(true);
    try {
      const { data, error } = await supabase.rpc("fn_linha_conferir_lote", { p_lote_id: alvo });
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as RespostaConferir;
      setConferencia(r);
      setPrevia(null);
      setEfetivado(null);
      await queryClient.invalidateQueries({ queryKey: ["importacao-linha-stage", alvo] });
      if (r.ok) toast.success(`Conferido — ${r.linhas ?? 0} linha(s) liberada(s)`);
      else toast.error(`Conferência bloqueada — ${r.bloqueios?.length ?? 0} bloqueio(s)`);
    } catch (e) {
      toast.error(msgErro(e));
    } finally {
      setConferindo(false);
    }
  }

  function editar(id: string, campo: string, valor: string) {
    setEdicoes((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [campo]: valor } }));
  }

  async function salvarLinha(l: LinhaStage) {
    const alterado = edicoes[l.id];
    if (!alterado || Object.keys(alterado).length === 0) return;
    setSalvandoLinha(l.id);
    try {
      const patch: Record<string, unknown> = {};
      for (const [campo, valor] of Object.entries(alterado)) {
        patch[campo] = coagir(campo, valor);
      }
      const { error } = await supabase
        .from("importacao_linha_stage")
        .update(patch as never)
        .eq("id", l.id);
      if (error) throw new Error(error.message);
      setEdicoes((prev) => {
        const next = { ...prev };
        delete next[l.id];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["importacao-linha-stage", loteId] });
      toast.success(`Linha ${l.linha_num} corrigida — confira o lote de novo`);
    } catch (e) {
      toast.error(msgErro(e));
    } finally {
      setSalvandoLinha(null);
    }
  }

  // ---------- PASSO 4: efetivar ----------
  async function efetivar(dryRun: boolean) {
    if (!loteId) return;
    const m = motivo.trim();
    if (!m) {
      toast.error("Informe o motivo — é o rastro de quem pediu e de qual PI");
      return;
    }
    setEfetivando(true);
    try {
      const { data, error } = await supabase.rpc("fn_linha_efetivar_lote", {
        p_lote_id: loteId,
        p_motivo: m,
        p_dry_run: dryRun,
      });
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as RespostaEfetivar;
      if (dryRun) {
        setPrevia(r);
        setEfetivado(null);
        if (r.ok === false) throw new Error(r.erro ?? "Prévia recusada pelo banco");
        toast.success(`Prévia — ${r.inserira ?? 0} entram, ${r.removera ?? 0} saem`);
      } else {
        if (r.ok === false) throw new Error(r.erro ?? "Efetivação recusada pelo banco");
        setEfetivado(r);
        setPrevia(null);
        await queryClient.invalidateQueries({ queryKey: ["importacao-linha-stage", loteId] });
        await queryClient.invalidateQueries({ queryKey: CHAVE_PEDIDOS });
        await queryClient.invalidateQueries({ queryKey: ["importacao-embarques"] });
        toast.success(`Efetivado — ${r.inseridas ?? 0} linha(s) inserida(s)`);
      }
    } catch (e) {
      toast.error(msgErro(e));
    } finally {
      setEfetivando(false);
    }
  }

  const passo = !cabecalho || !pedidoId ? 1 : !loteId ? 2 : !conferencia?.ok ? 3 : 4;
  const destaque = (n: number) => cn(passo === n && "ring-1 ring-primary");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Esta aba <strong>não cria produto</strong>. Ela cria linha de pedido de importação.
        Produto novo nasce em{" "}
        <Link className="underline" to="/vendas/produto/importar-pi">
          /vendas/produto/importar-pi
        </Link>
        .
      </p>

      {sinonimosQuery.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Falha ao carregar os sinônimos de coluna: {msgErro(sinonimosQuery.error)}
          </AlertDescription>
        </Alert>
      )}
      {pedidosQuery.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Falha ao carregar os pedidos de destino: {msgErro(pedidosQuery.error)}
          </AlertDescription>
        </Alert>
      )}

      {/* PASSO 1 */}
      <Card className={destaque(1)}>
        <CardHeader>
          <CardTitle className="text-base">1. Arquivo e destino</CardTitle>
          <CardDescription>
            .xlsx, .xls ou .csv, lido no navegador. O arquivo não sobe para o storage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sinonimosQuery.isPending ? (
            <Skeleton className="h-10 w-full max-w-sm" />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="max-w-sm"
                onChange={(e) => onArquivo(e.target.files?.[0])}
              />
              {lendo && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> lendo planilha…
                </span>
              )}
            </div>
          )}

          {arquivoNome && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                {abas.length > 1 && (
                  <div className="space-y-1">
                    <Label>Aba</Label>
                    <Select value={aba} onValueChange={trocarAba}>
                      <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {abas.map((a) => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor="pi-linha-cab">Linha do cabeçalho</Label>
                  <Input
                    id="pi-linha-cab"
                    type="number"
                    min={1}
                    className="w-32"
                    value={linhaManual}
                    onChange={(e) => setLinhaManual(e.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={reprocessar} disabled={!matriz.length}>
                  Reprocessar
                </Button>
              </div>

              <div className="grid gap-3 rounded-md border p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Arquivo</div>
                  <div className="flex items-center gap-2 font-medium">
                    <FileSpreadsheet className="h-4 w-4" /> {arquivoNome}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Cabeçalho / colunas reconhecidas</div>
                  <div className="font-medium">
                    linha {cabecalho?.linhaCabecalho ?? "—"} · {cabecalho?.camposCasados ?? 0} de{" "}
                    {cabecalho?.colunas.length ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Linhas de dado</div>
                  <div className="font-medium">{linhas.length}</div>
                </div>
                {cabecalho?.usouDuasLinhas && (
                  <div><Badge variant="secondary">cabeçalho em 2 linhas</Badge></div>
                )}
              </div>

              {semMatch && (
                <Alert variant="destructive">
                  <AlertDescription>
                    Nenhuma coluna casou com os sinônimos conhecidos. Informe a linha do cabeçalho
                    acima e clique em Reprocessar.
                  </AlertDescription>
                </Alert>
              )}

              {/* prévia crua */}
              <div>
                <div className="mb-2 text-sm font-medium">Primeiras linhas cruas</div>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableBody>
                      {matriz.slice(0, 8).map((l, i) => (
                        <TableRow key={`crua-${i}`}>
                          <TableCell className="w-14 text-muted-foreground">{i + 1}</TableCell>
                          {(l ?? []).slice(0, 12).map((c, j) => (
                            <TableCell key={j} className="whitespace-nowrap font-mono text-xs">
                              {textoCelula(c) || "—"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Pedido de destino</Label>
              {pedidosQuery.isPending ? (
                <Skeleton className="h-10 w-full max-w-lg" />
              ) : (
                <Select value={pedidoId} onValueChange={setPedidoId}>
                  <SelectTrigger className="max-w-lg">
                    <SelectValue placeholder="Escolha o pedido de importação" />
                  </SelectTrigger>
                  <SelectContent>
                    {pedidos.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.numero_pedido ?? `pedido ${p.id}`}
                        {p.ref ? ` · ${p.ref}` : ""}
                        {p.fabrica ? ` · ${p.fabrica}` : ""}
                        {` · ${p.linhas} linha(s)`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="pi-fornecedor">Fornecedor</Label>
              <Input id="pi-fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pi-numero">Número da PI</Label>
              <Input id="pi-numero" value={piNumero} onChange={(e) => setPiNumero(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Modo</Label>
              <Select value={modo} onValueChange={(v) => setModo(v as "inserir" | "substituir")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inserir">inserir</SelectItem>
                  <SelectItem value="substituir">substituir</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {modo === "substituir" && (
            <Alert variant="destructive">
              <AlertDescription className="space-y-2">
                <div>
                  Na efetivação, as{" "}
                  <strong>{pedidoEscolhido?.linhas ?? 0} linha(s)</strong> que o pedido já tem
                  serão apagadas e trocadas pelas desta planilha.
                </div>
                <Input
                  className="max-w-xs bg-background"
                  placeholder='escreva "substituir" para confirmar'
                  value={confirmaSubstituir}
                  onChange={(e) => setConfirmaSubstituir(e.target.value)}
                />
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* PASSO 2 */}
      {cabecalho && (
        <Card className={destaque(2)}>
          <CardHeader>
            <CardTitle className="text-base">2. Mapeamento de colunas</CardTitle>
            <CardDescription>
              Pré-selecionado pelo dicionário de sinônimos. Nenhum campo é obrigatório aqui —
              quem decide o que trava é a conferência no banco.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coluna na planilha</TableHead>
                    <TableHead className="w-56">Campo destino</TableHead>
                    <TableHead>Exemplo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cabecalho.colunas.map((nome, i) => {
                    const chave = chaveColuna(nome, i);
                    return (
                      <TableRow key={chave}>
                        <TableCell className="font-medium">
                          {nome || <span className="text-muted-foreground">{chave}</span>}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={mapeamento[chave] ?? IGNORAR}
                            onValueChange={(v) =>
                              setMapeamento((prev) => {
                                const next = { ...prev };
                                if (v === IGNORAR) delete next[chave];
                                else next[chave] = v;
                                return next;
                              })
                            }
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={IGNORAR}>{IGNORAR}</SelectItem>
                              {CAMPOS_DESTINO.map((c: CampoDestino) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{exemplos[chave] ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {!temIdentidade && (
              <Alert>
                <AlertDescription>
                  Nenhuma das três chaves (<strong>sku</strong>, <strong>cod_cadastro</strong>,{" "}
                  <strong>ean</strong>) foi mapeada — sem elas a conferência não tem como
                  identificar o item.
                </AlertDescription>
              </Alert>
            )}

            <div>
              <div className="mb-2 text-sm font-medium">Prévia — 5 primeiras linhas</div>
              {camposUsados.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma coluna mapeada ainda.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Linha</TableHead>
                        {camposUsados.map((c) => (
                          <TableHead key={c}>{c}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linhas.slice(0, 5).map((l) => (
                        <TableRow key={l.linhaNum}>
                          <TableCell className="text-muted-foreground">{l.linhaNum}</TableCell>
                          {camposUsados.map((c) => (
                            <TableCell key={c} className="font-mono text-xs">
                              {l.campos[c] === null || l.campos[c] === undefined
                                ? "—"
                                : String(l.campos[c])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      {linhas.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={camposUsados.length + 1} className="text-muted-foreground">
                            Nenhuma linha de dado abaixo do cabeçalho informado.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <Button
              onClick={gravarEConferir}
              disabled={gravando || conferindo || linhas.length === 0 || !pedidoId || !substituirConfirmado}
            >
              {(gravando || conferindo) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gravar em estágio e conferir
            </Button>
          </CardContent>
        </Card>
      )}

      {/* PASSO 3 */}
      {loteId && (
        <Card className={destaque(3)}>
          <CardHeader>
            <CardTitle className="text-base">3. Conferência</CardTitle>
            <CardDescription>
              O banco decide o que trava. Corrija a linha e confira de novo — a conferência é
              reexecutável.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={() => conferir()} disabled={conferindo}>
                {conferindo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Conferir de novo
              </Button>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4" />
                Lote <span className="font-mono">{loteId}</span> · {gravadas} linha(s)
              </span>
            </div>

            {conferencia && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-4">
                  <div className="text-xs text-muted-foreground">Linhas</div>
                  <div className="text-2xl font-medium">{conferencia.linhas ?? 0}</div>
                </div>
                <div className="rounded-md border p-4">
                  <div className="text-xs text-muted-foreground">Total FOB</div>
                  <div className="text-2xl font-medium">{num(conferencia.total_fob)}</div>
                </div>
                <div className="rounded-md border p-4">
                  <div className="text-xs text-muted-foreground">Total setup</div>
                  <div className="text-2xl font-medium">{num(conferencia.total_setup)}</div>
                </div>
              </div>
            )}

            {(conferencia?.bloqueios ?? []).map((b, i) => (
              <Alert variant="destructive" key={`bloq-${i}`}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-1">
                  <div className="font-medium">
                    {rotuloBloqueio(b)}
                    {b.linhas !== undefined ? ` · ${b.linhas} linha(s)` : ""}
                  </div>
                  {b.detalhe && <div>{b.detalhe}</div>}
                  {exemplosTexto(b.exemplos) && (
                    <div className="font-mono text-xs">{exemplosTexto(b.exemplos)}</div>
                  )}
                  {b.bloqueio === "produto_nao_cadastrado" && (
                    <div>
                      Produto novo nasce em{" "}
                      <Link className="underline" to="/vendas/produto/importar-pi">
                        /vendas/produto/importar-pi
                      </Link>
                      .
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            ))}

            {(conferencia?.avisos ?? []).map((a, i) => (
              <Alert key={`aviso-${i}`} className="border-warning text-warning-foreground">
                <AlertDescription className="space-y-1">
                  <div className="font-medium">
                    {rotuloBloqueio(a)}
                    {a.linhas !== undefined ? ` · ${a.linhas} linha(s)` : ""}
                  </div>
                  {a.detalhe && <div>{a.detalhe}</div>}
                  {exemplosTexto(a.exemplos) && (
                    <div className="font-mono text-xs">{exemplosTexto(a.exemplos)}</div>
                  )}
                </AlertDescription>
              </Alert>
            ))}

            {stageQuery.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  Falha ao carregar as linhas do lote: {msgErro(stageQuery.error)}
                </AlertDescription>
              </Alert>
            )}
            {stageQuery.isPending && <Skeleton className="h-40 w-full" />}

            {!stageQuery.isPending && !stageQuery.isError && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Linha</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>cod_cadastro</TableHead>
                      <TableHead>EAN</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Kits</TableHead>
                      <TableHead>FOB kit</TableHead>
                      <TableHead>FOB total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasStage.map((l) => {
                      const ed = edicoes[l.id] ?? {};
                      const val = (campo: keyof LinhaStage) =>
                        ed[campo as string] ?? (l[campo] === null ? "" : String(l[campo]));
                      return (
                        <TableRow
                          key={l.id}
                          className={cn(l.estado === "bloqueado" && "bg-destructive/5")}
                        >
                          <TableCell className="text-muted-foreground">{l.linha_num}</TableCell>
                          {(["sku", "cod_cadastro", "ean"] as const).map((campo) => (
                            <TableCell key={campo}>
                              <Input
                                className="h-8 w-28 font-mono text-xs"
                                value={val(campo)}
                                onChange={(e) => editar(l.id, campo, e.target.value)}
                              />
                            </TableCell>
                          ))}
                          <TableCell className="max-w-[16rem] truncate text-xs">
                            {l.descricao ?? "—"}
                          </TableCell>
                          {(["qtd_kits", "custo_fob_kit", "custo_fob_total"] as const).map((campo) => (
                            <TableCell key={campo}>
                              <Input
                                className="h-8 w-24 text-right font-mono text-xs"
                                value={val(campo)}
                                onChange={(e) => editar(l.id, campo, e.target.value)}
                              />
                            </TableCell>
                          ))}
                          <TableCell>
                            <Badge variant={l.estado === "bloqueado" ? "destructive" : "outline"}>
                              {l.estado ?? "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[14rem] text-xs text-muted-foreground">
                            {l.motivo ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!edicoes[l.id] || salvandoLinha === l.id}
                              onClick={() => salvarLinha(l)}
                            >
                              {salvandoLinha === l.id && (
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                              )}
                              Salvar
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {linhasStage.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={11} className="text-muted-foreground">
                          Nenhuma linha em estágio para este lote.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* PASSO 4 */}
      {loteId && (
        <Card className={destaque(4)}>
          <CardHeader>
            <CardTitle className="text-base">4. Efetivação</CardTitle>
            <CardDescription>
              Primeiro a prévia, depois a gravação. O motivo é o rastro de quem pediu e de qual PI.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="pi-motivo">Motivo</Label>
              <Input
                id="pi-motivo"
                className="max-w-xl"
                placeholder="Ex.: Lanweier PI070626-162, coleção Jingle Pop"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => efetivar(true)}
                disabled={efetivando || !conferencia?.ok}
              >
                {efetivando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simular efetivação
              </Button>
              <Button onClick={() => efetivar(false)} disabled={efetivando || !previa?.ok}>
                {efetivando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar efetivação
              </Button>
            </div>

            {!conferencia?.ok && (
              <p className="text-sm text-muted-foreground">
                Disponível depois da conferência voltar sem bloqueio.
              </p>
            )}

            {previa && (
              <div className="space-y-3 rounded-md border p-4">
                <div className="text-sm font-medium">
                  {previa.inserira ?? 0} linha(s) entram · {previa.removera ?? 0} saem
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Quantidade</TableHead>
                        <TableHead>FOB</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(previa.linhas ?? []).map((l, i) => (
                        <TableRow key={`previa-${i}`}>
                          <TableCell className="font-mono text-xs">
                            {textoCelula(l.sku ?? l.cod_cadastro) || "—"}
                          </TableCell>
                          <TableCell className="max-w-[20rem] truncate text-xs">
                            {textoCelula(l.descricao) || "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {textoCelula(l.qtd_kits ?? l.quantidade) || "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {textoCelula(l.custo_fob_total ?? l.fob) || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(previa.linhas ?? []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-muted-foreground">
                            A prévia não trouxe linhas.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {efetivado && (
              <div className="space-y-2 rounded-md border p-4 text-sm">
                <div className="font-medium">
                  {efetivado.inseridas ?? 0} linha(s) inserida(s) · {efetivado.removidas ?? 0}{" "}
                  removida(s)
                </div>
                {efetivado.cabecalho && (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(efetivado.cabecalho).map(([k, v]) => (
                      <div key={k}>
                        <div className="text-xs text-muted-foreground">{k.replace(/_/g, " ")}</div>
                        <div className="font-mono text-xs">{textoCelula(v) || "—"}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
