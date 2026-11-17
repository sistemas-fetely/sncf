import { useState, type ReactNode } from 'react';
import { Selo } from '@/components/ui/selo';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { dataPostagemCurta, type AgendamentoPostagem } from '@/lib/logistica/agendamentoPostagem';

export function SeloPostagem({ pedido }: { pedido: AgendamentoPostagem }) {
  if (pedido.postagem_bloqueada) return <Selo estado="warning" className="whitespace-normal">Etiqueta em {dataPostagemCurta(pedido.agendado_para)}</Selo>;
  if (pedido.liberado_para_postar) return <Selo estado="success" className="whitespace-normal">Liberado p/ postar</Selo>;
  return null;
}

export function AvisoPostagem({ mensagem, children }: { mensagem?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!mensagem) return <>{children}</>;
  return <TooltipProvider><Tooltip open={open} onOpenChange={setOpen}><TooltipTrigger asChild><span tabIndex={0} onClick={() => setOpen(true)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} className="inline-flex max-w-full">{children}</span></TooltipTrigger><TooltipContent>{mensagem}</TooltipContent></Tooltip></TooltipProvider>;
}