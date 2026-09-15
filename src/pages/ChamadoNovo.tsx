import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, HelpCircle, PlusCircle, Search, Ticket } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
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
import {
  PermissaoTelaProvider,
  usePermissaoTelaContext,
  AvisoSomenteLeitura,
} from "@/contexts/PermissaoTelaContext";

/**
 * Abrir chamado — duas etapas na mesma página: escolher o serviço no catálogo
 * (vw_catalogo_arvore agrupada por cadeira) e descrever. Quem valida tudo
 * (pedido obrigatório, campos extras, duplicidade) é a RPC
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
}

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
  const [cadeiraFiltro, setCadeiraFiltro] = useState<string>("todas");
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

  const cadeiras = useMemo(() => {
    const porNome = new Map<string, number>();
    for (const i of catalogo.data ?? []) {
      const nome = i.cadeira ?? "Sem cadeira";
      const ordem = i.cadeira_ordem ?? Number.MAX_SAFE_INTEGER;
      const ordemAtual = porNome.get(nome);
      if (ordemAtual == null || ordem < ordemAtual) porNome.set(nome, ordem);
    }
    return [...porNome.entries()]
      .sort(([nomeA, ordemA], [nomeB, ordemB]) => ordemA - ordemB || nomeA.localeCompare(nomeB))
      .map(([nome]) => nome);
  }, [catalogo.data]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (catalogo.data ?? []).filter((i) => {
      const correspondeCadeira =
        cadeiraFiltro === "todas" || (i.cadeira ?? "Sem cadeira") === cadeiraFiltro;
      const correspondeBusca =
        !termo ||
        (i.item ?? "").toLowerCase().includes(termo) ||
        (i.descricao ?? "").toLowerCase().includes(termo);
      return correspondeCadeira && correspondeBusca;
    });
  }, [catalogo.data, busca, cadeiraFiltro]);

  const totalServicos = catalogo.data?.length ?? 0;
  const totalCadeiras = cadeiras.length;

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

  return (
    <PageShell variant="leitura">
      <PageHeader
        titulo="Abrir chamado"
        icone={Ticket}
        breadcrumb={[{ label: "Chamados", to: "/chamados" }, { label: "Abrir chamado" }]}
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
              : `${totalServicos} serviços em ${totalCadeiras} cadeiras`
        }
      />

      {!podeEditar && <AvisoSomenteLeitura />}

      <div className="space-y-3 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou descrição..."
            className="h-9 w-full max-w-xs"
          />
          <span className="text-sm text-muted-foreground">
            {filtrados.length} {filtrados.length === 1 ? "serviço" : "serviços"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={cadeiraFiltro === "todas" ? "default" : "outline"}
            onClick={() => setCadeiraFiltro("todas")}
          >
            Todas
          </Button>
          {cadeiras.map((cadeira) => (
            <Button
              key={cadeira}
              type="button"
              size="sm"
              variant={cadeiraFiltro === cadeira ? "default" : "outline"}
              onClick={() => setCadeiraFiltro(cadeira)}
            >
              {cadeira}
            </Button>
          ))}
        </div>
      </div>

      {catalogo.isError ? (
        <ErroQuery
          o_que="o catálogo de serviços"
          erro={catalogo.error}
          onTentar={() => catalogo.refetch()}
        />
      ) : catalogo.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <EstadoVazio
          icone={Search}
          titulo="Nenhum serviço com esse nome"
          mensagem="Tente outra palavra ou volte para todas as cadeiras."
          acao={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBusca("");
                setCadeiraFiltro("todas");
              }}
            >
              Limpar busca
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((i) => {
            const ativo = item?.codigo === i.codigo;
            const detalhes = [
              i.cadeira ?? "Sem cadeira",
              i.prazo_primeira_resposta_h != null
                ? `resposta em ${i.prazo_primeira_resposta_h}h`
                : null,
              i.prazo_dias != null
                ? `solução em ${i.prazo_dias} ${i.prazo_dias === 1 ? "dia útil" : "dias úteis"}`
                : null,
            ].filter(Boolean);
            return (
              <button
                key={i.codigo ?? i.item}
                type="button"
                onClick={() => selecionar(i)}
                className={cn(
                  "rounded-md border p-3 text-left transition-colors hover:border-primary/50",
                  ativo && "border-primary bg-primary/5 ring-1 ring-primary/40",
                )}
              >
                <p className="text-sm font-medium">{i.item ?? "—"}</p>
                {i.descricao && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {i.descricao}
                  </p>
                )}
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {detalhes.join(" · ")}
                </p>
              </button>
            );
          })}
        </div>
      )}
        </CardContent>
      </Card>

      {/* ETAPA 2 — DESCREVER */}
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
                    `Solução em até ${item.prazo_dias} dia${item.prazo_dias === 1 ? "" : "s"} útil${item.prazo_dias === 1 ? "" : "eis"}`}
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
        <Card className="border-dashed">
          <CardContent className="flex items-start gap-3 p-4">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Não achou o que precisa?</p>
              <p className="text-sm text-muted-foreground">
                Abra o chamado pela tela do pedido ou fale com o Atendimento.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
