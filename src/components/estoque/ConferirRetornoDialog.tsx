import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, ScanBarcode, Trash2 } from "lucide-react";
import type { RetornoPendenteDevolucao } from "@/hooks/estoque/useDevolucoesRetornoPendente";
import { Badge } from "@/components/ui/badge";
import { hojeISO } from "@/lib/data";

/**
 * CONFERÊNCIA CEGA POR BIPAGEM (30/09/2026): inverso da conferência da Mesa
 * de Expedição SP. Etapa 1 conta sem mostrar o esperado; etapa 2 confronta.
 * O centro é resolvido pelo banco a partir do recebimento — não enviamos p_centro.
 */

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  devolucao: RetornoPendenteDevolucao | null;
}

interface Condicao { codigo: string; rotulo: string }
interface Contado { sku: string; condicao: string; qtd: number; nome: string | null; ordem: number }

const COND_QUARENTENA = "quarentena";

function useCondicoesEntrada() {
  return useQuery({
    queryKey: ["estoque-condicoes-entrada-retorno"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Condicao[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("estoque_condicao")
        .select("codigo,rotulo")
        .eq("ativo", true)
        .eq("vendavel", false)
        .neq("codigo", "avariado")
        .order("rotulo");
      if (error) throw error;
      const lista = (data ?? []) as Condicao[];
      // Quarentena primeiro (default)
      return [...lista].sort((a, b) =>
        a.codigo === COND_QUARENTENA ? -1 : b.codigo === COND_QUARENTENA ? 1 : 0,
      );
    },
  });
}

function useFunilLinha(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["vw_devolucao_funil", "conferencia", id],
    enabled: enabled && !!id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_devolucao_funil")
        .select("id,destino_codigo,nf_retorno_sugerida")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as { destino_codigo: string | null; nf_retorno_sugerida: string | null } | null;
    },
  });
}

export function ConferirRetornoDialog({ open, onOpenChange, devolucao }: Props) {
  const qc = useQueryClient();
  const condQ = useCondicoesEntrada();
  const condicoes = condQ.data ?? [];
  const funilQ = useFunilLinha(devolucao?.devolucao_id ?? null, open);

  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [condicao, setCondicao] = useState(COND_QUARENTENA);
  const [codigo, setCodigo] = useState("");
  const [qtdBip, setQtdBip] = useState("1");
  const [codigoErro, setCodigoErro] = useState(false);
  const [resolvendo, setResolvendo] = useState(false);
  const [contados, setContados] = useState<Contado[]>([]);
  const [ultimoChave, setUltimoChave] = useState<string | null>(null);
  const [docNumero, setDocNumero] = useState("");
  const [docTocado, setDocTocado] = useState(false);
  const [obs, setObs] = useState("");
  const [data, setData] = useState(hojeISO());
  const [enviando, setEnviando] = useState(false);
  const codigoRef = useRef<HTMLInputElement>(null);
  const ordemRef = useRef(0);

  const chave = devolucao?.devolucao_id ?? "";
  const [chaveAtual, setChaveAtual] = useState("");
  if (open && chave && chave !== chaveAtual) {
    setChaveAtual(chave);
    setEtapa(1);
    setCondicao(COND_QUARENTENA);
    setCodigo("");
    setQtdBip("1");
    setCodigoErro(false);
    setContados([]);
    setUltimoChave(null);
    setDocNumero(devolucao?.nf ?? "");
    setDocTocado(false);
    setObs("");
    setData(hojeISO());
  }

  // NF sugerida da view, enquanto o operador não editar
  const nfSugerida = funilQ.data?.nf_retorno_sugerida ?? null;
  useEffect(() => {
    if (open && nfSugerida && !docTocado) setDocNumero(nfSugerida);
  }, [open, nfSugerida, docTocado]);

  useEffect(() => {
    if (!ultimoChave) return;
    const t = setTimeout(() => setUltimoChave(null), 1200);
    return () => clearTimeout(t);
  }, [ultimoChave, contados]);

  useEffect(() => {
    if (open && etapa === 1) setTimeout(() => codigoRef.current?.focus(), 50);
  }, [open, etapa]);

  const itensPorSku = useMemo(() => {
    const m = new Map<string, { nome: string | null; pendente: number }>();
    for (const it of devolucao?.itens ?? []) {
      const p = m.get(it.sku);
      m.set(it.sku, {
        nome: it.nome_comercial ?? p?.nome ?? null,
        pendente: (p?.pendente ?? 0) + Number(it.qtd_pendente ?? 0),
      });
    }
    return m;
  }, [devolucao]);

  const rotuloCond = (c: string) => condicoes.find((x) => x.codigo === c)?.rotulo ?? c;

  async function bipar() {
    const cod = codigo.trim();
    if (!cod || resolvendo) return;
    const qtd = Number(qtdBip);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      toast.error("Quantidade inválida.");
      return;
    }
    setResolvendo(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      let prod: { sku: string; nome_comercial: string | null } | null = null;
      const porEan = await sb.from("sncf_produtos").select("sku,nome_comercial").eq("ean", cod).limit(1);
      if (porEan.error) throw porEan.error;
      prod = porEan.data?.[0] ?? null;
      if (!prod) {
        const esc = cod.replace(/[\\%_]/g, (c) => `\\${c}`);
        const porSku = await sb.from("sncf_produtos").select("sku,nome_comercial").ilike("sku", esc).limit(1);
        if (porSku.error) throw porSku.error;
        prod = porSku.data?.[0] ?? null;
      }
      if (!prod) {
        setCodigoErro(true);
        toast.error(`Código não encontrado: ${cod}`);
        codigoRef.current?.select();
        return;
      }
      const p = prod;
      const k = `${p.sku}|${condicao}`;
      ordemRef.current += 1;
      const ordem = ordemRef.current;
      setContados((prev) => {
        const ex = prev.find((c) => `${c.sku}|${c.condicao}` === k);
        if (ex) return prev.map((c) => (c === ex ? { ...c, qtd: c.qtd + qtd, ordem } : c));
        return [...prev, { sku: p.sku, condicao, qtd, nome: p.nome_comercial ?? itensPorSku.get(p.sku)?.nome ?? null, ordem }];
      });
      setUltimoChave(k);
      setCodigoErro(false);
      setCodigo("");
      setQtdBip("1");
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setResolvendo(false);
      setTimeout(() => codigoRef.current?.focus(), 0);
    }
  }

  const contadosOrdenados = useMemo(
    () => [...contados].sort((a, b) => b.ordem - a.ordem),
    [contados],
  );
  const totalUnid = contados.reduce((s, c) => s + c.qtd, 0);
  const totalSkus = new Set(contados.map((c) => c.sku)).size;

  // ---------- Confronto ----------
  const confronto = useMemo(() => {
    const skus = new Set<string>([...itensPorSku.keys(), ...contados.map((c) => c.sku)]);
    const linhas = [...skus].map((sku) => {
      const dec = itensPorSku.get(sku);
      const contado = contados.filter((c) => c.sku === sku).reduce((s, c) => s + c.qtd, 0);
      const pendente = dec?.pendente ?? 0;
      let situacao: { txt: string; cls: string };
      if (!dec) situacao = { txt: "Fora da devolução", cls: "bg-destructive/10 text-destructive border-destructive/30" };
      else if (contado === 0) situacao = { txt: "Não voltou", cls: "bg-muted text-muted-foreground" };
      else if (contado === pendente) situacao = { txt: "OK", cls: "bg-success/10 text-success border-success/30" };
      else if (contado < pendente) situacao = { txt: `Faltou ${pendente - contado}`, cls: "bg-warning/10 text-warning border-warning/30" };
      else situacao = { txt: `Sobrou ${contado - pendente}`, cls: "bg-destructive/10 text-destructive border-destructive/30" };
      const nome = dec?.nome ?? contados.find((c) => c.sku === sku)?.nome ?? null;
      return { sku, nome, pendente, contado, declarado: !!dec, situacao };
    });
    linhas.sort((a, b) => a.sku.localeCompare(b.sku));

    const envio: { sku: string; qtd: number; condicao: string }[] = [];
    const sobras: string[] = [];
    const fora: string[] = [];
    for (const l of linhas) {
      const partes = contados.filter((c) => c.sku === l.sku);
      if (!l.declarado) {
        if (l.contado > 0) fora.push(`${l.sku} (${l.contado} un)`);
        continue;
      }
      let excedente = Math.max(0, l.contado - l.pendente);
      if (excedente > 0) sobras.push(`sobrou ${excedente} un de ${l.sku}`);
      // cortar primeiro de quarentena, depois das demais
      const ordenadas = [...partes].sort((a, b) =>
        a.condicao === COND_QUARENTENA ? -1 : b.condicao === COND_QUARENTENA ? 1 : 0,
      );
      const qtdPor = new Map<string, number>();
      for (const p of ordenadas) qtdPor.set(p.condicao, (qtdPor.get(p.condicao) ?? 0) + p.qtd);
      for (const [cond, q] of qtdPor) {
        const corte = Math.min(q, excedente);
        excedente -= corte;
        qtdPor.set(cond, q - corte);
      }
      for (const [cond, q] of qtdPor) if (q > 0) envio.push({ sku: l.sku, qtd: q, condicao: cond });
    }
    const partesTxt: string[] = [];
    if (sobras.length) partesTxt.push(sobras.join("; "));
    if (fora.length) partesTxt.push(`fora da devolução: ${fora.join(", ")}`);
    const textoDiv = partesTxt.length ? `Divergências da conferência cega: ${partesTxt.join("; ")}` : "";
    return { linhas, envio, textoDiv };
  }, [itensPorSku, contados]);

  async function registrar() {
    if (!devolucao || confronto.envio.length === 0) return;
    setEnviando(true);
    try {
      const obsFinal = [obs.trim(), confronto.textoDiv].filter(Boolean).join("\n") || null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: res, error } = await (supabase as any).rpc("registrar_retorno_devolucao", {
        p_devolucao_id: devolucao.devolucao_id,
        p_rows: confronto.envio,
        p_doc_numero: docNumero.trim() || null,
        p_obs: obsFinal,
        p_data: new Date(`${data}T12:00:00`).toISOString(),
      });
      if (error) throw error;
      if (res && res.ok === false) throw new Error(String(res.erro ?? res.message ?? "Recusado pelo banco"));
      const unid = res?.unidades ?? confronto.envio.reduce((s, r) => s + r.qtd, 0);
      toast.success(
        `Retorno registrado em ${res?.devolucao ?? devolucao.devolucao_numero}: ${unid} unidade(s)` +
          (res?.aviso ? ` — ${String(res.aviso)}` : ""),
        { duration: res?.aviso ? 10000 : 4000 },
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["vw_devolucao_funil"] }),
        qc.invalidateQueries({ queryKey: ["vw_quarentena_fila"] }),
        qc.invalidateQueries({ queryKey: ["devolucao-retorno-pendente"] }),
        qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("vw_estoque") }),
        qc.invalidateQueries({ queryKey: ["estoque-centro"] }),
        qc.invalidateQueries({ queryKey: ["estoque-posicao"] }),
      ]);
      onOpenChange(false);
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setEnviando(false);
    }
  }

  const centroTexto = funilQ.isLoading ? "carregando…" : funilQ.data?.destino_codigo ?? "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>Devolução {devolucao?.devolucao_numero ?? "—"}</span>
            <span className="text-sm font-normal text-muted-foreground">
              Pedido {devolucao?.id_externo ?? "—"}
            </span>
            {devolucao?.canal === "b2c" && <Badge variant="outline" className="font-normal">B2C</Badge>}
            <Badge variant="secondary" className="font-normal">
              {etapa === 1 ? "1 · Contagem cega" : "2 · Confronto"}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Conferência cega por bipagem · retorno parcial é permitido.
          </DialogDescription>
        </DialogHeader>

        {(funilQ.error || condQ.error) && (
          <Alert variant="destructive">
            <AlertDescription>{formatError(funilQ.error ?? condQ.error)}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>NF de devolução</Label>
            <Input
              value={docNumero}
              onChange={(e) => { setDocTocado(true); setDocNumero(e.target.value); }}
              placeholder="Número da NF de devolução"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Centro</Label>
            <div className="h-10 flex items-center px-3 rounded-md border bg-muted/40 text-sm font-mono">
              {centroTexto}
            </div>
          </div>
        </div>

        {etapa === 1 ? (
          <>
            <div className="sticky top-0 z-10 bg-background py-2 space-y-3 border-b">
              <ToggleGroup
                type="single"
                value={condicao}
                onValueChange={(v) => { if (v) { setCondicao(v); codigoRef.current?.focus(); } }}
                className="justify-start flex-wrap"
              >
                {condicoes.map((c) => (
                  <ToggleGroupItem key={c.codigo} value={c.codigo} variant="outline" size="sm">
                    {c.rotulo}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1.5">
                  <Label>Código (EAN ou SKU)</Label>
                  <div className="relative">
                    <ScanBarcode className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      ref={codigoRef}
                      autoFocus
                      value={codigo}
                      onChange={(e) => { setCodigo(e.target.value); setCodigoErro(false); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void bipar(); } }}
                      className={`pl-8 font-mono ${codigoErro ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      placeholder="Bipe ou digite e tecle Enter"
                    />
                  </div>
                </div>
                <div className="w-20 space-y-1.5">
                  <Label>Qtd</Label>
                  <Input
                    inputMode="numeric"
                    className="text-center"
                    value={qtdBip}
                    onChange={(e) => setQtdBip(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void bipar(); } }}
                  />
                </div>
                {resolvendo && <Loader2 className="h-4 w-4 animate-spin mb-3" />}
              </div>
            </div>

            <div className="rounded-md border max-h-[40vh] overflow-y-auto overflow-x-auto">
              <Table className="w-full table-fixed min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">SKU</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="w-[120px]">Condição</TableHead>
                    <TableHead className="w-[80px] text-center">Qtd</TableHead>
                    <TableHead className="w-[44px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contadosOrdenados.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                        Nada contado ainda. Bipe o primeiro item.
                      </TableCell>
                    </TableRow>
                  )}
                  {contadosOrdenados.map((c) => {
                    const k = `${c.sku}|${c.condicao}`;
                    const fora = !itensPorSku.has(c.sku);
                    return (
                      <TableRow key={k} className={ultimoChave === k ? "bg-primary/10 transition-colors" : "transition-colors"}>
                        <TableCell className="px-2 font-mono text-xs whitespace-nowrap overflow-hidden text-ellipsis">{c.sku}</TableCell>
                        <TableCell className="px-2 text-sm min-w-0">
                          <span className="block truncate" title={c.nome ?? undefined}>{c.nome ?? "—"}</span>
                          {fora && (
                            <Badge variant="outline" className="mt-0.5 text-[10px] border-destructive/40 text-destructive">
                              fora da devolução
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="px-2 text-xs truncate">{rotuloCond(c.condicao)}</TableCell>
                        <TableCell className="px-2 text-center">
                          <Input
                            inputMode="numeric"
                            className="w-16 h-8 text-center mx-auto"
                            value={String(c.qtd)}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              setContados((prev) => prev.map((x) =>
                                `${x.sku}|${x.condicao}` === k ? { ...x, qtd: Number.isFinite(n) && n >= 0 ? n : x.qtd } : x));
                            }}
                          />
                        </TableCell>
                        <TableCell className="px-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setContados((prev) => prev.filter((x) => `${x.sku}|${x.condicao}` !== k))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <DialogFooter>
              <span className="mr-auto text-xs text-muted-foreground">
                {totalSkus} SKU(s) · {totalUnid} unidade(s) contadas
              </span>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button onClick={() => setEtapa(2)} disabled={contados.length === 0}>
                Finalizar contagem
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="rounded-md border max-h-[40vh] overflow-y-auto overflow-x-auto">
              <Table className="w-full table-fixed min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">SKU</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="w-[76px] text-center">Pendente</TableHead>
                    <TableHead className="w-[76px] text-center">Contado</TableHead>
                    <TableHead className="w-[130px]">Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {confronto.linhas.map((l) => (
                    <TableRow key={l.sku}>
                      <TableCell className="px-2 font-mono text-xs whitespace-nowrap overflow-hidden text-ellipsis">{l.sku}</TableCell>
                      <TableCell className="px-2 text-sm min-w-0">
                        <span className="block truncate" title={l.nome ?? undefined}>{l.nome ?? "—"}</span>
                      </TableCell>
                      <TableCell className="px-2 text-center tabular-nums">{l.declarado ? l.pendente : "—"}</TableCell>
                      <TableCell className="px-2 text-center tabular-nums font-medium">{l.contado}</TableCell>
                      <TableCell className="px-2">
                        <Badge variant="outline" className={`font-normal ${l.situacao.cls}`}>{l.situacao.txt}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {confronto.textoDiv && (
              <Alert>
                <AlertDescription className="text-xs">
                  Será anexado à observação: <span className="font-medium">{confronto.textoDiv}</span>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label>Observação do operador</Label>
              <Textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Estado da mercadoria, embalagem…"
                rows={2}
              />
            </div>

            {confronto.envio.length === 0 && (
              <p className="text-xs text-destructive">
                Nenhum item válido para registrar — nada contado pertence ao pendente desta devolução.
              </p>
            )}

            <DialogFooter>
              <span className="mr-auto text-xs text-muted-foreground">
                Enviar: {confronto.envio.reduce((s, r) => s + r.qtd, 0)} unidade(s)
              </span>
              <Button variant="outline" onClick={() => setEtapa(1)} disabled={enviando}>
                Voltar à contagem
              </Button>
              <Button onClick={registrar} disabled={confronto.envio.length === 0 || enviando} className="gap-2">
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                Registrar retorno
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
