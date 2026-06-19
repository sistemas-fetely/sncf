import { useState, useMemo } from "react";
import { useTodosTitulos } from "@/hooks/credito/useTodosTitulos";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCNPJ } from "@/lib/cnpj";
import { ConverterTituloHaverDialog } from "@/components/credito/ConverterTituloHaverDialog";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const STATUS_LABEL: Record<string, string> = {
  aguardando_envio_bling: "Aguardando Bling",
  pago: "Pago",
  pago_com_atraso: "Pago c/ atraso",
  vigente: "Vigente",
  cancelado: "Cancelado",
  atrasado: "Atrasado",
  vencido: "Atrasado",
  vencido_suspenso: "Suspenso",
};

const STATUS_COR: Record<string, string> = {
  aguardando_envio_bling:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  pago: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  pago_com_atraso: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  vigente: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  cancelado: "bg-muted text-muted-foreground",
  atrasado: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  vencido: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  vencido_suspenso: "bg-muted text-muted-foreground",
};

const TIPO_LABEL: Record<string, string> = {
  boleto: "Boleto",
  pix: "PIX",
  cartao: "Cartão",
  cartao_sem_juros: "Cartão s/j",
};

export default function TodosTitulosTab() {
  const { data: titulos = [], isLoading } = useTodosTitulos();
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [convertendo, setConvertendo] = useState<{ id: string; numero: string; valor: number } | null>(null);

  const kpis = useMemo(() => {
    const por: Record<string, { qtd: number; sem_nf: number; valor: number }> = {};
    titulos.forEach((t) => {
      const s = statusVisual(t);
      if (!por[s]) por[s] = { qtd: 0, sem_nf: 0, valor: 0 };
      por[s].qtd++;
      if (!t.nf_id) por[s].sem_nf++;
      por[s].valor += t.valor_atual ?? t.valor_bruto;
    });
    return por;
  }, [titulos]);

  const semNfTotal = titulos.filter((t) => !t.nf_id && t.status !== "cancelado").length;

  const filtrados = useMemo(() => {
    let lista = titulos;
    if (filtroStatus === "sem_nf") {
      lista = lista.filter((t) => !t.nf_id && t.status !== "cancelado");
    } else if (filtroStatus === "atrasado") {
      lista = lista.filter((t) => statusVisual(t) === "atrasado");
    } else if (filtroStatus !== "todos") {
      lista = lista.filter((t) => t.status === filtroStatus);
    }
    if (busca.trim()) {
      const q = busca.toLowerCase();
      lista = lista.filter(
        (t) =>
          t.razao_social?.toLowerCase().includes(q) ||
          t.id_externo?.toLowerCase().includes(q) ||
          t.numero_titulo?.toLowerCase().includes(q) ||
          t.cnpj?.includes(q)
      );
    }
    return lista;
  }, [titulos, filtroStatus, busca]);

  const hoje = new Date().toISOString().slice(0, 10);

  const statusVisual = (t: ReturnType<typeof useTodosTitulos>["data"][number]): string => {
    if (t.status.startsWith("pago")) return t.status;
    if (t.status === "cancelado" || t.status === "cancelado_recuperacao") return "cancelado";
    if (t.data_vencimento_atual && t.data_vencimento_atual < hoje) return "atrasado";
    return t.status;
  };

  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  const statusOrdem = ["aguardando_envio_bling", "atrasado", "vigente", "pago", "cancelado"];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statusOrdem.map((s) => {
          const k = kpis[s];
          if (!k) return null;
          const ativo = filtroStatus === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFiltroStatus(ativo ? "todos" : s)}
              className={cn(
                "text-left p-3 rounded-lg border transition-colors",
                ativo ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted/50"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{STATUS_LABEL[s] ?? s}</span>
                {ativo && <Check className="h-3.5 w-3.5 text-foreground" />}
              </div>
              <div className="text-lg font-semibold mt-1">{k.qtd}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {k.sem_nf > 0 ? `${k.sem_nf} sem NF · ` : ""}
                {fmtBRL.format(k.valor)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filtros secundários */}
      <div className="flex flex-wrap items-center gap-3">
        {[
          { key: "todos", label: `Todos (${titulos.length})` },
          {
            key: "aguardando_envio_bling",
            label: `Aguardando Bling (${kpis["aguardando_envio_bling"]?.qtd ?? 0})`,
          },
          { key: "pago", label: `Pagos (${kpis["pago"]?.qtd ?? 0})` },
          { key: "atrasado", label: `Atrasados (${kpis["atrasado"]?.qtd ?? 0})` },
          { key: "sem_nf", label: `Sem NF (${semNfTotal})` },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFiltroStatus(tab.key)}
            className={cn(
              "text-sm pb-2 border-b-2 transition-colors",
              filtroStatus === tab.key
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por cliente, pedido, título ou CNPJ..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-10 text-sm"
        />
      </div>

      {/* Tabela */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Título</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>NF</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhum título encontrado.
                </TableCell>
              </TableRow>
            )}
            {filtrados.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <p className="text-sm font-medium">{t.razao_social ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.cnpj ? formatCNPJ(t.cnpj) : ""}
                  </p>
                </TableCell>
                <TableCell className="text-sm">
                  {t.id_externo ?? "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {t.numero_titulo}
                  {t.total_parcelas && t.total_parcelas > 1 ? (
                    <span className="text-xs text-muted-foreground ml-1">
                      {t.numero_parcela}/{t.total_parcelas}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {fmtBRL.format(t.valor_atual ?? t.valor_bruto)}
                </TableCell>
                <TableCell className="text-sm">
                  {t.nf_id ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {TIPO_LABEL[t.tipo_pagamento ?? ""] ?? (t.tipo_pagamento ?? "—")}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={cn("text-xs", STATUS_COR[statusVisual(t)] ?? "bg-muted text-muted-foreground")}
                  >
                    {STATUS_LABEL[statusVisual(t)] ?? statusVisual(t)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtrados.length} de {titulos.length} títulos
      </p>
    </div>
  );
}
