import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError, rawMessage } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SkuCombobox, parsearColagem } from "@/components/transferencias/NovaTransferenciaForm";

const ORIGENS = [
  { codigo: "SITE-SP", rotulo: "Site SP" },
  { codigo: "FET-SP-SR", rotulo: "Show Room" },
];

interface Finalidade { codigo: string; rotulo: string; modo: string; exige_descricao: boolean }
interface Linha { sku: string; nome: string; quantidade: number }

export function BaixaUsoForm({ onCriado }: { onCriado: () => void }) {
  const qc = useQueryClient();
  const [origem, setOrigem] = useState("");
  const [finalidade, setFinalidade] = useState("");
  const [evento, setEvento] = useState("");
  const [descricao, setDescricao] = useState("");
  const [modo, setModo] = useState<"item" | "colar">("item");
  const [linhas, setLinhas] = useState<Linha[]>([{ sku: "", nome: "", quantidade: 1 }]);
  const [texto, setTexto] = useState("");
  const [erros, setErros] = useState<string[]>([]);
  const [processando, setProcessando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const finalidadesQ = useQuery({
    queryKey: ["baixa-finalidades"],
    queryFn: async (): Promise<Finalidade[]> => {
      const { data, error } = await supabase
        .from("baixa_finalidade")
        .select("codigo, rotulo, modo, exige_descricao")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Finalidade[];
    },
  });
  useEffect(() => {
    if (finalidadesQ.isError) toast.error(formatError(finalidadesQ.error));
  }, [finalidadesQ.isError, finalidadesQ.error]);
  const fin = (finalidadesQ.data ?? []).find((f) => f.codigo === finalidade);
  const comRetorno = fin?.modo === "com_retorno";

  const validas = linhas.filter((l) => l.sku && l.quantidade > 0);
  const skus = Array.from(new Set(validas.map((l) => l.sku))).sort();
  const dispQ = useQuery({
    queryKey: ["baixa-uso-disponivel", origem, skus.join("|")],
    enabled: !!origem && skus.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_estoque_centro")
        .select("sku, disponivel")
        .eq("centro", origem)
        .in("sku", skus);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.sku as string, Number(r.disponivel ?? 0)]));
    },
  });
  useEffect(() => {
    if (dispQ.isError) toast.error(formatError(dispQ.error));
  }, [dispQ.isError, dispQ.error]);

  const itens = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of validas) m.set(l.sku, (m.get(l.sku) ?? 0) + l.quantidade);
    return Array.from(m, ([sku, quantidade]) => ({ sku, quantidade }));
  }, [validas]);
  const pecas = itens.reduce((s, i) => s + i.quantidade, 0);
  const origemRotulo = ORIGENS.find((o) => o.codigo === origem)?.rotulo ?? origem;

  const pendencia =
    !origem ? "Escolha a origem."
    : !fin ? "Escolha a finalidade."
    : comRetorno && !evento.trim() ? "Informe o nome da feira/evento."
    : fin.exige_descricao && !descricao.trim() ? "Informe a descrição."
    : itens.length === 0 ? "Adicione ao menos um item."
    : linhas.some((l) => l.sku && !(l.quantidade > 0)) ? "Quantidade inválida em algum item."
    : null;

  async function processarColagem() {
    setProcessando(true);
    setErros([]);
    try {
      const partes = parsearColagem(texto);
      const ids = Array.from(new Set(partes.map((p) => p.sku)));
      if (!ids.length) { setErros(["Nada para processar."]); return; }
      const [a, b] = await Promise.all([
        supabase.from("sncf_produtos").select("sku, cod_cadastro, nome_completo").in("sku", ids),
        supabase.from("sncf_produtos").select("sku, cod_cadastro, nome_completo").in("cod_cadastro", ids),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      const mapa = new Map<string, { sku: string; nome: string }>();
      for (const p of [...(a.data ?? []), ...(b.data ?? [])]) {
        const v = { sku: p.sku as string, nome: (p.nome_completo as string) ?? "" };
        mapa.set(String(p.sku).toLowerCase(), v);
        if (p.cod_cadastro) mapa.set(String(p.cod_cadastro).toLowerCase(), v);
      }
      const novos: Linha[] = [];
      const errs: string[] = [];
      for (const p of partes) {
        const prod = mapa.get(p.sku.toLowerCase());
        const q = Number(p.qtdTexto.replace(",", "."));
        if (!prod) errs.push(`Código não encontrado: ${p.sku}`);
        else if (!Number.isInteger(q) || q <= 0) errs.push(`Quantidade inválida: ${p.sku} (${p.qtdTexto || "vazia"})`);
        else novos.push({ sku: prod.sku, nome: prod.nome, quantidade: q });
      }
      setErros(errs);
      if (errs.length === 0) {
        setLinhas((ls) => [...ls.filter((l) => l.sku), ...novos]);
        setTexto("");
        setModo("item");
        toast.success(`${novos.length} linhas adicionadas.`);
      }
    } catch (e) {
      toast.error(rawMessage(e));
    } finally {
      setProcessando(false);
    }
  }

  const criar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("fn_baixa_uso_criar", {
        p_origem: origem,
        p_finalidade: finalidade,
        p_itens: itens,
        p_descricao: descricao.trim() || undefined,
        p_evento: comRetorno ? evento.trim() : undefined,
      });
      if (error) throw error;
      return data as { codigo?: string } | null;
    },
    onSuccess: async (res) => {
      toast.success(`Baixa ${res?.codigo ?? ""} registrada.`.replace(/\s+\./, "."));
      setConfirmar(false);
      await qc.invalidateQueries({ queryKey: ["baixa-uso"] });
      onCriado();
    },
    onError: (e) => toast.error(rawMessage(e)),
  });

  const disp = dispQ.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Origem *</label>
          <Select value={origem} onValueChange={setOrigem}>
            <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
            <SelectContent>
              {ORIGENS.map((o) => <SelectItem key={o.codigo} value={o.codigo}>{o.rotulo}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Finalidade *</label>
          <Select value={finalidade} onValueChange={setFinalidade}>
            <SelectTrigger>
              <SelectValue placeholder={finalidadesQ.isLoading ? "Carregando…" : "Selecione a finalidade"} />
            </SelectTrigger>
            <SelectContent>
              {(finalidadesQ.data ?? []).map((f) => (
                <SelectItem key={f.codigo} value={f.codigo}>
                  <span className="flex flex-col">
                    <span>{f.rotulo}</span>
                    <span className="text-xs text-muted-foreground">{f.modo === "com_retorno" ? "Com retorno" : "Definitiva"}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {comRetorno && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Nome da feira/evento *</label>
          <Input value={evento} onChange={(e) => setEvento(e.target.value)} />
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            As peças ficam 'em evento' (não vendem) até você encerrar o evento informando o que voltou.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Descrição{fin?.exige_descricao ? " *" : ""}</label>
        <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
      </div>

      <div className="space-y-2">
        <Tabs value={modo} onValueChange={(v) => setModo(v as "item" | "colar")}>
          <TabsList>
            <TabsTrigger value="item">Item a item</TabsTrigger>
            <TabsTrigger value="colar">Colar da planilha</TabsTrigger>
          </TabsList>
        </Tabs>
        {modo === "colar" ? (
          <div className="space-y-2">
            <Textarea className="min-h-40 font-mono text-xs" placeholder={"SKU ou código\tquantidade"} value={texto} onChange={(e) => setTexto(e.target.value)} />
            {erros.length > 0 && <div className="text-xs text-destructive">{erros.map((e) => <div key={e}>{e}</div>)}</div>}
            <Button type="button" variant="outline" onClick={() => void processarColagem()} disabled={processando || !texto.trim()}>
              {processando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Adicionar itens
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="w-32 text-right">Disponível na origem</TableHead>
                <TableHead className="w-28">Quantidade</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l, i) => {
                const d = l.sku && origem ? disp?.get(l.sku) ?? (dispQ.isSuccess ? 0 : undefined) : undefined;
                return (
                  <TableRow key={i}>
                    <TableCell>
                      <SkuCombobox
                        value={l.sku}
                        nome={l.nome}
                        ariaLabel={`Produto da linha ${i + 1}`}
                        buscaEan
                        onSelect={(p) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, sku: p.sku, nome: p.nome_completo ?? "" } : x)))}
                        onEanExato={(p) => setLinhas((ls) => {
                          const k = ls.findIndex((x) => x.sku === p.sku);
                          if (k >= 0) return ls.map((x, j) => (j === k ? { ...x, quantidade: x.quantidade + 1 } : x));
                          return ls.map((x, j) => (j === i ? { sku: p.sku, nome: p.nome_completo ?? "", quantidade: 1 } : x));
                        })}
                      />
                      {l.nome && <p className="mt-1 truncate text-xs text-muted-foreground">{l.nome}</p>}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${d !== undefined && d < l.quantidade ? "text-destructive" : ""}`}>
                      {d === undefined ? "—" : d.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={1} value={l.quantidade}
                        onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, quantidade: Number(e.target.value) } : x)))} />
                    </TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon" aria-label="Remover linha"
                        onClick={() => setLinhas((ls) => (ls.length === 1 ? [{ sku: "", nome: "", quantidade: 1 }] : ls.filter((_, j) => j !== i)))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {modo === "item" && (
          <Button type="button" variant="outline" size="sm" onClick={() => setLinhas((ls) => [...ls, { sku: "", nome: "", quantidade: 1 }])}>
            <Plus className="mr-1 h-4 w-4" />Adicionar item
          </Button>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-muted-foreground">{pendencia ?? `${itens.length} SKUs · ${pecas.toLocaleString("pt-BR")} peças`}</span>
        <Button type="button" disabled={!!pendencia || criar.isPending} onClick={() => setConfirmar(true)}>Registrar baixa</Button>
      </div>

      <AlertDialog open={confirmar} onOpenChange={(v) => !criar.isPending && setConfirmar(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar baixa para uso</AlertDialogTitle>
            <AlertDialogDescription>
              Confirma tirar {pecas.toLocaleString("pt-BR")} peças do estoque vendável de {origemRotulo} para {fin?.rotulo}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={criar.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={criar.isPending} onClick={(e) => { e.preventDefault(); criar.mutate(); }}>
              {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sim, registrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
