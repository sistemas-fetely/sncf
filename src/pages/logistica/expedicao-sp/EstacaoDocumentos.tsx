import { useState } from "react";
import { CheckCircle2, CircleAlert, ExternalLink, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { imprimirComprovanteColeta, imprimirEtiquetaEntrega, imprimirEtiquetaRetirada, imprimirTermoRetirada } from "./impressaoMesa";
import type { DadosImpressao, DocumentoMesa, EmbalagemRegistrada, ItemPedidoMesa, PedidoMesa } from "./tipos";
import { SeloServicoCorreios } from "./SeloServicoCorreios";
import { useConcluirDocumentos, useDadosImpressao, useDanfeEtiqueta, useDocumentosMesa, useMarcarDocumento, usePostarAgencia, usePrepostagemViva, useGerarEtiquetaCorreios, useRegistrarRastreio, useEtiquetaSncfAgencia, useCaixasAtivas, useCorrigirCaixaEmbalagem, useModaisEntrega } from "./useMesaSp";
import { SeletorCaixaAvulsa } from "./SeletorCaixaAvulsa";
import { dimAvulsa, embalagemSemCaixa, erroPedeCorrigirEmbalagem, type DimCaixaTexto } from "@/lib/logistica/caixaEmbalagem";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

export function EstacaoDocumentos({ pedido, embalagem, bloqueado = false }: Props) {
  const docsQ = useDocumentosMesa(pedido.id);
  const marcar = useMarcarDocumento();
  const rastreio = useRegistrarRastreio();
  const concluir = useConcluirDocumentos();
  const postar = usePostarAgencia();
  const [codigo, setCodigo] = useState("");
  const gerarCorreios = useGerarEtiquetaCorreios();
  // MESA-SP-CAIXA-OBRIGATORIA: recuperação — embalagem Correios sem caixa → nova caixa sem refazer separação/conferência.
  const corrigirCaixa = useCorrigirCaixaEmbalagem();
  const [corrigindo, setCorrigindo] = useState(false);
  const [cxCodigo, setCxCodigo] = useState<string | null>(null);
  const [cxAvulsa, setCxAvulsa] = useState<DimCaixaTexto | null>(null);
  const ativasQ = useCaixasAtivas(corrigindo);
  const cxDim = dimAvulsa(cxAvulsa);
  const erroGerar = gerarCorreios.error ? (gerarCorreios.error as Error).message : null;

  const dadosQ = useDadosImpressao(pedido.id);
  const modaisQ = useModaisEntrega();
  const docs = docsQ.data ?? [];
  const dados = dadosQ.data ?? null;
  const usaZebra = docs.some((d) => d.tipo === "etiqueta_entrega" || d.tipo === "etiqueta_volume" || d.tipo === "etiqueta_retirada");
  const danfeQ = useDanfeEtiqueta(usaZebra ? pedido.id : null, !!dados?.nf);
  const avisoDanfe = usaZebra && dados && (!dados.nf || danfeQ.isError) ? "DANFE etiqueta indisponível — use a DANFE do Bling" : null;
  // Serviço (PAC/SEDEX) só vai ao rodapé da etiqueta quando o modal é Correios (exige rastreio).
  const ehCorreios = (modaisQ.data ?? []).find((m) => m.codigo === (dados?.modal ?? embalagem?.modal))?.exige_etiqueta_correios === true;
  // Etiqueta Correios gerada pelo SNCF (pré-postagem viva) — a linha fica ok pelo código registrado.
  const ppQ = usePrepostagemViva(ehCorreios ? pedido.id : null);
  const pp = ppQ.data ?? null;
  // Pedido marcado para agência: gerar etiqueta SNCF nova pede confirmação (provavelmente não será usada).
  const agencia = useEtiquetaSncfAgencia(ehCorreios ? pedido.id : null);
  const [confirmarAgencia, setConfirmarAgencia] = useState(false);
  // MESA-SP-TROCA-SERVICO-CORREIOS: PAC|SEDEX escolhível; padrão = serviço do cliente (do banco).
  const servicoCliente = dados?.servico_cliente ?? null;
  const servicoEfetivo = pp?.servico ?? null;
  const [escolhaServico, setEscolhaServico] = useState<string | null>(null);
  const servicoEscolhido = escolhaServico ?? servicoEfetivo ?? servicoCliente;
  const [motivoTroca, setMotivoTroca] = useState("");
  const [confirmarTroca, setConfirmarTroca] = useState(false);
  const divergeCliente = !!servicoEscolhido && !!servicoCliente && servicoEscolhido !== servicoCliente;
  const trocaViva = !!pp && !!servicoEscolhido && servicoEscolhido !== servicoEfetivo;
  const motivoOk = !divergeCliente || motivoTroca.trim().length >= 3;
  function disparar(trocar: boolean) {
    gerarCorreios.mutate(
      { pedidoId: pedido.id, prepostagemId: pp?.id ?? null, servico: servicoEscolhido, motivoTroca: divergeCliente ? motivoTroca : null, trocarServico: trocar },
      { onSuccess: () => { setEscolhaServico(null); setMotivoTroca(""); } },
    );
  }
  function gerarOuReimprimir() {
    if (!motivoOk) { toast.error("Informe o motivo da troca de serviço (mín. 3 caracteres)."); return; }
    if (trocaViva) { setConfirmarTroca(true); return; }
    if (!pp && agencia.temAgencia) { setConfirmarAgencia(true); return; }
    disparar(false);
  }
  const comServico = (x: DadosImpressao): DadosImpressao => (ehCorreios ? x : { ...x, servico_correios: null });
  const etiquetaZebraEntrega = (x: DadosImpressao) => { if (avisoDanfe) toast.warning(avisoDanfe); return imprimirEtiquetaEntrega(comServico(x), danfeQ.data); };
  const etiquetaZebraRetirada = (x: DadosImpressao) => { if (avisoDanfe) toast.warning(avisoDanfe); return imprimirEtiquetaRetirada(x, danfeQ.data); };
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
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={bloqueado || !dados} onClick={() => imprimir(d, fn)}>
          {dadosQ.isLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Printer aria-hidden="true" />}{rotulo}
        </Button>
        {caixaMarcacao(d)}
        {fn === etiquetaZebraEntrega || fn === etiquetaZebraRetirada ? (
          danfeQ.isFetching ? <span className="text-xs text-muted-foreground">Lendo DANFE etiqueta…</span>
          : avisoDanfe ? <span className="text-xs text-warning" title={danfeQ.error ? formatError(danfeQ.error) : undefined}>{avisoDanfe}</span> : null
        ) : null}
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
        if (!ehCorreios) return (
          <div className="flex flex-wrap items-center gap-2">
            {d.url && <Button size="sm" variant="outline" asChild><a href={d.url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />Abrir documento</a></Button>}
            {caixaMarcacao(d)}
          </div>
        );
        return (
          <div className="flex min-w-0 flex-wrap items-center gap-2 [&>button]:h-auto [&>button]:min-h-9 [&>button]:whitespace-normal [&>button]:text-left">
            {pp && servicoEfetivo ? (
              <SeloServicoCorreios
                servico={servicoCliente && servicoEfetivo !== servicoCliente ? `${servicoEfetivo} (cliente: ${servicoCliente})` : servicoEfetivo}
                freteValor={pedido.frete_cliente_valor} freteGratis={pedido.frete_gratis} />
            ) : null}
            <div role="radiogroup" aria-label="Serviço Correios" className="inline-flex rounded-md border">
              {["PAC", "SEDEX"].map((sv) => (
                <Button key={sv} type="button" size="sm" role="radio" aria-checked={servicoEscolhido === sv}
                  variant={servicoEscolhido === sv ? "default" : "ghost"}
                  disabled={bloqueado || gerarCorreios.isPending}
                  onClick={() => setEscolhaServico(sv)}>
                  {sv}
                </Button>
              ))}
            </div>
            {!pp && (
              <span className="text-sm font-medium">
                {pedido.frete_gratis ? "frete grátis" : `cliente pagou ${formatBRL(pedido.frete_cliente_valor ?? 0)}`}
              </span>
            )}
            {!servicoCliente && dados && <span className="text-xs text-warning">Serviço do cliente não informado — confira no pedido</span>}
            {divergeCliente && (
              <div className="flex w-full flex-wrap items-center gap-2">
                <span className="text-xs text-warning">Serviço diferente do escolhido pelo cliente</span>
                {["Atraso no pedido", "Prazo do cliente", "Cliente pediu", "Outro"].map((m) => (
                  <Button key={m} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs"
                    onClick={() => setMotivoTroca(m === "Outro" ? "" : m)}>{m}</Button>
                ))}
                <Input className="h-8 w-56" placeholder="Motivo da troca (obrigatório)" value={motivoTroca}
                  onChange={(e) => setMotivoTroca(e.target.value)} aria-label="Motivo da troca de serviço" />
              </div>
            )}
            <Button
              size="sm"
              onClick={gerarOuReimprimir}
              disabled={bloqueado || gerarCorreios.isPending || ppQ.isLoading || !servicoEscolhido || !motivoOk}
            >
              {gerarCorreios.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Printer aria-hidden="true" />}
              {trocaViva ? `Trocar etiqueta para ${servicoEscolhido}`
                : pp ? `Reimprimir etiqueta Correios${pp.codigo_objeto ? ` (${pp.codigo_objeto})` : ""}` : "Gerar etiqueta Correios"}
            </Button>
            <AlertDialog open={confirmarTroca} onOpenChange={setConfirmarTroca}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Trocar serviço da etiqueta</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso cancela a etiqueta {pp?.codigo_objeto ?? ""} e gera outra em {servicoEscolhido}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => disparar(true)}>Cancelar e gerar em {servicoEscolhido}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {!pp && (erroPedeCorrigirEmbalagem(erroGerar) || embalagemSemCaixa(embalagem ?? null)) && (
              <Button size="sm" variant="outline" disabled={bloqueado} onClick={() => { setCxCodigo(null); setCxAvulsa(null); setCorrigindo(true); }}>
                Corrigir embalagem
              </Button>
            )}
            <AlertDialog open={corrigindo} onOpenChange={setCorrigindo}>
              <AlertDialogContent className="max-w-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Corrigir embalagem — caixa usada</AlertDialogTitle>
                  <AlertDialogDescription>
                    Registra a caixa mantendo o peso ({embalagem?.peso_kg ?? "—"} kg) e os volumes ({embalagem?.volumes ?? "—"}) já informados. Não volta à separação nem refaz a conferência.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {ativasQ.error && <p className="text-xs text-destructive">{(ativasQ.error as Error).message}</p>}
                <SeletorCaixaAvulsa caixas={ativasQ.data ?? []} codigo={cxCodigo} avulsa={cxAvulsa} onCodigo={setCxCodigo} onAvulsa={setCxAvulsa} />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <Button disabled={corrigirCaixa.isPending || (!cxCodigo && !cxDim)}
                    onClick={() => corrigirCaixa.mutate(
                      { p_pedido_id: pedido.id, p_caixa_codigo: cxCodigo, p_caixa_dim: cxCodigo ? null : cxDim },
                      { onSuccess: () => { setCorrigindo(false); gerarCorreios.reset(); } },
                    )}>
                    {corrigirCaixa.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                    Registrar caixa
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {ppQ.error && <span className="text-xs text-destructive">{formatError(ppQ.error)}</span>}
            {agencia.erro && <span className="text-xs text-destructive">{formatError(agencia.erro)}</span>}
            <AlertDialog open={confirmarAgencia} onOpenChange={setConfirmarAgencia}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Pedido marcado para postagem na agência</AlertDialogTitle>
                  <AlertDialogDescription>
                    Na agência a caixa recebe a etiqueta dos Correios e o código bipado no despacho substitui a do SNCF
                    (que será cancelada). Gerar a etiqueta SNCF mesmo assim?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => disparar(false)}>
                    Gerar mesmo assim
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {!pp && (<>
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
            </>)}
            {!d.liberado && !pp && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => postar.mutate({ p_pedido_id: pedido.id })}
                disabled={bloqueado || postar.isPending}
              >
                {postar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                Postar na agência
              </Button>
            )}
          </div>
        );
      case "etiqueta_entrega":
      case "etiqueta_volume":
        return botaoImprimir(d, `Imprimir etiqueta${dados?.volumes && dados.volumes > 1 ? ` (${dados.volumes})` : ""}`, etiquetaZebraEntrega);
      case "etiqueta_retirada":
        return botaoImprimir(d, `Imprimir etiqueta${dados?.volumes && dados.volumes > 1 ? ` (${dados.volumes})` : ""}`, etiquetaZebraRetirada);
      case "termo_retirada":
        return botaoImprimir(d, "Imprimir termo", imprimirTermoRetirada);
      case "comprovante_coleta":
        return botaoImprimir(d, "Imprimir comprovante", imprimirComprovanteColeta);
      case "declaracao":
        return caixaMarcacao(d);

      default:
        return (
          <div className="flex flex-wrap items-center gap-2">
            {d.url && <Button size="sm" variant="outline" asChild>
              <a href={d.url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />Abrir documento</a>
            </Button>}
            {caixaMarcacao(d)}
          </div>
        );
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <p className="text-sm font-medium">Documentos do pedido</p>
        {modaisQ.error && <p role="alert" className="text-sm text-destructive">{formatError(modaisQ.error)}</p>}
        {erroGerar && <p role="alert" className="whitespace-pre-wrap break-words rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erroGerar}</p>}

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
                    {ehCorreios && d.tipo === "rastreio" && !d.liberado && (
                      <p className="text-xs text-muted-foreground">
                        Etiqueta não imprimiu? Poste no balcão dos Correios e bipe o código do comprovante no despacho.
                      </p>
                    )}
                    {d.observacao && <p className="text-xs text-muted-foreground">{d.observacao}</p>}
                    {d.impressora === "bling" && (
                      <p className="text-xs text-muted-foreground">Imprime no Bling — não há impressão por aqui.</p>
                    )}
                  </div>
                  <div className="w-full min-w-0">{acao(d)}</div>
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
