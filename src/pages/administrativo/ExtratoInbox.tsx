import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Inbox, Loader2, Search, Play, ArrowLeftRight } from "lucide-react";
import { Link } from "react-router-dom";

import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Conta = { id: string; nome_exibicao: string };
type Mov = {
  id: string;
  conta_bancaria_id: string;
  data_transacao: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
  contraparte_nome: string | null;
  contraparte_documento: string | null;
  referencia_pedido: string | null;
  tipo_meio: string | null;
  classe: string | null;
};

type ContaMap = Record<string, string>;
type Filtro = "abertos" | "classificados" | "creditos_abertos" | "debitos_abertos";

const CLASSES = [
  { value: "tarifa_bancaria", label: "Tarifa bancária" },
  { value: "rendimento", label: "Rendimento" },
  { value: "imposto", label: "Imposto" },
  { value: "transferencia_interna", label: "Transferência interna" },
  { value: "ajuste_adquirencia", label: "Ajuste adquirência" },
  { value: "recebivel_titulo", label: "Recebível — Título" },
  { value: "recebivel_cartao", label: "Recebível — Cartão" },
  { value: "despesa_cpr", label: "Despesa (CPR)" },
  { value: "outro_classificado", label: "Outro (classificado)" },
];

function formatDoc(doc: string | null): string {
  if (!doc) return "—";
  const d = doc.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return doc;
}

function mesInicioFim(): { ini: string; fim: string } {
  const hoje = new Date();
  const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().substring(0, 10);
  return { ini: iso(ini), fim: iso(fim) };
}

export default function ExtratoInbox() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { ini, fim } = mesInicioFim();
  const [filtros, setFiltros] = useState<Set<Filtro>>(new Set(["abertos"]));
  const [contaId, setContaId] = useState<string>("todas");
  const [de, setDe] = useState(ini);
  const [ate, setAte] = useState(fim);
  const [busca, setBusca] = useState("");
  const [selecionada, setSelecionada] = useState<Mov | null>(null);
  const [classe, setClasse] = useState<string>("");
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aplicandoRegras, setAplicandoRegras] = useState(false);

  async function aplicarRegras() {
    setAplicandoRegras(true);
    try {
      const { data, error } = await sb.rpc("fn_regras_aplicar");
      if (error) throw error;
      const n = typeof data === "number" ? data : (data ?? 0);
      toast.success(`${n} movimentações classificadas`);
      qc.invalidateQueries({ queryKey: ["extrato-inbox"] });
    } catch (e) {
      toast.error("Falha: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAplicandoRegras(false);
    }
  }


  const { data: contas = [] } = useQuery({
    queryKey: ["inbox-contas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao")
        .eq("ativo", true)
        .order("nome_exibicao");
      if (error) throw error;
      return (data || []) as Conta[];
    },
  });
  const contaMap = useMemo<ContaMap>(() => {
    const m: ContaMap = {};
    for (const c of contas) m[c.id] = c.nome_exibicao;
    return m;
  }, [contas]);

  const { data: movs = [], isLoading } = useQuery({
    queryKey: ["extrato-inbox", contaId, de, ate],
    queryFn: async () => {
      let q = sb
        .from("movimentacoes_bancarias")
        .select(
          "id, conta_bancaria_id, data_transacao, descricao, valor, tipo, contraparte_nome, contraparte_documento, referencia_pedido, tipo_meio, classe"
        )
        .gte("data_transacao", de)
        .lte("data_transacao", ate)
        .order("data_transacao", { ascending: false })
        .limit(1000);
      if (contaId !== "todas") q = q.eq("conta_bancaria_id", contaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Mov[];
    },
  });

  const kpis = useMemo(() => {
    let abertos = 0, classificados = 0, cAb = 0, dAb = 0;
    for (const m of movs) {
      if (m.classe == null) {
        abertos++;
        if (m.tipo === "credito") cAb++;
        else if (m.tipo === "debito") dAb++;
      } else classificados++;
    }
    return { abertos, classificados, cAb, dAb };
  }, [movs]);

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return movs.filter((m) => {
      // filtros KPI (múltiplos com OR)
      const cond: boolean[] = [];
      if (filtros.has("abertos")) cond.push(m.classe == null);
      if (filtros.has("classificados")) cond.push(m.classe != null);
      if (filtros.has("creditos_abertos")) cond.push(m.classe == null && m.tipo === "credito");
      if (filtros.has("debitos_abertos")) cond.push(m.classe == null && m.tipo === "debito");
      const passaFiltro = cond.length === 0 || cond.some(Boolean);
      if (!passaFiltro) return false;
      if (!b) return true;
      const hay = `${m.descricao} ${m.contraparte_nome || ""} ${m.contraparte_documento || ""} ${m.referencia_pedido || ""}`.toLowerCase();
      return hay.includes(b);

    });
  }, [movs, filtros, busca]);

  function toggle(f: Filtro) {
    const n = new Set(filtros);
    if (n.has(f)) n.delete(f);
    else n.add(f);
    if (n.size === 0) n.add("abertos");
    setFiltros(n);
  }

  async function salvarClasse() {
    if (!selecionada || !classe || !user) return;
    setSalvando(true);
    try {
      const patch: Record<string, unknown> = {
        classe,
        classe_definida_por: "manual_p5",
      };
      if (nota.trim()) {
        // Anexar nota à descrição existente (não temos coluna nota dedicada)
        patch.descricao = `${selecionada.descricao} · [nota: ${nota.trim()}]`;
      }
      const { error } = await sb
        .from("movimentacoes_bancarias")
        .update(patch)
        .eq("id", selecionada.id);
      if (error) throw error;
      toast.success("Classificado");
      setSelecionada(null);
      setClasse("");
      setNota("");
      qc.invalidateQueries({ queryKey: ["extrato-inbox"] });
    } catch (e) {
      toast.error("Falha: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6 max-w-[1400px]">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="h-6 w-6 text-admin" />
            Inbox Extrato
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Movimentações bancárias abertas para classificação manual.
          </p>
        </div>

        {/* KPIs toggle */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { k: "abertos" as Filtro, label: "Abertos", val: kpis.abertos },
            { k: "classificados" as Filtro, label: "Classificados", val: kpis.classificados },
            { k: "creditos_abertos" as Filtro, label: "Créditos abertos", val: kpis.cAb },
            { k: "debitos_abertos" as Filtro, label: "Débitos abertos", val: kpis.dAb },
          ].map((c) => (
            <button
              key={c.k}
              onClick={() => toggle(c.k)}
              className={`text-left rounded-md border p-3 transition ${
                filtros.has(c.k)
                  ? "border-admin bg-admin/10"
                  : "border-border hover:border-admin/40"
              }`}
            >
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="text-2xl font-bold">{c.val}</div>
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
            <div className="min-w-[220px]">
              <Label>Conta</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome_exibicao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>De</Label>
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            </div>
            <div>
              <Label>Até</Label>
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            </div>
            <div className="flex-1 min-w-[220px]">
              <Label>Busca (descrição/contraparte)</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Contraparte</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Ref. pedido</TableHead>
                  <TableHead>Meio</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={10} className="text-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin inline" />
                  </TableCell></TableRow>
                )}
                {!isLoading && filtrados.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">
                    Nada por aqui
                  </TableCell></TableRow>
                )}
                {filtrados.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDateBR(m.data_transacao)}</TableCell>
                    <TableCell className="text-xs">{contaMap[m.conta_bancaria_id] || "—"}</TableCell>
                    <TableCell className="max-w-[280px]">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="truncate cursor-help">{m.descricao}</div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md whitespace-pre-wrap">{m.descricao}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-xs max-w-[180px] truncate" title={m.contraparte_nome || ""}>
                      {m.contraparte_nome || "—"}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{formatDoc(m.contraparte_documento)}</TableCell>
                    <TableCell>
                      {m.referencia_pedido ? (
                        <Badge variant="outline" className="font-mono text-[10px]">{m.referencia_pedido}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {m.tipo_meio ? <Badge variant="outline">{m.tipo_meio}</Badge> : "—"}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${m.tipo === "credito" ? "text-success" : "text-destructive"}`}>
                      {formatBRL(m.valor)}
                    </TableCell>
                    <TableCell>
                      {m.classe ? <Badge className="bg-admin text-admin-foreground">{m.classe}</Badge> : "—"}
                    </TableCell>
                    <TableCell>
                      {m.classe == null && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelecionada(m);
                            setClasse("");
                            setNota("");
                          }}
                        >
                          Classificar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selecionada} onOpenChange={(v) => !v && setSelecionada(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Classificar movimentação</DialogTitle>
            {selecionada && (
              <DialogDescription>
                {formatDateBR(selecionada.data_transacao)} · {formatBRL(selecionada.valor)} ·{" "}
                {selecionada.descricao}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Classe</Label>
              <Select value={classe} onValueChange={setClasse}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {CLASSES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nota (opcional)</Label>
              <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelecionada(null)} disabled={salvando}>Cancelar</Button>
            <Button
              onClick={salvarClasse}
              disabled={salvando || !classe}
              className="bg-admin hover:bg-admin/90 text-admin-foreground"
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
