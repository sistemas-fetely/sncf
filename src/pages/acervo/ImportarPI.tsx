// Importacao de PI — passos 1 a 3. A tela SO orquestra: deteccao de cabecalho,
// coercao de EAN/DUN e insert vivem em src/lib/pi/*. Nada julga identidade aqui:
// quem decide se o item existe e fn_pi_conferir_lote (parte 2).
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, FileSpreadsheet, Info, Download } from "lucide-react";


import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
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
import { supabase } from "@/integrations/supabase/client";


import {
  lerArquivo,
  detectarCabecalho,
  extrairLinhas,
  normalizar,
  type MatchSinonimo,
  type CabecalhoDetectado,
} from "@/lib/pi/lerPlanilhaPI";
import { gravarLotePI } from "@/lib/pi/gravarLotePI";
import { devolverPlanilhaPI, type PreenchimentoLinha } from "@/lib/pi/devolverPlanilhaPI";


const IGNORAR = "— ignorar —";
const CAMPOS_DESTINO = [
  "sku", "cod_cadastro", "ean", "dun", "inner_qtd", "descricao", "qtd", "peso_g",
] as const;
const CAMPOS_IDENTIDADE = ["sku", "cod_cadastro", "ean"];

type LinhaStage = {
  linha_num: number;
  sku: string | null;
  cod_cadastro: string | null;
  ean: string | null;
  dun: string | null;
  inner_qtd: number | null;
  estado: string | null;
  motivo: string | null;
};

const ORDEM_ESTADOS = ["reconhecido", "a_alocar", "erro", "ignorado"] as const;

// Etapa 1 da efetivação — resposta de fn_pi_efetivar_lote. O banco decide tudo:
// a tela só mostra bloqueio ou de-para, nunca recalcula nem oferece "forçar".
type BloqueioEfetivar = { bloqueio: string; linhas: number; detalhe?: string | null };
type ProdutoEfetivar = {
  linha?: number;
  cod_cadastro?: string | null;
  ean?: string | null;
  dun?: string | null;
  inner_qtd?: number | null;
  alocar_novo?: boolean;
};
type RespostaEfetivar = {
  ok?: boolean;
  dry_run?: boolean;
  lote?: string;
  linhas?: number;
  alocar_novos?: number;
  livres_depois?: number | null;
  nascerao_em_fase?: string | null;
  bloqueios?: BloqueioEfetivar[];
  produtos?: ProdutoEfetivar[];
};

const ROTULO_BLOQUEIO: Record<string, string> = {
  inner_ausente: "Inner ausente",
  ean_invalido: "EAN inválido",
  ean_ja_e_produto: "EAN já é produto",
  cod_ja_e_produto: "Código já é produto",
  cartorio_sem_estoque: "Cartório sem estoque",
};

const TETO_ITENS_FOP = 200;

function badgeEstado(estado: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (estado) {
    case "reconhecido": return "secondary";
    case "a_alocar":
    case "alocado": return "default";
    case "erro": return "destructive";
    default: return "outline";
  }
}

function msgErro(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function chaveColuna(nome: string, i: number): string {
  return nome || `coluna_${i + 1}`;
}

function textoCelula(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}


export default function ImportarPI() {
  const queryClient = useQueryClient();
  const [arquivoOriginal, setArquivoOriginal] = useState<File | null>(null);
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);

  const [abas, setAbas] = useState<string[]>([]);
  const [matrizPorAba, setMatrizPorAba] = useState<Record<string, unknown[][]>>({});
  const [aba, setAba] = useState<string>("");
  const [lendo, setLendo] = useState(false);

  const [cabecalho, setCabecalho] = useState<CabecalhoDetectado | null>(null);
  const [semMatch, setSemMatch] = useState(false);
  const [linhaManual, setLinhaManual] = useState<string>("");

  const [mapeamento, setMapeamento] = useState<Record<string, string>>({});
  const [fornecedor, setFornecedor] = useState("");
  const [piNumero, setPiNumero] = useState("");

  const [gravando, setGravando] = useState(false);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [gravadas, setGravadas] = useState<number>(0);

  // passo 4
  const [conferindo, setConferindo] = useState(false);
  const [contagens, setContagens] = useState<Record<string, number> | null>(null);

  // passo 5 — efetivar no cartório (etapa 1: fn_pi_efetivar_lote)
  const [motivoEfetivar, setMotivoEfetivar] = useState("");
  const [efetivando, setEfetivando] = useState(false);
  const [previa, setPrevia] = useState<RespostaEfetivar | null>(null);
  const [efetivado, setEfetivado] = useState<RespostaEfetivar | null>(null);

  // passo 6 — nascer no FOP (etapa 2, só depois da etapa 1 confirmada)
  const [registroResultado, setRegistroResultado] = useState<Record<string, unknown>[] | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [erro401, setErro401] = useState(false);

  // passo 7
  const [baixando, setBaixando] = useState(false);
  const [colunasCriadas, setColunasCriadas] = useState<string[] | null>(null);
  const [baixou, setBaixou] = useState(false);


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

  const sinonimos = sinonimosQuery.data ?? [];
  const matriz = aba ? (matrizPorAba[aba] ?? []) : [];

  function aplicarDeteccao(m: unknown[][]) {
    const det = detectarCabecalho(m, sinonimos);
    setCabecalho(det);
    setSemMatch(det === null);
    setMapeamento(det?.mapeamentoSugerido ?? {});
    setLinhaManual(det ? String(det.linhaCabecalho) : "");
    setLoteId(null);
    if (det) {
      toast.success(
        `Cabeçalho na linha ${det.linhaCabecalho} — ${det.camposCasados} de ${det.colunas.length} colunas reconhecidas`,
      );
    } else {
      toast.error("Nenhuma coluna casou com os sinônimos conhecidos — informe a linha do cabeçalho à mão");
    }
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
      setArquivoOriginal(file);
      setArquivoNome(file.name);

      setAbas(as);
      setMatrizPorAba(mpa);
      setAba(as[0]);
      aplicarDeteccao(mpa[as[0]] ?? []);
      // pre-preenche PI varrendo as primeiras linhas
      const alvo = (mpa[as[0]] ?? []).slice(0, 25);
      for (const linha of alvo) {
        for (const cel of linha ?? []) {
          const m = /\bp\.?\s*i\.?\s*[:#nº ]*([a-z0-9-]{2,})/i.exec(textoCelula(cel));
          if (m) { setPiNumero(m[1]); break; }
        }
      }
      toast.success(`${file.name} lido — ${as.length} aba(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
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
    const porFormato = new Map<string, number>();
    let casados = 0;
    colunas.forEach((c, i) => {
      const s = indice.get(normalizar(c));
      if (!s) return;
      casados += 1;
      sugerido[chaveColuna(c, i)] = s.campo;
      if (s.formato) porFormato.set(s.formato, (porFormato.get(s.formato) ?? 0) + 1);
    });
    let formatoProvavel: string | null = null;
    let maior = 0;
    porFormato.forEach((q, f) => { if (q > maior) { maior = q; formatoProvavel = f; } });

    setCabecalho({
      linhaCabecalho: n,
      colunas,
      camposCasados: casados,
      mapeamentoSugerido: sugerido,
      formatoProvavel,
      usouDuasLinhas: false,
    });
    setSemMatch(casados === 0);
    setMapeamento(sugerido);
    setLoteId(null);
    toast.success(`Reprocessado com cabeçalho na linha ${n} — ${casados} colunas reconhecidas`);
  }

  const linhas = useMemo(() => {
    if (!cabecalho) return [];
    return extrairLinhas(matriz, cabecalho.linhaCabecalho, mapeamento, cabecalho.colunas);
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

  async function gravar() {
    if (!cabecalho) return;
    setGravando(true);
    try {
      const r = await gravarLotePI(
        {
          arquivoNome: arquivoNome ?? "sem-nome",
          formato: cabecalho.formatoProvavel,
          fornecedor: fornecedor.trim() || null,
          piNumero: piNumero.trim() || null,
          linhaCabecalho: cabecalho.linhaCabecalho,
          mapeamento,
        },
        linhas,
      );
      setLoteId(r.loteId);
      setGravadas(r.gravadas);
      setContagens(null);
      setPrevia(null);
      setEfetivado(null);
      setRegistroResultado(null);
      setErro401(false);
      setColunasCriadas(null);
      setBaixou(false);
      toast.success(`${r.gravadas} linha(s) gravada(s) em estágio`);
    } catch (e) {
      toast.error(msgErro(e));
    } finally {
      setGravando(false);
    }
  }

  // ---------- PASSO 4 ----------
  const stageQuery = useQuery({
    queryKey: ["pi-import-stage", loteId],
    enabled: !!loteId && !!contagens,
    queryFn: async (): Promise<LinhaStage[]> => {
      const { data, error } = await supabase
        .from("pi_import_stage")
        .select("linha_num, sku, cod_cadastro, ean, dun, inner_qtd, estado, motivo")
        .eq("lote_id", loteId!)
        .order("linha_num");
      if (error) throw new Error(error.message);
      return (data ?? []) as LinhaStage[];
    },
  });

  const linhasStage = stageQuery.data ?? [];
  const aAlocar = linhasStage.filter((l) => l.estado === "a_alocar");
  const paraFop = linhasStage.filter((l) => l.estado === "reconhecido" || l.estado === "alocado");
  const comCodigo = linhasStage.filter((l) => l.cod_cadastro || l.ean || l.dun);

  async function conferir() {
    if (!loteId) return;
    setConferindo(true);
    try {
      const { data, error } = await supabase.rpc("fn_pi_conferir_lote", { p_lote_id: loteId });
      if (error) throw new Error(error.message);
      const obj = (data ?? {}) as Record<string, number>;
      setContagens(obj);
      await queryClient.invalidateQueries({ queryKey: ["pi-import-stage", loteId] });
      toast.success("Lote conferido");
    } catch (e) {
      toast.error(msgErro(e));
    } finally {
      setConferindo(false);
    }
  }

  // ---------- PASSO 5 — ETAPA 1: EFETIVAR NO CARTÓRIO ----------
  // fn_pi_efetivar_lote marca o código como alocado, grava inner_qtd e vincula a
  // linha do stage ao cartório. Sem esta etapa confirmada não existe etapa 2.
  async function efetivarCartorio(dryRun: boolean) {
    if (!loteId) return;
    const motivo = motivoEfetivar.trim();
    if (!motivo) {
      toast.error("Informe o motivo da efetivação — fornecedor e número da PI");
      return;
    }
    setEfetivando(true);
    try {
      const { data, error } = await supabase.rpc("fn_pi_efetivar_lote", {
        p_lote_id: loteId,
        p_motivo: motivo,
        p_dry_run: dryRun,
      });
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as RespostaEfetivar;
      if (dryRun) {
        setPrevia(r);
        setEfetivado(null);
        if (r.ok) toast.success(`Liberado — ${r.produtos?.length ?? 0} produto(s) nascem`);
        else toast.error(`Efetivação bloqueada — ${r.bloqueios?.length ?? 0} bloqueio(s)`);
      } else {
        if (!r.ok) {
          setPrevia(r);
          setEfetivado(null);
          throw new Error(
            `Efetivação recusada pelo banco: ${(r.bloqueios ?? [])
              .map((b) => `${ROTULO_BLOQUEIO[b.bloqueio] ?? b.bloqueio} (${b.linhas})`)
              .join(" · ") || "sem detalhe"}`,
          );
        }
        setEfetivado(r);
        setPrevia(null);
        setRegistroResultado(null);
        await queryClient.invalidateQueries({ queryKey: ["pi-import-stage", loteId] });
        toast.success(`Cartório efetivado — ${r.produtos?.length ?? 0} produto(s) prontos para nascer`);
      }
    } catch (e) {
      toast.error(msgErro(e));
    } finally {
      setEfetivando(false);
    }
  }

  // ---------- PASSO 6 — ETAPA 2: NASCER NO FOP ----------
  // Só roda com a etapa 1 confirmada (efetivado != null). Nenhum outro caminho
  // chama registrar_pi.
  async function nascerNoFop() {
    const itens = efetivado?.produtos ?? [];
    if (itens.length === 0) {
      toast.error("Efetive o lote no cartório antes de fazer os produtos nascerem");
      return;
    }
    setRegistrando(true);
    setErro401(false);
    try {
      const acumulado: Record<string, unknown>[] = [];
      for (let i = 0; i < itens.length; i += TETO_ITENS_FOP) {
        const bloco = itens.slice(i, i + TETO_ITENS_FOP);
        const { data, error } = await supabase.functions.invoke("promover-fase-produto", {
          body: { tipo: "registrar_pi", itens: bloco, dry_run: false },
        });
        if (error) {
          const status = (error as { context?: { status?: number } }).context?.status;
          if (status === 401) {
            setErro401(true);
            throw new Error("401 — registrar exige sessão de usuário ativa");
          }
          throw new Error(error.message);
        }
        const res = (data as { resultado?: { itens?: Record<string, unknown>[] } } | null)?.resultado;
        acumulado.push(...(res?.itens ?? []));
        setRegistroResultado([...acumulado]);
      }
      toast.success(`${acumulado.length} item(ns) enviados ao FOP`);
    } catch (e) {
      toast.error(msgErro(e));
    } finally {
      setRegistrando(false);
    }
  }

  // ---------- PASSO 7 ----------
  async function baixarPlanilha() {
    if (!arquivoOriginal || !cabecalho) {
      toast.error("Arquivo original indisponível — leia a planilha novamente");
      return;
    }
    setBaixando(true);
    try {
      const preenchimentos: PreenchimentoLinha[] = comCodigo.map((l) => ({
        linhaNum: l.linha_num,
        cod_cadastro: l.cod_cadastro,
        ean: l.ean,
        dun: l.dun,
      }));
      const r = await devolverPlanilhaPI({
        file: arquivoOriginal,
        aba,
        linhaCabecalho: cabecalho.linhaCabecalho,
        mapeamento,
        colunas: cabecalho.colunas,
        preenchimentos,
      });
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nomeArquivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setColunasCriadas(r.colunasCriadas);
      setBaixou(true);
      toast.success(`${r.linhasPreenchidas} linha(s) preenchida(s) em ${r.nomeArquivo}`);
    } catch (e) {
      toast.error(msgErro(e));
    } finally {
      setBaixando(false);
    }
  }


  return (
    <PageShell>
      <PageHeader
        titulo="Importação de PI"
        estado="Lê a proforma da fábrica no navegador, o humano confirma o mapeamento e o lote nasce em estágio."
        breadcrumb={[
          { label: "Produto", to: "/vendas/produto" },
          { label: "Importação de PI" },
        ]}
      />

      {sinonimosQuery.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Falha ao carregar os sinônimos de coluna:{" "}
            {sinonimosQuery.error instanceof Error ? sinonimosQuery.error.message : "erro desconhecido"}
          </AlertDescription>
        </Alert>
      )}

      {/* PASSO 1 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Arquivo</CardTitle>
          <CardDescription>
            .xlsx ou .xls, lido no navegador. O arquivo não sobe para o storage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sinonimosQuery.isPending ? (
            <Skeleton className="h-10 w-full max-w-sm" />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="file"
                accept=".xlsx,.xls"
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
                  <Label htmlFor="linha-cab">Linha do cabeçalho</Label>
                  <Input
                    id="linha-cab"
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
                  <div className="text-xs text-muted-foreground">Aba</div>
                  <div className="font-medium">{aba || "—"}</div>
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
                {cabecalho?.formatoProvavel && (
                  <div>
                    <div className="text-xs text-muted-foreground">Formato provável</div>
                    <div className="font-medium">{cabecalho.formatoProvavel}</div>
                  </div>
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* PASSO 2 */}
      {cabecalho && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Mapeamento</CardTitle>
            <CardDescription>
              Confirme como cada coluna foi entendida. Confira os zeros à esquerda de EAN e DUN na prévia.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="fornecedor">Fornecedor</Label>
                <Input id="fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pi-numero">Número da PI</Label>
                <Input id="pi-numero" value={piNumero} onChange={(e) => setPiNumero(e.target.value)} />
              </div>
            </div>

            <div className="rounded-md border">
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
                        <TableCell className="font-medium">{nome || <span className="text-muted-foreground">{chave}</span>}</TableCell>
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
                              {CAMPOS_DESTINO.map((c) => (
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

            <div>
              <div className="mb-2 text-sm font-medium">Prévia — 5 primeiras linhas</div>
              {camposUsados.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma coluna mapeada ainda.
                </p>
              ) : (
                <div className="rounded-md border">
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
          </CardContent>
        </Card>
      )}

      {/* PASSO 3 */}
      {cabecalho && camposUsados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Gravar</CardTitle>
            <CardDescription>
              O lote nasce em estágio. Identidade e alocação de código ficam para a conferência.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!temIdentidade && (
              <Alert>
                <AlertDescription>
                  Mapeie ao menos uma coluna para <strong>sku</strong>, <strong>cod_cadastro</strong> ou{" "}
                  <strong>ean</strong> — sem nenhum dos três não há como identificar o item.
                </AlertDescription>
              </Alert>
            )}
            <Button onClick={gravar} disabled={!temIdentidade || gravando || linhas.length === 0}>
              {gravando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gravar lote em estágio
            </Button>

            {loteId && (
              <div className="rounded-md border p-4 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Info className="h-4 w-4" /> Lote em estágio
                </div>
                <div className="mt-1 text-muted-foreground">
                  Lote <span className="font-mono">{loteId}</span> · {gravadas} linha(s) em estágio.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* PASSO 4 — CONFERIR */}
      {loteId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Conferir</CardTitle>
            <CardDescription>
              O banco decide o que já existe, o que precisa de código e o que não dá para ler.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={conferir} disabled={conferindo}>
              {conferindo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Conferir lote
            </Button>

            {contagens && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {ORDEM_ESTADOS.filter((e) => contagens[e] !== undefined).map((e) => (
                  <div key={e} className="rounded-md border p-4">
                    <div className="text-xs text-muted-foreground">{e}</div>
                    <div className="text-2xl font-semibold">{contagens[e]}</div>
                  </div>
                ))}
              </div>
            )}

            {stageQuery.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  Falha ao carregar as linhas do lote: {msgErro(stageQuery.error)}
                </AlertDescription>
              </Alert>
            )}

            {contagens && stageQuery.isPending && <Skeleton className="h-40 w-full" />}

            {contagens && !stageQuery.isPending && !stageQuery.isError && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Linha</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>cod_cadastro</TableHead>
                      <TableHead>EAN</TableHead>
                      <TableHead>DUN</TableHead>
                      <TableHead>Inner</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasStage.map((l) => (
                      <TableRow key={l.linha_num}>
                        <TableCell className="text-muted-foreground">{l.linha_num}</TableCell>
                        <TableCell className="font-mono text-xs">{l.sku ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{l.cod_cadastro ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{l.ean ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{l.dun ?? "—"}</TableCell>
                        <TableCell>{l.inner_qtd ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={badgeEstado(l.estado)}>{l.estado ?? "—"}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{l.motivo ?? ""}</TableCell>
                      </TableRow>
                    ))}
                    {linhasStage.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-muted-foreground">
                          Nenhuma linha no estágio deste lote.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            <p className="text-xs text-muted-foreground">Linha com erro não bloqueia o lote.</p>
          </CardContent>
        </Card>
      )}

      {/* PASSO 5 — ETAPA 1: EFETIVAR NO CARTÓRIO */}
      {loteId && contagens && !stageQuery.isPending && !stageQuery.isError && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">5. Efetivar no cartório</CardTitle>
            <CardDescription>
              O cartório marca o código como alocado, grava o Inner e vincula a linha do lote.
              Obrigatório antes de qualquer produto nascer no FOP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="motivo-efetivar">Motivo</Label>
              <Input
                id="motivo-efetivar"
                value={motivoEfetivar}
                placeholder="Lanweier PI070626-162, coleção Jingle Pop"
                onChange={(e) => { setMotivoEfetivar(e.target.value); setPrevia(null); setEfetivado(null); }}
              />
              <p className="text-xs text-muted-foreground">
                Fornecedor e número da PI — fica registrado no cartório.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => efetivarCartorio(true)}
                disabled={efetivando || !motivoEfetivar.trim()}
              >
                {efetivando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simular efetivação
              </Button>
              {previa?.ok && (
                <Button
                  onClick={() => efetivarCartorio(false)}
                  disabled={efetivando || !motivoEfetivar.trim()}
                >
                  {efetivando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirmar efetivação
                </Button>
              )}
            </div>

            {previa && previa.ok === false && (
              <div className="space-y-2">
                {(previa.bloqueios ?? []).map((b, i) => (
                  <Alert key={`${b.bloqueio}-${i}`} variant="destructive">
                    <AlertDescription>
                      <strong>{ROTULO_BLOQUEIO[b.bloqueio] ?? b.bloqueio}</strong> — {b.linhas} linha(s)
                      {b.detalhe ? <span className="block text-xs">{b.detalhe}</span> : null}
                    </AlertDescription>
                  </Alert>
                ))}
                {(previa.bloqueios ?? []).length === 0 && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      O cartório recusou a efetivação e não devolveu detalhe do bloqueio.
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-xs text-muted-foreground">
                  Resolva na planilha e grave o lote de novo. Não existe caminho para ignorar bloqueio.
                </p>
              </div>
            )}

            {(efetivado ?? (previa?.ok ? previa : null)) && (() => {
              const r = (efetivado ?? previa)!;
              const livres = r.livres_depois ?? null;
              return (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md border p-4">
                      <div className="text-xs text-muted-foreground">Nascem</div>
                      <div className="text-2xl font-semibold">{r.produtos?.length ?? r.linhas ?? 0}</div>
                    </div>
                    <div className="rounded-md border p-4">
                      <div className="text-xs text-muted-foreground">Códigos novos do cartório</div>
                      <div className="text-2xl font-semibold">{r.alocar_novos ?? 0}</div>
                    </div>
                    <div className="rounded-md border p-4">
                      <div className="text-xs text-muted-foreground">Livres depois no cartório</div>
                      <div className="text-2xl font-semibold">{livres ?? "—"}</div>
                    </div>
                    <div className="rounded-md border p-4">
                      <div className="text-xs text-muted-foreground">Nascem na fase</div>
                      <div className="text-2xl font-semibold">{r.nascerao_em_fase ?? "—"}</div>
                    </div>
                  </div>

                  {livres !== null && livres < 50 && (
                    <Alert variant="destructive">
                      <AlertDescription>
                        Só sobram {livres} código(s) livres no cartório — o banco GS1 está acabando.
                      </AlertDescription>
                    </Alert>
                  )}

                  {efetivado && (
                    <Alert>
                      <AlertDescription>
                        Cartório efetivado. Os códigos já saíram do estoque: se o FOP bloquear algum
                        item na etapa 6, isso <strong>não</strong> desfaz esta etapa.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">Linha</TableHead>
                          <TableHead>cod_cadastro</TableHead>
                          <TableHead>EAN</TableHead>
                          <TableHead>DUN</TableHead>
                          <TableHead>Inner</TableHead>
                          <TableHead>Código novo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(r.produtos ?? []).map((p, i) => (
                          <TableRow key={`${p.cod_cadastro ?? i}`}>
                            <TableCell className="text-muted-foreground">{p.linha ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{p.cod_cadastro ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{p.ean ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{p.dun ?? "—"}</TableCell>
                            <TableCell>{p.inner_qtd ?? "—"}</TableCell>
                            <TableCell>
                              {p.alocar_novo ? <Badge variant="default">novo</Badge> : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                        {(r.produtos ?? []).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-muted-foreground">
                              Nenhum produto no de-para.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* PASSO 6 — ETAPA 2: NASCER NO FOP */}
      {loteId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">6. Nascer no FOP</CardTitle>
            <CardDescription>
              {efetivado
                ? `${efetivado.produtos?.length ?? 0} produto(s) efetivados no cartório. Quem decide se nasce é o FOP.`
                : "Disponível só depois da efetivação no cartório confirmada neste lote."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!efetivado ? (
              <Alert>
                <AlertDescription>
                  Efetive o lote no cartório (passo 5) para liberar o nascimento no FOP.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex flex-wrap gap-3">
                <Button onClick={nascerNoFop} disabled={registrando}>
                  {registrando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Fazer nascer no FOP
                </Button>
              </div>
            )}

            {erro401 && (
              <Alert variant="destructive">
                <AlertDescription>
                  Registrar exige sessão de usuário ativa: a escrita em cadastro não aceita token de
                  serviço. Não é erro de dado — entre com sua conta e repita.
                </AlertDescription>
              </Alert>
            )}

            {registroResultado && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>cod_cadastro</TableHead>
                      <TableHead>EAN</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registroResultado.map((it, i) => {
                      const status = textoCelula(it.status);
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{textoCelula(it.cod_cadastro) || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{textoCelula(it.ean) || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{textoCelula(it.sku) || "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                status === "nasceria" ? "default"
                                  : status === "bloqueado" ? "secondary"
                                    : status === "erro" ? "destructive" : "outline"
                              }
                            >
                              {status || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {textoCelula(it.motivo)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {registroResultado.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">
                          Nenhum item retornado.
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

      {/* PASSO 7 — DEVOLVER A PLANILHA */}
      {loteId && contagens && comCodigo.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">7. Devolver a planilha</CardTitle>
            <CardDescription>
              A mesma PI de volta, agora com os códigos preenchidos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={baixarPlanilha} disabled={baixando || comCodigo.length === 0}>
              {baixando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Baixar planilha com os códigos
            </Button>

            {baixou && (
              <p className="text-xs text-muted-foreground">
                Imagens e parte da formatação não sobrevivem ao ciclo — o Thomer tem o original; o que
                volta são os códigos.
              </p>
            )}

            {colunasCriadas && colunasCriadas.length > 0 && (
              <Alert>
                <AlertDescription>
                  Colunas acrescentadas ao final da planilha: {colunasCriadas.join(", ")}.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

