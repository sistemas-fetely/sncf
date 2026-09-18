/**
 * ENTRADAS A RECONHECER — o que a varredura automática não reconheceu.
 *
 * Um clique ensina o sistema: ao dizer "é deste cliente", o pagador passa a
 * ser reconhecido sozinho nas próximas vezes.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { ConfirmarPagamentoDialog } from "@/components/pedidos/dialogs/ConfirmarPagamentoDialog";
import { Button } from "@/components/ui/button";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import {
  useAtribuirClienteExtrato,
  useClientesBusca,
  useEntradasReconhecer,
  type EntradaReconhecer,
} from "@/hooks/financeiro/useContaCliente";
import {
  CabecalhoOrdenavel,
  LINHA_CABECALHO_COLADO,
  LINHA_CABECALHO_SIMPLES,
  type DirecaoOrdenacao,
} from "@/components/tabela/CabecalhoOrdenavel";
import {
  RodapePaginacao,
  lerTamanhoPaginaSalvo,
  type PageSizeOption,
} from "@/components/tabela/RodapePaginacao";

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function diasNaFila(iso: string) {
  const t = new Date(iso.slice(0, 10) + "T12:00:00").getTime();
  const hoje = new Date(new Date().toLocaleDateString("en-CA") + "T12:00:00").getTime();
  return Math.max(0, Math.round((hoje - t) / 86400000));
}

type ColunaEntradas = "data" | "valor" | "pagador" | "documento" | "descricao" | "dias";

type OrdenacaoEntradas = { coluna: ColunaEntradas; dir: DirecaoOrdenacao } | null;

/** Dias na fila desce: quem espera mais aparece primeiro. */
const DIR_INICIAL_ENTRADAS: Record<ColunaEntradas, DirecaoOrdenacao> = {
  data: "desc", valor: "desc", pagador: "asc",
  documento: "asc", descricao: "asc", dias: "desc",
};

const CHAVE_PAGINA_ENTRADAS = "fetely:cliente:entradas:page-size";

/** CasaHeader = 4rem. Mesmo numero que ancora o `top-16` do bloco de KPIs. */
const ALTURA_CASA_HEADER = 64;

function AtribuirCliente({ entrada }: { entrada: EntradaReconhecer }) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const { data: opcoes = [], isLoading } = useClientesBusca(busca);
  const atribuir = useAtribuirClienteExtrato();

  async function confirmar(id: string, nome: string) {
    try {
      const res = await atribuir.mutateAsync({ movimentacao_id: entrada.id, parceiro_id: id });
      setOpen(false);
      toast.success(
        `${formatBRL(res.valor ?? entrada.valor)} creditado na conta de ${nome}` +
          (res.pagador_aprendido
            ? " · pagador aprendido — próxima vez é automático"
            : ""),
      );
    } catch (e: any) {
      toast.error("Não foi possível atribuir esta entrada", {
        description: e?.message ?? "Erro desconhecido.",
      });
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={atribuir.isPending}>
          {atribuir.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ChevronsUpDown className="h-3 w-3" />
          )}
          É deste cliente
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar cliente por nome ou CNPJ"
            value={busca}
            onValueChange={setBusca}
          />
          <CommandList>
            {isLoading ? (
              <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> buscando
              </div>
            ) : (
              <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            )}
            <CommandGroup>
              {opcoes.map((c) => (
                <CommandItem key={c.id} value={c.id} onSelect={() => confirmar(c.id, c.nome)}>
                  <Check className="mr-2 h-3.5 w-3.5 opacity-0" />
                  <span className="text-xs">{c.nome}</span>
                  {c.cnpj && (
                    <span className="ml-auto text-[10px] text-muted-foreground">{c.cnpj}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * COMPROVANTE-E-DINHEIRO-CHEGANDO: prova que chegou com dono conhecido é irmã
 * de Entrada a Reconhecer — não defeito de título. Fonte: `vw_comprovante_pendente`
 * (plana por comprovante; o agrupamento por cliente acontece aqui).
 *
 * CARTAO-E-CAPTURA-UNICA: linha de cartão não confirma por aqui — fecha em
 * `confirmar_cartao_capturado`, e a RPC de comprovante recusa de propósito.
 */
type ComprovanteRow = Database["public"]["Views"]["vw_comprovante_pendente"]["Row"];

type ColunaComprovante = "valor" | "meio" | "pagador" | "data" | "idade";

const DIR_INICIAL_COMPROVANTE: Record<ColunaComprovante, DirecaoOrdenacao> = {
  valor: "desc", meio: "asc", pagador: "asc", data: "desc", idade: "desc",
};

function ehCartao(tipo: string | null | undefined) {
  return (tipo ?? "").toLowerCase().includes("cart");
}

function ComprovantesAguardandoBloco() {
  const qc = useQueryClient();
  const [confirmarPedidoId, setConfirmarPedidoId] = useState<string | null>(null);
  const [ordenacao, setOrdenacao] = useState<{ coluna: ColunaComprovante; dir: DirecaoOrdenacao } | null>(null);

  const { data: comprovantes = [], isLoading, isError, error } = useQuery({
    queryKey: ["comprovante-pendente-fila"],
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error: erro } = await supabase
        .from("vw_comprovante_pendente")
        .select("*")
        .order("idade_dias", { ascending: false })
        .limit(500);
      if (erro) throw erro;
      return data ?? [];
    },
  });

  const ordenarPor = (coluna: ColunaComprovante) => {
    setOrdenacao((atual) => {
      if (!atual || atual.coluna !== coluna) return { coluna, dir: DIR_INICIAL_COMPROVANTE[coluna] };
      const invertida: DirecaoOrdenacao = atual.dir === "asc" ? "desc" : "asc";
      return invertida === DIR_INICIAL_COMPROVANTE[coluna] ? null : { coluna, dir: invertida };
    });
  };

  const grupos = useMemo(() => {
    const mapa = new Map<string, ComprovanteRow[]>();
    for (const c of comprovantes) {
      const chave = c.parceiro_id ?? c.cliente ?? "—";
      const lista = mapa.get(chave) ?? [];
      lista.push(c);
      mapa.set(chave, lista);
    }

    const valorDe = (c: ComprovanteRow): string | number | null => {
      switch (ordenacao?.coluna) {
        case "valor": return Number(c.valor_lido ?? 0);
        case "meio": return c.tipo_lido ?? null;
        case "pagador": return c.pagador_lido ?? null;
        case "data": {
          const t = c.data_lida ? Date.parse(String(c.data_lida)) : NaN;
          return Number.isNaN(t) ? null : t;
        }
        case "idade": return c.idade_dias == null ? null : Number(c.idade_dias);
        default: return null;
      }
    };

    // VAZIO-VAI-PRO-FIM: célula sem dado nunca ganha primeiro lugar.
    const ordenar = (linhas: ComprovanteRow[]) => {
      if (!ordenacao) {
        return linhas.slice().sort((a, b) => Number(b.idade_dias ?? 0) - Number(a.idade_dias ?? 0));
      }
      const dir = ordenacao.dir === "asc" ? 1 : -1;
      return linhas.slice().sort((a, b) => {
        const va = valorDe(a);
        const vb = valorDe(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === "string" || typeof vb === "string") {
          return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * dir;
        }
        return (Number(va) - Number(vb)) * dir;
      });
    };

    return Array.from(mapa.entries())
      .map(([chave, linhas]) => {
        const somaValor = linhas.reduce((acc, c) => acc + Number(c.valor_lido ?? 0), 0);
        const qtdAbertos = Number(linhas[0]?.qtd_titulos_abertos ?? 0);
        const valorAbertos = Number(linhas[0]?.valor_titulos_abertos ?? 0);
        // Mesmo valor + mesma data no mesmo cliente: conferir antes de confirmar.
        const contagem = new Map<string, number>();
        for (const c of linhas) {
          const k = `${Number(c.valor_lido ?? 0)}|${String(c.data_lida ?? "")}`;
          contagem.set(k, (contagem.get(k) ?? 0) + 1);
        }
        return {
          chave,
          nome: linhas[0]?.cliente ?? "—",
          linhas: ordenar(linhas),
          qtd: linhas.length,
          somaValor,
          qtdAbertos,
          valorAbertos,
          excedente: somaValor - valorAbertos,
          duplicada: (c: ComprovanteRow) =>
            (contagem.get(`${Number(c.valor_lido ?? 0)}|${String(c.data_lida ?? "")}`) ?? 0) > 1,
        };
      })
      .sort((a, b) => b.somaValor - a.somaValor);
  }, [comprovantes, ordenacao]);

  return (
    <section className="space-y-2">
      <div className="space-y-0.5">
        <h3 className="text-sm font-medium">Comprovantes aguardando confirmação</h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed max-w-3xl">
          Prova que chegou com dono conhecido. Confirmar credita a conta do cliente e aloca nos
          títulos abertos.
        </p>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar os comprovantes</AlertTitle>
          <AlertDescription>{(error as any)?.message ?? "Erro desconhecido."}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-border/60 bg-card">
          <Table>
            <TableHeader>
              <TableRow className={LINHA_CABECALHO_SIMPLES}>
                <CabecalhoOrdenavel rotulo="Valor" className="text-right" alinharDireita dir={ordenacao?.coluna === "valor" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("valor")} />
                <CabecalhoOrdenavel rotulo="Meio" dir={ordenacao?.coluna === "meio" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("meio")} />
                <CabecalhoOrdenavel rotulo="Pagador" dir={ordenacao?.coluna === "pagador" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("pagador")} />
                <CabecalhoOrdenavel rotulo="Data" dir={ordenacao?.coluna === "data" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("data")} />
                <CabecalhoOrdenavel rotulo="Idade" className="text-right" alinharDireita dir={ordenacao?.coluna === "idade" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("idade")} />
                <TableHead>Pedido</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">
                    Nenhum comprovante aguardando confirmação.
                  </TableCell>
                </TableRow>
              )}
              {grupos.map((g) => (
                <Fragment key={g.chave}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={8} className="py-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{g.nome}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {g.qtd} comprovante{g.qtd === 1 ? "" : "s"} · {formatBRL(g.somaValor)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {g.qtdAbertos > 0
                          ? `${g.qtdAbertos} título${g.qtdAbertos === 1 ? "" : "s"} aberto${g.qtdAbertos === 1 ? "" : "s"} — ${formatBRL(g.valorAbertos)}`
                          : "Sem títulos abertos — vira saldo"}
                      </p>
                      {g.qtdAbertos > 0 && g.excedente > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          {formatBRL(g.excedente)} acima dos títulos — excedente vira saldo
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                  {g.linhas.map((c) => {
                    const idade = Number(c.idade_dias ?? 0);
                    const cartao = ehCartao(c.tipo_lido);
                    return (
                      <TableRow key={c.comprovante_id ?? `${g.chave}-${c.pedido_id}`}>
                        <TableCell className="text-right text-xs tabular-nums font-medium">
                          {formatBRL(Number(c.valor_lido ?? 0))}
                        </TableCell>
                        <TableCell className="text-xs uppercase">{c.tipo_lido ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          <span>{c.pagador_lido ?? "—"}</span>
                          {g.duplicada(c) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="ml-1.5 border-warning/40 text-warning text-[10px]">
                                    Possível duplicidade
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">
                                  Mesmo valor e mesma data para o mesmo cliente — conferir antes de
                                  confirmar.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">{dataBR(c.data_lida)}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-xs tabular-nums",
                            idade > 20
                              ? "font-medium text-destructive"
                              : idade > 7
                                ? "font-medium text-warning"
                                : "",
                          )}
                        >
                          {idade} d
                        </TableCell>
                        {/* Pedido é rastro de captura, não protagonista. */}
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {c.pedido_ref ?? "—"}
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px]",
                                    c.tem_portao_pendente
                                      ? "border-warning/40 text-warning"
                                      : "border-border text-muted-foreground",
                                  )}
                                >
                                  {c.tem_portao_pendente ? "Paga portão" : "Conta do cliente"}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">
                                {c.tem_portao_pendente
                                  ? "Há um portão de pagamento pendente: confirmar o comprovante quita esse portão."
                                  : "Sem portão pendente: o dinheiro credita a conta do CNPJ e aloca contra os títulos em aberto."}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="text-right">
                          {cartao ? (
                            <Badge variant="outline" className="border-border text-muted-foreground text-[10px]">
                              {c.pedido_id ? (
                                <Link to={`/pedidos/${c.pedido_id}`} className="hover:underline">
                                  Fecha na captura do cartão
                                </Link>
                              ) : (
                                "Fecha na captura do cartão"
                              )}
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => c.pedido_id && setConfirmarPedidoId(c.pedido_id)}
                            >
                              Confirmar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {confirmarPedidoId && (
        <ConfirmarPagamentoDialog
          pedidoId={confirmarPedidoId}
          aberto
          aoFechar={() => {
            setConfirmarPedidoId(null);
            qc.invalidateQueries({ queryKey: ["comprovante-pendente-fila"] });
          }}
          modo="mesa"
        />
      )}
    </section>
  );
}

export function EntradasReconhecerTab() {
  const { data: entradas, isLoading, isError, error } = useEntradasReconhecer();
  const [ordenacao, setOrdenacao] = useState<OrdenacaoEntradas>(null);
  const [pagina, setPagina] = useState(1);
  const [tamanhoPagina, setTamanhoPagina] = useState(() =>
    lerTamanhoPaginaSalvo(CHAVE_PAGINA_ENTRADAS),
  );

  const ordenarPor = (coluna: ColunaEntradas) => {
    setOrdenacao((atual) => {
      if (!atual || atual.coluna !== coluna) return { coluna, dir: DIR_INICIAL_ENTRADAS[coluna] };
      const invertida: DirecaoOrdenacao = atual.dir === "asc" ? "desc" : "asc";
      // Fechou o ciclo: volta a ordem que a view entrega.
      return invertida === DIR_INICIAL_ENTRADAS[coluna] ? null : { coluna, dir: invertida };
    });
  };

  // Esta aba não tem busca — a página só reseta quando a ordem muda.
  useEffect(() => {
    setPagina(1);
  }, [ordenacao]);

  // TOPO-COLADO-SE-MEDE: o cabecalho da tabela cola logo abaixo dos KPIs, e a
  // altura deles muda (os cards quebram linha em tela menor). Mede, nao chuta.
  const kpisRef = useRef<HTMLDivElement>(null);
  const [alturaKpis, setAlturaKpis] = useState(0);

  useEffect(() => {
    const el = kpisRef.current;
    if (!el) return;
    const medir = () => setAlturaKpis(el.offsetHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = useMemo(
    () => (entradas ?? []).reduce((s, e) => s + Number(e.valor ?? 0), 0),
    [entradas],
  );

  // VAZIO-VAI-PRO-FIM: celula sem dado nunca ganha primeiro lugar, nos dois sentidos.
  const ordenadas = useMemo(() => {
    const base = entradas ?? [];
    if (!ordenacao) return base;
    const dir = ordenacao.dir === "asc" ? 1 : -1;
    const valorDe = (e: EntradaReconhecer): string | number | null => {
      switch (ordenacao.coluna) {
        case "data": {
          const t = Date.parse(e.data_transacao);
          return Number.isNaN(t) ? null : t;
        }
        case "valor": return Number(e.valor ?? 0);
        case "pagador": return e.contraparte_nome ?? null;
        case "documento": return e.contraparte_documento ?? null;
        case "descricao": return e.descricao ?? null;
        case "dias": return diasNaFila(e.data_transacao);
        default: return null;
      }
    };
    return [...base].sort((a, b) => {
      const va = valorDe(a);
      const vb = valorDe(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * dir;
      }
      return (Number(va) - Number(vb)) * dir;
    });
  }, [entradas, ordenacao]);

  const totalPaginasEntradas = Math.max(1, Math.ceil(ordenadas.length / tamanhoPagina));
  const paginaAtual = Math.min(pagina, totalPaginasEntradas);
  const paginaItens = ordenadas.slice(
    (paginaAtual - 1) * tamanhoPagina,
    paginaAtual * tamanhoPagina,
  );

  return (
    <div
      className="space-y-3"
      style={{ "--fila-topo-colado": `${ALTURA_CASA_HEADER + alturaKpis}px` } as CSSProperties}
    >
      <ComprovantesAguardandoBloco />


      <p className="text-[11px] text-muted-foreground leading-relaxed max-w-3xl">
        A varredura automática roda de hora em hora (documento do pagador, pagadores conhecidos e
        chaves de comprovante). O que aparece aqui é o que ela não reconheceu — um clique ensina o
        sistema.
      </p>

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar a fila</AlertTitle>
          <AlertDescription>{(error as any)?.message ?? "Erro desconhecido."}</AlertDescription>
        </Alert>
      )}

      <div
        ref={kpisRef}
        className="sticky top-16 z-20 grid grid-cols-2 md:grid-cols-4 gap-3 bg-background py-2"
      >
        <div className="rounded-md border border-border/60 bg-card p-2.5">
          <p className="text-[11px] text-muted-foreground">Entradas na fila</p>
          <p className="text-sm font-medium">{isError ? "—" : (entradas ?? []).length}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-card p-2.5">
          <p className="text-[11px] text-muted-foreground">Valor a reconhecer</p>
          <p className="text-sm font-medium text-warning">{isError ? "—" : formatBRL(total)}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <>
        <div className="rounded-md border border-border/60 bg-card">
          <Table containerClassName="overflow-visible">
            <TableHeader>
              <TableRow className={LINHA_CABECALHO_COLADO}>
                <CabecalhoOrdenavel rotulo="Data" dir={ordenacao?.coluna === "data" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("data")} />
                <CabecalhoOrdenavel rotulo="Valor" className="text-right" alinharDireita dir={ordenacao?.coluna === "valor" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("valor")} />
                <CabecalhoOrdenavel rotulo="Pagador" dir={ordenacao?.coluna === "pagador" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("pagador")} />
                <CabecalhoOrdenavel rotulo="Documento" dir={ordenacao?.coluna === "documento" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("documento")} />
                <CabecalhoOrdenavel rotulo="Descrição" dir={ordenacao?.coluna === "descricao" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("descricao")} />
                <CabecalhoOrdenavel rotulo="Dias na fila" className="text-right" alinharDireita dir={ordenacao?.coluna === "dias" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("dias")} />
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenadas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                    Nada pendente — a varredura reconheceu tudo.
                  </TableCell>
                </TableRow>
              )}
              {paginaItens.map((e) => {
                const dias = diasNaFila(e.data_transacao);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{dataBR(e.data_transacao)}</TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      {formatBRL(e.valor)}
                    </TableCell>
                    <TableCell className="text-xs">{e.contraparte_nome ?? "—"}</TableCell>
                    <TableCell className="text-xs">{e.contraparte_documento ?? "—"}</TableCell>
                    <TableCell
                      className="text-xs text-muted-foreground max-w-[280px] truncate"
                      title={e.descricao}
                    >
                      {e.descricao}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right text-xs",
                        dias >= 7 ? "text-warning font-medium" : "",
                      )}
                    >
                      {dias}
                    </TableCell>
                    <TableCell className="text-right">
                      <AtribuirCliente entrada={e} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <RodapePaginacao
          total={ordenadas.length}
          pagina={paginaAtual}
          tamanhoPagina={tamanhoPagina}
          chavePreferencia={CHAVE_PAGINA_ENTRADAS}
          onPagina={setPagina}
          onTamanhoPagina={(n) => setTamanhoPagina(n as PageSizeOption)}
        />
        </>
      )}
    </div>
  );
}
