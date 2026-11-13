import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function BotaoPermitido({ permitido, disabled, mensagemSemPermissao = "Sem permissão para gerar título", ...props }: ComponentProps<typeof Button> & { permitido: boolean; mensagemSemPermissao?: string }) {
  if (permitido) return <Button disabled={disabled} {...props} />;
  return <TooltipProvider><Tooltip><TooltipTrigger asChild><span tabIndex={0}><Button {...props} disabled /></span></TooltipTrigger>
    <TooltipContent>{mensagemSemPermissao}</TooltipContent></Tooltip></TooltipProvider>;
}
