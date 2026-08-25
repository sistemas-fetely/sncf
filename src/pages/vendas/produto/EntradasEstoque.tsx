import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, PackagePlus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { PageShell } from "@/components/layout/PageShell";
import { PageTitle } from "@/components/layout/PageTitle";
import { CardIndicador } from "@/components/ui/card-indicador";
import { TabelaFetely } from "@/components/ui/tabela-fetely";
import { Selo } from "@/components/ui/selo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
import { hojeISO } from "@/lib/data";
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ============================================================================
// Tipos — espelham vw_estoque_entradas
// ============================================================================

interface EntradaLinha {
  id: string;
  data: string | null;
  doc_tipo: string | null;
  doc_numero: string | null;
  termo: string | null;
  motivo: string | null;
  motivo_rotulo: string | null;
  condicao: string | null;
  classe: string | null;
  centro: string | null;
  centro_nome: string | null;
  sku: string | null;
  nome_comercial: string | null;
  quantidade: number | null;
  custo_unitario: number | null;
  valor: number | null;
  importacao_pedido_id: number | null;
  numero_pedido: string | null;
  nf_numero: string | null;
  nf_data: string | null;
  fornecedor: string | null;
  origem: string | null;
  obs: string | null;
  criado_em: string | null;
}

interface Lote {
  chave: string;
  data: string | null;
  termo: string | null;
  numero_pedido: string | null;
  nf_numero: string | null;
  fornecedor: string | null;
  motivo_rotulo: string | null;
  centro: string | null;
  centro_nome: string | null;
  skus: number;
  quantidade: number;
  valor: number;
  linhas: EntradaLinha[];
}

const NUM = new Intl.NumberFormat("pt-BR");

const fmtQtd = (v: number | null | undefined) => (v == null ? "—" : NUM.format(Number(v)));

/** Desconhecido nao e zero: custo nulo aparece como travessao. */
const fmtCusto = (v: number | null | undefined) => (v == null ? "—" : formatBRL(Number(v)));

function isoDiasAtras(dias: number): string {
  const [a, m, d] = hojeISO().split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}


export default function EntradasEstoque() {
  const [de, setDe] = useState(() => isoDiasAtras(90));
  const [ate, setAte] = useState(() => hojeISO());
  const [centro, setCentro] = useState("todos");
  const [motivo, setMotivo] = useState("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  const entradasQ = useQuery({
    queryKey: ["estoque-entradas", de, ate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_estoque_entradas" as never)
        .select(
          "id, data, doc_tipo, doc_numero, termo, motivo, motivo_rotulo, condicao, classe, centro, centro_nome, sku, nome_comercial, quantidade, custo_unitario, valor, importacao_pedido_id, numero_pedido, nf_numero, nf_data, fornecedor, origem, obs, criado_em",
        )
        .gte("data", de)
        .lte("data", ate)
        .order("data", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as unknown as EntradaLinha[];
    },
  });

  const todas = useMemo(() => entradasQ.data ?? [], [entradasQ.data]);

  const centros = useMemo(() => {
    const m = new Map<string, string>();
    todas.forEach((l) => {
      if (l.centro) m.set(l.centro, l.centro_nome ?? l.centro);
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [todas]);

  const motivos = useMemo(() => {
    const m = new Map<string, string>();
    todas.forEach((l) => {
      if (l.motivo) m.set(l.motivo, l.motivo_rotulo ?? l.motivo);
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [todas]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return todas.filter((l) => {
      if (centro !== "todos" && l.centro !== centro) return false;
      if (motivo !== "todos" && l.motivo !== motivo) return false;
      if (!t) return true;
      return (
        (l.sku ?? "").toLowerCase().includes(t) ||
        (l.nome_comercial ?? "").toLowerCase().includes(t) ||
        (l.termo ?? "").toLowerCase().includes(t) ||
        (l.nf_numero ?? "").toLowerCase().includes(t) ||
        (l.numero_pedido ?? "").toLowerCase().includes(t)
      );
    });
  }, [todas, centro, motivo, busca]);

  const indicadores = useMemo(() => {
    let qtd = 0;
    let valor = 0;
    let semCusto = 0;
    filtradas.forEach((l) => {
      qtd += Number(l.quantidade ?? 0);
      valor += Number(l.valor ?? 0);
      if (l.custo_unitario == null) semCusto += 1;
    });
    return { linhas: filtradas.length, qtd, valor, semCusto };
  }, [filtradas]);

  const lotes = useMemo(() => {
    const m = new Map<string, Lote>();
    filtradas.forEach((l) => {
      const chave = `${l.data ?? ""}|${l.termo ?? ""}|${l.centro ?? ""}`;
      let lote = m.get(chave);
      if (!lote) {
        lote = {
          chave,
          data: l.data,
          termo: l.termo,
          numero_pedido: l.numero_pedido,
          nf_numero: l.nf_numero,
          fornecedor: l.fornecedor,
          motivo_rotulo: l.motivo_rotulo,
          centro: l.centro,
          centro_nome: l.centro_nome,
          skus: 0,
          quantidade: 0,
          valor: 0,
          linhas: [],
        };
        m.set(chave, lote);
      }
      lote.linhas.push(l);
      lote.quantidade += Number(l.quantidade ?? 0);
      lote.valor += Number(l.valor ?? 0);
      if (!lote.numero_pedido && l.numero_pedido) lote.numero_pedido = l.numero_pedido;
      if (!lote.nf_numero && l.nf_numero) lote.nf_numero = l.nf_numero;
      if (!lote.fornecedor && l.fornecedor) lote.fornecedor = l.fornecedor;
    });
    const lista = Array.from(m.values());
    lista.forEach((lote) => {
      lote.skus = new Set(lote.linhas.map((l) => l.sku ?? "—")).size;
    });
    lista.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
    return lista;
  }, [filtradas]);

  const totalLotes = useMemo(() => {
    const s = new Set<string>();
    todas.forEach((l) => s.add(`${l.data ?? ""}|${l.termo ?? ""}|${l.centro ?? ""}`));
    return s.size;
  }, [todas]);

  return (
    <PageShell variant="dados">
      <PageTitle
        titulo="Entradas de Estoque"
        icone={PackagePlus}
        estado={`${formatDateBR(de)} a ${formatDateBR(ate)} · ${lotes.length} lote(s) no filtro`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <CardIndicador compacto rotulo="Entradas" valor={NUM.format(indicadores.linhas)} nota="linhas no período filtrado" />
        <CardIndicador compacto rotulo="Quantidade" valor={NUM.format(indicadores.qtd)} />
        <CardIndicador compacto rotulo="Valor" valor={formatBRL(indicadores.valor)} />
        <CardIndicador
          compacto
          rotulo="Sem custo"
          valor={NUM.format(indicadores.semCusto)}
          tom={indicadores.semCusto > 0 ? "atencao" : "neutro"}
          nota="linhas com custo unitário desconhecido"
        />
      </div>

      <TabelaFetely
        busca={{ valor: busca, aoMudar: setBusca, placeholder: "Buscar SKU, termo, NF ou pedido…" }}
        filtros={
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="entradas-de" className="text-[11px] text-muted-foreground">
                De
              </Label>
              <Input
                id="entradas-de"
                type="date"
                value={de}
                onChange={(e) => setDe(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="entradas-ate" className="text-[11px] text-muted-foreground">
                Até
              </Label>
              <Input
                id="entradas-ate"
                type="date"
                value={ate}
                onChange={(e) => setAte(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <Select value={centro} onValueChange={setCentro}>
              <SelectTrigger className="w-[200px]" aria-label="Filtrar por centro">
                <SelectValue placeholder="Todos os centros" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os centros</SelectItem>
                {centros.map(([cod, nome]) => (
                  <SelectItem key={cod} value={cod}>
                    {nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger className="w-[200px]" aria-label="Filtrar por motivo">
                <SelectValue placeholder="Todos os motivos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os motivos</SelectItem>
                {motivos.map(([cod, rotulo]) => (
                  <SelectItem key={cod} value={cod}>
                    {rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        carregando={entradasQ.isLoading}
        erro={entradasQ.isError ? formatError(entradasQ.error) : null}
        aoTentarNovamente={() => void entradasQ.refetch()}
        vazio={{
          mensagem:
            "Nenhuma entrada de estoque no período. Amplie o intervalo de datas — ou confira um recebimento na tela de Conferência de Devolução para ele nascer aqui.",
        }}
        semResultado="Nenhuma entrada para esse filtro."
        total={totalLotes}
        exibidos={lotes.length}
        rotulo="lotes"
      >
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Data</TableHead>
                <TableHead>Termo</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>NF</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Centro</TableHead>
                <TableHead className="text-right">SKUs</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lotes.map((lote) => {
                const expandido = aberto === lote.chave;
                return (
                  <Fragment key={lote.chave}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setAberto(expandido ? null : lote.chave)}
                    >
                      <TableCell>
                        {expandido ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatDateBR(lote.data)}</TableCell>
                      <TableCell className="font-medium">{lote.termo ?? "—"}</TableCell>
                      <TableCell>{lote.numero_pedido ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{lote.nf_numero ?? "—"}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{lote.fornecedor ?? "—"}</TableCell>
                      <TableCell>
                        {lote.motivo_rotulo ? (
                          <Selo estado="info">{lote.motivo_rotulo}</Selo>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {lote.centro_nome ?? lote.centro ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{NUM.format(lote.skus)}</TableCell>
                      <TableCell className="text-right tabular-nums">{NUM.format(lote.quantidade)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(lote.valor)}</TableCell>
                    </TableRow>
                    {expandido && (
                      <TableRow>
                        <TableCell colSpan={11} className="bg-muted/30 p-0">
                          <div className="overflow-x-auto p-3">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>SKU</TableHead>
                                  <TableHead>Produto</TableHead>
                                  <TableHead>Condição</TableHead>
                                  <TableHead className="text-right">Quantidade</TableHead>
                                  <TableHead className="text-right">Custo unit.</TableHead>
                                  <TableHead className="text-right">Valor</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {lote.linhas.map((l) => (
                                  <TableRow key={l.id}>
                                    <TableCell className="font-medium">{l.sku ?? "—"}</TableCell>
                                    <TableCell className="max-w-[320px] truncate">
                                      {l.nome_comercial ?? "—"}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                      {l.condicao ?? "—"}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {fmtQtd(l.quantidade)}
                                    </TableCell>
                                    <TableCell
                                      className={
                                        l.custo_unitario == null
                                          ? "text-right tabular-nums text-muted-foreground"
                                          : "text-right tabular-nums"
                                      }
                                    >
                                      {fmtCusto(l.custo_unitario)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {l.valor == null ? "—" : formatBRL(l.valor)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </TabelaFetely>
    </PageShell>
  );
}
