import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Copy, FileText, FileCode2, Receipt, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { SolicitarSopsAcao } from "@/components/comercial/SolicitarSopsAcao";
import type { MesaComercialRow } from "@/hooks/comercial/useMesaComercial";

/**
 * ACAO-QUE-NAO-SE-APLICA-NAO-RENDERIZA: sem link, sem PDF, sem XML ou sem
 * boleto, o ícone simplesmente não existe na linha. Nada de botão cinza.
 * No máximo 4 ícones visíveis; o excedente cai no menu "…".
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

  const acoes: AcaoItem[] = [];

  if (linha.link_pagamento) {
    acoes.push({
      chave: "link",
      rotulo: "Copiar link de pagamento",
      icone: <Copy className="h-4 w-4" />,
      executar: () => void copiarLink(linha.link_pagamento!),
    });
  }
  if (linha.tem_pdf && linha.nf_pdf_url) {
    acoes.push({
      chave: "pdf",
      rotulo: `Baixar NF PDF${linha.nf_numero ? ` (${linha.nf_numero})` : ""}`,
      icone: <FileText className="h-4 w-4" />,
      executar: () => window.open(linha.nf_pdf_url!, "_blank", "noopener,noreferrer"),
    });
  }
  if (linha.tem_xml && linha.nf_xml_url) {
    acoes.push({
      chave: "xml",
      rotulo: "Baixar NF XML",
      icone: <FileCode2 className="h-4 w-4" />,
      executar: () => window.open(linha.nf_xml_url!, "_blank", "noopener,noreferrer"),
    });
  }
  if ((linha.boletos_qtd ?? 0) > 0) {
    acoes.push({
      chave: "boletos",
      rotulo: `Ver boletos (${linha.boletos_qtd})`,
      icone: <Receipt className="h-4 w-4" />,
      executar: onVerBoletos,
    });
  }

  // "Solicitar ao SOPS" está sempre disponível e é a última posição visível.
  const visiveis = acoes.slice(0, 3);
  const excedente = acoes.slice(3);

  return (
    <div className="flex items-center justify-end gap-1">
      {visiveis.map((a) => (
        <Button
          key={a.chave}
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title={a.rotulo}
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
              <DropdownMenuItem key={a.chave} onClick={a.executar} className="gap-2 text-xs">
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
