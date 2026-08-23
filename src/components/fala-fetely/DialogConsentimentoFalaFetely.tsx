import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  open: boolean;
  onAceite: () => void;
}

const TEXTO_VERSAO = "v1.0 - 2026-04-18";

const ITENS = [
  "Eu entendo que minhas conversas com o Fala Fetely ficam guardadas no sistema",
  "Eu entendo que a IA pode extrair memórias (fatos, preferências) dessas conversas pra me atender melhor",
  "Eu sei que posso ver tudo que o Fala Fetely sabe de mim na tela 'Meus Dados' e posso apagar quando quiser",
  "Eu aceito esses termos de uso e privacidade",
];

export function DialogConsentimentoFalaFetely({ open, onAceite }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [marcados, setMarcados] = useState<boolean[]>([false, false, false, false]);
  const [salvando, setSalvando] = useState(false);

  const todasMarcadas = marcados.every(Boolean);

  function toggle(i: number) {
    setMarcados((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  async function aceitar() {
    if (!user || !todasMarcadas) return;
    setSalvando(true);
    try {
      const ua = navigator.userAgent;
      await Promise.all([
        supabase.from("consentimentos_lgpd").insert({
          user_id: user.id,
          tipo: "fala_fetely_conversas",
          aceito: true,
          texto_versao: TEXTO_VERSAO,
          user_agent: ua,
        }),
        supabase.from("consentimentos_lgpd").insert({
          user_id: user.id,
          tipo: "fala_fetely_memorias",
          aceito: true,
          texto_versao: TEXTO_VERSAO,
          user_agent: ua,
        }),
      ]);
      toast({ title: "Bora! 🌷", description: "Consentimento registrado com carinho." });
      onAceite();
    } catch (e) {
      toast({
        title: "Não consegui registrar",
        description: e instanceof Error ? e.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => { /* não-fechável */ }}>
      <DialogContent
        className="max-w-lg [&>button.absolute]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Antes da gente conversar...
          </DialogTitle>
          <DialogDescription className="pt-2 leading-relaxed">
            O Fala Fetely é seu assistente na Fetely. Pra funcionar bem, ele precisa guardar
            algumas coisas. Queremos que você saiba exatamente o que vai acontecer com suas
            conversas — é seu direito. 🌷
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {ITENS.map((texto, i) => (
            <div key={i} className="flex items-start gap-3">
              <Checkbox
                id={`consent-${i}`}
                checked={marcados[i]}
                onCheckedChange={() => toggle(i)}
                className="mt-0.5"
              />
              <Label
                htmlFor={`consent-${i}`}
                className="text-sm leading-relaxed cursor-pointer font-normal"
              >
                {texto}
              </Label>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => navigate("/")} disabled={salvando}>
            Agora não
          </Button>
          <Button onClick={aceitar} disabled={!todasMarcadas || salvando}>
            {salvando ? "Salvando..." : "Aceito e bora conversar ✨"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
