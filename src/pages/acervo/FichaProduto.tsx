// Ficha do Produto — o lugar onde o bloco técnico do produto se edita no SNCF.
// A tela inteira se monta a partir de produto_ficha_nascimento (campo, bloco, dono,
// fase_exigida, obrigatorio, ordem, descricao): nenhuma lista de campo, dono ou bloco
// mora aqui. Campo novo na matriz aparece sozinho.
// Leitura: vw_produto_mesa_lista. Escrita: SEMPRE pela edge function gravar-produto-fop
// (o cliente nunca escreve em sncf_produtos nem em products). Fase: promover-fase-produto.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDownCircle, ArrowLeft, ArrowUpCircle, Check, ImageOff, Loader2, Lock, RefreshCw, Save, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { fmtDataHora } from "@/lib/data";
import { formatError } from "@/lib/format-error";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";

type LinhaMatriz = {
  campo: string;
  rotulo: string | null;
  bloco: string | null;
  dono: string | null;
  fase_exigida: string | null;
  obrigatorio: boolean | null;
  ordem: number | null;
  descricao: string | null;
};

type OpcaoCampo = { campo: string; valor: string; rotulo: string; ordem: number };

/** Sentinela do item "— vazio —": o Select não aceita item com valor vazio. Grava null. */
const SEM_VALOR = "__vazio__";

type LinhaProduto = Record<string, unknown> & {
  cod_cadastro: string | null;
  sku: string | null;
  nome_comercial: string | null;
  fase: string | null;
  fase_nome: string | null;
  proxima_fase: string | null;
  pronto_proxima_fase: boolean | null;
  falta_fase_atual: string[] | null;
  falta_proxima_fase: string[] | null;
  qtd_falta_proxima: number | null;
  campos_fora_do_espelho: string[] | null;
  tem_bling: boolean | null;
  saldo_disponivel: number | null;
  atualizado_em: string | null;
};

type ImagemProduto = {
  imagem_url: string | null;
  origem: string | null;
};

type FaseProduto = {
  slug: string;
  nome: string;
  ordem: number;
};

const ORIGEM_IMAGEM: Record<string, string> = {
  propria: "foto do produto — base própria",
  produto: "foto do produto",
  produto_shopify: "foto principal — pode não ser desta cor",
  cor: "foto da coleção nesta cor — não é do produto",
  colecao: "foto genérica da coleção",
};

/** Identidade: mesmo com dono='fetely', só muda pelo cartório (fn_pi_efetivar_lote).
 *  A edge function recusa com 403 — então a tela nem oferece o campo. */
const CAMPOS_IDENTIDADE = new Set(["cod_cadastro", "sku", "ean", "dun"]);

const NOTA_DONO: Record<string, string> = {
  thomer: "editado no catálogo (FOP)",
  sistema: "preenchido pelo sistema",
};

/** Erro estruturado das edge functions (403/422/409/502/500). */
type CorpoFuncao = Record<string, unknown>;

/** Texto quando o campo veio como string não vazia; senão undefined. */
function txt(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}
type ErroFuncao = { status: number; corpo: CorpoFuncao | null };

async function chamarFuncao(
  nome: string,
  payload: Record<string, unknown>,
): Promise<CorpoFuncao> {
  const { data, error } = await supabase.functions.invoke(nome, { body: payload });

  if (error) {
    const resp = (error as { context?: unknown })?.context as Response | undefined;
    if (resp && typeof resp.json === "function") {
      let corpo: CorpoFuncao | null = null;
      try {
        corpo = await resp.json();
      } catch (_) {
        try { corpo = { erro: await resp.text() }; } catch (_e) { corpo = null; }
      }
      throw { status: resp.status, corpo } as ErroFuncao;
    }
    throw { status: 0, corpo: { erro: error.message } } as ErroFuncao;
  }
  if (!data || data.ok !== true) {
    throw { status: 0, corpo: data ?? { erro: "Resposta vazia da função" } } as ErroFuncao;
  }
  return data;
}

function rotuloCampo(campo: string): string {
  const t = campo.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function rotuloBloco(bloco: string | null): string {
  if (!bloco) return "Outros";
  return rotuloCampo(bloco);
}

/** O tipo não vem da matriz, então é inferido: valor numérico na view manda,
 *  e na ausência de valor cai no sufixo da coluna. Nunca é lista de campos. */
function ehNumerico(campo: string, valorAtual: unknown): boolean {
  if (typeof valorAtual === "number") return true;
  return /(_g|_cm|_kg|_ml)$/.test(campo)
    || /^(preco_|qtd_)/.test(campo)
    || campo === "multiplos";
}

function textoValor(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v);
}

export default function FichaProduto() {
  const { cod_cadastro: codParam } = useParams<{ cod_cadastro: string }>();
  const cod = (codParam ?? "").trim();
  const navigate = useNavigate();

  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [promovendo, setPromovendo] = useState(false);
  const [confirmarRegressao, setConfirmarRegressao] = useState(false);
  const [motivoRegressao, setMotivoRegressao] = useState("");
  const [dePara, setDePara] = useState<Record<string, { de: unknown; para: unknown }> | null>(null);

  // erros fail-loud
  const [erro403, setErro403] = useState<{ campo?: string; dono?: string; erro: string } | null>(null);
  const [erroFop, setErroFop] = useState<string | null>(null);
  const [erroEspelho, setErroEspelho] = useState<string | null>(null);
  const [faltando, setFaltando] = useState<string[] | null>(null);
  const [confirmSaldo, setConfirmSaldo] = useState<{ saldo: number; faseDestino: string; motivo?: string } | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState(false);
  const [fotoFalhou, setFotoFalhou] = useState(false);

  const matrizQ = useQuery({
    queryKey: ["produto-ficha-matriz"],
    queryFn: async (): Promise<LinhaMatriz[]> => {
      const { data, error } = await supabase
        .from("produto_ficha_nascimento")
        .select("campo, rotulo, bloco, dono, fase_exigida, obrigatorio, ordem, descricao")
        .order("ordem", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as LinhaMatriz[];
    },
  });

  // OPÇÕES DE CAMPO: fonte única fn_ficha_opcoes(). Campo que aparece aqui vira Select;
  // o resto continua Input. Nenhum nome de campo escrito na tela.
  const opcoesQ = useQuery({
    queryKey: ["ficha-opcoes"],
    queryFn: async (): Promise<OpcaoCampo[]> => {
      const { data, error } = await supabase.rpc("fn_ficha_opcoes");
      if (error) throw new Error(error.message);
      return (data ?? []) as OpcaoCampo[];
    },
  });

  const opcoesPorCampo = useMemo(() => {
    const m = new Map<string, OpcaoCampo[]>();
    for (const o of opcoesQ.data ?? []) {
      const lista = m.get(o.campo) ?? [];
      lista.push(o);
      m.set(o.campo, lista);
    }
    for (const lista of m.values()) lista.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    return m;
  }, [opcoesQ.data]);

  const fasesQ = useQuery({
    queryKey: ["produto-fase-dim"],
    queryFn: async (): Promise<FaseProduto[]> => {
      const { data, error } = await supabase
        .from("produto_fase_dim")
        .select("slug, nome, ordem")
        .order("ordem", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as FaseProduto[];
    },
  });

  const produtoQ = useQuery({
    queryKey: ["produto-ficha", cod],
    enabled: cod.length > 0,
    queryFn: async (): Promise<LinhaProduto | null> => {
      const [fichaR, canalR] = await Promise.all([
        supabase
          .from("vw_produto_mesa_lista")
          .select("*")
          .eq("cod_cadastro", cod)
          .maybeSingle(),
        supabase
          .from("sncf_produtos")
          .select("canal_venda")
          .eq("cod_cadastro", cod)
          .maybeSingle(),
      ]);
      if (fichaR.error) throw new Error(fichaR.error.message);
      if (canalR.error) throw new Error(canalR.error.message);
      if (!fichaR.data) return null;
      return { ...fichaR.data, canal_venda: canalR.data?.canal_venda ?? null } as LinhaProduto;
    },
  });

  const imagemQ = useQuery({
    queryKey: ["produto-ficha-imagem", produtoQ.data?.sku],
    enabled: Boolean(produtoQ.data?.sku),
    queryFn: async (): Promise<ImagemProduto | null> => {
      const sku = produtoQ.data?.sku;
      if (!sku) return null;
      const { data, error } = await supabase
        .from("vw_produto_imagem_final")
        .select("imagem_url, origem")
        .eq("sku", sku)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const produto = produtoQ.data ?? null;
  const matriz = matrizQ.data ?? [];
  const imagem = imagemQ.data ?? null;
  const origemImagem = imagem?.origem ? ORIGEM_IMAGEM[imagem.origem] ?? imagem.origem : null;
  const origemFraca = imagem?.origem === "cor" || imagem?.origem === "colecao";
  const fotoDisponivel = Boolean(imagem?.imagem_url) && !fotoFalhou;
  const faseAtualDim = fasesQ.data?.find((fase) => fase.slug === produto?.fase) ?? null;
  const faseAnterior = faseAtualDim
    ? [...(fasesQ.data ?? [])]
      .filter((fase) => fase.ordem < faseAtualDim.ordem)
      .sort((a, b) => b.ordem - a.ordem)[0] ?? null
    : null;
  const rotuloPorCampo = useMemo(
    () => new Map(matriz.map((linha) => [linha.campo, linha.rotulo?.trim() || linha.campo])),
    [matriz],
  );

  useEffect(() => {
    setFotoFalhou(false);
  }, [imagem?.imagem_url]);

  const blocos = useMemo(() => {
    const mapa = new Map<string, LinhaMatriz[]>();
    for (const m of matriz) {
      if (CAMPOS_IDENTIDADE.has(m.campo)) continue; // identidade vive no cabeçalho
      const chave = m.bloco ?? "outros";
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(m);
    }
    return [...mapa.entries()];
  }, [matriz]);

  const faltaAtual = useMemo(
    () => new Set(Array.isArray(produto?.falta_fase_atual) ? produto!.falta_fase_atual! : []),
    [produto],
  );
  const faltaProxima = useMemo(
    () => new Set(Array.isArray(produto?.falta_proxima_fase) ? produto!.falta_proxima_fase! : []),
    [produto],
  );
  const ultimaFase = useMemo(
    () => [...(fasesQ.data ?? [])].sort((a, b) => b.ordem - a.ordem)[0] ?? null,
    [fasesQ.data],
  );
  const mostrarFaltaProxima = faltaProxima.size > 0
    && Boolean(produto?.proxima_fase)
    && produto?.proxima_fase !== ultimaFase?.slug;

  /** Alterações reais: rascunho ≠ view. Campo intocado não entra no payload. */
  const alteracoes = useMemo(() => {
    if (!produto) return [] as { campo: string; de: unknown; para: unknown }[];
    const saida: { campo: string; de: unknown; para: unknown }[] = [];
    for (const [campo, bruto] of Object.entries(rascunho)) {
      const atual = produto[campo];
      const vazio = bruto.trim() === "";
      const valor = vazio ? null : ehNumerico(campo, atual) ? Number(bruto) : bruto;
      if (textoValor(valor) === textoValor(atual)) continue;
      saida.push({ campo, de: atual ?? null, para: valor });
    }
    return saida;
  }, [rascunho, produto]);

  const numeroInvalido = alteracoes.some(
    (a) => typeof a.para === "number" && Number.isNaN(a.para),
  );

  function editar(campo: string, valor: string) {
    setRascunho((r) => ({ ...r, [campo]: valor }));
  }

  function descartar() {
    setRascunho({});
    setMotivo("");
  }

  async function salvar() {
    if (!produto || alteracoes.length === 0) return;
    setSalvando(true);
    try {
      const campos: Record<string, unknown> = {};
      for (const a of alteracoes) campos[a.campo] = a.para;

      const r = await chamarFuncao("gravar-produto-fop", {
        cod_cadastro: cod,
        campos,
        motivo: motivo.trim(),
      });

      setDePara((r.de_para as Record<string, { de: unknown; para: unknown }> | null) ?? null);
      setRascunho({});
      setMotivo("");
      const gravados = Array.isArray(r.gravados) ? r.gravados : [];
      toast.success(`${cod} — ${gravados.length} campo(s) gravado(s)`, {
        description: "Gravado no FOP e espelhado aqui.",
      });
      await produtoQ.refetch();
    } catch (e) {
      const err = e as ErroFuncao;
      const corpo: CorpoFuncao = err?.corpo ?? {};
      if (err?.status === 403) {
        setErro403({
          campo: txt(corpo.campo),
          dono: txt(corpo.dono),
          erro: txt(corpo.erro) ?? "Campo recusado.",
        });
      } else if (err?.status === 502) {
        setErroFop(
          typeof corpo.fop_body === "string"
            ? corpo.fop_body
            : JSON.stringify(corpo.fop_body ?? corpo, null, 2),
        );
      } else if (err?.status === 500 && String(corpo.erro ?? "").includes("espelho local")) {
        setErroEspelho(String(corpo.erro));
        await produtoQ.refetch();
      } else {
        toast.error("Não gravou", { description: txt(corpo.erro) ?? formatError(e) });
      }
    } finally {
      setSalvando(false);
      setConfirmar(false);
    }
  }

  const { permitido: podeFase, carregando: carregandoPermFase } = usePermissaoAcaoOuSuperAdmin("acao.produto_promover_fase");
  const semPermFase = carregandoPermFase || !podeFase;
  const tituloPermFase = !podeFase && !carregandoPermFase ? "Sem permissão: acao.produto_promover_fase" : undefined;

  async function mudarFase(faseDestino: string, motivoMudanca?: string, confirmarSaldoMudanca = false) {
    if (!produto?.sku || !faseDestino) return;
    setPromovendo(true);
    try {
      const r = await chamarFuncao("promover-fase-produto", {
        sku: produto.sku,
        fase_destino: faseDestino,
        ...(motivoMudanca ? { motivo: motivoMudanca } : {}),
        ...(confirmarSaldoMudanca ? { confirmar_saldo: true } : {}),
      });
      toast.success(`${cod} — ${r.de ?? "?"} → ${r.para}`, {
        description: "Fase gravada no FOP e espelhada aqui.",
      });
      await produtoQ.refetch();
      setConfirmarRegressao(false);
      setMotivoRegressao("");
    } catch (e) {
      const err = e as ErroFuncao;
      const corpo = err?.corpo ?? {};
      if (err?.status === 409) {
        setConfirmSaldo({
          saldo: Number(corpo.saldo_disponivel ?? 0),
          faseDestino,
          motivo: motivoMudanca,
        });
      } else if (err?.status === 422) {
        setFaltando(Array.isArray(corpo.campos_faltando) ? corpo.campos_faltando : []);
      } else if (err?.status === 502) {
        setErroFop(
          typeof corpo.fop_body === "string"
            ? corpo.fop_body
            : JSON.stringify(corpo.fop_body ?? corpo, null, 2),
        );
      } else {
        toast.error("Não mudou a fase", { description: txt(corpo.erro) ?? formatError(e) });
      }
    } finally {
      setPromovendo(false);
    }
  }

  function promover(confirmarSaldoMudanca = false) {
    if (!produto?.proxima_fase) return;
    return mudarFase(produto.proxima_fase, undefined, confirmarSaldoMudanca);
  }

  const Identidade = ({ campo }: { campo: string }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          {rotuloCampo(campo)}:{" "}
          <span className="font-mono text-foreground">{textoValor(produto?.[campo]) || "—"}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>identidade: só muda pelo cartório</TooltipContent>
    </Tooltip>
  );

  const Chips = ({ itens }: { itens: unknown }) => {
    const lista = Array.isArray(itens) ? (itens as string[]) : [];
    if (lista.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {lista.map((c) => (
          <Badge key={c} variant="outline" className="text-[10px] py-0">
            {rotuloPorCampo.get(c) ?? c}
          </Badge>
        ))}
      </div>
    );
  };

  if (!cod) {
    return (
      <PageShell>
        <Alert variant="destructive">
          <AlertTitle>Código ausente</AlertTitle>
          <AlertDescription>A rota precisa de um cod_cadastro.</AlertDescription>
        </Alert>
      </PageShell>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <PageShell>
        <PageHeader
          titulo={produto?.nome_comercial || `Produto ${cod}`}
          icone={Save}
          estado={
            produtoQ.isLoading
              ? "Carregando ficha…"
              : produto
                ? `Código ${cod} · atualizado ${fmtDataHora(produto.atualizado_em)}`
                : "Produto não encontrado"
          }
          acoes={
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate("/vendas/produto/mesa")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Mesa do Produto
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { produtoQ.refetch(); matrizQ.refetch(); }}
                disabled={produtoQ.isFetching}
              >
                {produtoQ.isFetching
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <RefreshCw className="mr-2 h-4 w-4" />}
                Atualizar
              </Button>
            </div>
          }
        />

        {matrizQ.isError && (
          <Alert variant="destructive">
            <AlertTitle>Não foi possível ler a matriz de campos</AlertTitle>
            <AlertDescription>{formatError(matrizQ.error)}</AlertDescription>
          </Alert>
        )}
        {produtoQ.isError && (
          <Alert variant="destructive">
            <AlertTitle>Não foi possível ler o produto</AlertTitle>
            <AlertDescription>{formatError(produtoQ.error)}</AlertDescription>
          </Alert>
        )}

        {!produtoQ.isLoading && !produtoQ.isError && !produto && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum produto com o código <span className="font-mono">{cod}</span>.
            </CardContent>
          </Card>
        )}

        {produto && (
          <>
            {/* cabeçalho de identidade — somente leitura */}
            <Card>
              <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                <span className="font-mono text-lg font-medium">{cod}</span>
                <span className="text-sm">{produto.nome_comercial || "—"}</span>
                {produto.fase_nome && <Badge variant="secondary">{produto.fase_nome}</Badge>}
                <span className="ml-auto flex flex-wrap items-center gap-3">
                  <Identidade campo="sku" />
                  <Identidade campo="ean" />
                  <Identidade campo="dun" />
                </span>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {/* blocos da matriz */}
              <div className="space-y-4 xl:col-span-2">
                {blocos.map(([bloco, campos]) => (
                  <Card key={bloco}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{rotuloBloco(bloco)}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {campos.map((m) => {
                        const dono = m.dono ?? "";
                        const editavel = dono === "fetely";
                        const noEspelho = Object.prototype.hasOwnProperty.call(produto, m.campo);
                        const atual = produto[m.campo];
                        const valor = Object.prototype.hasOwnProperty.call(rascunho, m.campo)
                          ? rascunho[m.campo]
                          : textoValor(atual);
                        const vazio = textoValor(atual).trim() === "";
                        const pendente = vazio && (faltaAtual.has(m.campo) || faltaProxima.has(m.campo));

                        const textoLongo = valor.length > 120;
                        // Campo com dimensão vira Select; a decisão vem do Map, não de lista no código.
                        const opcoes = opcoesPorCampo.get(m.campo) ?? [];
                        const obrigatorioAgora = Boolean(m.obrigatorio) && (!m.fase_exigida || m.fase_exigida === produto.fase);
                        const foraDaLista = valor.trim() !== "" && !opcoes.some((o) => o.valor === valor);


                        return (
                          <div key={m.campo} className={`min-w-0 space-y-1.5 ${textoLongo ? "sm:col-span-2" : ""}`}>
                            <div className="flex items-center gap-1.5">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Label htmlFor={`campo-${m.campo}`} className="text-xs text-muted-foreground">
                                    {rotuloCampo(m.campo)}
                                  </Label>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  {m.descricao?.trim() || `Campo ${m.campo} da matriz.`}
                                </TooltipContent>
                              </Tooltip>
                              {m.obrigatorio && (
                                <Badge variant="outline" className="py-0 text-[10px] text-muted-foreground">
                                  obrigatório{m.fase_exigida ? ` em ${m.fase_exigida}` : ""}
                                </Badge>
                              )}
                              {!editavel && (
                                <Badge variant="secondary" className="py-0 text-[10px] text-muted-foreground">
                                  {NOTA_DONO[dono] ?? `dono: ${dono || "—"}`}
                                </Badge>
                              )}
                              {pendente && (
                                <Badge
                                  variant="outline"
                                  className="border-warning/40 bg-warning/10 text-[10px] py-0 text-warning-strong"
                                >
                                  pendência
                                </Badge>
                              )}
                            </div>

                            {editavel && noEspelho && opcoes.length > 0 ? (
                              <Select
                                value={valor.trim() === "" ? SEM_VALOR : valor}
                                onValueChange={(v) => editar(m.campo, v === SEM_VALOR ? "" : v)}
                              >
                                <SelectTrigger id={`campo-${m.campo}`} className="h-9 text-foreground">
                                  <SelectValue placeholder="— vazio —" />
                                </SelectTrigger>
                                <SelectContent>
                                  {!obrigatorioAgora && <SelectItem value={SEM_VALOR}>— vazio —</SelectItem>}
                                  {foraDaLista && (
                                    <SelectItem value={valor}>{valor} (fora da lista)</SelectItem>
                                  )}
                                  {opcoes.map((o) => (
                                    <SelectItem key={o.valor} value={o.valor}>
                                      {o.rotulo === o.valor ? o.valor : `${o.rotulo} (${o.valor})`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : editavel && noEspelho && textoLongo ? (
                              <Textarea
                                id={`campo-${m.campo}`}
                                className="h-32 resize-y overflow-y-auto text-foreground"
                                value={valor}
                                onChange={(e) => editar(m.campo, e.target.value)}
                              />
                            ) : editavel && noEspelho ? (
                              <Input
                                id={`campo-${m.campo}`}
                                className="h-9 text-foreground"
                                value={valor}
                                onChange={(e) => editar(m.campo, e.target.value)}
                                inputMode={ehNumerico(m.campo, atual) ? "decimal" : undefined}
                              />
                            ) : noEspelho && textoLongo ? (
                              <div className="h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 px-3 py-2 text-sm text-foreground">
                                {textoValor(atual)}
                              </div>
                            ) : (
                              <div className="flex min-h-9 min-w-0 items-center overflow-hidden rounded-md border bg-muted/40 px-3 text-sm text-foreground">
                                {noEspelho
                                  ? (textoValor(atual) || <span className="text-muted-foreground">—</span>)
                                  : <span className="text-xs text-muted-foreground">fora do espelho do SNCF</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                ))}

                {/* rodapé de edição */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Salvar alterações</CardTitle>
                    <CardDescription>
                      {alteracoes.length === 0
                        ? "Nenhum campo alterado."
                        : `${alteracoes.length} campo(s) alterado(s). Só o que mudou é enviado.`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="motivo-ficha" className="text-xs">Motivo (obrigatório)</Label>
                      <Textarea
                        id="motivo-ficha"
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="ficha fiscal da PI 070626"
                        rows={2}
                      />
                    </div>
                    {numeroInvalido && (
                      <Alert variant="destructive">
                        <AlertTitle>Número inválido</AlertTitle>
                        <AlertDescription>
                          Um dos campos numéricos não é um número. Corrija antes de salvar.
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setConfirmar(true)}
                        disabled={alteracoes.length === 0 || !motivo.trim() || numeroInvalido || salvando}
                      >
                        {salvando
                          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          : <Save className="mr-2 h-4 w-4" />}
                        Salvar
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={descartar}
                        disabled={alteracoes.length === 0 && !motivo}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Descartar
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {dePara && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Última gravação</CardTitle>
                      <CardDescription>De-para devolvido pela função.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Campo</TableHead>
                            <TableHead>De</TableHead>
                            <TableHead>Para</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(dePara).map(([campo, v]) => (
                            <TableRow key={campo}>
                              <TableCell className="font-mono text-xs">{campo}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {textoValor(v.de) || "—"}
                              </TableCell>
                              <TableCell className="text-sm">{textoValor(v.para) || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* foto, pendências e fase */}
              <div className="space-y-4">
                <Card>
                  <CardContent className="space-y-3 p-4">
                    {fotoDisponivel && imagem?.imagem_url ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="aspect-square h-auto w-full overflow-hidden rounded-md border bg-muted p-0"
                        onClick={() => setFotoAmpliada(true)}
                        aria-label={`Ampliar foto de ${produto.nome_comercial || cod}`}
                      >
                        <img
                          src={imagem.imagem_url}
                          alt={produto.nome_comercial || `Produto ${cod}`}
                          className="h-full w-full object-contain"
                          onError={() => setFotoFalhou(true)}
                        />
                      </Button>
                    ) : (
                      <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted text-muted-foreground">
                        {imagemQ.isLoading
                          ? <Loader2 className="h-7 w-7 animate-spin" />
                          : <ImageOff className="h-8 w-8" />}
                        <span className="text-sm">{imagemQ.isLoading ? "carregando foto" : "sem foto"}</span>
                      </div>
                    )}
                    {imagemQ.isError ? (
                      <p className="text-xs text-destructive-strong">
                        Não foi possível carregar a foto: {formatError(imagemQ.error)}
                      </p>
                    ) : origemImagem ? (
                      <p className={`text-xs ${origemFraca ? "text-warning-strong" : "text-muted-foreground"}`}>
                        {origemImagem}
                      </p>
                    ) : null}
                    <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" asChild>
                      <Link to="/vendas/produto/fotos">Gerenciar fotos</Link>
                    </Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Pendências e fase</CardTitle>
                    <CardDescription>
                      Fase atual: {produto.fase_nome ?? produto.fase ?? "—"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Falta na fase atual</div>
                      <Chips itens={produto.falta_fase_atual} />
                    </div>
                    {mostrarFaltaProxima && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">
                          Falta para a próxima fase{" "}
                          {produto.proxima_fase ? `(${produto.proxima_fase})` : ""} ·{" "}
                          {produto.qtd_falta_proxima ?? 0}
                        </div>
                        <Chips itens={produto.falta_proxima_fase} />
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Ficha no Bling</span>
                      <span className="inline-flex items-center gap-1">
                        {produto.tem_bling
                          ? <Check className="h-4 w-4 text-success-strong" />
                          : <X className="h-4 w-4 text-muted-foreground" />}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Saldo disponível</span>
                      <span>{produto.saldo_disponivel ?? 0}</span>
                    </div>

                    {Array.isArray(produto.campos_fora_do_espelho)
                      && produto.campos_fora_do_espelho.length > 0 && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Defeito estrutural</AlertTitle>
                        <AlertDescription>
                          Campo exigido pela matriz que não existe na tabela do SNCF:{" "}
                          {produto.campos_fora_do_espelho.join(", ")}
                        </AlertDescription>
                      </Alert>
                    )}

                    {produto.proxima_fase && (
                      <Button
                        className="w-full"
                        onClick={() => promover(false)}
                        disabled={produto.pronto_proxima_fase !== true || promovendo || semPermFase}
                        title={tituloPermFase}
                      >
                        {promovendo
                          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          : <ArrowUpCircle className="mr-2 h-4 w-4" />}
                        Promover para {produto.proxima_fase}
                      </Button>
                    )}
                    {faseAnterior && (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => setConfirmarRegressao(true)}
                        disabled={promovendo || semPermFase}
                        title={tituloPermFase}
                      >
                        <ArrowDownCircle className="mr-2 h-4 w-4" />
                        Voltar para {faseAnterior.nome}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}

        {/* resumo antes de enviar */}
        <Dialog open={confirmar} onOpenChange={(o) => !o && setConfirmar(false)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Confirmar gravação</DialogTitle>
              <DialogDescription>
                Estes campos vão para o FOP e depois para o espelho do SNCF.
              </DialogDescription>
            </DialogHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campo</TableHead>
                  <TableHead>De</TableHead>
                  <TableHead>Para</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alteracoes.map((a) => (
                  <TableRow key={a.campo}>
                    <TableCell className="font-mono text-xs">{a.campo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {textoValor(a.de) || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{textoValor(a.para) || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmar(false)}>Cancelar</Button>
              <Button onClick={salvar} disabled={salvando}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gravar {alteracoes.length} campo(s)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={confirmarRegressao}
          onOpenChange={(aberto) => {
            if (promovendo) return;
            setConfirmarRegressao(aberto);
            if (!aberto) setMotivoRegressao("");
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Voltar {cod} — {produto?.nome_comercial || "Produto sem nome"} de {faseAtualDim?.nome ?? produto?.fase_nome ?? produto?.fase ?? "—"} para {faseAnterior?.nome ?? "—"}?
              </DialogTitle>
              <DialogDescription>
                O produto sai do catálogo de venda enquanto estiver em pré-venda.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="motivo-regressao">Motivo (obrigatório)</Label>
              <Textarea
                id="motivo-regressao"
                value={motivoRegressao}
                onChange={(e) => setMotivoRegressao(e.target.value)}
                placeholder="Ex.: produto ativado antes do lançamento"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmarRegressao(false)} disabled={promovendo}>
                Cancelar
              </Button>
              <Button
                onClick={() => faseAnterior && void mudarFase(faseAnterior.slug, motivoRegressao.trim())}
                disabled={!faseAnterior || !motivoRegressao.trim() || promovendo}
              >
                {promovendo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={fotoAmpliada} onOpenChange={setFotoAmpliada}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{produto?.nome_comercial || `Produto ${cod}`}</DialogTitle>
              {origemImagem && <DialogDescription>{origemImagem}</DialogDescription>}
            </DialogHeader>
            {imagem?.imagem_url && (
              <div className="flex max-h-[75vh] items-center justify-center rounded-md bg-muted p-4">
                <img
                  src={imagem.imagem_url}
                  alt={produto?.nome_comercial || `Produto ${cod}`}
                  className="max-h-[70vh] w-full object-contain"
                />
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* 403 — campo recusado */}
        <Dialog open={!!erro403} onOpenChange={(o) => !o && setErro403(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-destructive" />
                Campo recusado
              </DialogTitle>
              <DialogDescription>
                {erro403?.campo
                  ? <>O campo <span className="font-mono">{erro403.campo}</span> não se escreve por aqui.</>
                  : "A função recusou um dos campos enviados."}
              </DialogDescription>
            </DialogHeader>
            <pre className="max-h-60 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
              {erro403?.erro}
            </pre>
            <DialogFooter>
              <Button variant="outline" onClick={() => setErro403(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 502 — corpo cru do FOP */}
        <Dialog open={!!erroFop} onOpenChange={(o) => !o && setErroFop(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                O FOP recusou
              </DialogTitle>
              <DialogDescription>
                Resposta na íntegra da trava do banco do FOP.
              </DialogDescription>
            </DialogHeader>
            <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
              {erroFop}
            </pre>
            <DialogFooter>
              <Button variant="outline" onClick={() => setErroFop(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 500 — espelho local falhou */}
        <Dialog open={!!erroEspelho} onOpenChange={(o) => !o && setErroEspelho(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>O FOP gravou, o espelho não</DialogTitle>
              <DialogDescription>
                A gravação existe no FOP, mas a cópia local do SNCF falhou. O sync reconcilia;
                até lá esta tela pode mostrar o valor antigo.
              </DialogDescription>
            </DialogHeader>
            <pre className="max-h-60 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
              {erroEspelho}
            </pre>
            <DialogFooter>
              <Button variant="outline" onClick={() => setErroEspelho(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 422 — ficha incompleta na promoção */}
        <Dialog open={!!faltando} onOpenChange={(o) => !o && setFaltando(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ficha incompleta</DialogTitle>
              <DialogDescription>
                O produto não pode avançar de fase enquanto estes campos estiverem vazios:
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-1.5">
              {(faltando ?? []).length === 0
                ? <span className="text-sm text-muted-foreground">A função não detalhou os campos.</span>
                : faltando!.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFaltando(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 409 — saldo na descontinuação */}
        <AlertDialog open={confirmSaldo !== null} onOpenChange={(o) => !o && setConfirmSaldo(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Seguir com saldo em estoque?</AlertDialogTitle>
              <AlertDialogDescription>
                O produto ainda tem saldo disponível ({confirmSaldo?.saldo ?? 0}). Mudar de fase não apaga
                o saldo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const pendente = confirmSaldo;
                  setConfirmSaldo(null);
                  if (pendente) void mudarFase(pendente.faseDestino, pendente.motivo, true);
                }}
              >
                Seguir mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageShell>
    </TooltipProvider>
  );
}
