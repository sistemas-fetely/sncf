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

const SLUG = "acao.credenciais_integracao.gravar";
const NOME = "mp_access_token";
const DESC = "Mercado Pago — Access Token produção (app SNCF-Relatorios) — relatórios de liberações/vendas";

type Linha = { nome: string; descricao: string | null; atualizado_em: string; atualizado_por: string | null };
type Teste = { ok: boolean; status: number | null; mensagem: string; corpo?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function AbaMercadoPago() {
  const qc = useQueryClient();
  const { permitido, carregando } = usePermissaoAcaoOuSuperAdmin(SLUG);
  const [valor, setValor] = useState("");
  const [teste, setTeste] = useState<Teste | null>(null);

  const estado = useQuery({
    queryKey: ["credenciais-integracao", NOME],
    enabled: permitido,
    queryFn: async (): Promise<Linha | null> => {
      const { data, error } = await sb.rpc("fn_vault_listar_segredos");
      if (error) throw error;
      return ((data ?? []) as Linha[]).find((l) => l.nome === NOME) ?? null;
    },
  });

  const gravar = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("fn_vault_gravar_segredo", { p_nome: NOME, p_valor: valor, p_descricao: DESC });
      if (error) throw error;
      return data as { em: string };
    },
    onSuccess: async (r) => {
      setValor("");
      toast.success(`Credencial gravada em ${fmtDataHora(r.em)}`);
      await qc.invalidateQueries({ queryKey: ["credenciais-integracao"] });
    },
    onError: (e: Error) => { setValor(""); toast.error(e.message); },
  });

  const testar = useMutation({
    mutationFn: async (): Promise<Teste> => {
      const { data, error } = await supabase.functions.invoke("mp-teste-conexao", { body: {} });
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

  if (carregando) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!permitido) return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Sem permissão para credenciais (acao.credenciais_integracao.gravar).</p>
      <RelatoriosMercadoPago />
    </div>
  );

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle>Credenciais Mercado Pago</CardTitle>
        <CardDescription>Crie a aplicação em Mercado Pago Developers &gt; Suas integrações e cole o Access Token de produção.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          {estado.isLoading ? "Lendo…" : estado.isError ? <span className="text-destructive">{(estado.error as Error).message}</span>
            : estado.data ? <>Gravado em {fmtDataHora(estado.data.atualizado_em)} por {estado.data.atualizado_por ?? "—"}</>
            : <span className="text-muted-foreground">Nenhum Access Token gravado.</span>}
        </p>
        <form className="flex flex-wrap items-end gap-2" autoComplete="off"
          onSubmit={(e) => { e.preventDefault(); if (valor.trim()) gravar.mutate(); }}>
          <div className="space-y-1">
            <Label htmlFor="mp-token">Access Token</Label>
            <Input id="mp-token" type="password" autoComplete="new-password" className="w-96" value={valor}
              onChange={(e) => setValor(e.target.value)} />
          </div>
          <Button type="submit" disabled={!valor.trim() || gravar.isPending}>
            {gravar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar credencial
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
    <RelatoriosMercadoPago />
    </div>
  );
}
