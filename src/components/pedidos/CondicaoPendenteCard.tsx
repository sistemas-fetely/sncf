import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { useRotearPedido } from "@/hooks/pedidos/useRotearPedido";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";
import {
  EVENTO_DESTACAR_CONDICAO,
  ehMotivoCondicaoPendente,
  previaParcelas,
  rotuloProposto,
  validarDias,
} from "@/lib/pedidos/condicaoPendente";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Forma = "boleto" | "cartao";

interface Sugestao {
  forma_detectada: string | null;
  dias_detectados: number[] | null;
  sugestao: { id: string; slug: string; rotulo: string; canonica: string; forma: string; motivo: string } | null;
  proposta_nova: {
    forma: string; dias: number[]; slug: string; rotulo: string; canonica: string; regra_codigo: string; slug_ja_existe: boolean;
  } | null;
}

interface ResultadoVinculo {
  ok: boolean;
  condicao_rotulo?: string;
  outros_pedidos_vinculados?: number;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function normalizarForma(f?: string | null): Forma | null {
  const s = (f ?? "").toLowerCase();
  if (s.startsWith("bol")) return "boleto";
  if (s.startsWith("cart")) return "cartao";
  return null;
}

export function CondicaoPendenteCard({ pedido }: { pedido: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const rotear = useRotearPedido();
  const { permitido: podeMapear } = usePermissaoAcaoOuSuperAdmin("acao.condicao_mapear");
  const { permitido: podeCriar } = usePermissaoAcaoOuSuperAdmin("acao.condicao_criar");

  const textoFop: string = pedido.condicao_origem ?? pedido.condicao_solicitada ?? "";
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(false);
  const [modo, setModo] = useState<"sugestao" | "escolher" | "criar">("sugestao");
  const [escolhidaId, setEscolhidaId] = useState<string | null>(null);
  const [comboAberto, setComboAberto] = useState(false);
  const [forma, setForma] = useState<Forma>("boleto");
  const [dias, setDias] = useState<number[]>([]);
  const [novoDia, setNovoDia] = useState("");
  const [enviando, setEnviando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Botão de triagem pede destaque quando rotear_pedido devolve pendência de condição.
  useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent).detail?.pedidoId !== pedido.id) return;
      setAberto(true);
      setDestaque(true);
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => setDestaque(false), 2500);
    };
    window.addEventListener(EVENTO_DESTACAR_CONDICAO, h);
    return () => window.removeEventListener(EVENTO_DESTACAR_CONDICAO, h);
  }, [pedido.id]);

  const sugQ = useQuery({
    queryKey: ["sugerir-condicao", pedido.id, textoFop, pedido.forma_solicitada],
    enabled: aberto && podeMapear,
    queryFn: async (): Promise<Sugestao> => {
      const { data, error } = await (supabase as any).rpc("fn_sugerir_condicao", {
        p_texto: textoFop,
        p_forma: pedido.forma_solicitada ?? null,
      });
      if (error) throw error;
      return data as Sugestao;
    },
  });

  const formaPedido: Forma | null =
    normalizarForma(sugQ.data?.sugestao?.forma) ??
    normalizarForma(sugQ.data?.forma_detectada) ??
    normalizarForma(pedido.forma_solicitada);

  // Pré-preenche o formulário de criação e o modo inicial.
  useEffect(() => {
    if (!sugQ.data) return;
    const p = sugQ.data.proposta_nova;
    setForma(normalizarForma(p?.forma) ?? formaPedido ?? "boleto");
    setDias(p?.dias?.length ? [...p.dias] : sugQ.data.dias_detectados ?? []);
    setModo(sugQ.data.sugestao ? "sugestao" : "criar");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugQ.data]);

  const condQ = useQuery({
    queryKey: ["condicoes-pagamento-ativas-forma", formaPedido],
    enabled: aberto && podeMapear && modo === "escolher",
    queryFn: async () => {
      let q = (supabase as any).from("condicoes_pagamento").select("id, rotulo, forma, ordem").eq("ativo", true);
      if (formaPedido) q = q.eq("forma", formaPedido);
      const { data, error } = await q.order("ordem");
      if (error) throw error;
      return (data ?? []) as { id: string; rotulo: string; forma: string }[];
    },
  });

  const erroDias = validarDias(dias);
  const valor = Number(pedido.valor_liquido ?? 0);
  const previa = useMemo(() => previaParcelas(valor, dias), [valor, dias]);

  async function seguir(res: ResultadoVinculo, rotuloFallback: string) {
    await invalidarPedido(qc, pedido.id);
    const r = await rotear.mutateAsync({ p_pedido_id: pedido.id });
    const outros = Number(res.outros_pedidos_vinculados ?? 0);
    toast({
      title: `Condição vinculada: ${res.condicao_rotulo ?? rotuloFallback}`
        + (outros > 0 ? ` · mais ${outros} pedido(s) com o mesmo texto` : ""),
    });
    if (!r?.ok && !ehMotivoCondicaoPendente(r?.motivo)) {
      toast({
        title: "Condição vinculada, mas o pedido não seguiu",
        description: r?.mensagem || r?.motivo || "Verifique o pedido.",
        variant: "destructive",
      });
    }
    setAberto(false);
  }

  async function executar(fn: () => Promise<{ res: ResultadoVinculo; rotulo: string }>) {
    setEnviando(true);
    try {
      const { res, rotulo } = await fn();
      if (!res?.ok) throw new Error("A vinculação não foi confirmada pelo banco.");
      await seguir(res, rotulo);
    } catch (e: any) {
      toast({ title: "Não foi possível vincular a condição", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  const mapear = (condicaoId: string, rotulo: string) =>
    executar(async () => {
      const { data, error } = await (supabase as any).rpc("mapear_condicao_pedido", {
        p_pedido_id: pedido.id,
        p_condicao_id: condicaoId,
      });
      if (error) throw error;
      return { res: data as ResultadoVinculo, rotulo };
    });

  const criar = () =>
    executar(async () => {
      const rotulo = rotuloProposto(forma, dias);
      const { data, error } = await (supabase as any).rpc("criar_condicao_pagamento_rapida", {
        p_pedido_id: pedido.id,
        p_forma: forma,
        p_dias: dias,
        p_rotulo: null,
      });
      if (error) throw error;
      return { res: data as ResultadoVinculo, rotulo };
    });

  function adicionarDia() {
    const n = Number(novoDia);
    if (novoDia.trim() === "" || !Number.isFinite(n)) return;
    setDias((d) => [...d, Math.trunc(n)]);
    setNovoDia("");
  }

  const escolhida = (condQ.data ?? []).find((c) => c.id === escolhidaId);
  const ocupado = enviando || rotear.isPending;

  return (
    <div
      ref={ref}
      className={cn(
        "mx-6 mb-3 rounded-lg border border-warning/50 border-l-4 border-l-warning-strong bg-warning/15 p-3 text-warning-strong transition-shadow",
        destaque && "ring-2 ring-warning-strong ring-offset-2 ring-offset-background",
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Condição de pagamento a confirmar</p>
          <p className="text-sm">
            O FOP enviou: <em className="font-medium">{textoFop || "—"}</em>
          </p>
          {!podeMapear && (
            <p className="text-xs mt-1 opacity-90">Aguardando Operações confirmar a condição</p>
          )}
        </div>
        {podeMapear && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => setAberto((v) => !v)}>
            {aberto ? "Fechar" : "Resolver"}
          </Button>
        )}
      </div>

      {aberto && podeMapear && (
        <div className="mt-3 rounded-md border border-border bg-card p-3 text-foreground space-y-3">
          {sugQ.isPending && <p className="text-sm text-muted-foreground">Procurando condição equivalente…</p>}
          {sugQ.isError && (
            <p className="text-sm text-destructive">Erro ao buscar sugestão: {(sugQ.error as Error).message}</p>
          )}

          {sugQ.data && modo === "sugestao" && sugQ.data.sugestao && (
            <div className="space-y-2">
              <p className="text-sm">
                Equivale a <strong>{sugQ.data.sugestao.rotulo}</strong>?
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" disabled={ocupado} onClick={() => mapear(sugQ.data!.sugestao!.id, sugQ.data!.sugestao!.rotulo)}>
                  Confirmar e seguir
                </Button>
                <button type="button" className="text-sm underline text-primary" onClick={() => setModo("escolher")}>
                  Escolher outra
                </button>
              </div>
            </div>
          )}

          {sugQ.data && modo === "escolher" && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Escolha a condição equivalente</p>
              <div className="flex flex-wrap items-center gap-2">
                <Popover open={comboAberto} onOpenChange={setComboAberto}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-72 justify-between">
                      <span className="truncate">{escolhida?.rotulo ?? "Selecionar condição…"}</span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0">
                    <Command>
                      <CommandInput placeholder="Buscar condição…" />
                      <CommandList>
                        <CommandEmpty>{condQ.isPending ? "Carregando…" : "Nenhuma condição."}</CommandEmpty>
                        <CommandGroup>
                          {(condQ.data ?? []).map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.rotulo}
                              onSelect={() => { setEscolhidaId(c.id); setComboAberto(false); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", escolhidaId === c.id ? "opacity-100" : "opacity-0")} />
                              {c.rotulo}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button size="sm" disabled={!escolhida || ocupado} onClick={() => escolhida && mapear(escolhida.id, escolhida.rotulo)}>
                  Confirmar e seguir
                </Button>
              </div>
              {condQ.isError && <p className="text-sm text-destructive">{(condQ.error as Error).message}</p>}
              <div className="flex gap-3 text-sm">
                {sugQ.data.sugestao && (
                  <button type="button" className="underline text-muted-foreground" onClick={() => setModo("sugestao")}>
                    Voltar à sugestão
                  </button>
                )}
                <button type="button" className="underline text-primary" onClick={() => setModo("criar")}>
                  Não existe, criar nova
                </button>
              </div>
            </div>
          )}

          {sugQ.data && modo === "criar" && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Criar nova condição</p>
              <div className="inline-flex rounded-md border border-border p-0.5">
                {(["boleto", "cartao"] as Forma[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setForma(f)}
                    className={cn(
                      "px-3 py-1 text-sm rounded-sm",
                      forma === f ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {f === "boleto" ? "Boleto" : "Cartão"}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Prazos (dias):</span>
                {dias.map((d, i) => (
                  <span key={`${d}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-sm">
                    {d}
                    <button type="button" aria-label={`Remover ${d} dias`} onClick={() => setDias((x) => x.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={novoDia}
                  onChange={(e) => setNovoDia(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarDia(); } }}
                  className="h-7 w-20"
                  placeholder="dias"
                />
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1" onClick={adicionarDia}>
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>
              {erroDias ? (
                <p className="text-sm text-destructive">{erroDias}</p>
              ) : (
                <div className="text-sm space-y-0.5">
                  <p>Será criada: <strong>{rotuloProposto(forma, dias)}</strong></p>
                  <p className="text-muted-foreground">
                    {previa.map((p) => `${brl(p.valor)} em ${p.data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`).join(" · ")}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={podeCriar ? -1 : 0}>
                        <Button size="sm" disabled={!podeCriar || !!erroDias || ocupado} onClick={criar}>
                          Criar condição e seguir
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!podeCriar && (
                      <TooltipContent>Só SOPs/Financeiro criam condições — escolha uma existente ou peça a eles</TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                <button type="button" className="text-sm underline text-primary" onClick={() => setModo("escolher")}>
                  Escolher uma existente
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
