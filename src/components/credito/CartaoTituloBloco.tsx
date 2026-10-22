import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LinkCartaoBloco } from "@/components/credito/RenegociarTituloDialog";
import { chamarEdge } from "@/lib/pedidos/edgePagamento";
import { useInvalidarRecebivel } from "@/hooks/recebivel/useInvalidarRecebivel";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";

interface UltimoLink { url: string | null; status: string | null; expira_em: string | null; max_parcelas: number | null; erro: string | null }

/** Link SafraPay do título de cartão: mostra o vivo ou gera um novo (fallback da renegociação). */
export function CartaoTituloBloco({ tituloId }: { tituloId: string }) {
  const qc = useQueryClient();
  const invalidarRecebivel = useInvalidarRecebivel();
  const { permitido: podeGerar } = usePermissaoAcaoOuSuperAdmin("acao.cobranca_gerar_link");

  const q = useQuery({
    queryKey: ["titulo-cartao-link", tituloId],
    queryFn: async () => {
      const [l, t] = await Promise.all([
        (supabase as any).from("pagamento_link").select("url, status, expira_em, max_parcelas, erro")
          .eq("titulo_id", tituloId).order("criado_em", { ascending: false }).limit(1).maybeSingle(),
        (supabase as any).from("titulo_a_receber").select("valor_bruto, valor_juros_cartao, data_vencimento_atual")
          .eq("id", tituloId).maybeSingle(),
      ]);
      if (l.error) throw new Error(l.error.message);
      if (t.error) throw new Error(t.error.message);
      return { link: l.data as UltimoLink | null, titulo: t.data as { valor_bruto: number | null; valor_juros_cartao: number | null; data_vencimento_atual: string | null } | null };
    },
  });

  const ultimo = q.data?.link ?? null;
  const juros = Number(q.data?.titulo?.valor_juros_cartao ?? 0);
  const vivo = !!ultimo && ultimo.status === "aberto" && !!ultimo.url && (!ultimo.expira_em || new Date(ultimo.expira_em) > new Date());
  const travadoSemLink = juros > 0 && !ultimo;
  const travado = juros > 0;
  const [parcelas, setParcelas] = useState(1);
  useEffect(() => { if (ultimo?.max_parcelas) setParcelas(ultimo.max_parcelas); }, [ultimo?.max_parcelas]);

  const gerar = useMutation({
    mutationFn: async () => {
      const forcar = !!ultimo && ["erro", "cancelado", "expirado"].includes(ultimo.status ?? "");
      return chamarEdge<{ url: string; expira_em: string | null }>("safrapay-link", {
        titulo_id: tituloId, max_parcelas: parcelas, ...(forcar || (ultimo && !vivo) ? { forcar_novo: true } : {}),
      });
    },
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["titulo-cartao-link", tituloId] }), invalidarRecebivel()]);
      toast.success("Link do cartão gerado.");
    },
    onError: (e: Error) => toast.error("Não foi possível gerar o link", { description: e.message }),
  });

  if (q.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (q.error) return <Alert variant="destructive"><AlertDescription className="text-xs">Erro ao ler o link: {(q.error as Error).message}</AlertDescription></Alert>;

  const total = Number(q.data?.titulo?.valor_bruto ?? 0);
  if (vivo) {
    return (
      <LinkCartaoBloco
        c={{ tituloId, principal: total - juros, juros, total, maxParcelas: ultimo!.max_parcelas ?? 1, jurosPor: juros > 0 ? "cliente" : "fetely",
          vencimento: q.data?.titulo?.data_vencimento_atual, link: { url: ultimo!.url!, expira_em: ultimo!.expira_em } }}
        onRetentar={() => {}} retentando={false}
      />
    );
  }

  return (
    <div className="rounded-md border p-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        {ultimo ? `Último link: ${ultimo.status ?? "—"}${ultimo.erro ? ` · ${ultimo.erro}` : ""}` : "Nenhum link de cartão gerado para este título."}
      </p>
      {podeGerar && (
        <>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Nº de parcelas</Label>
              <Select value={String(parcelas)} onValueChange={(v) => setParcelas(Number(v))} disabled={travado}>
                <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <SelectItem key={n} value={String(n)}>{n}x</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" disabled={gerar.isPending || travadoSemLink} onClick={() => gerar.mutate()}>
              {gerar.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Gerar link do cartão
            </Button>
          </div>
          {travadoSemLink && (
            <Alert className="border-warning/40 bg-warning/10">
              <AlertDescription className="text-xs text-warning">
                Juros do cartão já embutidos — nº de parcelas definido na renegociação; gere o link pela renegociação.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
