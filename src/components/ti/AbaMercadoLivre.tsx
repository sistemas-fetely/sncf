import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { fmtDataHora } from "@/lib/data";
import { formatError } from "@/lib/format-error";

const SLUG = "acao.credenciais_integracao.gravar";
const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const URL_REDIRECT = `${BASE}/meli-oauth`;
const URL_NOTIFICACOES = `${BASE}/meli-webhook`;

type ContaML = {
  codigo: string; rotulo: string; login_email: string | null;
  segredo_client_id: string; segredo_client_secret: string;
  seller_id: number | null; nickname: string | null; conectado_em: string | null;
  token_expira_em: string | null; ultimo_refresh_em: string | null; ultimo_refresh_ok: boolean | null; ultimo_erro: string | null;
};
type Linha = { nome: string; atualizado_em: string; atualizado_por: string | null };
type Teste = { ok: boolean; status: number | null; mensagem: string; nickname?: string | null; seller_id?: number | null; total_pedidos?: number | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

async function erroDaEdge(error: unknown): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (error as any)?.context;
  const j = ctx?.json ? await ctx.json().catch(() => null) : null;
  return j?.erro ? (typeof j.erro === "string" ? j.erro : JSON.stringify(j.erro)) : j?.mensagem ?? formatError(error);
}

export function AbaMercadoLivre() {
  const { permitido, carregando } = usePermissaoAcaoOuSuperAdmin(SLUG);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const r = params.get("meli");
    if (!r) return;
    if (r === "ok") toast.success("Mercado Livre conectado.");
    else toast.error(`Não foi possível conectar ao Mercado Livre: ${params.get("motivo") ?? "motivo não informado"}`);
    const p = new URLSearchParams(params); p.delete("meli"); p.delete("motivo");
    setParams(p, { replace: true });
  }, [params, setParams]);

  const contas = useQuery({
    queryKey: ["meli-contas-integracao"], enabled: permitido,
    queryFn: async (): Promise<ContaML[]> => {
      const { data, error } = await sb.from("meli_conta")
        .select("codigo,rotulo,login_email,segredo_client_id,segredo_client_secret,seller_id,nickname,conectado_em,token_expira_em,ultimo_refresh_em,ultimo_refresh_ok,ultimo_erro")
        .eq("ativo", true).order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
  const estado = useQuery({
    queryKey: ["credenciais-integracao", "meli"], enabled: permitido,
    queryFn: async (): Promise<Linha[]> => {
      const { data, error } = await sb.rpc("fn_vault_listar_segredos");
      if (error) throw error;
      return data ?? [];
    },
  });
  if (carregando) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!permitido) return <p className="text-sm text-muted-foreground">Sem permissão para credenciais (acao.credenciais_integracao.gravar).</p>;
  if (contas.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (contas.isError) return <p className="text-sm text-destructive">{formatError(contas.error)}</p>;
  return <div className="space-y-4">
    {(contas.data ?? []).map((c) => <ContaMercadoLivre key={c.codigo} conta={c} segredos={estado.data ?? []} lendo={estado.isLoading} erro={estado.error} />)}
  </div>;
}

function CampoUrl({ rotulo, url }: { rotulo: string; url: string }) {
  return <div className="space-y-1">
    <Label>{rotulo}</Label>
    <div className="flex gap-2">
      <Input readOnly value={url} className="font-mono text-xs" />
      <Button type="button" variant="outline" size="icon" aria-label={`Copiar ${rotulo}`}
        onClick={async () => { try { await navigator.clipboard.writeText(url); toast.success("Copiado"); } catch (e) { toast.error(formatError(e)); } }}>
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  </div>;
}

function CampoSegredo({ id, rotulo, nome, descricao, linha, lendo, erro }: { id: string; rotulo: string; nome: string; descricao: string; linha: Linha | null; lendo: boolean; erro: unknown }) {
  const qc = useQueryClient();
  const [valor, setValor] = useState("");
  const gravar = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("fn_vault_gravar_segredo", { p_nome: nome, p_valor: valor, p_descricao: descricao });
      if (error) throw error;
      return data as { em: string };
    },
    onSuccess: async (r) => { setValor(""); toast.success(`${rotulo} gravado em ${fmtDataHora(r.em)}`); await qc.invalidateQueries({ queryKey: ["credenciais-integracao"] }); },
    onError: (e: Error) => { setValor(""); toast.error(formatError(e)); },
  });
  return <form className="flex flex-wrap items-end gap-2" autoComplete="off"
    onSubmit={async (e) => { e.preventDefault(); if (valor.trim()) { try { await gravar.mutateAsync(); } catch { /* toast da mutation */ } } }}>
    <div className="w-full space-y-1 sm:w-96">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} type="password" autoComplete="new-password" value={valor} onChange={(e) => setValor(e.target.value)} />
      <p className="text-xs text-muted-foreground">
        {lendo ? "Lendo…" : erro ? <span className="text-destructive">{formatError(erro)}</span>
          : linha ? <>Gravado em {fmtDataHora(linha.atualizado_em)} por {linha.atualizado_por ?? "—"}</> : "Não gravado."}
      </p>
    </div>
    <Button type="submit" disabled={!valor.trim() || gravar.isPending}>
      {gravar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gravar
    </Button>
  </form>;
}

function ContaMercadoLivre({ conta, segredos, lendo, erro }: { conta: ContaML; segredos: Linha[]; lendo: boolean; erro: unknown }) {
  const [teste, setTeste] = useState<Teste | null>(null);
  const linhaId = segredos.find((l) => l.nome === conta.segredo_client_id) ?? null;
  const linhaSecret = segredos.find((l) => l.nome === conta.segredo_client_secret) ?? null;
  const prontoParaConectar = !!linhaId && !!linhaSecret;

  const conectar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("meli-oauth", { body: { acao: "iniciar", conta: conta.codigo } });
      if (error) throw new Error(await erroDaEdge(error));
      if (!data?.url) throw new Error("A conexão não devolveu o endereço de autorização.");
      return data.url as string;
    },
    onSuccess: (url) => { window.location.href = url; },
    onError: (e: Error) => toast.error(e.message),
  });
  const testar = useMutation({
    mutationFn: async (): Promise<Teste> => {
      const { data, error } = await supabase.functions.invoke("meli-teste-conexao", { body: { conta: conta.codigo } });
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
    onError: (e: Error) => setTeste({ ok: false, status: null, mensagem: formatError(e) }),
  });

  return <Card className="min-w-0 max-w-[calc(100vw-2rem)] sm:max-w-none">
    <CardHeader>
      <CardTitle>{conta.rotulo}</CardTitle>
      <p className="break-all text-sm text-muted-foreground">{conta.login_email ?? "—"}</p>
      <CardDescription>Crie a aplicação em Mercado Livre Developers e conecte com o login da loja.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Passo 1 · Aplicação</h3>
        <CampoSegredo id={`meli-id-${conta.codigo}`} rotulo="App ID" nome={conta.segredo_client_id} descricao={`${conta.rotulo} — App ID (client_id)`} linha={linhaId} lendo={lendo} erro={erro} />
        <CampoSegredo id={`meli-secret-${conta.codigo}`} rotulo="Secret Key" nome={conta.segredo_client_secret} descricao={`${conta.rotulo} — Secret Key (client_secret)`} linha={linhaSecret} lendo={lendo} erro={erro} />
        <p className="text-sm text-muted-foreground">Cadastre estas duas URLs na aplicação do Mercado Livre.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoUrl rotulo="URL de redirecionamento" url={URL_REDIRECT} />
          <CampoUrl rotulo="URL de notificações" url={URL_NOTIFICACOES} />
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Passo 2 · Conectar</h3>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!prontoParaConectar || conectar.isPending} onClick={() => conectar.mutate()}>
            {conectar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Conectar ao Mercado Livre
          </Button>
          <Button variant="outline" disabled={!conta.seller_id || testar.isPending} onClick={() => testar.mutate()}>
            {testar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Testar conexão
          </Button>
        </div>
        {!prontoParaConectar && <p className="text-xs text-muted-foreground">Grave o App ID e a Secret Key para conectar.</p>}
        <div className="space-y-1 text-sm">
          {conta.seller_id ? <>
            <p>Conectado como <strong>{conta.nickname ?? "—"}</strong> (vendedor {conta.seller_id}){conta.conectado_em ? <> desde {fmtDataHora(conta.conectado_em)}</> : null}</p>
            {conta.token_expira_em && <p>Token válido até {fmtDataHora(conta.token_expira_em)}</p>}
          </> : <p className="text-muted-foreground">Ainda não conectado.</p>}
          {conta.ultimo_refresh_em && <p className={conta.ultimo_refresh_ok === false ? "text-destructive" : ""}>
            Última renovação {fmtDataHora(conta.ultimo_refresh_em)} · {conta.ultimo_refresh_ok === false ? `erro: ${conta.ultimo_erro ?? "—"}` : "ok"}
          </p>}
        </div>
        {teste && <div className={`rounded-md border p-3 text-sm ${teste.ok ? "border-success/30 text-success" : "border-destructive/30 text-destructive"}`}>
          <div>{teste.status != null ? `HTTP ${teste.status} · ` : ""}{teste.mensagem}</div>
          {teste.ok && <div className="mt-1 text-xs text-muted-foreground">{teste.nickname ?? "—"} · vendedor {teste.seller_id ?? "—"} · {teste.total_pedidos ?? 0} pedido(s) na conta</div>}
        </div>}
      </section>
    </CardContent>
  </Card>;
}
