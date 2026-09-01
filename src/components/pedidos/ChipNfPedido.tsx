import { AlertCircle, FileText, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useNfsDoPedido, type NfDoPedido } from "@/hooks/nf/useNfsDoPedido";
import { useDownloadNfPdf } from "@/hooks/nf/useDownloadNfPdf";
import { Selo } from "@/components/pedidos/prazoEntrega";
import { cn } from "@/lib/utils";
import { formatError } from "@/lib/format-error";

function nomeArquivo(nf: NfDoPedido) {
  return `NF-${nf.numero ?? nf.id}${nf.serie ? `-${nf.serie}` : ""}`;
}

function fmtEmissao(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

/** Mesma sinalização do LinhaNfFila: situação não autorizada vira alerta. */
function classeSelo(situacao: string | null) {
  return situacao && situacao !== "autorizada"
    ? "bg-warning/15 text-warning border-warning/40 font-medium"
    : "bg-muted text-muted-foreground border-border";
}

function textoSituacao(situacao: string | null) {
  if (!situacao || situacao === "autorizada") return null;
  return situacao === "pendente" ? "pendente de autorização" : situacao;
}

/**
 * Chip do cabeçalho da Casa dos Pedidos: número + série da NF principal.
 * Clicar baixa o DANFE. "+N" abre as demais NFs do pedido, cada uma com download.
 * Sem NF, não renderiza nada.
 */
export function ChipNfPedido({ pedidoId }: { pedidoId: string }) {
  const { data, isError, error } = useNfsDoPedido(pedidoId);
  const { baixar, baixando, nfEmDownload } = useDownloadNfPdf();

  // FAIL-LOUD: erro de consulta nunca se disfarça de "pedido sem NF".
  if (isError) {
    return (
      <span className="inline-flex shrink-0" title={formatError(error)}>
        <Selo className="inline-flex items-center gap-1 bg-destructive/10 text-destructive border-destructive/40 font-medium">
          <AlertCircle className="h-3 w-3" />
          NF: erro
        </Selo>
      </span>
    );
  }

  const principal = data?.principal;
  if (!principal?.numero) return null;

  const extras = data?.extras ?? [];
  const situacaoPrincipal = textoSituacao(principal.situacao);

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <button
        type="button"
        disabled={baixando}
        onClick={() => baixar({ nf_id: principal.id, nome: nomeArquivo(principal) })}
        title={`NF ${principal.numero} — baixar DANFE`}
        className="disabled:opacity-60"
      >
        <Selo className={cn("inline-flex items-center gap-1", classeSelo(principal.situacao))}>
          {baixando && nfEmDownload === principal.id && <Loader2 className="h-3 w-3 animate-spin" />}
          NF {principal.numero}
          {principal.serie ? ` · série ${principal.serie}` : ""}
          {situacaoPrincipal ? ` · ${situacaoPrincipal}` : ""}
        </Selo>
      </button>

      {extras.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" title={`Mais ${extras.length} NF(s) neste pedido`}>
              <Selo className="bg-muted text-muted-foreground border-border">+{extras.length}</Selo>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-2">
            <p className="px-1 pb-1 text-xs font-medium text-foreground">Outras NFs deste pedido</p>
            <ul className="space-y-1">
              {extras.map((nf) => (
                <li key={nf.id} className="flex items-center justify-between gap-2 rounded px-1 py-1">
                  <div className="min-w-0">
                    <p className="text-xs text-foreground">
                      NF {nf.numero ?? "—"}
                      {nf.serie ? ` · série ${nf.serie}` : ""}
                    </p>
                    <p className={cn("text-[11px]", textoSituacao(nf.situacao) ? "text-warning" : "text-muted-foreground")}>
                      {fmtEmissao(nf.data_emissao)}
                      {textoSituacao(nf.situacao) ? ` · ${textoSituacao(nf.situacao)}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    disabled={baixando}
                    title={`NF ${nf.numero ?? ""} — baixar DANFE`}
                    onClick={() => baixar({ nf_id: nf.id, nome: nomeArquivo(nf) })}
                  >
                    {baixando && nfEmDownload === nf.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}
