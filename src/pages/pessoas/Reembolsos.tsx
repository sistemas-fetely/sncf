import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MoreHorizontal, Plus, Paperclip, AlertTriangle, Receipt } from "lucide-react";
import { NovoReembolsoDialog } from "@/components/pessoas/NovoReembolsoDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Status = "rascunho" | "pendente" | "aprovado" | "rejeitado";

interface Reembolso {
  id: string;
  vinculo_id: string;
  categoria_id: string;
  valor: number;
  competencia: string;
  descricao: string | null;
  comprovante_url: string | null;
  sem_comprovante: boolean;
  status: Status;
  motivo_rejeicao: string | null;
  vinculos: { pessoa_id: string; gestor_pessoa_id: string | null; pessoas: { nome_completo: string } | null } | null;
  reembolso_categorias: { nome: string } | null;
}

const statusVariant: Record<Status, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  pendente: { label: "Pendente", className: "bg-warning/15 text-warning border-warning/30" },
  aprovado: { label: "Aprovado", className: "bg-success/15 text-success border-success/30" },
  rejeitado: { label: "Rejeitado", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

export default function Reembolsos() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const [filtroStatus, setFiltroStatus] = useState<string>("ativos");
  const [novoOpen, setNovoOpen] = useState(false);
  const [editar, setEditar] = useState<Reembolso | null>(null);
  const [rejeitarAlvo, setRejeitarAlvo] = useState<Reembolso | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");

  const isSuperAdmin = hasRole("super_admin");

  // Descobrir a pessoa_id do usuário logado para saber se ele é gestor de algum vínculo
  const { data: minhaPessoaId } = useQuery({
    queryKey: ["minha-pessoa-id", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("pessoas")
        .select("id")
        .eq("usuario_id", user!.id)
        .maybeSingle();
      return data?.id ?? null;
    },
  });

  const { data: reembolsos = [], isLoading } = useQuery<Reembolso[]>({
    queryKey: ["reembolsos-lista"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reembolsos_colaborador")
        .select(`
          id, vinculo_id, categoria_id, valor, competencia, descricao,
          comprovante_url, sem_comprovante, status, motivo_rejeicao,
          vinculos:vinculo_id ( pessoa_id, gestor_pessoa_id, pessoas:pessoa_id ( nome_completo ) ),
          reembolso_categorias:categoria_id ( nome )
        `)
        .order("competencia", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  const filtrados = useMemo(() => {
    if (filtroStatus === "ativos") return reembolsos.filter((r) => r.status !== "rascunho");
    if (filtroStatus === "todos") return reembolsos;
    return reembolsos.filter((r) => r.status === filtroStatus);
  }, [reembolsos, filtroStatus]);

  function podeAprovar(r: Reembolso) {
    if (r.status !== "pendente") return false;
    if (isSuperAdmin) return true;
    return !!minhaPessoaId && r.vinculos?.gestor_pessoa_id === minhaPessoaId;
  }

  async function aprovar(r: Reembolso) {
    try {
      const { error } = await supabase.rpc("aprovar_reembolso", { p_reembolso_id: r.id });
      if (error) throw error;
      toast.success("Reembolso aprovado · Despesa criada no Financeiro");
      qc.invalidateQueries({ queryKey: ["reembolsos-lista"] });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao aprovar reembolso");
    }
  }

  async function confirmarRejeicao() {
    if (!rejeitarAlvo) return;
    const motivo = motivoRejeicao.trim();
    if (!motivo) {
      toast.error("Informe o motivo da rejeição");
      return;
    }
    const { error } = await supabase
      .from("reembolsos_colaborador")
      .update({ status: "rejeitado", motivo_rejeicao: motivo })
      .eq("id", rejeitarAlvo.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Reembolso rejeitado");
    setRejeitarAlvo(null);
    setMotivoRejeicao("");
    qc.invalidateQueries({ queryKey: ["reembolsos-lista"] });
  }

  async function verComprovante(r: Reembolso) {
    if (!r.comprovante_url) return;
    // comprovante_url pode ser o path no bucket ou uma URL completa
    const path = r.comprovante_url.startsWith("http")
      ? null
      : r.comprovante_url;
    if (!path) {
      window.open(r.comprovante_url, "_blank");
      return;
    }
    const { data, error } = await supabase.storage
      .from("comprovantes-reembolso")
      .createSignedUrl(path, 60 * 10);
    if (error || !data) {
      toast.error("Falha ao gerar link do comprovante");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            Reembolsos
          </h1>
          <p className="text-sm text-muted-foreground">
            Ressarcimentos de despesas de colaboradores. Quando aprovado, vira despesa no Financeiro.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativos">Ativos (sem rascunhos)</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="aprovado">Aprovados</SelectItem>
              <SelectItem value="rejeitado">Rejeitados</SelectItem>
              <SelectItem value="rascunho">Rascunhos</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setNovoOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo reembolso
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pessoa</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Comprovante</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            )}
            {!isLoading && filtrados.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum reembolso encontrado</TableCell></TableRow>
            )}
            {filtrados.map((r) => {
              const s = statusVariant[r.status];
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.vinculos?.pessoas?.nome_completo ?? "—"}
                  </TableCell>
                  <TableCell>{r.reembolso_categorias?.nome ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </TableCell>
                  <TableCell>
                    {r.competencia ? format(new Date(r.competencia + "T00:00:00"), "MMM/yyyy", { locale: ptBR }) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={s.className}>{s.label}</Badge>
                  </TableCell>
                  <TableCell>
                    {r.sem_comprovante ? (
                      <span className="inline-flex items-center gap-1 text-xs text-warning">
                        <AlertTriangle className="h-3.5 w-3.5" /> sem comprovante
                      </span>
                    ) : r.comprovante_url ? (
                      <button
                        onClick={() => verComprovante(r)}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Paperclip className="h-3.5 w-3.5" /> ver
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {r.status === "pendente" && (
                          <>
                            <DropdownMenuItem
                              disabled={!podeAprovar(r)}
                              onClick={() => aprovar(r)}
                            >
                              Aprovar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setRejeitarAlvo(r); setMotivoRejeicao(""); }}>
                              Rejeitar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditar(r)}>
                              Editar
                            </DropdownMenuItem>
                          </>
                        )}
                        {r.comprovante_url && (
                          <DropdownMenuItem onClick={() => verComprovante(r)}>
                            Ver comprovante
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <NovoReembolsoDialog
        open={novoOpen || !!editar}
        onOpenChange={(v) => { if (!v) { setNovoOpen(false); setEditar(null); } }}
        editar={editar}
        onSaved={() => {
          setNovoOpen(false);
          setEditar(null);
          qc.invalidateQueries({ queryKey: ["reembolsos-lista"] });
        }}
      />

      <AlertDialog open={!!rejeitarAlvo} onOpenChange={(v) => !v && setRejeitarAlvo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar reembolso</AlertDialogTitle>
            <AlertDialogDescription>
              Informe o motivo da rejeição. Ele ficará registrado no histórico do reembolso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={motivoRejeicao}
            onChange={(e) => setMotivoRejeicao(e.target.value)}
            placeholder="Motivo da rejeição..."
            rows={4}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarRejeicao}>Rejeitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
