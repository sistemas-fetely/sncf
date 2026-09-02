import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Copy, FileText, FileCode2, Receipt, MoreHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SolicitarSopsAcao } from "@/components/comercial/SolicitarSopsAcao";
import { usePermissoesMesa } from "@/hooks/comercial/usePermissoesMesa";
import { useDownloadNfPdf } from "@/hooks/nf/useDownloadNfPdf";
import type { MesaComercialRow } from "@/hooks/comercial/useMesaComercial";

/**
 * ACAO-QUE-NAO-SE-APLICA-NAO-RENDERIZA: sem link, sem PDF, sem XML ou sem
 * boleto, o ícone simplesmente não existe na linha. Nada de botão cinza.
 * No máximo 4 ícones visíveis; o excedente cai no menu "…".
 *
 * PERMISSAO-NAO-EXISTE-NA-TELA: sem a permissão nominal da ação, o ícone
 * também não renderiza — e é diferente de falta de DADO, que explica no tooltip.
 *
 * MECANISMO-ANTES-DE-URL: PDF e XML da NF baixam pelo mecanismo canônico da casa
 * (`useDownloadNfPdf` -> edge function `nf-download`), igual a NfsDeVenda, ChipNfPedido
 * e Fila. `nf_pdf_url`/`nf_xml_url` são CACHE de link assinado do Bling (~48h) e não
 * funcionam abertos no navegador do usuário: o Bling pede validação de CNPJ sem sessão,
 * e o XML volta como `text/xml`, que o navegador renderiza em vez de baixar. O servidor
 * resolve link fresco pelo `bling_id` e devolve `attachment`. Nada de `window.open`.
 */
async function copiarLink(link: string) {
  try {
    await navigator.clipboard.writeText(link);
    toast.success("Link de pagamento copiado");
  } catch (e) {
    toast.error("Não foi possível copiar o link", {
      description: e instanceof Error ? e.message : undefined,
    });
  }
}

/** Nome do arquivo baixado. O hook concatena a extensão. */
function nomeArquivoNf(linha: MesaComercialRow, formato: "pdf" | "xml"): string {
  if (formato === "xml" && linha.nf_chave) return `NFe-${linha.nf_chave}`;
  if (linha.nf_numero) {
    return `NF-${linha.nf_numero}${linha.nf_serie ? `-${linha.nf_serie}` : ""}`;
  }
  return `NF-${linha.nf_id}`;
}

interface AcaoItem {
  chave: string;
  rotulo: string;
  icone: React.ReactNode;
  executar: () => void;
}

export function AcoesMesaLinha({
  linha,
  onVerBoletos,
}: {
  linha: MesaComercialRow;
  onVerBoletos: () => void;
}) {
  const [sopsAberto, setSopsAberto] = useState(false);
  const { podeCopiarLink, podeBaixarNf, podeVerBoletos } = usePermissoesMesa();
  const { baixar, baixando, nfEmDownload } = useDownloadNfPdf();

  // FAIL-LOUD já mora no hook: erro do servidor sobe como toast com o corpo real.
  const baixandoEstaNf = baixando && nfEmDownload === linha.nf_id;

  const acoes: AcaoItem[] = [];

  if (podeCopiarLink && linha.link_pagamento) {
    acoes.push({
      chave: "link",
      rotulo: "Copiar link de pagamento",
      icone: <Copy className="h-4 w-4" />,
      executar: () => void copiarLink(linha.link_pagamento!),
    });
  }
  if (podeBaixarNf && linha.tem_pdf && linha.nf_id) {
    acoes.push({
      chave: "pdf",
      rotulo: `Baixar NF PDF${linha.nf_numero ? ` (${linha.nf_numero})` : ""}`,
      icone: baixandoEstaNf
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <FileText className="h-4 w-4" />,
      executar: () =>
        baixar({
          nf_id: linha.nf_id!,
          formato: "pdf",
          nome: nomeArquivoNf(linha, "pdf"),
        }),
    });
  }
  if (podeBaixarNf && linha.tem_xml && linha.nf_id) {
    acoes.push({
      chave: "xml",
      rotulo: `Baixar NF XML${linha.nf_numero ? ` (${linha.nf_numero})` : ""}`,
      icone: baixandoEstaNf
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <FileCode2 className="h-4 w-4" />,
      executar: () =>
        baixar({
          nf_id: linha.nf_id!,
          formato: "xml",
          nome: nomeArquivoNf(linha, "xml"),
        }),
    });
  }
  if (podeVerBoletos && (linha.boletos_qtd ?? 0) > 0) {
    acoes.push({
      chave: "boletos",
      rotulo: `Ver boletos (${linha.boletos_qtd})`,
      icone: <Receipt className="h-4 w-4" />,
      executar: onVerBoletos,
    });
  }

  // "Solicitar ao SOPS" tem gate próprio dentro do componente da ação.
  const visiveis = acoes.slice(0, 3);
  const excedente = acoes.slice(3);
  const ehAcaoDeNf = (chave: string) => chave === "pdf" || chave === "xml";

  return (
    <div className="flex items-center justify-end gap-1">
      {visiveis.map((a) => (
        <Button
          key={a.chave}
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title={a.rotulo}
          disabled={ehAcaoDeNf(a.chave) && baixandoEstaNf}
          onClick={a.executar}
        >
          {a.icone}
        </Button>
      ))}

      <SolicitarSopsAcao
        pedidoId={linha.pedido_id}
        aberto={sopsAberto}
        onAbertoChange={setSopsAberto}
      />

      {excedente.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Mais ações">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {excedente.map((a) => (
              <DropdownMenuItem
                key={a.chave}
                onClick={a.executar}
                disabled={ehAcaoDeNf(a.chave) && baixandoEstaNf}
                className="gap-2 text-xs"
              >
                {a.icone}
                {a.rotulo}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
