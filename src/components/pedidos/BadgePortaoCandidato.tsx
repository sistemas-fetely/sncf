import { useState } from "react";
import { CreditCard, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatBRL } from "@/lib/format-currency";
import { fmtData } from "@/lib/data";
import { IDENTIDADE_CANDIDATO, SITUACAO_CANDIDATO, type PortaoCandidato } from "@/lib/pedidos/portao-candidato";

export function BadgePortaoCandidato({ candidato }: { candidato: PortaoCandidato }) {
  const [aberto, setAberto] = useState(false);
  const identificado = candidato.situacao === "inequivoco";
  const texto = identificado ? "Pagamento identificado" : "Pagamento sem vínculo";
  const Icone = candidato.meio === "cartao" ? CreditCard : Zap;
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-auto max-w-full p-0 hover:bg-transparent" aria-label={texto}
          onClick={(e) => e.stopPropagation()}
          onPointerEnter={(e) => { if (e.pointerType === "mouse") setAberto(true); }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setAberto(false); }}>
          <Selo estado={identificado ? "success" : "warning"} className="gap-1 whitespace-normal text-left leading-tight">
            <Icone className="h-3 w-3 shrink-0" />{texto}
          </Selo>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-2 text-xs break-words"
        onClick={(e) => e.stopPropagation()} onPointerEnter={() => setAberto(true)} onPointerLeave={() => setAberto(false)}>
        <p className="font-medium">{formatBRL(candidato.valor_origem)} recebido em {fmtData(candidato.origem_data)} · {candidato.origem_conta}</p>
        <p>{candidato.origem_descricao}</p>
        <p>Esperado: {formatBRL(candidato.valor_esperado)} · {candidato.dias_de_diferenca ?? "—"} dias de diferença</p>
        <p>Identidade: {IDENTIDADE_CANDIDATO[candidato.identidade] ?? "Não informada"}</p>
        <p>Situação: {SITUACAO_CANDIDATO[candidato.situacao] ?? "Não informada"}{candidato.motivo ? ` — ${candidato.motivo}` : ""}</p>
      </PopoverContent>
    </Popover>
  );
}