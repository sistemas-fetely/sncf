import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronDown, ChevronRight, Loader2, Link2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { apelidoParceiro, nomeCanonico } from "@/lib/parceiros/nome";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Orfa = {
  nsu: string;
  classe: string;
  severidade: number;
  pedido_id: string | null;
  id_externo: string | null;
  cliente: string | null;
  valor: number;
  estagio: string | null;
  detalhe: string;
  acao: string | null;
};

type Venda = {
  nsu: string;
  data_venda: string;
  produto: string | null;
  modalidade: string | null;
  parcelas: number | null;
  valor_bruto: number;
  mdr: number | null;
  terminal: string | null;
};

type Candidato = {
  pedido_id: string;
  id_externo: string | null;
  cliente: string;
  apelido: string | null;
  total_titulos: number;
};

const num = (v: unknown) => Number(v ?? 0);

function useVendasSemPedido() {
  const orfas = useQuery({
    queryKey: ["auditoria-cartao-sem-pedido"],
    queryFn: async () => {
      const { data, error } = await sb.from("vw_auditoria_cartao_sem_pedido").select("*");
      if (error) throw error;
      return (data || []) as Orfa[];
    },
  });

  const nsus = (orfas.data || []).map((o) => o.nsu);

  const vendas = useQuery({
    queryKey: ["auditoria-cartao-sem-pedido-vendas", nsus.join(",")],
    enabled: nsus.length > 0,
    queryFn: async () => {
      const { data, error } = await sb
        .from("safrapay_venda")
        .select("nsu, data_venda, produto, modalidade, parcelas, valor_bruto, mdr, terminal")
        .in("nsu", nsus);
      if (error) throw error;
      const mapa: Record<string, Venda> = {};
      for (const v of (data || []) as Venda[]) mapa[v.nsu] = v;
      return mapa;
    },
  });

  return { orfas, vendas };
}

async function buscarCandidatos(termo: string): Promise<Candidato[]> {
  const q = termo.trim();
  if (q.length < 2) return [];

  const { data: parceiros, error: errP } = await sb
    .from("parceiros_comerciais")
    .select("id")
    .or(`razao_social.ilike.%${q}%,nome_fantasia.ilike.%${q}%`)
    .limit(20);
  if (errP) throw errP;
  const ids = ((parceiros || []) as { id: string }[]).map((p) => p.id);

  const filtros = [`id_externo.ilike.%${q}%`];
  if (ids.length) filtros.push(`parceiro_id.in.(${ids.join(",")})`);

  const { data, error } = await sb
    .from("pedidos")
    .select(
      "id, id_externo, parceiros_comerciais(razao_social, nome_fantasia), titulo_a_receber(valor_atual, valor_bruto, tipo_pagamento, status)"
    )
    .or(filtros.join(","))
    .order("data_pedido", { ascending: false })
    .limit(10);
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data || []) as any[]).map((p) => {
    const titulos = (p.titulo_a_receber || []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t: any) => t.tipo_pagamento === "cartao" && !["cancelado", "devolvido"].includes(t.status)
    );
    return {
      pedido_id: p.id,
      id_externo: p.id_externo,
      cliente: nomeCanonico(p.parceiros_comerciais?.razao_social),
      apelido: apelidoParceiro(p.parceiros_comerciais?.razao_social, p.parceiros_comerciais?.nome_fantasia),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      total_titulos: titulos.reduce((s: number, t: any) => s + num(t.valor_atual ?? t.valor_bruto), 0),
    } as Candidato;
  });
}

function LinhaVenda({ o, v, onOk }: { o: Orfa; v?: Venda; onOk: () => void }) {
  const [termo, setTermo] = useState("");
  const [nota, setNota] = useState("");
  const [escolhido, setEscolhido] = useState<Candidato | null>(null);
  const [erroRpc, setErroRpc] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const candidatos = useQuery({
    queryKey: ["sem-pedido-candidatos", termo],
    enabled: termo.trim().length >= 2,
    queryFn: () => buscarCandidatos(termo),
  });

  const notaOk = nota.trim().length >= 5;

  async function vincular() {
    if (!escolhido) return;
    if (!notaOk) {
      toast.error("A nota é obrigatória e precisa ter ao menos 5 caracteres.");
      return;
    }
    setErroRpc(null);
    setEnviando(true);
    try {
      const { data, error } = await sb.rpc("vincular_venda_cartao_pedido", {
        p_nsu: o.nsu,
        p_pedido_id: escolhido.pedido_id,
        p_nota: nota.trim(),
      });
      if (error) throw error;
      const resp = (data ?? {}) as { ok?: boolean; error?: string; parcelas_carimbadas?: number };
      if (resp.ok !== true) {
        setErroRpc(resp.error || "A operação foi recusada e o banco não devolveu motivo.");
        return;
      }
      toast.success(
        `NSU ${o.nsu} vinculado ao ${escolhido.id_externo ?? "pedido"} · ${resp.parcelas_carimbadas ?? 0} parcelas carimbadas`
      );
      setNota("");
      setTermo("");
      setEscolhido(null);
      onOk();
    } catch (e) {
      setErroRpc(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="px-4 py-4 border-b last:border-b-0 space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-mono font-medium">{o.nsu}</span>
        <span>{v?.data_venda ? formatDateBR(v.data_venda) : "—"}</span>
        <Badge variant="outline">{[v?.produto, v?.modalidade].filter(Boolean).join(" · ") || o.estagio || "—"}</Badge>
        <span className="tabular-nums">{v?.parcelas ?? "—"}x</span>
        <span className="font-mono tabular-nums font-medium">{formatBRL(num(v?.valor_bruto ?? o.valor))}</span>
        <span className="text-xs text-muted-foreground tabular-nums">MDR {formatBRL(num(v?.mdr))}</span>
        {v?.terminal && <span className="text-xs text-muted-foreground">terminal {v.terminal}</span>}
      </div>

      <p className="text-sm text-muted-foreground">{o.detalhe}</p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="buscar pedido por número ou cliente…"
          />
          {candidatos.isFetching && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> buscando…
            </p>
          )}
          {candidatos.isError && (
            <p className="text-xs text-destructive">
              {candidatos.error instanceof Error ? candidatos.error.message : "Erro na busca de pedidos"}
            </p>
          )}
          {!candidatos.isFetching && termo.trim().length >= 2 && (candidatos.data || []).length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum pedido encontrado.</p>
          )}
          <div className="space-y-1">
            {(candidatos.data || []).map((c) => (
              <button
                key={c.pedido_id}
                type="button"
                onClick={() => setEscolhido(c)}
                className={`w-full text-left rounded-md border px-3 py-2 text-xs hover:bg-muted/60 ${
                  escolhido?.pedido_id === c.pedido_id ? "border-primary bg-muted/40" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono">{c.id_externo ?? "—"}</span>
                  <span className="font-mono tabular-nums">títulos {formatBRL(c.total_titulos)}</span>
                </div>
                <div className="truncate">{c.cliente}</div>
                {c.apelido && <div className="truncate text-muted-foreground">{c.apelido}</div>}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota obrigatória (mínimo 5 caracteres): por que esta venda é deste pedido?"
            rows={3}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={vincular} disabled={!escolhido || !notaOk || enviando}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Vincular
            </Button>
            {escolhido && (
              <span className="text-xs text-muted-foreground">
                → {escolhido.id_externo ?? escolhido.pedido_id}
              </span>
            )}
          </div>
          {!notaOk && nota.length > 0 && (
            <p className="text-xs text-muted-foreground">A nota precisa de ao menos 5 caracteres.</p>
          )}
        </div>
      </div>

      {erroRpc && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="whitespace-pre-wrap">{erroRpc}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default function VendasSemPedido() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const { orfas, vendas } = useVendasSemPedido();

  const linhas = orfas.data || [];
  const total = useMemo(() => linhas.reduce((s, o) => s + num(o.valor), 0), [linhas]);

  function invalidar() {
    qc.invalidateQueries({ queryKey: ["auditoria-cartao-sem-pedido"] });
    qc.invalidateQueries({ queryKey: ["conciliacao-cartao-fila"] });
    qc.invalidateQueries({ queryKey: ["conciliacao-cartao-sugestoes"] });
    qc.invalidateQueries({ queryKey: ["extrato-inbox"] });
  }

  if (orfas.isError) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-4 text-sm text-destructive">
          Erro ao carregar vendas sem pedido casado:{" "}
          {orfas.error instanceof Error ? orfas.error.message : String(orfas.error)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={aberto} onOpenChange={setAberto}>
      <Card className="border-amber-500/40">
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer">
            <CardTitle className="text-base flex items-center gap-2">
              {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Sem pedido casado · {linhas.length} vendas · {formatBRL(total)}
              {orfas.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-0">
            {!orfas.isLoading && linhas.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Nenhuma venda creditada sem pedido correspondente.
              </p>
            )}
            {linhas.map((o) => (
              <LinhaVenda key={o.nsu} o={o} v={(vendas.data || {})[o.nsu]} onOk={invalidar} />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
