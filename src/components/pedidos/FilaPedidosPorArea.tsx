import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePedidosFila } from "@/hooks/pedidos/usePedidosFila";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEnviarBling } from "@/hooks/pedidos/useEnviarBling";
import {
  EstagioBadge, BadgesContextuaisPedido, FormatoIdade,
} from "./BadgesPedido";
import {
  ESTAGIO_LABELS, ESTAGIO_AREA, PIPELINE_PRINCIPAL,
  ESTAGIOS_TERMINAIS, ESTAGIOS_RECUPERAVEIS,
} from "@/types/pedido";
import type { AreaPedido, EstagioPedido } from "@/types/pedido";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  area: AreaPedido | "todas";
  estagioInicial?: EstagioPedido | "todos";
  /** Múltiplos estágios — quando preenchido, esconde o Select interno */
  estagios?: EstagioPedido[];
  apenasAtivos?: boolean;
}

/** Lista completa de estágios pra Select (pipeline + cancelado + recuperação). */
function todosOsEstagios(): EstagioPedido[] {
  return [
    ...PIPELINE_PRINCIPAL,
    ...ESTAGIOS_RECUPERAVEIS,
    ...ESTAGIOS_TERMINAIS.filter((e) => !PIPELINE_PRINCIPAL.includes(e)),
  ];
}

export function FilaPedidosPorArea({
  area,
  estagioInicial = "todos",
  estagios,
  apenasAtivos = true,
}: Props) {
  const [busca, setBusca] = useState("");
  const [estagioFilter, setEstagioFilter] = useState<EstagioPedido | "todos">(estagioInicial);
  const navigate = useNavigate();
  const enviarBling = useEnviarBling();

  const usarEstagiosMultiplos = !!(estagios && estagios.length > 0);

  // Estágios oferecidos no Select — se área específica, filtra pela ESTAGIO_AREA
  const estagiosDoSelect = useMemo(() => {
    const completo = todosOsEstagios();
    if (area === "todas") return completo;
    return completo.filter((e) => ESTAGIO_AREA[e] === area);
  }, [area]);

  const { data, isLoading } = usePedidosFila({
    area,
    estagio: usarEstagiosMultiplos ? undefined : estagioFilter,
    estagios: usarEstagiosMultiplos ? estagios : undefined,
    busca: busca || undefined,
    apenasAtivos,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, CNPJ ou ID externo…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>
        {!usarEstagiosMultiplos && (
          <Select
            value={estagioFilter}
            onValueChange={(v) => setEstagioFilter(v as EstagioPedido | "todos")}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os estágios</SelectItem>
              {estagiosDoSelect.map((e) => (
                <SelectItem key={e} value={e}>{ESTAGIO_LABELS[e]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID Externo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Estágio</TableHead>
              <TableHead>Sinais</TableHead>
              <TableHead>Idade</TableHead>
              <TableHead>Próxima ação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (!data || data.length === 0) && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Nenhum pedido neste filtro.
                </TableCell>
              </TableRow>
            )}
            {data?.map((p) => (
              <TableRow
                key={p.id}
                className="cursor-pointer"
                onClick={() => navigate(`/pedidos/${p.id}`)}
              >
                <TableCell>
                  <span className="font-mono text-xs">{p.id_externo}</span>
                </TableCell>
                <TableCell>
                  <p className="font-medium text-sm">{p.parceiro_razao}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">{p.parceiro_cnpj}</p>
                </TableCell>
                <TableCell>
                  <p className="font-semibold">{fmtBRL.format(p.valor_liquido)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.condicao_solicitada} · {p.forma_solicitada}
                  </p>
                </TableCell>
                <TableCell>
                  <EstagioBadge estagio={p.estagio} />
                </TableCell>
                <TableCell>
                  <BadgesContextuaisPedido p={p} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  <FormatoIdade minutos={p.idade_minutos} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.proxima_acao || <span className="opacity-50">—</span>}
                </TableCell>
                <TableCell className="text-right">
                  {p.estagio === "pre_faturado" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={enviarBling.isPending && enviarBling.variables === p.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        enviarBling.mutate(p.id);
                      }}
                    >
                      {enviarBling.isPending && enviarBling.variables === p.id ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          Enviando…
                        </>
                      ) : (
                        <>
                          <Send className="h-3 w-3 mr-1" />
                          Enviar Bling
                        </>
                      )}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {data && data.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {data.length} pedido{data.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
