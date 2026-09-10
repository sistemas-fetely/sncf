// Cartório de Códigos — livro-razão de identidade de produto (cod_cadastro, EAN,
// DUN, Inner). 1.500 linhas importadas da planilha do Flavio em 07/09/2026.
// Nada escreve na tabela por fora da RPC fn_cartorio_alocar: aqui o front só
// pede proposta (dry run), mostra e confirma.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type LinhaCartorio = {
  cod_cadastro: string | null;
  ean: string | null;
  dun: string | null;
  inner_qtd: number | null;
  sku_cartorio: string | null;
  banco_ean: string | null;
  estado: string | null;
  sku_cadastro: string | null;
  fase: string | null;
  nome_comercial: string | null;
  produto_existe: boolean | null;
  situacao: string | null;
};

type BancoEan = {
  prefixo: string | null;
  descricao: string | null;
  total_licenciado: number | null;
  cod_inicio: string | null;
  cod_fim: string | null;
  esgotado: boolean | null;
  observacao: string | null;
};

type CodigoProposto = {
  cod_cadastro: string | null;
  ean: string | null;
  dun: string | null;
  inner_qtd: number | null;
  sku_sugerido: string | null;
};

type RespostaAlocacao = {
  dry_run?: boolean;
  alocaria?: number;
  alocados?: number;
  livres_depois?: number;
  codigos?: CodigoProposto[];
};

const SITUACOES: { id: string; label: string }[] = [
  { id: "livre", label: "Livres" },
  { id: "reservado_sem_produto", label: "Reservados sem produto" },
  { id: "ok", label: "Em uso" },
  { id: "condicionado", label: "Condicionados" },
  { id: "divergente", label: "Divergentes" },
];

const RESUMO_ORDEM = ["livre", "reservado_sem_produto", "ok", "condicionado"];

const POR_PAGINA = 50;

function BadgeSituacao({ situacao }: { situacao: string | null }) {
  const rotulo = SITUACOES.find((s) => s.id === situacao)?.label ?? situacao ?? "—";
  if (situacao === "divergente") return <Badge variant="destructive">{rotulo}</Badge>;
  if (situacao === "ok") return <Badge variant="secondary" className="bg-success/15 text-success">{rotulo}</Badge>;
  if (situacao === "livre") return <Badge variant="secondary" className="bg-info/15 text-info">{rotulo}</Badge>;
  if (situacao === "reservado_sem_produto") return <Badge variant="outline" className="border-warning/50 text-warning">{rotulo}</Badge>;
  return <Badge variant="outline">{rotulo}</Badge>;
}

export default function CartorioCodigos() {
  const qc = useQueryClient();

  const [qtd, setQtd] = useState("");
  const [inner, setInner] = useState("");
  const [motivo, setMotivo] = useState("");
  const [proposta, setProposta] = useState<RespostaAlocacao | null>(null);
  const [carregandoProposta, setCarregandoProposta] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const [filtroSituacao, setFiltroSituacao] = useState<string>("todas");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);

  const linhas = useQuery({
    queryKey: ["cartorio-situacao"],
    queryFn: async (): Promise<LinhaCartorio[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_cartorio_situacao")
        .select("*")
        .order("cod_cadastro", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinhaCartorio[];
    },
  });

  const bancos = useQuery({
    queryKey: ["cartorio-banco-ean"],
    queryFn: async (): Promise<BancoEan[]> => {
      const { data, error } = await (supabase as any)
        .from("cartorio_banco_ean")
        .select("*")
        .order("prefixo", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BancoEan[];
    },
  });

  const contagem = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const l of linhas.data ?? []) {
      const s = l.situacao ?? "sem_situacao";
      mapa[s] = (mapa[s] ?? 0) + 1;
    }
    return mapa;
  }, [linhas.data]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (linhas.data ?? []).filter((l) => {
      if (filtroSituacao !== "todas" && l.situacao !== filtroSituacao) return false;
      if (!termo) return true;
      return [l.cod_cadastro, l.ean, l.dun, l.sku_cartorio, l.sku_cadastro]
        .some((v) => (v ?? "").toLowerCase().includes(termo));
    });
  }, [linhas.data, filtroSituacao, busca]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = filtradas.slice(paginaAtual * POR_PAGINA, paginaAtual * POR_PAGINA + POR_PAGINA);

  async function chamarRpc(dryRun: boolean): Promise<RespostaAlocacao> {
    const nQtd = Number(qtd);
    const nInner = Number(inner);
    if (!Number.isFinite(nQtd) || nQtd <= 0) throw new Error("Informe a quantidade de códigos.");
    if (!Number.isFinite(nInner) || nInner <= 0) {
      throw new Error("Inner é obrigatório. Vem do packing list da fábrica — não se inventa.");
    }
    if (!motivo.trim()) throw new Error("Informe o motivo (para qual PI / pedido).");

    const { data, error } = await (supabase as any).rpc("fn_cartorio_alocar", {
      p_qtd: nQtd,
      p_inner: nInner,
      p_motivo: motivo.trim(),
      p_dry_run: dryRun,
    });
    if (error) throw new Error(error.message);
    return (data ?? {}) as RespostaAlocacao;
  }

  async function verProposta() {
    setCarregandoProposta(true);
    try {
      const r = await chamarRpc(true);
      setProposta(r);
      toast.success(`Proposta gerada: ${r.alocaria ?? r.codigos?.length ?? 0} código(s).`);
    } catch (e: any) {
      setProposta(null);
      toast.error(e?.message ?? "Falha ao gerar a proposta.");
    } finally {
      setCarregandoProposta(false);
    }
  }

  async function confirmar() {
    setConfirmando(true);
    try {
      const r = await chamarRpc(false);
      toast.success(
        `${r.alocados ?? r.codigos?.length ?? 0} código(s) alocado(s). Livres depois: ${r.livres_depois ?? "—"}.`
      );
      setProposta(null);
      setQtd("");
      setInner("");
      setMotivo("");
      await qc.invalidateQueries({ queryKey: ["cartorio-situacao"] });
      await qc.invalidateQueries({ queryKey: ["cartorio-banco-ean"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao confirmar a alocação.");
    } finally {
      setConfirmando(false);
    }
  }

  const livres = contagem["livre"] ?? 0;

  return (
    <PageShell>
      <PageHeader
        titulo="Cartório de Códigos"
        estado="Livro-razão de identidade de produto — cod_cadastro, EAN, DUN e Inner."
        breadcrumb={[
          { label: "Produto", href: "/vendas/produto" },
          { label: "Cartório de Códigos" },
        ]}
      />

      {/* 1 — Resumo por situação */}
      {linhas.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar o cartório: {(linhas.error as any)?.message ?? "erro desconhecido"}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {RESUMO_ORDEM.map((id) => {
          const rotulo = SITUACOES.find((s) => s.id === id)?.label ?? id;
          const destaque = id === "livre" && livres < 50;
          return (
            <Card key={id} className={destaque ? "border-warning/60 bg-warning/5" : undefined}>
              <CardHeader className="pb-2">
                <CardDescription>{rotulo}</CardDescription>
                <CardTitle className="text-2xl">
                  {linhas.isLoading ? "…" : (contagem[id] ?? 0).toLocaleString("pt-BR")}
                </CardTitle>
              </CardHeader>
              {destaque ? (
                <CardContent className="pt-0 text-xs text-warning">
                  Estoque de códigos livres abaixo de 50.
                </CardContent>
              ) : null}
            </Card>
          );
        })}
      </div>

      {/* 2 — Bancos de EAN */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bancos de EAN</CardTitle>
          <CardDescription>Faixas licenciadas na GS1.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {bancos.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando bancos…
            </div>
          ) : bancos.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                Não foi possível carregar os bancos: {(bancos.error as any)?.message ?? "erro desconhecido"}
              </AlertDescription>
            </Alert>
          ) : (bancos.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum banco cadastrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prefixo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Faixa</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(bancos.data ?? []).map((b) => (
                  <TableRow key={b.prefixo ?? Math.random()}>
                    <TableCell className="font-mono text-xs">{b.prefixo ?? "—"}</TableCell>
                    <TableCell className="text-sm">{b.descricao ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {b.cod_inicio ?? "—"}–{b.cod_fim ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {(b.total_licenciado ?? 0).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      {b.esgotado ? <Badge variant="outline">Esgotado</Badge> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Ao aproximar de 02394, licenciar nova faixa na GS1 — é evento externo, não regra do sistema.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* 3 — Alocar códigos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alocar códigos</CardTitle>
          <CardDescription>
            A alocação só acontece pela RPC do cartório. Veja a proposta antes de confirmar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cartorio-qtd">Quantidade</Label>
              <Input
                id="cartorio-qtd"
                type="number"
                min={1}
                value={qtd}
                onChange={(e) => { setQtd(e.target.value); setProposta(null); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cartorio-inner">Inner</Label>
              <Input
                id="cartorio-inner"
                type="number"
                min={1}
                value={inner}
                onChange={(e) => { setInner(e.target.value); setProposta(null); }}
              />
              <p className="text-xs text-muted-foreground">
                Vem do packing list da fábrica, coluna inner box da PI. Não se inventa.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cartorio-motivo">Motivo</Label>
              <Input
                id="cartorio-motivo"
                placeholder="para qual PI / pedido"
                value={motivo}
                onChange={(e) => { setMotivo(e.target.value); setProposta(null); }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={verProposta} disabled={carregandoProposta}>
              {carregandoProposta ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Ver proposta
            </Button>
            <Button onClick={confirmar} disabled={!proposta || confirmando}>
              {confirmando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar alocação
            </Button>
          </div>

          {proposta ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm">
                Proposta: <strong>{proposta.alocaria ?? proposta.codigos?.length ?? 0}</strong> código(s).
                {typeof proposta.livres_depois === "number"
                  ? ` Livres depois: ${proposta.livres_depois}.`
                  : null}
              </p>
              {(proposta.codigos ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum código proposto.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cod. cadastro</TableHead>
                      <TableHead>EAN</TableHead>
                      <TableHead>DUN</TableHead>
                      <TableHead>SKU sugerido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(proposta.codigos ?? []).map((c) => (
                      <TableRow key={`${c.cod_cadastro}-${c.ean}`}>
                        <TableCell className="font-mono text-xs">{c.cod_cadastro ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{c.ean ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{c.dun ?? "—"}</TableCell>
                        <TableCell className="text-sm">{c.sku_sugerido ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* 4 — Consulta */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consulta</CardTitle>
          <CardDescription>
            {linhas.isLoading ? "Carregando…" : `${filtradas.length.toLocaleString("pt-BR")} linha(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar por cod_cadastro, EAN ou SKU"
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
              />
            </div>
            <Select
              value={filtroSituacao}
              onValueChange={(v) => { setFiltroSituacao(v); setPagina(0); }}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as situações</SelectItem>
                {SITUACOES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {linhas.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando cartório…
            </div>
          ) : visiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma linha para este filtro.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cod. cadastro</TableHead>
                    <TableHead>EAN</TableHead>
                    <TableHead>DUN</TableHead>
                    <TableHead className="text-right">Inner</TableHead>
                    <TableHead>SKU cartório</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Nome comercial</TableHead>
                    <TableHead>Fase</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((l) => (
                    <TableRow key={`${l.cod_cadastro}-${l.ean}`}>
                      <TableCell className="font-mono text-xs">{l.cod_cadastro ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.ean ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.dun ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm">{l.inner_qtd ?? "—"}</TableCell>
                      <TableCell className="text-sm">{l.sku_cartorio ?? "—"}</TableCell>
                      <TableCell><BadgeSituacao situacao={l.situacao} /></TableCell>
                      <TableCell className="max-w-[280px] truncate text-sm">{l.nome_comercial ?? "—"}</TableCell>
                      <TableCell className="text-sm">{l.fase ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Página {paginaAtual + 1} de {totalPaginas}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={paginaAtual === 0}
                    onClick={() => setPagina(paginaAtual - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={paginaAtual >= totalPaginas - 1}
                    onClick={() => setPagina(paginaAtual + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 5 — Nota de rodapé */}
      <p className="text-xs text-muted-foreground">
        Os 105 condicionados vêm do banco 0631911 (esgotado): EAN e DUN cunhados 1:1, só servem para
        produto cuja inner é a menor unidade. Não entram na fila normal de alocação.
      </p>
    </PageShell>
  );
}
