// Mesa do Produto — a fila de quem cuida do ciclo de vida do produto.
// Quatro recortes da mesma view vw_produto_mesa_fase. A promoção e a
// descontinuação passam pela edge function promover-fase-produto, que é
// quem manda no FOP (mestre do dado). Aqui só se decide e se mostra o erro.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, RefreshCw, ArrowUpCircle, AlertTriangle, PackageX, Search, CheckCircle2, Ban,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Linha = {
  sku: string;
  cod_cadastro: string | null;
  nome_comercial: string | null;
  nome_operacional: string | null;
  colecao: string | null;
  grupo: string | null;
  fase: string | null;
  fase_nome: string | null;
  fase_ordem: number | null;
  proxima_fase: string | null;
  tem_bling: boolean | null;
  falta_fase_atual: string[] | null;
  falta_proxima_fase: string[] | null;
  donos_pendencia: string[] | null;
  pronto_proxima_fase: boolean | null;
  saldo_disponivel: number | null;
  sugestao: string | null;
};

type AbaId = "prontos" | "bloqueados" | "sem_bling" | "furo";

const ABAS: { id: AbaId; label: string; sugestoes: string[] }[] = [
  { id: "prontos", label: "Prontos para promover", sugestoes: ["pronto_para_ativo"] },
  { id: "bloqueados", label: "Bloqueados", sugestoes: ["bloqueado"] },
  { id: "sem_bling", label: "Sem ficha no Bling", sugestoes: ["falta_ficha_bling", "ativo_sem_bling"] },
  { id: "furo", label: "Furo em produto ativo", sugestoes: ["ativo_com_furo"] },
];

const fmtNum = (v: number | null | undefined) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "0";

/** Erro estruturado devolvido pela edge function (409/422/502). */
type ErroFuncao = {
  status: number;
  corpo: any;
};

async function chamarPromocao(payload: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("promover-fase-produto", {
    body: payload,
  });

  if (error) {
    // FunctionsHttpError carrega a resposta com o corpo real (409/422/502).
    const resp = (error as any)?.context as Response | undefined;
    if (resp && typeof resp.json === "function") {
      let corpo: any = null;
      try {
        corpo = await resp.json();
      } catch (_) {
        try { corpo = { erro: await resp.text() }; } catch (_e) { corpo = null; }
      }
      throw { status: resp.status, corpo } as ErroFuncao;
    }
    throw { status: 0, corpo: { erro: error.message } } as ErroFuncao;
  }

  if (!data || data.ok !== true) {
    throw { status: 0, corpo: data ?? { erro: "Resposta vazia da função" } } as ErroFuncao;
  }
  return data;
}

export default function MesaProduto() {
  const [aba, setAba] = useState<AbaId>("prontos");
  const [busca, setBusca] = useState("");
  const [emAcao, setEmAcao] = useState<string | null>(null);

  // Diálogos de erro / confirmação
  const [confirmSaldo, setConfirmSaldo] = useState<{ sku: string; saldo: number } | null>(null);
  const [faltando, setFaltando] = useState<{ sku: string; campos: string[] } | null>(null);
  const [erroFop, setErroFop] = useState<{ sku: string; corpo: string } | null>(null);

  const lista = useQuery({
    queryKey: ["mesa-produto-fase"],
    queryFn: async (): Promise<Linha[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_produto_mesa_fase")
        .select("*")
        .order("cod_cadastro", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
  });

  const linhas = lista.data ?? [];

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return linhas;
    return linhas.filter((l) =>
      [l.cod_cadastro, l.sku, l.nome_comercial, l.nome_operacional]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [linhas, busca]);

  const porAba = useMemo(() => {
    const mapa = {} as Record<AbaId, Linha[]>;
    for (const a of ABAS) {
      mapa[a.id] = filtradas.filter((l) => l.sugestao && a.sugestoes.includes(l.sugestao));
    }
    return mapa;
  }, [filtradas]);

  function tratarErro(sku: string, e: unknown) {
    const err = e as ErroFuncao;
    const corpo = err?.corpo ?? {};
    if (err?.status === 409) {
      setConfirmSaldo({ sku, saldo: Number(corpo.saldo_disponivel ?? 0) });
      return;
    }
    if (err?.status === 422) {
      setFaltando({ sku, campos: Array.isArray(corpo.campos_faltando) ? corpo.campos_faltando : [] });
      return;
    }
    if (err?.status === 502) {
      const bruto = typeof corpo.fop_body === "string"
        ? corpo.fop_body
        : JSON.stringify(corpo.fop_body ?? corpo, null, 2);
      setErroFop({ sku, corpo: bruto });
      return;
    }
    toast.error(`Falha em ${sku}`, { description: corpo?.erro ?? "Erro sem detalhe." });
  }

  async function agir(sku: string, faseDestino: string, confirmarSaldo = false) {
    setEmAcao(sku);
    try {
      const r = await chamarPromocao({
        sku,
        fase_destino: faseDestino,
        ...(confirmarSaldo ? { confirmar_saldo: true } : {}),
      });
      toast.success(`${r.cod_cadastro ?? sku} — ${r.de ?? "?"} → ${r.para}`, {
        description: "Fase gravada no FOP e espelhada aqui.",
      });
      await lista.refetch();
    } catch (e) {
      tratarErro(sku, e);
    } finally {
      setEmAcao(null);
    }
  }

  const Identidade = ({ l }: { l: Linha }) => (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="text-base font-semibold tracking-tight">{l.cod_cadastro ?? "—"}</span>
        <span className="text-xs text-muted-foreground">{l.sku}</span>
      </div>
      <div className="truncate text-sm text-muted-foreground">
        {l.nome_comercial ?? l.nome_operacional ?? "—"}
      </div>
    </div>
  );

  const Chips = ({ itens, variante = "outline" as const }: { itens: string[] | null; variante?: "outline" | "secondary" }) => {
    if (!itens || itens.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {itens.map((c) => (
          <Badge key={c} variant={variante} className="text-[11px] font-normal">{c}</Badge>
        ))}
      </div>
    );
  };

  const BotaoDescontinuar = ({ l }: { l: Linha }) => {
    if (l.fase !== "ativo" && l.fase !== "pre_venda") return null;
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={emAcao === l.sku}
        onClick={() => agir(l.sku, "inativo")}
      >
        <Ban className="mr-1.5 h-3.5 w-3.5" />
        Descontinuar
      </Button>
    );
  };

  const Vazio = ({ texto }: { texto: string }) => (
    <div className="py-10 text-center text-sm text-muted-foreground">{texto}</div>
  );

  const Carregando = () => (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
    </div>
  );

  return (
    <PageShell>
      <PageHeader
        titulo="Mesa do Produto"
        icone={PackageX}
        estado={
          lista.isLoading
            ? "Carregando fila…"
            : `${linhas.length} produto(s) na fila do ciclo de vida`
        }
        acoes={
          <Button variant="outline" size="sm" onClick={() => lista.refetch()} disabled={lista.isFetching}>
            {lista.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
        }
      />

      {lista.isError && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Falha ao ler a fila: {(lista.error as Error)?.message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fila por situação</CardTitle>
          <CardDescription>
            Cada aba é um recorte da mesma leitura. O código de cadastro é o código de conversa.
          </CardDescription>
          <div className="relative pt-2 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por código de cadastro, SKU ou nome"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={aba} onValueChange={(v) => setAba(v as AbaId)}>
            <TabsList className="mb-4 flex-wrap">
              {ABAS.map((a) => (
                <TabsTrigger key={a.id} value={a.id} className="gap-2">
                  {a.label}
                  <Badge variant="secondary" className="text-[11px]">{porAba[a.id]?.length ?? 0}</Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            {/* 1 — Prontos para promover */}
            <TabsContent value="prontos">
              {lista.isLoading ? <Carregando /> : porAba.prontos.length === 0 ? (
                <Vazio texto="Nenhum produto pronto para promover agora." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Fase</TableHead>
                      <TableHead>Coleção · Grupo</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porAba.prontos.map((l) => (
                      <TableRow key={l.sku}>
                        <TableCell><Identidade l={l} /></TableCell>
                        <TableCell>
                          <Badge variant="outline">{l.fase_nome ?? l.fase ?? "—"}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {[l.colecao, l.grupo].filter(Boolean).join(" · ") || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <BotaoDescontinuar l={l} />
                            <Button
                              size="sm"
                              disabled={emAcao === l.sku}
                              onClick={() => agir(l.sku, "ativo")}
                            >
                              {emAcao === l.sku
                                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                : <ArrowUpCircle className="mr-1.5 h-3.5 w-3.5" />}
                              Promover para Ativo
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* 2 — Bloqueados */}
            <TabsContent value="bloqueados">
              {lista.isLoading ? <Carregando /> : porAba.bloqueados.length === 0 ? (
                <Vazio texto="Nenhum produto bloqueado." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Fase</TableHead>
                      <TableHead>Falta para a próxima fase</TableHead>
                      <TableHead>Quem resolve</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porAba.bloqueados.map((l) => (
                      <TableRow key={l.sku}>
                        <TableCell><Identidade l={l} /></TableCell>
                        <TableCell><Badge variant="outline">{l.fase_nome ?? l.fase ?? "—"}</Badge></TableCell>
                        <TableCell><Chips itens={l.falta_proxima_fase} /></TableCell>
                        <TableCell><Chips itens={l.donos_pendencia} variante="secondary" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* 3 — Sem ficha no Bling */}
            <TabsContent value="sem_bling">
              <p className="mb-3 text-sm text-muted-foreground">
                Sem cadastro no Bling o produto não emite nota fiscal. A criação do cadastro
                virá numa próxima entrega; por ora esta aba só mostra quem está nessa situação.
              </p>
              {lista.isLoading ? <Carregando /> : porAba.sem_bling.length === 0 ? (
                <Vazio texto="Todo mundo com ficha no Bling." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Fase</TableHead>
                      <TableHead>Bling</TableHead>
                      <TableHead className="text-right">Saldo disponível</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porAba.sem_bling.map((l) => (
                      <TableRow key={l.sku}>
                        <TableCell><Identidade l={l} /></TableCell>
                        <TableCell><Badge variant="outline">{l.fase_nome ?? l.fase ?? "—"}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={l.tem_bling ? "secondary" : "destructive"}>
                            {l.tem_bling ? "Com cadastro" : "Sem cadastro"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm">{fmtNum(l.saldo_disponivel)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* 4 — Furo em produto ativo */}
            <TabsContent value="furo">
              <p className="mb-3 text-sm text-muted-foreground">
                Produto que já fatura, mas tem campo obrigatório da própria fase vazio.
              </p>
              {lista.isLoading ? <Carregando /> : porAba.furo.length === 0 ? (
                <Vazio texto="Nenhum furo em produto ativo." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Falta na fase atual</TableHead>
                      <TableHead>Quem resolve</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porAba.furo.map((l) => (
                      <TableRow key={l.sku}>
                        <TableCell><Identidade l={l} /></TableCell>
                        <TableCell><Chips itens={l.falta_fase_atual} /></TableCell>
                        <TableCell><Chips itens={l.donos_pendencia} variante="secondary" /></TableCell>
                        <TableCell className="text-right"><BotaoDescontinuar l={l} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 409 — saldo em estoque na descontinuação */}
      <AlertDialog open={!!confirmSaldo} onOpenChange={(o) => !o && setConfirmSaldo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descontinuar com saldo em estoque?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  O produto <strong>{confirmSaldo?.sku}</strong> ainda tem saldo disponível.
                  Descontinuar não apaga o saldo — ele passa a ser queima.
                </p>
                <div className="rounded-md border bg-muted/40 p-3 text-center">
                  <div className="text-xs uppercase text-muted-foreground">Saldo disponível</div>
                  <div className="text-2xl font-semibold">{fmtNum(confirmSaldo?.saldo ?? 0)}</div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const sku = confirmSaldo?.sku;
                setConfirmSaldo(null);
                if (sku) agir(sku, "inativo", true);
              }}
            >
              Descontinuar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 422 — campos faltando */}
      <Dialog open={!!faltando} onOpenChange={(o) => !o && setFaltando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ficha incompleta</DialogTitle>
            <DialogDescription>
              O produto <strong>{faltando?.sku}</strong> não pode avançar de fase enquanto
              estes campos estiverem vazios:
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {(faltando?.campos ?? []).length === 0 ? (
              <span className="text-sm text-muted-foreground">A função não detalhou os campos.</span>
            ) : (
              faltando!.campos.map((c) => (
                <Badge key={c} variant="outline">{c}</Badge>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaltando(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 502 — resposta bruta do FOP */}
      <Dialog open={!!erroFop} onOpenChange={(o) => !o && setErroFop(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              O FOP recusou a mudança
            </DialogTitle>
            <DialogDescription>
              Resposta na íntegra da trava do banco do FOP para <strong>{erroFop?.sku}</strong>.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
            {erroFop?.corpo}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setErroFop(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
