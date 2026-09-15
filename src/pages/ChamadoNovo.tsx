import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, HelpCircle, PlusCircle, Search, Ticket } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { iconeDaFila } from "@/pages/ChamadosCatalogo";
import {
  PermissaoTelaProvider,
  usePermissaoTelaContext,
  AvisoSomenteLeitura,
} from "@/contexts/PermissaoTelaContext";

/**
 * Abrir chamado — três etapas na mesma página: escolher a FILA, escolher o
 * SERVIÇO dentro dela e descrever. A busca é global: digitar atravessa as filas
 * e mostra o nome da fila em cada resultado. Serviço sem fila cai no bloco
 * "Outros".
 *
 * Quem valida tudo (pedido obrigatório, campos extras, duplicidade) é a RPC
 * `abrir_chamado_catalogo` — a tela só orquestra e repassa a mensagem do
 * Postgres no toast. FAIL-LOUD: nenhum erro é engolido.
 *
 * MODO-LEITURA-NAO-ESCONDE-DADO: sem `pode_editar` o catálogo continua
 * visível; só o botão de abrir desliga.
 */

interface CampoExtra {
  chave: string;
  rotulo: string;
  tipo: string;
}

interface ItemCatalogo {
  cadeira_id: string | null;
  cadeira: string | null;
  cadeira_ordem: number | null;
  assunto_id: string | null;
  codigo: string | null;
  item: string | null;
  descricao: string | null;
  entidade_tipo_exigida: string | null;
  campos_extras: CampoExtra[] | null;
  prazo_primeira_resposta_h: number | null;
  prazo_dias: number | null;
  camada_esperada: string | null;
  visivel_para: string | null;
  ordem: number | null;
  fila_id: string | null;
  fila_codigo: string | null;
  fila: string | null;
  fila_icone: string | null;
  fila_ordem: number | null;
  fila_descricao: string | null;
}

interface FilaAgrupada {
  chave: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
  ordem: number;
  itens: ItemCatalogo[];
}

const CHAVE_OUTROS = "__outros__";

type TipoChamado = "incidente" | "requisicao" | "duvida";

const TIPOS: { valor: TipoChamado; rotulo: string; ajuda: string }[] = [
  { valor: "requisicao", rotulo: "Requisição", ajuda: "preciso de algo" },
  { valor: "incidente", rotulo: "Incidente", ajuda: "algo quebrou" },
  { valor: "duvida", rotulo: "Dúvida", ajuda: "quero entender" },
];

function ErroQuery({
  o_que,
  erro,
  onTentar,
}: {
  o_que: string;
  erro: unknown;
  onTentar?: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        Não foi possível carregar {o_que}: {formatError(erro)}
      </AlertDescription>
      {onTentar && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onTentar}>
          Tentar de novo
        </Button>
      )}
    </Alert>
  );
}

export default function ChamadoNovo() {
  return (
    <PermissaoTelaProvider slug="tela.chamados">
      <ChamadoNovoConteudo />
    </PermissaoTelaProvider>
  );
}

function ChamadoNovoConteudo() {
  const navigate = useNavigate();
  const { podeEditar } = usePermissaoTelaContext();

  const [busca, setBusca] = useState("");
  const [filaSel, setFilaSel] = useState<string | null>(null);
  const [item, setItem] = useState<ItemCatalogo | null>(null);
  const [tipo, setTipo] = useState<TipoChamado>("requisicao");
  const [pedidoRef, setPedidoRef] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);

  const catalogo = useQuery({
    queryKey: ["catalogo-arvore-chamados"],
    queryFn: async (): Promise<ItemCatalogo[]> => {
      const { data, error } = await supabase.from("vw_catalogo_arvore").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as ItemCatalogo[];
    },
  });

  const filas = useMemo<FilaAgrupada[]>(() => {
    const mapa = new Map<string, FilaAgrupada>();
    for (const i of catalogo.data ?? []) {
      const chave = i.fila_id ?? CHAVE_OUTROS;
      const existente = mapa.get(chave);
      if (existente) {
        existente.itens.push(i);
        continue;
      }
      mapa.set(chave, {
        chave,
        nome: i.fila ?? "Outros",
        descricao: i.fila_descricao ?? null,
        icone: i.fila_icone ?? null,
        ordem: i.fila_id ? (i.fila_ordem ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER,
        itens: [i],
      });
    }
    return [...mapa.values()].sort(
      (a, b) =>
        a.ordem - b.ordem ||
        (a.chave === CHAVE_OUTROS ? 1 : 0) - (b.chave === CHAVE_OUTROS ? 1 : 0) ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }, [catalogo.data]);

  const termo = busca.trim().toLowerCase();

  const resultadosBusca = useMemo(() => {
    if (!termo) return [];
    return (catalogo.data ?? []).filter(
      (i) =>
        (i.item ?? "").toLowerCase().includes(termo) ||
        (i.descricao ?? "").toLowerCase().includes(termo),
    );
  }, [catalogo.data, termo]);

  const filaAtual = filas.find((f) => f.chave === filaSel) ?? null;
  const servicosDaFila = filaAtual?.itens ?? [];
  const visiveis = termo ? resultadosBusca : servicosDaFila;

  const totalServicos = catalogo.data?.length ?? 0;

  const camposExtras = (item?.campos_extras ?? []) as CampoExtra[];
  const pedidoObrigatorio = item?.entidade_tipo_exigida === "pedido";

  const invalido =
    !item ||
    !descricao.trim() ||
    (pedidoObrigatorio && !pedidoRef.trim()) ||
    camposExtras.some((c) => !(extras[c.chave] ?? "").trim());

  function selecionar(i: ItemCatalogo) {
    setItem(i);
    setTipo("requisicao");
    setPedidoRef("");
    setExtras({});
    setDescricao("");
  }

  async function abrirChamado() {
    if (!item) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc("abrir_chamado_catalogo", {
        p_assunto_codigo: item.codigo,
        p_descricao: descricao.trim(),
        p_tipo: tipo,
        p_pedido_ref: pedidoRef.trim() || null,
        p_campos: extras,
      });
      if (error) throw error;
      const r = data as {
        ok: boolean;
        chamado_id?: string;
        numero?: string;
        cadeira?: string;
        erro?: string;
      } | null;
      if (!r?.ok || !r.chamado_id) {
        throw new Error(r?.erro ?? "O banco não confirmou a abertura do chamado.");
      }
      toast.success(`Chamado ${r.numero ?? ""} aberto para ${r.cadeira ?? item.cadeira}`);
      navigate(`/chamados/${r.chamado_id}`);
    } catch (e) {
      console.error("[ChamadoNovo] falha ao abrir chamado:", e);
      toast.error(formatError(e));
    } finally {
      setEnviando(false);
    }
  }

  const mostrandoServicos = !!termo || !!filaAtual;

  return (
    <PageShell variant={item ? "leitura" : "dados"}>
      <PageHeader
        titulo="Abrir chamado"
        icone={Ticket}
        breadcrumb={[
          { label: "Chamados", to: "/chamados" },
          ...(item || filaAtual
            ? [{ label: "Abrir chamado", to: "/chamados/novo" }]
            : [{ label: "Abrir chamado" }]),
          ...(filaAtual && !item ? [{ label: filaAtual.nome }] : []),
          ...(item ? [{ label: item.item ?? "Serviço" }] : []),
        ]}
        estado={
          catalogo.isLoading
            ? "Carregando catálogo..."
            : item
              ? [
                  item.item ?? "—",
                  item.cadeira ?? "—",
                  item.prazo_primeira_resposta_h != null
                    ? `resposta em ${item.prazo_primeira_resposta_h}h`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : filaAtual && !termo
                ? `${filaAtual.nome} · ${servicosDaFila.length} serviço(s)`
                : `${totalServicos} serviços em ${filas.length} filas`
        }
      />

      {!podeEditar && <AvisoSomenteLeitura />}

      {/* CATÁLOGO — só quando nenhum serviço está escolhido */}
      {!item && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              {mostrandoServicos && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBusca("");
                    setFilaSel(null);
                  }}
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Todas as filas
                </Button>
              )}
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar serviço em todas as filas..."
                className="h-9 w-full max-w-xs"
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {mostrandoServicos
                ? `${visiveis.length} ${visiveis.length === 1 ? "serviço" : "serviços"}`
                : `${filas.length} ${filas.length === 1 ? "fila" : "filas"}`}
            </span>
          </div>

          {catalogo.isError ? (
            <ErroQuery
              o_que="o catálogo de serviços"
              erro={catalogo.error}
              onTentar={() => catalogo.refetch()}
            />
          ) : catalogo.isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : !mostrandoServicos ? (
            /* ETAPA 1 — FILAS */
            filas.length === 0 ? (
              <EstadoVazio
                icone={Search}
                titulo="Nenhuma fila no catálogo"
                mensagem="Fale com o Atendimento para cadastrar os serviços."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filas.map((f) => {
                  const Icone = iconeDaFila(f.icone);
                  return (
                    <button
                      key={f.chave}
                      type="button"
                      onClick={() => setFilaSel(f.chave)}
                      className="flex h-full flex-col items-start rounded-md border p-3 text-left transition-colors hover:border-primary/50"
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <Icone className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
                        <Badge variant="secondary">{f.itens.length}</Badge>
                      </span>
                      <p className="mt-2 text-sm font-medium">{f.nome}</p>
                      {f.descricao && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {f.descricao}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )
          ) : /* ETAPA 2 — SERVIÇOS */
          visiveis.length === 0 ? (
            <EstadoVazio
              icone={Search}
              titulo="Nenhum serviço com esse nome"
              mensagem="Tente outra palavra ou volte para todas as filas."
              acao={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBusca("");
                    setFilaSel(null);
                  }}
                >
                  Limpar busca
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visiveis.map((i) => {
                const detalhes = [
                  termo ? (i.fila ?? "Outros") : null,
                  i.cadeira ?? "Sem área",
                  i.prazo_primeira_resposta_h != null
                    ? `resposta em ${i.prazo_primeira_resposta_h}h`
                    : null,
                ].filter(Boolean);
                return (
                  <button
                    key={i.codigo ?? i.item}
                    type="button"
                    onClick={() => selecionar(i)}
                    className="flex h-full flex-col items-start rounded-md border p-3 text-left transition-colors hover:border-primary/50"
                  >
                    <p className="text-sm font-medium">{i.item ?? "—"}</p>
                    {i.descricao && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {i.descricao}
                      </p>
                    )}
                    <p className="mt-auto pt-1.5 text-[11px] text-muted-foreground">
                      {detalhes.join(" · ")}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ETAPA 3 — DESCREVER */}
      {item && (
        <Card>
          <CardHeader className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-base">Descreva o chamado</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setItem(null)}
                className="shrink-0"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Trocar serviço
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{item.item}</span>
              {" · "}atendido por {item.cadeira ?? "—"}
              {(item.prazo_primeira_resposta_h != null || item.prazo_dias != null) && (
                <>
                  {" · "}
                  {item.prazo_primeira_resposta_h != null &&
                    `Primeira resposta em até ${item.prazo_primeira_resposta_h}h`}
                  {item.prazo_primeira_resposta_h != null && item.prazo_dias != null && " · "}
                  {item.prazo_dias != null &&
                    (item.prazo_dias === 0
                      ? "Solução no mesmo dia"
                      : item.prazo_dias === 1
                        ? "Solução em 1 dia útil"
                        : `Solução em ${item.prazo_dias} dias úteis`)}
                </>
              )}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <ToggleGroup
                type="single"
                value={tipo}
                onValueChange={(v) => v && setTipo(v as TipoChamado)}
                className="justify-start"
              >
                {TIPOS.map((t) => (
                  <ToggleGroupItem key={t.valor} value={t.valor} className="gap-1.5">
                    {t.rotulo}
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      ({t.ajuda})
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            {pedidoObrigatorio && (
              <div className="space-y-1.5">
                <Label htmlFor="pedido-ref">Número do pedido *</Label>
                <Input
                  id="pedido-ref"
                  value={pedidoRef}
                  onChange={(e) => setPedidoRef(e.target.value)}
                  placeholder="PED-0000"
                />
              </div>
            )}

            {camposExtras.map((c) => (
              <div key={c.chave} className="space-y-1.5">
                <Label htmlFor={`extra-${c.chave}`}>{c.rotulo} *</Label>
                <Input
                  id={`extra-${c.chave}`}
                  value={extras[c.chave] ?? ""}
                  onChange={(e) =>
                    setExtras((prev) => ({ ...prev, [c.chave]: e.target.value }))
                  }
                />
              </div>
            ))}

            <div className="space-y-1.5">
              <Label htmlFor="descricao-chamado">Descrição *</Label>
              <Textarea
                id="descricao-chamado"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={5}
                placeholder="Conte o que aconteceu ou o que você precisa, com o máximo de contexto."
              />
            </div>

            <div className="flex justify-end">
              {podeEditar ? (
                <Button onClick={abrirChamado} disabled={invalido || enviando}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  {enviando ? "Abrindo..." : "Abrir chamado"}
                </Button>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button disabled>
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Abrir chamado
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Você tem acesso somente leitura nesta tela
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rodapé — abrir avulso sem item vem em outra entrega */}
      {!item && !catalogo.isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Não achou o serviço? Abra o chamado pela tela do pedido ou fale com o Atendimento.
        </p>
      )}
    </PageShell>
  );
}
