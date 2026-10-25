import { useState } from "react";
import { CheckCircle2, CircleAlert, ExternalLink, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatError } from "@/lib/format-error";
import { imprimirComprovanteColeta, imprimirEtiquetaEntrega, imprimirEtiquetaRetirada, imprimirTermoRetirada } from "./impressaoMesa";
import type { DadosImpressao, DocumentoMesa, EmbalagemRegistrada, ItemPedidoMesa, PedidoMesa } from "./tipos";
import { useConcluirDocumentos, useDadosImpressao, useDocumentosMesa, useMarcarDocumento, useRegistrarRastreio } from "./useMesaSp";

/**
 * Estação Documentos. O estado de cada documento (`liberado`) vem PRONTO de
 * `fn_mesa_sp_documentos`: a tela só exibe e dispara as RPCs — DANFE e rastreio
 * são liberados pelo DADO, nunca por checkbox. Etiquetas, termos e comprovante
 * são confirmados pelo operador: imprimir só abre a impressão; o checkbox marca.

 */
const ROTULO_IMPRESSORA: Record<string, string> = { a4: "A4", zebra: "Zebra", bling: "Bling" };

interface Props {
  pedido: PedidoMesa;
  itens: ItemPedidoMesa[];
  embalagem: EmbalagemRegistrada | null;
  modalNome: string | null;
  bloqueado?: boolean;
}

export function EstacaoDocumentos({ pedido, bloqueado = false }: Props) {
  const docsQ = useDocumentosMesa(pedido.id);
  const marcar = useMarcarDocumento();
  const rastreio = useRegistrarRastreio();
  const concluir = useConcluirDocumentos();
  const [codigo, setCodigo] = useState("");

  const dadosQ = useDadosImpressao(pedido.id);
  const docs = docsQ.data ?? [];
  const dados = dadosQ.data ?? null;
  const usaRemetente = docs.some((d) => d.tipo === "etiqueta_entrega" || d.tipo === "etiqueta_volume");

  function imprimir(d: DocumentoMesa, fn: (x: DadosImpressao) => boolean) {
    if (!dados) {
      toast.error(dadosQ.error ? formatError(dadosQ.error) : "Dados de impressão ainda carregando.");
      return;
    }
    // Imprimir só ABRE a impressão; quem deixa o documento "ok" é o checkbox.
    if (!fn(dados)) {
      toast.error("O navegador bloqueou a janela de impressão. Libere pop-ups para esta página.");
    }
  }

  /** Confirmação manual — único caminho que marca/desmarca o documento. */
  function caixaMarcacao(d: DocumentoMesa) {
    return (
      <Checkbox
        checked={d.liberado}
        disabled={bloqueado || (marcar.isPending && marcar.variables?.p_documento_id === d.documento_id)}
        onCheckedChange={(v) => marcar.mutate({ p_pedido_id: pedido.id, p_documento_id: d.documento_id, p_marcado: v === true })}
        aria-label={d.rotulo}
      />
    );
  }

  function botaoImprimir(d: DocumentoMesa, rotulo: string, fn: (x: DadosImpressao) => boolean) {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={bloqueado || !dados} onClick={() => imprimir(d, fn)}>
          {dadosQ.isLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Printer aria-hidden="true" />}{rotulo}
        </Button>
        {caixaMarcacao(d)}
      </div>
    );
  }


  function registrarRastreio() {
    const c = codigo.trim().toUpperCase();
    if (!c) return;
    rastreio.mutate({ p_pedido_id: pedido.id, p_codigo: c }, { onSuccess: () => setCodigo("") });
  }

  function acao(d: DocumentoMesa) {
    switch (d.tipo) {
      case "nf":
        return d.url ? (
          <Button size="sm" variant="outline" asChild>
            <a href={d.url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />{d.impressora === "bling" ? "Abrir DANFE (consulta)" : "Abrir DANFE"}</a>
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled><ExternalLink aria-hidden="true" />Abrir DANFE</Button>
        );
      case "rastreio":
        return (
          <div className="flex items-center gap-2">
            <Input
              className="h-8 w-44 font-mono uppercase"
              placeholder="AA123456789BR"
              value={codigo}
              disabled={bloqueado || rastreio.isPending}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); registrarRastreio(); } }}
            />
            <Button size="sm" onClick={registrarRastreio} disabled={bloqueado || rastreio.isPending || codigo.trim() === ""}>
              {rastreio.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {d.liberado ? "Registrar outro" : "Registrar"}
            </Button>
          </div>
        );
      case "etiqueta_entrega":
      case "etiqueta_volume":
        return botaoImprimir(d, `Imprimir etiqueta${dados?.volumes && dados.volumes > 1 ? ` (${dados.volumes})` : ""}`, imprimirEtiquetaEntrega);
      case "etiqueta_retirada":
        return botaoImprimir(d, `Imprimir etiqueta${dados?.volumes && dados.volumes > 1 ? ` (${dados.volumes})` : ""}`, imprimirEtiquetaRetirada);
      case "termo_retirada":
        return botaoImprimir(d, "Imprimir termo", imprimirTermoRetirada);
      case "comprovante_coleta":
        return botaoImprimir(d, "Imprimir comprovante", imprimirComprovanteColeta);
      case "declaracao":
        return caixaMarcacao(d);

      default:
        return null;
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <p className="text-sm font-medium">Documentos do pedido</p>

        {dadosQ.error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formatError(dadosQ.error)}
          </p>
        )}
        {usaRemetente && dados && dados.remetente.completo === false && (
          <p className="text-xs text-warning">Endereço do Site SP incompleto no cadastro — remetente sai só com nome e CEP.</p>
        )}

        {docsQ.isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : docsQ.error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formatError(docsQ.error)}
          </p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum documento cadastrado para o modal deste pedido.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {docs.map((d) => {
              const semNf = d.tipo === "nf" && !d.liberado;
              return (
                <li key={d.documento_id} className="flex flex-wrap items-center gap-3 p-3">
                  {d.liberado ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Liberado" />
                  ) : (
                    <CircleAlert className="size-4 shrink-0 text-warning" aria-label="Pendente" />
                  )}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-medium">
                      {d.rotulo}
                      {!d.obrigatorio && <span className="text-xs font-normal text-muted-foreground"> · opcional</span>}
                      <span className={cn(
                        "ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        d.liberado ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                      )}>
                        {d.liberado ? "ok" : "pendente"}
                      </span>
                      {d.impressora && d.impressora !== "nenhuma" && (
                        <span className="ml-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {ROTULO_IMPRESSORA[d.impressora] ?? d.impressora}
                        </span>
                      )}
                    </p>
                    {d.detalhe && (
                      <p className={cn("text-xs", semNf ? "font-medium text-warning" : "text-muted-foreground", d.tipo === "rastreio" && d.liberado && "font-mono")}>
                        {d.detalhe}
                      </p>
                    )}
                    {d.observacao && <p className="text-xs text-muted-foreground">{d.observacao}</p>}
                    {d.impressora === "bling" && (
                      <p className="text-xs text-muted-foreground">Imprime no Bling — não há impressão por aqui.</p>
                    )}
                  </div>
                  <div className="shrink-0">{acao(d)}</div>
                </li>
              );
            })}
          </ul>
        )}

        <Button
          onClick={() => concluir.mutate({ p_pedido_id: pedido.id })}
          disabled={bloqueado || concluir.isPending || docsQ.isLoading || !!docsQ.error}
        >
          {concluir.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Concluir documentos
        </Button>
      </CardContent>
    </Card>
  );
}
