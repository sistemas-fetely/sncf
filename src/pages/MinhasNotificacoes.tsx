import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ExternalLink, Check, Undo2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Histórico pessoal de notificações — LER-É-DISPENSAR (29/08/2026).
 * O sino mostra só as não-lidas; aqui vive o histórico completo das duas fontes
 * (`notificacoes` e `notificacoes_rh`). Lida é apagada após 60 dias pelo cron.
 */

type Filtro = "nao_lidas" | "lidas" | "todas";
type Fonte = "rh" | "geral";

interface Item {
  id: string;
  fonte: Fonte;
  titulo: string;
  texto: string | null;
  destino: string | null;
  modulo: string | null;
  lida: boolean;
  data: string;
}

const PAGINA = 30;

export default function MinhasNotificacoes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("nao_lidas");
  const [paginas, setPaginas] = useState(1);
  const [agindo, setAgindo] = useState(false);

  const userId = user?.id;
  const ate = paginas * PAGINA;

  const { data, isLoading } = useQuery({
    queryKey: ["minhas-notificacoes", userId ?? "anon", filtro, paginas],
    enabled: !!userId,
    queryFn: async (): Promise<Item[]> => {
      let qGeral = supabase
        .from("notificacoes")
        .select("id,titulo,corpo,url,modulo,lida,criado_por,criado_em")
        .eq("user_id", userId!)
        .order("criado_em", { ascending: false })
        .range(0, ate - 1);
      let qRh = supabase
        .from("notificacoes_rh")
        .select("id,titulo,mensagem,link,lida,created_at")
        .or(`user_id.eq.${userId},user_id.is.null`)
        .order("created_at", { ascending: false })
        .range(0, ate - 1);

      if (filtro !== "todas") {
        const lida = filtro === "lidas";
        qGeral = qGeral.eq("lida", lida);
        qRh = qRh.eq("lida", lida);
      }

      const [geral, rh] = await Promise.all([qGeral, qRh]);
      if (geral.error) throw geral.error;
      if (rh.error) throw rh.error;

      const itens: Item[] = [
        ...(geral.data ?? [])
          .filter((n) => n.criado_por !== userId)
          .map((n) => ({
            id: n.id,
            fonte: "geral" as const,
            titulo: n.titulo,
            texto: n.corpo,
            destino: n.url,
            modulo: n.modulo ?? null,
            lida: n.lida,
            data: n.criado_em,
          })),
        ...(rh.data ?? []).map((n) => ({
          id: n.id,
          fonte: "rh" as const,
          titulo: n.titulo,
          texto: n.mensagem,
          destino: n.link,
          modulo: null,
          lida: n.lida,
          data: n.created_at,
        })),
      ];

      return itens.sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, ate);
    },
  });

  const lista = useMemo(() => data ?? [], [data]);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["notificacoes", "sino"] });
    qc.invalidateQueries({ queryKey: ["minhas-notificacoes"] });
  };

  const alternarLida = async (item: Item) => {
    setAgindo(true);
    try {
      if (item.fonte === "rh") {
        const { error } = await supabase
          .from("notificacoes_rh")
          .update({ lida: !item.lida })
          .eq("id", item.id);
        if (error) throw error;
      } else {
        const rpc = item.lida ? "notificacoes_marcar_nao_lidas" : "notificacoes_marcar_lidas";
        const { error } = await supabase.rpc(rpc, { _ids: [item.id] });
        if (error) throw error;
      }
      invalidar();
    } catch (e) {
      toast.error(`Não foi possível atualizar: ${(e as Error).message}`);
    } finally {
      setAgindo(false);
    }
  };

  const marcarTodas = async () => {
    setAgindo(true);
    try {
      const { error } = await supabase.rpc("notificacoes_marcar_lidas", { _ids: null });
      if (error) throw error;
      const idsRh = lista.filter((i) => i.fonte === "rh" && !i.lida).map((i) => i.id);
      if (idsRh.length) {
        const { error: errRh } = await supabase
          .from("notificacoes_rh")
          .update({ lida: true })
          .in("id", idsRh);
        if (errRh) throw errRh;
      }
      invalidar();
    } catch (e) {
      toast.error(`Não foi possível marcar todas como lidas: ${(e as Error).message}`);
    } finally {
      setAgindo(false);
    }
  };

  return (
    <PageShell variant="leitura">
      <PageHeader
        icone={Bell}
        titulo="Minhas Notificações"
        estado="O sino mostra só as não lidas. Aqui está o histórico completo."
        acoes={
          <Button variant="outline" size="sm" disabled={agindo} onClick={marcarTodas}>
            <Check className="mr-1.5 h-4 w-4" />
            Marcar todas como lidas
          </Button>
        }
      />

      <Tabs
        value={filtro}
        onValueChange={(v) => {
          setFiltro(v as Filtro);
          setPaginas(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="nao_lidas">Não lidas</TabsTrigger>
          <TabsTrigger value="lidas">Lidas</TabsTrigger>
          <TabsTrigger value="todas">Todas</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nada por aqui neste filtro.</p>
      ) : (
        <div className="rounded-lg border">
          {lista.map((n) => (
            <div
              key={`${n.fonte}:${n.id}`}
              className={cn(
                "flex items-start gap-3 border-b px-4 py-3 last:border-0",
                !n.lida && "bg-primary/5"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={cn("truncate text-sm", !n.lida && "font-medium")}>{n.titulo}</p>
                  {n.modulo && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {n.modulo}
                    </Badge>
                  )}
                </div>
                {n.texto && <p className="mt-0.5 text-xs text-muted-foreground">{n.texto}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(n.data), { locale: ptBR, addSuffix: true })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {n.destino && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate(n.destino!)}>
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                    Abrir
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={agindo}
                  onClick={() => alternarLida(n)}
                >
                  {n.lida ? (
                    <>
                      <Undo2 className="mr-1 h-3.5 w-3.5" />
                      Não lida
                    </>
                  ) : (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Lida
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {lista.length >= ate && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setPaginas((p) => p + 1)}>
            Carregar mais
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Notificações lidas são removidas automaticamente após 60 dias. As não lidas nunca são apagadas.
      </p>
    </PageShell>
  );
}
