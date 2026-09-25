/**
 * Ciclo mensal de comissão — onde o financeiro OPERA o mês.
 *
 * dia 01 fecha · dia 05 envia o extrato · até o dia 10 chega a NF · dia 15 paga.
 * Fonte única: view `vw_comissao_extrato_ciclo`. Nenhuma regra é recalculada aqui.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Loader2, Mail, Paperclip, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { fmtBRL, fmtCompetencia, fmtData } from "../comissoes/fmt";
import {
  BUCKET_DOCUMENTO, ORDEM_ETAPA, TIPO_DOCUMENTO, competenciaCorrente, competenciasRecentes,
  datasDaCompetencia, lerCiclo, type LinhaCiclo,
} from "./cicloMensal";

type Res = Record<string, any>;

async function rpc(nome: string, args: Record<string, unknown>): Promise<Res> {
  const { data, error } = await (supabase as any).rpc(nome, args);
  if (error) throw new Error(formatError(error));
  return (data ?? {}) as Res;
}

function num(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function seloEtapa(l: LinhaCiclo) {
  const e = l.etapa ?? "";
  if (e === "0_zerado") return { txt: "Zerado (estorno)", cls: "bg-muted text-muted-foreground border-border" };
  if (e === "1_fechado") return { txt: "Fechado", cls: "bg-muted text-foreground border-border" };
  if (e === "2_enviado") return { txt: `Enviado em ${fmtData(l.enviado_em)}`, cls: "bg-info/15 text-info border-info/30" };
  if (e === "3_documento_recebido") return { txt: "NF recebida", cls: "bg-info/15 text-info border-info/30" };
  if (e === "3b_documento_divergente") return { txt: "NF divergente", cls: "bg-warning/15 text-warning border-warning/30" };
  if (e === "4_documento_conferido") return { txt: "NF conferida", cls: "bg-success/15 text-success border-success/30" };
  if (e === "5_titulo_gerado") return { txt: "Título gerado", cls: "bg-success/15 text-success border-success/30" };
  if (e === "6_pago") return { txt: `Pago em ${fmtData(l.pago_em)}`, cls: "bg-success/15 text-success border-success/30" };
  return { txt: e || "—", cls: "bg-muted text-muted-foreground border-border" };
}

/* ---------------- abrir o arquivo do documento ---------------- */
async function abrirArquivo(caminho: string) {
  try {
    const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTO).createSignedUrl(caminho, 300);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("O servidor não devolveu o endereço do arquivo.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  } catch (e) {
    toast.error(`Falha ao abrir o arquivo: ${formatError(e)}`);
  }
}

/* ---------------- registrar NF recebida por e-mail ---------------- */
function RegistrarNfDialog({ alvo, onFechar, onFeito }: { alvo: LinhaCiclo | null; onFechar: () => void; onFeito: () => void }) {
  const [tipo, setTipo] = useState("nf_servico");
  const [numero, setNumero] = useState("");
  const [emissao, setEmissao] = useState("");
  const [valor, setValor] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [rodando, setRodando] = useState(false);

  useEffect(() => {
    if (alvo) {
      setTipo("nf_servico");
      setNumero("");
      setEmissao(new Date().toISOString().slice(0, 10));
      setValor(String(num(alvo.valor_total).toFixed(2)));
      setArquivo(null);
    }
  }, [alvo]);

  async function salvar() {
    if (!alvo) return;
    const v = Number(valor.replace(",", "."));
    if (!numero.trim()) return toast.error("Informe o número do documento.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(emissao)) return toast.error("Informe a data de emissão.");
    if (!Number.isFinite(v) || v <= 0) return toast.error("Informe um valor válido.");
    setRodando(true);
    let caminho: string | null = null;
    try {
      if (arquivo) {
        const comp = String(alvo.competencia ?? "").slice(0, 7);
        const nome = arquivo.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
        caminho = `${alvo.vendedor_id}/${comp}/${Date.now()}_${nome}`;
        const { error } = await supabase.storage.from(BUCKET_DOCUMENTO).upload(caminho, arquivo, {
          contentType: arquivo.type || undefined,
          upsert: false,
        });
        if (error) throw new Error(`Falha ao gravar o arquivo: ${formatError(error)}`);
      }
      const r = await rpc("fn_comissao_documento_registrar", {
        p_extrato_id: alvo.extrato_id,
        p_tipo: tipo,
        p_numero: numero.trim(),
        p_data_emissao: emissao,
        p_valor: v,
        p_arquivo_path: caminho,
      });
      if (r.ok === false) {
        if (caminho) await supabase.storage.from(BUCKET_DOCUMENTO).remove([caminho]);
        throw new Error(r.erro ?? JSON.stringify(r));
      }
      toast.success(r.mensagem ?? "Documento registrado.", {
        description: r.status === "divergente"
          ? `Valor informado ${fmtBRL(v)} · diferença ${fmtBRL(r.diferenca)}`
          : undefined,
      });
      onFeito();
      onFechar();
    } catch (e) {
      toast.error(`Não foi possível registrar: ${formatError(e)}`);
    } finally {
      setRodando(false);
    }
  }

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && !rodando && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar nota fiscal</DialogTitle>
          <DialogDescription>
            {alvo && `${alvo.representante} · ${fmtCompetencia(alvo.competencia)} · extrato de ${fmtBRL(alvo.valor_total)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nf_servico">NF de serviço</SelectItem>
                <SelectItem value="rpa">RPA</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Número</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex.: 1345" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Data de emissão</Label>
              <Input type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Valor do documento</Label>
            <Input value={valor} onChange={(e) => setValor(e.target.value)} className="tabular-nums" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Arquivo (opcional)</Label>
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.xml" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={rodando}>Cancelar</Button>
          <Button onClick={salvar} disabled={rodando}>
            {rodando && <Loader2 className="h-4 w-4 animate-spin" />}Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- decidir documento divergente ---------------- */
function DecidirDialog({ alvo, decisao, onFechar, onFeito }: {
  alvo: LinhaCiclo | null; decisao: "aceitar" | "recusar"; onFechar: () => void; onFeito: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [rodando, setRodando] = useState(false);
  useEffect(() => { if (alvo) setMotivo(""); }, [alvo, decisao]);

  const informado = num(alvo?.documento_valor);
  const extrato = num(alvo?.valor_total);

  async function decidir() {
    if (!alvo?.documento_id) return;
    if (motivo.trim().length < 10) return toast.error("O motivo precisa de pelo menos 10 caracteres.");
    setRodando(true);
    try {
      const r = await rpc("fn_comissao_documento_decidir", {
        p_documento_id: alvo.documento_id,
        p_decisao: decisao,
        p_motivo: motivo.trim(),
      });
      if (r.ok === false) throw new Error(r.erro ?? JSON.stringify(r));
      toast.success(r.mensagem ?? (decisao === "aceitar" ? "Documento aceito." : "Documento recusado."));
      onFeito();
      onFechar();
    } catch (e) {
      toast.error(`Não foi possível decidir: ${formatError(e)}`);
    } finally {
      setRodando(false);
    }
  }

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && !rodando && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{decisao === "aceitar" ? "Aceitar a nota divergente?" : "Recusar a nota divergente?"}</DialogTitle>
          <DialogDescription>{alvo?.representante} · {fmtCompetencia(alvo?.competencia)}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 rounded-md border p-3 text-sm">
          <div><div className="text-xs text-muted-foreground">Valor informado</div><div className="tabular-nums font-medium">{fmtBRL(informado)}</div></div>
          <div><div className="text-xs text-muted-foreground">Valor do extrato</div><div className="tabular-nums font-medium">{fmtBRL(extrato)}</div></div>
          <div><div className="text-xs text-muted-foreground">Diferença</div><div className="tabular-nums font-medium text-warning">{fmtBRL(informado - extrato)}</div></div>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Motivo (obrigatório, mínimo 10 caracteres)</Label>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={rodando}>Cancelar</Button>
          <Button variant={decisao === "recusar" ? "destructive" : "default"} onClick={decidir} disabled={rodando}>
            {rodando && <Loader2 className="h-4 w-4 animate-spin" />}{decisao === "aceitar" ? "Aceitar" : "Recusar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- aba ---------------- */
type ResultadoEnvio = {
  enviados: number;
  falhas: { extrato_id: string; representante: string | null; erro: string }[];
  ignorados: { extrato_id: string; representante: string | null; motivo: string }[];
};

export function AbaCicloMensal() {
  const qc = useQueryClient();
  const [competencia, setCompetencia] = useState(competenciaCorrente());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmarEnvio, setConfirmarEnvio] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null);
  const [registrar, setRegistrar] = useState<LinhaCiclo | null>(null);
  const [decidir, setDecidir] = useState<{ linha: LinhaCiclo; decisao: "aceitar" | "recusar" } | null>(null);
  const [gerar, setGerar] = useState<LinhaCiclo | null>(null);
  const [gerando, setGerando] = useState(false);
  const [falhaCpr, setFalhaCpr] = useState<{ erro: string; acao?: string } | null>(null);

  const q = useQuery({
    queryKey: ["comissao-ciclo", competencia],
    queryFn: () => lerCiclo(competencia),
  });
  useEffect(() => {
    if (q.error) toast.error(`Falha ao carregar o ciclo: ${formatError(q.error)}`);
  }, [q.error]);

  const linhas = q.data ?? [];

  // Pré-seleção: quem está em "1_fechado" com valor > 0.
  useEffect(() => {
    setSel(new Set(linhas.filter((l) => l.etapa === "1_fechado" && num(l.valor_total) > 0).map((l) => l.extrato_id)));
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const datas = useMemo(() => {
    const base = datasDaCompetencia(competencia);
    const primeira = linhas[0];
    return {
      fechamento: base.fechamento,
      enviar_ate: primeira?.enviar_ate ?? base.enviar_ate,
      documento_ate: primeira?.documento_ate ?? base.documento_ate,
      pagar_ate: primeira?.pagar_ate ?? base.pagar_ate,
    };
  }, [competencia, linhas]);

  const hoje = new Date().toISOString().slice(0, 10);
  const etapas = [
    { rot: "Fechamento", data: datas.fechamento },
    { rot: "Envio até", data: datas.enviar_ate },
    { rot: "NF até", data: datas.documento_ate },
    { rot: "Pagamento", data: datas.pagar_ate },
  ];
  const idxAtual = Math.max(0, etapas.findIndex((e) => e.data >= hoje));
  const etapaAtual = etapas.findIndex((e) => e.data >= hoje) === -1 ? etapas.length - 1 : idxAtual;

  const contadores = useMemo(() => {
    const ord = (l: LinhaCiclo) => ORDEM_ETAPA[l.etapa ?? ""] ?? 0;
    return [
      ["Fechados", linhas.length],
      ["Enviados", linhas.filter((l) => l.enviado_em).length],
      ["NF recebida", linhas.filter((l) => l.documento_id).length],
      ["NF conferida", linhas.filter((l) => ord(l) >= 4).length],
      ["Título gerado", linhas.filter((l) => l.cpr_id).length],
      ["Pagos", linhas.filter((l) => l.pago_em).length],
    ] as const;
  }, [linhas]);

  const selecionadas = linhas.filter((l) => sel.has(l.extrato_id));
  const totalSel = selecionadas.reduce((s, l) => s + num(l.valor_total), 0);

  function alternar(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function invalidar() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["comissao-ciclo"] }),
      qc.invalidateQueries({ queryKey: ["comissao-extratos-fechados"] }),
      qc.invalidateQueries({ queryKey: ["comissao-extrato"] }),
    ]);
  }

  async function enviar(ids: string[], silencioso = false) {
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("enviar-extrato-comissao", { body: { extrato_ids: ids } });
      if (error) {
        let det = formatError(error);
        try { const t = await (error as any).context?.text?.(); if (t) det = JSON.parse(t).error ?? t; } catch { /* mantém */ }
        throw new Error(det);
      }
      const r = (data ?? {}) as ResultadoEnvio;
      if (silencioso) {
        if (r.falhas?.length) throw new Error(r.falhas[0].erro);
        toast.success("E-mail reenviado.");
      } else {
        setResultado(r);
      }
      setConfirmarEnvio(false);
      await invalidar();
    } catch (e) {
      toast.error(`Falha ao enviar: ${formatError(e)}`);
    } finally {
      setEnviando(false);
    }
  }

  async function gerarTitulo() {
    if (!gerar) return;
    setGerando(true);
    try {
      const r = await rpc("fn_comissao_gerar_cpr", { p_extrato_id: gerar.extrato_id });
      if (r.ok !== true) {
        setGerar(null);
        setFalhaCpr({ erro: r.erro ?? JSON.stringify(r), acao: r.acao });
        return;
      }
      toast.success(`Título a pagar gerado: ${fmtBRL(r.valor ?? gerar.valor_total)}`, {
        description: `Vencimento ${fmtData(r.vencimento ?? r.data_vencimento ?? gerar.pagar_ate)}`,
      });
      await invalidar();
      setGerar(null);
    } catch (e) {
      toast.error(`Falha ao gerar título: ${formatError(e)}`);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* topo */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Competência</Label>
          <Select value={competencia} onValueChange={setCompetencia}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {competenciasRecentes().map((c) => (
                <SelectItem key={c} value={c}>{fmtCompetencia(`${c}-01`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="bg-gold text-background hover:bg-gold/90"
          disabled={sel.size === 0 || enviando}
          onClick={() => setConfirmarEnvio(true)}
        >
          <Send className="h-4 w-4" />Enviar extratos{sel.size > 0 ? ` (${sel.size})` : ""}
        </Button>
      </div>

      <Card><CardContent className="flex flex-wrap items-center gap-x-2 gap-y-1 p-4 text-sm">
        {etapas.map((e, i) => (
          <span key={e.rot} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">·</span>}
            <span className={cn("tabular-nums", i === etapaAtual ? "font-medium text-gold" : "text-muted-foreground")}>
              {e.rot} {fmtData(e.data)}
            </span>
          </span>
        ))}
      </CardContent></Card>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {contadores.map(([rot, v]) => (
          <Card key={rot}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{rot}</div>
            <div className="mt-1 text-lg font-medium tabular-nums">{v}</div>
          </CardContent></Card>
        ))}
      </div>

      <Card><CardContent className="p-0">
        {q.isLoading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : linhas.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nenhum extrato fechado em {fmtCompetencia(`${competencia}-01`)}. O fechamento acontece automaticamente no dia 1.
          </p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-8" />
              <TableHead>Representante</TableHead>
              <TableHead className="text-right">Valor do extrato</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Pendência</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {linhas.map((l) => {
                const selo = seloEtapa(l);
                const ord = ORDEM_ETAPA[l.etapa ?? ""] ?? 0;
                const podeRegistrar = !l.documento_id && ord >= 1 && ord < 4;
                const divergente = l.etapa === "3b_documento_divergente";
                const podeGerar = l.etapa === "4_documento_conferido";
                const podeReenviar = !l.cpr_id && ord >= 1;
                return (
                  <TableRow key={l.extrato_id}>
                    <TableCell>
                      <Checkbox checked={sel.has(l.extrato_id)} onCheckedChange={() => alternar(l.extrato_id)}
                        aria-label={`Selecionar ${l.representante ?? ""}`} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {l.representante ?? "—"}
                      <div className="text-xs text-muted-foreground">{l.email_contato ?? "sem e-mail de contato"}</div>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmtBRL(l.valor_total)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("whitespace-nowrap", selo.cls)}>{selo.txt}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.documento_id ? (
                        <div className="space-y-0.5">
                          <div>
                            {TIPO_DOCUMENTO[l.tipo_documento ?? ""] ?? l.tipo_documento} {l.documento_numero}
                            {" · "}<span className="tabular-nums">{fmtBRL(l.documento_valor)}</span>
                          </div>
                          {l.documento_arquivo && (
                            <button type="button" className="inline-flex items-center gap-1 underline"
                              onClick={() => abrirArquivo(l.documento_arquivo as string)}>
                              <Paperclip className="h-3 w-3" />Abrir arquivo
                            </button>
                          )}
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className={cn("text-xs", l.pendencia ? (divergente ? "text-destructive" : "text-warning") : "text-muted-foreground")}>
                      {l.pendencia || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        {podeRegistrar && (
                          <Button size="sm" variant="outline" onClick={() => setRegistrar(l)}>Registrar NF</Button>
                        )}
                        {divergente && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setDecidir({ linha: l, decisao: "aceitar" })}>Aceitar</Button>
                            <Button size="sm" variant="outline" onClick={() => setDecidir({ linha: l, decisao: "recusar" })}>Recusar</Button>
                          </>
                        )}
                        {podeGerar && (
                          <Button size="sm" variant="outline" onClick={() => setGerar(l)}>
                            <FileText className="h-4 w-4" />Gerar título a pagar
                          </Button>
                        )}
                        {podeReenviar && (
                          <Button size="sm" variant="ghost" disabled={enviando} onClick={() => enviar([l.extrato_id], true)}>
                            <Mail className="h-4 w-4" />Reenviar e-mail
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>

      {/* confirmação do envio em lote */}
      <Dialog open={confirmarEnvio} onOpenChange={(o) => !o && !enviando && setConfirmarEnvio(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar {selecionadas.length} extrato(s) por e-mail?</DialogTitle>
            <DialogDescription>
              Cada representante recebe o extrato de {fmtCompetencia(`${competencia}-01`)} e o pedido da nota fiscal.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {selecionadas.map((l) => (
              <div key={l.extrato_id} className="flex justify-between gap-3 border-b py-1 last:border-b-0">
                <span>{l.representante}</span>
                <span className="tabular-nums">{fmtBRL(l.valor_total)}</span>
              </div>
            ))}
          </div>
          <p className="text-sm font-medium">Total: <span className="tabular-nums">{fmtBRL(totalSel)}</span></p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarEnvio(false)} disabled={enviando}>Cancelar</Button>
            <Button className="bg-gold text-background hover:bg-gold/90" disabled={enviando}
              onClick={() => enviar(selecionadas.map((l) => l.extrato_id))}>
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* resultado do envio */}
      <Dialog open={!!resultado} onOpenChange={(o) => !o && setResultado(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resultado do envio</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>{resultado?.enviados ?? 0} extrato(s) enviado(s).</p>
            {(resultado?.ignorados ?? []).length > 0 && (
              <div>
                <p className="font-medium">Ignorados ({resultado?.ignorados.length})</p>
                {resultado?.ignorados.map((i) => (
                  <p key={i.extrato_id} className="text-muted-foreground">{i.representante ?? i.extrato_id}: {i.motivo}</p>
                ))}
              </div>
            )}
            {(resultado?.falhas ?? []).length > 0 && (
              <div>
                <p className="font-medium text-destructive">Falhas ({resultado?.falhas.length})</p>
                {resultado?.falhas.map((f) => (
                  <p key={f.extrato_id} className="text-destructive">{f.representante ?? f.extrato_id}: {f.erro}</p>
                ))}
              </div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setResultado(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* gerar título */}
      <Dialog open={!!gerar} onOpenChange={(o) => !o && !gerando && setGerar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar título a pagar?</DialogTitle>
            <DialogDescription>
              {gerar && `${gerar.representante} · ${fmtCompetencia(gerar.competencia)} · ${fmtBRL(gerar.valor_total)} · pagar até ${fmtData(gerar.pagar_ate)}. O lançamento entra em contas a pagar.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGerar(null)} disabled={gerando}>Cancelar</Button>
            <Button onClick={gerarTitulo} disabled={gerando}>
              {gerando && <Loader2 className="h-4 w-4 animate-spin" />}Gerar título
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!falhaCpr} onOpenChange={(o) => !o && setFalhaCpr(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>O título não foi gerado</DialogTitle></DialogHeader>
          <p className="text-sm text-destructive">{falhaCpr?.erro}</p>
          {falhaCpr?.acao && <p className="text-sm"><span className="font-medium">O que fazer: </span>{falhaCpr.acao}</p>}
          <DialogFooter><Button variant="outline" onClick={() => setFalhaCpr(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <RegistrarNfDialog alvo={registrar} onFechar={() => setRegistrar(null)} onFeito={invalidar} />
      <DecidirDialog alvo={decidir?.linha ?? null} decisao={decidir?.decisao ?? "aceitar"}
        onFechar={() => setDecidir(null)} onFeito={invalidar} />
    </div>
  );
}
