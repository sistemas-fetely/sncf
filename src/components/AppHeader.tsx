import { Moon, Sun, Home } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTrackPageVisit } from "@/hooks/useTrackPageVisit";
import { RecentesEFavoritos } from "@/components/navegacao/RecentesEFavoritos";
import { ReportarErroBotao } from "@/components/shared/ReportarErroBotao";
import { SinoNotificacoes } from "@/components/shared/SinoNotificacoes";


const routeNames: Record<string, string> = {
  "/": "Dashboard",
  "/colaboradores": "Colaboradores",
  "/organograma": "Organograma",
  "/folha-pagamento": "Folha de Pagamento",
  "/ferias": "Férias",
  "/ponto": "Controle de Ponto",
  "/beneficios": "Benefícios",
  "/contratos-pj": "Contratos PJ",
  "/notas-fiscais": "Notas Fiscais",
  "/recrutamento": "Recrutamento",
  "/avaliacoes": "Avaliações",
  "/treinamentos": "Treinamentos",
  "/relatorios": "Relatórios",
  "/configuracoes": "Configurações",
  "/autoatendimento": "Autoatendimento",
};


        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl hover:bg-accent">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <Badge className="absolute -right-0.5 -top-0.5 h-4 min-w-4 rounded-full p-0 text-[10px] flex items-center justify-center bg-primary text-primary-foreground border-0">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h4 className="text-sm font-semibold">Notificações</h4>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllRead}>
                  Marcar todas como lidas
                </Button>
              )}
            </div>
            <ScrollArea className="max-h-[360px]">
              {notificacoes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma notificação</p>
              ) : (
                notificacoes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markAsRead(n)}
                    className={`w-full text-left px-4 py-3 border-b last:border-0 hover:bg-muted/50 transition-colors ${!n.lida ? "bg-primary/5" : ""}`}
                  >
                    <p className={`text-sm ${!n.lida ? "font-semibold" : ""}`}>{n.titulo}</p>
                    {n.mensagem && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.mensagem}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { locale: ptBR, addSuffix: true })}
                    </p>
                  </button>
                ))
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
