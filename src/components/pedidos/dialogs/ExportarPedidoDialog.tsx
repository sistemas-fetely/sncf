import { useState } from "react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePedidoParaExportar } from "@/hooks/pedidos/usePedidoParaExportar";
import { gerarPedidoPdf, conferirTotaisPedido } from "@/lib/pedidoPdf";
import { buildLinhas, buildWorkbook, COLUNAS_CADASTRO } from "@/lib/cadastroXlsx";
import { formatError } from "@/lib/format-error";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle, Download, FileSpreadsheet, FileText, Loader2, Mail, Send,
} from "lucide-react";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function base64ParaBlob(base64: string, mime: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

interface ExportarPedidoDialogProps {
  pedidoId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function ExportarPedidoDialog({
  pedidoId,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: ExportarPedidoDialogProps) {
  const [openInterno, setOpenInterno] = useState(false);
  const controlado = openProp !== undefined;
  const open = controlado ? !!openProp : openInterno;
  const setOpen = (v: boolean) => {
    if (controlado) onOpenChange?.(v);
    else setOpenInterno(v);
  };

  const { toast } = useToast();
  const { data: exp, isLoading, error } = usePedidoParaExportar(open ? pedidoId : undefined);

  // Linhas da planilha de cadastro (mesma fonte do TabelaCadastroDialog).
  const cadastroQ = useQuery({
    queryKey: ["exportar-pedido-cadastro", pedidoId],
    enabled: open,
    queryFn: async () => {
      const { data: itens, error: eItens } = await supabase
        .from("pedido_itens")
        .select("sku, descricao, quantidade, ordem")
        .eq("pedido_id", pedidoId)
        .order("ordem");
      if (eItens) throw eItens;

      const skus = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...new Set((itens ?? []).map((i: any) => i.sku).filter(Boolean)),
      ] as string[];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prodMap = new Map<string, any>();
      if (skus.length > 0) {
        const { data: produtos, error: eProds } = await supabase
          .from("sncf_produtos")
          .select("*")
          .in("sku", skus);
        if (eProds) throw eProds;
        for (const p of produtos ?? []) prodMap.set(p.sku, p);
      }
      return buildLinhas(itens ?? [], prodMap);
    },
  });

  const [destinatario, setDestinatario] = useState("");
  const [destinatarioTocado, setDestinatarioTocado] = useState(false);
  const [cc, setCc] = useState("");
  const [anexarPdf, setAnexarPdf] = useState(true);
  const [anexarCadastro, setAnexarCadastro] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const emailDestino = destinatarioTocado ? destinatario : (exp?.parceiro?.email ?? "");
  const emailValido = EMAIL_RE.test(emailDestino.trim());
  const linhasCadastro = cadastroQ.data ?? [];
  const nomeBase = exp ? `pedido_${exp.pedido.id_externo}` : "pedido";

  const totais = exp ? conferirTotaisPedido(exp.pdf) : null;

  function montarWorkbookPedido() {
    if (!exp) return null;
    const p = exp.pedido;
    const pdf = exp.pdf;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aoa: any[][] = [
      ["Pedido", p.id_externo],
      ["Data", pdf.data_pedido],
      ["Cliente", exp.parceiro?.razao_social ?? ""],
      ["CNPJ", exp.parceiro?.cnpj ?? ""],
      ["Forma de pagamento", p.forma_solicitada ?? ""],
      ["Condição de pagamento", p.condicao_solicitada ?? ""],
      ["Estágio", p.estagio ?? ""],
      [],
      ["SKU", "Descrição", "Qtd", "Valor unitário", "Subtotal"],
    ];

    for (const it of exp.itens) {
      aoa.push([
        it.sku ?? "",
        it.descricao ?? "",
        it.quantidade,
        it.valor_unitario,
        it.quantidade * it.valor_unitario,
      ]);
    }

    aoa.push([]);
    aoa.push(["", "", "", "Valor bruto", pdf.valor_bruto]);
    if (Number(pdf.desconto_valor ?? 0) > 0) {
      aoa.push([
        "",
        "",
        "",
        pdf.desconto_pct ? `Desconto (${pdf.desconto_pct}%)` : "Desconto",
        -Number(pdf.desconto_valor),
      ]);
    }
    if (Number(pdf.bonus_pix_valor ?? 0) > 0) {
      aoa.push(["", "", "", "Bônus PIX", -Number(pdf.bonus_pix_valor)]);
    }
    if (exp.frete_entra_no_liquido && Number(pdf.valor_frete ?? 0) > 0) {
      aoa.push(["", "", "", "Frete", Number(pdf.valor_frete)]);
    } else if (Number(pdf.valor_frete ?? 0) > 0) {
      aoa.push(["", "", "", "Frete", "por conta da Fetely"]);
    }
    aoa.push(["", "", "", "Valor líquido", pdf.valor_liquido]);

    const wsPedido = XLSX.utils.aoa_to_sheet(aoa);
    wsPedido["!cols"] = [{ wch: 16 }, { wch: 52 }, { wch: 8 }, { wch: 22 }, { wch: 16 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsPedido, "Pedido");

    // Aba "Cadastro" — mesmas colunas/larguras do builder oficial.
    const headers = COLUNAS_CADASTRO.map((c) => c.label);
    const rows = linhasCadastro.map((l) => COLUNAS_CADASTRO.map((c) => l[c.key] ?? ""));
    const wsCad = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    wsCad["!cols"] = COLUNAS_CADASTRO.map((c) => ({ wch: Math.max(c.label.length + 4, 18) }));
    XLSX.utils.book_append_sheet(wb, wsCad, "Cadastro");

    return wb;
  }

  function handleBaixarPdf() {
    if (!exp) return;
    try {
      const base64 = gerarPedidoPdf(exp.pdf);
      baixarBlob(base64ParaBlob(base64, "application/pdf"), `${nomeBase}.pdf`);
    } catch (e) {
      toast({ title: "Erro ao gerar PDF", description: formatError(e), variant: "destructive" });
    }
  }

  function handleBaixarExcel() {
    if (!exp) return;
    try {
      const wb = montarWorkbookPedido();
      if (!wb) return;
      const arr = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      baixarBlob(new Blob([arr], { type: XLSX_MIME }), `${nomeBase}.xlsx`);
    } catch (e) {
      toast({ title: "Erro ao gerar Excel", description: formatError(e), variant: "destructive" });
    }
  }

  async function handleEnviar() {
    if (!exp) return;
    if (!emailValido) {
      toast({
        title: "E-mail inválido",
        description: "Informe um endereço de e-mail válido antes de enviar.",
        variant: "destructive",
      });
      return;
    }
    if (!anexarPdf && !anexarCadastro) {
      toast({
        title: "Nenhum anexo selecionado",
        description: "Marque pelo menos um anexo — o cliente receberia um e-mail vazio.",
        variant: "destructive",
      });
      return;
    }

    setEnviando(true);
    try {
      const attachments: { filename: string; content: string }[] = [];
      if (anexarPdf) {
        attachments.push({
          filename: `${nomeBase}.pdf`,
          content: gerarPedidoPdf(exp.pdf),
        });
      }
      if (anexarCadastro) {
        const wbCad = buildWorkbook(linhasCadastro);
        attachments.push({
          filename: `Catalogo_Fetely_${exp.pedido.id_externo.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`,
          content: XLSX.write(wbCad, { bookType: "xlsx", type: "base64" }),
        });
      }

      const ccList = cc
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter((s) => EMAIL_RE.test(s));

      const { error: invErr } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "pedido-espelho",
          recipientEmail: emailDestino.trim(),
          ...(ccList.length > 0 ? { cc: ccList } : {}),
          idempotencyKey: `pedido-espelho-${pedidoId}-${Date.now()}`,
          templateData: {
            parceiro_nome: exp.parceiro?.razao_social ?? "",
            pedido_id_externo: exp.pedido.id_externo,
            data_pedido: exp.pdf.data_pedido,
            forma_pagamento: exp.pedido.forma_solicitada ?? "",
            condicao_pagamento: exp.pedido.condicao_solicitada ?? "",
            valor_liquido: fmtBRL.format(Number(exp.pedido.valor_liquido ?? 0)),
            tem_planilha_cadastro: anexarCadastro,
          },
          attachments,
        },
      });
      if (invErr) throw invErr;

      toast({
        title: "Pedido enviado",
        description: `${exp.pedido.id_externo} enviado para ${emailDestino.trim()}`,
      });
      setOpen(false);
    } catch (e) {
      console.error("[ExportarPedidoDialog] envio:", e);
      toast({ title: "Erro ao enviar e-mail", description: formatError(e), variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
            <Download className="h-3 w-3 mr-1" />
            Exportar pedido
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Exportar pedido{exp ? ` — ${exp.pedido.id_externo}` : ""}
          </DialogTitle>
          <DialogDescription>
            {isLoading || !exp ? (
              "Carregando dados do pedido…"
            ) : (
              <>
                {exp.parceiro?.razao_social ?? "Cliente não identificado"}
                {exp.pedido.estagio ? ` · ${exp.pedido.estagio.replace(/_/g, " ")}` : ""}
                {" · "}
                {fmtBRL.format(Number(exp.pedido.valor_liquido ?? 0))}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erro ao carregar o pedido</AlertTitle>
            <AlertDescription className="text-xs font-mono">{formatError(error)}</AlertDescription>
          </Alert>
        ) : !exp ? null : (
          <div className="space-y-5">
            {/* Aviso de totais que não fecham */}
            {totais && !totais.fecha && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Os valores deste pedido não fecham</AlertTitle>
                <AlertDescription className="text-sm">
                  Bruto menos desconto mais frete dá{" "}
                  <strong>{fmtBRL.format(totais.somaComponentes)}</strong>, mas o valor líquido
                  gravado é{" "}
                  <strong>{fmtBRL.format(Number(exp.pdf.valor_liquido ?? 0))}</strong> (diferença de{" "}
                  <strong>{fmtBRL.format(Math.abs(totais.diferenca))}</strong>). O documento vai
                  sair com essa inconsistência.
                </AlertDescription>
              </Alert>
            )}

            {/* Downloads */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleBaixarPdf}>
                <FileText className="h-4 w-4 mr-2" />
                Baixar PDF
              </Button>
              <Button
                variant="outline"
                onClick={handleBaixarExcel}
                disabled={cadastroQ.isLoading}
              >
                {cadastroQ.isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                )}
                Baixar Excel
              </Button>
            </div>

            {cadastroQ.isError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Erro ao carregar a planilha de cadastro</AlertTitle>
                <AlertDescription className="text-xs font-mono">
                  {formatError(cadastroQ.error)}
                </AlertDescription>
              </Alert>
            )}

            <Separator />

            {/* E-mail */}
            <div className="space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Enviar por e-mail
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="exp-destinatario">Destinatário</Label>
                  <Input
                    id="exp-destinatario"
                    type="email"
                    value={emailDestino}
                    onChange={(e) => {
                      setDestinatarioTocado(true);
                      setDestinatario(e.target.value);
                    }}
                    placeholder="cliente@empresa.com.br"
                  />
                  {!emailValido && (
                    <p className="text-xs text-destructive">
                      {emailDestino.trim()
                        ? "Endereço de e-mail inválido."
                        : "Cliente sem e-mail cadastrado — informe o destinatário."}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exp-cc">CC (opcional)</Label>
                  <Input
                    id="exp-cc"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="separe por vírgula"
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="exp-anexo-pdf"
                    checked={anexarPdf}
                    onCheckedChange={(v) => setAnexarPdf(v === true)}
                  />
                  <Label htmlFor="exp-anexo-pdf" className="font-normal">
                    Anexar PDF do pedido
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="exp-anexo-cadastro"
                    checked={anexarCadastro}
                    disabled={cadastroQ.isLoading || linhasCadastro.length === 0}
                    onCheckedChange={(v) => setAnexarCadastro(v === true)}
                  />
                  <Label htmlFor="exp-anexo-cadastro" className="font-normal">
                    Anexar planilha de cadastro
                    {linhasCadastro.length > 0 ? ` (${linhasCadastro.length} SKUs)` : ""}
                  </Label>
                </div>
                {!anexarPdf && !anexarCadastro && (
                  <p className="text-xs text-destructive">
                    Marque pelo menos um anexo para poder enviar.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fechar
          </Button>
          <Button
            onClick={handleEnviar}
            disabled={!exp || enviando || !emailValido || (!anexarPdf && !anexarCadastro)}
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar por e-mail
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
