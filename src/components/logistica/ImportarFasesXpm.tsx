import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  FileUp,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ListChecks,
  RefreshCcw,
  ClipboardPaste,
} from "lucide-react";

// ARQUIVO-XPM-E-TRILHO-PARALELO (22/08/2026): esta tela NAO toca na integracao
// ZenLOG/API (xpm_expedicao_evento, wns_fases_xpm, fn_xpm_aplicar_evento).
// Enquanto o trilho de eventos da API esta quebrado no lado da XPM, a fonte
// alternativa e o relatorio de e-mail do TI XPM (2x/dia), ingerido aqui via
// RPC fn_ingerir_fases_arquivo_xpm em xpm_arquivo_fase_evento (append-only).

interface LinhaArquivo {
  pedido: string;
  statusnf: string;
  importadoem: string;
  separadoem: string;
  conferidoem: string;
  faturadoem: string;
}

interface ResumoRpc {
  total_linhas: number;
  inseridos: number;
  nao_resolvidos_na_xpm_expedicao: string[];
  fase_desconhecida: string[];
  retrocessos_detectados: string[];
}

interface Preview {
  linhas: LinhaArquivo[];
  geradoEm: string; // ISO
  geradoEmTexto: string;
  numeroEnvio: string | null;
  datasInvalidas: number;
  fasesDesconhecidas: string[];
  pedidosNaoVistos: string[] | null; // null = checagem indisponivel
}

const MESES: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, março: 2, abril: 3, maio: 4,
  junho: 5, julho: 6, agosto: 7, setembro: 8, outubro: 9,
  novembro: 10, dezembro: 11,
};

const COLUNAS = ["PEDIDO", "STATUSNF", "IMPORTADOEM", "SEPARADOEM", "CONFERIDOEM", "FATURADOEM"] as const;

function normCabecalho(s: string): string {
  // NFD + faixa de diacriticos combinantes (U+0300-U+036F) -> remove acentos
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// "yyyy-MM-dd HH:mm[:ss]" -> ISO (data local -> toISOString, mesma doutrina do parseDataBR).
// Retorna "" quando vazio; null quando o formato nao e reconhecido.
function dataCelulaParaIso(v: string): string | null {
  const s = v.trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function extrairGeradoEm(texto: string): { iso: string; texto: string } | null {
  const m = texto.match(
    /data\s*de\s*gera[çc][ãa]o\s*:?\s*(\d{1,2})\s+de\s+([a-zçáéíóúâêôãõ]+)\s+de\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/i
  );
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (mes === undefined) return null;
  const d = new Date(+m[3], mes, +m[1], +m[4], +m[5], +m[6]);
  if (isNaN(d.getTime())) return null;
  return { iso: d.toISOString(), texto: m[0].replace(/^[Dd]ata\s*de\s*[Gg]era[çc][ãa]o\s*:?\s*/, "") };
}

function extrairNumeroEnvio(texto: string): string | null {
  const m = texto.match(/n[úu]mero\s*de\s*envio\s*:?\s*(\d+)/i);
  return m ? m[1] : null;
}

/** Parseia o HTML do e-mail e devolve as linhas + metadados do cabecalho. */
function parsearEmail(html: string): {
  linhas: LinhaArquivo[];
  geradoEm: { iso: string; texto: string } | null;
  numeroEnvio: string | null;
  datasInvalidas: number;
  erro: string | null;
} {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const textoPlano = (doc.body?.textContent ?? html).replace(/\s+/g, " ");
  const geradoEm = extrairGeradoEm(textoPlano);
  const numeroEnvio = extrairNumeroEnvio(textoPlano);

  let tabela: HTMLTableElement | null = null;
  let mapaColunas: Partial<Record<(typeof COLUNAS)[number], number>> = {};
  for (const t of Array.from(doc.querySelectorAll("table"))) {
    const primeiraLinha = t.querySelector("tr");
    if (!primeiraLinha) continue;
    const cels = Array.from(primeiraLinha.querySelectorAll("th,td")).map((c) =>
      normCabecalho(c.textContent ?? "")
    );
    if (!cels.includes("PEDIDO") || !cels.includes("STATUSNF")) continue;
    const mapa: typeof mapaColunas = {};
    COLUNAS.forEach((col) => {
      const i = cels.indexOf(col);
      if (i >= 0) mapa[col] = i;
    });
    tabela = t;
    mapaColunas = mapa;
    break;
  }

  if (!tabela) {
    return { linhas: [], geradoEm, numeroEnvio, datasInvalidas: 0, erro: "Nenhuma tabela com as colunas PEDIDO/STATUSNF foi encontrada no HTML." };
  }
  const faltantes = COLUNAS.filter((c) => mapaColunas[c] === undefined);
  if (faltantes.length > 0) {
    return { linhas: [], geradoEm, numeroEnvio, datasInvalidas: 0, erro: `Colunas faltantes na tabela: ${faltantes.join(", ")}` };
  }

  const linhas: LinhaArquivo[] = [];
  let datasInvalidas = 0;
  const cel = (cels: NodeListOf<Element>, col: (typeof COLUNAS)[number]): string => {
    const i = mapaColunas[col];
    return i === undefined ? "" : (cels[i]?.textContent ?? "").trim();
  };

  for (const tr of Array.from(tabela.querySelectorAll("tr"))) {
    const cels = tr.querySelectorAll("th,td");
    if (cels.length === 0) continue;
    const primeira = normCabecalho(cels[0]?.textContent ?? "");
    if (primeira === "PEDIDO") continue; // linha de cabecalho repetida
    const pedido = cel(cels, "PEDIDO");
    if (!pedido) continue;

    const linha: LinhaArquivo = { pedido, statusnf: cel(cels, "STATUSNF"), importadoem: "", separadoem: "", conferidoem: "", faturadoem: "" };
    for (const col of ["IMPORTADOEM", "SEPARADOEM", "CONFERIDOEM", "FATURADOEM"] as const) {
      const iso = dataCelulaParaIso(cel(cels, col));
      if (iso === null) datasInvalidas++;
      else {
        const chave = col.toLowerCase() as "importadoem" | "separadoem" | "conferidoem" | "faturadoem";
        linha[chave] = iso;
      }
    }
    linhas.push(linha);
  }

  return { linhas, geradoEm, numeroEnvio, datasInvalidas, erro: null };
}

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
}

function ListaCodigos({ itens, vazio }: { itens: string[]; vazio: string }) {
  if (itens.length === 0) return <p className="text-xs text-muted-foreground">{vazio}</p>;
  return (
    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-auto">
      {itens.map((p) => (
        <code key={p} className="text-xs bg-muted rounded px-1.5 py-0.5">{p}</code>
      ))}
    </div>
  );
}

export function ImportarFasesXpm() {
  const [html, setHtml] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [erroParse, setErroParse] = useState<string | null>(null);
  const [montando, setMontando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResumoRpc | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function montarPreview() {
    setErroParse(null);
    setResultado(null);
    if (!html.trim()) {
      setErroParse("Cole o HTML do e-mail ou selecione o arquivo .html antes de continuar.");
      return;
    }
    setMontando(true);
    try {
      const { linhas, geradoEm, numeroEnvio, datasInvalidas, erro } = parsearEmail(html);
      if (erro) {
        setErroParse(erro);
        setPreview(null);
        return;
      }
      if (linhas.length === 0) {
        setErroParse("A tabela foi encontrada, mas nenhuma linha de pedido foi lida.");
        setPreview(null);
        return;
      }
      if (!geradoEm) {
        setErroParse('Não achei o cabeçalho "Data de geração: ..." no texto. Confira se o e-mail foi colado inteiro.');
        setPreview(null);
        return;
      }

      // Checagens de prévia (não bloqueantes): fase conhecida + pedido já visto na expedição XPM.
      const statusUnicos = [...new Set(linhas.map((l) => l.statusnf.trim().toUpperCase()))];
      const { data: dim } = await supabase.from("xpm_arquivo_fase_dim").select("codigo");
      const fasesConhecidas = new Set((dim ?? []).map((d) => d.codigo.toUpperCase()));
      const fasesDesconhecidas = statusUnicos.filter((s) => !fasesConhecidas.has(s));

      let pedidosNaoVistos: string[] | null = null;
      try {
        const pedidosUnicos = [...new Set(linhas.map((l) => l.pedido))];
        const vistos = new Set<string>();
        for (let i = 0; i < pedidosUnicos.length; i += 200) {
          const { data, error } = await supabase
            .from("xpm_expedicao")
            .select("codigo")
            .in("codigo", pedidosUnicos.slice(i, i + 200));
          if (error) throw error;
          (data ?? []).forEach((r) => vistos.add(r.codigo));
        }
        pedidosNaoVistos = pedidosUnicos.filter((p) => !vistos.has(p));
      } catch {
        pedidosNaoVistos = null; // sem leitura da expedição: prévia segue sem essa checagem
      }

      setPreview({
        linhas,
        geradoEm: geradoEm.iso,
        geradoEmTexto: geradoEm.texto,
        numeroEnvio,
        datasInvalidas,
        fasesDesconhecidas,
        pedidosNaoVistos,
      });
    } finally {
      setMontando(false);
    }
  }

  async function confirmar() {
    if (!preview) return;
    setConfirmando(true);
    try {
      const { data, error } = await supabase.rpc("fn_ingerir_fases_arquivo_xpm", {
        p_linhas: preview.linhas as unknown as Json,
        p_arquivo_gerado_em: preview.geradoEm,
        p_arquivo_numero_envio: preview.numeroEnvio ?? undefined,
      });
      if (error) throw error;
      const resumo = data as unknown as ResumoRpc;
      setResultado(resumo);
      toast.success(`${resumo.inseridos} linha(s) ingerida(s) no log de fases.`);
    } catch (e) {
      toast.error("Erro ao importar: " + formatError(e));
    } finally {
      setConfirmando(false);
    }
  }

  function novaImportacao() {
    setHtml("");
    setPreview(null);
    setErroParse(null);
    setResultado(null);
  }

  function problemaDaLinha(l: LinhaArquivo): "fase" | "pedido" | null {
    if (preview?.fasesDesconhecidas.includes(l.statusnf.trim().toUpperCase())) return "fase";
    if (preview?.pedidosNaoVistos?.includes(l.pedido)) return "pedido";
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-card space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-medium">Importar fases (arquivo XPM)</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Fonte alternativa enquanto o trilho de eventos da API ZenLOG está quebrado no lado da XPM.
              Cole o HTML do e-mail do relatório (ou suba o .html). Nada aqui toca na integração automática.
            </p>
          </div>
          <Selo estado="info">trilho paralelo</Selo>
        </div>

        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          rows={7}
          placeholder="Cole aqui o HTML completo do e-mail (no Gmail: abrir o e-mail → Mostrar original / Ver código-fonte)…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />

        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".html,.htm,.txt"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setHtml(await f.text());
              setPreview(null);
              setResultado(null);
            }}
          />
          <Button variant="outline" size="sm" className="gap-2" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4" /> Subir .html
          </Button>
          <Button size="sm" className="gap-2" onClick={montarPreview} disabled={montando || !html.trim()}>
            {montando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />}
            Ler e montar prévia
          </Button>
          {(preview || resultado) && (
            <Button variant="ghost" size="sm" className="gap-2" onClick={novaImportacao}>
              <RefreshCcw className="h-4 w-4" /> Nova importação
            </Button>
          )}
        </div>

        {erroParse && (
          <div className="flex items-start gap-1.5 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{erroParse}</span>
          </div>
        )}
      </div>

      {preview && !resultado && (
        <div className="border rounded-lg p-4 bg-card space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Prévia da importação
          </h3>

          <div className="flex flex-wrap gap-2">
            <Selo estado="info">{preview.linhas.length} linha(s) lida(s)</Selo>
            <Selo estado="muted">gerado em {preview.geradoEmTexto}</Selo>
            {preview.numeroEnvio ? (
              <Selo estado="muted">envio nº {preview.numeroEnvio}</Selo>
            ) : (
              <Selo estado="warning">número de envio não encontrado</Selo>
            )}
            {preview.datasInvalidas > 0 && (
              <Selo estado="warning">{preview.datasInvalidas} data(s) inválida(s) — serão gravadas vazias</Selo>
            )}
          </div>

          {preview.fasesDesconhecidas.length > 0 && (
            <div className="border border-destructive/40 bg-destructive/10 rounded-md p-3 text-sm space-y-1">
              <p className="text-destructive font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> STATUSNF fora do dicionário
              </p>
              <p className="text-muted-foreground text-xs">
                Estas fases não existem em <code>xpm_arquivo_fase_dim</code> — as linhas com elas serão ignoradas
                pela importação. Cadastre cada uma na dimensão e reimporte:
              </p>
              <ListaCodigos itens={preview.fasesDesconhecidas} vazio="" />
            </div>
          )}

          {preview.pedidosNaoVistos !== null && preview.pedidosNaoVistos.length > 0 && (
            <div className="border border-warning/40 bg-warning/10 rounded-md p-3 text-sm space-y-1">
              <p className="text-warning font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> {preview.pedidosNaoVistos.length} pedido(s) nunca vistos na expedição XPM
              </p>
              <p className="text-muted-foreground text-xs">
                Não é bloqueante: serão gravados no log sem vínculo com a expedição.
              </p>
              <ListaCodigos itens={preview.pedidosNaoVistos} vazio="" />
            </div>
          )}

          <div className="border rounded-md overflow-auto max-h-72">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {["Pedido", "STATUSNF", "Importado", "Separado", "Conferido", "Faturado", ""].map((h) => (
                    <th key={h} className="text-left font-normal text-muted-foreground px-2 py-1.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.linhas.map((l, i) => {
                  const p = problemaDaLinha(l);
                  return (
                    <tr key={`${l.pedido}-${i}`} className={cn("border-t", p === "fase" && "bg-destructive/10", p === "pedido" && "bg-warning/10")}>
                      <td className="px-2 py-1 font-mono">{l.pedido}</td>
                      <td className="px-2 py-1">{l.statusnf}</td>
                      <td className="px-2 py-1 text-muted-foreground">{l.importadoem ? formatarDataHora(l.importadoem) : "—"}</td>
                      <td className="px-2 py-1 text-muted-foreground">{l.separadoem ? formatarDataHora(l.separadoem) : "—"}</td>
                      <td className="px-2 py-1 text-muted-foreground">{l.conferidoem ? formatarDataHora(l.conferidoem) : "—"}</td>
                      <td className="px-2 py-1 text-muted-foreground">{l.faturadoem ? formatarDataHora(l.faturadoem) : "—"}</td>
                      <td className="px-2 py-1">
                        {p === "fase" && <Selo estado="destructive">fase?</Selo>}
                        {p === "pedido" && <Selo estado="warning">novo</Selo>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button onClick={confirmar} disabled={confirmando} className="gap-2">
              {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar importação
            </Button>
          </div>
        </div>
      )}

      {resultado && (
        <div className="border rounded-lg p-4 bg-card space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" /> Importação concluída
          </h3>

          <div className="flex flex-wrap gap-2">
            <Selo estado="success">{resultado.inseridos} inserida(s)</Selo>
            <Selo estado="muted">{resultado.total_linhas} linha(s) no arquivo</Selo>
          </div>

          {resultado.fase_desconhecida.length > 0 && (
            <div className="border border-destructive/40 bg-destructive/10 rounded-md p-3 text-sm space-y-1">
              <p className="text-destructive font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> {resultado.fase_desconhecida.length} linha(s) ignorada(s) — fase desconhecida
              </p>
              <p className="text-muted-foreground text-xs">
                Apareceu um STATUSNF que não está no dicionário. Adicione a linha nova em{" "}
                <code>xpm_arquivo_fase_dim</code> e reimporte o arquivo:
              </p>
              <ListaCodigos itens={resultado.fase_desconhecida} vazio="" />
            </div>
          )}

          {resultado.nao_resolvidos_na_xpm_expedicao.length > 0 && (
            <div className="border border-warning/40 bg-warning/10 rounded-md p-3 text-sm space-y-1">
              <p className="text-warning font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> {resultado.nao_resolvidos_na_xpm_expedicao.length} pedido(s) não resolvidos na expedição XPM
              </p>
              <p className="text-muted-foreground text-xs">
                Gravados no log sem vínculo com <code>xpm_expedicao</code>.
              </p>
              <ListaCodigos itens={resultado.nao_resolvidos_na_xpm_expedicao} vazio="" />
            </div>
          )}

          {resultado.retrocessos_detectados.length > 0 && (
            <div className="border border-warning/40 bg-warning/10 rounded-md p-3 text-sm space-y-1">
              <p className="text-warning font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> {resultado.retrocessos_detectados.length} retrocesso(s) de fase neste lote
              </p>
              <p className="text-muted-foreground text-xs">
                Esperado — não é erro de importação. É evidência da instabilidade do trilho de eventos no lado
                da XPM e fica registrado para monitoramento.
              </p>
              <ListaCodigos itens={resultado.retrocessos_detectados} vazio="" />
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={novaImportacao} className="gap-2">
              <RefreshCcw className="h-4 w-4" /> Nova importação
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
