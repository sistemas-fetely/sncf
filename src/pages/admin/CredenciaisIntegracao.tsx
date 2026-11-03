import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";

const SLUG = "acao.credenciais_integracao.gravar";
const SUGESTAO_NOME = "mp_access_token";
const SUGESTAO_DESC = "Mercado Pago — Access Token produção (app SNCF-Relatorios) — relatórios de liberações/vendas";

type Linha = { nome: string; descricao: string | null; atualizado_em: string; atualizado_por: string | null };

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString("pt-BR") : "—");

export default function CredenciaisIntegracao() {
  const qc = useQueryClient();
  const { permitido, carregando } = usePermissaoAcaoOuSuperAdmin(SLUG);
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(SUGESTAO_NOME);
  const [descricao, setDescricao] = useState(SUGESTAO_DESC);
  const [valor, setValor] = useState("");

  const lista = useQuery({
    queryKey: ["credenciais-integracao"],
    enabled: permitido,
    queryFn: async (): Promise<Linha[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_vault_listar_segredos");
      if (error) throw error;
      return data ?? [];
    },
  });

  const fechar = () => {
    setAberto(false);
    setValor("");
    setNome(SUGESTAO_NOME);
    setDescricao(SUGESTAO_DESC);
  };

  const gravar = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_vault_gravar_segredo", {
        p_nome: nome.trim(), p_valor: valor, p_descricao: descricao.trim() || null,
      });
      if (error) throw error;
      return data as { nome: string; acao: string; em: string };
    },
    onSuccess: async (r) => {
      toast.success(`Credencial ${r.nome} ${r.acao === "criado" ? "gravada" : "atualizada"} em ${fmt(r.em)}`);
      fechar();
      await qc.invalidateQueries({ queryKey: ["credenciais-integracao"] });
    },
    onError: (e: Error) => {
      setValor("");
      toast.error(e.message);
    },
  });

  if (carregando) return <PageShell variant="dados"><p className="text-sm text-muted-foreground">Carregando…</p></PageShell>;
  if (!permitido) {
    return (
      <PageShell variant="dados">
        <PageHeader titulo="Credenciais de integração" estado="Sem permissão para ver ou gravar credenciais." />
      </PageShell>
    );
  }

  return (
    <PageShell variant="dados">
      <PageHeader
        titulo="Credenciais de integração"
        estado="Chaves de sistemas externos guardadas no cofre. O valor nunca é mostrado depois de gravado; gravar com um nome existente substitui o valor."
      />
      <div className="mb-4">
        <Button onClick={() => setAberto(true)}><KeyRound className="mr-2 h-4 w-4" />Gravar credencial</Button>
      </div>

      {lista.error ? (
        <p className="text-sm text-destructive">{(lista.error as Error).message}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Nome</TableHead><TableHead>Descrição</TableHead><TableHead>Atualizado em</TableHead><TableHead>Por</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {(lista.data ?? []).map((l) => (
              <TableRow key={l.nome}>
                <TableCell className="font-mono text-xs">{l.nome}</TableCell>
                <TableCell className="text-sm">{l.descricao || "—"}</TableCell>
                <TableCell className="text-sm">{fmt(l.atualizado_em)}</TableCell>
                <TableCell className="text-sm">{l.atualizado_por || "—"}</TableCell>
              </TableRow>
            ))}
            {lista.isLoading && <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">Carregando…</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}

      <Dialog open={aberto} onOpenChange={(o) => (o ? setAberto(true) : fechar())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gravar credencial</DialogTitle>
            <DialogDescription>Se o nome já existir, o valor guardado é substituído.</DialogDescription>
          </DialogHeader>
          <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); gravar.mutate(); }} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cred-nome">Nome</Label>
              <Input id="cred-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" className="font-mono" />
              <p className="text-xs text-muted-foreground">Só minúsculas, números e _.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cred-desc">Descrição</Label>
              <Textarea id="cred-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cred-valor">Valor</Label>
              <Input id="cred-valor" type="password" value={valor} onChange={(e) => setValor(e.target.value)}
                autoComplete="new-password" spellCheck={false} data-1p-ignore data-lpignore="true" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={fechar}>Cancelar</Button>
              <Button type="submit" disabled={gravar.isPending || !valor || !nome}>{gravar.isPending ? "Gravando…" : "Gravar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
