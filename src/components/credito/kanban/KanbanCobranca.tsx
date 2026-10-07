import { useMemo, useState, type ReactNode } from "react";
import { Pause, CalendarClock, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import { useAuth } from "@/contexts/AuthContext";
import { useInvalidarRecebivel } from "@/hooks/recebivel/useInvalidarRecebivel";
import {
  useCobrancaKanban, useRaiasKanban, usePessoasKanban, moverRaia,
  type CardKanban, type LinhaKanban, type RaiaKanban,
} from "@/hooks/credito/useCobrancaKanban";
import { resolverEtapaParaTitulo, type ReguaEtapa } from "@/hooks/credito/useReguaFila";
import type { TituloCobranca } from "@/hooks/credito/useTitulosCobranca";
import { CardKanbanCompacto } from "./CardKanbanCompacto";
import { RaiaDialog, type ModoRaiaDialog } from "./RaiaDialog";
import { BlocoRaiaSheet } from "./BlocoRaiaSheet";
import { CLASSE_TOPO, tomDaRaia } from "./cores";

type Filtro = { tipo: "todos" } | { tipo: "meus" } | { tipo: "dep"; id: string };

interface Pendente {
  card: CardKanban;
  dialog: ModoRaiaDialog;
  destino: RaiaKanban;
}

export function KanbanCobranca({
  etapas, acaoAtrasada, renderCompleto, vazio,
}: {
  etapas: ReguaEtapa[];
  acaoAtrasada: (t: TituloCobranca) => boolean;
  renderCompleto: (t: TituloCobranca) => ReactNode;
  vazio: ReactNode;
}) {
  const { user } = useAuth();
  const invalidarRecebivel = useInvalidarRecebivel();
  const { data, isLoading } = useCobrancaKanban();
  const { data: raias = [], isLoading: loadingRaias } = useRaiasKanban();
  const { data: pessoas = [] } = usePessoasKanban();

  const [filtro, setFiltro] = useState<Filtro>({ tipo: "todos" });
  const [busca, setBusca] = useState("");
  const [overrides, setOverrides] = useState<Map<string, Partial<LinhaKanban>>>(new Map());
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const cards = useMemo<CardKanban[]>(
    () =>
      (data?.cards ?? []).map((c) => {
        const o = overrides.get(c.id);
        return o ? { ...c, _kanban: { ...c._kanban, ...o } } : c;
      }),
    [data, overrides],
  );

  const departamentos = useMemo(() => {
    const m = new Map<string, string>();
    raias.forEach((r) => { if (r.departamento_id) m.set(r.departamento_id, r.departamento_nome ?? "—"); });
    return [...m.entries()];
  }, [raias]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return cards.filter((c) => {
      if (filtro.tipo === "meus" && c._kanban.responsavel_user_id !== user?.id) return false;
      if (filtro.tipo === "dep" && c._kanban.departamento_id !== filtro.id) return false;
      if (!q) return true;
      return [c.parceiro_razao_social, c.parceiro_nome_fantasia, c.pedido_id_externo, c.numero_titulo]
        .some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }, [cards, filtro, busca, user?.id]);

  /** ATRASO-E-O-EIXO: atraso desc, desempate por valor desc. */
  const porRaia = useMemo(() => {
    const m = new Map<string, CardKanban[]>();
    raias.forEach((r) => m.set(r.codigo, []));
    visiveis.forEach((c) => m.get(c._kanban.raia_codigo)?.push(c));
    m.forEach((l) =>
      l.sort((a, b) =>
        (b.dias_atraso ?? 0) - (a.dias_atraso ?? 0) ||
        Number(b.valor_efetivo ?? 0) - Number(a.valor_efetivo ?? 0)),
    );
    return m;
  }, [visiveis, raias]);

  const aplicarOverride = (id: string, o: Partial<LinhaKanban> | null) =>
    setOverrides((prev) => {
      const n = new Map(prev);
      if (o) n.set(id, o); else n.delete(id);
      return n;
    });

  const linhaDaRaia = (r: RaiaKanban): Partial<LinhaKanban> => ({
    raia_codigo: r.codigo,
    raia_rotulo: r.rotulo,
    raia_ordem: r.ordem,
    raia_cor: r.cor,
    departamento_id: r.departamento_id,
    departamento_nome: r.departamento_nome,
    pausa_regua: r.pausa_regua,
    exige_data_retorno: r.exige_data_retorno,
  });

  /** Move com otimismo; rollback em erro. Retorna true se gravou. */
  const executarMover = async (
    card: CardKanban,
    destino: RaiaKanban,
    extra: { retornoEm?: string | null; observacao?: string | null },
    comDesfazer: boolean,
  ): Promise<boolean> => {
    const anterior = card._kanban;
    const mudouDep = anterior.departamento_id !== destino.departamento_id;
    aplicarOverride(card.id, {
      ...linhaDaRaia(destino),
      retorno_em: extra.retornoEm ?? null,
      ...(mudouDep ? { responsavel_user_id: null, responsavel_nome: null } : {}),
      dias_na_raia: 0,
    });
    setSalvando(true);
    try {
      const r = await moverRaia({
        tituloId: card.id,
        raiaCodigo: destino.codigo,
        retornoEm: extra.retornoEm ?? null,
        observacao: extra.observacao ?? null,
      });
      const partes = [`Movido para ${destino.rotulo}.`];
      if (r?.regua_pausada || destino.pausa_regua) {
        partes.push(`Régua automática pausada enquanto estiver em ${destino.rotulo}.`);
      }
      const origem = raias.find((x) => x.codigo === anterior.raia_codigo);
      toast.success(partes.join(" "), comDesfazer && origem ? {
        action: {
          label: "Desfazer",
          onClick: () => {
            void executarMover(
              { ...card, _kanban: { ...anterior, ...linhaDaRaia(destino) } },
              origem,
              { retornoEm: anterior.retorno_em },
              false,
            );
          },
        },
      } : undefined);
      await invalidarRecebivel();
      aplicarOverride(card.id, null);
      return true;
    } catch (e) {
      aplicarOverride(card.id, null);
      toast.error((e as Error).message);
      return false;
    } finally {
      setSalvando(false);
    }
  };

  /** Mesma raia: só troca pessoa / data / observação. */
  const executarAjuste = async (
    card: CardKanban,
    v: { responsavel?: string | null; retornoEm?: string; observacao?: string },
  ): Promise<boolean> => {
    const k = card._kanban;
    const responsavel = v.responsavel !== undefined ? v.responsavel : k.responsavel_user_id;
    const retorno = v.retornoEm !== undefined ? v.retornoEm : k.retorno_em;
    aplicarOverride(card.id, {
      responsavel_user_id: responsavel,
      responsavel_nome: responsavel ? pessoas.find((p) => p.user_id === responsavel)?.full_name ?? null : null,
      retorno_em: retorno,
    });
    setSalvando(true);
    try {
      await moverRaia({
        tituloId: card.id,
        raiaCodigo: k.raia_codigo,
        responsavelUserId: responsavel,
        retornoEm: retorno,
        observacao: v.observacao ?? null,
      });
      toast.success("Título atualizado.");
      await invalidarRecebivel();
      aplicarOverride(card.id, null);
      return true;
    } catch (e) {
      aplicarOverride(card.id, null);
      toast.error((e as Error).message);
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const pedirMover = (card: CardKanban, destino: RaiaKanban) => {
    if (destino.codigo === card._kanban.raia_codigo) return;
    if (destino.exige_data_retorno) {
      setPendente({ card, destino, dialog: { modo: "mover", rotuloRaia: destino.rotulo } });
      return;
    }
    void executarMover(card, destino, {}, true);
  };

  const confirmarDialog = async (v: { retornoEm?: string; observacao?: string; responsavel?: string | null }) => {
    if (!pendente) return;
    const ok = pendente.dialog.modo === "mover"
      ? await executarMover(pendente.card, pendente.destino, v, true)
      : await executarAjuste(pendente.card, pendente.dialog.modo === "atribuir"
        ? { responsavel: v.responsavel ?? null }
        : { retornoEm: v.retornoEm });
    if (ok) setPendente(null);
  };

  const abrirAjuste = (card: CardKanban, modo: "atribuir" | "data") => {
    const destino = raias.find((r) => r.codigo === card._kanban.raia_codigo);
    if (!destino) return;
    setPendente({
      card,
      destino,
      dialog: modo === "atribuir"
        ? { modo, atual: card._kanban.responsavel_user_id }
        : { modo, atual: card._kanban.retorno_em },
    });
  };

  const aberto = cards.find((c) => c.id === abertoId) ?? null;

  if (isLoading || loadingRaias) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (cards.length === 0) return <>{vazio}</>;

  const pilula = (ativo: boolean) =>
    cn("rounded-full border px-3 py-1 text-xs transition-colors",
      ativo ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={pilula(filtro.tipo === "todos")} onClick={() => setFiltro({ tipo: "todos" })}>Todos</button>
        <button type="button" className={pilula(filtro.tipo === "meus")} onClick={() => setFiltro({ tipo: "meus" })}>Meus cards</button>
        {departamentos.map(([id, nome]) => (
          <button key={id} type="button" className={pilula(filtro.tipo === "dep" && filtro.id === id)}
            onClick={() => setFiltro({ tipo: "dep", id })}>{nome}</button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, pedido ou título"
            className="h-8 pl-7 text-xs" />
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {raias.map((r) => {
          const lista = porRaia.get(r.codigo) ?? [];
          const soma = lista.reduce((a, c) => a + Number(c.valor_efetivo ?? 0), 0);
          const tom = tomDaRaia(r.cor);
          return (
            <div
              key={r.codigo}
              onDragOver={(e) => { if (arrastando) { e.preventDefault(); setSobre(r.codigo); } }}
              onDragLeave={() => setSobre((s) => (s === r.codigo ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || arrastando;
                setSobre(null);
                setArrastando(null);
                const card = cards.find((c) => c.id === id);
                if (card) pedirMover(card, r);
              }}
              className={cn(
                "w-[300px] shrink-0 rounded-md border border-t-4 bg-muted/30 flex flex-col max-h-[70vh]",
                CLASSE_TOPO[tom],
                sobre === r.codigo && "ring-2 ring-primary/50",
              )}
            >
              <div className="p-2 border-b space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">{r.rotulo}</span>
                  {r.pausa_regua && <Pause className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="Pausa a régua" />}
                  {r.exige_data_retorno && <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="Exige data de retorno" />}
                </div>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {r.departamento_nome ?? "—"} · {lista.length} · {formatBRL(soma)}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px]">
                {lista.map((c) => (
                  <CardKanbanCompacto
                    key={c.id}
                    card={c}
                    etapa={resolverEtapaParaTitulo(c, etapas)}
                    acaoAtrasada={acaoAtrasada(c)}
                    raias={raias}
                    onAbrir={() => setAbertoId(c.id)}
                    onMover={(dest) => pedirMover(c, dest)}
                    onAtribuir={() => abrirAjuste(c, "atribuir")}
                    onAlterarData={() => abrirAjuste(c, "data")}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "move";
                      setArrastando(c.id);
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <RaiaDialog
        estado={pendente?.dialog ?? null}
        pessoas={pessoas}
        salvando={salvando}
        onCancelar={() => setPendente(null)}
        onConfirmar={confirmarDialog}
      />

      <Sheet open={!!aberto} onOpenChange={(v) => { if (!v) setAbertoId(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {aberto && (
            <>
              <SheetHeader>
                <SheetTitle className="text-base">{aberto.parceiro_razao_social ?? "Título"}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                {renderCompleto(aberto)}
                <BlocoRaiaSheet
                  card={aberto}
                  raias={raias}
                  pessoas={pessoas}
                  salvando={salvando}
                  onSalvar={(v) => executarAjuste(aberto, v)}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
