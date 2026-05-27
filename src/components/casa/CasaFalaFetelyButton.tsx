import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function CasaFalaFetelyButton() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="h-9 w-9 text-gold hover:text-gold-light hover:bg-gold/10"
        aria-label="Fala Fetély"
      >
        <MessageCircle className="h-4 w-4" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl text-gold">Fala Fetély</SheetTitle>
            <SheetDescription>
              A inteligência ambiente da Casa Fetély. Em breve, aqui dentro: conversa contextual,
              busca semântica em todo o sistema, e atalhos de tarefas.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-2 mt-6">
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                setOpen(false);
                navigate("/fala-fetely");
              }}
            >
              Ir para a Fala Fetély (versão atual)
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                setOpen(false);
                navigate("/fala-fetely/conhecimento");
              }}
            >
              Base de conhecimento
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-auto pt-6">
            Painel completo virá em fase própria. Por ora, esses são os atalhos.
          </p>
        </SheetContent>
      </Sheet>
    </>
  );
}
