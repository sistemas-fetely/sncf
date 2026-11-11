import { AlertTriangle, Inbox, Receipt, Clock, Package, FileText, Truck, PackageCheck, Ban } from "lucide-react";

/** Shared verbatim B2C icons; absent entries retain PipelineFases' existing fallback. */
export const ICONES_ESTAGIO_B2C: Record<string, JSX.Element> = {
  recebido: <Inbox className="h-4 w-4" />,
  cobranca: <Receipt className="h-4 w-4" />,
  aguardando_pagamento: <Clock className="h-4 w-4" />,
  pre_separacao: <Clock className="h-4 w-4" />,
  em_separacao: <Package className="h-4 w-4" />,
  pre_faturamento: <FileText className="h-4 w-4" />,
  faturado: <FileText className="h-4 w-4" />,
  travado: <AlertTriangle className="h-4 w-4" />,
  em_transporte: <Truck className="h-4 w-4" />,
  entregue: <PackageCheck className="h-4 w-4" />,
  cancelado: <Ban className="h-4 w-4" />,
};