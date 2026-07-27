import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
  ExternalLink, Mail, Phone, PackageOpen, Loader2, AlertCircle, Sparkles,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { MigrarOportunidadeDialog } from "@/components/comercial/MigrarOportunidadeDialog";
import { cn } from "@/lib/utils";

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
        subtitle="Remessas filhas que ficaram aguardando produto. O produto está chegando — decida o que fazer com cada uma. O pagamento vive no pedido pai."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard label="Remessas aguardando" value={String(kpis.qtd)} />
        <KpiCard label="Valor total a enviar" value={formatBRL(kpis.valor)} />
        <KpiCard
          label="Travado por vencimento"
          value={formatBRL(kpis.travado)}
          hint="soma do grupo Negociar"
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
            Sugestões para o Comercial
            <Badge variant="secondary" className="ml-1">
              {negociar.length} · {formatBRL(somaNegociar)}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="enviar" className="mt-4">
          <p className="text-sm text-muted-foreground mb-3">
            Pagamento do pedido pai em dia, sem parcela vencida. Liberado para expedição.
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
                <TabelaEnviar rows={enviar} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="negociar" className="mt-4">
          <p className="text-sm text-muted-foreground mb-3">
            Remessas cujo pedido pai tem parcela vencida. O sistema{" "}
            <span className="font-medium text-foreground">sugere</span> migrar para
            Oportunidade Comercial, mas quem decide é o operador. Migrar{" "}
            <span className="font-medium text-foreground">tira o pedido desta lista</span>{" "}
            e o move para a fila do Comercial até alguém retomar.
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
                <TabelaNegociar rows={negociar} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabelaEnviar({ rows }: { rows: TriagemRow[] }) {
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
                <Link to={`/pedidos/${r.pedido_id}`} className="hover:underline">
                  {r.id_externo || "—"}
                </Link>
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
                <AcoesLinha r={r} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TabelaNegociar({ rows }: { rows: TriagemRow[] }) {
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
                <Link to={`/pedidos/${r.pedido_id}`} className="hover:underline">
                  {r.id_externo || "—"}
                </Link>
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
                <AcoesLinha r={r} mostrarPai comMigrar />
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
  mostrarPai,
  comMigrar,
}: {
  r: TriagemRow;
  mostrarPai?: boolean;
  comMigrar?: boolean;
}) {
  const [migrarOpen, setMigrarOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-1">
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
