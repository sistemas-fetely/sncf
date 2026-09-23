import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, Upload } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { fmtData } from "@/lib/data";

/**
 * CICLO PLANILHA (23/09/2026) — exportar pendências → preencher → importar.
 *
 * Só serve a regra de cadastro incompleto. Nenhum nome de campo escrito aqui:
 * as colunas vêm de `produto_ficha_nascimento` (importavel_planilha = true) e
 * os valores atuais de `vw_produto_mesa_lista`. A escrita é SEMPRE pela edge
 * function `gravar-produto-fop`, um produto por vez. FAIL-LOUD: erro de
 * produto não interrompe a fila e aparece nomeado no fim.
 */

type CampoDim = { campo: string; rotulo: string | null; ordem: number };
type LinhaMesa = Record<string, unknown> & { cod_cadastro: string | null; sku: string | null; nome_comercial: string | null; falta_fase_atual: string[] | null };

type CorpoFuncao = Record<string, unknown>;
type ErroFuncao = { status: number; corpo: CorpoFuncao | null };

/** Mesmo caminho da Ficha do Produto: invoke + corpo cru da edge no erro. */
async function chamarFuncao(nome: string, payload: Record<string, unknown>): Promise<CorpoFuncao> {
  const { data, error } = await supabase.functions.invoke(nome, { body: payload });
  if (error) {
    const resp = (error as { context?: unknown })?.context as Response | undefined;
    if (resp && typeof resp.json === "function") {
      let corpo: CorpoFuncao | null = null;
      try { corpo = await resp.json(); } catch { try { corpo = { erro: await resp.text() }; } catch { corpo = null; } }
      throw { status: resp.status, corpo } as ErroFuncao;
    }
    throw { status: 0, corpo: { erro: error.message } } as ErroFuncao;
  }
  if (!data || data.ok !== true) throw { status: 0, corpo: data ?? { erro: "Resposta vazia da função" } } as ErroFuncao;
  return data as CorpoFuncao;
}

function mensagemErro(e: unknown): string {
  const f = e as ErroFuncao;
  const c = f?.corpo;
  if (c) {
    for (const k of ["mensagem", "erro", "message", "detalhe"]) {
      const v = c[k];
      if (typeof v === "string" && v.trim()) return f.status ? `${f.status}: ${v}` : v;
    }
    return `${f.status || ""} ${JSON.stringify(c)}`.trim();
  }
  return e instanceof Error ? e.message : String(e);
}

function csvCelula(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function textoValor(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join("; ");
  return String(v).trim();
}

/** Lê CSV com ; ou , como separador, respeitando aspas. */
function lerCsv(texto: string): string[][] {
  const limpo = texto.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const primeira = limpo.split("\n")[0] ?? "";
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
      continue;
    }
    if (c === '"') { aspas = true; continue; }
    if (c === sep) { linha.push(campo); campo = ""; continue; }
    if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; continue; }
    campo += c;
  }
  linha.push(campo);
  if (linha.some(x => x.trim() !== "")) linhas.push(linha);
  return linhas.filter(l => l.some(x => x.trim() !== ""));
}

type OpcaoCampo = { campo: string; valor: string; rotulo: string; ordem: number };
type Mudanca = { cod: string; campo: string; rotulo: string; de: string; para: string };
type Falha = { cod: string; motivo: string };

export function PlanilhaPendencias({ cods, onGravado }: { cods: string[]; onGravado: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [expAberto, setExpAberto] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [motivo, setMotivo] = useState("Importação de planilha de pendências");
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [mudancas, setMudancas] = useState<Mudanca[]>([]);
  const [problemas, setProblemas] = useState<string[]>([]);
  const [rodando, setRodando] = useState(false);
  const [feito, setFeito] = useState(0);
  const [resultado, setResultado] = useState<{ ok: number; falhas: Falha[] } | null>(null);

  const chave = useMemo(() => [...cods].sort().join(","), [cods]);

  const dim = useQuery({
    queryKey: ["ficha-nascimento-importavel"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produto_ficha_nascimento")
        .select("campo, rotulo, ordem")
        .eq("importavel_planilha", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as CampoDim[];
    },
  });

  // OPÇÕES VÁLIDAS: fonte única fn_ficha_opcoes(). Campo com dimensão só aceita valor da lista.
  const opcoesQ = useQuery({
    queryKey: ["ficha-opcoes"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_ficha_opcoes");
      if (error) throw error;
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

  const mesa = useQuery({
    queryKey: ["mesa-pendencias", chave],
    enabled: cods.length > 0,
    queryFn: async () => {
      const LOTE = 300;
      const todas: LinhaMesa[] = [];
      for (let i = 0; i < cods.length; i += LOTE) {
        const { data, error } = await supabase
          .from("vw_produto_mesa_lista")
          .select("*")
          .in("cod_cadastro", cods.slice(i, i + LOTE));
        if (error) throw error;
        todas.push(...((data ?? []) as unknown as LinhaMesa[]));
      }
      return todas;
    },
  });

  const porCod = useMemo(() => {
    const m = new Map<string, LinhaMesa>();
    for (const l of mesa.data ?? []) if (l.cod_cadastro) m.set(String(l.cod_cadastro), l);
    return m;
  }, [mesa.data]);

  /** Colunas da planilha: campo importável faltando em ao menos um produto. */
  const colunas = useMemo(() => {
    const faltando = new Set<string>();
    for (const l of mesa.data ?? []) for (const c of l.falta_fase_atual ?? []) faltando.add(c);
    return (dim.data ?? []).filter(d => faltando.has(d.campo));
  }, [dim.data, mesa.data]);

  /** Produtos do recorte em que cada campo falta (para o contador do diálogo de exportação). */
  const faltandoCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of mesa.data ?? []) for (const c of l.falta_fase_atual ?? []) m.set(c, (m.get(c) ?? 0) + 1);
    return m;
  }, [mesa.data]);

  function marcarFaltantes() {
    setSelecionados(new Set(colunas.map(c => c.campo)));
  }

  function abrirExportacao() {
    marcarFaltantes();
    setExpAberto(true);
  }

  const importaveis = useMemo(() => new Map((dim.data ?? []).map(d => [d.campo, d])), [dim.data]);

  function exportarCom(campos: CampoDim[]) {
    const cab = ["cod_cadastro", "sku", "nome_comercial", ...campos.map(c => c.campo)];
    const corpo = cods
      .map(cod => porCod.get(cod))
      .filter((l): l is LinhaMesa => !!l)
      .map(l => {
        const falta = new Set(l.falta_fase_atual ?? []);
        return [l.cod_cadastro, l.sku, l.nome_comercial, ...campos.map(c => (falta.has(c.campo) ? "" : textoValor(l[c.campo])))]
          .map(csvCelula).join(";");
      }).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + cab.map(csvCelula).join(";") + "\n" + corpo], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pendencias-cadastro-${fmtData(new Date(), "").split("/").reverse().join("-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function lerArquivo(f: File) {
    setArquivo(f.name);
    setResultado(null);
    setFeito(0);
    const linhas = lerCsv(await f.text());
    const cab = (linhas[0] ?? []).map(h => h.trim());
    const iCod = cab.findIndex(h => h.toLocaleLowerCase("pt-BR") === "cod_cadastro");
    const avisos: string[] = [];
    if (iCod < 0) {
      setMudancas([]);
      setProblemas(["A planilha precisa de uma coluna cod_cadastro no cabeçalho."]);
      return;
    }
    const naoImportaveis = cab.filter((h, i) => i !== iCod && h && !["sku", "nome_comercial"].includes(h.toLocaleLowerCase("pt-BR")) && !importaveis.has(h));
    for (const h of new Set(naoImportaveis)) avisos.push(`Coluna "${h}" ignorada: não é campo importável.`);

    const encontradas: Mudanca[] = [];
    for (const l of linhas.slice(1)) {
      const cod = (l[iCod] ?? "").trim();
      if (!cod) continue;
      const atual = porCod.get(cod);
      if (!atual) { avisos.push(`${cod}: cod_cadastro não encontrado no recorte — linha ignorada.`); continue; }
      for (let i = 0; i < cab.length; i++) {
        if (i === iCod) continue;
        const dimCampo = importaveis.get(cab[i]);
        if (!dimCampo) continue;
        const novo = (l[i] ?? "").trim();
        if (!novo) continue;
        // Campo com dimensão: aceita valor OU rótulo digitado, sem distinguir caixa; grava o valor.
        const opcoes = opcoesPorCampo.get(dimCampo.campo) ?? [];
        let paraGravar = novo;
        if (opcoes.length > 0) {
          const alvo = novo.toLocaleLowerCase("pt-BR");
          const achou = opcoes.find(o => o.valor.toLocaleLowerCase("pt-BR") === alvo || (o.rotulo ?? "").toLocaleLowerCase("pt-BR") === alvo);
          if (!achou) {
            avisos.push(`${cod} · ${dimCampo.campo}: "${novo}" não é uma opção válida (opções: ${opcoes.map(o => o.valor).join(", ")})`);
            continue;
          }
          paraGravar = achou.valor;
        }
        const de = textoValor(atual[dimCampo.campo]);
        if (de === paraGravar) continue;
        encontradas.push({ cod, campo: dimCampo.campo, rotulo: dimCampo.rotulo ?? dimCampo.campo, de, para: paraGravar });
      }
    }
    setMudancas(encontradas);
    setProblemas(avisos);
  }

  const produtosAlvo = useMemo(() => [...new Set(mudancas.map(m => m.cod))], [mudancas]);

  async function gravar() {
    setRodando(true);
    setFeito(0);
    const falhas: Falha[] = [];
    let ok = 0;
    for (const cod of produtosAlvo) {
      const campos: Record<string, string> = {};
      for (const m of mudancas.filter(x => x.cod === cod)) campos[m.campo] = m.para;
      try {
        await chamarFuncao("gravar-produto-fop", { cod_cadastro: cod, motivo: motivo.trim(), campos });
        ok++;
      } catch (e) {
        falhas.push({ cod, motivo: mensagemErro(e) });
      }
      setFeito(f => f + 1);
    }
    setRodando(false);
    setResultado({ ok, falhas });
    if (falhas.length === 0) toast.success(`${ok} produto(s) gravado(s).`);
    else toast.error(`${ok} gravado(s), ${falhas.length} com falha.`);
    await mesa.refetch();
    onGravado();
  }

  function fechar(v: boolean) {
    if (rodando) return;
    setAberto(v);
    if (!v) { setArquivo(null); setMudancas([]); setProblemas([]); setResultado(null); setFeito(0); }
  }

  function fecharExportacao(v: boolean) {
    setExpAberto(v);
    if (!v) setSelecionados(new Set());
  }

  return <>
    <Button variant="outline" size="sm" onClick={abrirExportacao} disabled={mesa.isLoading || dim.isLoading}>
      <Download className="mr-2 h-4 w-4" />Exportar pendências
    </Button>
    <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
      <Upload className="mr-2 h-4 w-4" />Importar preenchimento
    </Button>

    <Dialog open={expAberto} onOpenChange={fecharExportacao}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Exportar planilha de cadastro</DialogTitle>
          <DialogDescription>Escolha as colunas da planilha. Os campos que faltam no recorte vêm marcados; célula vazia na planilha significa que o produto está sem o valor.</DialogDescription>
        </DialogHeader>

        {(mesa.error || dim.error) && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Não foi possível ler os valores atuais. Detalhe: {(mesa.error ?? dim.error as Error)?.message}</AlertDescription></Alert>}

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSelecionados(new Set((dim.data ?? []).map(d => d.campo)))}>Marcar todos</Button>
          <Button variant="outline" size="sm" onClick={marcarFaltantes} disabled={!colunas.length}>Só os faltantes</Button>
          <span className="ml-auto text-xs text-muted-foreground">{selecionados.size} coluna(s) marcada(s)</span>
        </div>

        <div className="max-h-80 space-y-1 overflow-auto rounded-md border p-3">
          {(dim.data ?? []).map(d => {
            const n = faltandoCount.get(d.campo) ?? 0;
            return (
              <label key={d.campo} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted/50">
                <Checkbox
                  checked={selecionados.has(d.campo)}
                  onCheckedChange={(v) => setSelecionados(prev => {
                    const novo = new Set(prev);
                    if (v) novo.add(d.campo); else novo.delete(d.campo);
                    return novo;
                  })}
                />
                <span>{d.rotulo ?? d.campo}</span>
                {n > 0 && <span className="text-xs text-muted-foreground">falta em {n} produto(s)</span>}
              </label>
            );
          })}
          {(dim.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum campo importável cadastrado.</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => fecharExportacao(false)}>Fechar</Button>
          <Button onClick={() => exportarCom((dim.data ?? []).filter(d => selecionados.has(d.campo)))} disabled={selecionados.size === 0}>
            Exportar {selecionados.size} coluna(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>


    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar preenchimento de pendências</DialogTitle>
          <DialogDescription>O sistema sugere, você decide: confira a prévia antes de gravar. A escrita passa pelo catálogo (FOP), um produto por vez.</DialogDescription>
        </DialogHeader>

        {(mesa.error || dim.error) && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Não foi possível ler os valores atuais. Detalhe: {(mesa.error ?? dim.error as Error)?.message}</AlertDescription></Alert>}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="planilha">Planilha preenchida (.csv)</Label>
            <Input id="planilha" type="file" accept=".csv,text/csv" disabled={rodando} onChange={e => { const f = e.target.files?.[0]; if (f) void lerArquivo(f); }} />
            {arquivo && <p className="text-xs text-muted-foreground">{arquivo}</p>}
          </div>

          {problemas.length > 0 && <div className="rounded-md border border-destructive/40 p-3">
            <p className="text-sm font-medium text-destructive">Linhas e colunas ignoradas</p>
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-xs text-muted-foreground">
              {problemas.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>}

          {arquivo && <div className="rounded-md border p-3">
            <p className="text-sm font-medium">{produtosAlvo.length} produto(s) · {mudancas.length} campo(s) a gravar</p>
            {mudancas.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">Nenhuma célula preenchida mudaria o valor atual.</p>
            : <ul className="mt-2 max-h-56 space-y-0.5 overflow-auto text-xs">
              {mudancas.map((m, i) => <li key={i}>
                <span className="font-medium">{m.cod}</span> · {m.rotulo}: <span className="text-muted-foreground">{m.de || "vazio"}</span> → {m.para}
              </li>)}
            </ul>}
          </div>}

          <div className="space-y-1.5">
            <Label htmlFor="motivo-import">Motivo (obrigatório)</Label>
            <Input id="motivo-import" value={motivo} disabled={rodando} onChange={e => setMotivo(e.target.value)} />
          </div>

          {rodando && <div className="space-y-1">
            <Progress value={produtosAlvo.length ? (feito / produtosAlvo.length) * 100 : 0} />
            <p className="text-xs text-muted-foreground">{feito} de {produtosAlvo.length}</p>
          </div>}

          {resultado && <div className="rounded-md border p-3">
            <p className="text-sm font-medium">{resultado.ok} produto(s) gravado(s){resultado.falhas.length > 0 ? `, ${resultado.falhas.length} com falha` : ""}.</p>
            {resultado.falhas.length > 0 && <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto text-xs text-destructive">
              {resultado.falhas.map((f, i) => <li key={i}><span className="font-medium">{f.cod}</span>: {f.motivo}</li>)}
            </ul>}
          </div>}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => fechar(false)} disabled={rodando}>Fechar</Button>
          <Button onClick={() => void gravar()} disabled={rodando || mudancas.length === 0 || motivo.trim().length === 0}>
            {rodando ? "Gravando…" : `Gravar ${mudancas.length} campo(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
