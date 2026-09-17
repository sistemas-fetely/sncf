import { useEffect, useMemo, useState } from "react";
import { usePrimeiroPagamentoFila } from "@/hooks/credito/usePrimeiroPagamentoFila";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, Info } from "lucide-react";
import { formatCNPJ } from "@/lib/cnpj";
import { formatBRL } from "@/lib/format-currency";
import { ConfirmarPagamentoDialog } from "@/components/pedidos/dialogs/ConfirmarPagamentoDialog";
import {
  CabecalhoOrdenavel,
  LINHA_CABECALHO_COLADO,
  type DirecaoOrdenacao,
} from "@/components/tabela/CabecalhoOrdenavel";
import {
  RodapePaginacao,
  lerTamanhoPaginaSalvo,
  type PageSizeOption,
} from "@/components/tabela/RodapePaginacao";

const fmtDate = (iso: string) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";

type ColunaPrimeiroPgto =
  | "pedido" | "parceiro" | "valor" | "vencimento" | "tipo" | "dias";

type OrdenacaoPrimeiroPgto = { coluna: ColunaPrimeiroPgto; dir: DirecaoOrdenacao } | null;

/** Vencimento sobe: o mais proximo primeiro. Dias na fila desce: quem espera mais aparece antes. */
const DIR_INICIAL_PRIMEIRO_PGTO: Record<ColunaPrimeiroPgto, DirecaoOrdenacao> = {
  pedido: "asc", parceiro: "asc", valor: "desc",
  vencimento: "asc", tipo: "asc", dias: "desc",
};

const CHAVE_PAGINA_PRIMEIRO_PGTO = "fetely:cobranca:primeiro-pagamento:page-size";

export default function PrimeiroPagamentoTab() {
  const [busca, setBusca] = useState("");
  const { data, isLoading } = usePrimeiroPagamentoFila({ busca: busca || undefined });
  const total = data?.length ?? 0;

  // REFERENCIA-SEMPRE: uma única tela de confirmação, modo SOPS (anexo opcional).
  const [confirmando, setConfirmando] = useState<{ pedidoId: string } | null>(null);

  const [ordenacao, setOrdenacao] = useState<OrdenacaoPrimeiroPgto>(null);
  const [pagina, setPagina] = useState(1);
  const [tamanhoPagina, setTamanhoPagina] = useState(() =>
    lerTamanhoPaginaSalvo(CHAVE_PAGINA_PRIMEIRO_PGTO),
  );

  const ordenarPor = (coluna: ColunaPrimeiroPgto) => {
    setOrdenacao((atual) => {
      if (!atual || atual.coluna !== coluna)
        return { coluna, dir: DIR_INICIAL_PRIMEIRO_PGTO[coluna] };
      const invertida: DirecaoOrdenacao = atual.dir === "asc" ? "desc" : "asc";
      // Fechou o ciclo: volta a ordem que a consulta entrega.
      return invertida === DIR_INICIAL_PRIMEIRO_PGTO[coluna] ? null : { coluna, dir: invertida };
    });
  };

  useEffect(() => {
    setPagina(1);
  }, [busca, ordenacao]);

  // VAZIO-VAI-PRO-FIM: celula sem dado nunca ganha primeiro lugar.
  const ordenados = useMemo(() => {
    const lista = data ?? [];
    if (!ordenacao) return lista;
    const dir = ordenacao.dir === "asc" ? 1 : -1;
    const valorDe = (p: (typeof lista)[number]): string | number | null => {
      switch (ordenacao.coluna) {
        case "pedido": return p.id_externo || null;
        case "parceiro": return p.parceiro_nome || null;
        case "valor": return Number(p.valor ?? 0);
        case "vencimento": {
          const t = p.data_vencimento ? Date.parse(p.data_vencimento) : NaN;
          return Number.isNaN(t) ? null : t;
        }
        case "tipo": return p.tipo_pagamento || null;
        case "dias": return Number(p.dias_aguardando ?? 0);
        default: return null;
      }
    };
    return [...lista].sort((a, b) => {
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
  }, [data, ordenacao]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / tamanhoPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const paginaItens = ordenados.slice(
    (paginaAtual - 1) * tamanhoPagina,
    paginaAtual * tamanhoPagina,
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {total} portão(ões) aguardando confirmação de pagamento
      </p>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Confirme o pagamento quando o cliente quitar o portão. O pedido então avança para pré-faturamento com os títulos definitivos.
          Portão em <strong>cartão</strong> tem caminho próprio: uma autorização cobre a venda inteira, então ele fecha pela captura (NSU) e não por confirmação manual.
        </AlertDescription>
      </Alert>

      <div className="relative max-w-sm">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por ID, razão social ou CNPJ..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="rounded-md border bg-card">
        <Table containerClassName="overflow-visible">
          <TableHeader>
            <TableRow className={LINHA_CABECALHO_COLADO}>
              <CabecalhoOrdenavel rotulo="Pedido" dir={ordenacao?.coluna === "pedido" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("pedido")} />
              <CabecalhoOrdenavel rotulo="Parceiro" dir={ordenacao?.coluna === "parceiro" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("parceiro")} />
              <CabecalhoOrdenavel rotulo="Valor do portão" className="text-right" alinharDireita dir={ordenacao?.coluna === "valor" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("valor")} />
              <CabecalhoOrdenavel rotulo="Vencimento" dir={ordenacao?.coluna === "vencimento" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("vencimento")} />
              <CabecalhoOrdenavel rotulo="Tipo" dir={ordenacao?.coluna === "tipo" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("tipo")} />
              <CabecalhoOrdenavel rotulo="Dias aguardando" dir={ordenacao?.coluna === "dias" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("dias")} />
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-6">
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && ordenados.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhum portão aguardando pagamento.
                </TableCell>
              </TableRow>
            )}
            {paginaItens.map((p) => (
              <TableRow key={p.portao_id}>
                <TableCell>
                  <span className="font-mono text-xs font-medium text-primary">
                    {p.id_externo}
                  </span>
                </TableCell>
                <TableCell>
                  <p className="text-sm font-medium">{p.parceiro_nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.parceiro_cnpj ? formatCNPJ(p.parceiro_cnpj) : "—"}
                  </p>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatBRL(p.valor)}
                </TableCell>
                <TableCell>{fmtDate(p.data_vencimento)}</TableCell>
                <TableCell className="text-sm capitalize">{p.tipo_pagamento}</TableCell>
                <TableCell className="text-sm">
                  {p.dias_aguardando} dia{p.dias_aguardando !== 1 ? "s" : ""}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    onClick={() => setConfirmando({ pedidoId: p.pedido_id })}
                  >
                    {p.tipo_pagamento === "cartao" ? "Confirmar captura" : "Confirmar pagamento"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <RodapePaginacao
        total={ordenados.length}
        pagina={paginaAtual}
        tamanhoPagina={tamanhoPagina}
        chavePreferencia={CHAVE_PAGINA_PRIMEIRO_PGTO}
        onPagina={setPagina}
        onTamanhoPagina={(n) => setTamanhoPagina(n as PageSizeOption)}
      />

      {confirmando && (
        <ConfirmarPagamentoDialog
          pedidoId={confirmando.pedidoId}
          aberto
          aoFechar={() => setConfirmando(null)}
          modo="sops"
        />
      )}
    </div>
  );
}
