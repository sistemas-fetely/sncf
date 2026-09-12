import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PageTitle } from "@/components/layout/PageTitle";
import { PageShell } from "@/components/layout/PageShell";
import {
  PermissaoTelaProvider, usePermissaoTelaContext, AvisoSomenteLeitura,
} from "@/contexts/PermissaoTelaContext";
import { InboxFilas } from "@/components/tarefas/InboxFilas";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Ticket, AlertTriangle, UserX, Clock, PlusCircle } from "lucide-react";

interface CargaCadeira {
  cadeira: string | null;
  cadeira_id: string | null;
  abertos: number | null;
  sem_dono: number | null;
  em_andamento: number | null;
  pendentes: number | null;
  vencidos: number | null;
  em_triagem: number | null;
  mais_antigo: string | null;
}

interface ChamadoLista {
  chamado_id: string;
  atribuido_a: string | null;
  vencido: boolean | null;
  sem_dono: boolean | null;
  status: string | null;
}

const QK_CHAMADOS = {
  carga: ["vw_chamado_carga_cadeira", "dash"] as const,
  lista: ["vw_chamado_lista", "dash"] as const,
};

const STATUS_ABERTOS = ["novo", "atribuido", "em_andamento", "pendente"];

function useChamadoCargaDash() {
  return useQuery({
    queryKey: QK_CHAMADOS.carga,
    queryFn: async (): Promise<CargaCadeira[]> => {
      const { data, error } = await supabase.from("vw_chamado_carga_cadeira").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as CargaCadeira[];
    },
  });
}

function useChamadoListaDash() {
  return useQuery({
    queryKey: QK_CHAMADOS.lista,
    queryFn: async (): Promise<ChamadoLista[]> => {
      const { data, error } = await supabase
        .from("vw_chamado_lista")
        .select("chamado_id,atribuido_a,vencido,sem_dono,status")
        .in("status", STATUS_ABERTOS);
      if (error) throw error;
      return (data ?? []) as unknown as ChamadoLista[];
    },
  });
}

interface ContadorProps {
  valor: number;
  rotulo: string;
  icon: React.ElementType;
  alerta?: boolean;
  destaque?: boolean;
  onClick?: () => void;
}

function ContadorChamado({ valor, rotulo, icon: Icon, alerta, destaque, onClick }: ContadorProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "relative flex flex-col justify-between gap-2 rounded-lg border p-4 cursor-pointer transition-colors hover:bg-muted/50",
        alerta && valor > 0 && "border-destructive bg-destructive/5",
        destaque && valor > 0 && "border-warning bg-warning/5",
        !alerta && !destaque && "border-border bg-card"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "text-2xl font-medium tabular-nums leading-none",
            alerta && valor > 0 && "text-destructive",
            destaque && valor > 0 && "text-warning",
            !alerta && !destaque && "text-foreground"
          )}
        >
          {valor}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
      <p className="text-sm font-medium leading-tight">{rotulo}</p>
    </div>
  );
}

/** Bloco de Chamados no Dash — mostra filas de atendimento em tempo real. */
function BlocoChamados() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const carga = useChamadoCargaDash();
  const lista = useChamadoListaDash();

  const isLoading = carga.isLoading || lista.isLoading;
  const isError = carga.isError || lista.isError;
  const error = carga.error || lista.error;

  const porCadeira = (carga.data ?? []).filter((c) => (c.abertos ?? 0) > 0);
  const totalAbertos = (carga.data ?? []).reduce((acc, c) => acc + (c.abertos ?? 0), 0);
  const totalSemDono = (carga.data ?? []).reduce((acc, c) => acc + (c.sem_dono ?? 0), 0);
  const totalVencidos = (carga.data ?? []).reduce((acc, c) => acc + (c.vencidos ?? 0), 0);
  const meus = (lista.data ?? []).filter((c) => c.atribuido_a === user?.id).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Ticket className="h-4 w-4 text-muted-foreground" />
              Chamados
              {!isLoading && !isError && (
                <Badge variant="secondary" className="text-[11px]">
                  {totalAbertos} aberto{totalAbertos !== 1 ? "s" : ""}
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Filas de atendimento em tempo real
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => navigate("/chamados/novo")}
          >
            <PlusCircle className="h-4 w-4 mr-1.5" />
            Abrir chamado
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        )}

        {isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Não foi possível carregar os chamados</AlertTitle>
            <AlertDescription className="text-xs break-words">
              {formatError(error)}
            </AlertDescription>
          </Alert>
        )}

        {!isLoading && !isError && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ContadorChamado
                valor={meus}
                rotulo="Meus"
                icon={Clock}
                onClick={() => navigate("/chamados")}
              />
              <ContadorChamado
                valor={totalSemDono}
                rotulo="Sem dono"
                icon={UserX}
                destaque
                onClick={() => navigate("/chamados")}
              />
              <ContadorChamado
                valor={totalVencidos}
                rotulo="Vencidos"
                icon={AlertTriangle}
                alerta
                onClick={() => navigate("/chamados")}
              />
              <ContadorChamado
                valor={totalAbertos}
                rotulo="Abertos"
                icon={Ticket}
                onClick={() => navigate("/chamados")}
              />
            </div>

            {porCadeira.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Por cadeira</h3>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap text-xs">Cadeira</TableHead>
                        <TableHead className="whitespace-nowrap text-xs text-right">Abertos</TableHead>
                        <TableHead className="whitespace-nowrap text-xs text-right">Sem dono</TableHead>
                        <TableHead className="whitespace-nowrap text-xs text-right">Vencidos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {porCadeira.map((c) => (
                        <TableRow
                          key={c.cadeira_id ?? c.cadeira}
                          className="cursor-pointer"
                          onClick={() => navigate("/chamados")}
                        >
                          <TableCell className="text-xs font-medium whitespace-nowrap">
                            {c.cadeira ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums">
                            {c.abertos ?? 0}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums">
                            {c.sem_dono ?? 0}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums">
                            {c.vencidos ?? 0}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum chamado aberto</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function TarefasDash() {
  return (
    <PermissaoTelaProvider slug="tela.tarefas">
      <TarefasDashConteudo />
    </PermissaoTelaProvider>
  );
}

function TarefasDashConteudo() {
  const { podeEditar } = usePermissaoTelaContext();

  return (
    <PageShell>
      <PageTitle
        titulo="Dash"
        estado="Filas da operação em tempo real"
      />

      {!podeEditar && <AvisoSomenteLeitura />}

      <div className="space-y-6">
        <InboxFilas />
        <BlocoChamados />
      </div>
    </PageShell>
  );
}
