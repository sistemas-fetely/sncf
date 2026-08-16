import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
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
 * Por isso este componente é montado no AppHeader (todo o SNCF) e no
 * TarefasLayout, com a MESMA implementação.
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
    queryFn: async (): Promise<ItemSino[]> => {
      const [rh, geral] = await Promise.all([
        supabase
          .from("notificacoes_rh")
          .select("id,titulo,mensagem,link,lida,created_at")
          .or(`user_id.eq.${userId},user_id.is.null`)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("notificacoes")
          .select("id,titulo,corpo,url,lida,criado_por,criado_em")
          .eq("user_id", userId!)
          .order("criado_em", { ascending: false })
          .limit(30),
      ]);
      if (rh.error) throw rh.error;
      if (geral.error) throw geral.error;

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

      return itens.sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 40);
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

export function SinoNotificacoes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: itens } = useItensSino(user?.id);
  const marcar = useMarcarLidas(user?.id);

  const lista = useMemo(() => itens ?? [], [itens]);
  const naoLidas = lista.filter((i) => !i.lida);

  const abrir = (item: ItemSino) => {
    if (!item.lida) marcar.mutate([item]);
    // cada item leva à sua própria url, nunca a uma tela genérica
    if (item.destino) navigate(item.destino);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl hover:bg-accent">
          <Bell className="h-4 w-4" />
          {naoLidas.length > 0 && (
            <Badge className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-0 bg-primary p-0 text-[10px] text-primary-foreground">
              {naoLidas.length > 9 ? "9+" : naoLidas.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold">Notificações</h4>
          {naoLidas.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={marcar.isPending}
              onClick={() => marcar.mutate(naoLidas)}
            >
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[360px]">
          {lista.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma notificação</p>
          ) : (
            lista.map((n) => (
              <button
                key={`${n.fonte}:${n.id}`}
                onClick={() => abrir(n)}
                className={cn(
                  "w-full border-b px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/50",
                  !n.lida && "bg-primary/5"
                )}
              >
                <p className={cn("text-sm", !n.lida && "font-semibold")}>{n.titulo}</p>
                {n.texto && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.texto}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(n.data), { locale: ptBR, addSuffix: true })}
                </p>
              </button>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
