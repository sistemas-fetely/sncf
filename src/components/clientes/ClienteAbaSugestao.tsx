/**
 * Sugestão ativa de venda na ficha do cliente.
 * Não informa lacuna: aponta SKU e entrega o argumento pronto para o vendedor.
 */
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Selo } from "@/components/ui/selo";
import { formatBRL } from "@/lib/format-currency";
import { useSugestaoVenda } from "@/hooks/clientes/useClientePainel";
import { toast } from "sonner";

function TituloSecao({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15px] font-medium leading-tight">{children}</h3>;
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}

interface CardSugestaoProps {
  sku: string;
  nome: string;
  familia: string;
  colecao: string;
  preco_venda: number;
  clientes_compram: number;
  porque: string;
}

function CardSugestao({
  sku,
  nome,
  familia,
  colecao,
  preco_venda,
  clientes_compram,
  porque,
}: CardSugestaoProps) {
  function copiarSku() {
    navigator.clipboard.writeText(sku).then(() => {
      toast("SKU copiado");
    });
  }

  return (
    <Card className="bg-card border-0 shadow-none">
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium leading-tight" title={nome}>
              {nome}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {familia} · {colecao}
            </p>
          </div>
          <p className="shrink-0 text-[13px] tabular-nums font-medium">
            {formatBRL(preco_venda)}
          </p>
        </div>

        <p className="text-[12px] leading-snug text-foreground">{porque}</p>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Selo estado="muted">{clientes_compram} clientes compram</Selo>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[11px]"
            onClick={copiarSku}
          >
            <Copy className="h-3 w-3" /> Copiar SKU
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface BlocoProps {
  titulo: string;
  sugestoes: CardSugestaoProps[];
}

function BlocoSugestoes({ titulo, sugestoes }: BlocoProps) {
  if (sugestoes.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <TituloSecao>{titulo}</TituloSecao>
        <Rotulo>{sugestoes.length} sugestão{sugestoes.length === 1 ? "" : "es"}</Rotulo>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sugestoes.map((s, idx) => (
          <CardSugestao key={`${s.sku}-${idx}`} {...s} />
        ))}
      </div>
    </div>
  );
}

export function ClienteAbaSugestao({ parceiroId }: { parceiroId: string }) {
  const sugestoes = useSugestaoVenda(parceiroId);

  if (sugestoes.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-[11px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        carregando sugestões
      </div>
    );
  }

  if (sugestoes.isError) {
    return (
      <p className="py-8 text-[11px] text-destructive">
        {(sugestoes.error as any)?.message ?? "Falha ao carregar as sugestões de venda."}
      </p>
    );
  }

  const lista = sugestoes.data ?? [];
  const completar = lista.filter((s) => s.motivo === "completar_colecao");
  const familias = lista.filter((s) => s.motivo === "familia_sub_comprada");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <TituloSecao>Sugestão de venda</TituloSecao>
        <Rotulo>
          {lista.length} sugestão{lista.length === 1 ? "" : "es"} para este cliente
        </Rotulo>
      </div>

      {lista.length === 0 && (
        <p className="py-8 text-[13px] text-muted-foreground">
          Nada a sugerir para este cliente agora.
        </p>
      )}

      <BlocoSugestoes titulo="Completar a mesa" sugestoes={completar} />
      <BlocoSugestoes titulo="Famílias que ele compra pouco" sugestoes={familias} />
    </div>
  );
}
