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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

function ErroQuery({ o_que, erro }: { o_que: string; erro: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        Não foi possível carregar {o_que}: {formatError(erro)}
      </AlertDescription>
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

  const grupos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const itens = (catalogo.data ?? []).filter((i) => {
      if (!termo) return true;
      return (
        (i.item ?? "").toLowerCase().includes(termo) ||
        (i.descricao ?? "").toLowerCase().includes(termo)
      );
    });
    const mapa = new Map<string, ItemCatalogo[]>();
    for (const i of itens) {
      const chave = i.cadeira ?? "Sem cadeira";
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(i);
    }
    return [...mapa.entries()];
  }, [catalogo.data, busca]);

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
          item
            ? `Serviço: ${item.item ?? "—"}`
            : "Escolha o serviço no catálogo abaixo"
        }
      />

      {!podeEditar && <AvisoSomenteLeitura />}

      {/* ETAPA 1 — ESCOLHER O SERVIÇO */}
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">1 · Escolha o serviço</CardTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou descrição..."
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {catalogo.isError ? (
            <ErroQuery o_que="o catálogo de serviços" erro={catalogo.error} />
          ) : catalogo.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : grupos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum serviço encontrado{busca.trim() ? ` para "${busca.trim()}"` : ""}.
            </p>
          ) : (
            <Accordion
              type="multiple"
              defaultValue={grupos.map(([c]) => c)}
              className="w-full"
            >
              {grupos.map(([cadeira, itens]) => (
                <AccordionItem key={cadeira} value={cadeira}>
                  <AccordionTrigger className="text-sm font-medium">
                    <span className="flex items-center gap-2">
                      {cadeira}
                      <Badge variant="secondary" className="text-xs">
                        {itens.length}
                      </Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {itens.map((i) => {
                        const ativo = item?.codigo === i.codigo;
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
                          </button>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* ETAPA 2 — DESCREVER */}
      {item && (
        <Card>
          <CardHeader className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-base">2 · Descreva o chamado</CardTitle>
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
                Não achou? Abra pelo pedido na tela do pedido, ou fale com o
                Atendimento.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
