import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { useLocation, useNavigate } from "react-router-dom";
import { abrirDetalhe } from "@/lib/navegacao/abrirDetalhe";
import {
  DialogoDeclaracaoB2B,
  invalidarSaidasB2B,
  useB2bSaidaPermitida,
  type DeclaracaoB2B,
} from "@/components/pedidos/DialogoDeclaracaoB2B";
import { useInboxFilas, type FilaInbox } from "@/hooks/tarefas/useInboxFilas";
import { useInboxFilaItens } from "@/hooks/tarefas/useInboxFilaItens";
import { useFilaMedidas, fmtPrazoMedida, type FilaMedida } from "@/hooks/tarefas/useFilaMedidas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronUp, ListChecks, AlertTriangle, Flag } from "lucide-react";
import { useVincularNfCandidata } from "@/components/pedidos/BlocoTravadoB2B";
import { DialogoAbrirProblema } from "@/components/chamados/DialogoAbrirProblema";
import { cn } from "@/lib/utils";
import { formatError } from "@/lib/format-error";

const RE_DATA = /^\d{4}-\d{2}-\d{2}/;

function rotuloColuna(chave: string) {
  return chave.replace(/_/g, " ");
}

function formatarCelula(valor: unknown): { texto: string; numerico: boolean } {
  if (valor === null || valor === undefined) return { texto: "—", numerico: false };
  if (typeof valor === "boolean") return { texto: valor ? "Sim" : "Não", numerico: false };
  if (typeof valor === "number") return { texto: valor.toLocaleString("pt-BR"), numerico: true };
  if (typeof valor === "string") {
    if (RE_DATA.test(valor)) {
      const d = new Date(valor.length === 10 ? `${valor}T00:00:00` : valor);
      if (!Number.isNaN(d.getTime())) {
        return { texto: d.toLocaleDateString("pt-BR"), numerico: true };
      }
    }
    return { texto: valor, numerico: false };
  }
  let json = "";
  try {
    json = JSON.stringify(valor);
  } catch {
    json = String(valor);
  }
  return { texto: json.length > 60 ? `${json.slice(0, 60)}…` : json, numerico: false };
}

/** Fila cd_saldo_a_corrigir: faltas legíveis + fechar a pendência. */
function LinhaSaldoCd({ linha }: { linha: Record<string, unknown> }) {
  const qc = useQueryClient();
  const [obs, setObs] = useState("");
  const faltas = (Array.isArray(linha.faltas) ? linha.faltas : []) as {
    sku: string;
    pedido: number;
    livre_cd: number;
  }[];
  const corrigir = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("fn_pedido_cd_falta_corrigida", {
        p_aceite_id: linha.id,
        p_obs: obs.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Saldo marcado como corrigido");
      await qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="rounded-md border p-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{String(linha.id_externo ?? "—")}</span>
        {linha.centro_nome ? <Badge variant="secondary">{String(linha.centro_nome)}</Badge> : null}
        {linha.criado_em ? (
          <span className="text-muted-foreground">{formatarCelula(linha.criado_em).texto}</span>
        ) : null}
      </div>
      <ul className="tabular-nums">
        {faltas.map((f, i) => (
          <li key={`${f.sku}-${i}`}>
            {f.sku}: pede {f.pedido}, livre {f.livre_cd}
          </li>
        ))}
      </ul>
      {linha.motivo ? <p className="text-muted-foreground">Motivo: {String(linha.motivo)}</p> : null}
      <div className="flex gap-2">
        <Input
          className="h-8 text-xs"
          placeholder="Observação (opcional)"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
        />
        <Button size="sm" disabled={corrigir.isPending} onClick={() => corrigir.mutate()}>
          Saldo corrigido
        </Button>
      </div>
    </div>
  );
}

const FILAS_B2B_SAIDA = ["b2b_transporte_sem_noticia", "b2b_faturado_parado", "b2b_embarcado_sem_nf"];

const fmtData = (v: unknown) => (v ? formatarCelula(v).texto : "—");
const fmtBRL = (v: unknown) =>
  v === null || v === undefined || v === ""
    ? "—"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Filas de B2B parado depois do faturamento: colunas legíveis + saídas. */
function LinhaB2bSaida({ chave, linha }: { chave: string; linha: Record<string, unknown> }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: permitido } = useB2bSaidaPermitida();
  const [declaracao, setDeclaracao] = useState<DeclaracaoB2B | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [obs, setObs] = useState("");
  const pedidoId = String(linha.pedido_id ?? "");
  const vincular = useVincularNfCandidata(pedidoId);
  const nfQtd = Number(linha.nf_candidatas_qtd ?? 0);

  const cobrar = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_pedido_b2b_cobrar_transportadora", {
        p_pedido_id: pedidoId,
        p_obs: obs.trim(),
      });
      if (error) throw error;
      return data as { volta_em?: string } | null;
    },
    onSuccess: async (d) => {
      toast.success(d?.volta_em ? `Cobrança registrada · volta em ${fmtData(d.volta_em)}` : "Cobrança registrada");
      setCobrando(false);
      setObs("");
      await invalidarSaidasB2B(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const campos: [string, string][] =
    chave === "b2b_transporte_sem_noticia"
      ? [
          ["Transportadora", String(linha.transportadora ?? "—")],
          ["Frete", String(linha.frete_tipo ?? "—")],
          ["Previsão", fmtData(linha.data_entrega_prevista)],
          ["Em transporte desde", fmtData(linha.em_transporte_desde)],
          ["Limite", fmtData(linha.limite)],
          ["Última cobrança", fmtData(linha.ultima_cobranca)],
        ]
      : chave === "b2b_faturado_parado"
        ? [
            ["Transportadora", String(linha.transportadora ?? "—")],
            ["Faturado em", fmtData(linha.faturado_em)],
            ["Expedição XPM", String(linha.xpm_expedicao_codigo ?? "—")],
          ]
        : [
            ["Estágio", String(linha.estagio ?? "—")],
            ["Embarcado em", fmtData(linha.embarcado_em)],
          ];

  const acoes = permitido === true && chave !== "b2b_embarcado_sem_nf";

  return (
    <div className="rounded-md border p-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() =>
            abrirDetalhe(navigate, location, `/pedidos/${pedidoId}`, { foco: pedidoId, label: "Tarefas" })
          }
        >
          {String(linha.id_externo ?? "—")}
        </button>
        <span>{String(linha.cliente ?? "—")}</span>
        <span className="ml-auto tabular-nums font-medium">{fmtBRL(linha.valor_liquido)}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        {campos.map(([r, v]) => (
          <span key={r}>
            {r}: <span className="text-foreground tabular-nums">{v}</span>
          </span>
        ))}
      </div>
      {chave === "b2b_embarcado_sem_nf" && (
        <div className="flex flex-wrap items-center gap-2">
          {linha.nf_candidata_numero ? (
            <>
              <span>
                NF candidata {String(linha.nf_candidata_numero)}
                {linha.nf_candidata_emissao ? ` (${new Date(String(linha.nf_candidata_emissao)).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })})` : ""}
              </span>
              {nfQtd > 1 ? (
                <span className="text-muted-foreground">+{nfQtd - 1} candidata(s)</span>
              ) : (
                permitido === true &&
                linha.nf_candidata_id && (
                  <Button size="sm" variant="outline" className="h-7" disabled={vincular.isPending}
                    onClick={() => vincular.mutate(String(linha.nf_candidata_id))}>
                    Vincular NF
                  </Button>
                )
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Sem NF candidata — emitir no Bling</span>
          )}
        </div>
      )}
      {acoes && (
        <div className="flex flex-wrap gap-2">
          {chave === "b2b_transporte_sem_noticia" && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => setCobrando((v) => !v)}>
              Cobrei a transportadora
            </Button>
          )}
          {chave === "b2b_faturado_parado" && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => setDeclaracao("embarque")}>
              Declarar embarque
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7" onClick={() => setDeclaracao("entrega")}>
            Declarar entrega
          </Button>
        </div>
      )}
      {acoes && cobrando && (
        <div className="flex gap-2">
          <Input
            className="h-8 text-xs"
            placeholder="O que a transportadora respondeu (mín. 10 caracteres)"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
          <Button size="sm" disabled={obs.trim().length < 10 || cobrar.isPending} onClick={() => cobrar.mutate()}>
            Registrar cobrança
          </Button>
        </div>
      )}
      {declaracao && (
        <DialogoDeclaracaoB2B
          tipo={declaracao}
          pedidoId={pedidoId}
          idExterno={linha.id_externo ? String(linha.id_externo) : null}
          open={!!declaracao}
          onOpenChange={(v) => !v && setDeclaracao(null)}
        />
      )}
    </div>
  );
}

function identificadorLinha(l: Record<string, unknown>): string {
  for (const k of ["id_externo", "numero", "codigo", "nome", "id"]) {
    if (l[k] !== null && l[k] !== undefined && l[k] !== "") return String(l[k]);
  }
  return "—";
}

function BotaoAbrirProblema({
  fila,
  linha,
  compacto,
}: {
  fila: FilaInbox;
  linha: Record<string, unknown>;
  compacto?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const ext = linha.id_externo ? String(linha.id_externo) : "";
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground"
        title="Abrir problema"
        onClick={(e) => {
          e.stopPropagation();
          setAberto(true);
        }}
      >
        <Flag className="h-3.5 w-3.5" />
        {!compacto && <span className="ml-1">Abrir problema</span>}
      </Button>
      <DialogoAbrirProblema
        open={aberto}
        onOpenChange={setAberto}
        contexto={{
          descricao: `Fila: ${fila.nome} — ${identificadorLinha(linha)}`,
          pedidoRef: ext.startsWith("PED-") ? ext : null,
        }}
      />
    </>
  );
}

/** Fila problemas_esquecidos: leitura própria por linha. */
function LinhaProblemaEsquecido({ linha }: { linha: Record<string, unknown> }) {
  const navigate = useNavigate();
  const location = useLocation();
  const abrir = (to: string) =>
    abrirDetalhe(navigate, location, to, { foco: String(linha.chamado_id), label: "Tarefas" });
  return (
    <div className="rounded-md border p-3 space-y-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button className="font-medium text-primary hover:underline" onClick={() => abrir(`/chamados/${linha.chamado_id}`)}>
          {String(linha.numero ?? "—")}
        </button>
        <span>{String(linha.atribuido_nome ?? "sem responsável")}</span>
        {linha.cadeira ? <Badge variant="secondary">{String(linha.cadeira)}</Badge> : null}
        <span className="text-muted-foreground">Data-alvo {fmtData(linha.data_alvo)}</span>
        {linha.pedido_id ? (
          <button className="text-primary hover:underline" onClick={() => abrir(`/pedidos/${linha.pedido_id}`)}>
            {String(linha.pedido_id_externo ?? "Pedido")}
          </button>
        ) : null}
      </div>
      {linha.esquecido_motivo ? (
        <p className="font-medium text-warning">{String(linha.esquecido_motivo)}</p>
      ) : null}
      {linha.detalhe ? <p className="text-muted-foreground line-clamp-2">{String(linha.detalhe)}</p> : null}
      <p className="text-muted-foreground">Aberto por {String(linha.criado_por_nome ?? "—")}</p>
    </div>
  );
}

function TabelaFila({ fila }: { fila: FilaInbox }) {
  const { data, isLoading, isError, error } = useInboxFilaItens(fila.chave, 25);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar os itens</AlertTitle>
        <AlertDescription className="text-xs break-words">{formatError(error)}</AlertDescription>
      </Alert>
    );
  }

  const linhas = data ?? [];
  if (linhas.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum item nesta fila.</p>;
  }

  const comProblema = (l: Record<string, unknown>, filho: ReactNode, key: string) => (
    <div key={key} className="space-y-1">
      {filho}
      <div className="flex justify-end">
        <BotaoAbrirProblema fila={fila} linha={l} />
      </div>
    </div>
  );

  if (FILAS_B2B_SAIDA.includes(fila.chave)) {
    return (
      <div className="space-y-2">
        {linhas.map((l) =>
          comProblema(l, <LinhaB2bSaida chave={fila.chave} linha={l} />, String(l.pedido_id ?? l.id)),
        )}
      </div>
    );
  }

  if (fila.chave === "cd_saldo_a_corrigir") {
    return (
      <div className="space-y-2">
        {linhas.map((l) => comProblema(l, <LinhaSaldoCd linha={l} />, String(l.id)))}
      </div>
    );
  }

  if (fila.chave === "problemas_esquecidos") {
    return (
      <div className="space-y-2">
        {linhas.map((l) => (
          <LinhaProblemaEsquecido key={String(l.chamado_id)} linha={l} />
        ))}
      </div>
    );
  }

  const colunas = Object.keys(linhas[0]);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {colunas.map((c) => (
                <TableHead key={c} className="whitespace-nowrap capitalize text-xs">
                  {rotuloColuna(c)}
                </TableHead>
              ))}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha, i) => (
              <TableRow key={i}>
                {colunas.map((c) => {
                  const { texto, numerico } = formatarCelula(linha[c]);
                  return (
                    <TableCell
                      key={c}
                      title={texto}
                      className={cn(
                        "max-w-[240px] truncate text-xs",
                        numerico && "tabular-nums"
                      )}
                    >
                      {texto}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right">
                  <BotaoAbrirProblema fila={fila} linha={linha} compacto />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {fila.total > linhas.length && (
        <p className="text-xs text-muted-foreground">
          Mostrando {linhas.length} de {fila.total} — abra a tela para ver tudo
        </p>
      )}
    </div>
  );
}

/** F2 — bloco compacto com o que a fila instrumentada mediu (últimos 90 dias).
 *  Filas fora de vw_fila_medida simplesmente não mostram o bloco. */
function BlocoMedida({ medida }: { medida: FilaMedida }) {
  const chegada = `${medida.padrao ?? "sem dado"}${medida.padrao_ref ? ` · ${medida.padrao_ref}` : ""}`;
  const volume =
    medida.media_por_dia_corrido == null
      ? "—"
      : `${medida.media_por_dia_corrido.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/dia`;
  const volumeAtivo =
    medida.padrao !== "diario" && medida.media_por_dia_ativo != null
      ? `${medida.media_por_dia_ativo.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/dia nos dias ativos`
      : null;
  const semHumano = (medida.amostra_humana ?? 0) === 0;

  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-[11px] text-muted-foreground">Chegada</p>
          <p className="text-sm font-medium capitalize">{chegada}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Volume</p>
          <p className="text-sm font-medium tabular-nums">{volume}</p>
          {volumeAtivo && (
            <p className="text-[11px] text-muted-foreground tabular-nums">{volumeAtivo}</p>
          )}
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Pico</p>
          <p className="text-sm font-medium tabular-nums">
            {medida.pico_dia_qtd != null ? `${medida.pico_dia_qtd} num dia` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Prazo real</p>
          {semHumano ? (
            <p className="text-[11px] text-muted-foreground">
              sem execução humana registrada — resolvido por automação
            </p>
          ) : (
            <>
              <p className="text-sm font-medium tabular-nums">
                {fmtPrazoMedida(medida.lead_p50_min)}
              </p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                p80 {fmtPrazoMedida(medida.lead_p80_min)}
              </p>
            </>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        medido nos últimos 90 dias · {medida.entradas_total ?? 0} chegadas
      </p>
    </div>
  );
}

export function InboxFilas() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const [filaAberta, setFilaAberta] = useState<FilaInbox | null>(null);
  const { data: filas, isLoading, isError, error, refetch, isFetching } = useInboxFilas();
  const medidas = useFilaMedidas();

  const totalGeral = (filas ?? []).reduce((acc, f) => acc + f.total, 0);

  const comPendencia = (filas ?? []).filter((f) => f.total > 0 || !!f.erro);
  const zeradas = (filas ?? []).filter((f) => f.total === 0 && !f.erro);
  const visiveis = [...comPendencia, ...zeradas];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          Filas da operação
          {!isLoading && !isError && (
            <Badge variant="secondary" className="ml-auto text-[11px]">
              {totalGeral} item{totalGeral !== 1 ? "s" : ""}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Recolher filas" : "Expandir filas"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Trabalho pendente registrado nas filas do sistema, agrupado por área
        </p>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3">
          {isLoading && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          )}

          {isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Não foi possível carregar as filas</AlertTitle>
              <AlertDescription className="space-y-2">
                <p className="text-xs break-words">{formatError(error)}</p>
                <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
                  Tentar de novo
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {!isLoading && !isError && visiveis.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma fila cadastrada.</p>
          )}

          {!isLoading && !isError && visiveis.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {visiveis.map((fila) => {
                const comErro = !!fila.erro;
                const zerada = fila.total === 0 && !comErro;
                const ehCritica = !zerada && fila.severidade === "critica";
                const ehAlta = !zerada && fila.severidade === "alta";

                return (
                  <div
                    key={fila.chave}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilaAberta(fila)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setFilaAberta(fila);
                      }
                    }}
                    className={cn(
                      "relative flex flex-col justify-between gap-2 rounded-lg border p-4 cursor-pointer transition-colors hover:bg-muted/50",
                      ehCritica && "border-destructive bg-destructive/5",
                      ehAlta && "border-warning bg-warning/5",
                      !ehCritica && !ehAlta && "border-border bg-card",
                      comErro && "border-destructive"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          "text-2xl font-medium tabular-nums leading-none",
                          ehCritica && "text-destructive",
                          ehAlta && "text-warning",
                          zerada && "text-muted-foreground"
                        )}
                      >
                        {fila.total}
                      </span>
                      {comErro && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-sm font-medium leading-tight",
                          zerada && "text-muted-foreground"
                        )}
                      >
                        {fila.nome}
                      </p>
                      {comErro && (
                        <p className="text-xs text-destructive break-words mt-1">{fila.erro}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {fila.area_nome ?? "Sem área"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}

      <Sheet open={!!filaAberta} onOpenChange={(o) => !o && setFilaAberta(null)}>
        <SheetContent side="right" className="sm:max-w-2xl w-full overflow-y-auto">
          {filaAberta && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span>{filaAberta.nome}</span>
                  <Badge variant="secondary" className="text-[11px]">
                    {filaAberta.total}
                  </Badge>
                </SheetTitle>
                <SheetDescription>{filaAberta.area_nome ?? "Sem área"}</SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-3">
                {(() => {
                  const medida = medidas.data?.get(filaAberta.chave);
                  return medida ? <BlocoMedida medida={medida} /> : null;
                })()}
                <TabelaFila fila={filaAberta} />
              </div>

              {filaAberta.rota && (
                <SheetFooter className="mt-4">
                  <Button
                    onClick={() => {
                      const rota = filaAberta.rota;
                      setFilaAberta(null);
                      navigate(rota);
                    }}
                  >
                    Abrir tela
                  </Button>
                </SheetFooter>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}
