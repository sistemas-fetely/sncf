import { useState } from "react";
import { FileText, Loader2, Send } from "lucide-react";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Selo } from "@/components/ui/selo";
import { Textarea } from "@/components/ui/textarea";
import { tempoParado, type AguardandoNfMesa } from "./tipos";
import { useSolicitarNf } from "./useMesaSp";

function minutosDesde(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? (Date.now() - t) / 60000 : null;
}

/**
 * Estado da solicitação de NF ao Fiscal — vem inteiro de `vw_fila_mesa_sp_aguardando_nf`.
 * Nenhum "solicitado" local: depois da RPC a tela só relê a view.
 */
export function SolicitacaoNf({ linha, compacto = false, bloqueado = false }: {
  linha: AguardandoNfMesa | undefined;
  compacto?: boolean;
  bloqueado?: boolean;
}) {
  const solicitar = useSolicitarNf();
  const [aberto, setAberto] = useState(false);
  const [obs, setObs] = useState("");

  if (!linha) {
    return <p className="text-xs text-muted-foreground">Sem dados de solicitação de NF para este pedido.</p>;
  }

  const embalado = linha.horas_aguardando != null
    ? tempoParado(linha.horas_aguardando * 60)
    : tempoParado(minutosDesde(linha.embalado_em));
  const reenviar = !!linha.solicitado_em;

  return (
    <div className="space-y-2">
      <p className="text-sm">
        {linha.volumes ?? "?"} vol · {linha.peso_kg ?? "?"} kg · embalado {embalado}
      </p>
      {reenviar ? (
        <div className="space-y-1">
          <Selo variant="info">
            NF solicitada {tempoParado(minutosDesde(linha.solicitado_em))}
            {linha.solicitado_por ? ` por ${linha.solicitado_por}` : ""}
          </Selo>
          {linha.observacao && !compacto && (
            <p className="text-xs text-muted-foreground">Obs.: {linha.observacao}</p>
          )}
        </div>
      ) : null}
      <BotaoGuardado
        slug="acao.expedicao_sp_operar"
        rotuloAcao={reenviar ? "Reenviar aviso de NF ao Fiscal" : "Solicitar NF ao Fiscal"}
        size="sm"
        variant={reenviar ? "outline" : "default"}
        disabled={solicitar.isPending || bloqueado}
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); setObs(""); setAberto(true); }}
      >
        {reenviar ? <Send aria-hidden="true" /> : <FileText aria-hidden="true" />}
        {reenviar ? "Reenviar aviso" : "Solicitar NF ao Fiscal"}
      </BotaoGuardado>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{reenviar ? "Reenviar aviso ao Fiscal" : "Solicitar NF ao Fiscal"}</DialogTitle>
            <DialogDescription>
              Pedido {linha.id_externo ?? linha.pedido_id} · {linha.parceiro_nome ?? "—"}. O Fiscal recebe uma notificação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="obs-nf">Observação (opcional)</Label>
            <Textarea id="obs-nf" value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={solicitar.isPending}>Cancelar</Button>
            <Button
              disabled={solicitar.isPending}
              onClick={async () => {
                try {
                  await solicitar.mutateAsync({ p_pedido_id: linha.pedido_id, p_observacao: obs.trim() || null });
                  setAberto(false);
                } catch { /* toast já mostra a mensagem do banco */ }
              }}
            >
              {solicitar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
