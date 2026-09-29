import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Loader2, Wrench } from "lucide-react";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { lerColecoesUrl, gravarColecoesUrl } from "@/components/acervo/BlingCardPainel";
import { XpmCadastroFila } from "@/components/acervo/XpmCadastroFila";

interface LinhaDivergencia {
  cod_cadastro: string | null;
  sku: string | null;
  fase: string | null;
  nome_comercial: string | null;
  grupo: string | null;
  xpm_produto_id: number | null;
  codigo_xpm: string | null;
  classe: string | null;
  ncm_sncf: string | null;
  ncm_xpm: string | null;
  ean_sncf: string | null;
  ean_xpm: string | null;
  peso_kg_sncf: number | null;
  peso_kg_xpm: number | null;
  categoria_xpm: string | null;
  chegada_prevista: string | null;
  pedido_importacao: string | null;
  colecao: string | null;
}

interface ResultadoSku {
  sku?: string;
  status?: string;
  erro?: string;
  [k: string]: unknown;
}

function num(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

export function XpmCadastroPainel() {
  const qc = useQueryClient();
  const [resultados, setResultados] = useState<ResultadoSku[]>([]);

  // Guarda de escrita: cadastrar/corrigir no XPM exige a ação nomeada.
  // Enquanto a verificação carrega, os botões ficam travados — default seguro.
  const { permitido: podeCadastrarXpm, carregando: carregandoPermissao } =
    usePermissaoAcaoOuSuperAdmin("acao.cadastrar_produto_xpm");
  const tituloSemPermissao = carregandoPermissao
    ? "Verificando permissão…"
    : "Requer a permissão “Cadastrar produto no XPM” (acao.cadastrar_produto_xpm)";

  const { data: linhas, isLoading, isError, error } = useQuery({
    queryKey: ["xpm-cadastro-divergencia"],
    queryFn: async (): Promise<LinhaDivergencia[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_xpm_cadastro_divergencia")
        .select("cod_cadastro, sku, fase, nome_comercial, grupo, xpm_produto_id, codigo_xpm, classe, ncm_sncf, ncm_xpm, ean_sncf, ean_xpm, peso_kg_sncf, peso_kg_xpm, categoria_xpm, chegada_prevista, pedido_importacao, colecao")
        .order("cod_cadastro", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinhaDivergencia[];
    },
  });

  // Filtro por coleção — vive na URL (?colecao=) para o link poder ser compartilhado.
  const [colecaoUrl, setColecaoUrl] = useAbaUrl("", undefined, "colecao");
  const colecaoFiltro = useMemo(() => lerColecoesUrl(colecaoUrl), [colecaoUrl]);
  const setColecaoFiltro = (l: string[]) => setColecaoUrl(gravarColecoesUrl(l));

  const colecoes = useMemo(() => {
    const cont = new Map<string, number>();
    for (const l of linhas ?? []) {
      const c = (l.colecao ?? "").trim();
      if (!c) continue;
      cont.set(c, (cont.get(c) ?? 0) + 1);
    }
    return [...cont.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [linhas]);

  // Coleção escolhida deixou de existir na fila → volta para "Todas as coleções".
  useEffect(() => {
    if (isLoading) return;
    const validas = colecaoFiltro.filter((f) => colecoes.some(([c]) => c === f));
    if (validas.length !== colecaoFiltro.length) setColecaoUrl(gravarColecoesUrl(validas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, colecoes, colecaoUrl]);

  // A coleção filtra a base de todos os blocos (combina E com os filtros de classe já existentes).
  const porColecao = useMemo(
    () =>
      colecaoFiltro.length
        ? (linhas ?? []).filter((l) => colecaoFiltro.includes((l.colecao ?? "").trim()))
        : linhas ?? [],
    [linhas, colecaoFiltro],
  );

  const vendaveisFora = useMemo(
    () => filaCadastro(porColecao, "FALTA_NO_XPM_E_VENDAVEL"),
    [porColecao],
  );
  const saude = useMemo(
    () => porColecao.filter((l) => l.classe === "PESO_DIVERGE" || l.classe === "NCM_DIVERGE"),
    [porColecao],
  );
  const preVenda = useMemo(
    () => filaCadastro(porColecao, "FALTA_NO_XPM"),
    [porColecao],
  );

  const corrigirCategoria = useMutation({
    mutationFn: async (sku: string) => {
      const { data, error } = await supabase.functions.invoke("gerar-planilha-xpm", {
        body: { tipo: "corrigir_categoria_xpm", skus: [sku] },
      });
      if (error) throw error;
      return (data?.resultados ?? []) as ResultadoSku[];
    },
    onSuccess: (res) => {
      const r = res[0];
      if (r && r.status && r.status !== "ok") {
        toast.error(`Categoria não corrigida (${r.status}): ${r.erro ?? "sem detalhe"}`);
      } else {
        toast.success("Categoria corrigida no XPM");
      }
      void qc.invalidateQueries({ queryKey: ["xpm-cadastro-divergencia"] });
    },
    onError: (e) => toast.error(`Falha ao corrigir categoria: ${formatError(e)}`),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando o cruzamento com o XPM…
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar o cruzamento com o XPM</AlertTitle>
        <AlertDescription className="text-xs">{formatError(error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <XpmCadastroFila />

      {/* BLOCO 2 — higiene */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Saúde do cadastro no WMS</CardTitle>
          <p className="text-sm text-muted-foreground">
            Divergências de dado em produtos já cadastrados. O peso 10,11 kg e o lastro 10000 são resíduo da carga
            inicial do XPM (cods 01000–01587), não erro por produto.
          </p>
        </CardHeader>
        <CardContent>
          {saude.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma divergência de dado.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Nome comercial</TableHead>
                    <TableHead className="text-right">Peso SNCF</TableHead>
                    <TableHead className="text-right">Peso XPM</TableHead>
                    <TableHead>NCM SNCF</TableHead>
                    <TableHead>NCM XPM</TableHead>
                    <TableHead>Categoria XPM</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saude.map((l) => (
                    <TableRow key={l.sku ?? l.cod_cadastro}>
                      <TableCell className="font-mono text-xs">{l.sku ?? "—"}</TableCell>
                      <TableCell className="text-xs">{l.nome_comercial ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">{num(l.peso_kg_sncf)}</TableCell>
                      <TableCell className="text-right text-xs">{num(l.peso_kg_xpm)}</TableCell>
                      <TableCell className="font-mono text-xs">{l.ncm_sncf ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.ncm_xpm ?? "—"}</TableCell>
                      <TableCell className="text-xs">{l.categoria_xpm ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {l.categoria_xpm === "BLOCADO PARA RESSONANCIA" && l.sku && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            disabled={corrigirCategoria.isPending || !podeCadastrarXpm}
                            title={!podeCadastrarXpm ? tituloSemPermissao : undefined}
                            onClick={() => corrigirCategoria.mutate(l.sku as string)}
                          >
                            {corrigirCategoria.isPending
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Wrench className="h-3.5 w-3.5" />}
                            Corrigir categoria
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
