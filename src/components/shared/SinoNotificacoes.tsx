import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, X } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Sino único do SNCF — INBOX-ÚNICO-OU-DECORAÇÃO.
 *
 * Duas fontes, uma superfície:
 *   `notificacoes_rh`  — legado de People/RH, aceita broadcast (user_id nulo)
 *   `notificacoes`     — tabela do módulo Tarefas (e futuros), sempre com dono
 *
 * Aviso que só aparece dentro do módulo que o gerou não é aviso: é decoração.
 * Por isso este componente é montado no header global da Casa (todo o SNCF).
 *
 * LER-É-DISPENSAR (29/08/2026): o sino mostra SOMENTE não-lidas. Marcar como lida
 * é a forma de dispensar — a linha sai do sino e passa a viver no histórico, em
 * `/minhas-notificacoes`. Notificação lida é apagada depois de 60 dias pelo cron
 * `notificacoes-retencao-diaria`; não-lida nunca é apagada.
 */

type Fonte = "rh" | "geral";

interface ItemSino {
  id: string;
  fonte: Fonte;
  titulo: string;
  texto: string | null;
  destino: string | null;
  lida: boolean;
  data: string;
}

const CHAVE = ["notificacoes", "sino"];

function useItensSino(userId: string | undefined) {
  return useQuery({
    queryKey: [...CHAVE, userId ?? "anon"],
    enabled: !!userId,
    refetchInterval: 300_000,
    queryFn: async (): Promise<{ itens: ItemSino[]; total: number }> => {
      // A contagem NÃO pode sair da lista cortada — vem de count exact no banco.
      const [rh, geral, countRh, countGeral] = await Promise.all([
        supabase
          .from("notificacoes_rh")
          .select("id,titulo,mensagem,link,lida,created_at")
          .or(`user_id.eq.${userId},user_id.is.null`)
          .eq("lida", false)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("notificacoes")
          .select("id,titulo,corpo,url,lida,criado_por,criado_em")
          .eq("user_id", userId!)
          .eq("lida", false)
          .order("criado_em", { ascending: false })
          .limit(50),
        supabase
          .from("notificacoes_rh")
          .select("id", { count: "exact", head: true })
          .or(`user_id.eq.${userId},user_id.is.null`)
          .eq("lida", false),
        supabase
          .from("notificacoes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId!)
          .eq("lida", false),
      ]);
      if (rh.error) throw rh.error;
      if (geral.error) throw geral.error;
      if (countRh.error) throw countRh.error;
      if (countGeral.error) throw countGeral.error;

      const itens: ItemSino[] = [
        ...(rh.data ?? []).map((n) => ({
          id: n.id,
          fonte: "rh" as const,
          titulo: n.titulo,
          texto: n.mensagem,
          destino: n.link,
          lida: n.lida,
          data: n.created_at,
        })),
        // ninguém é notificado da própria ação
        ...(geral.data ?? [])
          .filter((n) => n.criado_por !== userId)
          .map((n) => ({
            id: n.id,
            fonte: "geral" as const,
            titulo: n.titulo,
            texto: n.corpo,
            destino: n.url,
            lida: n.lida,
            data: n.criado_em,
          })),
      ];

      return {
        itens: itens.sort((a, b) => (a.data < b.data ? 1 : -1)),
        total: (countRh.count ?? 0) + (countGeral.count ?? 0),
      };
    },
  });
}

function useMarcarLidas(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itens: ItemSino[]) => {
      const idsRh = itens.filter((i) => i.fonte === "rh" && !i.lida).map((i) => i.id);
      const idsGeral = itens.filter((i) => i.fonte === "geral" && !i.lida).map((i) => i.id);

      if (idsRh.length) {
        const { error } = await supabase.from("notificacoes_rh").update({ lida: true }).in("id", idsRh);
        if (error) throw error;
      }
      if (idsGeral.length) {
        const { error } = await supabase.rpc("notificacoes_marcar_lidas", { _ids: idsGeral });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...CHAVE, userId ?? "anon"] }),
    onError: (e: Error) => toast.error(`Não foi possível marcar como lida: ${e.message}`),
  });
}

// "Todas" é todas mesmo: a RPC com _ids null esvazia as não-lidas do usuário na
// tabela `notificacoes`, não só as 50 carregadas. Em `notificacoes_rh` (legado,
// sem RPC) o alcance segue por ids das linhas carregadas.
function useMarcarTodasLidas(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itensRh: ItemSino[]) => {
      const { error } = await supabase.rpc("notificacoes_marcar_lidas", { _ids: null });
      if (error) throw error;
      const idsRh = itensRh.filter((i) => i.fonte === "rh" && !i.lida).map((i) => i.id);
      if (idsRh.length) {
        const { error: errRh } = await supabase.from("notificacoes_rh").update({ lida: true }).in("id", idsRh);
        if (errRh) throw errRh;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...CHAVE, userId ?? "anon"] }),
    onError: (e: Error) => toast.error(`Não foi possível marcar todas como lidas: ${e.message}`),
  });
}

export function SinoNotificacoes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useItensSino(user?.id);
  const marcar = useMarcarLidas(user?.id);
  const marcarTodas = useMarcarTodasLidas(user?.id);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`sino:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notificacoes_rh" },
        () => {
          qc.invalidateQueries({ queryKey: [...CHAVE, user.id] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notificacoes",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: [...CHAVE, user.id] });
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error("Erro no realtime do sino:", err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const lista = useMemo(() => data?.itens ?? [], [data]);
  const total = data?.total ?? 0;

  const irParaHistorico = () => {
    setOpen(false);
    navigate("/minhas-notificacoes");
  };

  const abrir = (item: ItemSino) => {
    if (!item.lida) marcar.mutate([item]);
    // cada item leva à sua própria url, nunca a uma tela genérica
    if (item.destino) navigate(item.destino);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl hover:bg-accent">
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <Badge className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-0 bg-primary p-0 text-[10px] text-primary-foreground">
              {total > 9 ? "9+" : total}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-medium">Notificações</h4>
          {lista.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={marcarTodas.isPending}
              onClick={() => marcarTodas.mutate(lista)}
            >
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[360px]">
          {lista.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Tudo em dia</p>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={irParaHistorico}>
                Ver todas as notificações
              </Button>
            </div>
          ) : (
            lista.map((n) => (
              <div
                key={`${n.fonte}:${n.id}`}
                role="button"
                tabIndex={0}
                onClick={() => abrir(n)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    abrir(n);
                  }
                }}
                className={cn(
                  "group relative w-full cursor-pointer border-b px-4 py-3 pr-9 text-left transition-colors last:border-0 hover:bg-muted/50",
                  !n.lida && "bg-primary/5"
                )}
              >
                <button
                  type="button"
                  aria-label="Dispensar notificação"
                  className="absolute right-2 top-2 rounded p-1 opacity-100 transition-opacity hover:bg-muted sm:opacity-0 sm:group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    marcar.mutate([n]);
                  }}
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <p className={cn("text-sm", !n.lida && "font-medium")}>{n.titulo}</p>
                {n.texto && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.texto}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(n.data), { locale: ptBR, addSuffix: true })}
                </p>
              </div>
            ))
          )}
        </ScrollArea>
        <div className="border-t px-4 py-2">
          <Button variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={irParaHistorico}>
            Ver todas as notificações
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
