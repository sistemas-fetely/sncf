/**
 * Mapeamento de meio de pagamento para ícone Lucide + cor.
 *
 * Doutrina visual: ícones substituem texto na coluna "Meio PG".
 * Hover (title) mostra o nome completo. Fallback quando não bate
 * o nome conhecido: texto cinza pequeno.
 *
 * Reusável em: ContasPagar, CaixaBanco, OFX Stage, Modal Múltiplos.
 */

import {
  CreditCard,
  FileText,
  Zap,
  Landmark,
  Banknote,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type MeioPagamentoIcon = {
  Icon: LucideIcon;
  cor: string;
  label: string;
};

/**
 * Devolve ícone + cor + label normalizada pro meio de pagamento.
 * Se não bater, devolve null (UI mostra texto fallback).
 */
export function getMeioPagamentoIcon(meio: string | null | undefined): MeioPagamentoIcon | null {
  if (!meio) return null;
  const m = meio.toLowerCase().trim();

  // Cartão (cobre "Cartão de Crédito", "Cartão Débito", "Cartao", etc)
  if (m.includes("cart")) {
    return { Icon: CreditCard, cor: "text-info", label: meio };
  }
  // PIX
  if (m === "pix" || m.includes("pix")) {
    return { Icon: Zap, cor: "text-info", label: meio };
  }
  // Boleto
  if (m.includes("boleto")) {
    return { Icon: FileText, cor: "text-warning", label: meio };
  }
  // TED / Transferência
  if (m === "ted" || m.includes("ted") || m.includes("transfer")) {
    return { Icon: Landmark, cor: "text-info", label: meio };
  }
  // Dinheiro
  if (m.includes("dinheiro") || m.includes("espécie") || m.includes("especie")) {
    return { Icon: Banknote, cor: "text-success", label: meio };
  }
  // Débito Automático
  if (m.includes("débito autom") || m.includes("debito autom") || m.includes("autom")) {
    return { Icon: RefreshCw, cor: "text-info", label: meio };
  }
  // Outros conhecidos mas sem ícone específico
  if (m === "outros" || m === "outro") {
    return { Icon: HelpCircle, cor: "text-muted-foreground", label: meio };
  }

  // Fallback: sem ícone (UI vai mostrar texto)
  return null;
}
