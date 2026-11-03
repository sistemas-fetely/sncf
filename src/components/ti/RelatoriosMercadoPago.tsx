import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Selo } from "@/components/ui/selo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { useEstadoTela } from "@/lib/navegacao";
import { fmtDataHora } from "@/lib/data";

/** MERCADO PAGO FASE 1 — status da importação automática (liberações e vendas por dia). */
const SLUG = "acao.mp_relatorio.reprocessar";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Exec = {
  id: string; tipo: string; dia: string; origem: string; status: string; file_name: string | null; erro: string | null;
  tentativas: number; linhas_lidas: number | null; linhas_novas: number | null; linhas_duplicadas: number | null;
  linhas_enriquecidas: number | null; linhas_ignoradas: number | null; importado_em: string | null; arquivo_storage_path: string | null;
};
type Dim = { codigo: string; rotulo: string; estado_selo?: string };

async function chamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("mp-relatorios", { body });
  if (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any).context;
    const j = ctx?.json ? await ctx.json().catch(() => null) : null;
    throw new Error(j?.erro ?? error.message);
  }
  if (data?.ok === false) throw new Error(data.erro ?? "Falha no Mercado Pago");
  return data;
}

export function RelatoriosMercadoPago() {
  const qc = useQueryClient();
  const { permitido } = usePermissaoAcaoOuSuperAdmin(SLUG);
  const [tela, setTela] = useEstadoTela({ mp_dia: "", mp_desde: "2026-09-15" });

  const execs = useQuery({
    queryKey: ["mp-relatorio-execucao"],
    queryFn: async (): Promise<Exec[]> => {
      const { data, error } = await sb.from("mp_relatorio_execucao").select("*").order("dia", { ascending: false }).limit(120);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });
  const dims = useQuery({
    queryKey: ["mp-relatorio-dims"],
    queryFn: async () => {
      const [s, t, a] = await Promise.all([
        sb.from("mp_relatorio_status_dim").select("codigo,rotulo,estado_selo").order("ordem"),
        sb.from("mp_relatorio_tipo_dim").select("codigo,rotulo").order("ordem"),
        sb.from("vw_mp_relatorio_atrasado").select("id", { count: "exact", head: true }),
      ]);
      for (const r of [s, t, a]) if (r.error) throw r.error;
      return { status: (s.data ?? []) as Dim[], tipo: (t.data ?? []) as Dim[], faltando: a.count ?? 0 };
    },
  });
  const rotStatus = useMemo(() => new Map((dims.data?.status ?? []).map((d) => [d.codigo, d])), [dims.data]);
  const rotTipo = useMemo(() => new Map((dims.data?.tipo ?? []).map((d) => [d.codigo, d.rotulo])), [dims.data]);
  const ultimo = (tipo: string) => (execs.data ?? []).filter((e) => e.tipo === tipo && e.status === "importado").sort((a, b) => b.dia.localeCompare(a.dia))[0];

  const atualizar = () => qc.invalidateQueries({ queryKey: ["mp-relatorio-execucao"] });
  const dia = useMutation({
    mutationFn: () => chamar({ acao: "dia", dia: tela.mp_dia }),
    onSuccess: async () => { toast.success(`Dia ${tela.mp_dia} processado`); await atualizar(); },
    onError: (e: Error) => toast.error(e.message, { duration: Infinity, closeButton: true }),
  });
  const retro = useMutation({
    mutationFn: () => chamar({ acao: "retroativo", desde: tela.mp_desde }),
    onSuccess: async (r) => { toast.success(`Retroativo: ${r.linhas_criadas} dia(s)/tipo enfileirados — a coleta das 7h–13h importa`); await atualizar(); },
    onError: (e: Error) => toast.error(e.message, { duration: Infinity, closeButton: true }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Relatórios automáticos</CardTitle>
        <CardDescription>
          Pedido às 06h do dia anterior; conferência e importação de hora em hora das 07h às 13h. Mesmo caminho da importação manual; original guardado para o contador.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-6 text-sm">
          {["release", "settlement"].map((t) => {
            const u = ultimo(t);
            return <span key={t}>{rotTipo.get(t) ?? t}: último dia importado <b>{u ? u.dia.split("-").reverse().join("/") : "—"}</b>{u?.importado_em ? ` (em ${fmtDataHora(u.importado_em)})` : ""}</span>;
          })}
          <span>Dias faltando: <b className={(dims.data?.faltando ?? 0) > 0 ? "text-destructive" : ""}>{dims.data?.faltando ?? "…"}</b></span>
        </div>

        {permitido && (
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="mp-dia">Importar um dia</Label>
              <Input id="mp-dia" type="date" className="w-44" value={tela.mp_dia} onChange={(e) => setTela({ mp_dia: e.target.value })} />
            </div>
            <Button variant="outline" disabled={!tela.mp_dia || dia.isPending} onClick={() => dia.mutate()}>
              {dia.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Importar dia
            </Button>
            <div className="space-y-1">
              <Label htmlFor="mp-desde">Retroativo desde</Label>
              <Input id="mp-desde" type="date" className="w-44" value={tela.mp_desde} onChange={(e) => setTela({ mp_desde: e.target.value })} />
            </div>
            <Button variant="outline" disabled={!tela.mp_desde || retro.isPending} onClick={() => retro.mutate()}>
              {retro.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Buscar retroativo
            </Button>
          </div>
        )}

        {execs.isError ? <p className="text-sm text-destructive">{(execs.error as Error).message}</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dia</TableHead><TableHead>Relatório</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Lidas</TableHead><TableHead className="text-right">Novas</TableHead>
                <TableHead className="text-right">Duplicadas</TableHead><TableHead className="text-right">Ignoradas</TableHead>
                <TableHead>Arquivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(execs.data ?? []).map((e) => {
                const st = rotStatus.get(e.status);
                return (
                  <TableRow key={e.id} data-foco-id={e.id}>
                    <TableCell>{e.dia.split("-").reverse().join("/")}</TableCell>
                    <TableCell>{rotTipo.get(e.tipo) ?? e.tipo}</TableCell>
                    <TableCell>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Selo estado={(st?.estado_selo as any) ?? "muted"}>{st?.rotulo ?? e.status}</Selo>
                      {e.erro && <span className="block max-w-xs text-xs text-destructive">{e.erro}</span>}
                    </TableCell>
                    <TableCell className="text-right">{e.linhas_lidas ?? "—"}</TableCell>
                    <TableCell className="text-right">{e.linhas_novas ?? "—"}</TableCell>
                    <TableCell className="text-right">{e.linhas_duplicadas ?? "—"}</TableCell>
                    <TableCell className="text-right">{e.linhas_ignoradas ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{e.file_name ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
              {(execs.data ?? []).length === 0 && !execs.isLoading && (
                <TableRow><TableCell colSpan={8} className="text-sm text-muted-foreground">Nenhum dia importado ainda.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
