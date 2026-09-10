import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { chamarPortal } from "@/lib/portal/api";

interface Props {
  sessao: string;
  cartilha: any;
  onAceito: () => void;
}

/** Aviso de aceite da cartilha vigente. Só aparece quando aceita_em é nulo. */
export function PortalCartilha({ sessao, cartilha, onAceito }: Props) {
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const versaoId = cartilha?.versao_id ?? cartilha?.id ?? null;

  async function aceitar() {
    setErro(null);
    if (!nome.trim()) {
      setErro("Informe seu nome completo.");
      return;
    }
    if (!documento.trim()) {
      setErro("Informe seu CPF ou CNPJ.");
      return;
    }
    if (!versaoId) {
      setErro("A versão da cartilha não veio do servidor. Fale com a Fetély.");
      return;
    }
    setEnviando(true);
    try {
      await chamarPortal("aceitar_cartilha", {
        sessao,
        versao_id: versaoId,
        nome: nome.trim(),
        documento: documento.trim(),
      });
      toast.success("Cartilha aceita. Obrigado!");
      onAceito();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErro(msg);
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card className="border-warning/60 bg-warning/10">
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Aceite da cartilha vigente</p>
          <p className="text-xs text-muted-foreground">
            {cartilha?.titulo ? `${cartilha.titulo} — ` : ""}
            Para seguir com as comissões, confirme que leu e aceita a cartilha do
            representante{cartilha?.versao ? ` (versão ${cartilha.versao})` : ""}.
          </p>
          {cartilha?.url && (
            <a
              href={cartilha.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs underline underline-offset-2"
            >
              Ler a cartilha
            </a>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="cartilha-nome" className="text-xs">
              Nome completo
            </Label>
            <Input
              id="cartilha-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cartilha-doc" className="text-xs">
              CPF ou CNPJ
            </Label>
            <Input
              id="cartilha-doc"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="000.000.000-00"
            />
          </div>
        </div>

        {erro && <p className="text-xs text-destructive">{erro}</p>}

        <Button size="sm" onClick={aceitar} disabled={enviando}>
          {enviando ? "Registrando…" : "Aceitar cartilha"}
        </Button>
      </CardContent>
    </Card>
  );
}
