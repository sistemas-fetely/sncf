/**
 * CONTA DO CLIENTE — o dinheiro é do CNPJ, não do pedido.
 *
 * Tela de leitura: saldo por cliente, extrato, cobertura e furos de trilha.
 * A única escrita é registrar recebimento (sem campo de pedido, por desenho).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Users, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import {
  useContasClienteSaldo,
  type ContaClienteSaldo,
} from "@/hooks/financeiro/useContaCliente";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContaClienteDrawer } from "@/components/financeiro/ContaClienteDrawer";
import { RegistrarRecebimentoDialog } from "@/components/financeiro/RegistrarRecebimentoDialog";
import { EntradasReconhecerTab } from "@/components/financeiro/EntradasReconhecerTab";

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export default function ContaCliente() {
  const navigate = useNavigate();
  const { data: contas, isLoading, isError, error } = useContasClienteSaldo();
  const [busca, setBusca] = useState("");
  const [selecionada, setSelecionada] = useState<ContaClienteSaldo | null>(null);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const base = contas ?? [];
    if (!t) return base;
    return base.filter((c) => (c.nome_fantasia ?? "").toLowerCase().includes(t));
  }, [contas, busca]);

  const kpis = useMemo(() => {
    const base = contas ?? [];
    let credito = 0;
    let devendo = 0;
    let vencido = 0;
    for (const c of base) {
      const s = Number(c.saldo ?? 0);
      if (s > 0) credito += s;
      if (s < 0) devendo += -s;
      vencido += Number(c.vencido_em_aberto ?? 0);
    }
    return { credito, devendo, vencido, clientes: base.length };
  }, [contas]);

  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Conta do Cliente"
        icone={Users}
        estado={
          isError
            ? "consulta falhou"
            : isLoading
              ? "carregando"
              : `${kpis.clientes} clientes com movimento`
        }
        acoes={
          <RegistrarRecebimentoDialog>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Registrar recebimento
            </Button>
          </RegistrarRecebimentoDialog>
        }
      />

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar as contas</AlertTitle>
          <AlertDescription>{(error as any)?.message ?? "Erro desconhecido."}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">Crédito a favor de clientes</p>
          <p className="text-sm font-medium text-success">
            {isError ? "—" : formatBRL(kpis.credito)}
          </p>
        </div>
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">Clientes devendo</p>
          <p className="text-sm font-medium">{isError ? "—" : formatBRL(kpis.devendo)}</p>
        </div>
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">Vencido em aberto</p>
          <p className="text-sm font-medium text-destructive">
            {isError ? "—" : formatBRL(kpis.vencido)}
          </p>
        </div>
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">Clientes</p>
          <p className="text-sm font-medium">{isError ? "—" : kpis.clientes}</p>
        </div>
      </div>

      <Tabs defaultValue="contas" className="space-y-3">
        <TabsList>
          <TabsTrigger value="contas">Contas de clientes</TabsTrigger>
          <TabsTrigger value="entradas">Entradas a reconhecer</TabsTrigger>
        </TabsList>

        <TabsContent value="contas" className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente"
              className="h-8 pl-8"
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Vencido em aberto</TableHead>
                    <TableHead className="text-right">A vencer</TableHead>
                    <TableHead className="text-right">Crédito futuro</TableHead>
                    <TableHead>Última movimentação</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                        Nenhum cliente com movimento em conta.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtradas.map((c) => {
                    const s = Number(c.saldo ?? 0);
                    const vencido = Number(c.vencido_em_aberto ?? 0) > 0;
                    return (
                      <TableRow
                        key={c.parceiro_id}
                        className="cursor-pointer"
                        onClick={() =>
                          navigate(`/cliente/${c.parceiro_id}?aba=posicao`, {
                            state: { from: "/administrativo/conta-cliente" },
                          })
                        }
                      >
                        <TableCell className="text-xs font-medium">
                          {c.nome_fantasia ?? "(sem nome)"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-xs font-medium",
                            s > 0 ? "text-success" : s < 0 ? "text-warning" : "",
                          )}
                        >
                          {formatBRL(s)}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {formatBRL(c.vencido_em_aberto ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {formatBRL(c.a_vencer ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {formatBRL(c.credito_futuro_boleto ?? 0)}
                        </TableCell>
                        <TableCell className="text-xs">{dataBR(c.ultima_movimentacao)}</TableCell>
                        <TableCell>
                          {vencido ? (
                            <Selo estado="destructive">vencido em aberto</Selo>
                          ) : s > 0 ? (
                            <Selo estado="success">crédito</Selo>
                          ) : s < 0 ? (
                            <Selo estado="warning">a receber</Selo>
                          ) : (
                            <Selo estado="muted">zerada</Selo>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="entradas">
          <EntradasReconhecerTab />
        </TabsContent>
      </Tabs>


      <ContaClienteDrawer
        conta={selecionada}
        onOpenChange={(open) => {
          if (!open) setSelecionada(null);
        }}
      />
    </div>
  );
}
