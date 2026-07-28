import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ExternalLink, Mail, Phone, PackageOpen, Loader2, AlertCircle, Sparkles, Send,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { MigrarOportunidadeDialog } from "@/components/comercial/MigrarOportunidadeDialog";
import { cn } from "@/lib/utils";
import { rotuloDestinoLiberacao } from "@/lib/pedidoLiberacaoEstoque";

interface DestinoRow {
  pedido_id: string;
  destino: string | null;
  rotulo: string | null;
  porque: string | null;
  pago: boolean | null;
  falta_recebivel: number | null;
}

interface TriagemRow {
  pedido_id: string;
  id_externo: string | null;
  valor_a_enviar: number | null;
  data_pedido: string | null;
  dias_esperando: number | null;
  vendedor: string | null;
  pai_id: string | null;
  pai_id_externo: string | null;
  pai_estagio: string | null;
  cliente: string | null;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  natureza: string | null;
  titulos_pai: number | null;
  valor_pago: number | null;
  valor_aberto: number | null;
  valor_vencido: number | null;
  dias_atraso_max: number | null;
  proximo_vencimento: string | null;
  boletos_nao_emitidos: number | null;
  grupo: "enviar" | "negociar" | string;
  situacao: string | null;
}

function corDiasAtraso(dias: number | null | undefined) {
  const d = Number(dias ?? 0);
  if (d <= 0) return "bg-muted text-muted-foreground";
  if (d <= 7) return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return "bg-destructive/15 text-destructive font-semibold";
}

export default function TriagemEstoque() {
  const [tab, setTab] = useState<"enviar" | "negociar">("enviar");

  const { data = [], isLoading } = useQuery({
    queryKey: ["triagem-estoque"],
    queryFn: async (): Promise<TriagemRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_aguardando_estoque_triagem")
        .select("*");
      if (error) throw error;
      return (data ?? []) as TriagemRow[];
    },
  });

  // Rótulo/destino do botão vêm do banco — a tela não decide.
  const { data: destinos = [] } = useQuery({
    queryKey: ["triagem-estoque-destinos"],
    queryFn: async (): Promise<DestinoRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_destino_estoque")
        .select("pedido_id, destino, rotulo, porque, pago, falta_recebivel");
      if (error) throw error;
      return (data ?? []) as DestinoRow[];
    },
  });

  const destinoPorPedido = useMemo(() => {
    const m = new Map<string, DestinoRow>();
    for (const d of destinos) m.set(d.pedido_id, d);
    return m;
  }, [destinos]);

  const enviar = useMemo(
    () =>
      data
        .filter((r) => r.grupo === "enviar")
        .sort((a, b) => Number(b.dias_esperando ?? 0) - Number(a.dias_esperando ?? 0)),
    [data],
  );

  const negociar = useMemo(
    () =>
      data
        .filter((r) => r.grupo === "negociar")
        .sort((a, b) => Number(b.dias_atraso_max ?? 0) - Number(a.dias_atraso_max ?? 0)),
    [data],
  );

  const kpis = useMemo(() => {
    const qtd = data.length;
    const valor = data.reduce((s, r) => s + Number(r.valor_a_enviar || 0), 0);
    const travado = negociar.reduce((s, r) => s + Number(r.valor_a_enviar || 0), 0);
    return { qtd, valor, travado };
  }, [data, negociar]);

  const somaEnviar = enviar.reduce((s, r) => s + Number(r.valor_a_enviar || 0), 0);
  const somaNegociar = negociar.reduce((s, r) => s + Number(r.valor_a_enviar || 0), 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <CasaPageHeader
        breadcrumb={[{ label: "Vendas" }, { label: "Triagem de Estoque" }]}
        title="Triagem de Estoque"
        subtitle="Remessas filhas que ficaram aguardando produto. Quando o produto chega, o destino depende do recebível: se a remessa já está faturada, vai para Pré-Separação; se ainda não tem recebível próprio, vai para Cobrança ser faturada antes de expedir."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard label="Remessas aguardando" value={String(kpis.qtd)} />
        <KpiCard label="Valor total a enviar" value={formatBRL(kpis.valor)} />
        <KpiCard
          label="Com parcela vencida no pai"
          value={formatBRL(kpis.travado)}
          hint="aviso, não bloqueia envio"
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "enviar" | "negociar")}>
        <TabsList>
          <TabsTrigger value="enviar" className="gap-2">
            Pronto para enviar
            <Badge variant="secondary" className="ml-1">
              {enviar.length} · {formatBRL(somaEnviar)}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="negociar" className="gap-2">
            Com parcela vencida
            <Badge variant="secondary" className="ml-1">
              {negociar.length} · {formatBRL(somaNegociar)}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="enviar" className="mt-4">
          <p className="text-sm text-muted-foreground mb-3">
            Sem parcela vencida no pai. O destino de cada linha aparece no próprio botão: parte vai direto para Pré-Separação, parte precisa passar por Cobrança antes porque a remessa ainda não tem recebível próprio.
          </p>
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <LoadingState />
              ) : enviar.length === 0 ? (
                <EmptyState
                  title="Nenhuma remessa pronta para enviar no momento."
                  hint="Assim que o produto chegar e o pai estiver em dia, aparece aqui."
                />
              ) : (
                <TabelaEnviar rows={enviar} destinos={destinoPorPedido} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="negociar" className="mt-4">
          <p className="text-sm text-muted-foreground mb-3">
            A primeira parcela do pai já foi paga; o que está vencido são parcelas seguintes, então a cobrança é do{" "}
            <span className="font-medium text-foreground">CPR</span>, não da expedição. Estas remessas{" "}
            <span className="font-medium text-foreground">podem ser enviadas normalmente</span> — o grupo existe para dar visibilidade antes da decisão, não para travar. Se preferir negociar antes, use{" "}
            <span className="font-medium text-foreground">Migrar para Comercial</span>, que tira a remessa desta lista e a move para a fila do Comercial até alguém retomar.
          </p>
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <LoadingState />
              ) : negociar.length === 0 ? (
                <EmptyState
                  title="Nenhuma remessa em negociação no momento."
                  hint="Aparecem aqui as remessas cujo pai tem parcela vencida em aberto."
                />
              ) : (
                <TabelaNegociar rows={negociar} destinos={destinoPorPedido} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabelaEnviar({ rows, destinos }: { rows: TriagemRow[]; destinos: Map<string, DestinoRow> }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pedido (filha)</TableHead>
            <TableHead>Pai</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="text-right">Valor a enviar</TableHead>
            <TableHead className="text-right">Dias esperando</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Próximo vencimento</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.pedido_id}>
              <TableCell className="font-mono text-xs">
                <div className="flex items-center gap-1.5">
                  <Link to={`/pedidos/${r.pedido_id}`} className="hover:underline">
                    {r.id_externo || "—"}
                  </Link>
                  {destinos.get(r.pedido_id)?.pago && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px] border-emerald-500 text-emerald-700 dark:text-emerald-400">
                      Pago
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {r.pai_id ? (
                  <Link
                    to={`/pedidos/${r.pai_id}`}
                    className="hover:underline text-muted-foreground"
                  >
                    {r.pai_id_externo || "—"}
                  </Link>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="max-w-[240px]">
                <div className="truncate font-medium">{r.cliente || "—"}</div>
                {r.cnpj && (
                  <div className="text-[11px] text-muted-foreground truncate">
                    {r.cnpj}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right">
                {formatBRL(r.valor_a_enviar ?? 0)}
              </TableCell>
              <TableCell className="text-right">
                <Badge variant="outline" className="rounded px-2 py-0.5">
                  {r.dias_esperando ?? 0}
                </Badge>
              </TableCell>
              <TableCell className="text-xs max-w-[260px]">
                <div className="flex items-center gap-2">
                  <span className="truncate">{r.situacao || "—"}</span>
                  {Number(r.boletos_nao_emitidos ?? 0) > 0 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-400 text-amber-700 dark:text-amber-300"
                          >
                            <AlertCircle className="h-3 w-3" />
                            boleto não emitido
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          O pedido pai tem {r.boletos_nao_emitidos} parcela(s) sem boleto
                          gerado. Não bloqueia o envio, é só aviso.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-xs">
                {formatDateBR(r.proximo_vencimento)}
              </TableCell>
              <TableCell className="text-xs">{r.vendedor || "—"}</TableCell>
              <TableCell>
                <AcoesLinha r={r} destino={destinos.get(r.pedido_id)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TabelaNegociar({ rows, destinos }: { rows: TriagemRow[]; destinos: Map<string, DestinoRow> }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pedido (filha)</TableHead>
            <TableHead>Pai</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="text-right">Valor a enviar</TableHead>
            <TableHead className="text-right">Já pagou</TableHead>
            <TableHead className="text-right">Vencido</TableHead>
            <TableHead className="text-right">Dias de atraso</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.pedido_id}>
              <TableCell className="font-mono text-xs">
                <div className="flex items-center gap-1.5">
                  <Link to={`/pedidos/${r.pedido_id}`} className="hover:underline">
                    {r.id_externo || "—"}
                  </Link>
                  {destinos.get(r.pedido_id)?.pago && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px] border-emerald-500 text-emerald-700 dark:text-emerald-400">
                      Pago
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {r.pai_id ? (
                  <Link
                    to={`/pedidos/${r.pai_id}`}
                    className="hover:underline text-muted-foreground"
                  >
                    {r.pai_id_externo || "—"}
                  </Link>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="max-w-[240px]">
                <div className="truncate font-medium">{r.cliente || "—"}</div>
                {r.cnpj && (
                  <div className="text-[11px] text-muted-foreground truncate">
                    {r.cnpj}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right">
                {formatBRL(r.valor_a_enviar ?? 0)}
              </TableCell>
              <TableCell className="text-right">
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                  {formatBRL(r.valor_pago ?? 0)}
                </span>
              </TableCell>
              <TableCell className="text-right">
                {formatBRL(r.valor_vencido ?? 0)}
              </TableCell>
              <TableCell className="text-right">
                <Badge
                  variant="outline"
                  className={cn(
                    "border-0 rounded px-2 py-0.5",
                    corDiasAtraso(r.dias_atraso_max),
                  )}
                >
                  {r.dias_atraso_max ?? 0}
                </Badge>
              </TableCell>
              <TableCell>
                <AcoesLinha r={r} destino={destinos.get(r.pedido_id)} mostrarPai comMigrar />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AcoesLinha({
  r,
  destino,
  mostrarPai,
  comMigrar,
}: {
  r: TriagemRow;
  destino?: DestinoRow;
  mostrarPai?: boolean;
  comMigrar?: boolean;
}) {
  const [migrarOpen, setMigrarOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const qc = useQueryClient();

  const enviar = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("liberar_pedido_estoque", {
        p_pedido_id: r.pedido_id,
        p_motivo: "Produto chegou — liberado na Triagem",
      });
      if (error) throw error;
      return data as {
        ok?: boolean;
        pedido_id?: string;
        destino?: string | null;
        porque?: string | null;
        pago?: boolean | null;
        falta_recebivel?: number | null;
        acao_na_cobranca?: "materializar_cobranca" | "gerar_portao" | null;
      } | null;
    },
    onSuccess: (data) => {
      const dest = rotuloDestinoLiberacao(data?.destino);
      const partes: string[] = [];
      if (r.id_externo) partes.push(`Remessa ${r.id_externo}`);
      if (data?.acao_na_cobranca === "materializar_cobranca") {
        partes.push("Próximo passo: materializar a cobrança na tela de Cobrança");
      } else if (data?.acao_na_cobranca === "gerar_portao") {
        partes.push("Próximo passo: gerar o portão de entrada na aba Primeiro Pagamento");
      }
      toast.success(`Enviado para ${dest}`, {
        description: partes.length ? partes.join(" · ") : undefined,
      });
      qc.invalidateQueries({ queryKey: ["triagem-estoque"] });
      qc.invalidateQueries({ queryKey: ["triagem-estoque-destinos"] });
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
      qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
    },
    onError: (e: unknown) => {
      toast.error("Erro ao liberar remessa", { description: formatError(e) });
    },
  });

  const precisaConfirmar = comMigrar; // grupo "negociar"
  const rotuloBotao = destino?.rotulo || "Enviar para próxima fase";
  const tooltipBotao = destino?.porque || undefined;

  function handleEnviarClick() {
    if (precisaConfirmar) setConfirmOpen(true);
    else enviar.mutate();
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        size="sm"
        variant={comMigrar ? "outline" : "default"}
        className="h-7 gap-1.5"
        disabled={enviar.isPending}
        onClick={handleEnviarClick}
        title={tooltipBotao}
      >
        {enviar.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
        {rotuloBotao}
      </Button>
      {Number(destino?.falta_recebivel ?? 0) > 0 && (
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          falta recebível: {formatBRL(Number(destino?.falta_recebivel))}
        </span>
      )}
      {comMigrar && (
        <Button
          size="sm"
          variant="default"
          className="h-7 gap-1.5"
          onClick={() => setMigrarOpen(true)}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Migrar para Comercial
        </Button>
      )}
      {r.telefone && (
        <Button size="icon" variant="ghost" title={`Ligar: ${r.telefone}`} asChild>
          <a href={`tel:${r.telefone}`}>
            <Phone className="h-4 w-4" />
          </a>
        </Button>
      )}
      {r.email && (
        <Button size="icon" variant="ghost" title={`E-mail: ${r.email}`} asChild>
          <a href={`mailto:${r.email}`}>
            <Mail className="h-4 w-4" />
          </a>
        </Button>
      )}
      {mostrarPai && r.pai_id && (
        <Button size="icon" variant="ghost" title="Abrir pedido pai" asChild>
          <Link to={`/pedidos/${r.pai_id}`}>
            <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
      )}
      <Button size="icon" variant="ghost" title="Abrir remessa" asChild>
        <Link to={`/pedidos/${r.pedido_id}`}>
          <ExternalLink className="h-4 w-4" />
        </Link>
      </Button>

      {comMigrar && (
        <MigrarOportunidadeDialog
          open={migrarOpen}
          onOpenChange={setMigrarOpen}
          pedidoId={r.pedido_id}
          idExterno={r.id_externo}
          cliente={r.cliente}
          origem="estoque_inadimplente"
          valorVencido={r.valor_vencido}
          diasAtraso={r.dias_atraso_max}
          invalidateKeys={[["triagem-estoque"], ["oportunidades-comercial"]]}
        />
      )}

      {precisaConfirmar && (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Enviar mesmo com parcela vencida?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  {r.situacao && (
                    <p className="font-medium text-foreground">{r.situacao}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Vencido no pai</div>
                      <div className="font-semibold text-foreground">
                        {formatBRL(r.valor_vencido ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Dias de atraso</div>
                      <div className="font-semibold text-foreground">
                        {r.dias_atraso_max ?? 0}
                      </div>
                    </div>
                  </div>
                  <p>
                    A primeira parcela do pai <strong>já foi paga</strong> — foi ela que
                    liberou a produção desta remessa. A cobrança das parcelas seguintes é
                    responsabilidade do <strong>CPR</strong>, não da expedição.
                  </p>
                  {Number(destino?.falta_recebivel ?? 0) > 0 && (
                    <p className="text-amber-700 dark:text-amber-400">
                      Esta remessa ainda <strong>não tem recebível</strong> ({formatBRL(Number(destino?.falta_recebivel))}).
                      Ao confirmar, ela vai para <strong>Cobrança</strong> para ser faturada — não para expedição.
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    Ao confirmar, a remessa vai para <strong>{rotuloDestinoLiberacao(destino?.destino)}</strong> e sai
                    desta lista.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={enviar.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={enviar.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  enviar.mutate(undefined, {
                    onSuccess: () => setConfirmOpen(false),
                  });
                }}
              >
                {enviar.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Enviar mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="text-center py-16 px-6">
      <PackageOpen className="h-8 w-8 text-muted-foreground/60 mx-auto mb-3" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}
