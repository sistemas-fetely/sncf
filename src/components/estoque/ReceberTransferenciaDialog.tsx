import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { CodProduto } from "@/components/produto/CodProduto";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCheck, Download, FileText, Loader2, Upload, X } from "lucide-react";
import { gerarFolhaContagemPdf, gerarPlanilhaConferencia, validarPlanilhaConferencia } from "@/components/estoque/conferenciaPlanilha";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { formatError } from "@/lib/format-error";
import { hojeISO } from "@/lib/data";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { LeitorCodigoBarras, type LeituraCodigo } from "@/components/estoque/LeitorCodigoBarras";

/* eslint-disable @typescript-eslint/no-explicit-any */
const CENTRO_XPM = "XPM-SC";

interface ItemEnviado {
  sku: string;
  enviado: number;
  cod: string | null;
  nome: string | null;
}
interface Divergencia { sku: string; enviado: number; recebido: number; avariado: number; diferenca: number }
interface Resultado {
  ok?: boolean;
  itens?: number;
  divergencias?: Divergencia[];
  contagens_iniciais?: number;
  erro?: string;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  pedidoId: string;
  titulo: string;
  destinoCodigo: string | null;
  destinoRotulo?: string | null;
  onRecebido: () => void;
}

export function ReceberTransferenciaDialog({ aberto, onFechar, pedidoId, titulo, destinoCodigo, destinoRotulo, onRecebido }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const [confirmarTudo, setConfirmarTudo] = useState(false);
  const [data, setData] = useState(hojeISO());
  const [centro, setCentro] = useState("SITE-SP");
  const [recebido, setRecebido] = useState<Record<string, string>>({});
  const [avariado, setAvariado] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [bipando, setBipando] = useState(false);
  const [cega, setCega] = useState(true);
  const [etapa, setEtapa] = useState<"grade" | "recontagem" | "revisao">("grade");
  const [listaRecontagem, setListaRecontagem] = useState<string[]>([]);
  const [recontagem, setRecontagem] = useState<Record<string, string>>({});
  const [mostrarFaltas, setMostrarFaltas] = useState(false);
  const [errosPlanilha, setErrosPlanilha] = useState<string[]>([]);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const itensQ = useQuery({
    queryKey: ["receber-trs-itens", pedidoId],
    enabled: aberto && !!pedidoId,
    queryFn: async (): Promise<ItemEnviado[]> => {
      const { data: it, error } = await (supabase as any)
        .from("pedido_itens").select("sku, quantidade").eq("pedido_id", pedidoId);
      if (error) throw error;
      const soma = new Map<string, number>();
      ((it ?? []) as { sku: string; quantidade: number }[]).forEach((i) =>
        soma.set(i.sku, (soma.get(i.sku) ?? 0) + Number(i.quantidade ?? 0)));
      const skus = [...soma.keys()];
      let prods: { sku: string; cod_cadastro: string | null; nome_comercial: string | null }[] = [];
      if (skus.length) {
        const { data: p, error: e2 } = await (supabase as any)
          .from("sncf_produtos").select("sku, cod_cadastro, nome_comercial").in("sku", skus);
        if (e2) throw e2;
        prods = p ?? [];
      }
      const mapa = new Map(prods.map((p) => [p.sku, p]));
      return skus.map((sku) => ({
        sku,
        enviado: soma.get(sku) ?? 0,
        cod: mapa.get(sku)?.cod_cadastro ?? null,
        nome: mapa.get(sku)?.nome_comercial ?? null,
      }));
    },
  });

  const centrosQ = useQuery({
    queryKey: ["receber-trs-centros"],
    enabled: aberto && !destinoCodigo,
    queryFn: async () => {
      const { data: c, error } = await (supabase as any)
        .from("centro_distribuicao").select("codigo,nome,rotulo_curto")
        .eq("ativo", true).neq("codigo", CENTRO_XPM).order("codigo");
      if (error) throw error;
      return (c ?? []) as { codigo: string; nome: string | null; rotulo_curto: string | null }[];
    },
  });

  useEffect(() => {
    if (itensQ.isError) toast.error(formatError(itensQ.error));
  }, [itensQ.isError, itensQ.error]);
  useEffect(() => {
    if (centrosQ.isError) toast.error(formatError(centrosQ.error));
  }, [centrosQ.isError, centrosQ.error]);

  const itens = itensQ.data ?? [];

  // Reinicia ao abrir / ao chegar os itens.
  useEffect(() => {
    setErrosPlanilha([]);
    if (!aberto) return;
    setResultado(null);
    setConfirmarTudo(false);
    setBipando(false);
    setCega(true);
    setEtapa("grade");
    setListaRecontagem([]);
    setRecontagem({});
    setMostrarFaltas(false);
    setRecebido({});
    setAvariado({});
    setData(hojeISO());
  }, [aberto, pedidoId]);

  async function baixarPlanilha() {
    try {
      const blob = await gerarPlanilhaConferencia(itens, { titulo, pedidoId, destino: destinoCodigo ?? centro ?? "" }, { cega });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `conferencia_${titulo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(formatError(e));
    }
  }

  async function baixarFolhaPdf() {
    try {
      const blob = await gerarFolhaContagemPdf(itens, { titulo, destino: destinoRotulo ?? destinoCodigo ?? centro ?? "" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contagem_cega_${titulo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(formatError(e));
    }
  }

  async function importarPlanilha(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as unknown[][];
      const r = validarPlanilhaConferencia(matriz, itens, pedidoId);
      if (r.erros.length) {
        setErrosPlanilha(r.erros);
        return;
      }
      setBipando(false);
      setRecebido(r.recebido);
      setAvariado(r.avariado);
      setErrosPlanilha([]);
      if (cega) {
        toast.success("Planilha importada — revise e clique em Conferir contagem");
        return;
      }
      const comDif = itens.filter((i) => Number(r.recebido[i.sku]) + Number(r.avariado[i.sku]) !== i.enviado || Number(r.avariado[i.sku]) > 0).length;
      toast.success(`Planilha importada — ${comDif} itens com diferença. Revise e confirme.`);
    } catch (e) {
      toast.error(formatError(e));
    }
  }
  useEffect(() => {
    if (!aberto || cega) return;
    tudoConforme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, itensQ.data]);

  function tudoConforme() {
    const r: Record<string, string> = {};
    const a: Record<string, string> = {};
    (itensQ.data ?? []).forEach((i) => { r[i.sku] = String(i.enviado); a[i.sku] = "0"; });
    setRecebido(r);
    setAvariado(a);
  }

  /** Conferir tudo: preenche TODAS as linhas com o enviado (sobrescreve o que foi digitado). Não grava nada. */
  function preencherTudo() {
    setEtapa("grade");
    setListaRecontagem([]);
    setRecontagem({});
    setMostrarFaltas(false);
    if (cega) setCega(false);
    tudoConforme();
  }

  const num = (v: string | undefined) => (v === undefined || v === "" || isNaN(Number(v)) ? 0 : Number(v));

  function alternarBipando(v: boolean) {
    setBipando(v);
    if (v) {
      const r: Record<string, string> = {};
      itens.forEach((i) => { r[i.sku] = "0"; });
      setRecebido(r);
    } else if (cega) {
      setRecebido({});
    } else {
      tudoConforme();
    }
  }
  function alternarCega(v: boolean) {
    setCega(v);
    setEtapa("grade");
    setListaRecontagem([]);
    setRecontagem({});
    setMostrarFaltas(false);
    if (bipando) return;
    if (v) { setRecebido({}); setAvariado({}); } else tudoConforme();
  }
  const vazio = (v: string | undefined) => v === undefined || v.trim() === "";
  const semContagem = cega ? itens.filter((i) => vazio(recebido[i.sku])) : [];
  /** Linhas já digitadas com valor diferente do enviado — sobrescritas pelo "Conferir tudo". */
  const linhasJaDigitadas = itens.filter((i) => !vazio(recebido[i.sku]) && num(recebido[i.sku]) !== i.enviado).length;
  /** Recebido efetivo: a recontagem substitui a 1ª contagem do item. */
  const efetivo = (sku: string) =>
    listaRecontagem.includes(sku) && !vazio(recontagem[sku]) ? num(recontagem[sku]) : num(recebido[sku]);
  const divergentesRevisao = itens.filter((i) => efetivo(i.sku) + num(avariado[i.sku]) !== i.enviado);
  const faltaRecontagem = listaRecontagem.filter((s) => vazio(recontagem[s])).length;

  function conferirContagem() {
    if (semContagem.length) { setMostrarFaltas(true); return; }
    setMostrarFaltas(false);
    const div = itens.filter((i) => num(recebido[i.sku]) + num(avariado[i.sku]) !== i.enviado).map((i) => i.sku);
    setListaRecontagem(div);
    setRecontagem((s) => Object.fromEntries(div.map((k) => [k, s[k] ?? ""])));
    setEtapa(div.length ? "recontagem" : "revisao");
  }
  const somarRecebido = (sku: string, delta: number) =>
    setRecebido((s) => ({ ...s, [sku]: String(Math.max(0, num(s[sku]) + delta)) }));
  const validarSku = (sku: string) => (itens.some((i) => i.sku === sku) ? null : "Item fora desta transferência");
  const totalEnviado = itens.reduce((s, i) => s + i.enviado, 0);
  const totalRecebido = itens.reduce((s, i) => s + num(recebido[i.sku]), 0);

  const alterados = useMemo(
    () => itens.filter((i) => num(recebido[i.sku]) !== i.enviado || num(avariado[i.sku]) > 0),
    [itens, recebido, avariado],
  );

  const receber = useMutation({
    mutationFn: async () => {
      const { data: r, error } = await (supabase as any).rpc("fn_trs_receber_destino", {
        p_pedido_id: pedidoId,
        p_data: data,
        p_itens: (cega || bipando ? itens : alterados).map((i) => ({ sku: i.sku, recebido: cega ? efetivo(i.sku) : num(recebido[i.sku]), avariado: num(avariado[i.sku]) })),
        p_centro_destino: destinoCodigo ? null : centro,
      });
      if (error) throw error;
      const res = (r ?? {}) as Resultado;
      if (res.ok === false) throw new Error(res.erro ?? "O recebimento não foi registrado.");
      return res;
    },
    onSuccess: (res) => {
      setResultado(res);
      toast.success("Recebimento registrado.");
      onRecebido();
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const invalido = itens.some((i) => num(recebido[i.sku]) < 0 || num(avariado[i.sku]) < 0);
  const futuro = data > hojeISO() || !data;
  const semDestino = !destinoCodigo && !centro;

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Receber no destino — {titulo}</DialogTitle>
          <DialogDescription>
            Confirme o que chegou na loja. O saldo contábil já foi movido pela nota de transferência — aqui fica a conferência física e a diferença.
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {resultado.itens ?? 0} itens conferidos · {(resultado.divergencias ?? []).length} com diferença · {resultado.contagens_iniciais ?? 0} contagens iniciais
            </p>
            {(resultado.divergencias ?? []).length > 0 && (
              <div className="max-h-64 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead className="text-right">Enviado</TableHead>
                      <TableHead className="text-right">Recebido</TableHead>
                      <TableHead className="text-right">Avariado</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(resultado.divergencias ?? []).map((d) => (
                      <TableRow key={d.sku}>
                        <TableCell><CodProduto chave={d.sku} variant="compacto" /></TableCell>
                        <TableCell className="text-right tabular-nums">{d.enviado}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.recebido}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.avariado}</TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">{d.diferenca}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <DialogFooter>
              <Button onClick={onFechar}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : cega && etapa === "recontagem" ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">{listaRecontagem.length} itens precisam ser recontados. Conte de novo só estes.</p>
            <div className="max-h-[360px] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="w-28 text-right">Recontagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.filter((i) => listaRecontagem.includes(i.sku)).map((i) => (
                    <TableRow key={i.sku}>
                      <TableCell><CodProduto chave={i.sku} variant="compacto" /></TableCell>
                      <TableCell className="text-sm">{i.nome ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" min={0} className="h-8 w-24 text-right tabular-nums"
                          aria-label={`Recontagem de ${i.sku}`}
                          value={recontagem[i.sku] ?? ""}
                          onChange={(e) => setRecontagem((s) => ({ ...s, [i.sku]: e.target.value }))} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {faltaRecontagem > 0 && <p className="text-sm text-muted-foreground">Faltam {faltaRecontagem} itens sem recontagem.</p>}
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setEtapa("grade")}>Voltar</Button>
              <Button type="button" disabled={faltaRecontagem > 0} onClick={() => setEtapa("revisao")}>Revisar</Button>
            </DialogFooter>
          </div>
        ) : cega && etapa === "revisao" ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {itens.length - divergentesRevisao.length} itens OK · {divergentesRevisao.length} com diferença confirmada
            </p>
            {divergentesRevisao.length > 0 && (
              <div className="max-h-[360px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Enviado</TableHead>
                      <TableHead className="text-right">1ª contagem</TableHead>
                      <TableHead className="text-right">Recontagem</TableHead>
                      <TableHead className="text-right">Avariado</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {divergentesRevisao.map((i) => (
                      <TableRow key={i.sku}>
                        <TableCell><CodProduto chave={i.sku} variant="compacto" /></TableCell>
                        <TableCell className="text-sm">{i.nome ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.enviado}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(recebido[i.sku])}</TableCell>
                        <TableCell className="text-right tabular-nums">{listaRecontagem.includes(i.sku) ? num(recontagem[i.sku]) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(avariado[i.sku])}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-destructive">
                          {efetivo(i.sku) + num(avariado[i.sku]) - i.enviado}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setEtapa(listaRecontagem.length ? "recontagem" : "grade")}>Voltar</Button>
              <BotaoGuardado
                slug="acao.estoque_contagem_registrar"
                rotuloAcao="Confirmar recebimento"
                contexto={{ pedido_id: pedidoId }}
                disabled={receber.isPending || itens.length === 0 || invalido || futuro || semDestino}
                onClick={() => setConfirmando(true)}
              >
                {receber.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar recebimento
              </BotaoGuardado>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {!destinoCodigo && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Centro de destino</label>
                  <Select value={centro} onValueChange={setCentro}>
                    <SelectTrigger><SelectValue placeholder="Selecione o centro" /></SelectTrigger>
                    <SelectContent>
                      {(centrosQ.data ?? []).map((c) => (
                        <SelectItem key={c.codigo} value={c.codigo}>{c.rotulo_curto ?? c.nome ?? c.codigo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-sm font-medium">Data de recebimento</label>
                <Input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Switch checked={bipando} onCheckedChange={alternarBipando} disabled={itens.length === 0} />
                  Conferir bipando
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Switch checked={cega} onCheckedChange={alternarCega} />
                  Contagem cega
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={itens.length === 0}
                    onClick={() => (cega ? setConfirmarTudo(true) : preencherTudo())}>
                    <CheckCheck className="mr-2 h-4 w-4" />Conferir tudo
                  </Button>
                  {cega && (
                    <Button type="button" variant="outline" size="sm" disabled={itens.length === 0} onClick={() => void baixarFolhaPdf()}>
                      <FileText className="mr-2 h-4 w-4" />Folha de contagem (PDF)
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" disabled={itens.length === 0} onClick={() => void baixarPlanilha()}>
                    <Download className="mr-2 h-4 w-4" />Baixar planilha
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={itens.length === 0} onClick={() => arquivoRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />Importar planilha
                  </Button>
                  <input ref={arquivoRef} type="file" accept=".xlsx" className="hidden"
                    onChange={(e) => void importarPlanilha(e.target)} />
                </div>
              </div>
              {errosPlanilha.length > 0 && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="font-medium">Planilha não importada — {errosPlanilha.length} erro(s). Nada foi alterado na grade.</p>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Fechar erros" onClick={() => setErrosPlanilha([])}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <ul className="max-h-40 list-disc space-y-0.5 overflow-auto pl-5">
                    {errosPlanilha.map((e, k) => <li key={k}>{e}</li>)}
                  </ul>
                </div>
              )}
              {bipando && (
                <>
                  <LeitorCodigoBarras
                    onLeitura={(l: LeituraCodigo) => somarRecebido(l.sku, l.unidades)}
                    onDesfazer={(l: LeituraCodigo) => somarRecebido(l.sku, -l.unidades)}
                    validarSku={validarSku}
                  />
                  <p className="text-sm text-muted-foreground tabular-nums">{cega ? `Bipado ${totalRecebido} peças` : `Bipado ${totalRecebido} de ${totalEnviado} peças`}</p>
                </>
              )}
            </div>

            {itensQ.isLoading ? (
              <div className="flex justify-center p-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : itensQ.isError ? (
              <p className="text-sm text-destructive">Falha ao carregar itens: {formatError(itensQ.error)}</p>
            ) : (
              <div className="max-h-[360px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Produto</TableHead>
                      {!cega && <TableHead className="text-right">Enviado</TableHead>}
                      <TableHead className="w-28 text-right">Recebido</TableHead>
                      <TableHead className="w-28 text-right">Avariado</TableHead>
                      {!cega && <TableHead className="text-right">Diferença</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((i) => {
                      const dif = num(recebido[i.sku]) + num(avariado[i.sku]) - i.enviado;
                      return (
                        <TableRow key={i.sku} className={cn(
                          cega ? mostrarFaltas && vazio(recebido[i.sku]) && "bg-destructive/10" : num(recebido[i.sku]) !== i.enviado && "bg-warning/10",
                        )}>
                          <TableCell><CodProduto chave={i.sku} variant="compacto" /></TableCell>
                          <TableCell className="text-sm">{i.nome ?? "—"}</TableCell>
                          {!cega && <TableCell className="text-right tabular-nums">{i.enviado}</TableCell>}
                          <TableCell className="text-right">
                            <Input type="number" min={0} className="h-8 w-24 text-right tabular-nums"
                              aria-label={`Recebido de ${i.sku}`}
                              value={recebido[i.sku] ?? ""}
                              onChange={(e) => setRecebido((s) => ({ ...s, [i.sku]: e.target.value }))} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input type="number" min={0} className="h-8 w-24 text-right tabular-nums"
                              aria-label={`Avariado de ${i.sku}`}
                              value={avariado[i.sku] ?? ""}
                              onChange={(e) => setAvariado((s) => ({ ...s, [i.sku]: e.target.value }))} />
                          </TableCell>
                          {!cega && (
                            <TableCell className={cn("text-right tabular-nums font-medium", dif === 0 ? "text-success" : "text-destructive")}>
                              {dif}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {cega && mostrarFaltas && semContagem.length > 0 && (
              <p className="text-sm text-destructive">Faltam {semContagem.length} itens sem contagem</p>
            )}
            <DialogFooter className="gap-2">
              {!cega && <Button type="button" variant="outline" onClick={() => { setBipando(false); tudoConforme(); }}>Tudo conforme</Button>}
              <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
              {cega ? (
                <Button type="button" disabled={itens.length === 0 || invalido || futuro || semDestino} onClick={conferirContagem}>
                  Conferir contagem
                </Button>
              ) : (
              <BotaoGuardado
                slug="acao.estoque_contagem_registrar"
                rotuloAcao="Confirmar recebimento"
                contexto={{ pedido_id: pedidoId }}
                disabled={receber.isPending || itens.length === 0 || invalido || futuro || semDestino}
                onClick={() => setConfirmando(true)}
              >
                {receber.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar recebimento
              </BotaoGuardado>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar chegada física</AlertDialogTitle>
            <AlertDialogDescription>
              Confirma que a carga do {titulo} chegou fisicamente em {destinoRotulo ?? destinoCodigo ?? centro}? As peças passam a vender.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmando(false); receber.mutate(); }}>Sim, chegou</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmarTudo} onOpenChange={setConfirmarTudo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferir tudo</AlertDialogTitle>
            <AlertDialogDescription>
              Isso desliga a contagem cega e preenche tudo com a quantidade enviada. Continuar?
              {linhasJaDigitadas > 0 && (
                ` ${linhasJaDigitadas === 1 ? "1 linha já digitada será sobrescrita." : `${linhasJaDigitadas} linhas já digitadas serão sobrescritas.`}`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmarTudo(false); preencherTudo(); }}>
              Preencher tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

export default ReceberTransferenciaDialog;
