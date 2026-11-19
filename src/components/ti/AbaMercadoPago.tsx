import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { fmtDataHora } from "@/lib/data";
import { RelatoriosMercadoPago } from "./RelatoriosMercadoPago";
import { formatError } from "@/lib/format-error";

const SLUG = "acao.credenciais_integracao.gravar";
type ContaMP = { codigo: string; rotulo: string; login_email: string | null; segredo_cofre: string; ordem: number };

type Linha = { nome: string; descricao: string | null; atualizado_em: string; atualizado_por: string | null };
type Teste = { ok: boolean; status: number | null; mensagem: string; corpo?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function AbaMercadoPago() {
  const { permitido, carregando } = usePermissaoAcaoOuSuperAdmin(SLUG);
  const contas = useQuery({
    queryKey: ["mp-contas-integracao"],
    enabled: permitido,
    queryFn: async (): Promise<ContaMP[]> => {
      const { data, error } = await sb.from("mp_conta_dim").select("codigo,rotulo,login_email,segredo_cofre,ordem").order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
  const estado = useQuery({
    queryKey: ["credenciais-integracao", "mp-contas"],
    enabled: permitido,
    queryFn: async (): Promise<Linha[]> => {
      const { data, error } = await sb.rpc("fn_vault_listar_segredos");
      if (error) throw error;
      return data ?? [];
    },
  });
  if (carregando) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  return <div className="space-y-4">
    {!permitido ? <p className="text-sm text-muted-foreground">Sem permissão para credenciais (acao.credenciais_integracao.gravar).</p>
      : contas.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
      : contas.isError ? <p className="text-sm text-destructive">{formatError(contas.error)}</p>
      : (contas.data ?? []).map((conta) => <CredencialContaMP key={conta.codigo} conta={conta} estado={estado.data?.find((l) => l.nome === conta.segredo_cofre) ?? null} lendo={estado.isLoading} erro={estado.error} />)}
    <RelatoriosMercadoPago />
  </div>;
}

function CredencialContaMP({ conta, estado, lendo, erro }: { conta: ContaMP; estado: Linha | null; lendo: boolean; erro: unknown }) {
  const qc = useQueryClient();
  const [valor, setValor] = useState("");
  const [teste, setTeste] = useState<Teste | null>(null);

  const gravar = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("fn_vault_gravar_segredo", { p_nome: conta.segredo_cofre, p_valor: valor, p_descricao: `${conta.rotulo} — Access Token produção — relatórios de liberações/vendas` });
      if (error) throw error;
      return data as { em: string };
    },
    onSuccess: async (r) => {
      setValor("");
      toast.success(`Credencial gravada em ${fmtDataHora(r.em)}`);
      await qc.invalidateQueries({ queryKey: ["credenciais-integracao"] });
    },
    onError: (e: Error) => { setValor(""); toast.error(formatError(e)); },
  });

  const testar = useMutation({
    mutationFn: async (): Promise<Teste> => {
      const { data, error } = await supabase.functions.invoke("mp-teste-conexao", { body: { conta: conta.codigo } });
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (error as any).context;
        const j = ctx?.json ? await ctx.json().catch(() => null) : null;
        if (j) return j as Teste;
        throw error;
      }
      return data as Teste;
    },
    onSuccess: (r) => setTeste(r),
    onError: (e: Error) => setTeste({ ok: false, status: null, mensagem: e.message }),
  });

  return (
    <div className="space-y-4">
    <Card className="min-w-0 max-w-[calc(100vw-2rem)] sm:max-w-none">
      <CardHeader>
        <CardTitle>{conta.rotulo}</CardTitle>
        <p className="break-all text-sm text-muted-foreground">{conta.login_email ?? "—"}</p>
        <p className="break-all font-mono text-xs text-muted-foreground">{conta.segredo_cofre}</p>
        <CardDescription>Crie a aplicação em Mercado Pago Developers &gt; Suas integrações e cole o Access Token de produção.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          {lendo ? "Lendo…" : erro ? <span className="text-destructive">{formatError(erro)}</span>
            : estado ? <>Gravado em {fmtDataHora(estado.atualizado_em)} por {estado.atualizado_por ?? "—"}</>
            : <span className="text-muted-foreground">Nenhum Access Token gravado.</span>}
        </p>
        <form className="flex flex-wrap items-end gap-2" autoComplete="off"
          onSubmit={async (e) => { e.preventDefault(); if (valor.trim()) { try { await gravar.mutateAsync(); } catch { /* toast da mutation */ } } }}>
          <div className="w-full space-y-1 sm:w-96">
            <Label htmlFor={`mp-token-${conta.codigo}`}>Access Token</Label>
            <Input id={`mp-token-${conta.codigo}`} type="password" autoComplete="new-password" className="w-full" value={valor}
              onChange={(e) => setValor(e.target.value)} />
          </div>
          <Button type="submit" disabled={!valor.trim() || gravar.isPending}>
            {gravar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gravar
          </Button>
          <Button type="button" variant="outline" disabled={testar.isPending} onClick={() => testar.mutate()}>
            {testar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Testar conexão
          </Button>
        </form>
        {teste && (
          <div className={`rounded-md border p-3 text-sm ${teste.ok ? "border-success/30 text-success" : "border-destructive/30 text-destructive"}`}>
            <div>{teste.status != null ? `HTTP ${teste.status} · ` : ""}{teste.mensagem}</div>
            {teste.corpo && <pre className="mt-2 whitespace-pre-wrap break-all text-xs text-muted-foreground">{teste.corpo}</pre>}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
