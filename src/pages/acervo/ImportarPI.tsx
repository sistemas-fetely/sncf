// Importação de PI — a tela só orquestra. Quem julga identidade é
// fn_pi_conferir_lote, quem aloca é fn_cartorio_alocar, quem registra é
// fn_registrar_produtos_cartorio (via edge promover-fase-produto).
// O arquivo é lido no navegador com SheetJS e NÃO sobe para storage.
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Info, Upload, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Sinonimo = { campo: string; sinonimo: string; formato: string | null };

const CAMPOS = [
  "sku", "cod_cadastro", "ean", "dun", "inner_qtd", "descricao", "qtd", "peso_g",
] as const;
type Campo = (typeof CAMPOS)[number];

const IGNORAR = "__ignorar__";

type LinhaStage = {
  id: string;
  linha_num: number | null;
  sku: string | null;
  cod_cadastro: string | null;
  ean: string | null;
  dun: string | null;
  inner_qtd: number | null;
  descricao: string | null;
  estado: string | null;
  motivo: string | null;
};

type CodigoProposto = {
  cod_cadastro: string | null;
  ean: string | null;
  dun: string | null;
  inner_qtd: number | null;
  sku_sugerido: string | null;
};

type RespostaAlocacao = {
  dry_run?: boolean;
  alocaria?: number;
  alocados?: number;
  livres_depois?: number;
  codigos?: CodigoProposto[];
};

type ItemFop = { cod_cadastro: string | null; ean: string | null; sku?: string | null; status?: string | null; motivo?: string | null };

const ESTADOS_CONFERENCIA = ["reconhecido", "a_alocar", "erro", "ignorado"] as const;

function normalizar(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function textoCelula(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** EAN/DUN: o Excel entrega número e o zero à esquerda se perde. */
function codigoBarras(v: unknown, digitos: number): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    return String(Math.trunc(v)).padStart(digitos, "0");
  }
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+$/.test(s) && s.length < digitos) return s.padStart(digitos, "0");
  return s;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function BadgeEstado({ estado }: { estado: string | null }) {
  if (estado === "erro") return <Badge variant="destructive">erro</Badge>;
  if (estado === "reconhecido") return <Badge variant="secondary">reconhecido</Badge>;
  if (estado === "a_alocar") return <Badge>a alocar</Badge>;
  return <Badge variant="outline">{estado ?? "—"}</Badge>;
}

function BadgeStatusFop({ status }: { status: string | null }) {
  if (status === "bloqueado") return <Badge variant="destructive">bloqueado</Badge>;
  if (status === "nasceria" || status === "nasceu") return <Badge variant="secondary">{status}</Badge>;
  return <Badge variant="outline">{status ?? "—"}</Badge>;
}

export default function ImportarPI() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  // Passo 1 — arquivo
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [matriz, setMatriz] = useState<unknown[][]>([]);
  const [nomePlanilha, setNomePlanilha] = useState<string | null>(null);
  const [linhaCabecalho, setLinhaCabecalho] = useState<number | null>(null);
  const [lendo, setLendo] = useState(false);

  // Passo 2 — mapeamento
  const [mapeamento, setMapeamento] = useState<Record<number, string>>({});
  const [fornecedor, setFornecedor] = useState("");
  const [piNumero, setPiNumero] = useState("");

  // Passo 3 — lote
  const [loteId, setLoteId] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  // Passo 4 — conferência
  const [conferindo, setConferindo] = useState(false);
  const [contagem, setContagem] = useState<Record<string, number> | null>(null);

  // Passo 5 — alocação
  const [inner, setInner] = useState("");
  const [motivo, setMotivo] = useState("");
  const [proposta, setProposta] = useState<RespostaAlocacao | null>(null);
  const [ocupadoAlocacao, setOcupadoAlocacao] = useState(false);

  // Passo 6 — FOP
  const [itensFop, setItensFop] = useState<ItemFop[] | null>(null);
  const [fopSimulado, setFopSimulado] = useState(false);
  const [ocupadoFop, setOcupadoFop] = useState(false);

  const sinonimos = useQuery({
    queryKey: ["pi-coluna-sinonimo"],
    queryFn: async (): Promise<Sinonimo[]> => {
      const { data, error } = await (supabase as any)
        .from("pi_coluna_sinonimo")
        .select("campo, sinonimo, formato");
      if (error) throw error;
      return (data ?? []) as Sinonimo[];
    },
  });

  const porSinonimo = useMemo(() => {
    const m = new Map<string, Sinonimo>();
    for (const s of sinonimos.data ?? []) m.set(normalizar(s.sinonimo), s);
    return m;
  }, [sinonimos.data]);

  const linhas = useQuery({
    queryKey: ["pi-import-stage", loteId],
    enabled: !!loteId,
    queryFn: async (): Promise<LinhaStage[]> => {
      const { data, error } = await (supabase as any)
        .from("pi_import_stage")
        .select("id, linha_num, sku, cod_cadastro, ean, dun, inner_qtd, descricao, estado, motivo")
        .eq("lote_id", loteId)
        .order("linha_num", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinhaStage[];
    },
  });

  const colunas: string[] = useMemo(() => {
    if (linhaCabecalho === null) return [];
    const cab = matriz[linhaCabecalho] ?? [];
    const largura = Math.max(cab.length, ...matriz.slice(linhaCabecalho).map((r) => r?.length ?? 0), 0);
    return Array.from({ length: largura }, (_, i) => textoCelula(cab[i]));
  }, [matriz, linhaCabecalho]);

  const linhasDados = useMemo(() => {
    if (linhaCabecalho === null) return [] as { idx: number; celulas: unknown[] }[];
    return matriz
      .map((celulas, idx) => ({ idx, celulas: celulas ?? [] }))
      .filter((r) => r.idx > linhaCabecalho)
      .filter((r) => r.celulas.some((c) => textoCelula(c) !== ""));
  }, [matriz, linhaCabecalho]);

  async function aoEscolherArquivo(file: File) {
    setLendo(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const primeira = wb.SheetNames[0];
      if (!primeira) throw new Error("Planilha sem abas.");
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[primeira], {
        header: 1, raw: true, defval: null, blankrows: true,
      });

      // Detecta o cabeçalho: nas 25 primeiras linhas, a que tem mais células
      // casando com algum sinônimo da dimensão.
      let melhor = -1;
      let melhorAcertos = 0;
      for (let i = 0; i < Math.min(25, aoa.length); i++) {
        const acertos = (aoa[i] ?? []).filter((c) => porSinonimo.has(normalizar(c))).length;
        if (acertos > melhorAcertos) { melhorAcertos = acertos; melhor = i; }
      }
      if (melhor < 0 || melhorAcertos === 0) {
        throw new Error(
          "Nenhuma linha das 25 primeiras casou com os sinônimos conhecidos. Cadastre os nomes de coluna deste fornecedor em pi_coluna_sinonimo.",
        );
      }

      // Pré-mapeamento pelos sinônimos.
      const pre: Record<number, string> = {};
      (aoa[melhor] ?? []).forEach((c, i) => {
        const s = porSinonimo.get(normalizar(c));
        pre[i] = s ? s.campo : IGNORAR;
      });

      setArquivoNome(file.name);
      setNomePlanilha(primeira);
      setMatriz(aoa);
      setLinhaCabecalho(melhor);
      setMapeamento(pre);
      setLoteId(null);
      setContagem(null);
      setProposta(null);
      setItensFop(null);
      setFopSimulado(false);
      toast.success(`Cabeçalho detectado na linha ${melhor + 1} (${melhorAcertos} coluna(s) reconhecida(s)).`);
    } catch (e: any) {
      setArquivoNome(null);
      setMatriz([]);
      setLinhaCabecalho(null);
      toast.error(e?.message ?? "Falha ao ler a planilha.");
    } finally {
      setLendo(false);
    }
  }

  const formatoMaisFrequente = useMemo(() => {
    const cont: Record<string, number> = {};
    for (const c of colunas) {
      const s = porSinonimo.get(normalizar(c));
      if (s?.formato) cont[s.formato] = (cont[s.formato] ?? 0) + 1;
    }
    const ordenado = Object.entries(cont).sort((a, b) => b[1] - a[1]);
    return ordenado.length > 0 ? ordenado[0][0] : null;
  }, [colunas, porSinonimo]);

  function campoDaColuna(campo: Campo): number | null {
    const achado = Object.entries(mapeamento).find(([, v]) => v === campo);
    return achado ? Number(achado[0]) : null;
  }

  function valorMapeado(celulas: unknown[], campo: Campo): unknown {
    const i = campoDaColuna(campo);
    return i === null ? null : celulas[i] ?? null;
  }

  function linhaConvertida(celulas: unknown[]) {
    return {
      sku: textoCelula(valorMapeado(celulas, "sku")) || null,
      cod_cadastro: textoCelula(valorMapeado(celulas, "cod_cadastro")) || null,
      ean: codigoBarras(valorMapeado(celulas, "ean"), 13),
      dun: codigoBarras(valorMapeado(celulas, "dun"), 14),
      inner_qtd: numero(valorMapeado(celulas, "inner_qtd")),
      descricao: textoCelula(valorMapeado(celulas, "descricao")) || null,
      qtd: numero(valorMapeado(celulas, "qtd")),
      peso_g: numero(valorMapeado(celulas, "peso_g")),
    };
  }

  async function confirmarMapeamento() {
    if (linhaCabecalho === null) return;
    if (!fornecedor.trim()) { toast.error("Informe o fornecedor."); return; }
    if (!piNumero.trim()) { toast.error("Informe o número da PI."); return; }
    if (linhasDados.length === 0) { toast.error("Nenhuma linha de dado abaixo do cabeçalho."); return; }

    setGravando(true);
    try {
      const mapaJson: Record<string, string> = {};
      colunas.forEach((nome, i) => {
        const campo = mapeamento[i];
        if (campo && campo !== IGNORAR) mapaJson[nome || `col_${i + 1}`] = campo;
      });

      const { data: lote, error: errLote } = await (supabase as any)
        .from("pi_import_lote")
        .insert({
          arquivo_nome: arquivoNome,
          formato: formatoMaisFrequente,
          fornecedor: fornecedor.trim(),
          pi_numero: piNumero.trim(),
          linha_cabecalho: linhaCabecalho + 1,
          total_linhas: linhasDados.length,
          mapeamento: mapaJson,
        })
        .select("id")
        .single();
      if (errLote) throw new Error(errLote.message);

      const novoLote = lote.id as string;
      const registros = linhasDados.map((r) => {
        const bruto: Record<string, unknown> = {};
        colunas.forEach((nome, i) => {
          bruto[nome || `col_${i + 1}`] = r.celulas[i] ?? null;
        });
        return { lote_id: novoLote, linha_num: r.idx + 1, bruto, ...linhaConvertida(r.celulas) };
      });

      const { error: errStage } = await (supabase as any).from("pi_import_stage").insert(registros);
      if (errStage) throw new Error(errStage.message);

      setLoteId(novoLote);
      setContagem(null);
      toast.success(`Lote gravado: ${registros.length} linha(s).`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gravar o lote.");
    } finally {
      setGravando(false);
    }
  }

  async function conferir() {
    if (!loteId) return;
    setConferindo(true);
    try {
      const { data, error } = await (supabase as any).rpc("fn_pi_conferir_lote", { p_lote_id: loteId });
      if (error) throw new Error(error.message);
      setContagem((data ?? {}) as Record<string, number>);
      await qc.invalidateQueries({ queryKey: ["pi-import-stage", loteId] });
      toast.success("Lote conferido.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao conferir o lote.");
    } finally {
      setConferindo(false);
    }
  }

  const aAlocar = (linhas.data ?? []).filter((l) => l.estado === "a_alocar");
  const paraFop = (linhas.data ?? []).filter((l) => l.estado === "reconhecido" || l.estado === "alocado");

  async function alocar(dryRun: boolean) {
    const nInner = Number(inner);
    if (!Number.isFinite(nInner) || nInner <= 0) {
      toast.error("Inner é obrigatório. Vem do packing list da fábrica — não se inventa.");
      return;
    }
    if (!motivo.trim()) { toast.error("Informe o motivo."); return; }
    setOcupadoAlocacao(true);
    try {
      const { data, error } = await (supabase as any).rpc("fn_cartorio_alocar", {
        p_qtd: aAlocar.length,
        p_inner: nInner,
        p_motivo: motivo.trim(),
        p_dry_run: dryRun,
      });
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as RespostaAlocacao;
      if (dryRun) {
        setProposta(r);
        toast.success(`Proposta: ${r.alocaria ?? r.codigos?.length ?? 0} código(s).`);
      } else {
        setProposta(null);
        toast.success(`${r.alocados ?? r.codigos?.length ?? 0} código(s) alocado(s).`);
        await qc.invalidateQueries({ queryKey: ["pi-import-stage", loteId] });
        await qc.invalidateQueries({ queryKey: ["cartorio-situacao"] });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na alocação.");
    } finally {
      setOcupadoAlocacao(false);
    }
  }

  async function registrarFop(dryRun: boolean) {
    if (paraFop.length === 0) { toast.error("Nenhuma linha reconhecida ou alocada para registrar."); return; }
    setOcupadoFop(true);
    try {
      const itens = paraFop.map((l) => ({ cod_cadastro: l.cod_cadastro, ean: l.ean, sku: l.sku }));
      const { data, error } = await supabase.functions.invoke("promover-fase-produto", {
        body: { tipo: "registrar_pi", itens, dry_run: dryRun },
      });
      if (error) throw new Error(error.message);
      const resposta: any = data;
      if (resposta?.ok === false) throw new Error(resposta?.erro ?? "A edge recusou o registro.");
      const lista: ItemFop[] = Array.isArray(resposta)
        ? resposta
        : Array.isArray(resposta?.itens)
          ? resposta.itens
          : Array.isArray(resposta?.resultado)
            ? resposta.resultado
            : [];
      setItensFop(lista);
      if (dryRun) {
        setFopSimulado(true);
        toast.success(`Simulação concluída: ${lista.length} item(ns).`);
      } else {
        setFopSimulado(false);
        toast.success("Registro enviado ao FOP.");
        await qc.invalidateQueries({ queryKey: ["pi-import-stage", loteId] });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao registrar no FOP.");
    } finally {
      setOcupadoFop(false);
    }
  }

  function baixarPlanilha() {
    if (linhaCabecalho === null) { toast.error("Nenhuma planilha carregada."); return; }
    try {
      const dados = new Map<number, LinhaStage>();
      for (const l of linhas.data ?? []) if (l.linha_num !== null) dados.set(l.linha_num, l);

      const saida: unknown[][] = matriz.map((r) => [...(r ?? [])]);
      const cab = [...(saida[linhaCabecalho] ?? [])];
      let largura = Math.max(colunas.length, cab.length);

      const alvo: Record<"cod_cadastro" | "ean" | "dun", number> = {
        cod_cadastro: campoDaColuna("cod_cadastro") ?? -1,
        ean: campoDaColuna("ean") ?? -1,
        dun: campoDaColuna("dun") ?? -1,
      };
      const rotulos: Record<string, string> = { cod_cadastro: "COD CADASTRO", ean: "EAN", dun: "DUN" };
      for (const campo of ["cod_cadastro", "ean", "dun"] as const) {
        if (alvo[campo] < 0) {
          alvo[campo] = largura;
          cab[largura] = rotulos[campo];
          largura += 1;
        }
      }
      saida[linhaCabecalho] = cab;

      for (const [linhaNum, l] of dados) {
        const i = linhaNum - 1;
        const linha = [...(saida[i] ?? [])];
        if (l.cod_cadastro) linha[alvo.cod_cadastro] = l.cod_cadastro;
        if (l.ean) linha[alvo.ean] = l.ean;
        if (l.dun) linha[alvo.dun] = l.dun;
        saida[i] = linha;
      }

      const ws = XLSX.utils.aoa_to_sheet(saida as any[][]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, nomePlanilha ?? "PI");
      const base = (arquivoNome ?? "pi").replace(/\.(xlsx|xls)$/i, "");
      XLSX.writeFile(wb, `${base}-devolvida.xlsx`);
      toast.success("Planilha devolvida gerada.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar a planilha devolvida.");
    }
  }

  const amostra = linhasDados.slice(0, 5);

  return (
    <PageShell>
      <PageHeader
        titulo="Importação de PI"
        estado="A planilha é lida no navegador. O julgamento de identidade é do banco."
        breadcrumb={[
          { label: "Produto", to: "/vendas/produto" },
          { label: "Importação de PI" },
        ]}
      />

      {sinonimos.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar os sinônimos de coluna: {(sinonimos.error as any)?.message ?? "erro desconhecido"}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* 1 — Upload e detecção */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Planilha da PI</CardTitle>
          <CardDescription>
            O cabeçalho varia entre a linha 5 e a 18 e os nomes de coluna mudam por fornecedor — a detecção é por dimensão, nunca por posição.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void aoEscolherArquivo(f);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={lendo || sinonimos.isLoading}
            >
              {lendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Escolher planilha
            </Button>
            {sinonimos.isLoading ? (
              <span className="text-sm text-muted-foreground">Carregando sinônimos…</span>
            ) : null}
          </div>

          {arquivoNome && linhaCabecalho !== null ? (
            <div className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-3">
              <div><span className="text-muted-foreground">Arquivo: </span>{arquivoNome}</div>
              <div><span className="text-muted-foreground">Cabeçalho na linha: </span>{linhaCabecalho + 1}</div>
              <div><span className="text-muted-foreground">Linhas de dado: </span>{linhasDados.length}</div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma planilha carregada.</p>
          )}
        </CardContent>
      </Card>

      {/* 2 — Mapeamento */}
      {linhaCabecalho !== null ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Mapeamento das colunas</CardTitle>
            <CardDescription>Confira o que o sistema entendeu antes de gravar o lote.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pi-fornecedor">Fornecedor</Label>
                <Input id="pi-fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pi-numero">Número da PI</Label>
                <Input id="pi-numero" value={piNumero} onChange={(e) => setPiNumero(e.target.value)} />
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Coluna da planilha</TableHead>
                  <TableHead>Campo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {colunas.map((nome, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{nome || <span className="text-muted-foreground">coluna {i + 1}</span>}</TableCell>
                    <TableCell>
                      <Select
                        value={mapeamento[i] ?? IGNORAR}
                        onValueChange={(v) => setMapeamento((m) => ({ ...m, [i]: v }))}
                      >
                        <SelectTrigger className="w-[220px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={IGNORAR}>— ignorar —</SelectItem>
                          {CAMPOS.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="space-y-2">
              <p className="text-sm font-medium">Amostra (5 primeiras linhas, mapeamento aplicado)</p>
              {amostra.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma linha de dado.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Linha</TableHead>
                      {CAMPOS.map((c) => <TableHead key={c}>{c}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {amostra.map((r) => {
                      const c = linhaConvertida(r.celulas);
                      return (
                        <TableRow key={r.idx}>
                          <TableCell className="text-xs">{r.idx + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{c.sku ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{c.cod_cadastro ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{c.ean ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{c.dun ?? "—"}</TableCell>
                          <TableCell className="text-xs">{c.inner_qtd ?? "—"}</TableCell>
                          <TableCell className="max-w-[220px] truncate text-xs">{c.descricao ?? "—"}</TableCell>
                          <TableCell className="text-xs">{c.qtd ?? "—"}</TableCell>
                          <TableCell className="text-xs">{c.peso_g ?? "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            <Button onClick={confirmarMapeamento} disabled={gravando}>
              {gravando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar mapeamento
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* 4 — Conferência */}
      {loteId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Conferência</CardTitle>
            <CardDescription>Quem julga identidade é a fn_pi_conferir_lote. Linha ruim não bloqueia o lote.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" onClick={conferir} disabled={conferindo}>
              {conferindo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Conferir lote
            </Button>

            {contagem ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {ESTADOS_CONFERENCIA.map((e) => (
                  <Card key={e}>
                    <CardHeader className="pb-2">
                      <CardDescription>{e}</CardDescription>
                      <CardTitle className="text-2xl">{contagem[e] ?? 0}</CardTitle>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : null}

            {linhas.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando linhas…
              </div>
            ) : linhas.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Não foi possível carregar as linhas: {(linhas.error as any)?.message ?? "erro desconhecido"}
                </AlertDescription>
              </Alert>
            ) : (linhas.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma linha neste lote.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Linha</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Cod. cadastro</TableHead>
                    <TableHead>EAN</TableHead>
                    <TableHead>DUN</TableHead>
                    <TableHead className="text-right">Inner</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(linhas.data ?? []).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs">{l.linha_num ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.sku ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.cod_cadastro ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.ean ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.dun ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">{l.inner_qtd ?? "—"}</TableCell>
                      <TableCell><BadgeEstado estado={l.estado} /></TableCell>
                      <TableCell className="max-w-[280px] text-xs text-muted-foreground">{l.motivo ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* 5 — Alocar */}
      {loteId && contagem ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Alocar códigos</CardTitle>
            <CardDescription>
              {aAlocar.length > 0
                ? `${aAlocar.length} linha(s) sem código no cartório.`
                : "Nada a alocar neste lote."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {aAlocar.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todos os itens já tinham código no cartório. Nada a alocar.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="pi-inner">Inner</Label>
                    <Input
                      id="pi-inner"
                      type="number"
                      min={1}
                      value={inner}
                      onChange={(e) => { setInner(e.target.value); setProposta(null); }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Vem do packing list da fábrica — não se inventa.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pi-motivo">Motivo</Label>
                    <Input
                      id="pi-motivo"
                      placeholder="para qual PI / pedido"
                      value={motivo}
                      onChange={(e) => { setMotivo(e.target.value); setProposta(null); }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => void alocar(true)} disabled={ocupadoAlocacao}>
                    {ocupadoAlocacao ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Ver proposta
                  </Button>
                  <Button onClick={() => void alocar(false)} disabled={!proposta || ocupadoAlocacao}>
                    Confirmar alocação
                  </Button>
                </div>

                {proposta ? (
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-sm">
                      Proposta: <strong>{proposta.alocaria ?? proposta.codigos?.length ?? 0}</strong> código(s).
                      {typeof proposta.livres_depois === "number" ? ` Livres depois: ${proposta.livres_depois}.` : null}
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cod. cadastro</TableHead>
                          <TableHead>EAN</TableHead>
                          <TableHead>DUN</TableHead>
                          <TableHead>SKU sugerido</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(proposta.codigos ?? []).map((c) => (
                          <TableRow key={`${c.cod_cadastro}-${c.ean}`}>
                            <TableCell className="font-mono text-xs">{c.cod_cadastro ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{c.ean ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{c.dun ?? "—"}</TableCell>
                            <TableCell className="text-sm">{c.sku_sugerido ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* 6 — FOP */}
      {loteId && contagem ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">5. Registrar no FOP</CardTitle>
            <CardDescription>
              {paraFop.length} item(ns) reconhecido(s) ou alocado(s). Simule antes de enviar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => void registrarFop(true)} disabled={ocupadoFop}>
                {ocupadoFop ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Simular registro
              </Button>
              <Button onClick={() => void registrarFop(false)} disabled={!fopSimulado || ocupadoFop}>
                Registrar no FOP
              </Button>
            </div>

            {itensFop === null ? (
              <p className="text-sm text-muted-foreground">Nenhuma simulação feita ainda.</p>
            ) : itensFop.length === 0 ? (
              <p className="text-sm text-muted-foreground">A resposta não trouxe itens.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cod. cadastro</TableHead>
                    <TableHead>EAN</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itensFop.map((it, i) => (
                    <TableRow key={`${it.cod_cadastro}-${i}`}>
                      <TableCell className="font-mono text-xs">{it.cod_cadastro ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{it.ean ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{it.sku ?? "—"}</TableCell>
                      <TableCell><BadgeStatusFop status={it.status ?? null} /></TableCell>
                      <TableCell className="max-w-[280px] text-xs text-muted-foreground">{it.motivo ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* 7 — Devolver a planilha */}
      {loteId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">6. Devolver a planilha</CardTitle>
            <CardDescription>Mesmo arquivo do Thomer, com cod_cadastro, EAN e DUN preenchidos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" onClick={baixarPlanilha}>
              <Download className="mr-2 h-4 w-4" />
              Baixar planilha devolvida
            </Button>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Se a planilha original não tiver colunas de código, elas são acrescentadas ao final, com o cabeçalho na mesma linha detectada.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
