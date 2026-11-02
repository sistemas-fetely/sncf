import { useEtiquetaSncfAgencia } from "./useMesaSp";

/** Agência marcada + etiqueta SNCF viva: o bipado vai substituir (e cancelar) a etiqueta. */
export function AvisoAgenciaSncf({ pedidoId }: { pedidoId: string }) {
  const { codigo, erro } = useEtiquetaSncfAgencia(pedidoId);
  if (erro) return <span className="block text-xs text-destructive">{(erro as Error).message}</span>;
  if (!codigo) return null;
  return (
    <span className="block text-xs text-warning">
      Postado na agência — o código bipado substitui a etiqueta SNCF <span className="font-mono">{codigo}</span> (ela será cancelada nos Correios)
    </span>
  );
}
