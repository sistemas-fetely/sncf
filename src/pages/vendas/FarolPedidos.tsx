import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DATA_FMT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

type FarolRow = {
  pedido_id: string;
  id_externo: string | null;
  cliente: string | null;
  valor_liquido: number | null;
  estagio: string | null;
  status_label: string | null;
  wns_fase_desc: string | null;
  expedido: boolean | null;
  data_pg: string | null;
  meta: string | null;
  eta_vivo: string | null;
  dias_vs_meta: number | null;
  farol: string | null;
  tempo_na_fase: number | null;
  sla_fase_atual: number | null;
  estourou_fase: boolean | null;
  portao_vencido: boolean | null;
  fase_gargalo: string | null;
};

const FAROL_ORDER: Record<string, number> = {
  atrasado: 0,
  aguardando_pagamento: 1,
  em_dia: 2,
  adiantado: 3,
  sem_meta: 4,
  sem_eta: 5,
};

const FAROL_LABEL: Record<string, string> = {
  atrasado: "Atrasado",
  em_dia: "Em dia",
  adiantado: "Adiantado",
  aguardando_pagamento: "Aguardando pgto",
  sem_meta: "Sem meta",
  sem_eta: "Sem ETA",
};

function farolBadgeClass(farol: string | null): string {
  switch (farol) {
    case "atrasado":
      return "bg-red-100 text-red-800 hover:bg-red-100 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900";
    case "em_dia":
      return "bg-green-100 text-green-800 hover:bg-green-100 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-900";
    case "adiantado":
      return "bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900";
    case "aguardando_pagamento":
      return "bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900";
    default:
      return "bg-muted text-muted-foreground hover:bg-muted border-border";
  }
}

function fmtDate(d: string | null): string {
  if (!d) return "-";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return "-";
  return DATA_FMT.format(parsed);
}

export default function FarolPedidos() {
  const [busca, setBusca] = useState("");
  const [filtroFarol, setFiltroFarol] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");

  const { data, isLoading, error } = useQuery({
    queryKey: ["vw_pedidos_farol"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_pedidos_farol" as any)
        .select("*");
      if (error) throw error;
      return ((data ?? []) as unknown) as FarolRow[];
    },
  });

  const rows = data ?? [];

  const contagem = useMemo(() => {
    const c = { atrasado: 0, em_dia: 0, adiantado: 0, aguardando_pagamento: 0 };
    for (const r of rows) {
      if (r.farol && r.farol in c) (c as any)[r.farol]++;
    }
    return c;
  }, [rows]);

  const statusOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.status_label) s.add(r.status_label);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let arr = rows.filter((r) => {
      if (filtroFarol !== "todos" && (r.farol ?? "") !== filtroFarol) return false;
      if (filtroStatus !== "todos" && (r.status_label ?? "") !== filtroStatus) return false;
      if (q) {
        const hay = `${r.id_externo ?? ""} ${r.cliente ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    arr = [...arr].sort((a, b) => {
      const fa = FAROL_ORDER[a.farol ?? ""] ?? 99;
      const fb = FAROL_ORDER[b.farol ?? ""] ?? 99;
      if (fa !== fb) return fa - fb;
      const da = a.dias_vs_meta ?? -Infinity;
      const db = b.dias_vs_meta ?? -Infinity;
      return db - da;
    });
    return arr;
  }, [rows, busca, filtroFarol, filtroStatus]);

  const COLS = 9;

  const KpiCard = ({
    label, valor, tone, value,
  }: { label: string; valor: number; tone: string; value: string }) => {
    const ativo = filtroFarol === value;
    return (
      <Card
        onClick={() => setFiltroFarol(ativo ? "todos" : value)}
        className={`cursor-pointer transition hover:border-primary ${ativo ? "border-primary ring-1 ring-primary" : ""}`}
      >
        <CardContent className="p-4">
          <div className={`text-xs font-medium ${tone}`}>{label}</div>
          <div className="text-2xl font-semibold mt-1">{valor}</div>
        </CardContent>
      </Card>
    );
  };

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-serif">Farol de Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhamento de prazo de entrega (somente leitura)
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Atrasado" valor={contagem.atrasado} tone="text-red-600 dark:text-red-400" value="atrasado" />
          <KpiCard label="Em dia" valor={contagem.em_dia} tone="text-green-600 dark:text-green-400" value="em_dia" />
          <KpiCard label="Adiantado" valor={contagem.adiantado} tone="text-blue-600 dark:text-blue-400" value="adiantado" />
          <KpiCard label="Aguardando pagamento" valor={contagem.aguardando_pagamento} tone="text-amber-600 dark:text-amber-400" value="aguardando_pagamento" />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Buscar por número ou cliente…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-sm"
          />
          <Select value={filtroFarol} onValueChange={setFiltroFarol}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Farol" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os faróis</SelectItem>
              <SelectItem value="atrasado">Atrasado</SelectItem>
              <SelectItem value="em_dia">Em dia</SelectItem>
              <SelectItem value="adiantado">Adiantado</SelectItem>
              <SelectItem value="aguardando_pagamento">Aguardando pagamento</SelectItem>
              <SelectItem value="sem_meta">Sem meta</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtradas.length} pedido(s)
          </div>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data PG</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Meta</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead className="text-right">Dias vs meta</TableHead>
                <TableHead>Farol</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: COLS }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={COLS} className="text-center text-destructive py-8">
                    Erro ao carregar pedidos. Tente recarregar a página.
                  </TableCell>
                </TableRow>
              ) : filtradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLS} className="text-center text-muted-foreground py-10">
                    Nenhum pedido encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtradas.map((r) => {
                  const dvm = r.dias_vs_meta;
                  const dvmNode =
                    dvm === null || dvm === undefined ? (
                      <span className="text-muted-foreground">-</span>
                    ) : dvm > 0 ? (
                      <span className="text-red-600 dark:text-red-400 font-medium">+{dvm}</span>
                    ) : dvm < 0 ? (
                      <span className="text-blue-600 dark:text-blue-400 font-medium">{dvm}</span>
                    ) : (
                      <span>0</span>
                    );

                  const statusCell = (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{r.status_label ?? "-"}</span>
                      {r.expedido && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">Expedido</Badge>
                      )}
                    </div>
                  );

                  const farolBadge = (
                    <Badge variant="outline" className={farolBadgeClass(r.farol)}>
                      {FAROL_LABEL[r.farol ?? ""] ?? "-"}
                    </Badge>
                  );

                  return (
                    <TableRow key={r.pedido_id}>
                      <TableCell className="font-mono text-xs">{r.id_externo ?? "-"}</TableCell>
                      <TableCell className="max-w-[260px] truncate">{r.cliente || "-"}</TableCell>
                      <TableCell>
                        {r.fase_gargalo ? (
                          <Tooltip>
                            <TooltipTrigger asChild><div>{statusCell}</div></TooltipTrigger>
                            <TooltipContent>Gargalo: {r.fase_gargalo}</TooltipContent>
                          </Tooltip>
                        ) : statusCell}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.data_pg ? DATA_FMT.format(new Date(r.data_pg)) : ""}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {BRL.format(Number(r.valor_liquido ?? 0))}
                      </TableCell>
                      <TableCell className="text-xs">{fmtDate(r.meta)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.eta_vivo)}</TableCell>
                      <TableCell className="text-right">{dvmNode}</TableCell>
                      <TableCell>{farolBadge}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </TooltipProvider>
  );
}
