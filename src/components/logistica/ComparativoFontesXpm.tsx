import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Selo } from "@/components/ui/selo";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatError } from "@/lib/format-error";
import { Loader2, Search, GitCompare, Radio, FileUp, AlertCircle } from "lucide-react";

// FUNIL-API-X-ARQUIVO (22/08/2026): comparação visual lado a lado entre a API
// ZenLOG (wns_fases_xpm, api_fase_seq 1..6) e o arquivo do Leandro
// (xpm_arquivo_fase_dim, arquivo_fase_ordem 5..80). Não calculamos divergência
// numérica — as escalas são diferentes e o operador julga pelos rótulos.

interface LinhaComparativo {
  expedicao_codigo: string;
  pedido_sncf: string | null;
  cliente_sncf: string | null;
  situacao: string | null;
  api_fase_codigo: string | null;
  api_fase_rotulo: string | null;
  api_fase_seq: number | null;
  api_atualizado_em: string | null;
  api_dias_parado: number | null;
  arquivo_fase_codigo: string | null;
  arquivo_fase_rotulo: string | null;
  arquivo_fase_ordem: number | null;
  arquivo_atualizado_em: string | null;
  arquivo_faturadoem: string | null;
  so_na_api: boolean;
  so_no_arquivo: boolean;
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function diasAtras(iso: string | null, diasParado: number | null): string {
  if (diasParado !== null && diasParado >= 0) return `há ${diasParado}d`;
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? `há ${diff}d` : "";
}

export function ComparativoFontesXpm() {
  const [linhas, setLinhas] = useState<LinhaComparativo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [mostrarSoApi, setMostrarSoApi] = useState(false);
  const [mostrarSoArquivo, setMostrarSoArquivo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      setCarregando(true);
      setErro(null);
      try {
        const { data, error } = await supabase
          .from("vw_xpm_comparativo_fontes")
          .select(
            "expedicao_codigo,pedido_sncf,cliente_sncf,situacao,api_fase_codigo,api_fase_rotulo,api_fase_seq,api_atualizado_em,api_dias_parado,arquivo_fase_codigo,arquivo_fase_rotulo,arquivo_fase_ordem,arquivo_atualizado_em,arquivo_faturadoem,so_na_api,so_no_arquivo"
          )
          .order("api_dias_parado", { ascending: false });
        if (error) throw error;
        if (!cancelado) setLinhas((data as LinhaComparativo[]) ?? []);
      } catch (e) {
        if (!cancelado) setErro(formatError(e));
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, []);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      const matchBusca =
        !termo ||
        l.expedicao_codigo.toLowerCase().includes(termo) ||
        (l.pedido_sncf?.toLowerCase().includes(termo) ?? false) ||
        (l.cliente_sncf?.toLowerCase().includes(termo) ?? false);

      const temAmbas = !l.so_na_api && !l.so_no_arquivo;
      if (temAmbas) return matchBusca;
      if (l.so_na_api && mostrarSoApi) return matchBusca;
      if (l.so_no_arquivo && mostrarSoArquivo) return matchBusca;
      return false;
    });
  }, [linhas, busca, mostrarSoApi, mostrarSoArquivo]);

  const contagem = useMemo(() => {
    const ambas = linhas.filter((l) => !l.so_na_api && !l.so_no_arquivo).length;
    const soApi = linhas.filter((l) => l.so_na_api).length;
    const soArquivo = linhas.filter((l) => l.so_no_arquivo).length;
    return { ambas, soApi, soArquivo };
  }, [linhas]);

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-card space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-medium flex items-center gap-2">
              <GitCompare className="h-4 w-4" /> Funil (API x Arquivo)
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Comparação visual entre a API ZenLOG (automática) e o arquivo do Leandro (manual).
              As escalas são diferentes: API usa seq 1–6 e o arquivo usa ordem 5–80. O operador
              julga pelos rótulos, não por um score.
            </p>
          </div>
          <Selo estado="info">comparação visual</Selo>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[16rem]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar pedido ou cliente…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 bg-muted/30 rounded-md px-3 py-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch size="sm" checked={mostrarSoApi} onCheckedChange={setMostrarSoApi} />
              <span className="inline-flex items-center gap-1">
                <Radio className="h-3.5 w-3.5 text-muted-foreground" /> Só API ({contagem.soApi})
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch size="sm" checked={mostrarSoArquivo} onCheckedChange={setMostrarSoArquivo} />
              <span className="inline-flex items-center gap-1">
                <FileUp className="h-3.5 w-3.5 text-muted-foreground" /> Só arquivo ({contagem.soArquivo})
              </span>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Selo estado="success">{contagem.ambas} com ambas as fontes</Selo>
          <Selo estado="muted">{linhas.length} total</Selo>
          {!mostrarSoApi && !mostrarSoArquivo && (
            <Selo estado="info">filtro padrão: ambas as fontes</Selo>
          )}
        </div>

        {erro && (
          <div className="flex items-start gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{erro}</span>
          </div>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="text-left font-normal text-muted-foreground px-3 py-2">Pedido / Cliente</th>
                <th className="text-left font-normal text-muted-foreground px-3 py-2">Situação</th>
                <th className="text-left font-normal text-muted-foreground px-3 py-2">Fase pela API</th>
                <th className="text-left font-normal text-muted-foreground px-3 py-2">Fase pelo arquivo</th>
                <th className="text-left font-normal text-muted-foreground px-3 py-2">Observação</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Carregando comparativo…
                  </td>
                </tr>
              ) : filtradas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Nenhuma linha encontrada para os filtros atuais.
                  </td>
                </tr>
              ) : (
                filtradas.map((l, i) => (
                  <tr key={`${l.expedicao_codigo}-${i}`} className="border-t hover:bg-muted/20">
                    <td className="px-3 py-2 align-top">
                      <div className="font-mono font-medium">{l.expedicao_codigo}</div>
                      {l.pedido_sncf && (
                        <div className="text-muted-foreground">SNCF: {l.pedido_sncf}</div>
                      )}
                      {l.cliente_sncf && (
                        <div className="text-muted-foreground truncate max-w-[16rem]">{l.cliente_sncf}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {l.situacao ? <Selo estado="muted">{l.situacao}</Selo> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {l.api_fase_rotulo ? (
                        <div className="space-y-0.5">
                          <div className="font-medium">{l.api_fase_rotulo}</div>
                          <div className="text-muted-foreground">
                            {diasAtras(l.api_atualizado_em, l.api_dias_parado)}
                          </div>
                          {l.api_atualizado_em && (
                            <div className="text-muted-foreground">{formatarData(l.api_atualizado_em)}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {l.arquivo_fase_rotulo ? (
                        <div className="space-y-0.5">
                          <div className="font-medium">{l.arquivo_fase_rotulo}</div>
                          {l.arquivo_atualizado_em && (
                            <div className="text-muted-foreground">{formatarData(l.arquivo_atualizado_em)}</div>
                          )}
                          {l.arquivo_faturadoem && (
                            <div className="text-muted-foreground">fat. {formatarData(l.arquivo_faturadoem)}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {l.so_na_api && (
                        <Selo estado="warning">sem dado do arquivo ainda</Selo>
                      )}
                      {l.so_no_arquivo && (
                        <Selo estado="info">não aparece na API</Selo>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
