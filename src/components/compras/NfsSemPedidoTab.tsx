import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, FilePlus2, Info, ChevronDown, ChevronRight, Ban } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { invalidarCompras } from "@/lib/compras/invalidar";
import { fmtMoeda } from "@/lib/compras/lancamento-utils";
import {
  classeClassificacao,
  filtrarPorClassificacao,
  rotuloClassificacao,
} from "@/lib/compras/classificacao-nfs";
import BotaoGuardado from "@/components/acesso/BotaoGuardado";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { InfoMetrica } from "@/components/metricas/InfoMetrica";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface StageRow {
  nfs_stage_id: string;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_data_emissao: string | null;
  fornecedor: string | null;
  fornecedor_razao_social: string | null;
  apelido: string | null;
  valor_no_xml: number | null;
  itens: number | null;
  classificacao: string | null;
  destino_codigo: string | null;
  itens_detalhe: {
    descricao: string | null; codigo: string | null; ncm: string | null;
    qtd: number | null; valor_unitario: number | null; valor_total: number | null;
  }[] | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = Record<string, any>;

const fmtData = (d: string | null) =>
  d ? new Date(`${d}`.slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const pick = (o: Obj | undefined, ...keys: string[]) => {
  for (const k of keys) if (o && o[k] != null) return o[k];
  return null;
};

function statusDePara(item: Obj | undefined): "mapeado" | "sem" | null {
  if (!item) return null;
  const s = String(item.status ?? "").toLowerCase();
  if (!s) return null;
  if (s === "mapeado") return "mapeado";
  if (s === "sem_depara") return "sem";
  return s.includes("sem") || s.includes("pend") || s.includes("falt") ? "sem" : "mapeado";
}

export default function NfsSemPedidoTab() {
  const qc = useQueryClient();
  const [alvo, setAlvo] = useState<StageRow | null>(null);
  const [previa, setPrevia] = useState<Obj | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [reclass, setReclass] = useState<StageRow | null>(null);
  const [destinoNovo, setDestinoNovo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erroReclass, setErroReclass] = useState<string | null>(null);
  const [salvandoReclass, setSalvandoReclass] = useState(false);

  const q = useQuery({
    queryKey: ["nfs-stage-mercadoria-pendente", "sem-pedido"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_nfs_stage_mercadoria_pendente")
        .select("*")
        .eq("ja_lancada", false)
        .order("nf_data_emissao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StageRow[];
    },
  });

  const destinos = useQuery({
    queryKey: ["nf-entrada-destino", "nao-compra"],
    enabled: !!reclass,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("nf_entrada_destino")
        .select("codigo, rotulo, entra_estoque, compoe_custo, ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Obj[]).filter((d) => !(d.entra_estoque && d.compoe_custo)) as
        { codigo: string; rotulo: string }[];
    },
  });

  async function abrirPrevia(r: StageRow) {
    setAlvo(r); setPrevia(null); setErro(null); setCarregando(true);
    try {
      const { data, error } = await (supabase as any).rpc("fn_pedido_retroativo_da_nf", {
        p_stage_id: r.nfs_stage_id, p_dry_run: true,
      });
      if (error) throw error;
      setPrevia(data as Obj);
    } catch (e) {
      const m = rawMessage(e); setErro(m); toast.error(m);
    } finally { setCarregando(false); }
  }

  async function confirmar() {
    if (!alvo) return;
    setEnviando(true); setErro(null);
    try {
      const { data, error } = await (supabase as any).rpc("fn_pedido_retroativo_da_nf", {
        p_stage_id: alvo.nfs_stage_id, p_dry_run: false,
      });
      if (error) throw error;
      const d = (data ?? {}) as Obj;
      const num = pick(d.pedido ?? d.pedido_criado ?? d, "numero_pedido", "numero", "pedido_numero")
        ?? pick(previa?.pedido_que_nasceria, "numero_pedido", "numero");
      toast.success(`Pedido retroativo ${num ?? ""} criado`.replace("  ", " "));
      invalidarCompras(qc);
      void q.refetch();
      setAlvo(null); setPrevia(null);
    } catch (e) {
      const m = rawMessage(e); setErro(m); toast.error(m);
    } finally { setEnviando(false); }
  }

  const ped: Obj = previa?.pedido_que_nasceria ?? {};
  const linhas: Obj[] = previa?.linhas_que_nasceriam ?? [];
  const itensVal: Obj[] = previa?.validacao_nf?.itens ?? [];
  const aviso = previa?.aviso;

  const deParaDaLinha = (l: Obj, i: number) => {
    const cod = pick(l, "ref_item", "codigo_nf", "codigo_fornecedor", "codigo");
    const it = itensVal.find((x) => cod != null && String(x.codigo_nf) === String(cod))
      ?? itensVal.find((x) => cod != null && x.ref_item != null && String(x.ref_item) === String(cod))
      ?? itensVal.find((x) => x.item_seq != null && x.item_seq === pick(l, "item_seq", "seq"))
      ?? itensVal[i];
    return statusDePara(it);
  };

  const todas = q.data ?? [];
  const rows = useMemo(
    () => filtrarPorClassificacao(todas, mostrarTodas),
    [todas, mostrarTodas],
  );

  const alternar = (id: string) =>
    setExpandidos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function abrirReclass(r: StageRow) {
    setReclass(r); setDestinoNovo(""); setMotivo(""); setErroReclass(null);
  }

  async function confirmarReclass() {
    if (!reclass) return;
    setSalvandoReclass(true); setErroReclass(null);
    try {
      const { error } = await (supabase as any).rpc("fn_nfs_stage_reclassificar", {
        p_stage_id: reclass.nfs_stage_id, p_destino_codigo: destinoNovo, p_motivo: motivo.trim(),
      });
      if (error) throw error;
      const rot = destinos.data?.find((d) => d.codigo === destinoNovo)?.rotulo ?? destinoNovo;
      toast.success(`NF ${reclass.nf_numero ?? ""} reclassificada: ${rot}`);
      await q.refetch();
      setReclass(null);
    } catch (e) {
      const m = rawMessage(e); setErroReclass(m); toast.error(m);
    } finally { setSalvandoReclass(false); }
  }

  if (q.isLoading) return <div className="p-4 text-sm text-muted-foreground">Carregando NFs…</div>;
  if (q.error) return <Alert variant="destructive"><AlertDescription>{rawMessage(q.error)}</AlertDescription></Alert>;


  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={mostrarTodas} onCheckedChange={setMostrarTodas} />
          Mostrar todas
        </label>
        <span className="text-xs text-muted-foreground">{rows.length} de {todas.length}</span>
      </div>
      {mostrarTodas && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>NFs de fornecedor novo/produto novo aparecem aqui — nasça o produto com o NCM da NF antes de gerar o pedido retroativo.</span>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="rounded-md border p-4 text-sm">
          {todas.length === 0
            ? "Nenhuma NF de entrada sem pedido."
            : "Nenhuma NF classificada como mercadoria ou possível mercadoria."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>NF</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="group">
                  <span className="inline-flex items-center gap-1">
                    Classificação
                    <InfoMetrica rotulo="Classificação">
                      Fornecedor conhecido (pedido ou de-para) + NCM batendo com produto nosso.
                    </InfoMetrica>
                  </span>
                </TableHead>
                <TableHead className="text-right">Valor no XML</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="w-48" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const aberto = expandidos.has(r.nfs_stage_id);
                const itensNf = Array.isArray(r.itens_detalhe) ? r.itens_detalhe : [];
                return (
                <Fragment key={r.nfs_stage_id}>
                <TableRow>
                  <TableCell className="w-8 px-2">
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6"
                      aria-label={aberto ? "Recolher itens" : "Expandir itens"}
                      onClick={() => alternar(r.nfs_stage_id)}
                    >
                      {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium">{r.nf_numero ?? "—"}{r.nf_serie ? `/${r.nf_serie}` : ""}</TableCell>
                  <TableCell>{fmtData(r.nf_data_emissao)}</TableCell>
                  <TableCell>{r.apelido ?? r.fornecedor ?? r.fornecedor_razao_social ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={classeClassificacao(r.classificacao)}>
                      {rotuloClassificacao(r.classificacao)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{fmtMoeda(r.valor_no_xml)}</TableCell>
                  <TableCell className="text-right">{r.itens ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <BotaoGuardado
                        slug="acao.nf_reclassificar_destino"
                        rotuloAcao="Reclassificar destino de documento (não é compra)"
                        contexto={{ nfs_stage_id: r.nfs_stage_id }}
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => abrirReclass(r)}
                      >
                        <Ban className="mr-1 h-4 w-4" />Não é compra…
                      </BotaoGuardado>
                      <BotaoGuardado
                        slug="acao.pedido_retroativo_nf"
                        rotuloAcao="Gerar pedido retroativo"
                        contexto={{ nfs_stage_id: r.nfs_stage_id }}
                        size="sm"
                        variant="outline"
                        onClick={() => void abrirPrevia(r)}
                      >
                        <FilePlus2 className="mr-1 h-4 w-4" />Gerar pedido retroativo
                      </BotaoGuardado>
                    </div>
                  </TableCell>
                </TableRow>
                {aberto && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell />
                    <TableCell colSpan={7} className="py-2">
                      {itensNf.length === 0 ? (
                        <div className="text-xs text-muted-foreground">Sem itens no XML.</div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="h-8 text-xs">Descrição</TableHead>
                              <TableHead className="h-8 text-xs">Código</TableHead>
                              <TableHead className="h-8 text-xs">NCM</TableHead>
                              <TableHead className="h-8 text-right text-xs">Qtd</TableHead>
                              <TableHead className="h-8 text-right text-xs">Vl. unit.</TableHead>
                              <TableHead className="h-8 text-right text-xs">Vl. total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {itensNf.map((it, i) => (
                              <TableRow key={i} className="text-xs">
                                <TableCell className="py-1">{it.descricao ?? "—"}</TableCell>
                                <TableCell className="py-1 font-mono">{it.codigo ?? "—"}</TableCell>
                                <TableCell className="py-1 font-mono">{it.ncm ?? "—"}</TableCell>
                                <TableCell className="py-1 text-right">{it.qtd ?? "—"}</TableCell>
                                <TableCell className="py-1 text-right">{fmtMoeda(it.valor_unitario)}</TableCell>
                                <TableCell className="py-1 text-right">{fmtMoeda(it.valor_total)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!alvo} onOpenChange={(v) => { if (!v && !enviando) { setAlvo(null); setPrevia(null); setErro(null); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Pedido retroativo — NF {alvo?.nf_numero}</DialogTitle>
          </DialogHeader>
          {carregando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Montando prévia…</div>}
          {previa && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 rounded-md border p-3 text-sm sm:grid-cols-5">
                <div><div className="text-muted-foreground">Pedido</div><b>{pick(ped, "numero_pedido", "numero") ?? "—"}</b></div>
                <div><div className="text-muted-foreground">Fornecedor</div><b>{pick(ped, "fornecedor", "fornecedor_nome", "apelido") ?? alvo?.apelido ?? alvo?.fornecedor ?? "—"}</b></div>
                <div><div className="text-muted-foreground">Itens</div><b>{pick(ped, "itens", "qtd_itens", "n_itens") ?? linhas.length}</b></div>
                <div><div className="text-muted-foreground">Valor</div><b>{fmtMoeda(pick(ped, "valor_nf", "valor_total", "valor", "total") ?? alvo?.valor_no_xml)}</b></div>
                <div><div className="text-muted-foreground">Status</div><b>{pick(ped, "status", "situacao") ?? "—"}</b></div>
              </div>
              <div className="max-h-72 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Custo unit.</TableHead>
                      <TableHead>De-para</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((l, i) => {
                      const st = deParaDaLinha(l, i);
                      return (
                        <TableRow key={i}>
                          <TableCell>{pick(l, "descricao_original", "descricao", "descricao_item", "produto_descricao", "ref_item") ?? "—"}</TableCell>
                          <TableCell className="text-right">{pick(l, "qtd", "quantidade") ?? "—"}</TableCell>
                          <TableCell className="text-right">{fmtMoeda(pick(l, "custo_unitario", "valor_unit", "preco_unitario", "custo_unit"))}</TableCell>
                          <TableCell>
                            {st === "mapeado" && <Badge variant="outline" className="border-success/40 bg-success/10 text-success">mapeado</Badge>}
                            {st === "sem" && <Badge variant="outline" className="border-warning bg-warning/10 text-warning-strong">sem de-para</Badge>}
                            {st === null && "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {aviso && <Alert className="border-warning bg-warning/10"><AlertDescription>{typeof aviso === "string" ? aviso : JSON.stringify(aviso)}</AlertDescription></Alert>}
            </div>
          )}
          {erro && <Alert variant="destructive"><AlertDescription className="whitespace-pre-wrap break-all">{erro}</AlertDescription></Alert>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvo(null)} disabled={enviando}>Cancelar</Button>
            <Button onClick={() => void confirmar()} disabled={!previa || enviando || carregando}>
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar pedido retroativo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
