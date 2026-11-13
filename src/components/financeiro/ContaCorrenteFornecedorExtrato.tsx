import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { resumirExtratoFornecedor } from "@/lib/financeiro/contaCorrenteExtrato";

export function ContaCorrenteFornecedorExtrato({ cnpj }: { cnpj: string | null }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const extrato = useQuery({
    queryKey: ["cc-extrato", cnpj],
    enabled: aberto && !!cnpj,
    queryFn: async () => {
      if (!cnpj) throw new Error("Fornecedor sem CNPJ para consultar o extrato.");
      const { data, error } = await supabase
        .from("vw_conta_corrente_extrato")
        .select("cnpj, data, tipo, descricao, valor, ref")
        .eq("cnpj", cnpj)
        .order("data");
      if (error) throw error;
      return data ?? [];
    },
  });
  const resumo = resumirExtratoFornecedor(extrato.data ?? []);

  return <div className="min-w-0 space-y-3">
    <Button variant="outline" size="sm" onClick={() => setAberto((valor) => !valor)} aria-expanded={aberto} aria-controls={id}>
      {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}Ver extrato
    </Button>
    {aberto && <div id={id} role="region" aria-label="Extrato do fornecedor" className="min-w-0 space-y-3 border-t pt-3">
      {cnpj && <p className="break-all text-xs text-muted-foreground">CNPJ: {cnpj}</p>}
      {!cnpj ? <p role="alert" className="text-sm text-destructive">Fornecedor sem CNPJ para consultar o extrato.</p>
        : extrato.isPending ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />Carregando extrato…</p>
        : extrato.error ? <p role="alert" className="break-words text-sm text-destructive">Erro ao carregar extrato: {extrato.error.message}</p>
        : resumo.linhas.length === 0 ? <p className="text-sm text-muted-foreground">Sem movimentos.</p>
        : <>
          <p className="text-xs text-muted-foreground">{resumo.documentos} {resumo.documentos === 1 ? "documento" : "documentos"} · {resumo.pagamentos} {resumo.pagamentos === 1 ? "pagamento" : "pagamentos"}</p>
          <div className="divide-y">
            {resumo.linhas.map(({ movimento, saldo }, index) => {
              const documento = movimento.tipo === "documento";
              const valor = Number(movimento.valor ?? 0);
              return <div key={`${movimento.ref ?? "mov"}-${index}`} className="grid min-w-0 grid-cols-1 gap-2 py-3 text-xs sm:grid-cols-[5rem_7rem_minmax(0,1fr)]">
                <span className="text-muted-foreground">{formatDateBR(movimento.data)}</span>
                <Badge variant="outline" className={cn("w-fit", documento ? "border-warning/40 text-warning" : "border-success/40 text-success")}>
                  {documento ? "+ documento" : "− abatimento"}
                </Badge>
                <p className="min-w-0 break-words [overflow-wrap:anywhere]">{movimento.descricao || "—"}</p>
                <div className="flex flex-wrap justify-between gap-2 sm:col-span-3">
                  <span className={cn("tabular-nums", valor >= 0 ? "text-warning" : "text-success")}>{valor >= 0 ? "+" : "−"}{formatBRL(Math.abs(valor))}</span>
                  <span className="text-muted-foreground">Saldo: <span className="tabular-nums">{formatBRL(saldo)}</span></span>
                </div>
              </div>;
            })}
            <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span className="font-medium">Saldo devedor</span>
              <span className={cn("font-medium tabular-nums", resumo.saldo > 0 ? "text-warning" : "text-success")}>{formatBRL(resumo.saldo)}</span>
            </div>
          </div>
        </>}
    </div>}
  </div>;
}