// ============= RastreioPedidoBloco =============
// RASTREIO-B2B-MANUAL (22/08/2026): campo "Código de rastreio" na tela Dados de Envio.
// Se já houver vínculo, mostra código + status atual e permite trocar. O polling dos
// Correios é genérico por codigo_rastreio — basta o vínculo existir para o status chegar.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, PackageSearch, Pencil } from "lucide-react";
import { useRastreioPedido, useVincularRastreioPedido } from "@/hooks/pedidos/useRastreioPedido";

interface Props {
  pedidoId: string;
}

export function RastreioPedidoBloco({ pedidoId }: Props) {
  const rastreio = useRastreioPedido(pedidoId);
  const vincular = useVincularRastreioPedido();
  const [codigo, setCodigo] = useState("");
  const [trocando, setTrocando] = useState(false);

  const vinculado = rastreio.data ?? null;
  const mostrarCampo = !vinculado || trocando;

  const salvar = () => {
    const c = codigo.trim();
    if (!c) return;
    vincular.mutate(
      { pedidoId, codigoRastreio: c },
      {
        onSuccess: () => {
          setCodigo("");
          setTrocando(false);
        },
      },
    );
  };

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Código de rastreio</label>

      {rastreio.isLoading ? (
        <p className="text-xs text-muted-foreground">Verificando rastreio…</p>
      ) : vinculado && !trocando ? (
        <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium tracking-wide flex items-center gap-1.5">
              <PackageSearch className="h-3.5 w-3.5 text-muted-foreground" />
              {vinculado.codigo_rastreio}
            </p>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setTrocando(true)}>
              <Pencil className="h-3 w-3 mr-1" />
              Trocar
            </Button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {vinculado.entregue ? (
              <Badge variant="outline" className="text-[10px] border-success/60 text-success">Entregue</Badge>
            ) : vinculado.status_atual ? (
              <Badge variant="outline" className="text-[10px]">{vinculado.status_atual}</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">Aguardando primeira leitura</Badge>
            )}
            {vinculado.data_ultima_atualizacao && (
              <span className="text-[10px] text-muted-foreground">
                Atualizado em {new Date(vinculado.data_ultima_atualizacao).toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {mostrarCampo && !rastreio.isLoading && (
        <div className="flex gap-1">
          <input
            type="text"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="Ex: AA123456789BR"
            maxLength={13}
            className="flex-1 min-w-0 h-9 text-sm rounded-md border border-input bg-background px-3 uppercase focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9"
            disabled={!codigo.trim() || vincular.isPending}
            onClick={salvar}
          >
            {vincular.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Vincular"}
          </Button>
          {trocando && (
            <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => { setTrocando(false); setCodigo(""); }}>
              Cancelar
            </Button>
          )}
        </div>
      )}

      {mostrarCampo && !rastreio.isLoading && (
        <p className="text-[10px] text-muted-foreground leading-tight">
          Formato Correios (ex: AA123456789BR). Depois de vinculado, o status chega sozinho pelo rastreio automático.
        </p>
      )}
    </div>
  );
}
