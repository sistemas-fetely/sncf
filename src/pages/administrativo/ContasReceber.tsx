import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDownToLine, Copy, CheckCheck, Inbox, Mail, MailCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { useEnviarEmailCobranca } from "@/hooks/credito/useEnviarEmailCobranca";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Titulo = {
  id: string;
  numero_titulo: string | null;
  pedido_id: string | null;
  data_vencimento_atual: string | null;
  data_pagamento: string | null;
  data_pagamento_banco: string | null;
  valor_bruto: number | null;
  valor_atual: number | null;
  status: string;
  numero_parcela: number | null;
  total_parcelas: number | null;
  tipo_pagamento: string | null;
  boleto_status: string | null;
  linha_digitavel: string | null;
  link_pagamento: string | null;
  email_cobranca_enviado_em: string | null;
  conta: { parceiro: { razao_social: string | null } | null } | null;
};

type GrupoStatus = "a_receber" | "vencido" | "pago" | "cancelado";

const STATUS_PARA_GRUPO: Record<string, GrupoStatus> = {
  aguardando_pagamento: "a_receber",
  aguardando_envio_bling: "a_receber",
  aguardando_emissao_nf: "a_receber",
  vigente: "a_receber",
  vigente_parcial: "a_receber",
  renegociado: "a_receber",
  vencido: "vencido",
  vencido_suspenso: "vencido",
  em_juridico: "vencido",
  pago: "pago",
  pago_com_atraso: "pago",
  pago_judicial: "pago",
  cancelado: "cancelado",
  cancelado_recuperacao: "cancelado",
  baixado_por_perda: "cancelado",
};

const BOLETO_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-gray-100 text-gray-600" },
  remessa_gerada: { label: "Remessa gerada", className: "bg-yellow-100 text-yellow-800" },
  registrado: { label: "Registrado", className: "bg-blue-100 text-blue-800" },
  pago_manual: { label: "Pago (manual)", className: "bg-emerald-100 text-emerald-800" },
  pago_banco: { label: "Pago (Safra)", className: "bg-green-700 text-white" },
  rejeitado: { label: "Rejeitado", className: "bg-red-100 text-red-800" },
  vencido: { label: "Vencido", className: "bg-orange-100 text-orange-800" },
};

const PAGE_SIZE = 25;

function BaixaManualDialog({ titulo, onClose }: { titulo: Titulo; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dataPag, setDataPag] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { error: rpcErr } = await (supabase as any).rpc("marcar_titulo_pago", {
        p_titulo_id: titulo.id,
        p_data_pagamento: dataPag + "T12:00:00" + ".000Z",
      });
      if (rpcErr) throw rpcErr;

      if (titulo.boleto_status !== null) {
        const { error: updErr } = await (supabase as any)
          .from("titulo_a_receber")
          .update({ boleto_status: "pago_manual" })
          .eq("id", titulo.id);
        if (updErr) throw updErr;
      }

      await qc.invalidateQueries({ queryKey: ["contas-receber-titulos"] });
      toast({ title: "Baixa registrada" });
      onClose();
    } catch (e: any) {
      toast({
        title: "Erro ao registrar baixa",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Baixa manual</DialogTitle>
          <DialogDescription>
            Título <span className="font-mono">{titulo.numero_titulo ?? "—"}</span> ·{" "}
            {formatBRL(titulo.valor_atual ?? titulo.valor_bruto ?? 0)} · venc.{" "}
            {formatDateBR(titulo.data_vencimento_atual)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="data-pag">Data do pagamento</Label>
          <Input
            id="data-pag"
            type="date"
            value={dataPag}
            onChange={(e) => setDataPag(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading || !dataPag}>
            {loading ? "Registrando..." : "Confirmar baixa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ContasReceber() {
  const { toast } = useToast();
  const [filtroGrupo, setFiltroGrupo] = useState<"todos" | GrupoStatus>("todos");
  const [filtroBoleto, setFiltroBoleto] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [page, setPage] = useState(1);
  const [tituloBaixa, setTituloBaixa] = useState<Titulo | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["contas-receber-titulos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("titulo_a_receber")
        .select(
          `
          id, numero_titulo, pedido_id,
          data_vencimento_atual, data_pagamento, data_pagamento_banco,
          valor_bruto, valor_atual, status, numero_parcela, total_parcelas,
          tipo_pagamento, boleto_status, linha_digitavel,
          conta:contas_pagar_receber(
            parceiro:parceiros_comerciais(razao_social)
          )
        `
        )
        .order("data_vencimento_atual", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Titulo[];
    },
  });

  const hoje = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const kpis = useMemo(() => {
    const titulos = data ?? [];
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const em7 = new Date(hoje.getTime() + 7 * 86400000);

    let totalReceber = 0;
    let vencido = 0;
    let vence7 = 0;
    let recebidoMes = 0;

    for (const t of titulos) {
      const grupo = STATUS_PARA_GRUPO[t.status];
      const valor = t.valor_atual ?? t.valor_bruto ?? 0;
      const venc = t.data_vencimento_atual ? new Date(t.data_vencimento_atual) : null;

      if (grupo === "a_receber" || grupo === "vencido") {
        totalReceber += valor;
        if (venc && venc < hoje) vencido += valor;
        if (venc && venc >= hoje && venc <= em7) vence7 += valor;
      }
      if (grupo === "pago") {
        const dp = t.data_pagamento ? new Date(t.data_pagamento) : null;
        if (dp && dp >= inicioMes) recebidoMes += valor;
      }
    }
    return { totalReceber, vencido, vence7, recebidoMes };
  }, [data, hoje]);

  const aging = useMemo(() => {
    const titulos = data ?? [];
    const faixas = { a_vencer: 0, f1_7: 0, f8_30: 0, f31_60: 0, f60: 0 };
    for (const t of titulos) {
      const grupo = STATUS_PARA_GRUPO[t.status];
      if (grupo !== "a_receber" && grupo !== "vencido") continue;
      if (!t.data_vencimento_atual) continue;
      const venc = new Date(t.data_vencimento_atual);
      const dias = Math.floor((hoje.getTime() - venc.getTime()) / 86400000);
      const valor = t.valor_atual ?? t.valor_bruto ?? 0;
      if (dias <= 0) faixas.a_vencer += valor;
      else if (dias <= 7) faixas.f1_7 += valor;
      else if (dias <= 30) faixas.f8_30 += valor;
      else if (dias <= 60) faixas.f31_60 += valor;
      else faixas.f60 += valor;
    }
    return faixas;
  }, [data, hoje]);

  const filtrados = useMemo(() => {
    const titulos = data ?? [];
    const buscaLc = busca.trim().toLowerCase();
    const dDe = dataDe ? new Date(dataDe) : null;
    const dAte = dataAte ? new Date(dataAte) : null;

    return titulos.filter((t) => {
      const grupo = STATUS_PARA_GRUPO[t.status];
      if (filtroGrupo !== "todos" && grupo !== filtroGrupo) return false;

      if (filtroBoleto !== "todos") {
        if (filtroBoleto === "sem_boleto") {
          if (t.boleto_status !== null) return false;
        } else if (t.boleto_status !== filtroBoleto) return false;
      }

      if (buscaLc) {
        const num = (t.numero_titulo ?? "").toLowerCase();
        const cli = (t.conta?.parceiro?.razao_social ?? "").toLowerCase();
        if (!num.includes(buscaLc) && !cli.includes(buscaLc)) return false;
      }

      if (dDe || dAte) {
        if (!t.data_vencimento_atual) return false;
        const venc = new Date(t.data_vencimento_atual);
        if (dDe && venc < dDe) return false;
        if (dAte && venc > dAte) return false;
      }

      return true;
    });
  }, [data, filtroGrupo, filtroBoleto, busca, dataDe, dataAte]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginados = filtrados.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const handleCopy = async (id: string, linha: string) => {
    try {
      await navigator.clipboard.writeText(linha);
      setCopiadoId(id);
      toast({ title: "Copiado!" });
      setTimeout(() => setCopiadoId((c) => (c === id ? null : c)), 2500);
    } catch {
      toast({ title: "Falha ao copiar", variant: "destructive" });
    }
  };

  const renderBoletoBadge = (status: string | null) => {
    if (!status) return <span className="text-muted-foreground">—</span>;
    const cfg = BOLETO_STATUS_CONFIG[status];
    if (!cfg) return <Badge variant="outline">{status}</Badge>;
    return <Badge className={cfg.className + " border-0"}>{cfg.label}</Badge>;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <ArrowDownToLine className="h-7 w-7 text-admin" />
        <div>
          <h1 className="text-2xl font-semibold">Contas a Receber</h1>
          <p className="text-sm text-muted-foreground">
            Recebíveis por parcela — acompanhe boletos, aging e confirmações.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-700">Total a receber</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-blue-700">
              {formatBRL(kpis.totalReceber)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-700">Vencido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-red-700">{formatBRL(kpis.vencido)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-600">Vence em 7 dias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-amber-600">{formatBRL(kpis.vence7)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-700">Recebido no mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-green-700">
              {formatBRL(kpis.recebidoMes)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aging */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Aging</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">A vencer</div>
              <div className="text-lg font-semibold text-blue-700">
                {formatBRL(aging.a_vencer)}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">1–7 dias</div>
              <div className="text-lg font-semibold text-amber-600">{formatBRL(aging.f1_7)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">8–30 dias</div>
              <div className="text-lg font-semibold text-orange-600">{formatBRL(aging.f8_30)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">31–60 dias</div>
              <div className="text-lg font-semibold text-red-600">{formatBRL(aging.f31_60)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">+60 dias</div>
              <div className="text-lg font-semibold text-red-800">{formatBRL(aging.f60)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select
              value={filtroGrupo}
              onValueChange={(v) => {
                setFiltroGrupo(v as any);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="a_receber">A receber</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status do boleto</Label>
            <Select
              value={filtroBoleto}
              onValueChange={(v) => {
                setFiltroBoleto(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sem_boleto">Sem boleto</SelectItem>
                {Object.entries(BOLETO_STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Busca</Label>
            <Input
              placeholder="Título ou cliente"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vencimento de</Label>
            <Input
              type="date"
              value={dataDe}
              onChange={(e) => {
                setDataDe(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vencimento até</Label>
            <Input
              type="date"
              value={dataAte}
              onChange={(e) => {
                setDataAte(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground" />
              <div className="font-medium">Nenhum título ainda</div>
              <div className="text-sm text-muted-foreground">
                Os títulos nascem quando um pedido é materializado na Cobrança.
              </div>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Nenhum registro com os filtros aplicados.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Parcela</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status boleto</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginados.map((t) => {
                    const grupo = STATUS_PARA_GRUPO[t.status];
                    const venc = t.data_vencimento_atual
                      ? new Date(t.data_vencimento_atual)
                      : null;
                    const vencido =
                      venc && venc < hoje && (grupo === "a_receber" || grupo === "vencido");
                    const valor = t.valor_atual ?? t.valor_bruto ?? 0;
                    const podeBaixa =
                      (grupo === "a_receber" || grupo === "vencido") &&
                      t.boleto_status !== "pago_manual" &&
                      t.boleto_status !== "pago_banco";

                    return (
                      <TableRow key={t.id} className={vencido ? "bg-red-50/40" : ""}>
                        <TableCell
                          className={vencido ? "font-semibold text-red-700" : ""}
                        >
                          {formatDateBR(t.data_vencimento_atual)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {t.numero_titulo ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate">
                          {t.conta?.parceiro?.razao_social ?? "—"}
                        </TableCell>
                        <TableCell>
                          {t.numero_parcela ?? "—"}/{t.total_parcelas ?? "—"}
                        </TableCell>
                        <TableCell className="capitalize">
                          {(t.tipo_pagamento ?? "—").replace(/_/g, " ")}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatBRL(valor)}
                        </TableCell>
                        <TableCell>{renderBoletoBadge(t.boleto_status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {podeBaixa && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setTituloBaixa(t)}
                              >
                                Baixa manual
                              </Button>
                            )}
                            {t.linha_digitavel && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleCopy(t.id, t.linha_digitavel!)}
                              >
                                {copiadoId === t.id ? (
                                  <CheckCheck className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between border-t p-3 text-sm">
                <div className="text-muted-foreground">
                  {filtrados.length} registro{filtrados.length === 1 ? "" : "s"} · Página{" "}
                  {pageSafe} de {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {tituloBaixa && (
        <BaixaManualDialog titulo={tituloBaixa} onClose={() => setTituloBaixa(null)} />
      )}
    </div>
  );
}
