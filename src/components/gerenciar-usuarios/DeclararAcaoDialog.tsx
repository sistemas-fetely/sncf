import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useDeclararAcao, sugerirSlug, type ConsoleAcessoRow } from "@/hooks/useConsoleAcesso";

/**
 * DECLARAR AÇÃO — cria o slug no catálogo. Não concede a ninguém: apenas abre
 * o lugar onde a concessão por grupo pode ser gravada depois.
 */
export default function DeclararAcaoDialog({
  linha,
  onOpenChange,
}: {
  linha: ConsoleAcessoRow | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  const declarar = useDeclararAcao();
  const [slug, setSlug] = useState("");
  const [nome, setNome] = useState("");

  useEffect(() => {
    if (linha) {
      setSlug(sugerirSlug(linha.rotulo));
      setNome(linha.rotulo);
    }
  }, [linha]);

  const acaoId = linha?.acao_superficie_id ?? null;
  const slugValido = /^acao\.[a-z0-9_]+$/.test(slug.trim());

  return (
    <Dialog open={!!linha} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Declarar ação no catálogo</DialogTitle>
          <DialogDescription>
            Declarar só cria o slug da ação. Ninguém ganha acesso agora — depois de
            declarar, você concede por grupo nos checkboxes da linha.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{linha?.rotulo}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Dispara: {linha?.dispara ?? "—"}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">{linha?.rota}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug-acao">Slug da permissão</Label>
            <Input
              id="slug-acao"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="font-mono text-sm"
            />
            {!slugValido && (
              <p className="text-[11px] text-destructive">
                Use o formato <code>acao.minusculas_com_underline</code>.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nome-acao">Nome de exibição</Label>
            <Input id="nome-acao" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!acaoId || !slugValido || !nome.trim() || declarar.isPending}
            onClick={() => {
              if (!acaoId) return;
              declarar.mutate(
                { acaoId, slug: slug.trim(), nome: nome.trim() },
                { onSuccess: () => onOpenChange(false) },
              );
            }}
          >
            {declarar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Declarar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
